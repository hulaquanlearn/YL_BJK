const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { buildMatchPlan, modelFileAvailable, previewMatches, applyMatches } = require('../src/category-model-matching');
const { pool } = require('../src/db');
const { enforceReadOnly } = require('../src/workshop-scope');

const model = (id,name,keywords='',file='motor') => ({id,name,keywords,modelUrl:`/models/categories/${file}.glb`});
const part = (id,name,more={}) => ({id,name,code:`TEST${id}`,spec:'',categoryModelId:null,workshopCodes:'raw_grain',...more});
const admin = {id:1,role:'admin'};
const available = () => true;

test('keyword matching uses token boundaries, prefers specific phrases, and leaves ambiguous hits for review',()=>{
  const models=[model(1,'电机','motor'),model(2,'减速电机','gearmotor'),model(3,'齿轮电机','gearmotor')];
  const plans=buildMatchPlan([part(1,'减速电机 380V'),part(2,'GEARMOTOR'),part(3,'ＭＯＴＯＲ 220V'),part(4,'custommotor')],models,available);
  assert.deepEqual(plans[0].candidates.map(c=>c.id),[2]);
  assert.equal(plans[0].status,'ready');
  assert.equal(plans[1].status,'review');
  assert.deepEqual(plans[1].candidates.map(c=>c.id),[2,3]);
  assert.equal(plans[2].candidates[0].id,1);
  assert.equal(plans[3].status,'unmatched');
});

test('shape differences, missing resources, manual links and read-only ownership remain explicit',()=>{
  const models=[model(1,'电缆','钢丝绳'),model(2,'深沟球轴承','轴承'),model(3,'消声器','','missing-fixture')];
  const plans=buildMatchPlan([part(1,'钢丝绳'),part(2,'NSK 带座轴承 UCP213'),part(3,'消声器'),part(4,'未知总成'),part(5,'电缆',{categoryModelId:99}),part(6,'电缆',{editable:false})],models,url=>!url.includes('missing'));
  assert.deepEqual(plans.map(p=>p.status),['review','review','unavailable','unmatched','linked','readonly']);
  assert.match(plans[1].reason,/总成形状/);
  assert.deepEqual(plans[4].candidates,[]);
  assert.equal(modelFileAvailable('/models/categories/motor.glb'),true);
  for(const url of ['/models/categories/missing-fixture.glb','/models/categories/../motor.glb','https://example.com/model.glb','/models/categories/motor.jpg'])assert.equal(modelFileAvailable(url),false);
});

function database(parts=[part(1,'电机'),part(2,'电机')],models=[model(1,'电机')]) {
  const state={parts:structuredClone(parts),models:structuredClone(models),updates:0,commits:0,rollbacks:0,queries:[]};
  let snapshot;
  const db={
    async query(sql,params=[]){
      state.queries.push(sql);
      if(sql.includes('FROM part_category_models'))return [structuredClone(state.models)];
      const rows=state.parts.filter(p=>params.includes(p.id));
      if(sql.startsWith('SELECT p.id'))return [structuredClone(rows)];
      if(sql.startsWith('SELECT id FROM parts'))return [rows.map(p=>({id:p.id}))];
      if(sql.startsWith('SELECT part_id'))return [rows.flatMap(p=>p.workshopCodes.split(',').map(workshopCode=>({part_id:p.id,workshopCode})))];
      if(sql.startsWith('UPDATE parts')){
        const row=state.parts.find(p=>p.id===params[1]);
        if(row.categoryModelId)return [{affectedRows:0}];
        row.categoryModelId=params[0];state.updates++;return [{affectedRows:1}];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async getConnection(){return db},
    async beginTransaction(){snapshot=structuredClone(state.parts)},
    async commit(){state.commits++},
    async rollback(){state.parts=snapshot;state.rollbacks++},
    release(){}
  };
  return {db,state};
}
const selection = plans => plans.map(plan=>({partId:plan.partId,categoryModelId:plan.candidates[0].id,fingerprint:plan.fingerprint}));

test('preview is read-only, apply associates under locks, and replay cannot overwrite a manual association',async()=>{
  const {db,state}=database();
  const plans=await previewMatches(db,admin,[1,2],available);
  assert.equal(state.updates,0);
  assert.deepEqual(await applyMatches(db,admin,selection(plans),available),{affected:2});
  assert.equal(state.commits,1);
  assert.deepEqual(state.parts.map(p=>p.categoryModelId),[1,1]);
  assert.ok(state.queries.findIndex(s=>s.includes('part_category_models')&&s.includes('FOR UPDATE'))<state.queries.findIndex(s=>s.startsWith('SELECT id FROM parts')));
  state.parts[0].categoryModelId=99;
  await assert.rejects(applyMatches(db,admin,selection(plans),available),{status:409});
  assert.equal(state.parts[0].categoryModelId,99);
});

test('changed keywords, part text, candidate ID or availability invalidate the complete batch before any write',async()=>{
  for(const mutation of [
    state=>{state.models[0].keywords='电动机'},
    state=>{state.parts[1].name='不同物料'},
    (_state,items)=>{items[1].categoryModelId=999},
    state=>{state.models[0].modelUrl='/models/categories/missing.glb'}
  ]){
    const {db,state}=database();
    const items=selection(await previewMatches(db,admin,[1,2],available));
    mutation(state,items);
    await assert.rejects(applyMatches(db,admin,items,url=>!url.includes('missing')),{status:409});
    assert.equal(state.updates,0);
    assert.equal(state.rollbacks,1);
  }
});

test('workshop ownership is checked again while locked, including newly shared inventory',async()=>{
  const {db,state}=database();const user={id:2,role:'raw_grain'};
  const items=selection(await previewMatches(db,user,[1,2],available));
  state.parts[1].workshopCodes='raw_grain,brewing';
  assert.equal((await previewMatches(db,user,[2],available))[0].status,'readonly');
  await assert.rejects(applyMatches(db,user,items,available),{status:403});
  assert.equal(state.updates,0);
});

test('batch input rejects duplicates, malformed IDs, empty and oversized requests without querying',async()=>{
  const {db,state}=database();
  for(const ids of [[],[1,1],['no'],[0],Array.from({length:501},(_,i)=>i+1)])await assert.rejects(previewMatches(db,admin,ids,available),{status:400});
  assert.equal(state.queries.length,0);
});

test('real Express matching routes enforce viewer protection and return persisted association results',async()=>{
  const {db,state}=database();const saved={query:pool.query,getConnection:pool.getConnection};
  pool.query=db.query;pool.getConnection=db.getConnection;
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.user={id:1,role:req.get('x-test-role')||'admin'};next()});
  app.use(enforceReadOnly);app.use(require('../src/routes/parts'));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({msg:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const post=(route,data,role='admin')=>fetch(`http://127.0.0.1:${server.address().port}/part-category-model-matches/${route}`,{method:'POST',headers:{'content-type':'application/json','x-test-role':role},body:JSON.stringify(data)});
  try{
    for(const route of ['preview','apply'])assert.equal((await post(route,{},'viewer')).status,403);
    assert.equal(state.queries.length,0);
    const preview=await post('preview',{partIds:[1,2]});assert.equal(preview.status,200);
    const plans=(await preview.json()).data;
    const applied=await post('apply',{items:selection(plans)});assert.equal(applied.status,200);
    assert.equal((await applied.json()).data.affected,2);
    assert.deepEqual(state.parts.map(p=>p.categoryModelId),[1,1]);
  }finally{Object.assign(pool,saved);await new Promise(resolve=>server.close(resolve))}
});

test('motor protection and contactors cannot match motor assemblies through broad aliases',()=>{
 const models=[model(1,'减速电机','电机,GV2'),model(2,'电机保护断路器','GV2','circuit-breaker'),model(3,'电机','电机')];
 const plans=buildMatchPlan([part(1,'施耐德 电机保护断路器 GV2-ME6C'),part(2,'电机用接触器'),part(3,'减速电机 380V')],models,available);
 assert.deepEqual(plans[0].candidates.map(c=>c.id),[2]);
 assert.equal(plans[0].status,'ready');
 assert.equal(plans[1].status,'unmatched');
 assert.equal(plans[2].candidates[0].id,1);
});

test('three-pole miniature breaker candidates exclude single/two-pole and motor protection parts',()=>{
 const models=[model(1,'断路器3P','断路器','circuit-breaker-3p')];
 const plans=buildMatchPlan([part(1,'IC65N 1P 断路器'),part(2,'GV2-ME06C 断路器'),part(3,'IC65N 3P 断路器'),part(4,'IC65N 2P 断路器')],models,available);
 assert.deepEqual(plans.map(p=>p.status),['unmatched','unmatched','ready','unmatched']);
});

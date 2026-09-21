const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const utils = require('../src/utils');
const scope = require('../src/workshop-scope');

function routesFor(connection) {
  const handlers = new Map();
  const router=Object.fromEntries(['get','post','patch','delete'].map(method=>[method,(url,...chain)=>handlers.set(`${method} ${url}`,chain.at(-1))]));
  router.use=()=>{};
  const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
  const mocks={express:{Router:()=>router},crypto:require('node:crypto'),path,multer,'read-excel-file/node':()=>{},'../db':{pool:{getConnection:async()=>connection}},'../utils':{...utils,asyncHandler:fn=>fn},'../workshop-scope':scope,'../inventory-guards':{parseInventoryId:value=>Number(value)},'../warehouse-join':{warehouseJoin:()=>''},'../data-quality':{},'../movement-metadata':{},'../import-workbook':{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/operations.js'),'utf8'),{require:name=>mocks[name],module:{exports:{}},console,Buffer});
  return handlers;
}
function transaction(rows,duplicate=false){
  const writes=[];const state={committed:false,rolledBack:false,released:false};
  return {writes,state,async beginTransaction(){},async commit(){state.committed=true},async rollback(){state.rolledBack=true},release(){state.released=true},async query(sql,params){
    if(sql.startsWith('SELECT id FROM workshop_equipment'))return [duplicate?[{id:99}]:[]];
    if(sql.startsWith('SELECT'))return [rows];
    writes.push({sql,params:[...params]});return [{affectedRows:1}];
  }};
}
function request(body={},role='raw_grain'){return {user:{role},params:{id:'3',relationId:'9'},body};}
const response={json() {}};

test('renaming a model preserves its internal identity and relations; inactive is reversible',async()=>{
  const row={id:3,workshopCode:'raw_grain',equipment_name:'NE30',workshop_group:'输送',notes:'原备注',status:'active'};
  const connection=transaction([row]);
  const handler=routesFor(connection).get('patch /equipment/:id');
  await handler(request({equipmentName:'NE50',status:'inactive'}),response);
  assert.deepEqual(connection.writes[0].params,['NE50','输送','原备注','inactive',3]);
  assert.doesNotMatch(connection.writes[0].sql,/equipment_code|DELETE|equipment_parts/);
  assert.equal(connection.state.committed,true);assert.equal(connection.state.released,true);
  const restore=transaction([{...row,status:'inactive'}]);
  await routesFor(restore).get('patch /equipment/:id')(request({status:'active'}),response);
  assert.equal(restore.writes[0].params[3],'active');
});

test('cross-workshop and duplicate model edits are blocked without writes',async()=>{
  const row={id:3,workshopCode:'brewing',equipment_name:'NE30',status:'active'};
  const denied=transaction([row]);
  await assert.rejects(()=>routesFor(denied).get('patch /equipment/:id')(request({equipmentName:'错误'}),response),error=>error.status===403);
  assert.equal(denied.writes.length,0);assert.equal(denied.state.rolledBack,true);
  const duplicate=transaction([{...row,workshopCode:'raw_grain'}],true);
  await assert.rejects(()=>routesFor(duplicate).get('patch /equipment/:id')(request({equipmentName:'重名'}),response),error=>error.status===409);
  assert.equal(duplicate.writes.length,0);
});

test('quantity and notes updates bind both relation and equipment ids and reject invalid values',async()=>{
  const row={id:9,workshopCode:'raw_grain',status:'active',quantity_per_equipment:2,notes:'原备注'};
  const connection=transaction([row]);
  await routesFor(connection).get('patch /equipment/:id/parts/:relationId')(request({quantityPerEquipment:0.25,notes:'每季度更换'}),response);
  assert.deepEqual(connection.writes[0].params,[0.25,'每季度更换',9,3]);
  assert.match(connection.writes[0].sql,/WHERE id=\? AND equipment_id=\?/);
  for(const quantity of [-1,'abc']){
    const invalid=transaction([row]);
    await assert.rejects(()=>routesFor(invalid).get('patch /equipment/:id/parts/:relationId')(request({quantityPerEquipment:quantity}),response));
    assert.equal(invalid.writes.length,0);
  }
});

test('inactive models cannot have relations edited or removed',async()=>{
  for(const method of ['patch','delete']){
    const connection=transaction([{id:9,workshopCode:'raw_grain',status:'inactive'}]);
    await assert.rejects(()=>routesFor(connection).get(`${method} /equipment/:id/parts/:relationId`)(request({quantityPerEquipment:1}),response),error=>error.status===409);
    assert.equal(connection.writes.length,0);assert.equal(connection.state.rolledBack,true);assert.equal(connection.state.released,true);
  }
});

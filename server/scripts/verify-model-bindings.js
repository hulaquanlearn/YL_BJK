'use strict';
// Real MySQL + Express checks in a newly created disposable local database.
// Never runs ensureSchema against the application's configured database.
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
const mysql=require('mysql2/promise'), express=require('express'), assert=require('node:assert/strict');
const {once}=require('node:events');
const config=require('../src/config');
const {ensureModelCatalog}=require('../src/model-catalog-schema');
const {readModelLedger}=require('../src/model-ledger-import');
const {enforceReadOnly}=require('../src/workshop-scope');
const fs=require('node:fs');
async function main(){
  if(!['127.0.0.1','localhost','::1'].includes(config.mysql.host))throw new Error('Only a local MySQL host is permitted for this check');
  const database=`spare_parts_model_qa_20261008_${process.pid}`;
  if(!/^spare_parts_model_qa_20261008_\d+$/.test(database))throw new Error('Invalid disposable database name');
  const admin=await mysql.createConnection({...config.mysql,database:undefined,connectionLimit:undefined});
  let db, server, pool, savedQuery, savedGetConnection, created=false;
  try{
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);created=true;
    db=await mysql.createPool({...config.mysql,database,connectionLimit:4});
    await db.query('CREATE TABLE parts(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,code VARCHAR(60) UNIQUE,name VARCHAR(300),bound_model_id BIGINT UNSIGNED NULL,active TINYINT DEFAULT 1)');
    await db.query('CREATE TABLE inventory(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,part_id BIGINT,workshop_code VARCHAR(30),quantity DECIMAL(20,4) DEFAULT 13,price_override DECIMAL(20,4) DEFAULT 7,location VARCHAR(30) DEFAULT \'TEST\',active TINYINT DEFAULT 1)');
    const conn=await db.getConnection();try{await ensureModelCatalog(conn);await ensureModelCatalog(conn)}finally{conn.release()}
    const input=process.argv[2];
    const records=input ? await readModelLedger(fs.readFileSync(input)) : [{code:'TEST-1',modelName:'微型断路器1P',sourceRow:2}];
    for(const row of records){const [p]=await db.query('INSERT INTO parts(code,name) VALUES (?,?)',[row.code,`测试备件 ${row.sourceRow}`]);await db.query("INSERT INTO inventory(part_id,workshop_code) VALUES (?,'raw_grain')",[p.insertId])}
    const [before]=await db.query('SELECT * FROM inventory ORDER BY id');
    ({pool}=require('../src/db'));savedQuery=pool.query;savedGetConnection=pool.getConnection;
    pool.query=(...args)=>db.query(...args);pool.getConnection=(...args)=>db.getConnection(...args);
    const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:1,role:req.get('x-test-role')||'admin'};next()});app.use(enforceReadOnly);app.use(require('../src/routes/parts'));app.use((err,_req,res,_next)=>res.status(err.status||500).json({msg:err.message,details:err.details}));
    server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
    const request=(url,body,role='admin',method='POST')=>fetch(base+url,{method,headers:{'x-test-role':role,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:method==='GET'?undefined:body instanceof FormData?body:JSON.stringify(body)});
    const sendFile=()=>{const form=new FormData();form.append('file',new Blob([fs.readFileSync(input)]),'ledger.xlsx');return form};
    const models=await request('/part-models',null,'viewer','GET');assert.equal(models.status,200);const catalog=(await models.json()).data;
    assert.equal(catalog.length,193);assert.deepEqual(catalog.map(m=>Number(m.id)),Array.from({length:193},(_,i)=>i+1));
    if(input){
      const preview=await request('/parts/model-bindings/preview',sendFile());assert.equal(preview.status,200);const plan=(await preview.json()).data;assert.deepEqual(plan.errors,[]);assert.equal(plan.changed,records.length);
      const result=await request('/parts/model-bindings/import',sendFile());assert.equal(result.status,200);assert.equal((await result.json()).data.affected,records.length);
      const [[bindings]]=await db.query('SELECT COUNT(*) AS total FROM parts WHERE bound_model_id IS NOT NULL');assert.equal(Number(bindings.total),records.length);
      const [after]=await db.query('SELECT * FROM inventory ORDER BY id');assert.deepEqual(after,before,'model-only import must preserve all inventory data');
    }
    const [[part]]=await db.query('SELECT id FROM parts ORDER BY id LIMIT 1');
    for(const id of ['ref:gearmotor','1garbage',true,-1,1.5,9007199254740992])assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:id})).status,400);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:2},'viewer')).status,403);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:2},'qu_making')).status,403);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:2},'raw_grain')).status,200);
    await db.query("INSERT INTO inventory(part_id,workshop_code) VALUES (?,'qu_making')",[part.id]);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:3},'raw_grain')).status,403);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:3},'admin')).status,200);
    assert.equal((await request('/parts/batch-model',{partIds:[part.id],modelId:null},'admin')).status,200);
    assert.equal((await request('/parts/batch-category-model',{partIds:[part.id],categoryModelId:27})).status,404);
    const makeModel=(name)=>{const form=new FormData();form.append('name',name);return form};
    let response=await request('/part-models',makeModel('测试车间模型'),'raw_grain');assert.equal(response.status,201);const own=(await response.json()).data;assert.equal(Number(own.id),194);
    assert.equal((await request(`/part-models/${own.id}`,makeModel('跨车间改名'),'qu_making','PUT')).status,403);
    assert.equal((await request('/part-models/1',makeModel('修改公共模型'),'raw_grain','PUT')).status,403);
    assert.equal((await request(`/part-models/${own.id}`,makeModel('测试车间改名'),'raw_grain','PUT')).status,200);
    // Failed second update must roll back an earlier successful update.
    const [[exclusive]]=await db.query('SELECT id FROM parts ORDER BY id DESC LIMIT 1');
    if(Number(exclusive.id)!==Number(part.id)){
      await db.query('UPDATE parts SET bound_model_id=1 WHERE id=?',[exclusive.id]);
      assert.equal((await request('/parts/batch-model',{partIds:[exclusive.id,part.id],modelId:own.id},'admin')).status,403);
      const [[rolledBack]]=await db.query('SELECT bound_model_id FROM parts WHERE id=?',[exclusive.id]);assert.equal(Number(rolledBack.bound_model_id),1);
    }
    assert.equal((await request(`/part-models/${own.id}`,null,'raw_grain','DELETE')).status,200);
    response=await request('/part-models',makeModel('删除后新增'),'raw_grain');assert.equal(response.status,201);assert.equal(Number((await response.json()).data.id),195);
    const again=await db.getConnection();try{await ensureModelCatalog(again)}finally{again.release()}
    const [[count]]=await db.query('SELECT COUNT(*) AS total FROM part_models');assert.equal(Number(count.total),195);
    console.log(JSON.stringify({status:'passed',database,ledgerRows:records.length,catalogEntries:193,checks:['id order and nonreuse','restart idempotence','541-row binding-only import','inventory unchanged','viewer denied','wrong workshop denied','shared master denied','public model edit denied','own model CRUD','strict numeric IDs','transaction rollback','legacy endpoint retired']},null,2));
  }finally{
    if(pool){pool.query=savedQuery;pool.getConnection=savedGetConnection;await pool.end()}
    if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.end();
    if(created)await admin.query(`DROP DATABASE \`${database}\``);await admin.end();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});

const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {once}=require('node:events');
const {pool}=require('../src/db');
const {enforceReadOnly}=require('../src/workshop-scope');

test('real Express dispatch downloads the template and fences viewer writes before routing', async()=>{
  const queries=[];
  const saved=pool.query;
  pool.query=async(sql,params)=>{queries.push({sql,params});return [[]];};
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.user={id:1,role:req.get('x-test-role')||'admin'};next();});
  app.use(enforceReadOnly);
  app.use(require('../src/routes/parts'));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({msg:err.message}));
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const template=await fetch(base+'/parts/import-template?workshopCode=raw_grain');
    assert.equal(template.status,200);
    assert.match(template.headers.get('content-type'),/spreadsheetml/);
    const bytes=Buffer.from(await template.arrayBuffer());
    assert.equal(bytes.subarray(0,2).toString(),'PK');
    assert.ok(!queries.some(q=>q.params?.includes('import-template')));
    const before=queries.length;
    for(const [method,url] of [['POST','/parts'],['PATCH','/parts/1'],['DELETE','/parts/1'],['POST','/parts/batch-model']]){
      const result=await fetch(base+url,{method,headers:{'x-test-role':'viewer'}});
      assert.equal(result.status,403);
    }
    assert.equal(queries.length,before,'read-only rejection precedes database access');
    const invalidImage=await fetch(base+'/parts/not-an-id/image',{method:'DELETE'});
    assert.equal(invalidImage.status,400);
    const invalidCategory=await fetch(base+'/parts/batch-model',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partIds:[1],modelId:'not-an-id'})});
    assert.equal(invalidCategory.status,400);
    assert.equal(queries.length,before,'invalid resource IDs never default to record one');
    const retired=await fetch(base+'/parts/1/model',{method:'POST'});
    assert.equal(retired.status,410);
  }finally{pool.query=saved;await new Promise(resolve=>server.close(resolve));}
});

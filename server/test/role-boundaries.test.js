const test=require('node:test');
const assert=require('node:assert/strict');
const {canWriteWorkshop,enforceReadOnly}=require('../src/workshop-scope');
const {assertAssetScope,withPartAssetWrite}=require('../src/part-asset-permissions');

test('staff with a workshop association stay read-only at the API boundary',()=>{
  const user={role:'viewer',workshopCode:'raw_grain'};
  assert.equal(canWriteWorkshop(user,'raw_grain'),false);
  for(const [method,path] of [['POST','/parts'],['PATCH','/parts/1'],['DELETE','/knowledge/1'],['POST','/parts/import'],['POST','/inventory-orders/1/approve'],['PUT','/warehouse-layout/shelves/1']]){
    let error;enforceReadOnly({user,method,path},{},e=>error=e);assert.equal(error?.status,403,path);
  }
  for(const [method,path] of [['GET','/parts'],['GET','/knowledge/1/preview'],['POST','/ai/chat']]){
    let error;enforceReadOnly({user,method,path},{},e=>error=e);assert.equal(error,undefined);
  }
});
test('shared resources require a system administrator; private ones retain workshop editing',()=>{
  assert.throws(()=>assertAssetScope({role:'raw_grain'},['raw_grain','qu_making']),e=>e.status===403);
  assert.throws(()=>assertAssetScope({role:'viewer'},['raw_grain']),e=>e.status===403);
  assert.doesNotThrow(()=>assertAssetScope({role:'raw_grain'},['raw_grain']));
  assert.doesNotThrow(()=>assertAssetScope({role:'admin'},['raw_grain','qu_making']));
});
test('a mixed resource batch is rolled back before any mutation',async()=>{
  let actionCalled=false,rolledBack=false,committed=false;
  const connection={beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{rolledBack=true},release(){},query:async sql=>sql.includes('FROM parts')?[[{id:1},{id:2}]]:[[{part_id:1,workshopCode:'raw_grain'},{part_id:2,workshopCode:'qu_making'}]]};
  await assert.rejects(withPartAssetWrite({getConnection:async()=>connection},{role:'raw_grain'},[1,2],()=>{actionCalled=true}),e=>e.status===403);
  assert.equal(actionCalled,false);assert.equal(rolledBack,true);assert.equal(committed,false);
});

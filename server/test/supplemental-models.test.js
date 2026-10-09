const test=require('node:test');
const assert=require('node:assert/strict');
const {ensureSupplementalModels}=require('../src/model-catalog-schema');
test('supplemental models apply once and bind only requested, active, unbound codes',async()=>{
  const versions=new Set(), calls=[];
  const db={query:async(sql,args)=>{
    calls.push([sql,args]);
    if(sql.includes('model_catalog_versions')){const exists=versions.has(args[0]);versions.add(args[0]);return [{affectedRows:exists?0:1}];}
    return [{}];
  }};
  const batches=[{version:'test-five',models:[{name:'油封示意',materialCode:'505026166',description:'比例示意',modelUrl:'/models/test.glb',quality:'外观示意'}]}];
  await ensureSupplementalModels(db,batches);
  assert.equal(calls.length,3);
  assert.match(calls[1][0],/INSERT IGNORE INTO part_models\(name/);
  assert.match(calls[2][0],/p.bound_model_id IS NULL/);
  assert.match(calls[2][0],/m.active=1/);
  assert.match(calls[2][0],/COALESCE\(p.active,1\)=1/);
  assert.deepEqual(calls[2][1],['油封示意','505026166']);
  await ensureSupplementalModels(db,batches);
  assert.equal(calls.length,4,'restart does not recreate models or rebind records');
});

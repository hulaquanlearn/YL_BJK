const test=require('node:test');
const assert=require('node:assert/strict');
const {ensureSupplementalModels,ensureModelAssets}=require('../src/model-catalog-schema');
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

test('named assets fill original placeholders once without changing model IDs or part bindings', async()=>{
  const catalog=require('../data/ledger-model-catalog.json'),calls=[],versions=new Set(['pending-ledger-20261009-v1']);
  const db={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('model_catalog_versions')){const exists=versions.has(args[0]);versions.add(args[0]);return [{affectedRows:exists?0:1}];}return [{}];}};
  const batches=catalog.assetUpdates;
  assert.equal(batches[0].models.length,11);
  await ensureModelAssets(db,batches);
  assert.equal(calls.length,12);
  for(const [sql,args] of calls.slice(1)){
    assert.match(sql,/BINARY name=BINARY \? AND built_in=1 AND active=1/);
    assert.match(sql,/NULLIF\(model_url,''\) IS NULL/);
    assert.doesNotMatch(sql,/bound_model_id|SET id|SET name/);
    assert.ok(catalog.models.some(m=>m.name===args[3]&&m.modelUrl===args[0]));
  }
  await ensureModelAssets(db,batches);
  assert.equal(calls.length,13,'independent version applies even when earlier batch was installed, but not twice');
});

test('per-material illustrative library entries no longer override model-name bindings', async()=>{
  const calls=[],db={query:async(sql,args)=>{calls.push([sql,args]);return [{affectedRows:1}];}};
  await ensureSupplementalModels(db,[{version:'library-only',bindByCode:false,models:[{name:'optional',materialCode:'505018953',modelUrl:'/models/example.glb',quality:'外观示意'}]}]);
  assert.equal(calls.length,2);
  assert.ok(calls.every(([sql])=>!sql.includes('UPDATE parts')));
  assert.equal(require('../data/ledger-model-catalog.json').supplements.find(b=>b.version==='pending-ledger-20261009-v1').bindByCode,false);
});

test('pending migration guards ready, inactive and custom bindings and uses exact code', async()=>{
  const calls=[];
  const db={query:async(sql,args)=>{calls.push([sql,args]);return [{affectedRows:1}];}};
  await ensureSupplementalModels(db,[{version:'pending-test',models:[{name:'specific',materialCode:'505024096',previousModelName:'轴承座',previousModelNames:['轴承座','轴承座（含轴承）'],modelUrl:'/models/specific.glb',quality:'外观示意'}]}]);
  const [sql,args]=calls[2];
  assert.match(sql,/old.built_in=1 AND old.active=1/);
  assert.match(sql,/NULLIF\(old.model_url,''\) IS NULL/);
  assert.match(sql,/p.code=\?/);
  assert.match(sql,/old.name IN \(\?,\?\)/);
  assert.deepEqual(args,['specific','505024096','轴承座','轴承座（含轴承）']);
});

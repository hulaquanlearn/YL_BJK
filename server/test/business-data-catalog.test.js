const test=require('node:test'),assert=require('node:assert/strict');
const {businessCatalog}=require('../src/business-data-catalog');
test('business catalog links active fire and authorization storage; retired tables stay inaccessible with exact counts without reading sensitive rows',async()=>{
 const queries=[],metadata=['agv_repair_reports','agv_messages','fire_photos','fire_records','fire_imports','agv_floors','app_users','part_model_reviews','fire_qa_20261026_records','untrusted`table'].map(name=>({name,bytes:4096,rowCount:999}));
 const catalog=await businessCatalog({query:async sql=>{queries.push(sql);return [[{recordCount:sql.includes('agv_repair_reports')?3:2}]];}},metadata);
 assert.equal(catalog.some(c=>c.id.startsWith('agv')),false);assert.equal(catalog.find(c=>c.id==='fire_photos').count,2);assert.equal(catalog.find(c=>c.id==='fire_imports').items[0].protected,true);
 assert.ok(catalog.find(c=>c.id==='accounts').items.every(i=>i.protected));assert.ok(!queries.some(q=>/agv_/.test(q)));
 assert.ok(queries.every(q=>/^SELECT COUNT\(\*\) AS recordCount FROM `[a-z_]+`$/.test(q)));assert.ok(!queries.some(q=>/fire_qa|untrusted|secret|token|SELECT \*/.test(q)));assert.equal(catalog.find(c=>c.id==='inventory_records').count,0);
});

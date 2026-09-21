const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {classifyPart,planAssociations,planDigest}=require('../src/reference-model-association');
const manifest={models:[{key:'deep-groove-bearing',name:'深沟球轴承',model:'deep-groove-bearing.glb',image:'deep-groove-bearing.png'}]};
test('specific reference categories do not misclassify accessories or unrelated shapes',()=>{
  for(const [name,key] of [['深沟球轴承6204','deep-groove-bearing'],['调心滚子轴承22315','spherical-roller-bearing'],['接近开关M18','proximity-sensor'],['断路器IC65N,3P','circuit-breaker-3p'],['气动电磁阀4V210-08','pneumatic-solenoid-valve'],['法兰闸阀Z45X','flanged-gate-valve'],['蜗轮减速机','gearmotor']])assert.equal(classifyPart({name}),key,name);
  for(const name of ['带座深沟球轴承','FAG轴承座','断路器1P','电机保护断路器GV2','塑壳断路器3P','光电开关','方形接近开关','电机风扇','电磁阀线圈组件','普通电机','法兰球阀'])assert.equal(classifyPart({name}),null,name);
});
test('reference binding preserves dedicated assets and inherits category images without copying them to parts',()=>{
  const parts=[{id:1,name:'深沟球轴承',category_model_id:10},{id:2,name:'深沟球轴承',category_model_id:11,image_url:'/own.png'},{id:3,name:'深沟球轴承',model_url:'/own.glb'},{id:4,name:'轴承座'},{id:5,name:'深沟球轴承',category_model_id:12}];
  const cats=[{id:10,built_in:1,active:1,model_url:'/models/categories/bearing.glb'},{id:11,built_in:1,active:1,model_url:'/uploads/custom.glb',image_url:'/custom.png'},{id:12,built_in:1,active:1,model_url:'/models/reference-20260904/deep-groove-bearing.glb'}];
  const rows=planAssociations(parts,cats,manifest);
  assert.equal(rows[0].bindModel,true);assert.equal(rows[0].inheritCategoryImage,true);assert.equal(rows[0].categoryImageUrl,'/models/reference-20260904/deep-groove-bearing.png');
  assert.equal(rows[1].bindModel,false);assert.equal(rows[1].inheritCategoryImage,false);
  assert.equal(rows[2].bindModel,true);assert.equal(rows[2].inheritCategoryImage,true);assert.match(rows[2].reason,/保留已有专用模型/);
  assert.equal(rows[3].inheritCategoryImage,false);assert.equal(rows[3].key,null);
  assert.equal(rows[4].bindModel,false);assert.equal(rows[4].inheritCategoryImage,true);
  assert.notEqual(planDigest(rows),planDigest(rows.slice(1)));
});
test('existing category names cannot silently replace user changes',()=>{
  assert.throws(()=>planAssociations([{name:'深沟球轴承'}],[{name:'深沟球轴承 · 参考图20260904',model_url:'/user.glb',built_in:0,active:1}],manifest),/占用/);
});
test('reference association identifies renamed models by stable asset path',()=>{
  const rows=planAssociations([{id:1,name:'深沟球轴承'}],[{id:8,name:'管理员自定义轴承名',model_url:'/models/reference-20260904/deep-groove-bearing.glb',built_in:1,active:1}],manifest);
  assert.equal(rows[0].categoryName,'管理员自定义轴承名');assert.equal(rows[0].bindModel,true);
});
test('model asset migration is database-agnostic and only removes proven legacy image copies',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../sql/migration_model_assets_20260905.sql'),'utf8');
  assert.match(sql,/V1\.4\.0/);assert.doesNotMatch(sql,/\bUSE\s+spare_parts\b/i);
  assert.match(sql,/@category_front_column_exists=0/);
  assert.equal((sql.match(/SET front_rotation_y=CASE/g)||[]).length,1,'front baseline is only written in the first-add branch');
  assert.match(sql,/p\.image_url=cm\.image_url/);
  assert.match(sql,/cm\.model_url=REPLACE\(p\.image_url,'\.png','\.glb'\)/);
  assert.doesNotMatch(sql,/p\.image_url\s+(?:LIKE|REGEXP)\s+'[^']*uploads\/part-images/i,'uploaded part images must never be selected for cleanup');
});

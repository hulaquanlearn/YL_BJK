const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
// Retained independently of the retired reference-model association tool.
test('model asset migration is database-agnostic and only removes proven legacy image copies',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../sql/migration_model_assets_20260905.sql'),'utf8');
  assert.match(sql,/V1\.4\.0/);assert.doesNotMatch(sql,/\bUSE\s+spare_parts\b/i);
  assert.match(sql,/@category_front_column_exists=0/);
  assert.equal((sql.match(/SET front_rotation_y=CASE/g)||[]).length,1,'front baseline is only written in the first-add branch');
  assert.match(sql,/p\.image_url=cm\.image_url/);
  assert.match(sql,/cm\.model_url=REPLACE\(p\.image_url,'\.png','\.glb'\)/);
  assert.doesNotMatch(sql,/p\.image_url\s+(?:LIKE|REGEXP)\s+'[^']*uploads\/part-images/i,'uploaded part images must never be selected for cleanup');
});

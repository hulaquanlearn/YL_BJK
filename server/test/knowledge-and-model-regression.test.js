const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
const knowledgeRoute = read('../src/routes/knowledge.js');
const partsRoute = read('../src/routes/parts.js');
const db = read('../src/db.js');
const operationsRoute = read('../src/routes/operations.js');
const plcRoute = read('../src/routes/plc.js');
const cleanupMigration = read('../sql/migration_remove_procurement_suppliers_20260829.sql');
const importWorkbook = read('../src/import-workbook.js');
const auth = read('../src/auth.js');
const authRoute = read('../src/routes/auth.js');
const shelfSpacingMigration = read('../sql/migration_raw_grain_shelf_spacing_20260831.sql');
const migrationAll = read('../sql/migration_all.sql');

test('knowledge list qualifies joined-table ordering columns', () => {
  assert.match(knowledgeRoute, /ORDER BY k\.created_at DESC, k\.id DESC/);
  assert.doesNotMatch(knowledgeRoute, /ENTRY_LIST_SELECT[^]*ORDER BY created_at DESC/);
});

test('startup can create knowledge tables before compatibility alters run', () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS fermentation_knowledge_entries/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS knowledge_process_stages/);
  assert.match(db, /uk_knowledge_process_stage_workshop_name/);
});

test('ordinary parts responses expose custom models to the 3D warehouse', () => {
  assert.match(partsRoute, /p\.model_url AS modelUrl/);
  assert.match(partsRoute, /COALESCE\(p\.model_scale,1\) AS modelScale/);
  assert.match(partsRoute, /router\.get\('\/part-model-library'/);
});

test('category models are persistent resources with admin CRUD and scoped batch assignment', () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS part_category_models/);
  assert.match(db, /category_model_id/);
  assert.match(partsRoute, /cm\.model_url AS categoryModelUrl/);
  assert.match(partsRoute, /router\.get\('\/part-category-models'/);
  assert.match(partsRoute, /router\.post\('\/part-category-models', requireRole\('admin'\)/);
  assert.match(partsRoute, /router\.put\('\/part-category-models\/:id', requireRole\('admin'\)/);
  assert.match(partsRoute, /router\.delete\('\/part-category-models\/:id', requireRole\('admin'\)/);
  assert.match(partsRoute, /router\.post\('\/parts\/batch-model', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /router\.post\('\/parts\/batch-category-model', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /for \(const partId of partIds\) await assertPartAssetWrite/);
});

test('knowledge upload accepts allowed files and write scope is checked before upload', () => {
  assert.match(knowledgeRoute, /callback\(allowed \? null[^\n]+allowed\)/);
  assert.match(knowledgeRoute, /router\.post\('\/knowledge', requireAnyWorkshopEditor, uploadLimiter, receiveUpload/);
  assert.match(knowledgeRoute, /k\.created_at AS createdAt, k\.updated_at AS updatedAt/);
});

test('inventory dashboards and statistics accept workshop scope', () => {
  assert.match(partsRoute, /router\.get\('\/stats'/);
  assert.match(partsRoute, /const workshopCode = req\.query\.workshopCode/);
  assert.match(partsRoute, /router\.get\('\/dashboard'/);
  assert.match(partsRoute, /router\.post\('\/parts\/import', requireAnyWorkshopEditor/);
});

test('retired procurement routes contain only a compatibility tombstone and cleanup drops their tables', () => {
  assert.match(operationsRoute, /采购与供应商功能已停用/);
  assert.doesNotMatch(operationsRoute, /INSERT INTO replenishment_orders|FROM suppliers/);
  assert.doesNotMatch(partsRoute, /AS inTransit/);
  assert.doesNotMatch(operationsRoute, /AS inTransit/);
  assert.match(cleanupMigration, /DROP TABLE IF EXISTS replenishment_order_items/);
  assert.match(cleanupMigration, /DROP TABLE IF EXISTS suppliers/);
});

test('PLC project imports are restricted to the system administrator', () => {
  assert.match(plcRoute, /router\.post\('\/plc\/projects', requireRole\('admin'\)/);
});

test('bulk imports use downloadable workshop templates and all-or-nothing validation', () => {
  assert.match(partsRoute, /\/parts\/import-template/);
  assert.match(partsRoute, /\/parts\/import-preview/);
  assert.match(partsRoute, /未写入任何数据/);
  assert.match(operationsRoute, /\/equipment\/import-template/);
  assert.match(operationsRoute, /\/equipment\/import-preview/);
  assert.match(importWorkbook, /qu_making[^]*usesWarehouseArea: false/);
  assert.match(importWorkbook, /row:|修改建议|整批校验/);
});

test('knowledge attachments support authenticated inline preview', () => {
  assert.match(knowledgeRoute, /\/knowledge\/:id\/preview/);
  assert.match(knowledgeRoute, /Content-Disposition', `inline/);
  assert.match(knowledgeRoute, /X-Content-Type-Options/);
});

test('login permits concurrent sessions while logout removes only the current session', () => {
  assert.match(auth, /INSERT INTO app_sessions/);
  assert.doesNotMatch(auth, /DELETE FROM app_sessions WHERE user_id = \?[^]*INSERT INTO app_sessions/);
  assert.match(authRoute, /DELETE FROM app_sessions WHERE id = \?/);
});

test('raw-grain shelf repair restores the mirrored physical plan without overwriting manual positions', () => {
  assert.match(shelfSpacingMigration, /-2\.30,2\.30/);
  assert.match(shelfSpacingMigration, /THEN -6\.40/);
  assert.match(shelfSpacingMigration, /THEN 4\.80/);
  assert.match(shelfSpacingMigration, /THEN 4\.2/);
  assert.match(shelfSpacingMigration, /THEN 3\.6/);
  assert.match(shelfSpacingMigration, /THEN 3\.8/);
  assert.match(shelfSpacingMigration, /COALESCE\(position_overridden,0\)=0/);
  assert.doesNotMatch(shelfSpacingMigration, /\b(?:DELETE|DROP|TRUNCATE)\b/i);
  assert.match(migrationAll, /SOURCE sql\/migration_raw_grain_shelf_spacing_20260831\.sql/);
});

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
const orientationMigration = read('../sql/migration_warehouse_3d_orientation_v1_1_3.sql');
const migrationAll = read('../sql/migration_all.sql');
const warehouseRoute = read('../src/routes/warehouse-layout.js');
const warehouseLayout = read('../src/warehouse-layout.js');
const officePreview = read('../src/office-preview.js');
const aiRoute = read('../src/routes/ai.js');

test('knowledge list qualifies joined-table ordering columns', () => {
  assert.match(knowledgeRoute, /ORDER BY k\.created_at DESC, k\.id DESC/);
  assert.doesNotMatch(knowledgeRoute, /ENTRY_LIST_SELECT[^]*ORDER BY created_at DESC/);
});

test('startup can create knowledge tables before compatibility alters run', () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS fermentation_knowledge_entries/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS knowledge_process_stages/);
  assert.match(db, /uk_knowledge_process_stage_workshop_name/);
});

test('ordinary parts responses use category models and retire dedicated model writes', () => {
  assert.doesNotMatch(partsRoute, /p\.model_url AS modelUrl/);
  assert.match(partsRoute, /NULL AS modelUrl, 1 AS modelScale/);
  assert.match(partsRoute, /router\.get\('\/part-model-library'/);
});

test('named models replace legacy category CRUD and support scoped batch assignment', () => {
  assert.match(db, /CREATE TABLE IF NOT EXISTS part_category_models/);
  assert.match(db, /category_model_id/);
  assert.match(partsRoute, /cm\.model_url AS categoryModelUrl/);
  assert.match(partsRoute, /router\.get\('\/part-models'/);
  assert.match(partsRoute, /router\.post\('\/part-models', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /router\.put\('\/part-models\/:id', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /router\.delete\('\/part-models\/:id', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /status\(410\)/);
  assert.match(partsRoute, /router\.post\('\/parts\/batch-model', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /withPartAssetWrite\(pool, req.user, partIds/);
  assert.match(partsRoute, /async function assertValidGlb/);
  assert.match(partsRoute, /GLB文件无效/);
  assert.match(partsRoute, /模型文件超过50MB/);
  assert.doesNotMatch(partsRoute, /ext === '\.glb' \|\| ext === '\.gltf'/);
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
  assert.match(partsRoute, /router\.patch\('\/parts\/:id', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /物料被多个车间共用/);
  assert.match(partsRoute, /router\.post\('\/parts\/batch-delete', requireAnyWorkshopEditor/);
  assert.match(partsRoute, /deleteParts\(pool, req\.user/);
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
  assert.match(operationsRoute, /\/equipment\/import-error-report/);
  assert.match(importWorkbook, /“设备型号”为必填列；“物料编码”为选填列/);
  assert.match(operationsRoute, /const required = \['设备型号'\]/);
  assert.doesNotMatch(operationsRoute, /if \(!materialCode\) errors\.push/);
  assert.match(operationsRoute, /router\.delete\('\/equipment\/:id\/parts\/:relationId'/);
  assert.match(importWorkbook, /qu_making[^]*usesWarehouseArea: false/);
  assert.match(importWorkbook, /row:|修改建议|整批校验/);
});

test('knowledge attachments support authenticated inline preview', () => {
  assert.match(knowledgeRoute, /\/knowledge\/:id\/preview/);
  assert.match(knowledgeRoute, /Content-Disposition', `inline/);
  assert.match(knowledgeRoute, /X-Content-Type-Options/);
  assert.match(knowledgeRoute, /previewDocument\(fullPath, originalFilename\)/);
  assert.match(knowledgeRoute, /X-Preview-Mode/);
  assert.match(knowledgeRoute, /Content-Security-Policy/);
  assert.match(knowledgeRoute, /extractDocumentText/);
  assert.match(officePreview, /new WordExtractor\(\)\.extract/);
  assert.match(officePreview, /XLSX\.utils\.sheet_to_html/);
  assert.match(officePreview, /recordType === 4000/);
});

test('knowledge revisions authorize before attachment upload and retain optimistic concurrency guards', () => {
  assert.match(knowledgeRoute, /router\.put\('\/knowledge\/:id', authorizeKnowledgeManage, uploadLimiter, receiveUpload/);
  assert.match(knowledgeRoute, /FROM fermentation_knowledge_entries WHERE id=\? AND status='active' FOR UPDATE/);
  assert.match(knowledgeRoute, /INSERT INTO knowledge_entry_revisions/);
  assert.match(knowledgeRoute, /WHERE id=\? AND revision_no=\?/);
  assert.match(knowledgeRoute, /result\.indexStatus === 'failed' \? \(item\.contentText \|\| null\)/);
  assert.match(knowledgeRoute, /\/knowledge\/:id\/revisions\/:revisionNo\/restore/);
});

test('knowledge deletion belongs to the creator unless the user is admin', () => {
  assert.match(knowledgeRoute, /req\.user\.role !== 'admin'/);
  assert.match(knowledgeRoute, /只能删除自己创建或上传的知识/);
  assert.doesNotMatch(knowledgeRoute, /router\.delete\('\/knowledge\/:id', requireRole\('admin'\)/);
});

test('OpenClaw answers are grounded in knowledge, spare parts and equipment models', () => {
  assert.match(aiRoute, /retrieveEvidence/);
  assert.match(aiRoute, /fermentation_knowledge_entries/);
  assert.match(aiRoute, /workshop_equipment/);
  assert.match(aiRoute, /当前资料库未找到直接依据/);
  assert.match(aiRoute, /k\.content_text/);
  assert.match(aiRoute, /conversationQuery\(safeMessages\)/);
  assert.match(aiRoute, /citation: citationLabel/);
  assert.match(aiRoute, /url: evidenceLink/);
  assert.match(aiRoute, /数量必须带证据中的单位，不同单位不得直接相加/);
});

test('login permits concurrent sessions while logout removes only the current session', () => {
  assert.match(auth, /INSERT INTO app_sessions/);
  assert.doesNotMatch(auth, /DELETE FROM app_sessions WHERE user_id = \?[^]*INSERT INTO app_sessions/);
  assert.match(authRoute, /DELETE FROM app_sessions WHERE id = \?/);
});

test('raw-grain shelf repair restores the confirmed V1.0 physical plan without overwriting manual positions', () => {
  assert.match(shelfSpacingMigration, /-1\.25,-6\.35/);
  assert.match(shelfSpacingMigration, /THEN 6\.35/);
  assert.match(shelfSpacingMigration, /THEN -3\.85/);
  assert.match(shelfSpacingMigration, /THEN 4\.9/);
  assert.match(shelfSpacingMigration, /\*3\.4/);
  assert.match(shelfSpacingMigration, /COALESCE\(position_overridden,0\)=0/);
  assert.doesNotMatch(shelfSpacingMigration, /\b(?:DELETE|DROP|TRUNCATE)\b/i);
  assert.match(migrationAll, /SOURCE sql\/migration_raw_grain_shelf_spacing_20260831\.sql/);
});

test('V1.1.3 aligns the 3D room with the confirmed 2D east-up floor plan', () => {
  assert.match(orientationMigration, /east_axis = '\+z'/);
  assert.match(orientationMigration, /position_overridden = 0/);
  assert.match(orientationMigration, /WHEN 'shelf-01' THEN -1\.250 WHEN 'shelf-02' THEN -6\.350/);
  assert.match(orientationMigration, /WHEN 'shelf-15' THEN 6\.350/);
  assert.match(orientationMigration, /WHEN 'unnamed-03' THEN -3\.850/);
  assert.match(migrationAll, /SOURCE sql\/migration_warehouse_3d_orientation_v1_1_3\.sql/);
});

test('3D slot capacity is calculated independently for every shelf side and layer', () => {
  assert.match(warehouseRoute, /side1Layer1Slots/);
  assert.match(warehouseRoute, /side1Layer4Slots/);
  assert.match(warehouseRoute, /side2Layer1Slots/);
  assert.match(warehouseRoute, /side2Layer4Slots/);
  assert.match(warehouseLayout, /slotCapacity/);
});

test('room dimensions are fixed configuration and cannot be changed through the API', () => {
  assert.match(warehouseRoute, /router\.put\('\/warehouse-layout\/room'/);
  assert.match(warehouseRoute, /status\(410\)/);
  assert.match(warehouseRoute, /库房空间为系统固定配置/);
});

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
const inventory = read('../src/views/Inventory.vue')
const knowledge = read('../src/views/Knowledge.vue')
const warehouse = read('../src/views/Warehouse3D.vue')
const modelLibrary = read('../src/views/ModelLibrary.vue')
const api = read('../src/api/index.js')
const replenishment = read('../src/views/Replenishment.vue')
const statistics = read('../src/views/Statistics.vue')
const equipment = read('../src/views/Equipment.vue')
const check = read('../src/views/Check.vue')
const movements = read('../src/views/Movements.vue')
const miniHome = read('../../miniprogram/pages/home/home.wxml')
const miniHomeScript = read('../../miniprogram/pages/home/home.js')
const miniAddPart = read('../../miniprogram/pages/addPart/addPart.js')
const miniAddPartView = read('../../miniprogram/pages/addPart/addPart.wxml')
const miniAuth = read('../../miniprogram/services/auth.js')

test('inventory renders the full material name and a separate material code column', () => {
  assert.match(inventory, /label="物料名称"/)
  assert.match(inventory, /label="物料编码"/)
  assert.match(inventory, /class="material-name-cell"/)
  assert.match(inventory, /\.material-name-cell\{[^}]*white-space:normal/)
  assert.match(inventory, /overflow-wrap:anywhere/)
})

test('knowledge upload keeps the browser File and appends it with a filename', () => {
  assert.match(knowledge, /v-model:file-list="uploadFiles"/)
  assert.match(knowledge, /value instanceof Blob/)
  assert.match(knowledge, /data\.append\('file',pickedFile,pickedFile\.name/)
  assert.match(api, /config\.headers\?\.delete\?\.\('Content-Type'\)/)
})

test('warehouse links a selected spare part to the model library', () => {
  assert.match(warehouse, /配置此备件模型/)
  assert.match(warehouse, /path: '\/model-library'/)
  assert.match(warehouse, /selectedPart\.value\?\.materialCode/)
  assert.match(warehouse, /function modelUrlFor/)
  assert.match(warehouse, /part\.modelUrl \|\| part\.categoryModelUrl/)
  assert.match(modelLibrary, /query\.search\s*=\s*String\(route\.query\.search/)
})

test('inventory supports scoped part creation and xlsx import without exposing export', () => {
  assert.match(inventory, />新增备件</)
  assert.match(inventory, />导入备件</)
  assert.match(api, /export const createPart/)
  assert.match(api, /export const importParts/)
  assert.doesNotMatch(inventory, />导出/)
})

test('mini program restores scoped spare-part creation for workshop editors', () => {
  assert.match(miniHome, /wx:if="\{\{canEditParts\}\}"/)
  assert.match(miniHomeScript, /canEditParts: auth\.canEditAnyWorkshop\(\)/)
  assert.match(miniAuth, /function canEditAnyWorkshop/)
  assert.match(miniAuth, /options\.editor/)
  assert.match(miniAddPart, /requireLogin\(\{ editor: true \}\)/)
  assert.match(miniAddPart, /workshopCode: this\.data\.selectedWorkshopCode/)
  assert.match(miniAddPart, /api\.getFilters\(\{ workshopCode: this\.data\.selectedWorkshopCode \}\)/)
  assert.match(miniAddPartView, /\u6240\u5c5e\u8f66\u95f4/)
  assert.match(miniAddPartView, /\u5236\u66f2\u8f66\u95f4\u4e0d\u8bbe\u8d27\u533a/)
  assert.doesNotMatch(miniHome, /gotoAddPart" wx:if="\{\{isAdmin\}\}"/)
  assert.doesNotMatch(miniAddPart, /requireLogin\(\{ admin: true \}\)/)
})

test('stock adjustment only asks for the recipient or handler', () => {
  assert.match(inventory, /label="领用\/经办人"/)
  assert.match(inventory, /stockForm = reactive\([^)]*recipient/)
  assert.match(inventory, /batchForm = reactive\([^)]*recipient/)
  assert.doesNotMatch(inventory, /stockForm\.(department|equipmentId|maintenanceOrderId)/)
  assert.doesNotMatch(inventory, /batchForm\.(department|equipmentId|maintenanceOrderId)/)
  assert.doesNotMatch(inventory, /label="(部门|关联设备|维修工单)"/)
})

test('statistics and replenishment keep the selected workshop scope', () => {
  assert.match(statistics, /workshopCode: workshopCode\.value/)
  assert.match(statistics, /goScoped\('\/replenishment'\)/)
  assert.match(replenishment, /workshopCode: String\(route\.query\.workshopCode/)
  assert.match(replenishment, /建议量 = 最高储备 − 当前库存/)
  assert.doesNotMatch(replenishment, /导出 CSV|exportCsv|当前 \/ 在途/)
})

test('3D room keeps only the entrance wall and part selection preserves shelf context', () => {
  assert.match(warehouse, /function addRoomWalls/)
  assert.match(warehouse, /entranceWall/)
  assert.doesNotMatch(warehouse, /selectedLayers\.value = \[Number\(location\.layer\)\]/)
  assert.match(warehouse, /shelf\.size\.depth \* 0\.5 \+ 4\.2/)
})

test('imports provide templates, preflight validation and actionable row errors', () => {
  assert.match(inventory, /下载当前车间模板/)
  assert.match(inventory, /校验文件/)
  assert.match(inventory, /prop="suggestion" label="修改建议"/)
  assert.match(inventory, /下载错误修正台账/)
  assert.match(api, /downloadPartsImportErrorReport/)
  assert.match(equipment, /导入设备/)
  assert.match(equipment, /导入关系/)
  assert.match(equipment, /任一错误都不会产生部分数据/)
})

test('inventory counting uses a centered dialog and supports multi-shelf scope', () => {
  assert.match(check, /<el-dialog[^>]+新建盘点任务/)
  assert.match(check, /value:\s*'shelf'/)
  assert.match(check, /multiple collapse-tags/)
  assert.match(check, /check-create-meta-grid/)
  assert.match(check, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
  assert.match(check, /inventory-scope-segmented/)
  assert.match(check, /text-overflow:clip/)
})

test('compact filters and category models avoid unnecessary visual clutter', () => {
  assert.match(movements, /\.movement-filter\{grid-template-columns:[^}]+/)
  assert.match(replenishment, /replenish-controls/)
  assert.match(warehouse, /function modelCategory/)
  assert.match(warehouse, /const groupKey = `\$\{shelf\.id\}:\$\{location\.position\}:\$\{location\.layer\}:\$\{location\.location\}`/)
  assert.doesNotMatch(warehouse, /groupKey[^\n]+\$\{category\}/)
  assert.doesNotMatch(warehouse, /systemCategoryModels/)
  assert.doesNotMatch(modelLibrary, /system-model-strip/)
  assert.match(modelLibrary, /备件模型关联/)
  assert.match(modelLibrary, /类别模型管理/)
  assert.match(modelLibrary, /批量上传专用3D/)
  assert.match(modelLibrary, /批量关联类别/)
  assert.match(modelLibrary, /新增类别模型/)
  assert.match(modelLibrary, /deletePartCategoryModel/)
  assert.match(warehouse, /STOCK_MODEL_COLORS/)
  assert.match(warehouse, /normal: \{ color: 0x19a974/)
  assert.match(warehouse, /low: \{ color: 0xd9222f/)
  assert.doesNotMatch(warehouse, /addStockStatusRing|locationOutline|EdgesGeometry/)
  assert.match(warehouse, /displayedShelfParts\.length/)
  assert.match(warehouse, /located-actions/)
})

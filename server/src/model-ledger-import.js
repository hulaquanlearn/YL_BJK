'use strict';
const readXlsxFile = require('read-excel-file/node');
const { ApiError } = require('./utils');
const { assertAssetScope } = require('./part-asset-permissions');
const { resolveModel } = require('./model-bindings');

async function readModelLedger(buffer) {
  // read-excel-file 9 returns sheets with a data array, not a flat row array.
  const sheets = await readXlsxFile(buffer);
  const isHeader = (row, index) => index < 30 && row.map(value => String(value ?? '').trim()).includes('物料编码') && row.map(value => String(value ?? '').trim()).includes('模型名称');
  const rows = sheets.find(sheet => sheet.data.some(isHeader))?.data || [];
  const headerIndex = rows.findIndex(isHeader);
  if (headerIndex < 0) throw new ApiError(400, '缺少“物料编码”和“模型名称”列');
  const headers = rows[headerIndex].map(value => String(value ?? '').trim());
  const codeColumn = headers.indexOf('物料编码'), nameColumn = headers.indexOf('模型名称');
  const records = [], codes = new Set();
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const code = String(rows[index][codeColumn] ?? '').trim();
    const modelName = String(rows[index][nameColumn] ?? '').trim();
    if (!code && !modelName) continue;
    if (!code) throw new ApiError(400, `第${index + 1}行缺少物料编码`);
    if (codes.has(code)) throw new ApiError(400, `第${index + 1}行物料编码${code}重复，请每个物料保留一行`);
    codes.add(code);
    records.push({ code, modelName, sourceRow: index + 1 });
  }
  if (!records.length || records.length > 5000) throw new ApiError(400, '请提供1至5000条模型绑定记录');
  return records;
}

async function planModelLedger(db, user, records) {
  const items = [], errors = [];
  for (const record of records) {
    try {
      const [[part]] = await db.query('SELECT p.id,p.name,p.bound_model_id,pm.name AS previousModelName FROM parts p LEFT JOIN part_models pm ON pm.id=p.bound_model_id WHERE BINARY p.code=BINARY ? AND COALESCE(p.active,1)=1', [record.code]);
      if (!part) throw new ApiError(400, '物料编码不存在或备件已停用；此入口不会新增备件');
      if (!record.modelName) { items.push({ ...record, partId: Number(part.id), previousModelName: part.previousModelName, preserve: true }); continue; }
      const [owners] = await db.query("SELECT DISTINCT COALESCE(workshop_code,'raw_grain') AS workshopCode FROM inventory WHERE part_id=? AND COALESCE(active,1)=1", [part.id]);
      assertAssetScope(user, owners.map(owner => owner.workshopCode));
      const id = await resolveModel(db, { name: record.modelName }, owners.length === 1 ? owners[0].workshopCode : null);
      const [[model]] = await db.query('SELECT workshop_code FROM part_models WHERE id=? AND active=1', [id]);
      if (!model) throw new ApiError(409, '模型已停用');
      if (model.workshop_code && owners.some(owner => owner.workshopCode !== model.workshop_code)) throw new ApiError(403, '共用备件只能绑定公共模型');
      items.push({ ...record, partId: Number(part.id), modelId: id, previousModelName: part.previousModelName, changed: Number(part.bound_model_id) !== id });
    } catch (error) {
      if (!error.status) throw error;
      errors.push({ row: record.sourceRow, field: '模型名称', reason: error.message, code: record.code });
    }
  }
  return { total: records.length, changed: items.filter(item => item.changed).length, preserved: items.filter(item => item.preserve).length, items, errors };
}
module.exports = { readModelLedger, planModelLedger };

'use strict';
const { ApiError } = require('./utils');
const { workshopForRole } = require('./workshop-scope');
const { assertAssetScope } = require('./part-asset-permissions');

function modelId(value) {
  if (value === null || value === '') return null;
  if (typeof value === 'boolean' || !/^\d+$/.test(String(value))) throw new ApiError(400, '模型ID必须是正整数');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, '模型ID必须是正整数');
  return id;
}
function assertModelWrite(user, model) {
  if (user?.role === 'admin') return;
  const own = workshopForRole(user?.role);
  if (!own || !model.workshop_code || model.workshop_code !== own) {
    throw new ApiError(403, '公共模型由系统管理员维护；车间管理员只能维护本车间模型');
  }
}
async function resolveModel(db, input, workshopCode) {
  if (input === null || input === '') return null;
  const byName = typeof input === 'object' && input !== null;
  const value = byName ? String(input.name || '').trim() : modelId(input);
  if (byName && (!value || value.length > 80)) throw new ApiError(400, '模型名称不能为空且不能超过80字');
  const [[model]] = await db.query(`SELECT id,name,workshop_code FROM part_models WHERE ${byName ? 'BINARY name=BINARY ?' : 'id=?'} AND active=1`, [value]);
  if (!model) throw new ApiError(400, byName ? `模型名称“${value}”不存在，请先在模型库新增` : '模型不存在或已停用');
  if (model.workshop_code && workshopCode && model.workshop_code !== workshopCode) throw new ApiError(403, '该模型属于其他车间，请选择公共模型或本车间模型');
  return Number(model.id);
}
// Caller owns the master lock and the surrounding transaction. Blank Excel cells
// preserve bindings; null from an explicit UI action unbinds them.
async function bindPartModel(db, user, partId, input, workshopCode) {
  const id = await resolveModel(db, input, workshopCode);
  const [[part]] = await db.query('SELECT bound_model_id FROM parts WHERE id=? FOR UPDATE', [partId]);
  if (!part) throw new ApiError(404, '备件不存在');
  if ((part.bound_model_id == null ? null : Number(part.bound_model_id)) === id) return id;
  const [owners] = await db.query("SELECT COALESCE(workshop_code,'raw_grain') AS workshopCode FROM inventory WHERE part_id=? AND COALESCE(active,1)=1 ORDER BY id FOR UPDATE", [partId]);
  if (owners.length) assertAssetScope(user, owners.map(row => row.workshopCode));
  else if (user.role !== 'admin' && workshopForRole(user.role) !== workshopCode) throw new ApiError(403, '只能绑定所属车间备件');
  if (id) {
    const [[model]] = await db.query('SELECT workshop_code FROM part_models WHERE id=? AND active=1 FOR UPDATE', [id]);
    if (!model) throw new ApiError(409, '模型已停用，请重新选择');
    if (model.workshop_code && owners.some(row => row.workshopCode !== model.workshop_code)) throw new ApiError(403, '共用备件只能绑定公共模型');
  }
  await db.query('UPDATE parts SET bound_model_id=? WHERE id=?', [id, partId]);
  return id;
}
async function validateLedgerModels(db, records, workshopCode) {
  const errors = [];
  for (const record of records) {
    if (!record.modelName) continue;
    try { await resolveModel(db, { name: record.modelName }, workshopCode); }
    catch (error) { errors.push({ row: record.sourceRow, field: '模型名称', reason: error.message, suggestion: '从模型库复制准确名称；留空保留原绑定，解除绑定请在页面操作' }); }
  }
  return errors;
}
module.exports = { modelId, assertModelWrite, resolveModel, bindPartModel, validateLedgerModels };

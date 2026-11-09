const fs = require('node:fs');
const path = require('node:path');
const { ApiError, parseJson } = require('./utils');
const fail = (status, message) => { throw new ApiError(status, message); };
const text = (value, max = 2000) => { const s = String(value ?? '').trim(); if (s.length > max) fail(400, `内容不能超过${max}字`); return s; };
const uploadFilename = value => require('./knowledge-utils').normalizeUploadFilename(value);
const id = value => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(400, '编号无效'); return n; };
const ids = value => { if (!Array.isArray(value) || value.length > 10000) fail(400, '编号列表无效'); return [...new Set(value.map(id))]; };
const dbTime = d => d.toISOString().slice(0, 19).replace('T', ' ');
const isoTime = value => value instanceof Date ? value.toISOString() : value ? String(value).replace(' ', 'T') + (/[Zz]|[+-]\d\d:\d\d$/.test(String(value)) ? '' : 'Z') : null;
const beijingMonth = value => new Date(new Date(isoTime(value)).getTime() + 8 * 3600000).toISOString().slice(0, 7);
function cycleView(row) { const automatic = /^@monthly:\d{4}-(0[1-9]|1[0-2])$/.test(row.name || ''), month = row.inspection_month || (row.created_at ? beijingMonth(row.created_at) : null); return { id: Number(row.id), name: automatic ? `${month.slice(0,4)}年${Number(month.slice(5))}月` : row.name, automatic, status: row.status, deadline: isoTime(row.deadline), createdAt: isoTime(row.created_at), inspectionMonth: month, inspectionMonthSource: automatic ? 'calendar_month' : row.inspection_month ? 'configured' : 'created_month' }; }
async function initializeFireSchema(pool) {
 const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;
 try { for (const filename of ['migration_fire_inspection_20261026.sql', 'migration_fire_photo_month_20261027.sql', 'migration_fire_section_20261103.sql']) {
   const sql = fs.readFileSync(path.join(__dirname, '../sql', filename), 'utf8');
   for (const s of sql.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await connection.query(s);
  }
 } finally { if (connection !== pool) connection.release(); }
}
async function loadFireAccess(user, pool = require('./db').pool, { lock = false } = {}) {
 if (!user) return { canRead: false, canManage: false, areaIds: [] };
 if (['admin','raw_grain'].includes(user.role)) return { canRead: true, canManage: true, areaIds: [] };
 if (user.role === 'viewer' && user.staffWorkshopCode === 'raw_grain') {
  const [rows] = await pool.query(`SELECT id FROM fire_areas ORDER BY id${lock ? ' FOR SHARE' : ''}`);
  return { canRead: true, canManage: false, areaIds: rows.map(r=>Number(r.id)) };
 }
 const [rows] = await pool.query(`SELECT m.area_id FROM fire_members m INNER JOIN fire_areas a ON a.id=m.area_id AND a.active=1 WHERE m.user_id=?${lock ? ' FOR SHARE' : ''}`, [id(user.id)]);
 const areaIds = rows.map(r => Number(r.area_id));
 return { canRead: areaIds.length > 0, canManage: false, areaIds };
}
function assertArea(access, areaId) { if (!access?.canManage && !access?.areaIds?.includes(Number(areaId))) fail(403, '没有该消防区域的权限'); }
function assertManager(access) { if (!access?.canManage) fail(403, '仅系统管理员或原粮车间管理员可执行该操作'); }
function normalizePoint(input) {
 const result = { areaId: id(input.areaId), sectionName: text(input.sectionName,100), code: text(input.code, 100), name: text(input.name, 180), building: text(input.building, 120), floor: text(input.floor, 50), room: text(input.room, 120), location: text(input.location, 500) };
 if (!result.code || !result.name) fail(400, '请填写点位编号和名称');
 if (!Array.isArray(input.assets) || !input.assets.length || input.assets.length > 100) fail(400, '请配置1至100项器材');
 result.assets = input.assets.flatMap(a => {
  if (!['extinguisher', 'hydrant'].includes(a.type)) fail(400, '器材类型无效');
  const quantity = a.quantity === null || a.quantity === '' || a.quantity === undefined ? null : Number(a.quantity);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 100)) fail(400, '器材数量应为0至100的整数或待核实');
  if(a.id&&quantity>1)fail(400,'已有器材须保持一物一码，请通过新增器材登记多具实物');
  const status = a.status || (quantity === 0 ? 'unconfigured' : 'active');
  if (!['active', 'unconfigured', 'repair', 'retired'].includes(status)) fail(400, '器材状态无效');
  const asset={ ...(a.id ? { id: id(a.id) } : {}), type: a.type, code: text(a.code, 100), name: text(a.name, 180) || (a.type === 'hydrant' ? '消火栓' : '灭火器'), spec: text(a.spec, 160), quantity, status, notes: text(a.notes, 1000), manufacturedDate: text(a.manufacturedDate,80), manufacturer: text(a.manufacturer,180), source: a.source && typeof a.source === 'object' ? a.source : null };
  if(a.id||quantity===null||quantity===0)return[asset];
  return Array.from({length:quantity},(_,index)=>({...asset,quantity:1,source:{...asset.source,originalQuantity:asset.source?.originalQuantity??quantity,instanceIndex:index+1,instanceCount:quantity}}));
 });
 if(result.assets.length>100)fail(400,'同一点位最多100件器材，请拆分点位');
 const assetIds = result.assets.filter(a => a.id).map(a => a.id); if (new Set(assetIds).size !== assetIds.length) fail(400, '器材编号重复');
 return result;
}
function normalizeRecord(input, point, now = new Date()) {
 if (!['normal', 'abnormal'].includes(input.result)) fail(400, '请选择本次检查结果');
 const completed=new Set(point.completedAssetIds||[]),targetAssetId=input.assetId===undefined||input.assetId===null?null:id(input.assetId);
 const targetAssets=targetAssetId?point.assets.filter(a=>Number(a.id)===targetAssetId):point.assets.filter(a=>!completed.has(Number(a.id)));
 if(!targetAssets.length)fail(409,targetAssetId?'该器材不属于本期工单或已经点检':'本期器材已全部点检');
 if(targetAssetId&&completed.has(targetAssetId))fail(409,'该器材本期已点检，历史记录不能覆盖');
 if (!Array.isArray(input.items) || input.items.length !== targetAssets.length) fail(400, '请逐项检查本次工单全部未检器材');
 const seen = new Set();
 const items = input.items.map(item => {
  const assetId = id(item.assetId), asset = targetAssets.find(a => Number(a.id) === assetId);
  if (!asset || seen.has(assetId)) fail(400, '检查器材不属于本期点位或重复'); seen.add(assetId);
  if (!['normal', 'abnormal', 'missing'].includes(item.result)) fail(400, '器材检查结果无效');
  if (item.result === 'normal' && (asset.quantity === null || Number(asset.quantity) <= 0 || asset.status !== 'active')) fail(400, '待核实数量、暂未配置、维修或退役器材不能按正常通过，请登记异常');
  const remark = text(item.remark, 1000);
  if (item.result !== 'normal' && !remark) fail(400, '异常或缺失器材请填写原因');
  return { assetId, result: item.result, remark, assetSnapshot: asset };
 });
 const abnormal = items.some(i => i.result !== 'normal');
 if (abnormal && input.result !== 'abnormal') fail(400, '存在异常器材，本次结果应为异常');
 const remark = text(input.remark); if (input.result === 'abnormal' && !remark && !abnormal) fail(400, '请填写异常说明');
 const photoIds = ids(input.photoIds); if (!photoIds.length || photoIds.length > 12) fail(400, '请上传1至12张本次现场照片');
 const requestId = text(input.requestId, 80); if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) fail(400, '提交标识无效，请刷新后重试');

 return { result: input.result, remark, items, photoIds, requestId, targetAssetId, assetIds:items.map(i=>i.assetId), actualCheckedAt: dbTime(now), backfillReason: '' };
}
function assertIdempotentRequest(existing,input,pointId,cycleId){
 if(Number(existing.point_id)!==pointId||Number(existing.cycle_id)!==cycleId)fail(409,'提交标识已用于其他记录');
 if(!Array.isArray(input.items))fail(400,'工单检查明细无效');
 const wanted=input.items.map(i=>id(i.assetId)).sort((a,b)=>a-b),previous=parseJson(existing.items_json,[]).map(i=>Number(i.assetId)).sort((a,b)=>a-b);
 const previousTarget=parseJson(existing.point_snapshot,{}).submissionTargetAssetId??null,target=input.assetId===undefined||input.assetId===null?null:id(input.assetId);
 if(JSON.stringify(wanted)!==JSON.stringify(previous)||previousTarget!==target)fail(409,'提交标识已用于其他器材工单，请使用新的提交标识');
}
function pointRow(row, assets = []) { return { id: Number(row.id), areaId: Number(row.area_id), areaName: row.area_name || '', sectionName:row.section_name||'', code: row.code, name: row.name, building: row.building, floor: row.floor, room: row.room, location: row.location, spatial: parseJson(row.spatial_json, null), revision: Number(row.revision), assets }; }
function assetRow(row) { return { id: Number(row.id), type: row.type, code: row.code, name: row.name, spec: row.spec, quantity: row.quantity === null ? null : Number(row.quantity), status: row.active!==undefined&&row.active!==null&&Number(row.active)===0?'retired':row.status, notes: row.notes, manufacturedDate: row.manufactured_date || '', manufacturer: row.manufacturer || '', source: parseJson(row.source_json,null) }; }
function photoRow(row) { return { id: Number(row.id), assetId:row.asset_id?Number(row.asset_id):null, mime: row.mime, filename: row.filename, url: `/api/fire-inspection/photos/${row.id}`, createdAt: isoTime(row.created_at) }; }
function recordRow(row, photos = []) { const pointSnapshot = parseJson(row.point_snapshot, {}); return { id: Number(row.id), pointId: Number(row.point_id), cycleId: Number(row.cycle_id), actorId: Number(row.actor_id), actorName: row.actor_name, actualCheckedAt: isoTime(row.actual_checked_at), submittedAt: isoTime(row.submitted_at), backfillReason: row.backfill_reason, result: row.result, remark: row.remark, items: parseJson(row.items_json, []), pointSnapshot, photos, source: pointSnapshot.recognition ? 'ai_photo' : 'manual', recognition: pointSnapshot.recognition || null }; }
async function transaction(pool, fn, { serializeImport=false, serializePhotoHash=null }={}) {
 const c=await pool.getConnection();let begun=false,locked=false,photoLocked=false;
 try{
  if(serializeImport){const [[lock]]=await c.query("SELECT GET_LOCK(CONCAT(DATABASE(),':fire-import'),10) AS acquired");if(Number(lock?.acquired)!==1)fail(409,'另一个消防导入正在处理，请稍后重试');locked=true;}
  if(serializePhotoHash){if(!/^[a-f0-9]{64}$/.test(serializePhotoHash))fail(400,'照片摘要无效');const [[lock]]=await c.query("SELECT GET_LOCK(CONCAT(LEFT(DATABASE(),12),':fire-photo:',?),3) AS acquired",[serializePhotoHash.slice(0,32)]);if(Number(lock?.acquired)!==1)fail(409,'这张照片正在提交，请稍后重试');photoLocked=true;}
  await c.beginTransaction();begun=true;const result=await fn(c);await c.commit();begun=false;return result;
 }catch(e){if(begun)await c.rollback();if(e.code==='ER_DUP_ENTRY')fail(409,'记录已存在或编号重复，请刷新核对');throw e;}
 finally{if(locked)await c.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':fire-import'))").catch(()=>{});if(photoLocked)await c.query("SELECT RELEASE_LOCK(CONCAT(LEFT(DATABASE(),12),':fire-photo:',?))",[serializePhotoHash.slice(0,32)]).catch(()=>{});c.release();}
}
module.exports = { fail, text, uploadFilename, id, ids, dbTime, isoTime, beijingMonth, cycleView, initializeFireSchema, loadFireAccess, assertArea, assertManager, normalizePoint, normalizeRecord, assertIdempotentRequest, pointRow, assetRow, photoRow, recordRow, transaction };

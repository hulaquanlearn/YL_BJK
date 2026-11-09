'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ApiError, parseJson } = require('./utils');
const { modelId, assertModelWrite } = require('./model-bindings');
const { workshopForRole } = require('./workshop-scope');
const { assertAssetScope } = require('./part-asset-permissions');
const { hash, defaultReader } = require('./model-review-assets');
const fail = (status, message) => { throw new ApiError(status, message); };
const iso = value => value instanceof Date ? value.toISOString() : value ? String(value).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(String(value)) ? '' : 'Z') : null;
const placeholders = ids => ids.map(() => '?').join(',');
// Match auth.publicUser: a manager's role wins; employee assignment is carried
// by staffWorkshopCode and normally mirrored as workshopCode in fresh sessions.
const ownWorkshop = user => workshopForRole(user?.role) || (['raw_grain','qu_making','brewing'].includes(user?.staffWorkshopCode || user?.workshopCode) ? user.staffWorkshopCode || user.workshopCode : null);
function canReadModel(user, model) { return !!user && (user.role === 'admin' || !model.workshop_code || model.workshop_code === ownWorkshop(user)); }
function canReview(user, model) { try { assertModelWrite(user, model); return true; } catch { return false; } }
function modelView(model) { return { id: Number(model.id), name: model.name, modelUrl: model.model_url || '', imageUrl: model.image_url || '', frontRotationY: Number(model.front_rotation_y) || 0, modelScale: Number(model.model_scale) || 1, workshopCode: model.workshop_code || null, quality: model.quality || '' }; }
async function ensureModelReviewSchema(db) { const sql = fs.readFileSync(path.join(__dirname, '../sql/migration_model_reviews_20261027.sql'), 'utf8'); for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement); }
async function loadParts(db, ids, { lock = false } = {}) {
 if (!ids.length) return [];
 const [parts] = await db.query(`SELECT id,bound_model_id,code,name,spec,brand,image_url FROM parts WHERE bound_model_id IN (${placeholders(ids)}) AND COALESCE(active,1)=1 ORDER BY id${lock ? ' FOR SHARE' : ''}`, ids);
 if (!parts.length) return [];
 const [owners] = await db.query(`SELECT part_id,COALESCE(workshop_code,'raw_grain') AS workshopCode FROM inventory WHERE part_id IN (${placeholders(parts)}) AND COALESCE(active,1)=1 ORDER BY id${lock ? ' FOR SHARE' : ''}`, parts.map(p => p.id));
 return parts.map(p => ({ id: Number(p.id), modelId: Number(p.bound_model_id), code: p.code, name: p.name, spec: p.spec || '', brand: p.brand || '', partImageUrl: p.image_url || '', workshopCodes: [...new Set(owners.filter(o => Number(o.part_id) === Number(p.id)).map(o => o.workshopCode))].sort() }));
}
const visiblePart = (user, part) => user?.role === 'admin' || !!ownWorkshop(user) && part.workshopCodes.includes(ownWorkshop(user));
async function versionFor(model, parts, { assetReader = defaultReader, force = false } = {}) {
 const view = modelView(model), file = await assetReader.read(view.modelUrl, 'model', { force }), image = await assetReader.read(view.imageUrl, 'image', { force });
 const references = [];
 for (const part of parts) references.push({ ...part, image: await assetReader.read(part.partImageUrl, 'image', { force }) });
 const snapshot = { schema: 1, model: view, file: { url: file.url, sha256: file.sha256, available: file.available }, image: { url: image.url, sha256: image.sha256, available: image.available }, parts: references.map(p => ({ id: p.id, code: p.code, name: p.name, spec: p.spec, brand: p.brand, workshopCodes: p.workshopCodes, partImageUrl: p.partImageUrl, imageHash: p.image.sha256, imageAvailable: p.image.available })) };
 return { hash: hash(JSON.stringify(snapshot)), modelFileHash: file.sha256, available: file.available, reason: file.reason || '', modelImage: image, parts: references, snapshot };
}
function reviewView(row, version, visibleIds = null) {
 if (!row) return null;
 const sameVersion = row.version_hash === version.hash, valid = sameVersion && (row.status !== 'approved' || !!version.available);
 let referenceSnapshot = parseJson(row.reference_snapshot, {});
 const restricted = visibleIds && row.reference_part_id && !visibleIds.has(Number(row.reference_part_id));
 if (restricted) referenceSnapshot = { referenceType: row.reference_type, restricted: true, message: '对照备件资料不在当前可见范围' };
 return { id: Number(row.id), status: row.status, valid, stale: !sameVersion, versionHash: row.version_hash, modelFileHash: row.model_file_hash, actorName: row.actor_name, actorId: Number(row.actor_id), reviewedAt: iso(row.reviewed_at), note: restricted ? '对照备件资料不在当前可见范围' : row.note, referenceType: row.reference_type, referencePartId: restricted ? null : row.reference_part_id ? Number(row.reference_part_id) : null, checks: parseJson(row.checks_json, {}), referenceSnapshot };
}
function publicVersion(version, visibleIds) { return { hash: version.hash, modelFileHash: version.modelFileHash, available: version.available, reason: version.reason, modelImage: version.modelImage, partImages: version.parts.filter(p => visibleIds.has(p.id)).map(p => ({ partId: p.id, ...p.image })) }; }
async function detail(db, user, id, { assetReader = defaultReader } = {}) {
 const [[model]] = await db.query('SELECT * FROM part_models WHERE id=? AND active=1', [modelId(id)]);
 if (!model) fail(404, '模型不存在或已停用'); if (!canReadModel(user, model)) fail(403, '没有该车间模型的查看权限');
 const parts = await loadParts(db, [Number(model.id)]), version = await versionFor(model, parts, { assetReader }), visible = parts.filter(p => visiblePart(user, p)), visibleIds = new Set(visible.map(p => p.id));
 const [history] = await db.query('SELECT * FROM part_model_reviews WHERE model_id=? ORDER BY id DESC LIMIT 100', [model.id]);
 const reviews = history.map(row => reviewView(row, version, visibleIds));
 return { model: modelView(model), version: publicVersion(version, visibleIds), review: reviews[0] || null, history: reviews, parts: visible, permissions: { canReview: canReview(user, model) }, meshes: [] };
}
function input(body) {
 const status = body?.status, note = typeof body?.note === 'string' ? body.note.trim() : '', referenceType = body?.referenceType;
 if (!['approved','needs_fix','pending'].includes(status)) fail(400, '请选择有效核对结论');
 if (note.length < (status === 'approved' ? 10 : 2) || note.length > 2000) fail(400, status === 'approved' ? '通过核对请填写至少10字的实际对照依据和结论' : '请填写2至2000字的核对说明');
 if (!['physical_photo','manufacturer_reference','onsite'].includes(referenceType)) fail(400, '请选择实际使用的对照依据');
 if (!/^[a-f0-9]{64}$/.test(body?.expectedVersionHash || '')) fail(400, '模型版本无效，请刷新后重新核对');
 const requestId = String(body?.requestId || ''); if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) fail(400, '核对提交标识无效，请重新打开核对');
 const checks = Object.fromEntries(['identity','outline','interfaces'].map(key => [key, body?.checks?.[key] === true]));
 if (status === 'approved' && Object.values(checks).some(value => !value)) fail(400, '通过前请逐项确认型号身份、整体外形和接口位置');
 return { status, note, referenceType, referencePartId: body?.referencePartId ? modelId(body.referencePartId) : null, expectedVersionHash: body.expectedVersionHash, requestId, checks };
}
async function submit(pool, user, id, body, { assetReader = defaultReader } = {}) {
 const data = input(body), modelKey = modelId(id), requestHash = hash(JSON.stringify({ ...data, modelId: modelKey })), connection = await pool.getConnection();
 try {
  await connection.beginTransaction();
  const [[model]] = await connection.query('SELECT * FROM part_models WHERE id=? AND active=1 FOR UPDATE', [modelKey]); if (!model) fail(404, '模型不存在或已停用'); assertModelWrite(user, model);
  const [[duplicate]] = await connection.query('SELECT id,model_id,request_hash FROM part_model_reviews WHERE actor_id=? AND request_id=?', [user.id, data.requestId]);
  if (duplicate) { if (Number(duplicate.model_id) !== modelKey || duplicate.request_hash !== requestHash) fail(409, '提交标识已用于其他核对，请重新打开核对'); await connection.commit(); return detail(pool, user, modelKey, { assetReader }); }
  const parts = await loadParts(connection, [modelKey], { lock: true }), version = await versionFor(model, parts, { assetReader, force: true });
  if (version.hash !== data.expectedVersionHash) fail(409, '模型、正面方向、参考图或关联备件已变化，请刷新后重新核对');
  const selected = data.referencePartId ? version.parts.find(p => p.id === data.referencePartId) : null;
  if (data.referencePartId && !selected) fail(400, '对照备件不属于当前模型');
  if (selected) assertAssetScope(user, selected.workshopCodes);
  if (data.status === 'approved') {
   if (!version.available) fail(400, version.reason || '模型文件不可核验，不能通过');
   if (parts.length && !selected) fail(400, '请明确选择本次对照的关联备件');
   if (!parts.length && data.referenceType !== 'onsite') fail(400, '尚无关联备件，请先关联或填写现场核对依据');
   if (data.referenceType === 'physical_photo' && !selected?.image.available) fail(400, '请选择具有可核验实物照片的关联备件');
   if (data.referenceType === 'manufacturer_reference' && !version.modelImage.available) fail(400, '请先提供可核验的型号参考图');
  }
  const reference = { referenceType: data.referenceType, part: selected ? { id: selected.id, code: selected.code, name: selected.name, spec: selected.spec, brand: selected.brand, partImageUrl: selected.partImageUrl, imageHash: selected.image.sha256 } : null, modelImage: { url: version.modelImage.url, sha256: version.modelImage.sha256 }, note: data.note };
  await connection.query('INSERT INTO part_model_reviews(model_id,status,note,actor_id,actor_name,version_hash,model_file_hash,version_snapshot,reference_type,reference_part_id,reference_snapshot,checks_json,request_id,request_hash,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [modelKey,data.status,data.note,user.id,String(user.displayName || user.username || '系统用户').slice(0,100),version.hash,version.modelFileHash,JSON.stringify(version.snapshot),data.referenceType,data.referencePartId,JSON.stringify(reference),JSON.stringify(data.checks),data.requestId,requestHash]);
  await connection.commit();
 } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') fail(409, '该核对已提交，请刷新查看记录'); if (['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) fail(409, '模型或关联备件正在修改，请刷新后重新核对'); throw error; } finally { connection.release(); }
 return detail(pool, user, modelKey, { assetReader });
}
async function decisions(db, user, models, { assetReader = defaultReader } = {}) {
 const readable = models.filter(model => canReadModel(user, model)); if (!readable.length) return new Map();
 const ids = [...new Set(readable.map(m => Number(m.id)))], [rows] = await db.query(`SELECT r.* FROM part_model_reviews r JOIN (SELECT model_id,MAX(id) AS id FROM part_model_reviews WHERE model_id IN (${placeholders(ids)}) GROUP BY model_id) latest ON latest.id=r.id`, ids);
 if (!rows.length) return new Map();
 const parts = await loadParts(db, rows.map(r => Number(r.model_id))), out = new Map();
 for (const row of rows) { const model = readable.find(m => Number(m.id) === Number(row.model_id)); if (!model) continue; const references = parts.filter(p => p.modelId === Number(model.id)), version = await versionFor(model, references, { assetReader }); const review = reviewView(row, version, new Set(references.filter(p => visiblePart(user, p)).map(p => p.id))); out.set(Number(model.id), { id: review.id, status: review.status, valid: review.valid, stale: review.stale, versionHash: review.versionHash, actorName: review.actorName, reviewedAt: review.reviewedAt, note: review.note }); }
 return out;
}
async function decorateModels(db, user, rows, options) {
 const models = rows.map(row => ({ ...row, model_url: row.model_url ?? row.modelUrl, image_url: row.image_url ?? row.imageUrl, front_rotation_y: row.front_rotation_y ?? row.frontRotationY, model_scale: row.model_scale ?? row.modelScale, workshop_code: row.workshop_code ?? row.workshopCode }));
 const summaries = await decisions(db, user, models, options); return rows.filter((row, i) => canReadModel(user, models[i])).map(row => ({ ...row, reviewDecision: summaries.get(Number(row.id)) || null }));
}
async function decoratePartRows(db, user, rows, options) {
 const ids = [...new Set(rows.filter(row => row.categoryModelReviewId).map(row => Number(row.categoryModelId)).filter(Boolean))]; let summaries = new Map();
 if (ids.length) { const [models] = await db.query(`SELECT * FROM part_models WHERE id IN (${placeholders(ids)}) AND active=1`, ids); summaries = await decisions(db, user, models, options); }
 return rows.map(({ categoryModelReviewId, ...row }) => ({ ...row, categoryModelReviewDecision: summaries.get(Number(row.categoryModelId)) || null }));
}
module.exports = { ensureModelReviewSchema, canReadModel, modelView, loadParts, versionFor, reviewView, detail, input, submit, decisions, decorateModels, decoratePartRows };

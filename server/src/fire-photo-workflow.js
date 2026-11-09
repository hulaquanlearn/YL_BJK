const crypto = require('node:crypto');
const sharp = require('sharp');
const F = require('./fire-inspection');
const S = require('./fire-store');
const Q = require('./fire-query');
const R = require('./fire-recognition');
const { parseJson } = require('./utils');
const { noteOutcome } = require('./ai-call-audit');
const C = require('./fire-photo-confirmation');

const inFlight = new Map();
async function normalizedPhoto(file) {
 if (!file?.buffer?.length || file.buffer.length > 8 * 1024 * 1024) F.fail(400, '请上传8MB以内的检查记录卡照片');
 if (file.views !== undefined && (!Array.isArray(file.views) || !file.views.length || file.views.length > 3 || file.views.some(v=>!v?.buffer?.length) || file.views.reduce((n,v)=>n+v.buffer.length,0)>8*1024*1024)) F.fail(400,'同一张检查卡最多拍3张，总大小不能超过8MB');
 let image;
 try { image = await sharp(file.buffer, { limitInputPixels: 30000000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer(); }
 catch { F.fail(400, '无法读取检查卡照片，请使用有效图片'); }
 if (image.length > 5 * 1024 * 1024) F.fail(400, '压缩后的照片仍过大，请重新拍摄');
 return image;
}
async function photoEvidence(file) {
 const files = file?.views || [file];
 if (!Array.isArray(files) || files.length < 1 || files.length > 3 || files.some(f => !f?.buffer?.length) || files.reduce((n,f) => n + f.buffer.length,0) > 8 * 1024 * 1024) F.fail(400,'同一张检查卡最多拍3张，总大小不能超过8MB');
 const views = await Promise.all(files.map(normalizedPhoto));
 if (views.length === 1) return {image:views[0],views};
 const sizes = await Promise.all(views.map(v => sharp(v).metadata()));
 let top = 0;
 const layers = views.map((input,i) => { const layer={input,left:0,top};top+=sizes[i].height;return layer; });
 const image = await sharp({create:{width:Math.max(...sizes.map(s=>s.width)),height:top,channels:3,background:'#ffffff'}}).composite(layers).jpeg({quality:92}).toBuffer();
 if (image.length > 12 * 1024 * 1024) F.fail(400,'检查卡照片过大，请靠近标签重新拍摄');
 return {image,views};
}
function inputTarget(body) {
 const cycleId = F.id(body.cycleId), requestId = F.text(body.requestId, 80), pointId = body.pointId ? F.id(body.pointId) : null, assetId = body.assetId ? F.id(body.assetId) : null;
 if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) F.fail(400, '提交标识无效，请重新拍照');
 if (assetId && !pointId) F.fail(400, '器材工单缺少点位，请重新扫描二维码');
 return { cycleId, requestId, pointId, assetId };
}
async function loadCycle(db, access, cycleId) {
 const [[cycle]] = await db.query('SELECT * FROM fire_cycles WHERE id=?', [cycleId]); if (!cycle) F.fail(404, '点检月份不存在');
 const args = [cycleId], [rows] = await db.query(`SELECT cp.point_id,cp.area_id,cp.snapshot_json FROM fire_cycle_points cp WHERE cp.cycle_id=? AND ${S.scope(access, 'cp.area_id', args)} ORDER BY cp.point_id`, args);
 if (!rows.length) F.fail(404, '台账中暂无可识别器材，请先在网页录入器材编码和位置');
 return { cycle: Q.cycleView(cycle), rows, candidates: rows.flatMap(cp => { const point = parseJson(cp.snapshot_json, {}); return (point.assets || []).map(asset => ({ point, asset })); }) };
}
const needsReview = (recognition, message) => { noteOutcome('blocked'); require('./ai-call-audit').noteOutcomeReason(message || recognition.reasons.join('；')); return { status: 'needs_review', recognition, message: message || recognition.reasons.join('；') }; };
async function duplicateFor(db, user, target, photoHash, correction = null) {
 const [[existing]] = await db.query('SELECT id,point_id,cycle_id,area_id,items_json,point_snapshot FROM fire_records WHERE actor_id=? AND request_id=?', [user.id, target.requestId]);
 if (!existing) return null;
 const snapshot = parseJson(existing.point_snapshot, {}), evidence = snapshot.recognition;
 const expected = evidence?.requestedTarget || {};
 if (Number(existing.cycle_id) !== target.cycleId || !evidence || evidence.photoHash !== photoHash || (expected.pointId ?? null) !== target.pointId || (expected.assetId ?? null) !== target.assetId) F.fail(409, '提交标识已用于其他照片或任务，请重新拍照');
 if (correction && JSON.stringify(evidence.confirmation?.input) !== JSON.stringify(correction)) F.fail(409, '本张照片已保存，不能用同一提交标识修改编号或位置，请查看原记录');
 F.assertArea(await F.loadFireAccess(user, db), existing.area_id);
 return { status: 'completed', recognition: evidence, record: await S.record(db, existing.id), pointId: Number(existing.point_id), assetId: Number(snapshot.submissionTargetAssetId), message: '该照片已完成点检，已恢复原记录' };
}
async function usedPhoto(db, photoHash) {
 const [[used]] = await db.query("SELECT id FROM fire_records WHERE JSON_UNQUOTE(JSON_EXTRACT(point_snapshot,'$.recognition.photoHash'))=? LIMIT 1", [photoHash]);
 return !!used;
}
async function processPhoto(pool, user, file, body, { recognize = R.recognizePhoto, now = new Date(), config = R.configuration(), clock = () => new Date() } = {}) {
 const target = inputTarget(body), key = `${user.id}:${target.requestId}`;
 if (!file?.buffer?.length || file.buffer.length > 8 * 1024 * 1024) F.fail(400, '请上传8MB以内的检查记录卡照片');
 if (file.views !== undefined && (!Array.isArray(file.views) || !file.views.length || file.views.length > 3 || file.views.some(v=>!v?.buffer?.length) || file.views.reduce((n,v)=>n+v.buffer.length,0)>8*1024*1024)) F.fail(400,'同一张检查卡最多拍3张，总大小不能超过8MB');
 const correction = body.confirmationToken ? C.corrections(body) : null;
 const uploadHash=crypto.createHash('sha256');
 for(const view of file.views || [file]) { if(!view?.buffer?.length) F.fail(400,'检查卡照片无效'); uploadHash.update(String(view.buffer.length)+':').update(view.buffer); }
 const signature = JSON.stringify({ ...target, correction, confirmationToken: body.confirmationToken || '', uploadHash: uploadHash.digest('hex') });
 const existing = inFlight.get(key);
 if (existing) { if (existing.signature !== signature) F.fail(409, '同一提交标识对应的照片或任务已变化，请重新拍照'); return existing.promise; }
 if ([...inFlight.keys()].some(k => k.startsWith(`${user.id}:`))) F.fail(429, '您已有一张照片正在识别，请等待完成；当前照片已保留');
 if (inFlight.size >= 6) F.fail(429, '当前识别任务较多，请稍后重试');
 const promise = (async () => { const {image,views} = await photoEvidence(file); return execute(image, crypto.createHash('sha256').update(image).digest('hex'),views); })(); inFlight.set(key, { signature, promise });
 try { return await promise; } finally { if (inFlight.get(key)?.promise === promise) inFlight.delete(key); }
 async function execute(image, photoHash, views) {
  const access = await F.loadFireAccess(user, pool); if (!access.canRead) F.fail(403, '当前账号未授权消防点检');
  const duplicate = await duplicateFor(pool, user, target, photoHash, correction); if (duplicate) return duplicate;
  const loaded = await loadCycle(pool, access, target.cycleId), month = loaded.cycle.inspectionMonth;
  if (!month) F.fail(409, '缺少点检月份，请刷新后重试');
  if (loaded.cycle.status !== 'open') F.fail(409, '该周期已关闭');
  if (target.pointId && !loaded.rows.some(cp => Number(cp.point_id) === target.pointId)) F.fail(404, '该点位不在本月器材台账中');
  if (target.assetId && !loaded.candidates.some(c => Number(c.point.id) === target.pointId && Number(c.asset.id) === target.assetId)) F.fail(404, '该器材不在本月器材台账中');
  const empty = { version: R.VERSION, source: 'ai_photo', year: Number(month.slice(0, 4)), month: Number(month.slice(5)), photoHash, deviceCode: '', checks: [], result: 'unclear', reasons: [] };
  if (month !== Q.beijingMonth(now)) { empty.reasons.push(`当前统计月份为${month}，拍照自动点检仅支持当前月份${Q.beijingMonth(now)}，历史月份仅供查看，请返回本月重新拍照`); return needsReview(empty); }
  if (await usedPhoto(pool, photoHash)) { empty.reasons.push('这张照片已用于点检记录，请重新拍摄本期现场检查卡'); return needsReview(empty); }
  const recognition = correction ? C.read(body.confirmationToken, user, target, photoHash, now) : await recognize(image, month, { config, now, views });
  // Only server-derived values participate in the durable evidence or idempotency checks.
  recognition.photoHash = photoHash; recognition.requestedTarget = { pointId: target.pointId, assetId: target.assetId }; recognition.inspectionMonth = month;
  recognition.viewCount = views.length;
  if (!correction) {
   if (!recognition.contentReady) return needsReview(recognition);
   const latestAccess = await F.loadFireAccess(user, pool);
   if (!latestAccess.canRead) F.fail(403, '没有该消防区域的权限');
   const candidates = loaded.candidates.filter(c => (latestAccess.canManage || latestAccess.areaIds.includes(Number(c.point.areaId))) && c.asset.quantity === 1 && c.asset.status === 'active' && c.asset.type === recognition.deviceType && (!target.pointId || Number(c.point.id) === target.pointId) && (!target.assetId || Number(c.asset.id) === target.assetId)).map(c => ({ pointId: Number(c.point.id), assetId: Number(c.asset.id), deviceCode: c.asset.code, areaName: c.point.areaName, location: c.point.location || [c.point.building,c.point.floor,c.point.room].filter(Boolean).join(' · ') || c.point.name }));
   return { status: 'awaiting_confirmation', recognition, candidates, confirmationToken: C.issue(user, target, recognition, now), message: recognition.requiresManualConfirmation ? '本月检查表已确认，请人工补充未识别的检查结果，再选择器材保存' : '请核对器材与台账位置后保存' };
  }
  const checkConfirmations = C.confirmChecks(recognition, correction);
  const originalDeviceCode = recognition.deviceCode;
  recognition.deviceCode = correction.deviceCode;
  recognition.reasons = [];
  recognition.result = recognition.checks.some(c => c.result === 'abnormal') ? 'abnormal' : 'normal';
  const matched = R.matchCandidate(recognition, loaded.candidates, { ...target, assetId: correction.assetId }); if (!matched) return needsReview(recognition);
  if (target.assetId && target.assetId !== correction.assetId) F.fail(409, '核对的器材与当前二维码不一致，请重新选择器材拍照');
  recognition.confirmation = { actorId: Number(user.id), confirmedAt: now.toISOString(), originalDeviceCode, checks: checkConfirmations, ledgerLocation: matched.point.location || [matched.point.building,matched.point.floor,matched.point.room].filter(Boolean).join(' · ') || matched.point.name, input: correction };
  recognition.location = correction.location;
  const pointId = Number(matched.point.id), assetId = Number(matched.asset.id);
  return F.transaction(pool, async db => {
   // Locking/current reads are necessary under MySQL REPEATABLE READ: a long AI
   // request must not keep the old account role or a revoked area grant.
   const [[account]] = await db.query('SELECT id,username,display_name,role,enabled,staff_workshop_code,staff_position FROM app_users WHERE id=? FOR SHARE', [user.id]);
   if (!account || !Number(account.enabled)) F.fail(403, '当前账号已停用，识别结果尚未提交');
   const currentUser = { id: Number(account.id), username: account.username, displayName: account.display_name || account.username, role: account.role, staffWorkshopCode:account.staff_workshop_code, staffPosition:account.staff_position };
   const currentAccess = await F.loadFireAccess(currentUser, db, { lock: true });
   F.assertArea(currentAccess, matched.point.areaId);
   const retry = await duplicateFor(db, currentUser, target, photoHash, correction); if (retry) return retry;
   const cp = await S.cyclePoint(db, target.cycleId, pointId, true); F.assertArea(currentAccess, cp.area_id);
   if (cp.cycle_status !== 'open') F.fail(409, '该周期已关闭');
   if (Q.beijingMonth(clock()) !== month) F.fail(409, '已进入新的点检月份，请返回本月重新拍照');
   const candidate = R.matchCandidate(recognition, (cp.snapshot.assets || []).map(asset => ({ point: cp.snapshot, asset })), { pointId, assetId }); if (!candidate) return needsReview(recognition);
   const [[currentAsset]] = await db.query('SELECT id,point_id,active,status,quantity,code,type FROM fire_assets WHERE id=? FOR UPDATE', [assetId]);
   if (!currentAsset || Number(currentAsset.active) !== 1 || currentAsset.status !== 'active' || Number(currentAsset.quantity) !== 1 || Number(currentAsset.point_id) !== pointId || currentAsset.type !== candidate.asset.type || R.normalizeCode(currentAsset.code) !== R.normalizeCode(candidate.asset.code)) { recognition.reasons.push('该实物器材编码、类型或在用状态已变更，请联系管理员核对台账'); recognition.result = 'unclear'; return needsReview(recognition); }
   const mappings = await S.assetMappings(db, target.cycleId, pointId);
   if (mappings.some(m => Number(m.asset_id) === assetId)) { recognition.reasons.push('该器材本期已有点检记录，不能覆盖，请查看已点检记录'); recognition.result = 'unclear'; return needsReview(recognition); }
   if (await usedPhoto(db, photoHash)) { recognition.reasons.push('这张照片已用于点检记录，请重新拍摄'); recognition.result = 'unclear'; return needsReview(recognition); }
   const filename = F.text(F.uploadFilename(file.originalname), 180) || '检查记录卡.jpg';
   const [photo] = await db.query('INSERT INTO fire_photos(point_id,owner_id,asset_id,image,mime,filename,byte_size,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())', [pointId, user.id, assetId, image, 'image/jpeg', filename, image.length]);
   const abnormal = recognition.checks.filter(c => c.result === 'abnormal'), prefix = checkConfirmations.length ? '拍照点检' : 'AI识别', manualNote = checkConfirmations.length ? `；人工确认：${checkConfirmations.map(c => c.name).join('、')}` : '', remark = (abnormal.length ? `${prefix}${month}检查卡异常：${abnormal.map(c => `${c.name}×`).join('、')}` : `${prefix}${month}检查卡各项正常`) + manualNote;
   const input = { requestId: target.requestId, assetId, result: abnormal.length ? 'abnormal' : 'normal', remark, items: [{ assetId, result: abnormal.length ? 'abnormal' : 'normal', remark }], photoIds: [Number(photo.insertId)] };
   const record = await S.submitRecord(db, currentUser, pointId, target.cycleId, input, { recognition, now: new Date() });
   return { status: 'completed', recognition, record, pointId, assetId, message: abnormal.length ? '已完成点检，状态已变绿；检查卡异常已登记待整改' : '已完成点检，状态已变绿' };
  }, { serializePhotoHash: photoHash });
 }
}
module.exports = { normalizedPhoto, photoEvidence, inputTarget, loadCycle, duplicateFor, usedPhoto, processPhoto };

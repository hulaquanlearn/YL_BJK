const F = require('./fire-inspection');
const { parseJson } = require('./utils');
function scope(access, column, args) { if (access.canManage) return '1=1'; if (!access.areaIds.length) return '1=0'; args.push(...access.areaIds); return `${column} IN (${access.areaIds.map(() => '?').join(',')})`; }
async function activePoint(db, pointId, lock = false) {
 const [[row]] = await db.query(`SELECT p.*,a.name AS area_name FROM fire_points p JOIN fire_areas a ON a.id=p.area_id WHERE p.id=?${lock ? ' FOR UPDATE' : ''}`, [pointId]);
 if (!row) F.fail(404, '消防点位不存在');
 const [assets] = await db.query('SELECT * FROM fire_assets WHERE point_id=? AND active=1 ORDER BY id', [pointId]);
 return F.pointRow(row, assets.map(F.assetRow));
}
async function cyclePoint(db, cycleId, pointId, lock = false) {
 const [[row]] = await db.query(`SELECT cp.*,c.status AS cycle_status FROM fire_cycle_points cp JOIN fire_cycles c ON c.id=cp.cycle_id WHERE cp.cycle_id=? AND cp.point_id=?${lock ? ' FOR UPDATE' : ''}`, [cycleId, pointId]);
 if (!row) F.fail(404, '该点位不在所选周期范围内');
 return { ...row, snapshot: parseJson(row.snapshot_json, {}) };
}
async function canPhotoPointAccess(db, access, pointId, currentArea) {
 if(access.canManage||access.areaIds.includes(Number(currentArea)))return true;
 if(!access.areaIds.length)return false;
 const pendingArgs=[pointId],pendingScope=scope(access,'cp.area_id',pendingArgs);
 const [[pending]]=await db.query(`SELECT cp.point_id FROM fire_cycle_points cp JOIN fire_cycles c ON c.id=cp.cycle_id WHERE cp.point_id=? AND c.status='open' AND ${pendingScope} AND (SELECT COUNT(*) FROM fire_record_assets ra WHERE ra.cycle_id=cp.cycle_id AND ra.point_id=cp.point_id)<JSON_LENGTH(cp.snapshot_json,'$.assets') LIMIT 1`,pendingArgs);
 if(pending)return true;
 const issueArgs=[pointId],issueScope=scope(access,'area_id',issueArgs);
 const [[issue]]=await db.query(`SELECT id FROM fire_issues WHERE point_id=? AND status<>'closed' AND ${issueScope} LIMIT 1`,issueArgs);
 return Boolean(issue);
}
async function assertPhotoPointAccess(db,access,pointId,currentArea){if(!await canPhotoPointAccess(db,access,pointId,currentArea))F.fail(403,'没有该消防点位或历史待办的照片权限');}
async function assertPhotoAssetAccess(db,access,pointId,currentArea,assetId){
 const[[asset]]=await db.query('SELECT id,active FROM fire_assets WHERE id=? AND point_id=?',[assetId,pointId]);if(!asset)F.fail(400,'照片器材不属于该点位');
 if(access.canManage||Number(asset.active)===1&&access.areaIds.includes(Number(currentArea)))return;
 if(!access.areaIds.length)F.fail(403,'没有该消防器材的照片权限');
 const pendingArgs=[pointId,assetId,assetId],pendingScope=scope(access,'cp.area_id',pendingArgs);
 const[[pending]]=await db.query(`SELECT cp.point_id FROM fire_cycle_points cp JOIN fire_cycles c ON c.id=cp.cycle_id WHERE cp.point_id=? AND JSON_CONTAINS(cp.snapshot_json,JSON_OBJECT('id',?),'$.assets') AND NOT EXISTS (SELECT 1 FROM fire_record_assets ra WHERE ra.cycle_id=cp.cycle_id AND ra.asset_id=?) AND c.status='open' AND ${pendingScope} LIMIT 1`,pendingArgs);if(pending)return;
 const issueArgs=[pointId,assetId],issueScope=scope(access,'i.area_id',issueArgs);
 const[[issue]]=await db.query(`SELECT i.id FROM fire_issues i JOIN fire_records r ON r.id=i.record_id WHERE i.point_id=? AND JSON_CONTAINS(r.items_json,JSON_OBJECT('assetId',?)) AND i.status<>'closed' AND ${issueScope} LIMIT 1`,issueArgs);
 if(!issue)F.fail(403,'没有该器材的当前或历史待办照片权限');
}
function inspectionPoint(point,mappings=[]){
 const byAsset=new Map(mappings.map(m=>[Number(m.asset_id??m.assetId??m),m])),assets=point.assets.map(a=>({...a,inspectionStatus:byAsset.has(Number(a.id))?'checked':'pending',inspectionResult:byAsset.get(Number(a.id))?.result||null,lastRecordId:byAsset.get(Number(a.id))?.record_id?Number(byAsset.get(Number(a.id)).record_id):null,lastCheckedBy:byAsset.get(Number(a.id))?.actor_name||'',lastCheckedAt:F.isoTime(byAsset.get(Number(a.id))?.actual_checked_at)}));
 const completedAssetIds=assets.filter(a=>a.inspectionStatus==='checked').map(a=>Number(a.id));
 return{...point,assets,completedAssetIds,checkedAssetCount:completedAssetIds.length,assetCount:assets.length,totalAssetCount:assets.length,status:assets.length&&completedAssetIds.length===assets.length?'checked':'pending'};
}
async function assetMappings(db,cycleId,pointId){const[rows]=await db.query('SELECT asset_id,record_id,ra.result,r.actor_name,r.actual_checked_at FROM fire_record_assets ra LEFT JOIN fire_records r ON r.id=ra.record_id WHERE ra.cycle_id=? AND ra.point_id=? ORDER BY asset_id',[cycleId,pointId]);return rows;}
async function latestOpenCycle(db,access,pointId){const args=[pointId],[rows]=await db.query(`SELECT cp.cycle_id FROM fire_cycle_points cp JOIN fire_cycles c ON c.id=cp.cycle_id WHERE cp.point_id=? AND c.status='open' AND ${scope(access,'cp.area_id',args)} ORDER BY cp.cycle_id DESC LIMIT 1`,args);return rows.length?Number(rows[0].cycle_id):null;}
async function record(db, recordId) {
 const [[row]] = await db.query('SELECT * FROM fire_records WHERE id=?', [recordId]); if (!row) return null;
 const [photos] = await db.query('SELECT id,asset_id,mime,filename,created_at FROM fire_photos WHERE record_id=? ORDER BY id', [recordId]);
 return F.recordRow(row, photos.map(F.photoRow));
}
async function points(db, access, query = {}) {
 const args = []; let rows, cycle = null;
 if (query.cycleId) {
  const cycleId = F.id(query.cycleId), [[c]] = await db.query('SELECT * FROM fire_cycles WHERE id=?', [cycleId]); if (!c) F.fail(404, '盘点周期不存在');
  const issueArgs=[],issueScope=scope(access,'oi.area_id',issueArgs);
  const [cp] = await db.query(`SELECT cp.*,r.id AS record_id,r.result,r.actor_name,r.actual_checked_at,(SELECT JSON_ARRAYAGG(JSON_OBJECT('asset_id',ra.asset_id,'record_id',ra.record_id,'result',ra.result,'actor_name',ar.actor_name,'actual_checked_at',ar.actual_checked_at)) FROM fire_record_assets ra LEFT JOIN fire_records ar ON ar.id=ra.record_id WHERE ra.cycle_id=cp.cycle_id AND ra.point_id=cp.point_id) AS completed_asset_ids,(SELECT status FROM fire_issues i WHERE i.record_id=r.id LIMIT 1) AS issue_status,(SELECT COUNT(*) FROM fire_issues oi WHERE oi.point_id=cp.point_id AND oi.status<>'closed' AND ${issueScope}) AS open_issue_count,(SELECT section_name FROM fire_points WHERE id=cp.point_id) AS current_section_name FROM fire_cycle_points cp LEFT JOIN fire_records r ON r.id=(SELECT MAX(rr.id) FROM fire_records rr WHERE rr.cycle_id=cp.cycle_id AND rr.point_id=cp.point_id) WHERE cp.cycle_id=? AND ${scope(access, 'cp.area_id', args)} ORDER BY cp.point_id`, [...issueArgs,cycleId, ...args]);
  if(!access.canManage&&!cp.length&&!String(c.name).startsWith('@monthly:'))F.fail(404,'点检月份不存在');
  cycle = F.cycleView(c);
  rows = cp.filter(p=>!cycle.automatic||(parseJson(p.snapshot_json,{}).assets||[]).length).map(p => ({ ...inspectionPoint(parseJson(p.snapshot_json, {}),parseJson(p.completed_asset_ids,[])), sectionName: parseJson(p.snapshot_json, {}).sectionName || p.current_section_name || '', recordId: p.record_id ? Number(p.record_id) : null, lastResult: p.result || null, hasIssue: Number(p.open_issue_count)>0, openIssueCount:Number(p.open_issue_count)||0, issueStatus: p.issue_status || null, lastCheckedAt: F.isoTime(p.actual_checked_at), lastCheckedBy: p.actor_name || '' }));
 } else {
  const issueArgs=[],issueScope=scope(access,'oi.area_id',issueArgs);
  const [ps] = await db.query(`SELECT p.*,a.name AS area_name,(SELECT COUNT(*) FROM fire_issues oi WHERE oi.point_id=p.id AND oi.status<>'closed' AND ${issueScope}) AS open_issue_count FROM fire_points p JOIN fire_areas a ON a.id=p.area_id WHERE p.active=1 AND ${scope(access, 'p.area_id', args)} ORDER BY a.name,p.code`, [...issueArgs,...args]);
  const assetArgs = [], [as] = await db.query(`SELECT fa.* FROM fire_assets fa JOIN fire_points p ON p.id=fa.point_id WHERE fa.active=1 AND p.active=1 AND ${scope(access, 'p.area_id', assetArgs)} ORDER BY fa.id`, assetArgs);
  const grouped = new Map(); for (const a of as) { if (!grouped.has(Number(a.point_id))) grouped.set(Number(a.point_id), []); grouped.get(Number(a.point_id)).push(F.assetRow(a)); }
  rows = ps.map(p => ({ ...inspectionPoint(F.pointRow(p, grouped.get(Number(p.id)) || [])), hasIssue: Number(p.open_issue_count)>0, openIssueCount:Number(p.open_issue_count)||0, lastCheckedAt: null, lastCheckedBy: '' }));
 }
 rows = searchPoints(rows, query);
 const stats = { total: rows.length, pending: rows.filter(p => p.status === 'pending').length, checked: rows.filter(p => p.status === 'checked').length, abnormal: rows.filter(p => p.hasIssue).length };
 if (query.status) rows = rows.filter(p => query.status === 'abnormal' ? p.hasIssue : p.status === query.status);
 return { items: rows, stats, cycle };
}
async function savePoint(db, user, input, pointId = null, sourceKey = null) {
 const point = F.normalizePoint(input), [[area]] = await db.query('SELECT id FROM fire_areas WHERE id=? AND active=1', [point.areaId]); if (!area) F.fail(400, '消防区域不存在');
 let previous;
 if (pointId) { previous = await activePoint(db, pointId, true); if (Number(input.revision) !== previous.revision) F.fail(409, '点位已被其他人修改，请刷新'); }
 if(previous && input.sectionName===undefined)point.sectionName=previous.sectionName;
 if (point.assets.some(a => a.id && !previous?.assets.some(old => old.id === a.id))) F.fail(400, '器材不属于该点位');
 if (pointId) await db.query('UPDATE fire_points SET area_id=?,section_name=?,code=?,name=?,building=?,floor=?,room=?,location=?,revision=revision+1 WHERE id=?', [point.areaId,point.sectionName,point.code,point.name,point.building,point.floor,point.room,point.location,pointId]);
 else { const [r] = await db.query('INSERT INTO fire_points(area_id,section_name,code,name,building,floor,room,location,source_key,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', [point.areaId,point.sectionName,point.code,point.name,point.building,point.floor,point.room,point.location,sourceKey,user.id]); pointId = Number(r.insertId); }
 for (const a of previous?.assets || []) if (!point.assets.some(next => next.id === a.id)) await db.query('UPDATE fire_assets SET active=0,retired_at=UTC_TIMESTAMP() WHERE id=?', [a.id]);
 for (const a of point.assets) {
  const params = [a.type,a.code,a.name,a.spec,a.quantity,a.status,a.notes,a.manufacturedDate,a.manufacturer,JSON.stringify(a.source || previous?.assets.find(old=>old.id===a.id)?.source || null)];
  if (a.id) await db.query('UPDATE fire_assets SET type=?,code=?,name=?,spec=?,quantity=?,status=?,notes=?,manufactured_date=?,manufacturer=?,source_json=? WHERE id=? AND point_id=?', [...params,a.id,pointId]);
  else await db.query('INSERT INTO fire_assets(type,code,name,spec,quantity,status,notes,manufactured_date,manufacturer,source_json,point_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [...params,pointId]);
 }
 return activePoint(db, pointId);
}
async function bindPhotos(db, photoIds, userId, pointId, target, targetId, {assetId=null,assetIds=[]}={}) {
 const [rows] = await db.query(`SELECT id,owner_id,point_id,asset_id,record_id,issue_id,discarded_at FROM fire_photos WHERE id IN (${photoIds.map(() => '?').join(',')}) FOR UPDATE`, photoIds);
 if (rows.length !== photoIds.length || rows.some(p => Number(p.owner_id) !== Number(userId) || Number(p.point_id) !== Number(pointId) || p.record_id || p.issue_id || p.discarded_at)) F.fail(400, '照片必须是本人为该点位上传、尚未提交的现场照片');
 if(target==='record'&&rows.some(p=>assetId?Number(p.asset_id)!==Number(assetId):p.asset_id&&!assetIds.includes(Number(p.asset_id))))F.fail(400,assetId?'单件工单仅可使用为该件器材拍摄的照片':'不能将已检或其他器材照片关联本次工单');
 await db.query(`UPDATE fire_photos SET ${target === 'record' ? 'record_id' : 'issue_id'}=? WHERE id IN (${photoIds.map(() => '?').join(',')})`, [targetId,...photoIds]);
}
// Both manual and AI submissions use the same locking, ownership and immutable-history path.
// recognition is server-generated evidence; callers never copy it from request JSON.
async function submitRecord(db, user, pointId, cycleId, input, { recognition = null, now = new Date() } = {}) {
 const cp = await cyclePoint(db, cycleId, pointId, true), access = await F.loadFireAccess(user, db, { lock: true });
 F.assertArea(access, cp.area_id); if (cp.cycle_status !== 'open') F.fail(409, '该周期已关闭');
 const [[duplicate]] = await db.query('SELECT id,point_id,cycle_id,items_json,point_snapshot FROM fire_records WHERE actor_id=? AND request_id=?', [user.id, F.text(input.requestId, 80)]);
 if (duplicate) {
  F.assertIdempotentRequest(duplicate, input, pointId, cycleId);
  const prior = parseJson(duplicate.point_snapshot, {}).recognition;
  if (recognition && (!prior || prior.photoHash !== recognition.photoHash)) F.fail(409, '提交标识已用于其他照片，请重新拍照');
  return record(db, duplicate.id);
 }
 const snapshot = inspectionPoint(cp.snapshot, await assetMappings(db, cycleId, pointId));
 const data = F.normalizeRecord(input, snapshot, now), actorName = F.text(user.displayName || user.username, 80);
 const [r] = await db.query('INSERT INTO fire_records(cycle_id,point_id,area_id,actor_id,actor_name,actual_checked_at,submitted_at,backfill_reason,result,remark,items_json,point_snapshot,request_id) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(),?,?,?,?,?,?)', [cycleId, pointId, cp.area_id, user.id, actorName, data.actualCheckedAt, data.backfillReason, data.result, data.remark, JSON.stringify(data.items), JSON.stringify({ ...cp.snapshot, submissionTargetAssetId: data.targetAssetId, ...(recognition ? { recognition, ...(recognition.confirmation ? { location: recognition.location } : {}) } : {}) }), data.requestId]);
 const recordId = Number(r.insertId); await bindPhotos(db, data.photoIds, user.id, pointId, 'record', recordId, { assetId: data.targetAssetId, assetIds: data.assetIds });
 for (const item of data.items) await db.query('INSERT INTO fire_record_assets(cycle_id,point_id,asset_id,record_id,result) VALUES(?,?,?,?,?)', [cycleId, pointId, item.assetId, recordId, item.result]);
 if (data.result === 'abnormal') {
  const description = data.remark || data.items.filter(i => i.result !== 'normal').map(i => `${i.assetSnapshot.code || i.assetSnapshot.name}：${i.remark}`).join('；');
  const [issue] = await db.query('INSERT INTO fire_issues(record_id,point_id,area_id,cycle_id,remark,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [recordId, pointId, cp.area_id, cycleId, description]);
  await db.query('INSERT INTO fire_issue_events(issue_id,actor_id,actor_name,action,remark,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [issue.insertId, user.id, actorName, 'opened', description]);
 }
 return record(db, recordId);
}
const searchText = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
function searchPoints(rows, query = {}) {
 const keyword = searchText(F.text(query.q, 200));
 rows = rows.filter(p => (!query.areaId || Number(p.areaId) === F.id(query.areaId)) && (!query.sectionName || p.sectionName === F.text(query.sectionName,100)));
 // Exact business codes take precedence over incidental numbers in locations.
 const exactCode = keyword && rows.some(p => p.assets.some(a => (!query.type || a.type === query.type) && searchText(a.code) === keyword));
 const partialCode = keyword && !exactCode && rows.some(p => p.assets.some(a => (!query.type || a.type === query.type) && searchText(a.code).includes(keyword)));
 return rows.flatMap(p => {
  const pointMatches = !exactCode && !partialCode && [p.code,p.name,p.areaName,p.sectionName,p.building,p.floor,p.room,p.location].some(v => searchText(v).includes(keyword));
  const assets = p.assets.filter(a => (!query.type || a.type === query.type) && (!keyword || (exactCode ? searchText(a.code) === keyword : partialCode ? searchText(a.code).includes(keyword) : pointMatches || [a.code,a.name,a.spec].some(v => searchText(v).includes(keyword)))));
  // Keep the full point snapshot for details and completion totals; list/labels
  // must use this explicit subset instead of expanding unrelated siblings.
  return assets.length ? [{...p,matchedAssetIds:assets.map(a => a.id)}] : [];
 });
}
module.exports = { scope, activePoint, cyclePoint, canPhotoPointAccess, assertPhotoPointAccess, assertPhotoAssetAccess, inspectionPoint, assetMappings, latestOpenCycle, record, points, searchPoints, savePoint, bindPhotos, submitRecord };

const F = require('./fire-inspection');
const S = require('./fire-store');
const {sectionExpression,filterSection}=require('./fire-section');
const { parseJson } = require('./utils');

const { beijingMonth, cycleView } = F;
function pageQuery(query) {
 const integer = (value, fallback, max) => { if (value === undefined || value === '') return fallback; if (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > max) F.fail(400, '分页参数无效'); return Number(value); };
 return { page: integer(query.page, 1, 100000), pageSize: integer(query.pageSize, 20, 100) };
}
function filters(access, query, alias, args) {
 const conditions = [S.scope(access, `${alias}.area_id`, args)];
 for (const [key, column] of [['cycleId', 'cycle_id'], ['areaId', 'area_id']]) if (query[key]) { const value = F.id(query[key]); if (key === 'areaId') F.assertArea(access, value); conditions.push(`${alias}.${column}=?`); args.push(value); }
 filterSection(query,conditions,args,`${alias}.point_id`,'r.point_snapshot');
 return conditions;
}
function recordFilters(access, query, alias, args) {
 const conditions = filters(access, query, alias, args);
 if (query.result) { if (!['normal', 'abnormal'].includes(query.result)) F.fail(400, '检查结果筛选无效'); conditions.push(`${alias}.result=?`); args.push(query.result); }
 if (query.actorId) { conditions.push(`${alias}.actor_id=?`); args.push(F.id(query.actorId)); }
 if (!!query.from !== !!query.to) F.fail(400, '请同时选择开始和结束日期');
 if (query.from) {
  const date = value => { const s = String(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) F.fail(400, '日期筛选无效'); return Date.parse(s + 'T00:00:00+08:00'); };
  const from = date(query.from), to = date(query.to); if (to < from || to - from > 365 * 86400000) F.fail(400, '每次最多查询连续366天');
  conditions.push(`${alias}.actual_checked_at>=? AND ${alias}.actual_checked_at<?`); args.push(F.dbTime(new Date(from)), F.dbTime(new Date(to + 86400000)));
 }
 if (query.type) { if (!['extinguisher', 'hydrant'].includes(query.type)) F.fail(400, '器材类型筛选无效'); conditions.push(`JSON_CONTAINS(${alias}.items_json,JSON_OBJECT('assetSnapshot',JSON_OBJECT('type',?)))`); args.push(query.type); }
 if (query.q) { conditions.push(`CONCAT_WS(' ',${alias}.actor_name,${alias}.remark,${alias}.point_snapshot,${alias}.items_json) LIKE ?`); args.push(`%${F.text(query.q, 200)}%`); }
 return conditions;
}
function recordView(row, photos = []) {
 const out = F.recordRow(row, photos), target = out.pointSnapshot.submissionTargetAssetId;
 out.pointSnapshot={...out.pointSnapshot,sectionName:out.pointSnapshot.sectionName||row.section_name||''};
 return { ...out, cycleName: row.cycle_name, assetIds: out.items.map(i => Number(i.assetId)), targetAssetId: target == null ? null : Number(target), source: out.pointSnapshot.recognition ? 'ai_photo' : 'manual', recognition: out.pointSnapshot.recognition || null };
}
async function records(db, access, query = {}) {
 const paging = pageQuery(query), args = [], conditions = recordFilters(access, query, 'r', args).join(' AND ');
 const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM fire_records r WHERE ${conditions}`, args);
 const [rows] = await db.query(`SELECT r.*,c.name AS cycle_name,${sectionExpression('r.point_id','r.point_snapshot')} AS section_name FROM fire_records r JOIN fire_cycles c ON c.id=r.cycle_id WHERE ${conditions} ORDER BY r.actual_checked_at DESC,r.id DESC LIMIT ? OFFSET ?`, [...args, paging.pageSize, (paging.page - 1) * paging.pageSize]);
 let photos = [];
 if (rows.length) [photos] = await db.query(`SELECT id,record_id,asset_id,mime,filename,created_at FROM fire_photos WHERE record_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, rows.map(r => r.id));
 return { items: rows.map(r => recordView(r, photos.filter(p => Number(p.record_id) === Number(r.id)).map(F.photoRow))), total: Number(count.total), ...paging };
}
async function issues(db, access, query = {}) {
 const paging = pageQuery(query), args = [], conditions = filters(access, query, 'i', args);
 const status = query.status || 'pending'; if (!['pending', 'all', 'open', 'resolved', 'closed'].includes(status)) F.fail(400, '整改状态筛选无效');
 if (status === 'pending') conditions.push("i.status<>'closed'"); else if (status !== 'all') { conditions.push('i.status=?'); args.push(status); }
 if (query.type) { if (!['extinguisher', 'hydrant'].includes(query.type)) F.fail(400, '器材类型筛选无效'); conditions.push("(JSON_CONTAINS(r.items_json,JSON_OBJECT('result','abnormal','assetSnapshot',JSON_OBJECT('type',?))) OR JSON_CONTAINS(r.items_json,JSON_OBJECT('result','missing','assetSnapshot',JSON_OBJECT('type',?))))"); args.push(query.type, query.type); }
 if (query.q) { conditions.push("CONCAT_WS(' ',i.remark,r.actor_name,r.point_snapshot,r.items_json) LIKE ?"); args.push(`%${F.text(query.q, 200)}%`); }
 const where = conditions.join(' AND '), join = 'FROM fire_issues i JOIN fire_records r ON r.id=i.record_id JOIN fire_cycles c ON c.id=i.cycle_id';
 const [[count]] = await db.query(`SELECT COUNT(*) AS total ${join} WHERE ${where}`, args);
 const [rows] = await db.query(`SELECT i.*,c.name AS cycle_name,${sectionExpression('i.point_id','r.point_snapshot')} AS section_name,r.actor_name,r.actual_checked_at,r.point_snapshot,r.items_json ${join} WHERE ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`, [...args, paging.pageSize, (paging.page - 1) * paging.pageSize]);
 let events = [], photos = [], originals = [];
 if (rows.length) {
  const ids = rows.map(r => r.id), placeholders = ids.map(() => '?').join(',');
  [events] = await db.query(`SELECT * FROM fire_issue_events WHERE issue_id IN (${placeholders}) ORDER BY id`, ids);
  [photos] = await db.query(`SELECT id,issue_id,issue_event_id,asset_id,mime,filename,created_at FROM fire_photos WHERE issue_id IN (${placeholders}) ORDER BY id`, ids);
  [originals] = await db.query(`SELECT id,record_id,asset_id,mime,filename,created_at FROM fire_photos WHERE record_id IN (${placeholders}) ORDER BY id`, rows.map(r => r.record_id));
 }
 return { items: rows.map(r => ({ id: Number(r.id), recordId: Number(r.record_id), pointId: Number(r.point_id), areaId: Number(r.area_id), cycleId: Number(r.cycle_id), cycleName: r.cycle_name, status: r.status, remark: r.remark, createdAt: F.isoTime(r.created_at), resolvedAt: F.isoTime(r.resolved_at), closedAt: F.isoTime(r.closed_at), pointSnapshot: {...parseJson(r.point_snapshot, {}),sectionName:parseJson(r.point_snapshot, {}).sectionName||r.section_name||''}, assets: parseJson(r.items_json, []).filter(i => i.result !== 'normal').map(i => i.assetSnapshot), actorName: r.actor_name, actualCheckedAt: F.isoTime(r.actual_checked_at), events: events.filter(e => Number(e.issue_id) === Number(r.id)).map(e => ({ id: Number(e.id), action: e.action, actorId: Number(e.actor_id), actorName: e.actor_name, createdAt: F.isoTime(e.created_at), remark: e.remark, photos: photos.filter(p => Number(p.issue_event_id) === Number(e.id)).map(F.photoRow) })), photos: [...originals.filter(p => Number(p.record_id) === Number(r.record_id)), ...photos.filter(p => Number(p.issue_id) === Number(r.id))].map(F.photoRow) })), total: Number(count.total), ...paging };
}
async function dashboard(db, access, query = {}) {
 if (query.areaId) F.assertArea(access, F.id(query.areaId));
 let cycleId = query.cycleId ? F.id(query.cycleId) : null;
 if (!cycleId) { const args = [], [rows] = await db.query(`SELECT DISTINCT c.id FROM fire_cycles c JOIN fire_cycle_points cp ON cp.cycle_id=c.id WHERE ${S.scope(access, 'cp.area_id', args)} ORDER BY c.id DESC LIMIT 1`, args); cycleId = rows.length ? Number(rows[0].id) : null; }
 if (!cycleId) return { cycle: null, dispatchStatus: 'unassigned', overall: null, areas: [] };
 const { items, cycle } = await S.points(db, access, { cycleId, ...(query.areaId ? { areaId: query.areaId } : {}), ...(query.sectionName ? {sectionName:query.sectionName} : {}) });
 const args = [], conditions = ["i.status<>'closed'", S.scope(access, 'i.area_id', args)]; if (query.areaId) { conditions.push('i.area_id=?'); args.push(F.id(query.areaId)); }
 filterSection(query,conditions,args,'i.point_id',null);
 const [open] = await db.query(`SELECT i.area_id,COUNT(*) AS total FROM fire_issues i WHERE ${conditions.join(' AND ')} GROUP BY i.area_id`, args);
 const grouped = new Map(), zero = () => ({ totalAssets: 0, checkedAssets: 0, pendingAssets: 0, progress: 0, totalPoints: 0, checkedPoints: 0, pendingPoints: 0, abnormalPoints: 0, openIssues: 0 });
 for (const p of items) {
  if (!grouped.has(p.areaId)) grouped.set(p.areaId, { areaId: p.areaId, name: p.areaName, ...zero(), lastCheckedAt: null, lastCheckedBy: '' });
  const a = grouped.get(p.areaId); a.totalAssets += p.assetCount; a.checkedAssets += p.checkedAssetCount; a.totalPoints++; a.checkedPoints += p.status === 'checked' ? 1 : 0; a.abnormalPoints += p.hasIssue ? 1 : 0;
  if (p.lastCheckedAt && (!a.lastCheckedAt || p.lastCheckedAt > a.lastCheckedAt)) { a.lastCheckedAt = p.lastCheckedAt; a.lastCheckedBy = p.lastCheckedBy; }
 }
 for (const issue of open) { const areaId = Number(issue.area_id); if (grouped.has(areaId)) grouped.get(areaId).openIssues = Number(issue.total); }
 const overall = zero(); for (const area of grouped.values()) { area.pendingAssets = area.totalAssets - area.checkedAssets; area.pendingPoints = area.totalPoints - area.checkedPoints; area.progress = area.totalAssets ? Math.round(area.checkedAssets * 1000 / area.totalAssets) / 10 : 0; for (const key of Object.keys(overall).filter(k => k !== 'progress')) overall[key] += area[key]; }
 overall.progress = overall.totalAssets ? Math.round(overall.checkedAssets * 1000 / overall.totalAssets) / 10 : 0;
 return { cycle, dispatchStatus: 'assigned', overall, areas: [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) };
}
module.exports = { beijingMonth, cycleView, pageQuery, recordFilters, records, issues, dashboard, recordView };

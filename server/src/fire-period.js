const F = require('./fire-inspection');
const { parseJson } = require('./utils');
const { isDeepStrictEqual } = require('node:util');

// Calendar grouping is internal bookkeeping, never an assigned inspection task.
// The ledger/import advisory lock serializes both membership changes and period creation.
async function ensureCurrentPeriod(pool, user, access, now = new Date()) {
 if (!access?.canRead) F.fail(403, '当前账号未授权消防点检');
 const month = F.beijingMonth(now), name = `@monthly:${month}`;
 return F.transaction(pool, async db => {
  const [existing] = await db.query('SELECT * FROM fire_cycles WHERE name=? AND inspection_month=? ORDER BY id FOR UPDATE', [name, month]);
  if (existing.length > 1) F.fail(409, '本月统计范围重复，请联系管理员核对');
  let cycle = existing[0];
  if (!cycle) {
   const [created] = await db.query('INSERT INTO fire_cycles(name,inspection_month,created_by,created_at) VALUES(?,?,?,UTC_TIMESTAMP())', [name, month, F.id(user.id)]);
   cycle = { id: Number(created.insertId), name, inspection_month: month, status: 'open', deadline: null, created_at: now };
  }
  const [points] = await db.query('SELECT p.*,a.name AS area_name FROM fire_points p JOIN fire_areas a ON a.id=p.area_id AND a.active=1 WHERE p.active=1 ORDER BY p.id FOR UPDATE');
  const [assets] = await db.query("SELECT fa.* FROM fire_assets fa JOIN fire_points p ON p.id=fa.point_id JOIN fire_areas a ON a.id=p.area_id WHERE fa.active=1 AND fa.quantity=1 AND fa.status NOT IN ('retired','unconfigured') AND p.active=1 AND a.active=1 ORDER BY fa.id FOR UPDATE");
  const [previous] = await db.query('SELECT * FROM fire_cycle_points WHERE cycle_id=? ORDER BY point_id FOR UPDATE', [cycle.id]);
  const previousById = new Map(previous.map(p => [Number(p.point_id), p])), grouped = new Map(), activeIds = new Set(), changes = [];
  for (const asset of assets) { const pointId = Number(asset.point_id); if (!grouped.has(pointId)) grouped.set(pointId, []); grouped.get(pointId).push(F.assetRow(asset)); }
  for (const point of points) {
   const pointId = Number(point.id), snapshot = F.pointRow(point, grouped.get(pointId) || []), old = previousById.get(pointId);
   activeIds.add(pointId);
   if (!old && !snapshot.assets.length) continue;
   if (!old || Number(old.area_id) !== snapshot.areaId || !isDeepStrictEqual(parseJson(old.snapshot_json, {}),snapshot)) changes.push([Number(cycle.id), pointId, snapshot.areaId, JSON.stringify(snapshot)]);
  }
  // Retired equipment stops contributing to the current ledger count. Its immutable
  // fire_records/point_snapshot and photos remain available in historical records.
  for (const old of previous) if (!activeIds.has(Number(old.point_id))) {
   const snapshot = parseJson(old.snapshot_json, {});
   if (snapshot.assets?.length) changes.push([Number(cycle.id), Number(old.point_id), Number(old.area_id), JSON.stringify({ ...snapshot, assets: [] })]);
  }
  for (let offset = 0; offset < changes.length; offset += 100) {
   const batch = changes.slice(offset, offset + 100);
   await db.query(`INSERT INTO fire_cycle_points(cycle_id,point_id,area_id,snapshot_json) VALUES ${batch.map(() => '(?,?,?,?)').join(',')} ON DUPLICATE KEY UPDATE area_id=VALUES(area_id),snapshot_json=VALUES(snapshot_json)`, batch.flat());
  }
  return F.cycleView(cycle);
 }, { serializeImport: true });
}
module.exports = { ensureCurrentPeriod };

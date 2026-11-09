const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/fire-query');
const access = { canManage: false, canRead: true, areaIds: [2] };
test('record filters enforce region permissions and exact Beijing inspection calendar dates', () => {
 const args = [], out = Q.recordFilters(access, { cycleId: 3, areaId: 2, result: 'abnormal', actorId: 7, from: '2026-10-01', to: '2026-10-27', type: 'hydrant', q: '张三' }, 'r', args);
 assert.equal(out[0], 'r.area_id IN (?)'); assert.deepEqual(args, [2, 3, 2, 'abnormal', 7, '2026-09-30 16:00:00', '2026-10-27 16:00:00', 'hydrant', '%张三%']); assert.ok(out.some(c => c.includes('r.actor_name')));
 assert.throws(() => Q.recordFilters(access, { areaId: 9 }, 'r', []), /没有该消防区域/);
 for (const query of [{ from: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-10-01', to: '2026-09-01' }, { from: '2025-01-01', to: '2026-10-01' }]) assert.throws(() => Q.recordFilters(access, query, 'r', []));
 for (const query of [{ page: '-1' }, { pageSize: '101' }, { page: '1.4' }, { pageSize: '1;DROP' }]) assert.throws(() => Q.pageQuery(query));
});
test('records list uses one bounded photo metadata query and returns immutable actor/time/recognition', async () => {
 const queries = [], db = { query: async (sql, args) => { queries.push({ sql, args }); if (sql.startsWith('SELECT COUNT')) return [[{ total: 2 }]]; if (sql.startsWith('SELECT r.*')) return [[{ id: 10, point_id: 4, cycle_id: 3, actor_id: 7, actor_name: '张三', actual_checked_at: '2026-10-27 04:00:00', submitted_at: '2026-10-27 04:01:00', point_snapshot: { submissionTargetAssetId: 8, recognition: { source: 'ai_photo' } }, items_json: [{ assetId: 8 }] }, { id: 11, point_id: 5, cycle_id: 3, actor_id: 8, actor_name: '李四', actual_checked_at: '2026-10-27 03:00:00', point_snapshot: {}, items_json: [{ assetId: 9 }] }]]; if (sql.startsWith('SELECT id,record_id')) return [[{ id: 50, record_id: 10, asset_id: 8, mime: 'image/jpeg', filename: '检查卡.jpg' }]]; throw Error(sql); } };
 const out = await Q.records(db, access, { page: '2', pageSize: '10' }); assert.equal(queries.length, 3); assert.ok(queries.every(q => !q.sql.includes('image,'))); assert.deepEqual(queries[1].args, [2, 10, 10]); assert.equal(out.total, 2); assert.equal(out.items[0].actorName, '张三'); assert.equal(out.items[0].actualCheckedAt, '2026-10-27T04:00:00Z'); assert.equal(out.items[0].source, 'ai_photo'); assert.deepEqual(out.items[0].assetIds, [8]); assert.equal(out.items[0].photos[0].url, '/api/fire-inspection/photos/50'); assert.equal(out.items[1].photos.length, 0);
});
test('empty dashboard reports unassigned without fabricated zero completion', async () => {
 const db = { query: async (sql, args) => { assert.match(sql, /cp.area_id IN \(\?\)/); assert.deepEqual(args, [2]); return [[]]; } };
 assert.deepEqual(await Q.dashboard(db, access), { cycle: null, dispatchStatus: 'unassigned', overall: null, areas: [] });
});
test('dashboard progress counts individual frozen assets, not points or issue health', async () => {
 const asset = id => ({ id, code: `E${id}`, quantity: 1, status: 'active' }), point = id => ({ id, areaId: 2, areaName: '二区', assets: [asset(id * 10), asset(id * 10 + 1)] });
 const db = { query: async (sql, args) => {
  if (sql.startsWith('SELECT * FROM fire_cycles')) return [[{ id: 3, name: '本期', status: 'open', inspection_month: '2026-10', created_at: '2026-10-01 00:00:00', deadline: '2026-11-01 00:00:00' }]];
  if (sql.startsWith('SELECT cp.*,r.id')) return [[{ snapshot_json: point(4), completed_asset_ids: [40], open_issue_count: 1, actual_checked_at: '2026-10-27 04:00:00', actor_name: '张三' }, { snapshot_json: point(5), completed_asset_ids: [50, 51], open_issue_count: 0 }]];
  if (sql.startsWith('SELECT i.area_id')) { assert.match(sql, /i.status<>'closed'/); assert.match(sql, /i.area_id IN/); assert.deepEqual(args, [2]); return [[{ area_id: 2, total: 2 }]]; }
  throw Error(sql);
 } };
 const out = await Q.dashboard(db, access, { cycleId: 3 }); assert.equal(out.overall.totalAssets, 4); assert.equal(out.overall.checkedAssets, 3); assert.equal(out.overall.pendingAssets, 1); assert.equal(out.overall.progress, 75); assert.equal(out.overall.checkedPoints, 1); assert.equal(out.overall.abnormalPoints, 1); assert.equal(out.overall.openIssues, 2); assert.equal(out.areas[0].lastCheckedBy, '张三'); assert.equal(out.cycle.inspectionMonth, '2026-10');
});
test('issues list scopes every parent and batches issue events, evidence and original photos', async () => {
 const queries = [], db = { query: async (sql, args) => {
  queries.push({ sql, args }); if (sql.startsWith('SELECT COUNT')) return [[{ total: 1 }]];
  if (sql.startsWith('SELECT i.*')) return [[{ id: 5, record_id: 10, point_id: 4, area_id: 2, cycle_id: 3, status: 'resolved', remark: '压力表异常', actor_name: '张三', point_snapshot: { name: '北门' }, items_json: [{ result: 'abnormal', assetSnapshot: { id: 7 } }, { result: 'normal', assetSnapshot: { id: 8 } }] }]];
  if (sql.startsWith('SELECT * FROM fire_issue_events')) return [[{ id: 20, issue_id: 5, action: 'resolve', actor_id: 8, actor_name: '李四' }]];
  if (sql.startsWith('SELECT id,issue_id')) return [[{ id: 31, issue_id: 5, issue_event_id: 20, mime: 'image/jpeg' }]];
  if (sql.startsWith('SELECT id,record_id')) return [[{ id: 30, record_id: 10, mime: 'image/jpeg' }]]; throw Error(sql);
 } };
 const out = await Q.issues(db, access, { type: 'extinguisher' }); assert.equal(queries.length, 5); assert.match(queries[0].sql, /i.area_id IN/); assert.match(queries[0].sql, /i.status<>'closed'/); assert.match(queries[0].sql, /'result','missing'/); assert.deepEqual(queries[0].args, [2, 'extinguisher', 'extinguisher']); assert.deepEqual(out.items[0].assets, [{ id: 7 }]); assert.equal(out.items[0].events[0].actorName, '李四'); assert.equal(out.items[0].events[0].photos[0].id, 31); assert.equal(out.items[0].photos.length, 2);
 await assert.rejects(() => Q.issues(db, access, { areaId: 99 }), /没有该消防区域/);
});

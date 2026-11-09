const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureCurrentPeriod } = require('../src/fire-period');
const F = require('../src/fire-inspection');
const now = new Date('2026-10-27T03:00:00Z'), actor = { id: 7 }, access = { canRead: true, canManage: true, areaIds: [] };
function fixture() {
 const state = { cycles: [], snapshots: [], points: [{ id: 10, area_id: 2, area_name: '一区', code: 'P10', name: '三楼东侧', revision: 1 }], assets: [{ id: 20, point_id: 10, code: 'E020', type: 'extinguisher', name: '灭火器', quantity: 1, status: 'active', active: 1 }], records: [{ id: 99, preserved: true }], fail: false, calls: [] };
 let tail = Promise.resolve();
 const pool = { getConnection: async () => {
  let unlock, before;
  return {
   query: async (sql, args = []) => {
    state.calls.push(sql);
    if (sql.includes('GET_LOCK')) { const previous = tail; tail = new Promise(r => { unlock = r; }); await previous; return [[{ acquired: 1 }]]; }
    if (sql.includes('RELEASE_LOCK')) { unlock(); return [[{ released: 1 }]]; }
    if (sql.startsWith('SELECT * FROM fire_cycles WHERE name=')) return [state.cycles.filter(c => c.name === args[0] && c.inspection_month === args[1])];
    if (sql.startsWith('INSERT INTO fire_cycles')) { const cycle = { id: state.cycles.length + 1, name: args[0], inspection_month: args[1], status: 'open', created_by: args[2], created_at: now }; state.cycles.push(cycle); return [{ insertId: cycle.id }]; }
    if (sql.startsWith('SELECT p.*')) return [state.points];
    if (sql.startsWith('SELECT fa.*')) return [state.assets.filter(a => a.active && a.quantity === 1 && !['retired','unconfigured'].includes(a.status))];
    if (sql.startsWith('SELECT * FROM fire_cycle_points')) return [state.snapshots.filter(p => p.cycle_id === args[0])];
    if (sql.startsWith('INSERT INTO fire_cycle_points')) { if (state.fail) throw Error('synthetic membership write failure'); for (let i = 0; i < args.length; i += 4) { const value = { cycle_id: args[i], point_id: args[i + 1], area_id: args[i + 2], snapshot_json: args[i + 3] }, old = state.snapshots.find(p => p.cycle_id === value.cycle_id && p.point_id === value.point_id); if (old) Object.assign(old, value); else state.snapshots.push(value); } return [{ affectedRows: args.length / 4 }]; }
    throw Error('Unexpected SQL: ' + sql);
   },
   beginTransaction: async () => { before = structuredClone({ cycles: state.cycles, snapshots: state.snapshots }); },
   commit: async () => {}, rollback: async () => { Object.assign(state, before); }, release: () => {}
  };
 } };
 return { pool, state };
}
test('inspection month follows Beijing calendar across the UTC month boundary', () => {
 assert.equal(F.beijingMonth(new Date('2026-10-31T15:59:59Z')), '2026-10');
 assert.equal(F.beijingMonth(new Date('2026-10-31T16:00:00Z')), '2026-11');
});
test('registered equipment enters this month without creating or assigning a task', async () => {
 const { pool, state } = fixture(), period = await ensureCurrentPeriod(pool, actor, access, now);
 assert.equal(period.name, '2026年10月'); assert.equal(period.automatic, true); assert.equal(period.inspectionMonthSource, 'calendar_month');
 assert.equal(JSON.parse(state.snapshots[0].snapshot_json).assets[0].id, 20); assert.deepEqual(state.records, [{ id: 99, preserved: true }]);
 assert.ok(state.calls.every(sql => !/fire_records|fire_members|fire_photos/.test(sql)));
});
test('concurrent first visits share one monthly grouping', async () => {
 const { pool, state } = fixture(), results = await Promise.all(Array.from({ length: 12 }, () => ensureCurrentPeriod(pool, actor, access, now)));
 assert.equal(state.cycles.length, 1); assert.equal(state.snapshots.length, 1); assert.ok(results.every(p => p.id === results[0].id));
});
test('new and retired equipment reconcile with the live ledger while records stay immutable', async () => {
 const { pool, state } = fixture(); await ensureCurrentPeriod(pool, actor, access, now);
 state.assets.push({ ...state.assets[0], id: 21, code: 'E021' }); await ensureCurrentPeriod(pool, actor, access, now);
 assert.deepEqual(JSON.parse(state.snapshots[0].snapshot_json).assets.map(a => a.id), [20, 21]);
 state.assets[0].active = 0; state.points[0].location = '更新后的位置'; await ensureCurrentPeriod(pool, actor, access, now);
 const snapshot = JSON.parse(state.snapshots[0].snapshot_json); assert.deepEqual(snapshot.assets.map(a => a.id), [21]); assert.equal(snapshot.location, '更新后的位置'); assert.deepEqual(state.records, [{ id: 99, preserved: true }]);
});
test('a new month has a new grouping and preserves the previous month', async () => {
 const { pool, state } = fixture(), october = await ensureCurrentPeriod(pool, actor, access, now), old = structuredClone(state.snapshots[0]);
 const november = await ensureCurrentPeriod(pool, actor, access, new Date('2026-10-31T16:00:00Z'));
 assert.notEqual(november.id, october.id); assert.equal(november.inspectionMonth, '2026-11'); assert.deepEqual(state.snapshots[0], old);
});
test('failed initialization rolls back both grouping and membership', async () => {
 const { pool, state } = fixture(); state.fail = true; await assert.rejects(() => ensureCurrentPeriod(pool, actor, access, now), /membership write failure/);
 assert.equal(state.cycles.length, 0); assert.equal(state.snapshots.length, 0); state.fail = false; await ensureCurrentPeriod(pool, actor, access, now); assert.equal(state.cycles.length, 1);
});
test('unassigned permission cannot initialize or reveal a calendar grouping', async () => {
 const { pool, state } = fixture(); await assert.rejects(() => ensureCurrentPeriod(pool, actor, { canRead: false }, now), /未授权/); assert.equal(state.calls.length, 0);
});

test('a new calendar year starts pending while earlier completion mappings and records remain intact',async()=>{
 const S=require('../src/fire-store'),{pool,state}=fixture();
 const december=await ensureCurrentPeriod(pool,actor,access,new Date('2026-12-31T15:59:59Z'));
 const previous=structuredClone(state.snapshots[0]),mapping=[{assetId:20,recordId:99,result:'normal'}];
 assert.equal(S.inspectionPoint(JSON.parse(previous.snapshot_json),mapping).status,'checked');
 const january=await ensureCurrentPeriod(pool,actor,access,new Date('2026-12-31T16:00:00Z'));
 assert.equal(january.inspectionMonth,'2027-01');assert.notEqual(january.id,december.id);
 assert.equal(S.inspectionPoint(JSON.parse(state.snapshots[1].snapshot_json),[]).status,'pending');
 assert.deepEqual(state.snapshots[0],previous);assert.deepEqual(state.records,[{id:99,preserved:true}]);
})

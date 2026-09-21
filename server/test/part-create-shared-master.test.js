const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ApiError } = require('../src/utils');
const { normalizeWorkshopCode, assertWorkshopWrite } = require('../src/workshop-scope');
const { parseNonNegativeQuantity } = require('../src/inventory-guards');
const { changedSharedDescriptors } = require('../src/part-import-identity');
const { warehouseJoin } = require('../src/warehouse-join');

function fixture({ shared = true, existing = true, duplicate = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/parts.js'), 'utf8');
  const start = source.indexOf("router.post('/parts',");
  const end = source.indexOf("router.post('/parts/import-preview',", start);
  const state = { writes: [], queries: [], connections: 0, committed: false, rolledBack: false, released: false };
  const master = { id: 10, name: '电机', spec: 'M1', part_type: '质保件', usage_description: '输送', remark: null };
  const connection = {
    async beginTransaction() {}, async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; }, release() { state.released = true; },
    async query(sql, args) {
      state.queries.push({ sql, args: [...args] });
      if (sql.startsWith('SELECT id,name,spec')) return [existing ? [master] : []];
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: shared ? 1 : 0 }]];
      if (sql.startsWith('SELECT i.id')) return [duplicate ? [{ id: 8 }] : []];
      if (sql.startsWith('READ_PART')) return [[{ id: 22, materialDesc: master.name }]];
      state.writes.push({ sql, args: [...args] });
      return [{ insertId: sql.includes('INSERT INTO parts') ? 10 : 22 }];
    }
  };
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_url, ...chain) { handler = chain.at(-1); } },
    requireAnyWorkshopEditor() {}, asyncHandler: fn => fn,
    normalizeWorkshopCode, assertWorkshopWrite, parseNonNegativeQuantity, changedSharedDescriptors, warehouseJoin,
    pool: { getConnection: async () => { state.connections++; return connection; } }, ApiError,
    optionalValue: value => value == null || value === '' ? null : value,
    resolveWarehouse: async (_connection, data) => ({ code: 'AREA_A', name: '本车间库', workshopCode: data.workshopCode }),
    PART_SELECT: 'READ_PART', toPart: value => value
  });
  return { state, run: (body = {}, role = 'raw_grain') => handler({
    body: { materialCode: 'P1', materialDesc: '电机', spec: 'M1', partType: '质保件', usageDescription: '输送', workshopCode: 'raw_grain', totalStock: 2, locationCode: '011102', ...body },
    user: { id: 1, role, displayName: '测试' }
  }, { status() { return this; }, json() {} }) };
}

test('workshop cannot change shared descriptors by adding an existing code at a new location', async () => {
  for (const changed of [{ materialDesc: '另一电机' }, { spec: 'M2' }, { partType: '易损件' }, { usageDescription: '另一用途' }]) {
    const f = fixture();
    await assert.rejects(f.run(changed), error => error.status === 403);
    assert.equal(f.state.committed, false); assert.equal(f.state.rolledBack, true); assert.equal(f.state.released, true);
    assert.equal(f.state.writes.length, 0);
  }
});

test('same shared master may get a local workshop location with independent unit and thresholds', async () => {
  const f = fixture();
  await f.run({ unit: '套', reorderPoint: 3, maxStock: 9, price: 12.5 });
  assert.equal(f.state.committed, true);
  assert.equal(f.state.writes.filter(row => /UPDATE parts|INSERT INTO parts/.test(row.sql)).length, 0);
  const usage = f.state.queries.find(row => row.sql.startsWith('SELECT COUNT(*)'));
  assert.deepEqual(usage.args, [10, 'raw_grain']);
  assert.match(usage.sql, /COALESCE\(workshop_code,'raw_grain'\)<>\?/);
  const insert = f.state.writes.find(row => row.sql.includes('INSERT INTO inventory'));
  assert.equal(insert.args[2], 'raw_grain');
  assert.deepEqual(insert.args.slice(10), [2, '套', 3, 9, 12.5]);
  const locationCheck = f.state.queries.find(row => row.sql.startsWith('SELECT i.id'));
  assert.match(locationCheck.sql, /LEFT JOIN warehouses existing_warehouse/);
  assert.doesNotMatch(locationCheck.sql, /SELECT id\s+FROM inventory i/);
});

test('administrator can update shared master while owner can update an unshared one', async () => {
  for (const [role, shared] of [['admin', true], ['raw_grain', false]]) {
    const f = fixture({ shared }); await f.run({ materialDesc: '更新型号' }, role);
    assert.equal(f.state.committed, true);
    assert.equal(f.state.writes.find(row => row.sql.startsWith('UPDATE parts')).args[0], '更新型号');
  }
});

test('new-location workflow still rejects another workshop and duplicate locations atomically', async () => {
  const outside = fixture();
  await assert.rejects(outside.run({ workshopCode: 'brewing' }), error => error.status === 403);
  assert.equal(outside.state.connections, 0);
  const duplicate = fixture({ duplicate: true });
  await assert.rejects(duplicate.run(), error => error.status === 409);
  assert.equal(duplicate.state.committed, false); assert.equal(duplicate.state.rolledBack, true);
  assert.equal(duplicate.state.writes.length, 0);
});

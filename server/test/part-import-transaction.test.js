const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ApiError } = require('../src/utils');
const { changedSharedDescriptors } = require('../src/part-import-identity');

function fixture(records, { pending = false, shared = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/parts.js'), 'utf8');
  const start = source.indexOf("router.post('/parts/import',");
  const end = source.indexOf("router.patch('/parts/:id',", start);
  let handler;
  const state = { writes: [], committed: false, rolledBack: false, lookups: [] };
  const connection = {
    async beginTransaction() {}, async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; }, release() {},
    async query(sql, args) {
      if (sql.startsWith('SELECT id,name,spec')) return [[{ id: 10, name: '电机', spec: 'M1', part_type: '质保件' }]];
      if (sql.includes('SELECT COUNT(*)')) return [[{ total: shared ? 1 : 0 }]];
      if (sql.startsWith('SELECT id FROM parts')) return [[{ id: 10 }]];
      if (sql.includes('SELECT code FROM warehouses')) return [[{ code: 'A' }]];
      if (sql.includes('SELECT id, quantity FROM inventory')) {
        state.lookups.push({ sql, args: [...args] });
        // One existing slot; a different slot with the same material is not an update.
        return [(args[2] === '011101' || args[7] === '北墙') ? [{ id: 8, quantity: 4 }] : []];
      }
      state.writes.push({ sql, args: [...args] }); return [{ insertId: 22 }];
    }
  };
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, ...chain) { handler = chain.at(-1); } },
    requireAnyWorkshopEditor() {}, partLedgerUpload() {}, asyncHandler: fn => fn,
    normalizeWorkshopCode: value => value || 'raw_grain', assertWorkshopWrite() {},
    parsePartLedger: async () => ({ records, errors: [] }), validatePartLedgerLocations: async () => [], validateLedgerModels: async () => [],
    pool: { getConnection: async () => connection }, ApiError, changedSharedDescriptors,
    findPendingInventoryOrder: async () => pending ? { id: 1 } : null,
    crypto: require('node:crypto')
  });
  return { state, run: (role = 'admin') => handler({ file: { buffer: Buffer.alloc(0) }, body: { workshopCode: 'raw_grain' }, user: { id: 1, role, displayName: '测试' } }, { json() {} }) };
}
const row = locationCode => ({ materialCode: 'P1', materialDesc: '电机', spec: 'M1', partType: '质保件', totalStock: 5, unit: '个', warehouseAreaName: '货区A', locationCode });

test('ledger import updates only the exact warehouse and slot, inserting a second location', async () => {
  const f = fixture([row('011101'), row('011102')]); await f.run();
  assert.equal(f.state.committed, true);
  assert.equal(f.state.writes.filter(w => /UPDATE inventory SET/.test(w.sql)).length, 1);
  assert.equal(f.state.writes.filter(w => /INSERT INTO inventory\s/.test(w.sql)).length, 1);
  assert.ok(f.state.lookups.every(q => q.sql.includes("NULLIF(location,'') <=> ?") && q.sql.includes('(warehouse=? OR warehouse=?)')));
  assert.deepEqual(f.state.lookups[1].args.slice(0,5), [10, 'raw_grain', '011102', 'A', '货区A']);
});

test('ledger import rolls back instead of changing stock under a pending count order', async () => {
  const f = fixture([row('011101')], { pending: true });
  await assert.rejects(f.run(), error => error.status === 409);
  assert.equal(f.state.committed, false); assert.equal(f.state.rolledBack, true);
  assert.equal(f.state.writes.filter(w => /UPDATE inventory SET|INSERT INTO stock_movements/.test(w.sql)).length, 0);
});

test('workshop import preserves shared master data and refuses conflicting descriptors', async () => {
  const valid = fixture([row('011101')], { shared: true }); await valid.run('raw_grain');
  assert.equal(valid.state.writes.filter(w => /INSERT INTO parts\s/.test(w.sql)).length, 0);
  assert.equal(valid.state.committed, true);
  const conflict = fixture([{ ...row('011101'), materialDesc: '不同物料' }], { shared: true });
  await assert.rejects(conflict.run('raw_grain'), error => error.status === 403);
  assert.equal(conflict.state.committed, false); assert.equal(conflict.state.rolledBack, true);
});

test('free-text locations in the same area never overwrite a different named location', async () => {
  const f=fixture([{...row(null),locationNote:'北墙'},{...row(null),locationNote:'南墙'}]);
  await f.run();
  assert.equal(f.state.writes.filter(w=>/UPDATE inventory SET/.test(w.sql)).length,1);
  assert.equal(f.state.writes.filter(w=>/INSERT INTO inventory\s/.test(w.sql)).length,1);
  assert.ok(f.state.lookups.every(q=>q.sql.includes("COALESCE(NULLIF(TRIM(location_note),''),?)=?")));
});

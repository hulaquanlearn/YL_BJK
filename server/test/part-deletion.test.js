const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDeleteIds, deleteParts } = require('../src/part-deletion');

function fixture(rows, options = {}) {
  const state = { writes: [], commits: 0, rollbacks: 0, releases: 0 };
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits++; },
    async rollback() { state.rollbacks++; },
    release() { state.releases++; },
    async query(sql, args) {
      if (sql.includes('FROM inventory i INNER JOIN parts p')) return [rows.filter(row => args.includes(row.id))];
      if (sql.includes('FROM inventory_order_items item')) return [(options.pending || []).includes(args[0]) ? [{ id: 8, inventoryNo: 'PD008' }] : []];
      if (sql.includes('FROM inventory_orders io')) return [[]];
      if (sql.includes('FROM equipment_parts ep')) return [(options.linked || []).includes(args[0]) ? [{ id: 9 }] : []];
      if (sql.includes('FROM equipment_parts WHERE')) return [(options.globalLinked || []).includes(args[0]) ? [{ id: 19 }] : []];
      if (sql.includes('SELECT COUNT(*)')) return [[{ total: options.remaining || 0 }]];
      if (sql.startsWith('UPDATE')) { state.writes.push({ sql, args }); return [{ affectedRows: args.length }]; }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  return { pool: { async getConnection() { return connection; } }, state };
}
const part = (id, quantity = 0, workshopCode = 'raw_grain') => ({ id, partId: id + 10, quantity, active: 1, workshopCode, materialCode: `P${id}`, materialDesc: `备件${id}` });
const admin = { role: 'admin' };

test('batch deletion validates, deduplicates and sorts IDs with a bounded size', () => {
  assert.deepEqual(normalizeDeleteIds(['3', 1, 3]), [1, 3]);
  for (const input of [[], null, [true], ['1x'], [0], Array(201).fill(1)]) assert.throws(() => normalizeDeleteIds(input), error => error.status === 400);
});
test('deletion preview reports stock, pending counts, relations and missing rows without writes', async () => {
  const { pool, state } = fixture([part(1), part(2, 5), part(3), part(4)], { pending: [3], linked: [14] });
  const result = await deleteParts(pool, admin, [1, 2, 3, 4, 5], { dryRun: true });
  assert.deepEqual(result.eligibleIds, ['1']);
  assert.equal(result.blockedCount, 4);
  assert.match(result.results[1].reason, /库存为5/);
  assert.match(result.results[2].reason, /PD008/);
  assert.match(result.results[3].reason, /关联设备型号/);
  assert.match(result.results[4].reason, /不存在/);
  assert.equal(state.writes.length, 0); assert.equal(state.commits, 0); assert.equal(state.releases, 1);
});
test('batch deletion is atomic when even one row is blocked', async () => {
  const { pool, state } = fixture([part(1), part(2, 2)]);
  await assert.rejects(deleteParts(pool, admin, [1, 2]), error => error.status === 409 && error.details.blockedCount === 1);
  assert.equal(state.writes.length, 0); assert.equal(state.commits, 0); assert.equal(state.rollbacks, 1);
});
test('batch deletion rejects mixed unauthorized workshop selections', async () => {
  const { pool, state } = fixture([part(1), part(2, 0, 'qu_making')]);
  await assert.rejects(deleteParts(pool, { role: 'raw_grain' }, [1, 2], { dryRun: true }), error => error.status === 403);
  assert.equal(state.writes.length, 0);
});
test('batch deletion revalidates stock after preview before committing', async () => {
  const rows = [part(1)]; const { pool, state } = fixture(rows);
  assert.equal((await deleteParts(pool, admin, [1], { dryRun: true })).eligibleCount, 1);
  rows[0].quantity = 1;
  await assert.rejects(deleteParts(pool, admin, [1]), error => error.status === 409);
  assert.equal(state.writes.length, 0);
});
test('successful deletion only disables records and never deletes stock history', async () => {
  const { pool, state } = fixture([part(1), part(2)]);
  assert.equal((await deleteParts(pool, admin, [1, 2])).deletedCount, 2);
  assert.equal(state.commits, 1);
  assert.equal(state.writes.length, 3);
  assert.ok(state.writes.every(item => /^UPDATE (inventory|parts) SET active=0/.test(item.sql)));
});
test('shared material master remains active while other inventory records exist', async () => {
  const { pool, state } = fixture([part(1)], { remaining: 1 });
  await deleteParts(pool, admin, [1]);
  assert.equal(state.writes.length, 1);
});
test('already deleted records cannot be committed again', async () => {
  const row = part(1); row.active = 0;
  const { pool, state } = fixture([row]);
  await assert.rejects(deleteParts(pool, admin, [1]), error => error.status === 409);
  assert.equal(state.writes.length, 0);
});

test('last inventory cannot orphan an equipment relation in another workshop', async () => {
  const { pool, state } = fixture([part(1)], { globalLinked: [11] });
  const preview = await deleteParts(pool, admin, [1], { dryRun: true });
  assert.equal(preview.eligibleCount, 0);
  assert.match(preview.results[0].reason, /其他车间/);
  await assert.rejects(deleteParts(pool, admin, [1]), error => error.status === 409);
  assert.equal(state.writes.length, 0);
});

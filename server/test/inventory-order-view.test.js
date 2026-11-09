const test = require('node:test');
const assert = require('node:assert/strict');
const { inventoryOrderView, inventoryOrderViews } = require('../src/inventory-order-view');

const quantities = [[202, 8], [228, 3], [229, 4], [230, 2], [293, 6], [309, 7], [725, 1]];
function equalLegacyOrder() {
  const inventoryAllList = quantities.map(([id, value]) => ({ partId: String(id), snapshotStock: value, sysStockNum: value, sysStockUnit: '个' }));
  return { id: 2, approveStatus: '已通过', inventoryAllList: JSON.stringify(inventoryAllList), abnormalList: JSON.stringify(inventoryAllList.map(item => ({ ...item, actualStock: item.snapshotStock }))) };
}
test('seven historical equal snapshots marked abnormal read as zero differences without changing stored history', () => {
  const original = equalLegacyOrder(), before = JSON.stringify(original);
  const items = quantities.map(([id, value]) => ({ order_id: 2, inventory_id: id, snapshot_quantity: String(value), actual_quantity: String(value), is_abnormal: 1 }));
  const view = inventoryOrderView(original, items);
  assert.equal(view.differenceCount, 0); assert.equal(view.abnormalList.length, 0); assert.equal(view.unverifiedCount, 0);
  assert.equal(view.recordedAbnormalList.length, 7); assert.equal(view.approveStatus, '已通过');
  assert.deepEqual(view.inventoryAllList.map(item => item.actualStock), quantities.map(([, value]) => value));
  assert.ok(view.inventoryAllList.every(item => item.quantityStatus === 'normal' && item.quantitySource === 'frozen_items'));
  assert.equal(JSON.stringify(original), before);
});
test('frozen item quantities take priority and approval/current inventory cannot hide a real historical difference', () => {
  const row = { id: 1, approveStatus: '已通过', inventoryAllList: [{ partId: '1', snapshotStock: 8, sysStockNum: 8, totalStock: 8 }], abnormalList: [{ partId: '1', actualStock: 8 }] };
  const view = inventoryOrderView(row, [{ inventory_id: 1, snapshot_quantity: '10.0000', actual_quantity: '8.0000', is_abnormal: 1 }]);
  assert.equal(view.differenceCount, 1); assert.equal(view.inventoryAllList[0].snapshotStock, 10); assert.equal(view.inventoryAllList[0].actualStock, 8);
  assert.equal(row.inventoryAllList[0].snapshotStock, 8);
});
test('legacy JSON numeric strings, explicit zero, decimal equality and unknown counts keep distinct meanings', () => {
  const view = inventoryOrderView({ id: 1, inventoryAllList: [{ partId: 1, snapshotStock: '3.0000' }, { partId: 2, snapshotStock: 1 }, { partId: 3, snapshotStock: .3 }, { partId: 4, snapshotStock: 4 }, { partId: 5, snapshotStock: 5 }], abnormalList: [{ partId: 1, actualStock: 3 }, { partId: 2, actualStock: 0 }, { partId: 3, actualStock: .1 + .2 }, { partId: 4, actualStock: null }, { partId: 5, actualStock: ' ' }] });
  assert.equal(view.differenceCount, 1); assert.equal(view.unverifiedCount, 2); assert.equal(view.abnormalList[0].partId, 2); assert.equal(view.abnormalList[0].actualStock, 0);
  assert.equal(view.inventoryAllList[0].actualStock, 3); assert.equal(view.inventoryAllList[3].actualStock, null);
});
test('paged order views use one batched frozen-item lookup and no current inventory reads', async () => {
  const calls = [], pool = { query: async (sql, args) => { calls.push({ sql, args }); return [[{ order_id: 1, inventory_id: 9, snapshot_quantity: 5, actual_quantity: 3, is_abnormal: 1 }]]; } };
  const rows = [{ id: 1, inventoryAllList: [{ partId: 9, snapshotStock: 5 }], abnormalList: [{ partId: 9, actualStock: 3 }] }, { id: 2, inventoryAllList: [{ partId: 10, snapshotStock: 2 }], abnormalList: [] }];
  const views = await inventoryOrderViews(pool, rows);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].args, [1, 2]); assert.match(calls[0].sql, /FROM inventory_order_items WHERE order_id IN \(\?,\?\)/);
  assert.doesNotMatch(calls[0].sql, /FROM inventory\b/); assert.equal(views[0].differenceCount, 1); assert.equal(views[1].differenceCount, 0); assert.equal(views[1].inventoryAllList[0].actualStock, 2);
});

test('legacy clients submitting equal abnormal rows persist all actual counts with zero new flags', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const handlers = new Map(), writes = []; let committed = false;
  const connection = { beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release() {}, query: async (sql, args) => {
    if (/FROM inventory\s+WHERE/.test(sql)) return [quantities.map(([id, quantity]) => ({ id, part_id: id, quantity, workshop_code: 'raw_grain' }))];
    if (sql.includes('FROM inventory_order_items item') || sql.includes('AND NOT EXISTS')) return [[]];
    if (sql.startsWith('INSERT INTO inventory_orders')) { writes.push({ sql, args }); return [{ insertId: 71 }]; }
    if (sql.startsWith('INSERT INTO inventory_order_items')) { writes.push({ sql, args }); return [{}]; }
    throw Error(sql);
  } };
  const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (url, ...chain) => handlers.set(`${method} ${url}`, chain.at(-1))]));
  const mocks = { express: { Router: () => router }, '../db': { pool: { getConnection: async () => connection } }, '../utils': { ...require('../src/utils'), asyncHandler: fn => fn }, '../inventory-order-view': require('../src/inventory-order-view'), '../inventory-guards': require('../src/inventory-guards'), '../auth': { requireRole: () => () => {} }, '../workshop-scope': require('../src/workshop-scope') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/routes/inventory.js'), 'utf8'), { require: name => mocks[name], module: { exports: {} }, console });
  const all = quantities.map(([partId, snapshotStock]) => ({ partId, snapshotStock }));
  let body;
  await handlers.get('post /inventory-orders')({ user: { id: 1, role: 'admin', displayName: '测试管理员' }, body: { inventoryDate: '2026-10-27', inventoryAllList: all, abnormalList: all.map(item => ({ ...item, actualStock: item.snapshotStock })) } }, { status: status => { assert.equal(status, 201); return { json: value => { body = value; } }; } });
  assert.ok(committed); assert.equal(body.data.approveStatus, '待审批');
  assert.equal(JSON.parse(writes[0].args[5]).length, 0);
  assert.deepEqual(JSON.parse(writes[0].args[4]).map(item => item.actualStock), quantities.map(([, value]) => value));
  const detailValues = writes[1].args;
  for (let index = 0; index < quantities.length; index++) { assert.equal(detailValues[index * 5 + 2], quantities[index][1]); assert.equal(detailValues[index * 5 + 3], quantities[index][1]); assert.equal(detailValues[index * 5 + 4], 0); }
});

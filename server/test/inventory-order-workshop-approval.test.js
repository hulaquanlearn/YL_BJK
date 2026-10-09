const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { pool } = require('../src/db');
const { enforceReadOnly } = require('../src/workshop-scope');

function userFor(value) {
  if (value === 'system') return { id: 1, role: 'admin', displayName: '系统管理员' };
  if (value === 'raw-manager') return { id: 2, role: 'raw_grain', workshopCode: 'raw_grain', displayName: '原粮管理员' };
  if (value === 'qu-manager') return { id: 3, role: 'qu_making', workshopCode: 'qu_making', displayName: '制曲管理员' };
  if (value === 'raw-staff') return { id: 4, role: 'viewer', workshopCode: 'raw_grain', displayName: '原粮组长' };
  return { id: 5, role: 'viewer', workshopCode: 'qu_making', displayName: '制曲组长' };
}

test('inventory list is scoped to workshop while system administrator sees all', async () => {
  const oldQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM inventory_orders WHERE id = ? LIMIT 1')) {
      return [[{ id: Number(params[0]), workshop_code: 'qu_making', approveStatus: '待审批' }]];
    }
    if (sql.includes('AS pending')) return [[{ total: 1, pending: 1, approved: 0, rejected: 0 }]];
    if (sql.startsWith('SELECT COUNT')) return [[{ total: 1 }]];
    return [[{ id: 12, workshop_code: params[0] || 'raw_grain', approveStatus: '待审批' }]];
  };
  const app = express();
  app.use((req, _res, next) => { req.user = userFor(req.get('x-role')); next(); });
  app.use(enforceReadOnly, require('../src/routes/inventory'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const staff = await fetch(`${base}/inventory-orders?status=待审批`, { headers: { 'x-role': 'raw-staff' } });
    assert.equal(staff.status, 200);
    assert.deepEqual(calls.at(-1).params.slice(0, 2), ['raw_grain', '待审批']);
    const manager = await fetch(`${base}/inventory-orders?status=待审批`, { headers: { 'x-role': 'qu-manager' } });
    assert.equal(manager.status, 200);
    assert.deepEqual(calls.at(-1).params.slice(0, 2), ['qu_making', '待审批']);
    const cross = await fetch(`${base}/inventory-orders?workshopCode=qu_making`, { headers: { 'x-role': 'raw-manager' } });
    assert.equal(cross.status, 403);
    assert.equal((await fetch(`${base}/inventory-orders/12`, { headers: { 'x-role': 'raw-manager' } })).status, 403);
    const system = await fetch(`${base}/inventory-orders?status=待审批`, { headers: { 'x-role': 'system' } });
    assert.equal(system.status, 200);
    assert.equal(calls.at(-1).params[0], '待审批');
    assert.equal((await fetch(`${base}/inventory-orders/12`, { headers: { 'x-role': 'system' } })).status, 200);
  } finally {
    pool.query = oldQuery;
    await new Promise(resolve => server.close(resolve));
  }
});

test('staff submit only own-workshop counts; managers approve own and system approves all', async () => {
  const oldGetConnection = pool.getConnection;
  const approvals = [];
  const creates = [];
  let rollbacks = 0;
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => { rollbacks++; },
    release: () => {},
    query: async (sql, params = []) => {
      if (sql.includes('FROM inventory\n') || sql.includes('FROM inventory\r\n')) {
        return [[{ id: Number(params[0]), part_id: 1, quantity: 3,
          workshop_code: Number(params[0]) === 22 ? 'qu_making' : 'raw_grain' }]];
      }
      if (sql.includes('FROM inventory_order_items item') || sql.includes('AND NOT EXISTS')) return [[]];
      if (sql.startsWith('INSERT INTO inventory_orders')) { creates.push(params); return [{ insertId: 77 }]; }
      if (sql.startsWith('INSERT INTO inventory_order_items')) return [{}];
      if (sql.includes('FROM inventory_order_items') && sql.includes('WHERE order_id')) return [[]];
      if (sql.includes('FROM inventory_orders WHERE id')) {
        const id = Number(params[0]);
        return [[{ id, workshop_code: id === 2 ? 'qu_making' : 'raw_grain',
          approveStatus: '待审批', inventoryNo: `INV-${id}`, inventoryAllList: '[]', inventoryDate: '2026-09-24' }]];
      }
      if (sql.startsWith('UPDATE inventory_orders')) { approvals.push(params); return [{}]; }
      throw new Error(`Unexpected query: ${sql}`);
    }
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = userFor(req.get('x-role')); next(); });
  app.use(enforceReadOnly, require('../src/routes/inventory'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (path, role, body) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-role': role }, body: JSON.stringify(body)
  });
  const order = id => ({ inventoryDate: '2026-09-24', inventoryAllList: [{ partId: id, snapshotStock: 3 }], abnormalList: [] });
  try {
    assert.equal((await send('/inventory-orders', 'raw-staff', order(11))).status, 201);
    assert.equal(creates.length, 1);
    assert.equal((await send('/inventory-orders', 'raw-staff', order(22))).status, 403);
    assert.equal(creates.length, 1);
    assert.equal((await send('/inventory-orders', 'raw-manager', order(11))).status, 201);
    assert.equal((await send('/inventory-orders', 'raw-manager', order(22))).status, 403);
    assert.equal(creates.length, 2);
    assert.equal((await send('/inventory-orders/2/approve', 'raw-manager', { status: '已驳回' })).status, 403);
    assert.equal((await send('/inventory-orders/1/approve', 'raw-manager', { status: '已驳回' })).status, 200);
    assert.equal((await send('/inventory-orders/2/approve', 'system', { status: '已驳回' })).status, 200);
    assert.equal((await send('/inventory-orders/1/approve', 'raw-staff', { status: '已驳回' })).status, 403);
    assert.equal(approvals.length, 2);
    assert.ok(rollbacks >= 2);
  } finally {
    pool.getConnection = oldGetConnection;
    await new Promise(resolve => server.close(resolve));
  }
});

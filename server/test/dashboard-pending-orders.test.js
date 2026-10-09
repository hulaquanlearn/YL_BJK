const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { pool } = require('../src/db');

test('dashboard pending metric counts orders in the approver workshop, not inventory rows', async () => {
  const saved = pool.query;
  const pendingQueries = [];
  pool.query = async (sql, params = []) => {
    if (sql.includes('COUNT(*) AS pendingApproval FROM inventory_orders')) {
      pendingQueries.push(params);
      return [[{ pendingApproval: params[0] === 'raw_grain' ? 2 : 5 }]];
    }
    return [[]];
  };
  const app = express();
  app.use((req, _res, next) => {
    req.user = req.get('x-role') === 'system'
      ? { role: 'admin' } : { role: 'raw_grain', workshopCode: 'raw_grain' };
    next();
  });
  app.use(require('../src/routes/parts'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const manager = await fetch(`${base}/dashboard`);
    assert.equal(manager.status, 200);
    assert.equal((await manager.json()).data.dashboard.pendingApproval, 2);
    assert.deepEqual(pendingQueries[0], ['raw_grain']);
    const system = await fetch(`${base}/dashboard`, { headers: { 'x-role': 'system' } });
    assert.equal(system.status, 200);
    assert.equal((await system.json()).data.dashboard.pendingApproval, 5);
    assert.deepEqual(pendingQueries[1], []);
  } finally {
    pool.query = saved;
    await new Promise(resolve => server.close(resolve));
  }
});

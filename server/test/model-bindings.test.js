'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { once } = require('node:events');
const { pool } = require('../src/db');
const { enforceReadOnly } = require('../src/workshop-scope');
const { readModelLedger } = require('../src/model-ledger-import');

test('named-model HTTP binding preserves inventory, checks scope and rolls back complete batches', async () => {
  const parts = [{ id: 1, code: 'TEST-1', bound_model_id: 1 }, { id: 2, code: 'TEST-2', bound_model_id: 1 }];
  const inventory = [{ part_id: 1, workshopCode: 'raw_grain', quantity: 13, price: 7, location: 'TEST' }, { part_id: 2, workshopCode: 'raw_grain', quantity: 17, price: 9, location: 'TEST-2' }];
  const models = [{ id: 1, name: '公共模型', workshop_code: null }, { id: 2, name: '制曲专用', workshop_code: 'qu_making' }];
  const initialInventory = structuredClone(inventory);
  let snapshot, writes = 0;
  const db = {
    async query(sql, params = []) {
      if (sql.startsWith('SELECT id FROM parts')) return [parts.filter(p => params.includes(p.id)).map(p => ({ id: p.id }))];
      if (sql.startsWith('SELECT part_id')) return [inventory.filter(p => params.includes(p.part_id))];
      if (sql.includes('FROM part_models')) return [models.filter(m => sql.includes('BINARY name') ? m.name === params[0] : m.id === params[0])];
      if (sql.startsWith('SELECT bound_model_id')) return [parts.filter(p => p.id === params[0])];
      if (sql.includes('FROM inventory')) return [inventory.filter(p => p.part_id === params[0])];
      if (sql.startsWith('UPDATE parts SET bound_model_id')) { writes++; parts.find(p => p.id === params[1]).bound_model_id = params[0]; return [{ affectedRows: 1 }]; }
      throw new Error('Unexpected query: ' + sql);
    },
    async beginTransaction() { snapshot = structuredClone(parts); },
    async commit() {},
    async rollback() { parts.splice(0, parts.length, ...snapshot); },
    release() {}
  };
  const saved = { query: pool.query, getConnection: pool.getConnection };
  pool.query = db.query;
  pool.getConnection = async () => db;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, role: req.get('x-test-role') || 'admin' }; next(); });
  app.use(enforceReadOnly);
  app.use(require('../src/routes/parts'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = (body, role = 'admin') => fetch(`http://127.0.0.1:${server.address().port}/parts/batch-model`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
  try {
    assert.equal((await send({ partIds: [1], modelId: null }, 'viewer')).status, 403);
    for (const id of [true, -1, 1.5, '1garbage', 9007199254740992]) assert.equal((await send({ partIds: [1], modelId: id })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await send({ partIds: [1], modelId: null }, 'raw_grain')).status, 200);
    assert.equal(parts[0].bound_model_id, null);
    assert.equal((await send({ partIds: [1], modelId: 1 }, 'qu_making')).status, 403);
    assert.equal((await send({ partIds: [1], modelId: 1 }, 'raw_grain')).status, 200);
    // The first master changes before the second fails. Neither change may commit.
    inventory[0].workshopCode = 'qu_making';
    assert.equal((await send({ partIds: [1, 2], modelId: 2 })).status, 403);
    assert.deepEqual(parts.map(p => p.bound_model_id), [1, 1]);
    inventory[0].workshopCode = 'raw_grain';
    inventory.push({ part_id: 1, workshopCode: 'qu_making', quantity: 3 });
    assert.equal((await send({ partIds: [1], modelId: null }, 'raw_grain')).status, 403);
    assert.equal((await send({ partIds: [1], modelId: 2 })).status, 403);
    inventory.pop();
    assert.equal((await send({ partIds: [1, 2], modelId: null })).status, 200);
    assert.deepEqual(inventory, initialInventory);
  } finally {
    Object.assign(pool, saved);
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
});

test('model-only workbook reader retains blank bindings and rejects duplicate or missing codes', async () => {
  const workbook = async rows => { const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('模型绑定'); rows.forEach(row => sheet.addRow(row)); return Buffer.from(await wb.xlsx.writeBuffer()); };
  const rows = [['物料编码', '模型名称', '库存量'], ['TEST-1', '公共模型', 999], ['TEST-2', '', 999]];
  assert.deepEqual(await readModelLedger(await workbook(rows)), [{ code: 'TEST-1', modelName: '公共模型', sourceRow: 2 }, { code: 'TEST-2', modelName: '', sourceRow: 3 }]);
  await assert.rejects(readModelLedger(await workbook([...rows, ['TEST-1', '公共模型']])), /重复/);
  await assert.rejects(readModelLedger(await workbook([rows[0], ['', '公共模型']])), /缺少物料编码/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const ExcelJS = require('exceljs');
const { once } = require('node:events');
const { pool } = require('../src/db');

test('real XLSX uploads preview inventory and equipment using read-excel-file 9 row API', async () => {
  const savedQuery = pool.query;
  pool.query = async () => { throw new Error('Preview unexpectedly accessed the database'); };
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 1, role: 'admin' }; next(); });
  app.use(require('../src/routes/parts'));
  app.use(require('../src/routes/operations'));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ msg: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = async (endpoint, rows) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('导入');
    rows.forEach(row => sheet.addRow(row));
    const form = new FormData();
    form.append('workshopCode', 'qu_making');
    form.append('file', new Blob([await workbook.xlsx.writeBuffer()]), 'ledger.xlsx');
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method: 'POST', body: form });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const parts = await send('/parts/import-preview', [['物料编码', '物料名称', '单位', '库存量'], ['TEST-1', '测试备件', '个', 4]]);
    assert.equal(parts.success, true);
    assert.equal(parts.data.total, 1);
    const invalidNumeric = await send('/parts/import-preview', [['物料编码', '物料名称', '不含税单价', '最高储备'], ['TEST-2', '测试备件', '未知金额', -2]]);
    assert.equal(invalidNumeric.success, false);
    assert.deepEqual(invalidNumeric.data.errors.map(error => error.field).sort(), ['不含税单价','最高储备'].sort());
    const equipment = await send('/equipment/import-preview', [['设备型号'], ['测试设备']]);
    assert.equal(equipment.success, true);
    assert.equal(equipment.data.modelCount, 1);
    const invalid = await send('/equipment/import-preview', [['无效列'], ['测试设备']]);
    assert.equal(invalid.success, false);
    assert.equal(invalid.data.errorCount, 1);
  } finally { pool.query = savedQuery; await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { duplicateLocationErrors } = require('../src/part-import-validation');
const { makePartsErrorWorkbook } = require('../src/import-workbook');

test('duplicate locations inside one workbook reject every conflicting row', () => {
  const errors = duplicateLocationErrors([
    { sourceRow: 2, materialCode: 'A-001', locationCode: '011401' },
    { sourceRow: 5, materialCode: 'B-002', locationCode: '011401' },
    { sourceRow: 6, materialCode: 'C-003', locationCode: '011402' }
  ]);
  assert.deepEqual(errors.map(item => item.row), [2, 5]);
  assert.ok(errors.every(item => item.reason.includes('011401')));
});

test('an existing location may update the same material but rejects a different material', () => {
  const occupants = [{ locationCode: '011401', materialCode: 'A-001' }];
  assert.equal(duplicateLocationErrors([
    { sourceRow: 2, materialCode: 'A-001', locationCode: '011401' }
  ], occupants).length, 0);

  const errors = duplicateLocationErrors([
    { sourceRow: 3, materialCode: 'B-002', locationCode: '011401' }
  ], occupants);
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /A-001/);
});

test('free-text storage without a location code is not treated as a duplicate shelf slot', () => {
  const errors = duplicateLocationErrors([
    { sourceRow: 2, materialCode: 'A-001', locationCode: '' },
    { sourceRow: 3, materialCode: 'B-002', locationCode: null }
  ]);
  assert.equal(errors.length, 0);
});

test('error workbook keeps every original row and adds actionable columns', async () => {
  const source = new ExcelJS.Workbook();
  const sheet = source.addWorksheet('原粮车间备件台账');
  sheet.addRow(['物料编码', '物料名称', '六位库位码']);
  sheet.addRow(['A-001', '轴承A', '011401']);
  sheet.addRow(['B-002', '轴承B', '011401']);
  const sourceBuffer = await source.xlsx.writeBuffer();
  const reportBuffer = await makePartsErrorWorkbook(sourceBuffer, [{
    row: 3,
    field: '六位库位码',
    reason: '货位011401重复',
    suggestion: '改为未占用货位'
  }]);
  const report = new ExcelJS.Workbook();
  await report.xlsx.load(reportBuffer);
  const result = report.worksheets[0];
  assert.equal(result.rowCount, 3);
  assert.equal(result.getRow(2).getCell(4).value, '通过');
  assert.equal(result.getRow(3).getCell(4).value, '需修改');
  assert.match(String(result.getRow(3).getCell(5).value), /011401/);
  assert.match(String(result.getRow(3).getCell(6).value), /未占用货位/);
});

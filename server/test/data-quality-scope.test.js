const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const utils = require('../src/utils');

function loadRoute(rows = []) {
  const handlers = new Map();
  const queries = [];
  const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (url, ...chain) => handlers.set(`${method} ${url}`, chain.at(-1))]));
  router.use = () => {};
  const multer = () => ({ single: () => () => {} });
  multer.memoryStorage = () => ({});
  const mocks = {
    express: { Router: () => router }, crypto: require('node:crypto'), path, multer,
    'read-excel-file/node': () => {},
    '../db': { pool: { query: async (sql, params) => { queries.push({ sql, params }); return [rows]; } } },
    '../utils': { ...utils, asyncHandler: fn => fn },
    '../workshop-scope': require('../src/workshop-scope'),
    '../inventory-guards': {}, '../warehouse-join': { warehouseJoin: () => '' },
    '../data-quality': require('../src/data-quality'), '../movement-metadata': {}, '../import-workbook': {}
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/operations.js'), 'utf8');
  vm.runInNewContext(`${source}\nmodule.exports={buildQualityScope};`, { require: name => mocks[name], module, console, Buffer });
  return { handlers, queries, ...module.exports };
}

test('data quality uses all six parameterized inventory filters before summary and issue selection', async () => {
  const row = { id: 1, partId: 10, materialCode: 'A1', materialDesc: '轴承', workshopCode: 'raw_grain', unit: null, totalStock: 0, reorderPoint: null, maxStock: 10, price: 0, locationType: 'free_text', locationNote: '待检区', lastInventoryDate: '2026-09-05' };
  const app = loadRoute([row]);
  const query = { workshopCode: 'raw_grain', warehouseAreaName: '五粮货区', partType: '易损件', searchKeyword: ' 轴承 ', stockStatus: 'zero', lowStock: '1', issueType: 'missing_unit', page: '1', pageSize: '20' };
  let response;
  await app.handlers.get('get /data-quality')({ query }, { json: result => { response = result; } });
  const { sql, params } = app.queries[0];
  assert.match(sql, /w\.name = \? OR i\.warehouse = \?/);
  assert.match(sql, /TRIM\(p\.part_type\)/);
  assert.match(sql, /p\.brand LIKE \?/);
  assert.match(sql, /i\.quantity <= 0/);
  assert.match(sql, /IS NOT NULL AND i\.quantity <= COALESCE/);
  assert.doesNotMatch(sql, /五粮货区|易损件|轴承/);
  assert.deepEqual(Array.from(params).slice(0, 4), ['raw_grain', '五粮货区', '五粮货区', '易损件']);
  assert.equal(params.filter(value => value === '%轴承%').length, 14);
  assert.equal(response.summary.total, 1);
  assert.equal(response.summary.issueGroups.find(item => item.key === 'missing_unit').count, 1);
  assert.equal(response.total, 1);
  assert.ok(response.data[0].issueDetails.some(item => item.key === 'missing_unit'));
  // Missing units must reach profiling as NULL rather than the display label.
  assert.doesNotMatch(sql, /'未标单位'\) AS unit/);
});

test('quality health predicates distinguish zero, low, normal and positive unconfigured stock', () => {
  const { buildQualityScope } = loadRoute();
  assert.match(buildQualityScope({ stockStatus: 'zero' }).sql, /i\.quantity <= 0/);
  assert.match(buildQualityScope({ stockStatus: 'low' }).sql, /i\.quantity > 0 AND .*IS NOT NULL AND i\.quantity <=/);
  assert.match(buildQualityScope({ stockStatus: 'normal' }).sql, /i\.quantity > 0 AND .*IS NOT NULL AND i\.quantity >/);
  assert.match(buildQualityScope({ stockStatus: 'unconfigured' }).sql, /i\.quantity > 0 AND .*IS NULL/);
  assert.equal(buildQualityScope({}).sql, '');
});

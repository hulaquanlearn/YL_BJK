const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyIntent,
  findShelfAreas,
  parseInventoryQuery
} = require('../../miniprogram/services/assistant-query');

test('classifyIntent routes inventory, maintenance, greeting and unrelated questions', () => {
  assert.equal(classifyIntent('502000268还有多少库存'), 'inventory');
  assert.equal(classifyIntent('变频器故障代码7492怎么排查'), 'maintenance');
  assert.equal(classifyIntent('你好'), 'greeting');
  assert.equal(classifyIntent('今天股票怎么样'), 'restricted');
});

test('parseInventoryQuery extracts known area, shelf, layer and keyword', () => {
  const parsed = parseInventoryQuery(
    '查询五粮货区4号货架第2层断路器库存',
    ['蒸糠工段', '破曲工段', '五粮货区']
  );
  assert.equal(parsed.area, '五粮货区');
  assert.equal(parsed.shelf, '4');
  assert.equal(parsed.layer, '2');
  assert.equal(parsed.keyword, '断路器');
});

test('parseInventoryQuery recognizes summary and low-stock intents', () => {
  assert.equal(parseInventoryQuery('备件库内有多少种备件').summaryType, 'partTypes');
  assert.equal(parseInventoryQuery('当前库存总量是多少').summaryType, 'totalStock');
  assert.equal(parseInventoryQuery('查询五粮货区低库存补货清单', ['五粮货区']).lowStock, true);
});

test('findShelfAreas exposes ambiguous shelves instead of guessing an area', () => {
  const shelfMap = {
    蒸糠工段: ['1号', '4号'],
    破曲工段: ['4号', '5号'],
    五粮货区: ['7号']
  };
  assert.deepEqual(findShelfAreas('4', shelfMap), ['蒸糠工段', '破曲工段']);
  assert.deepEqual(findShelfAreas('7号货架', shelfMap), ['五粮货区']);
});

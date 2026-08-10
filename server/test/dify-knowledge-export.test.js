const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildInventoryKnowledge,
  formatDirection,
  formatLocation,
  stockStatus,
  summarizeByAreaAndPartType,
  summarizeByPartType,
  summarizeInventory
} = require('../src/dify-knowledge-export');

const rows = [
  {
    id: 1,
    materialCode: '502000268',
    materialDesc: '施耐德小型断路器',
    spec: 'IC65N C10A',
    unit: '个',
    totalStock: 1,
    safetyStock: 2,
    maxStock: 6,
    partType: '易损件',
    warehouseAreaName: '破曲货区',
    shelf: 4,
    position: 2,
    layer: 2,
    location: 2,
    locationCode: '042202'
  },
  {
    id: 2,
    materialCode: '502000269',
    materialDesc: '测试轴承',
    unit: '套',
    totalStock: 0,
    safetyStock: 1,
    partType: '质保件',
    warehouseAreaName: '五粮货区',
    shelf: 7,
    position: 1,
    layer: 4,
    location: 6
  }
];

test('maps shelf directions and formats the physical location', () => {
  assert.equal(formatDirection(1), '东侧');
  assert.equal(formatDirection('2'), '西侧');
  assert.match(formatLocation(rows[0]), /4号货架 \/ 西侧 \/ 2层 \/ 2货位/);
  assert.match(formatLocation(rows[0]), /042202/);
});

test('calculates stock status and inventory summary', () => {
  assert.equal(stockStatus(rows[0]), '低库存');
  assert.equal(stockStatus(rows[1]), '零库存');
  assert.deepEqual(summarizeInventory(rows), {
    recordCount: 2,
    partTypeCount: 2,
    lowStock: 2,
    zeroStock: 1,
    unitTotals: [['个', 1], ['套', 0]],
    areaCounts: [['破曲货区', 1], ['五粮货区', 1]]
  });
});

test('precalculates part type and area statistics using distinct material codes', () => {
  const duplicateLocation = {
    ...rows[0],
    id: 3,
    totalStock: 2,
    location: 3,
    locationCode: '042203'
  };
  assert.deepEqual(summarizeByPartType([...rows, duplicateLocation]), [
    {
      partType: '易损件',
      partCount: 1,
      normalStock: 1,
      lowStock: 0,
      zeroStock: 0,
      safetyStockUnset: 0
    },
    {
      partType: '质保件',
      partCount: 1,
      normalStock: 0,
      lowStock: 0,
      zeroStock: 1,
      safetyStockUnset: 0
    }
  ]);
  assert.deepEqual(summarizeByAreaAndPartType([...rows, duplicateLocation]), [
    { warehouseArea: '破曲货区', partType: '易损件', partCount: 1 },
    { warehouseArea: '五粮货区', partType: '质保件', partCount: 1 }
  ]);
});

test('builds retrievable summary, replenishment and part records', () => {
  const content = buildInventoryKnowledge(rows, {
    snapshotTime: '2026-07-30 10:00:00',
    lowStockPageSize: 1
  });
  assert.match(content, /数据性质：离线知识库快照，不是实时数据/);
  assert.match(content, /备件种类：2/);
  assert.match(content, /# 备件类型统计/);
  assert.match(content, /\| 易损件 \| 1 \|/);
  assert.match(content, /# 货区与备件类型统计/);
  assert.match(content, /缺料与补货清单（第 1\/2 页）/);
  assert.match(content, /\| 物料编码 \| 名称 \/ 规格 \| 当前库存 \|/);
  assert.match(content, /生成缺料表格/);
  assert.match(content, /物料编码：502000268/);
  assert.match(content, /具体位置：4号货架 \/ 西侧 \/ 2层 \/ 2货位/);
  assert.match(content, /数据快照时间：2026-07-30 10:00:00/);
});

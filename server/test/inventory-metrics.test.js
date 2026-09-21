const test=require('node:test');const assert=require('node:assert/strict');
const {summarizeInventory,summarizeInventoryScopes}=require('../src/inventory-metrics');
test('overview and statistics count distinct parts and preserve unit dimensions',()=>{
  const rows=[{partId:1,partType:'易损件',unit:'个',quantity:2,price:10,safetyStock:2},{partId:1,partType:'易损件',unit:'个',quantity:3,price:12,safetyStock:2},{partId:2,partType:'质保件',unit:'米',quantity:5,price:null,safetyStock:null}];
  const m=summarizeInventory(rows);assert.equal(m.partTypes,2);assert.equal(m.inventoryRecords,3);assert.equal(m.totalValue,56);assert.equal(m.missingPrice,1);assert.equal(m.lowStock,1);
  assert.equal(m.zeroStock+m.lowPositiveStock+m.healthyStock+m.unconfiguredStock,3);
  assert.deepEqual(m.unitTotals,[{unit:'个',total:5},{unit:'米',total:5}]);assert.equal(m.typeSummaries.find(t=>t.partType==='易损件').partTypes,1);
  assert.equal(m.typeSummaries.reduce((s,t)=>s+t.totalValue,0),m.totalValue);
});
test('zero price is valid, unknown price and empty type are explicit',()=>{
  const m=summarizeInventory([{partId:1,quantity:0,price:0},{partId:2,quantity:2,price:'',unit:''}]);assert.equal(m.missingPrice,1);assert.equal(m.typeSummaries[0].partType,'未填写');assert.equal(m.unitTotals[0].unit,'未标单位');assert.equal(summarizeInventory().partTypes,0);
});
test('missing reorder point includes zero stock while health segments stay mutually exclusive',()=>{
  const m=summarizeInventory([{partId:1,quantity:0,safetyStock:null},{partId:2,quantity:2,safetyStock:null},{partId:3,quantity:1,safetyStock:0}]);
  assert.equal(m.missingReorderPoint,2);assert.equal(m.unconfiguredStock,1);assert.equal(m.zeroStock,1);assert.equal(m.healthyStock,1);
  assert.equal(m.zeroStock+m.lowPositiveStock+m.healthyStock+m.unconfiguredStock,3);
});
test('scoped subset excludes unrelated warehouse values',()=>{
  const rows=[{partId:1,quantity:2,price:3,area:'A'},{partId:2,quantity:10,price:100,area:'B'}];assert.equal(summarizeInventory(rows.filter(r=>r.area==='A')).totalValue,6);
});
test('scope breakdown keeps workshop and area totals separate',()=>{
  const rows=[
    {partId:1,partType:'易损件',unit:'个',quantity:2,price:10,workshopCode:'raw_grain',warehouseAreaName:'五粮货区'},
    {partId:2,partType:'质保件',unit:'米',quantity:3,price:20,workshopCode:'raw_grain',warehouseAreaName:'五粮货区'},
    {partId:3,partType:'易损件',unit:'个',quantity:4,price:5,workshopCode:'brewing',warehouseAreaName:'酿酒货区'}
  ];
  const scopes=summarizeInventoryScopes(rows,{raw_grain:'原粮车间',brewing:'酿酒车间'});
  assert.equal(scopes.length,2);assert.equal(scopes.find(item=>item.workshopCode==='raw_grain').totalValue,80);
  assert.equal(scopes.find(item=>item.workshopCode==='raw_grain').typeSummaries.find(item=>item.partType==='质保件').partTypes,1);
});

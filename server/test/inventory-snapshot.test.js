const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInventoryOrderLists, assertInventorySnapshots } = require('../src/inventory-guards');

test('a count made before incoming stock cannot overwrite the newer inventory', () => {
  const count = normalizeInventoryOrderLists([{partId:'1',snapshotStock:10}], [{partId:'1',snapshotStock:999,actualStock:8}]);
  assert.throws(() => assertInventorySnapshots(count,[{id:1,quantity:12}]), error => error.status === 409);
  assert.equal(count.normalizedAbnormalList[0].snapshotStock,10);
  assert.doesNotThrow(() => assertInventorySnapshots(count,[{id:1,quantity:10}]));
});
test('every count including normal rows requires a finite snapshot and active inventory', () => {
  for (const value of [undefined,null,'',false,'oops',-1]) {
    assert.throws(() => normalizeInventoryOrderLists([{partId:1,snapshotStock:value}],[]), error => error.status === 400);
  }
  const count=normalizeInventoryOrderLists([{partId:1,sysStockNum:0}],[]);
  assert.equal(count.normalizedAllList[0].snapshotStock,0);
  assert.throws(()=>assertInventorySnapshots(count,[]), error=>error.status===409);
  assert.throws(()=>assertInventorySnapshots(count,[{id:1,quantity:0,active:0}]), error=>error.status===409);
});

test('blank or non-numeric actual counts cannot become zero while explicit zero and fractions remain valid', () => {
  for (const value of [undefined,null,'',' ',false,[],{},NaN,Infinity,-1]) {
    assert.throws(()=>normalizeInventoryOrderLists([{partId:1,snapshotStock:2}],[{partId:1,actualStock:value}]),error=>error.status===400);
  }
  for(const value of [0,'0',.5,'0.0001']) {
    const result=normalizeInventoryOrderLists([{partId:1,snapshotStock:2}],[{partId:1,actualStock:value}]);
    assert.equal(result.normalizedAbnormalList[0].actualStock,Number(value));
  }
});

test('future equal counts clear false abnormal flags while preserving every physical count', () => {
  const quantities = [[202, 8], [228, 3], [229, 4], [230, 2], [293, 6], [309, 7], [725, 1]];
  const all = quantities.map(([partId, snapshotStock]) => ({ partId, snapshotStock }));
  const normalized = normalizeInventoryOrderLists(all, all.map(item => ({ ...item, actualStock: String(item.snapshotStock) })));
  assert.equal(normalized.normalizedAbnormalList.length, 0); assert.equal(normalized.abnormalIdSet.size, 0);
  assert.deepEqual(normalized.normalizedAllList.map(item => item.actualStock), quantities.map(([, value]) => value));
  for (const [id, value] of quantities) assert.equal(normalized.actualQuantityById.get(id), value);
});
test('all-row physical quantities produce real differences and conflicting duplicate evidence is rejected', () => {
  const result = normalizeInventoryOrderLists([{ partId: 1, snapshotStock: 3, actualStock: 0 }, { partId: 2, snapshotStock: .3, actualStock: .1 + .2 }], []);
  assert.equal(result.normalizedAbnormalList.length, 1); assert.equal(result.normalizedAbnormalList[0].actualStock, 0); assert.equal(result.actualQuantityById.get(2), .1 + .2);
  assert.throws(() => normalizeInventoryOrderLists([{ partId: 1, snapshotStock: 3, actualStock: 2 }], [{ partId: 1, actualStock: 1 }]), /实盘数量记录不一致/);
});

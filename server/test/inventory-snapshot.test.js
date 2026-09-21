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

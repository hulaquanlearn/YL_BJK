import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryCountSummary } from '../src/utils/inventory-count.mjs'

test('the reported seven approved equal rows show normal and zero total differences', () => {
  const quantities = [[202, 8], [228, 3], [229, 4], [230, 2], [293, 6], [309, 7], [725, 1]]
  const all = quantities.map(([partId, value]) => ({ partId: String(partId), snapshotStock: value, sysStockNum: value, sysStockUnit: '个' }))
  const order = { approveStatus: '已通过', inventoryAllList: all, abnormalList: all.map(row => ({ ...row, actualStock: row.snapshotStock })) }
  const before = JSON.stringify(order), result = inventoryCountSummary(order)
  assert.equal(result.differenceCount, 0); assert.equal(result.unverifiedCount, 0)
  assert.ok(result.rows.every(row => row.status === 'normal' && row.actual === row.snapshot))
  assert.equal(JSON.stringify(order), before)
})
test('a filtered API abnormal list retains actual values on every all-list row', () => {
  const result = inventoryCountSummary({ inventoryAllList: [{ partId: 1, snapshotStock: '3.0000', actualStock: 3 }, { partId: 2, snapshotStock: 5, actualStock: 4 }], abnormalList: [{ partId: 2, actualStock: 4 }] })
  assert.equal(result.differenceCount, 1); assert.equal(result.rows[0].actual, 3); assert.equal(result.rows[1].status, 'difference')
})
test('zero and decimal comparisons preserve true differences and unreadable data stays unverified', () => {
  const result = inventoryCountSummary({ inventoryAllList: [{ partId: 1, snapshotStock: 1 }, { partId: 2, snapshotStock: .3 }, { partId: 3, snapshotStock: null }, { partId: 4, snapshotStock: 2 }], abnormalList: [{ partId: 1, actualStock: 0 }, { partId: 2, actualStock: .1 + .2 }, { partId: 3, actualStock: 1 }, { partId: 4, actualStock: '' }] })
  assert.equal(result.differenceCount, 1); assert.equal(result.unverifiedCount, 2); assert.equal(result.rows[0].actual, 0); assert.equal(result.rows[1].status, 'normal')
})
test('approved current stock never replaces the original count snapshot', () => {
  const result = inventoryCountSummary({ inventoryAllList: [{ partId: 1, snapshotStock: 10, totalStock: 8, currentStock: 8 }], abnormalList: [{ partId: 1, actualStock: 8 }] })
  assert.equal(result.differenceCount, 1); assert.equal(result.rows[0].snapshot, 10); assert.equal(result.rows[0].actual, 8)
})

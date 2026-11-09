import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedPage, createListViewState, selectedRowsFromIds, validStockCount } from '../src/utils/list-view-state.mjs'
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values } }

test('navigation state stores only whitelisted query primitives, selected IDs and bounded scroll', () => {
  const storage = memory(), state = createListViewState({ view: 'inventory', user: { id: 1, role: 'admin' }, queryKeys: ['page', 'searchKeyword'], storage, now: () => 100 })
  state.save({ query: { page: 4, searchKeyword: '轴承', totalStock: 17, credentials: 'private', nested: { value: 1 } }, selectedIds: [2, '2', 3, null, {}], scrollTop: 200, rows: [{ totalStock: 17 }] })
  assert.deepEqual(state.read(), { query: { page: 4, searchKeyword: '轴承' }, selectedIds: ['2', '3'], scrollTop: 200 })
  assert.doesNotMatch([...storage.values.values()].join(), /totalStock|credentials|rows|private/)
  assert.equal(boundedPage('4'), 4); assert.equal(boundedPage(-1), 1); assert.equal(boundedPage('bad'), 1)
})
test('navigation state is isolated by user, permission role, workshop and originating scope, and expires', () => {
  const storage = memory(); let time = 100
  const options = { view: 'replenishment', user: { id: 1, role: 'admin' }, scope: { workshopCode: 'raw_grain' }, queryKeys: ['page'], storage, now: () => time, maxAge: 100 }
  const state = createListViewState(options); state.save({ query: { page: 2 } })
  for (const changed of [{ user: { id: 2, role: 'admin' } }, { user: { id: 1, role: 'viewer' } }, { user: { id: 1, role: 'admin', workshopCode: 'brewing' } }, { scope: {} }]) assert.equal(createListViewState({ ...options, ...changed }).read(), null)
  time = 201; assert.equal(state.read(), null)
  storage.setItem(state.key, 'not JSON'); assert.equal(state.read(), null)
})
test('selection restoration resolves IDs against latest rows and cannot revive removed inventory snapshots', () => {
  const latest = [{ _id: 2, currentStock: 5, suggestedQuantity: 7 }, { _id: 4, currentStock: 3 }]
  assert.deepEqual(selectedRowsFromIds(['2', '3'], latest), [latest[0]])
  for (const value of [null, undefined, '', ' ', NaN, Infinity, -1, true, 100000000]) assert.equal(validStockCount(value), false, String(value))
  for (const value of [0, '0', .5, 12, 99999999]) assert.equal(validStockCount(value), true, String(value))
})

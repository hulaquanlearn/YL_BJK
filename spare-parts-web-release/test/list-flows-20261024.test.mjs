import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { collectParts } from '../src/utils/collect-parts.mjs'
import { inventoryScope, inventoryRouteQuery } from '../src/utils/inventory-scope.mjs'
import * as navigation from '../src/utils/list-view-state.mjs'
import * as inventoryCounting from '../src/utils/inventory-count.mjs'
function subject(view, names, mocks = {}) {
  const saved = [], messages = [], mounted = [], guards = [], scroll = []
  const context = {
    isAppSurface:()=>false,navigator:{userAgent:'Mozilla Windows Chrome'},
    console, Promise, Date, Number, JSON, Set, Map, collectParts, inventoryScope, inventoryRouteQuery, ...navigation, ...inventoryCounting,
    ref: value => ({ value }), reactive: value => value, computed: get => ({ get value() { return get() } }), nextTick: async () => {},
    onMounted: fn => mounted.push(fn), onBeforeUnmount() {}, onBeforeRouteLeave: fn => guards.push(fn),
    useRoute: () => ({ query: {} }), useRouter: () => ({ push() {}, replace() {} }),
    getUser: () => ({ id: 1, role: 'admin', displayName: '管理员' }), canEditAnyWorkshop: () => true, userWorkshopCode: () => '',
    window: { scrollY: 55, scrollTo: (...args) => scroll.push(args), addEventListener() {}, removeEventListener() {} },
    createListViewState: () => ({ read: () => null, save: value => saved.push(value) }),
    ElMessage: Object.fromEntries(['warning', 'success', 'error', 'info'].map(name => [name, text => messages.push([name, text])])),
    ElMessageBox: { confirm: async () => {}, prompt: async () => ({ value: '' }) },
    getFilters: async () => ({ data: {} }), getParts: async () => ({ data: [], total: 0 }),
    getInventoryOrders: async () => ({ data: [], total: 0 }), getMovementReasons: async () => ({ data: { in: [], out: [] } }),
    ...mocks
  }
  const source = fs.readFileSync(new URL(`../src/views/${view}.vue`, import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
  vm.runInNewContext(`${source}\nglobalThis.subject={${names}}`, context)
  return { ...context.subject, saved, messages, mounted, guards, scroll }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('clearing movement dates queries all dates; reason dictionary failure does not prevent the ledger loading', async () => {
  const calls = []
  const s = subject('Movements', 'query,dateRange,search,load,list,loadError,loadReasons,reasonsError', { getStockMovements: async params => { calls.push(params); return { data: [{ id: 1 }], total: 1 } }, getMovementReasons: async () => { throw Error('offline') } })
  s.dateRange.value = null
  await s.search()
  assert.equal(calls[0].dateFrom, undefined); assert.equal(calls[0].dateTo, undefined)
  assert.deepEqual(Array.from(s.dateRange.value), []); assert.equal(s.list.value[0].id, 1)
  await s.loadReasons(); assert.equal(s.reasonsError.value, true)
  assert.equal(s.list.value.length, 1)
  await s.mounted[0](); assert.equal(calls.length, 2)
})
test('movement failures cannot appear as empty success or overwrite a later successful query', async () => {
  const first = deferred(), second = deferred(); let calls = 0
  const s = subject('Movements', 'load,list,total,loadError', { getStockMovements: () => (++calls === 1 ? first : second).promise })
  const old = s.load(), current = s.load(); second.resolve({ data: [{ id: 2 }], total: 1 }); await current
  first.reject(Error('old failed')); await old
  assert.equal(s.list.value[0].id, 2); assert.equal(s.loadError.value, '')
  const failed = subject('Movements', 'load,list,total,loadError', { getStockMovements: async () => { throw Error('offline') } })
  failed.list.value = [{ id: 9 }]; await failed.load(); assert.equal(failed.list.value.length, 0); assert.match(failed.loadError.value, /读取失败/)
})
test('blank actual inventory counts are blocked before payload creation; explicit zero remains valid', async () => {
  const payloads = []
  const s = subject('Check', 'form,selectedParts,submitOrder', { createInventoryOrder: async payload => payloads.push(payload) })
  s.form.inventoryUser = '管理员'; s.form.inventoryDate = '2026-10-24'
  const part = { _id: 'a', materialDesc: '轴承', totalStock: 5, actualStock: null }
  s.selectedParts.value = [part]
  for (const invalid of [null, undefined, '', ' ', NaN, Infinity, -1]) { part.actualStock = invalid; await s.submitOrder() }
  assert.equal(payloads.length, 0); assert.match(s.messages.at(-1)[1], /明确输入 0/)
  part.actualStock = 0; await s.submitOrder()
  assert.equal(payloads.length, 1); assert.equal(payloads[0].abnormalList[0].actualStock, 0)
})
test('closing or navigating away from dirty inventory preserves inputs unless discard is confirmed; submitting cannot close twice', async () => {
  let allow = false
  const s = subject('Check', 'openCreate,closeCreate,createVisible,selectedParts,submitting', { ElMessageBox: { confirm: async () => { if (!allow) throw Error('cancel') } } })
  await s.openCreate(); s.selectedParts.value = [{ _id: 1, actualStock: 2 }]
  await s.closeCreate(); assert.equal(s.createVisible.value, true); assert.equal(s.selectedParts.value.length, 1)
  assert.equal(await s.guards[0](), false)
  allow = true; s.submitting.value = true; await s.closeCreate(); assert.equal(s.createVisible.value, true)
  s.submitting.value = false; await s.closeCreate(); assert.equal(s.createVisible.value, false)
})
test('repeated inventory submit clicks cannot create two orders while the first request is pending', async () => {
  const pending = deferred(); let submissions = 0
  const s = subject('Check', 'form,selectedParts,submitOrder,submitting', { createInventoryOrder: () => { submissions++; return pending.promise } })
  s.form.inventoryUser = '管理员'; s.form.inventoryDate = '2026-10-24'; s.selectedParts.value = [{ _id: 1, totalStock: 2, actualStock: 1 }]
  const first = s.submitOrder(); await s.submitOrder()
  assert.equal(submissions, 1); assert.equal(s.submitting.value, true)
  pending.resolve({ success: true }); await first
  assert.equal(s.submitting.value, false)
})
test('replenishment restores filters and page but rehydrates selected IDs with current server quantities', async () => {
  const requests = [], selected = []
  const state = { query: { page: 2, pageSize: 50, workshopCode: 'raw_grain', searchKeyword: '轴承' }, selectedIds: ['1', 'removed'], scrollTop: 300 }
  const s = subject('Replenishment', 'query,load,list,selectedRows,tableRef,loadError', {
    createListViewState: () => ({ read: () => state, save() {} }),
    getReplenishment: async params => { requests.push(params); return params.page === 1 ? { data: [{ _id: 1, currentStock: 4, suggestedQuantity: 6 }], total: 1 } : { data: [{ _id: 2, currentStock: 0 }], total: 51 } }
  })
  s.tableRef.value = { clearSelection() {}, toggleRowSelection: row => selected.push(row) }
  await s.load()
  assert.equal(requests[0].page, 2); assert.equal(requests[0].searchKeyword, '轴承'); assert.equal(requests[1].page, 1)
  assert.equal(s.selectedRows.value.length, 1); assert.equal(s.selectedRows.value[0].currentStock, 4); assert.equal(selected[0].suggestedQuantity, 6)
  assert.deepEqual(s.scroll[0], [0, 300]); assert.match(s.messages[0][1], /取消勾选/)
})
test('failed replenishment selection refresh clears stale exports and retains IDs for retry', async () => {
  let succeed = false
  const s = subject('Replenishment', 'load,list,total,selectedRows,loadError', {
    createListViewState: () => ({ read: () => ({ query: {}, selectedIds: ['1'], scrollTop: 0 }), save() {} }),
    getReplenishment: async () => { if (!succeed) throw Error('offline'); return { data: [{ _id: 1, currentStock: 2 }], total: 1 } }
  })
  s.selectedRows.value = [{ _id: 1, currentStock: 10 }]; await s.load()
  assert.equal(s.selectedRows.value.length, 0); assert.equal(s.list.value.length, 0); assert.match(s.loadError.value, /尚未核实/)
  succeed = true; await s.load(); assert.equal(s.selectedRows.value[0].currentStock, 2); assert.equal(s.loadError.value, '')
})
test('a shrinking last page moves back once, and inconsistent empty pages cannot trigger an infinite retry loop', async () => {
  for (const [view, api] of [['Movements', 'getStockMovements'], ['Replenishment', 'getReplenishment'], ['Check', 'getInventoryOrders']]) {
    const requests = []
    const s = subject(view, 'query,load,list,loadError', { [api]: async params => { requests.push(params.page); if (requests.length > 3) throw Error('runaway retry'); return { data: [], total: 21, summary: {} } } })
    s.query.page = 5; s.query.pageSize = 20
    await s.load()
    assert.deepEqual(requests, [5, 2], view); assert.equal(s.query.page, 2, view); assert.match(s.loadError.value, /暂未同步/, view)
  }
})
test('count scope and workshop changes retain entered counts when cancelled, and only confirmed switches clear them', async () => {
  let allow = false
  const s = subject('Check', 'openCreate,scopeChanged,workshopChanged,form,selectedParts', { ElMessageBox: { confirm: async () => { if (!allow) throw Error('cancel') } } })
  await s.openCreate(); s.selectedParts.value = [{ _id: 1, actualStock: .5 }]
  await s.scopeChanged('area'); assert.equal(s.form.scopeType, 'all'); assert.equal(s.selectedParts.value[0].actualStock, .5)
  await s.workshopChanged('brewing'); assert.equal(s.form.workshopCode, 'raw_grain'); assert.equal(s.selectedParts.value.length, 1)
  allow = true; await s.scopeChanged('area'); assert.equal(s.form.scopeType, 'area'); assert.equal(s.selectedParts.value.length, 0)
  s.selectedParts.value = [{ _id: 2, actualStock: 3 }]; await s.workshopChanged('brewing')
  assert.equal(s.form.workshopCode, 'brewing'); assert.equal(s.selectedParts.value.length, 0)
})
test('switching count workshops invalidates old candidate requests before new scope choices have loaded', async () => {
  const oldCandidates = deferred(), newScope = deferred()
  let partCalls = 0, scopeCalls = 0
  const s = subject('Check', 'openCreate,loadCandidates,workshopChanged,candidates,form', {
    getFilters: () => ++scopeCalls === 1 ? Promise.resolve({ data: {} }) : newScope.promise,
    getParts: () => ++partCalls === 2 ? oldCandidates.promise : Promise.resolve({ data: [], total: 0 })
  })
  await s.openCreate(); const oldLoad = s.loadCandidates(); const change = s.workshopChanged('brewing'); await Promise.resolve()
  oldCandidates.resolve({ data: [{ _id: 'old', materialDesc: '原车间备件' }], total: 1 }); await oldLoad
  assert.equal(s.form.workshopCode, 'brewing'); assert.equal(s.candidates.value.length, 0)
  newScope.resolve({ data: {} }); await change
  assert.equal(s.candidates.value.length, 0)
})
test('closing a count editor before its scope choices return does not start another hidden candidate read', async () => {
  const scope = deferred(); let partCalls = 0
  const s = subject('Check', 'openCreate,closeCreate', { getFilters: () => scope.promise, getParts: async () => { partCalls++; return { data: [], total: 0 } } })
  const opening = s.openCreate(); await s.closeCreate(); scope.resolve({ data: {} }); await opening
  assert.equal(partCalls, 0)
})
test('replenishment checkboxes stay unavailable while fresh quantities are loading or have failed', async () => {
  const pending = deferred()
  const s = subject('Replenishment', 'load,canSelectRow,selectionChanged,selectedRows', { getReplenishment: () => pending.promise })
  assert.equal(s.canSelectRow(), true)
  const loading = s.load(); assert.equal(s.canSelectRow(), false)
  s.selectionChanged([{ _id: 'old', currentStock: 30 }]); assert.equal(s.selectedRows.value.length, 0)
  pending.reject(Error('offline')); await loading; assert.equal(s.canSelectRow(), false)
})

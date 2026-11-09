import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parseStockQuantity } from '../src/utils/stock-quantity.mjs'
import { validStockCount } from '../src/utils/list-view-state.mjs'
import { inventoryQuantitiesDiffer } from '../src/utils/inventory-count.mjs'

const inventory = fs.readFileSync(new URL('../src/views/Inventory.vue', import.meta.url), 'utf8')
const check = fs.readFileSync(new URL('../src/views/Check.vue', import.meta.url), 'utf8')
const section = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function stockSubject(overrides = {}) {
  const messages = [], writes = []
  const context = {
    parseStockQuantity, canEditAny: false, canEditAnyWorkshop: () => true, canEditWorkshop: () => true,
    loading: { value: false }, loadError: { value: '' }, stockPart: { value: null }, stockVisible: { value: false },
    stockForm: {}, stockBaseline: '', stockSubmitting: { value: false }, stockError: { value: '' },
    movementReasons: { value: { in: [], out: [] } }, movementReasonsLoading: { value: false }, movementReasonsError: { value: '' },
    currentReasonOptions: { value: [{ value: 'other_out' }] },
    ElMessage: { warning: value => messages.push(value), success: value => messages.push(value) },
    ElMessageBox: { confirm: async () => {} }, getMovementReasons: async () => ({ data: { in: [{ value: 'purchase' }], out: [] } }),
    updateStock: async (id, payload) => writes.push({ id, payload }), load: async () => {}, loadDashboard: async () => {}, ...overrides
  }
  vm.createContext(context)
  vm.runInContext(section(inventory, 'async function loadOperationOptions()', '\nasync function refreshAll()'), context)
  vm.runInContext(section(inventory, 'function openStock(row)', '\nfunction openBatch()'), context)
  return { ...context, messages, writes }
}

test('App stock permissions load movement reasons independently from hidden desktop maintenance controls', async () => {
  let calls = 0
  const s = stockSubject({ getMovementReasons: async () => { calls++; return { data: { in: [{ value: 'purchase' }], out: [] } } } })
  await s.loadOperationOptions()
  assert.equal(calls, 1)
  assert.equal(s.movementReasons.value.in[0].value, 'purchase')
  assert.equal(s.movementReasonsLoading.value, false)
})

test('a reason dictionary failure can be retried without closing the stock form', async () => {
  let online = false
  const s = stockSubject({ getMovementReasons: async () => { if (!online) throw Error('offline'); return { data: { in: [], out: [{ value: 'other_out' }] } } } })
  s.openStock({ _id: 1, totalStock: 8, unit: '个' })
  await s.loadOperationOptions(); assert.match(s.movementReasonsError.value, /读取失败/)
  assert.equal(s.stockVisible.value, true)
  online = true; await s.loadOperationOptions()
  assert.equal(s.movementReasonsError.value, ''); assert.equal(s.movementReasons.value.out[0].value, 'other_out')
})

test('repeated submit taps during confirmation create one stock write with the confirmed payload', async () => {
  const confirmation = deferred()
  const s = stockSubject({ ElMessageBox: { confirm: () => confirmation.promise } })
  s.openStock({ _id: 'first', totalStock: 8, unit: '个' })
  Object.assign(s.stockForm, { type: 'out', quantity: 2, reasonCode: 'other_out' })
  const pending = s.submitStock(); await s.submitStock()
  assert.equal(s.stockSubmitting.value, true); assert.equal(s.writes.length, 0)
  s.stockForm.quantity = 7
  confirmation.resolve(); await pending
  assert.equal(s.writes.length, 1); assert.equal(s.writes[0].id, 'first'); assert.equal(s.writes[0].payload.quantity, 2)
  assert.equal(s.stockSubmitting.value, false); assert.equal(s.stockVisible.value, false)
})

test('cancelling confirmation unlocks stock editing; write failure retains entered values and a persistent error', async () => {
  const cancelled = stockSubject({ ElMessageBox: { confirm: async () => { throw Error('cancel') } } })
  cancelled.openStock({ _id: 1, totalStock: 4 }); Object.assign(cancelled.stockForm, { quantity: 1, reasonCode: 'purchase' })
  await cancelled.submitStock()
  assert.equal(cancelled.stockSubmitting.value, false); assert.equal(cancelled.stockVisible.value, true); assert.equal(cancelled.writes.length, 0)
  const failed = stockSubject({ updateStock: async () => { throw Error('offline') } })
  failed.openStock({ _id: 1, totalStock: 4 }); Object.assign(failed.stockForm, { quantity: 3, reasonCode: 'purchase', recipient: '维修班' })
  await failed.submitStock()
  assert.equal(failed.stockForm.quantity, 3); assert.equal(failed.stockForm.recipient, '维修班'); assert.equal(failed.stockVisible.value, true)
  assert.equal(failed.stockSubmitting.value, false); assert.match(failed.stockError.value, /核对库存和流水/)
})

test('pending count approval blocks stock changes and cancelling discard preserves the form', async () => {
  const s = stockSubject({ ElMessageBox: { confirm: async () => { throw Error('keep') } } })
  s.openStock({ _id: 1, totalStock: 3, inventoryStatus: '待审批' })
  assert.equal(s.stockVisible.value, false); assert.match(s.messages[0], /盘点待审批/)
  s.openStock({ _id: 2, totalStock: 3 }); s.stockForm.quantity = 2
  await s.closeStock(); assert.equal(s.stockVisible.value, true); assert.equal(s.stockForm.quantity, 2)
})

function countSubject(overrides = {}) {
  const context = {
    selectedParts: { value: [] }, candidates: { value: [] }, allSelected: { value: false }, submitting: { value: false },
    submitError: { value: '' }, navigator:{userAgent:'DigitalWorkbenchAndroid/1.9.10-android.20'}, canCreate: true, validStockCount, inventoryQuantitiesDiffer, nativeAndroid: true,
    form: { inventoryUser: '张工', inventoryDate: '2026-10-28', inventoryRemark: '', workshopCode: 'qu_making', scopeType: 'all' },
    partArea: { value: '' }, partShelf: { value: [] }, createVisible: { value: true }, query: {},
    ElMessage: { warning() {}, success() {}, error() {} }, createInventoryOrder: async () => {}, load: async () => {}, ...overrides
  }
  vm.createContext(context)
  vm.runInContext(section(check, 'function isSelected(row)', '\nasync function allowCreateLeave()'), context)
  return context
}

test('selecting count candidates requires an explicit actual count and keeps counts already entered, including zero', () => {
  const s = countSubject()
  const rows = [{ _id: 1, totalStock: 9 }, { _id: 2, totalStock: 4 }]
  s.togglePart(rows[0]); assert.equal(s.selectedParts.value[0].actualStock, null)
  s.selectedParts.value[0].actualStock = 0
  s.candidates.value = rows; s.toggleSelectAll()
  assert.equal(s.selectedParts.value[0].actualStock, 0); assert.equal(s.selectedParts.value[1].actualStock, null)
})

test('failed count submission preserves explicit counts and enables retry with an App source payload', async () => {
  const payloads = []
  const s = countSubject({ createInventoryOrder: async payload => { payloads.push(payload); throw Error('offline') } })
  s.selectedParts.value = [{ _id: 1, totalStock: 4, actualStock: 0 }]
  await s.submitOrder()
  assert.equal(payloads.length, 1); assert.equal(payloads[0].filterParams.source, 'android'); assert.equal(payloads[0].inventoryAllList[0].actualStock, 0)
  assert.equal(s.createVisible.value, true); assert.equal(s.selectedParts.value[0].actualStock, 0); assert.equal(s.submitting.value, false)
  assert.match(s.submitError.value, /填写内容已保留/)
})

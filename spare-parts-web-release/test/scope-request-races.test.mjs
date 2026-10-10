import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const ref = value => ({ value })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function loadFunction(file, name, end, state) {
  const source = fs.readFileSync(new URL(`../src/views/${file}.vue`, import.meta.url), 'utf8')
  const start = source.indexOf(`async function ${name}(`)
  vm.createContext(state)
  vm.runInContext(source.slice(start, source.indexOf(`\n${end}`, start)), state)
}
test('inventory filter choices follow the latest workshop even if the previous request returns last', async () => {
  const old = deferred(), current = deferred()
  const state = { filterRequestToken: 0, query: { workshopCode: 'raw_grain' }, areas: ref([]), partTypes: ref([]), workshops: ref([]),
    getFilters: ({ workshopCode }) => workshopCode === 'raw_grain' ? old.promise : current.promise }
  loadFunction('Inventory', 'loadFilters', 'let dashboardToken', state)
  const first = state.loadFilters()
  state.query.workshopCode = 'brewing'
  const second = state.loadFilters()
  current.resolve({ data: { areas: ['当前货区'], partTypes: ['当前类型'] } })
  await second
  old.resolve({ data: { areas: ['旧货区'], partTypes: ['旧类型'] } })
  await first
  assert.equal(state.areas.value[0], '当前货区')
  assert.equal(state.partTypes.value[0], '当前类型')
})
test('inventory count scope options cannot switch back to an earlier workshop', async () => {
  const old = deferred(), current = deferred()
  const state = { scopeRequest: 0, form: { workshopCode: 'raw_grain' }, areas: ref([]), shelfMap: ref({}),
    getFilters: ({ workshopCode }) => workshopCode === 'raw_grain' ? old.promise : current.promise }
  loadFunction('Check', 'loadScopeOptions', 'function isSelected', state)
  const first = state.loadScopeOptions()
  state.form.workshopCode = 'qu_making'
  const second = state.loadScopeOptions()
  current.resolve({ data: { areas: ['当前货区'], shelfMap: { current: [2] } } })
  await second
  old.resolve({ data: { areas: ['旧货区'], shelfMap: { old: [1] } } })
  await first
  assert.equal(state.areas.value[0], '当前货区')
  assert.equal(state.shelfMap.value.current[0], 2)
  assert.equal(state.shelfMap.value.old, undefined)
})
test('rapid count-order clicks retain the last requested detail', async () => {
  const old = deferred(), current = deferred()
  const state = { detailRequest: 0, detail: ref(null), detailVisible: ref(false),
    getInventoryOrder: id => id === 'old' ? old.promise : current.promise }
  loadFunction('Check', 'viewDetail', 'function abnormalFor', state)
  const first = state.viewDetail({ _id: 'old' }), second = state.viewDetail({ _id: 'current' })
  current.resolve({ data: { _id: 'current' } })
  await second
  old.resolve({ data: { _id: 'old' } })
  await first
  assert.equal(state.detail.value._id, 'current')
  assert.equal(state.detailVisible.value, true)
})

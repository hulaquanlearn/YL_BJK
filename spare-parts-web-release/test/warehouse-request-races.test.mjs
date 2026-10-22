import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { collectParts } from '../src/utils/collect-parts.mjs'

const source = fs.readFileSync(new URL('../src/views/Warehouse3D.vue', import.meta.url), 'utf8')
const ref = value => ({ value })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function functionSource(name, next) {
  return source.slice(source.indexOf(`async function ${name}(`), source.indexOf(`\n${next}`, source.indexOf(`async function ${name}(`)))
}
function layoutHarness(getWarehouseLayout, getStagingPoints = async () => ({ data: [] })) {
  const state = {
    layoutRequestToken: 0,partModelsRequestToken:0,partModelDrawToken:0,partsLoading:ref(false),modelsPreparing:ref(false),workshopCode: ref('raw_grain'), loading: ref(false), layout: ref(null),loadError:ref(''),loadProgress:ref({phase:'layout'}),
    workshopOptions: ref([]), shelves: ref([]), stagingPoints: ref([]), selectedShelf: ref(null),
    getWarehouseLayout, getStagingPoints, applyPhysicalShelfLayout: item => item, nextTick: async () => {},
    scene: {}, initScene() {}, drawRoom() {}, drawShelves() {}, partModelMode: ref('hidden'), loadPartModels() {}
  }
  vm.createContext(state)
  vm.runInContext(functionSource('loadLayout', 'async function searchParts'), state)
  return state
}
test('late warehouse response cannot replace the current workshop or stop its loading indicator', async () => {
  const old = deferred(), current = deferred(), calls = []
  const state = layoutHarness(({ workshopCode }) => { calls.push(workshopCode); return calls.length === 1 ? old.promise : current.promise })
  const first = state.loadLayout()
  state.workshopCode.value = 'qu_making'
  const second = state.loadLayout()
  old.resolve({ data: { room: { name: '旧库房' }, shelves: [{ id: 'old' }] } })
  await first
  assert.equal(state.layout.value, null)
  assert.equal(state.loading.value, true)
  current.resolve({ data: { room: { name: '当前库房' }, shelves: [{ id: 'current' }] } })
  await second
  assert.equal(state.layout.value.room.name, '当前库房')
  assert.equal(state.shelves.value[0].id, 'current')
  assert.equal(state.loading.value, false)
  assert.deepEqual(calls, ['raw_grain', 'qu_making'])
})
test('late staging response cannot overwrite a newer layout and disposed page cannot draw', async () => {
  const oldPoints = deferred()
  const state = layoutHarness(async ({ workshopCode }) => ({ data: { room: { name: workshopCode } } }),
    ({ workshopCode }) => workshopCode === 'raw_grain' ? oldPoints.promise : Promise.resolve({ data: [{ id: 'new' }] }))
  const first = state.loadLayout()
  await Promise.resolve()
  state.workshopCode.value = 'brewing'
  await state.loadLayout()
  oldPoints.resolve({ data: [{ id: 'old' }] })
  await first
  assert.equal(state.layout.value.room.name, 'brewing')
  assert.equal(state.stagingPoints.value[0].id, 'new')
  const response = deferred(), disposed = layoutHarness(() => response.promise)
  const pending = disposed.loadLayout()
  disposed.layoutRequestToken++
  response.resolve({ data: { room: { name: '已离开页面' } } })
  await pending
  assert.equal(disposed.layout.value, null)
})
test('clearing location prevents an in-flight detail from selecting the old part again', async () => {
  const response = deferred()
  const state = {
    partLocationRequestToken: 0, stockDetailToken: 0, stockDetailLoading: ref(false), stockDetailError: ref(false),
    stockDetailVisible: ref(true), stockDetailCandidates: ref([{ _id: 'old' }]),
    selectedPart: ref({ _id: 'old' }), selectedPartId: ref('old'), markerRoot: null,
    getPart: () => response.promise, drawShelves() {}
  }
  vm.createContext(state)
  const clear = source.slice(source.indexOf('function clearPart('), source.indexOf('\nasync function setPartModelMode('))
  vm.runInContext(functionSource('loadStockDetail', 'const selectedPart') + '\n' + clear, state)
  const pending = state.loadStockDetail({ _id: 'old' })
  state.clearPart()
  response.resolve({ data: { _id: 'old' } })
  await pending
  assert.equal(state.selectedPart.value, null)
  assert.equal(state.stockDetailVisible.value, false)
  assert.equal(state.stockDetailLoading.value, false)
  await state.loadStockDetail(null)
})
test('late location-link lookup cannot override a newer lookup', async () => {
  const old = deferred(), current = deferred(), located = []
  const state = {
    partLocationRequestToken: 0, partOptions: ref([]),
    getPart: id => id === 'old' ? old.promise : current.promise,
    locatePart: async part => located.push(part._id)
  }
  vm.createContext(state)
  vm.runInContext(functionSource('locatePartById', 'async function selectShelf'), state)
  const first = state.locatePartById('old'), second = state.locatePartById('current')
  current.resolve({ data: { _id: 'current' } })
  await second
  old.resolve({ data: { _id: 'old' } })
  await first
  assert.deepEqual(located, ['current'])
  assert.equal(state.partOptions.value.length, 1)
})
test('cancelled part location cannot resume opening details after the shelf request completes', async () => {
  const shelfResponse = deferred()
  let draws = 0
  const state = {
    partLocationRequestToken: 0, stockDetailToken: 0, stockDetailVisible: ref(false), stockDetailLoading: ref(false),
    selectedPart: ref(null), allLocatedParts: ref([]), selectedPartId: ref(''), partOptions: ref([]),
    workshopCode: ref('raw_grain'), shelves: ref([{ shelfNo: 1 }]), activeGroup: ref(''), panelMode: ref(''),
    resolvePartLocation: () => ({ shelf: 1, layer: 1 }), selectShelf: () => shelfResponse.promise,
    drawShelves() { draws++ }
  }
  vm.createContext(state)
  vm.runInContext(functionSource('locatePart', 'async function locatePartById'), state)
  const pending = state.locatePart({ _id: 'old' })
  state.partLocationRequestToken++
  shelfResponse.resolve()
  await pending
  assert.equal(draws, 0)
  assert.equal(state.stockDetailVisible.value, false)
})
test('warehouse rejects repeated pagination instead of duplicating models as a complete list', async () => {
  let draws = 0, calls = 0
  const state = {
    partModelsRequestToken: 0, partModelDrawToken:0,partsLoading:ref(false),modelsPreparing:ref(false),loadError:ref(''),loadProgress:ref({phase:'parts'}),partModelMode: ref('all'), workshopCode: ref('raw_grain'),
    allLocatedParts: ref([]), collectParts,
    getParts: async () => { calls++; return { total: 3, data: [{ _id: '1', locationCode: '011101' }] } },
    drawPartModels() { draws++ }
  }
  vm.createContext(state)
  vm.runInContext(functionSource('loadPartModels', 'function modelUrlFor'), state)
  await assert.rejects(state.loadPartModels(), /未完整加载/)
  assert.equal(calls, 2)
  assert.equal(draws, 0)
  assert.equal(state.allLocatedParts.value.length, 0)
})

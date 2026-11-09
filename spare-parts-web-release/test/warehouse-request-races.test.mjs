import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { collectParts } from '../src/utils/collect-parts.mjs'
import {createShelfPartsCache} from '../src/utils/shelf-parts-cache.mjs'

const source = fs.readFileSync(new URL('../src/views/Warehouse3D.vue', import.meta.url), 'utf8')
const ref = value => ({ value })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function functionSource(name, next) {
  return source.slice(source.indexOf(`async function ${name}(`), source.indexOf(`\n${next}`, source.indexOf(`async function ${name}(`)))
}
function layoutHarness(getWarehouseLayout, getStagingPoints = async () => ({ data: [] })) {
  const state = {
    shelfPartsCache:createShelfPartsCache(),shelfPartsRequestToken:0,sceneReady:ref(false),layoutRequestToken: 0,partModelsRequestToken:0,partModelDrawToken:0,partsLoading:ref(false),modelsPreparing:ref(false),workshopCode: ref('raw_grain'), loading: ref(false), layout: ref(null),loadError:ref(''),loadProgress:ref({phase:'layout'}),
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
test('part details open immediately without waiting for a shelf request, and cancellation cannot reopen them', async () => {
  const shelfResponse = deferred()
  let draws = 0
  const state = {
    partLocationRequestToken: 0, stockDetailToken: 0, stockDetailVisible: ref(false), stockDetailLoading: ref(false),
    selectedPart: ref(null), allLocatedParts: ref([]), selectedPartId: ref(''), partOptions: ref([]),
    workshopCode: ref('raw_grain'), shelves: ref([{ shelfNo: 1 }]), activeGroup: ref(''), panelMode: ref(''),
    resolvePartLocation: () => ({ shelf: 1, layer: 1 }), selectShelf: () => shelfResponse.promise,
    selectedLayers:ref([1]),stockDetailCandidates:ref([]),sidePanelCollapsed:ref(false),
    drawShelves() { draws++ },drawPartModels(){},drawPartMarker(){},focusPart(){},loadStockDetail:async()=>{},nextTick:async()=>{},resizeScene(){}
  }
  vm.createContext(state)
  vm.runInContext(functionSource('locatePart', 'async function locatePartById'), state)
  const pending = state.locatePart({ _id: 'old' })
  assert.equal(draws,1)
  assert.equal(state.stockDetailVisible.value,true)
  state.partLocationRequestToken++
  state.stockDetailVisible.value=false
  shelfResponse.resolve()
  await pending
  assert.equal(draws, 1)
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

function modelVisibilityHarness({getParts}={}) {
  const loads=[],disposed=[],requests=[]
  const state={partModelMode:ref('all'),lastVisiblePartModelMode:ref('all'),partModelsRequestToken:0,partModelDrawToken:0,partsLoading:ref(false),modelsPreparing:ref(false),loadError:ref(''),loadProgress:ref({}),allLocatedParts:ref([{_id:'cached'}]),markerRoot:null,partModelsRoot:{kind:'model-root'},workshopCode:ref('raw_grain'),collectParts,
    nativeAndroid:false,computed:fn=>({get value(){return fn()}}),
    disposeChildren:root=>disposed.push(root.kind),
    loadPartModels:async()=>{loads.push(state.partModelMode.value)},
    getParts:async query=>{requests.push(query);return getParts(query)},
    drawPartModels:async()=>loads.push(state.partModelMode.value)}
  vm.createContext(state)
  const menuStart=source.indexOf('const partModelMenuItems = computed('),menuEnd=source.indexOf('\nconst selectedLocationSegments',menuStart)
  vm.runInContext(source.slice(menuStart,menuEnd)+'\nthis.currentMenu=()=>partModelMenuItems.value;\n'+functionSource('setPartModelMode','async function loadPartModels'),state)
  vm.runInContext(source.slice(source.indexOf('function mobileSceneCommand('),source.indexOf('\nconst selectedShelf')),state)
  if(getParts)vm.runInContext(functionSource('loadPartModels','function modelUrlFor'),state)
  return{state,loads,disposed,requests}
}

test('low-stock visibility toggles expose one opposite action and restore the previous visible stock scope',async()=>{
  const {state,loads,disposed}=modelVisibilityHarness()
  await state.setPartModelMode('low')
  assert.equal(state.partModelMode.value,'low')
  assert.deepEqual(Array.from(state.currentMenu().filter(item=>['show','hidden'].includes(item.command)),item=>item.label),['隐藏模型'])
  await state.setPartModelMode('hidden')
  assert.equal(state.partModelMode.value,'hidden');assert.equal(state.lastVisiblePartModelMode.value,'low')
  assert.deepEqual(Array.from(state.currentMenu().filter(item=>['show','hidden'].includes(item.command)),item=>item.label),['展示模型'])
  assert.equal(state.allLocatedParts.value.length,0)
  assert.deepEqual(disposed,['model-root'])
  await state.setPartModelMode('show')
  assert.equal(state.partModelMode.value,'low')
  assert.deepEqual(loads,['low','low'],'show must restore low stock, rather than forcing all stock')
  assert.equal(state.currentMenu().find(item=>item.command==='low').disabled,true)
})

test('choosing a stock scope while models are hidden shows that scope and updates the remembered visibility scope',async()=>{
  const {state,loads}=modelVisibilityHarness()
  await state.setPartModelMode('low');await state.setPartModelMode('hidden')
  await state.setPartModelMode('normal')
  assert.equal(state.partModelMode.value,'normal');assert.equal(state.lastVisiblePartModelMode.value,'normal')
  await state.setPartModelMode('hidden');await state.setPartModelMode('show')
  assert.equal(state.partModelMode.value,'normal')
  assert.deepEqual(loads,['low','normal','normal'])
  const before=state.partModelsRequestToken;await state.setPartModelMode('normal');await state.setPartModelMode('unsupported')
  assert.equal(state.partModelsRequestToken,before,'disabled current scope and unknown commands must not restart loading')
})

test('the mobile menu uses the same single visibility action and separate stock ranges as desktop',async()=>{
  const {state,loads}=modelVisibilityHarness()
  assert.deepEqual(Array.from(state.currentMenu().slice(1),item=>item.label),['全部库存','仅正常库存','仅低库存'])
  await state.mobileSceneCommand('models:low')
  await state.mobileSceneCommand('models:'+state.currentMenu()[0].command)
  assert.equal(state.partModelMode.value,'hidden')
  assert.equal(state.currentMenu().filter(item=>item.label==='展示模型').length,1)
  assert.equal(state.currentMenu().some(item=>item.label==='隐藏模型'),false)
  await state.mobileSceneCommand('models:'+state.currentMenu()[0].command)
  assert.equal(state.partModelMode.value,'low')
  assert.equal(state.currentMenu().filter(item=>item.label==='隐藏模型').length,1)
  assert.equal(state.currentMenu().some(item=>item.label==='展示模型'),false)
  assert.deepEqual(loads,['low','low'])
})

test('hide and show invalidate the old low-stock read while the restored-scope request remains authoritative',async()=>{
  const old=deferred(),current=deferred();let count=0
  const {state,loads,requests}=modelVisibilityHarness({getParts:()=>++count===1?old.promise:current.promise})
  const first=state.setPartModelMode('low');await Promise.resolve()
  await state.setPartModelMode('hidden');const resumed=state.setPartModelMode('show')
  old.resolve({total:1,data:[{_id:'old',locationCode:'011101'}]});await first
  assert.equal(state.allLocatedParts.value.length,0);assert.equal(state.partsLoading.value,true)
  current.resolve({total:1,data:[{_id:'current',locationCode:'011101'}]});await resumed
  assert.equal(state.allLocatedParts.value[0]._id,'current');assert.equal(state.partsLoading.value,false)
  assert.deepEqual(loads,['low'])
  assert.deepEqual(requests.map(query=>query.lowStock),[1,1])
  assert.equal(requests.every(query=>query.workshopCode==='raw_grain'),true)
})

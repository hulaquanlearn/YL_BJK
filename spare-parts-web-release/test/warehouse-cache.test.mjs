import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createShelfPartsCache} from '../src/utils/shelf-parts-cache.mjs'
import {resolvePartLocation} from '../src/utils/warehouse-location.mjs'

const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
const refresh=source.slice(source.indexOf('async function refreshCachedWarehouse('),source.indexOf('\nfunction resumeAnimation('))
const ref=value=>({value})
function harness(){
 let roomDraws=0,modelDraws=0,shelfDraws=0
 const layout={shelves:[{id:1,shelfNo:1}]},rows=[{_id:'1',locationCode:'011101',totalStock:3}]
 const s={sceneActive:true,loading:ref(false),partsLoading:ref(false),modelsPreparing:ref(false),refreshing:ref(false),refreshError:ref(''),resumeToken:0,workshopCode:ref('raw_grain'),partModelMode:ref('all'),layoutRequestToken:0,partModelsRequestToken:0,shelfPartsRequestToken:0,layout:ref(layout),stagingPoints:ref([]),shelves:ref(layout.shelves),allLocatedParts:ref(rows),workshopOptions:ref([]),selectedShelf:ref(null),shelfParts:ref([]),getParts(){},getWarehouseLayout:async()=>({data:structuredClone(layout)}),getStagingPoints:async()=>({data:[]}),collectParts:async()=>structuredClone(rows),applyPhysicalShelfLayout:x=>x,drawRoom(){roomDraws++},drawShelves(){shelfDraws++},async drawPartModels(){modelDraws++}}
 s.selectedPart=ref(null);s.clearPart=()=>{s.selectedPart.value=null};s.shelfPartsCache=createShelfPartsCache();s.resolvePartLocation=resolvePartLocation;s.drawPartMarker=()=>{}
 vm.createContext(s);vm.runInContext(refresh,s)
 return {s,draws:()=>({roomDraws,modelDraws,shelfDraws})}
}
test('returning to unchanged warehouse does not redraw or download models',async()=>{
 const {s,draws}=harness();await s.refreshCachedWarehouse()
 assert.deepEqual(draws(),{roomDraws:0,modelDraws:0,shelfDraws:0});assert.equal(s.refreshing.value,false)
})
test('changed stock refreshes visible geometry, changed layout refreshes shelves, refresh failure preserves cache',async()=>{
 const {s,draws}=harness();s.selectedPart.value=s.allLocatedParts.value[0];s.collectParts=async()=>[{_id:'1',locationCode:'011101',totalStock:8}]
 await s.refreshCachedWarehouse();assert.equal(s.allLocatedParts.value[0].totalStock,8);assert.equal(s.selectedPart.value.totalStock,8);assert.equal(draws().modelDraws,1)
 s.getWarehouseLayout=async()=>({data:{shelves:[{id:2,shelfNo:2}]}});await s.refreshCachedWarehouse()
 assert.equal(draws().roomDraws,1);assert.equal(draws().shelfDraws,2)
 s.getWarehouseLayout=async()=>{throw Error('network')};await s.refreshCachedWarehouse()
 assert.equal(s.shelves.value[0].id,2);assert.match(s.refreshError.value,/上次视图/);assert.equal(s.refreshing.value,false)
})
test('returning after a selected part moves updates the marker and shelf without moving the camera',async()=>{
 const {s}=harness(),markers=[]
 s.shelves.value.push({id:2,shelfNo:2});s.selectedShelf.value=s.shelves.value[0];s.selectedPart.value=s.allLocatedParts.value[0]
 s.collectParts=async()=>[{_id:'1',locationCode:'021101',totalStock:3}]
 s.drawPartMarker=(shelf,part)=>markers.push([shelf.shelfNo,part.locationCode])
 await s.refreshCachedWarehouse()
 assert.equal(s.selectedShelf.value.shelfNo,2);assert.equal(s.selectedPart.value.locationCode,'021101');assert.deepEqual(markers,[[2,'021101']])
 assert.doesNotMatch(refresh,/focusPart\(|focusShelf\(|cameraAnimation\s*=/)
})
test('hidden warehouse and a workshop change reject in-flight background results',async()=>{
 for(const cancel of [s=>{s.sceneActive=false;s.resumeToken++},s=>{s.workshopCode.value='brewing'},s=>{s.layoutRequestToken++}]){
  const {s,draws}=harness();let resolve;s.getWarehouseLayout=()=>new Promise(r=>{resolve=r})
  const task=s.refreshCachedWarehouse();cancel(s);resolve({data:{shelves:[{id:'stale'}]}});await task
  assert.equal(s.layout.value.shelves[0].id,1);assert.equal(draws().modelDraws,0)
 }
})
test('deactivation pauses rendering and observers but retains model cache; final unmount disposes it',()=>{
 const deactivation=source.slice(source.indexOf('onDeactivated(()=>{'),source.indexOf('\nonMounted(async'))
 let cancelled=0,disconnected=0;const s={onDeactivated:fn=>fn(),sceneActive:true,resumeToken:0,refreshing:ref(true),animationFrame:7,cancelAnimationFrame:x=>{cancelled=x},resizeObserver:{disconnect(){disconnected++}},controls:{enabled:true},stagePointers:new Set([1]),pointerStart:[1,2],multiPointerGesture:true,cameraAnimation:{},stockDetailToken:0,stockDetailVisible:ref(true),editorVisible:ref(true),qrVisible:ref(true)}
 vm.createContext(s);vm.runInContext(deactivation,s)
 assert.equal(s.sceneActive,false);assert.equal(cancelled,7);assert.equal(disconnected,1);assert.equal(s.controls.enabled,false);assert.equal(s.animationFrame,0);assert.equal(s.stockDetailVisible.value,false)
 assert.doesNotMatch(deactivation,/customModelCache.clear|renderer.*dispose/)
 const unmount=source.slice(source.indexOf('onBeforeUnmount(() => {'));assert.match(unmount,/customModelCache.clear/);assert.match(unmount,/renderer\?\.dispose/)
})

test('a cached warehouse is isolated across logout, token replacement and permission changes',()=>{
 const app=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
 const fn=app.slice(app.indexOf('function refreshUser(){'),app.indexOf('\n',app.indexOf('function refreshUser(){')))
 let token='session-a',user={id:1,role:'admin'}
 const s={getToken:()=>token,getUser:()=>user,cacheIdentity:JSON.stringify([token,user]),cacheEpoch:ref(0),user:ref(user)}
 vm.createContext(s);vm.runInContext(fn,s);s.refreshUser();assert.equal(s.cacheEpoch.value,0)
 token='session-b';s.refreshUser();assert.equal(s.cacheEpoch.value,1)
 user={id:1,role:'viewer'};s.refreshUser();assert.equal(s.cacheEpoch.value,2)
 token='';user=null;s.refreshUser();assert.equal(s.cacheEpoch.value,3);assert.equal(s.user.value,null)
 assert.match(app,/<KeepAlive :key="cacheEpoch" include="Warehouse3D"/)
})

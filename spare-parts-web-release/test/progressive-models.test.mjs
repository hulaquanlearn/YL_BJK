import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {streamModelJobs} from '../src/utils/progressive-models.mjs'
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
test('background hydration yields the first frame and bounds model work without losing jobs',async()=>{
 let active=0,peak=0,yields=0,completed=0,started=0;const gate=deferred(),jobs=Array.from({length:12},()=>async()=>{started++;active++;peak=Math.max(peak,active);await gate.promise;active--;completed++});
 const task=streamModelJobs(jobs,{yieldFrame:async()=>{yields++}});assert.equal(started,0);await Promise.resolve();assert.equal(started,3);gate.resolve();await task;assert.equal(peak,3);assert.equal(completed,12);assert.equal(yields,13);
});
test('switching or hiding the scene stops queued work after in-flight models settle',async()=>{
 let current=true,started=0;const gate=deferred(),task=streamModelJobs(Array.from({length:30},()=>async()=>{started++;await gate.promise}),{isCurrent:()=>current,yieldFrame:async()=>{}});
 await Promise.resolve();assert.equal(started,3);current=false;gate.resolve();await task;assert.equal(started,3);
});
test('the warehouse becomes interactive while its first model read is still pending',async()=>{
 const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function loadLayout()'),source.indexOf('\nasync function searchParts'));
 const gate=deferred(),ref=value=>({value});let modelRead=false,draws=0;
 const s={shelfPartsCache:{clear(){}},shelfPartsRequestToken:0,layoutRequestToken:0,partModelsRequestToken:0,partModelDrawToken:0,partsLoading:ref(false),modelsPreparing:ref(false),workshopCode:ref('raw_grain'),loading:ref(true),loadError:ref(''),loadProgress:ref({}),getWarehouseLayout:async()=>({data:{shelves:[{id:1}]}}),getStagingPoints:async()=>({data:[]}),layout:ref(null),workshopOptions:ref([]),shelves:ref([]),stagingPoints:ref([]),selectedShelf:ref(null),applyPhysicalShelfLayout:x=>x,nextTick:async()=>{},scene:{},initScene(){},drawRoom(){draws++},drawShelves(){draws++},partModelMode:ref('all'),sceneReady:ref(false),loadPartModels:async()=>{modelRead=true;assert.equal(s.sceneReady.value,true);assert.equal(s.loading.value,false);await gate.promise}};
 vm.createContext(s);vm.runInContext(fn,s);const pending=s.loadLayout();await new Promise(resolve=>setImmediate(resolve));assert.equal(modelRead,true);assert.equal(draws,2);assert.equal(s.sceneReady.value,true);gate.resolve();await pending;
});

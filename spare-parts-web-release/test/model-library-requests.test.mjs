import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {modelRequestFailure} from '../src/utils/model-request-failure.mjs'
const source=fs.readFileSync(new URL('../src/views/ModelLibrary.vue',import.meta.url),'utf8')
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}}
const ref=value=>({value})
function harness(){
 const s={query:{workshopCode:'raw_grain',search:''},parts:ref([]),catalogParts:ref([]),categoryModels:ref([]),partsError:ref(''),categoryError:ref(''),catalogPartsError:ref(''),loading:ref(false),categoryLoading:ref(false),modelPage:ref(1),selected:new Set(),partsRequest:0,categoryRequest:0,catalogPartsRequest:0,catalogGeneration:0,normalizePartRows:rows=>rows,prepareCategoryCatalog:rows=>rows}
 s.diagnostics=[];s.modelRequestFailure=(error,options)=>modelRequestFailure(error,{...options,logger:(_label,detail)=>s.diagnostics.push(detail)})
 vm.createContext(s)
 vm.runInContext(source.slice(source.indexOf('async function loadParts()'),source.indexOf('\nasync function showModelBindings'))+'\n'+source.slice(source.indexOf('async function loadCategoryModels()'),source.indexOf('\nasync function reloadCurrent()')),s)
 return s
}
test('model binding requests ignore old workshop responses and leave latest loading active',async()=>{
 const s=harness(),old=deferred(),latest=deferred();s.getPartModelLibrary=({workshopCode})=>workshopCode==='raw_grain'?old.promise:latest.promise
 const first=s.loadParts();s.query.workshopCode='brewing';const second=s.loadParts()
 old.resolve({data:[{id:'old'}]});await first;assert.equal(s.parts.value.length,0);assert.equal(s.loading.value,true)
 latest.resolve({data:[{id:'new'}]});await second;assert.equal(s.parts.value[0].id,'new');assert.equal(s.loading.value,false)
})
test('model directory retries reject stale data and distinguish current failures from empty results',async()=>{
 const s=harness(),old=deferred(),latest=deferred();let calls=0;s.getPartCategoryModels=()=>++calls===1?old.promise:latest.promise
 const first=s.loadCategoryModels(),second=s.loadCategoryModels();latest.resolve({data:[{id:'new'}]});await second;old.resolve({data:[{id:'old'}]});await first
 assert.equal(s.categoryModels.value[0].id,'new')
 s.getPartCategoryModels=async()=>{throw Error('offline')};await s.loadCategoryModels();assert.equal(s.categoryModels.value.length,0);assert.match(s.categoryError.value,/读取失败/)
 s.getPartCategoryModels=async()=>({data:[]});await s.loadCategoryModels();assert.equal(s.categoryError.value,'')
})
test('failed binding query clears previous rows and selection, and full-catalog races do not overwrite associations',async()=>{
 const s=harness();s.parts.value=[{id:'old'}];s.selected.add('old');s.getPartModelLibrary=async()=>{throw Error('offline')};await s.loadParts()
 assert.equal(s.parts.value.length,0);assert.equal(s.selected.size,0);assert.match(s.partsError.value,/读取失败/)
 const old=deferred(),latest=deferred();let calls=0;s.getPartModelLibrary=()=>++calls===1?old.promise:latest.promise
 const first=s.loadCatalogParts(),second=s.loadCatalogParts();latest.resolve({data:[{id:'new'}]});await second;old.resolve({data:[{id:'old'}]});await first
 assert.equal(s.catalogParts.value[0].id,'new')
})
test('changing a binding query immediately removes previous selections before any response arrives',async()=>{
 const s=harness(),response=deferred();s.parts.value=[{id:'old'}];s.selected.add('old');s.getPartModelLibrary=()=>response.promise
 const pending=s.loadParts();assert.equal(s.loading.value,true);assert.equal(s.selected.size,0);assert.equal(s.parts.value.length,0)
 response.resolve({data:[{id:'new'}]});await pending;assert.equal(s.parts.value[0].id,'new')
})
test('catalog errors distinguish network reception from local data conversion and preserve the safe reason',async()=>{
 const s=harness();s.getPartCategoryModels=async()=>{throw Object.assign(Error('Network Error'),{name:'AxiosError',code:'ERR_NETWORK'})}
 await s.loadCategoryModels();assert.match(s.categoryError.value,/网络连接失败/);assert.equal(s.diagnostics.at(-1).scope,'model-catalog:request')
 s.getPartCategoryModels=async()=>({data:[{}]});s.prepareCategoryCatalog=()=>{throw TypeError('rows.map is not a function')}
 await s.loadCategoryModels();assert.match(s.categoryError.value,/数据处理失败/);assert.equal(s.diagnostics.at(-1).name,'TypeError');assert.equal(s.diagnostics.at(-1).scope,'model-catalog:data')
 s.getPartModelLibrary=async()=>{throw Object.assign(Error('timeout'),{code:'ECONNABORTED'})};await s.loadCatalogParts();assert.match(s.catalogPartsError.value,/读取超时/)
 assert.equal(s.diagnostics.at(-1).scope,'associated-parts:request')
})

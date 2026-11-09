import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createShelfPartsCache} from '../src/utils/shelf-parts-cache.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}}
const ref=value=>({value})
test('same shelf clicks share one pending request and reuse its complete result',async()=>{
 let calls=0,time=0;const cache=createShelfPartsCache({now:()=>time}),response=deferred(),load=()=>{calls++;return response.promise}
 const a=cache.get('raw_grain:1',load),b=cache.get('raw_grain:1',load);await Promise.resolve();assert.equal(calls,1)
 response.resolve([{_id:'one'}]);await Promise.all([a,b]);await cache.get('raw_grain:1',load);assert.equal(calls,1)
 time=30001;await cache.get('raw_grain:1',async()=>{calls++;return[{_id:'updated'}]});assert.equal(calls,2);assert.equal(cache.peek('raw_grain:1')[0]._id,'updated')
})
test('failed shelf loads can retry and invalidation prevents stale cache writes',async()=>{
 const cache=createShelfPartsCache(),response=deferred();const old=cache.get('raw_grain:1',()=>response.promise)
 cache.clear();cache.set('raw_grain:1',[{_id:'new'}]);response.resolve([{_id:'old'}]);await old;assert.equal(cache.peek('raw_grain:1')[0]._id,'new')
 await assert.rejects(cache.get('brewing:1',async()=>{throw Error('offline')}),/offline/)
 await cache.get('brewing:1',async()=>[]);assert.equal(cache.peek('brewing:1').length,0)
 assert.equal(createShelfPartsCache().peek('raw_grain:1'),undefined)
})
test('selecting a different shelf ignores a late read while repeated same-shelf clicks issue one read',async()=>{
 const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
 const start=source.indexOf('async function selectShelf('),fn=source.slice(start,source.indexOf('\nfunction ',start))
 const a=deferred(),b=deferred(),calls=[]
 const s={shelfPartsCache:createShelfPartsCache(),shelfPartsRequestToken:0,partLocationRequestToken:0,selectedShelf:ref(null),panelMode:ref(''),sidePanelCollapsed:ref(false),selectedPart:ref(null),shelfParts:ref([]),shelfPartsError:ref(''),shelfPartsLoading:ref(false),workshopCode:ref('raw_grain'),drawShelves(){},focusShelf(){},selectAllLayers(){},partBelongsToShelf:()=>false,clearPart(){},getParts(){},collectParts:async(_get,query)=>{calls.push(query.shelf);return query.shelf===1?a.promise:b.promise}}
 vm.createContext(s);vm.runInContext(fn,s)
 const first=s.selectShelf({id:1,shelfNo:1}),repeated=s.selectShelf({id:1,shelfNo:1}),second=s.selectShelf({id:2,shelfNo:2});await Promise.resolve();assert.deepEqual(calls,[1,2])
 b.resolve([{_id:'current'}]);await second;a.resolve([{_id:'old'}]);await Promise.all([first,repeated]);assert.equal(s.shelfParts.value[0]._id,'current');assert.equal(s.shelfPartsLoading.value,false)
})

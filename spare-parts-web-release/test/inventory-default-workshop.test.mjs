import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as scopes from '../src/utils/inventory-scope.mjs'

const script=fs.readFileSync(new URL('../src/views/Inventory.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function subject({user={id:7,role:'qu_making',workshopCode:'qu_making'},route={},storage={},view=null}={}){
 const calls=[],values=new Map(Object.entries(storage)),localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}
 const context={...scopes,getUser:()=>user,isAppSurface:()=>true,isRawEmployee:()=>false,canEditAnyWorkshop:()=>true,canEditWorkshop:()=>true,
  ref:value=>({value}),reactive:value=>value,computed:get=>({get value(){return get()}}),watch(){},onMounted(){},onBeforeUnmount(){},onBeforeRouteLeave(){},nextTick:async()=>{},
  useRoute:()=>({query:route}),useRouter:()=>({push(){},replace(){}}),createListViewState:()=>({read:()=>view,save(){}}),boundedPage:x=>Number(x)||1,
  emptyPartLocation:()=>({}),stockHealth:()=>({key:'normal'}),window:{innerWidth:390,innerHeight:844,localStorage,scrollY:0,addEventListener(){},removeEventListener(){}},sessionStorage:localStorage,
  getParts:async query=>{calls.push({api:'parts',query:{...query}});return {data:[],total:0}},getFilters:async query=>{calls.push({api:'filters',query:{...query}});return {data:{}}},getDashboard:async query=>{calls.push({api:'dashboard',query:{...query}});return {data:{}}},ElMessage:{warning(){},success(){},info(){}}
 }
 vm.runInNewContext(script+'\nthis.state={query,load,search,resetFilters,workshopChanged};',context)
 return {...context.state,calls}
}

test('inventory initially queries the signed-in account workshop for parts, filters and totals',async()=>{
 const s=subject();assert.equal(s.query.workshopCode,'qu_making');s.search();await tick()
 assert.equal(s.calls.length,3)
 assert.equal(s.calls.find(c=>c.api==='parts').query.workshopCode,'qu_making')
 assert.equal(s.calls.find(c=>c.api==='filters').query.workshopCode,'qu_making')
 assert.equal(s.calls.find(c=>c.api==='dashboard').query.workshopCode,'qu_making')
})
test('legacy workshop roles and assigned staff workshops establish the account default',()=>{
 assert.equal(subject({user:{id:8,role:'brewing'}}).query.workshopCode,'brewing')
 assert.equal(subject({user:{id:9,role:'viewer',staffWorkshopCode:'raw_grain'}}).query.workshopCode,'raw_grain')
 assert.equal(subject({user:{id:10,role:'admin'}}).query.workshopCode,'')
})
test('an explicit all-workshops choice keeps the keyword and queries all readable workshops',async()=>{
 const s=subject();s.query.workshopCode='';s.query.searchKeyword='轴承';s.search();await tick()
 assert.equal(s.calls.find(c=>c.api==='parts').query.workshopCode,'')
 assert.equal(s.calls.find(c=>c.api==='parts').query.searchKeyword,'轴承')
 assert.equal(s.calls.find(c=>c.api==='filters').query.workshopCode,undefined)
})
test('resetting filters returns to the account workshop while clearing the keyword and location',async()=>{
 const s=subject();Object.assign(s.query,{workshopCode:'',searchKeyword:'轴承',warehouseAreaName:'二楼',page:4});s.resetFilters();await tick()
 assert.equal(s.query.workshopCode,'qu_making');assert.equal(s.query.searchKeyword,'');assert.equal(s.query.warehouseAreaName,'');assert.equal(s.query.page,1)
 assert.equal(s.calls.find(c=>c.api==='parts').query.workshopCode,'qu_making')
})
test('explicit route scopes and current return context preserve an intentional other or all-workshops view',()=>{
 assert.equal(subject({route:{scope:'1',workshopCode:'brewing'}}).query.workshopCode,'brewing')
 assert.equal(subject({route:{scope:'1',searchKeyword:'轴承'}}).query.workshopCode,'')
 assert.equal(subject({view:{query:{workshopCode:'',searchKeyword:'轴承',page:2},selectedIds:[],scrollTop:100}}).query.workshopCode,'')
})
test('a pre-change saved all-workshops default does not override the new account default',()=>{
 assert.equal(subject({storage:{'spare-parts-inventory-filters:7':JSON.stringify({workshopCode:'',searchKeyword:''})}}).query.workshopCode,'qu_making')
})
test('returning to a new explicit all-workshops preference preserves it; partial deep-links retain the account default',()=>{
 assert.equal(subject({storage:{'spare-parts-inventory-filters-v2:7:qu_making':JSON.stringify({workshopCode:'',searchKeyword:'轴承'})}}).query.workshopCode,'')
 assert.equal(subject({route:{lowStock:'1'}}).query.workshopCode,'qu_making')
 assert.equal(subject({route:{workshopCode:'unrecognized'}}).query.workshopCode,'qu_making')
})
test('changing query workshop clears a warehouse area from the former workshop before searching',async()=>{
 const s=subject();Object.assign(s.query,{workshopCode:'',warehouseAreaName:'制曲二楼',searchKeyword:'轴承'});s.workshopChanged();await tick()
 const query=s.calls.find(c=>c.api==='parts').query
 assert.equal(query.workshopCode,'');assert.equal(query.warehouseAreaName,'');assert.equal(query.searchKeyword,'轴承')
})

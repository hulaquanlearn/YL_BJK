import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {inventoryRouteQuery,inventoryScope} from '../src/utils/inventory-scope.mjs'

const source=fs.readFileSync(new URL('../src/views/Replenishment.vue',import.meta.url),'utf8')
function subject({native=true,restored=null,route={}}={}){
 const navigations=[],requests=[]
 const context={inventoryRouteQuery,inventoryScope,isAppSurface:()=>native,getUser:()=>({id:1,role:'admin'}),useRoute:()=>({query:route}),useRouter:()=>({push:to=>navigations.push(to)}),ref:value=>({value}),reactive:value=>value,computed:get=>({get value(){return get()}}),onMounted(){},onBeforeUnmount(){},onBeforeRouteLeave(){},nextTick:async()=>{},boundedPage:x=>Number(x)||1,createListViewState:()=>({read:()=>restored,save(){}}),getReplenishment:async query=>{requests.push({...query});return {data:[],total:0}},getFilters:async()=>({data:{}}),window:{scrollY:0,scrollTo(){}},ElMessage:{warning(){},info(){}}}
 const code=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const inventoryClick=source.match(/@click="([^"]+)">库存详情<\/el-button>/)[1]
 vm.runInNewContext(code+'\nthis.state={query,locate,load,search,openInventoryFromButton:row=>{'+inventoryClick+'}};',context)
 return {...context.state,navigations,requests}
}

test('locating a replenishment item uses its own workshop when the current filter is all or has since changed',()=>{
 const s=subject({route:{workshopCode:'raw_grain'}});s.locate({_id:23,workshopCode:'brewing'})
 assert.equal(s.navigations[0].path,'/warehouse-3d');assert.equal(s.navigations[0].query.partId,23);assert.equal(s.navigations[0].query.workshopCode,'brewing')
})
test('the mobile inventory detail action targets the exact stock record and its workshop, including duplicate material codes',()=>{
 const s=subject({route:{scope:'1',partType:'电气',warehouseAreaName:'旧货区'}});s.openInventoryFromButton({_id:23,workshopCode:'brewing',materialCode:'1001'})
 const nav=s.navigations[0]
 assert.equal(nav.path,'/inventory');assert.equal(nav.query.inventoryId,23);assert.equal(nav.query.workshopCode,'brewing');assert.equal(nav.query.searchKeyword,'1001')
 assert.equal(nav.query.warehouseAreaName,undefined);assert.equal(nav.query.partType,undefined)
})
test('a malformed saved page size falls back to the App batch size, while desktop retains its own default',()=>{
 const restored={query:{page:1,pageSize:999},selectedIds:[],scrollTop:null}
 assert.equal(subject({restored}).query.pageSize,20)
 assert.equal(subject({native:false,restored}).query.pageSize,100)
})
test('an intentional all-workshops keyword search retains that scope in the list request',async()=>{
 const s=subject({route:{scope:'1',searchKeyword:'轴承'}});await s.search()
 assert.equal(s.requests[0].workshopCode,'');assert.equal(s.requests[0].searchKeyword,'轴承');assert.equal(s.requests[0].pageSize,20)
})

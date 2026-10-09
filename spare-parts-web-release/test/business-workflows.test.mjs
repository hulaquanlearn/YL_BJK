import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { inventoryScope, inventoryRouteQuery, INVENTORY_SCOPE_KEYS } from '../src/utils/inventory-scope.mjs'
const read = name => fs.readFileSync(new URL(name,import.meta.url),'utf8')

test('inventory navigation roundtrips all six filters and explicitly clears an empty scope',()=>{
  const source={workshopCode:'brewing',warehouseAreaName:'一货区',partType:'质保件',searchKeyword:'轴承',stockStatus:'zero',lowStock:'1'}
  const route=inventoryRouteQuery(source,{dateFrom:'2026-09-01',activeOnly:'1'})
  assert.deepEqual(inventoryScope(route),source)
  assert.equal(route.scope,'1');assert.equal(route.activeOnly,'1')
  assert.deepEqual(inventoryRouteQuery({}),{scope:'1'})
  assert.deepEqual(Object.keys(inventoryScope({})),INVENTORY_SCOPE_KEYS)
  assert.equal(inventoryScope({workshopCode:['raw_grain'],page:'6'}).workshopCode,'')
})

test('inventory overview and its breakdown dialog stay on inventory, not statistics',()=>{
  const inventory=read('../src/views/Inventory.vue'),stats=read('../src/views/Statistics.vue')
  assert.match(inventory,/inventory-summary/)
  assert.match(inventory,/typeBreakdownVisible/)
  assert.match(inventory,/getDashboard/)
  assert.match(inventory,/备件种类与价值分布/)
  assert.match(inventory,/function showLowStock\(\) \{ query\.lowStock = '1'; query\.stockStatus = '';/)
  assert.doesNotMatch(stats,/typeBreakdownVisible|备件种类与价值分布|data\.summary\.pendingApproval/)
  assert.match(stats,/data\.scopeBreakdown/)
  assert.match(stats,/scopeBreakdown\.flatMap/)
  assert.match(stats,/v-if="loadError"/)
  assert.match(stats,/ref="healthEl"/)
  assert.match(stats,/操作统计周期/)
  assert.match(stats,/if\(path==='\/movements'\)/)
  assert.doesNotMatch(stats,/<h2>备件统计<\/h2>/)
  assert.ok(stats.indexOf('statistics-filters') < stats.indexOf('statistics-charts'))
  assert.match(stats,/is-fullscreen/)
})
test('changing replenishment filters explicitly clears remembered selections',()=>{
  const source=read('../src/views/Replenishment.vue')
  assert.match(source,/reserve-selection/)
  assert.match(source,/function search\(\) \{[^\n]*clearSelection\(\); selectedRows.value=\[\]/)
  assert.match(source,/function reset\(\)[^\n]*clearSelection\(\); selectedRows.value=\[\]/)
  assert.doesNotMatch(source,/toggleRowSelection\(row,\s*true\)/)
})

test('data quality preserves all inventory filters, clears stale area and watches route changes',async()=>{
  const source=read('../src/views/DataQuality.vue')
  const initial={workshopCode:'brewing',warehouseAreaName:'一货区',partType:'质保件',searchKeyword:'轴承',stockStatus:'zero',lowStock:'1',issue:'missing_reorder_point'}
  const route={query:initial},requests=[]
  let routeChanged
  const context={
    reactive:value=>value,ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},watch:(_source,fn)=>{routeChanged=fn},
    useRoute:()=>route,inventoryScope,
    getDataQuality:async query=>{requests.push({...query});return {data:[],total:0}},updatePartConfig:async()=>{},canEditWorkshop:()=>false,ElMessage:{success(){}}
  }
  const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
  vm.runInNewContext(`${script}\nglobalThis.subject={query,load,workshopChanged,clearInheritedScope,inheritedScopeLabel}`,context)
  const {subject}=context
  await subject.load()
  assert.deepEqual(inventoryScope(requests[0]),inventoryScope(initial))
  assert.equal(requests[0].issueType,'missing_reorder_point')
  assert.match(subject.inheritedScopeLabel.value,/一货区.*质保件.*零库存/)
  subject.query.workshopCode='raw_grain';subject.workshopChanged()
  assert.equal(requests.at(-1).warehouseAreaName,'')
  route.query={workshopCode:'qu_making',warehouseAreaName:'制曲库',partType:'易损件',issue:'missing_price'};routeChanged()
  assert.equal(requests.at(-1).warehouseAreaName,'制曲库');assert.equal(requests.at(-1).issueType,'missing_price')
  subject.clearInheritedScope();assert.equal(requests.at(-1).partType,'');assert.equal(requests.at(-1).warehouseAreaName,'')
  assert.equal(requests.at(-1).workshopCode,'qu_making')
})

function miniPage(relative,mocks={}){
  let page;
  vm.runInNewContext(read(`../../miniprogram/pages/${relative}`),{require:key=>mocks[key]||{},Page:value=>page=value,console,wx:{showToast(){},...mocks.wx},setTimeout,clearTimeout});
  page.setData=function(value){Object.assign(this.data,value)};
  return page;
}

test('mini approval paginates beyond the first page with total counts',async()=>{
  const requests=[];
  const api={getInventoryOrders:async params=>{requests.push({...params});return {total:41,data:Array.from({length:params.page===3?1:20},(_,i)=>({id:(params.page-1)*20+i+1,abnormalList:[]}))}}};
  const page=miniPage('approve/approve.js',{'../../services/api.js':api});
  await page.loadApproveList();assert.equal(page.data.approveList.length,20);assert.equal(page.data.hasMore,true);
  await page.loadApproveList(true);assert.equal(page.data.approveList.length,40);
  await page.loadApproveList(true);assert.equal(page.data.approveList.length,41);assert.equal(page.data.hasMore,false);
  assert.deepEqual(requests.map(p=>p.page),[1,2,3]);
});

test('mini AI never sums unlike units and preserves returned evidence',async()=>{
  const api={getDashboard:async()=>({data:{dashboard:{unitTotals:[{unit:'个',total:20},{unit:'米',total:13}]}}}),chat:async()=>({data:{answer:'建议检查轴承',evidence:[{sourceType:'knowledge',sourceId:'7',title:'轴承指南',excerpt:'检查润滑'}]}})};
  const page=miniPage('aiAgent/aiAgent.js',{'../../services/api.js':api});
  await page.queryInventorySummary('totalStock');
  assert.equal(page.data.resultSummary.value,'');assert.match(page.data.resultSummary.detail,/20 个、13 米/);assert.doesNotMatch(page.data.resultSummary.detail,/33/);
  await page.queryMaintenance('轴承如何保养');
  assert.equal(page.data.resultEvidence.length,1);assert.equal(page.data.resultEvidence[0].typeLabel,'知识文档');
});

test('mini editing controls follow scoped workshop permission, not global admin',()=>{
  const js=read('../../miniprogram/pages/detail/detail.js'),view=read('../../miniprogram/pages/detail/detail.wxml')
  assert.match(js,/canEditPart: auth.canEditWorkshop\(part.workshopCode\)/)
  assert.doesNotMatch(view,/wx:if="\{\{canEditPart\}\}"/)
  assert.match(js,/auth\.requireWrite\(auth\.canEditWorkshop/ )
  assert.doesNotMatch(view,/canEditPart \|\| isViewer/)
  assert.doesNotMatch(js,/if \(!auth.isAdmin\(\)\) \{[\s\S]{0,100}出入库/)
})

<template>
  <div ref="screenEl" class="statistics-page" :class="{'is-fullscreen':fullscreen}" v-loading="loading">
    <section class="panel statistics-filters" aria-label="统计筛选条件">
      <el-select v-model="workshopCode" clearable placeholder="全部车间" aria-label="筛选车间" @change="changeWorkshopScope"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
      <el-select v-model="scope.warehouseAreaName" clearable filterable placeholder="全部货区" aria-label="筛选货区" @change="load"><el-option v-for="area in areas" :key="area" :label="area" :value="area"/></el-select>
      <el-select v-model="scope.partType" clearable placeholder="全部备件类型" aria-label="筛选备件类型" @change="load"><el-option v-for="type in partTypes" :key="type" :label="type" :value="type"/></el-select>
      <div class="filter-actions"><el-button @click="resetScope">重置</el-button><el-button :loading="loading" aria-label="刷新统计" title="刷新统计" @click="load"><el-icon><Refresh /></el-icon></el-button><el-button text aria-label="全屏查看" title="全屏查看" @click="toggleFullscreen"><el-icon><FullScreen /></el-icon></el-button></div>
    </section>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon style="margin-bottom:14px" />
    <template v-if="loaded">
      <section class="statistics-charts">
        <article class="chart-card panel"><header><div><h3>库存健康度</h3><small>按库存记录分类</small></div></header><div class="health-content"><div v-show="data.summary.inventoryRecords" ref="healthEl" class="chart-canvas health-canvas" role="img" aria-label="库存正常、低库存、零库存、订购点未配置记录分布"></div><el-empty v-if="!data.summary.inventoryRecords" :image-size="54" description="暂无库存健康数据"/><div v-if="data.summary.inventoryRecords" class="health-legend"><div><i class="healthy"/><span>库存正常</span><strong>{{formatNumber(data.summary.healthyStock)}}</strong></div><div><i class="near"/><span>低库存</span><strong>{{formatNumber(data.summary.lowPositiveStock)}}</strong></div><div><i class="low"/><span>零库存</span><strong>{{formatNumber(data.summary.zeroStock)}}</strong></div><div><i class="unset"/><span>订购点未配置</span><strong>{{formatNumber(data.summary.unconfiguredStock)}}</strong></div></div></div></article>
        <article class="chart-card panel"><header><div><h3>出入库操作趋势</h3><small>统计周期只影响操作趋势和操作次数</small></div><div class="trend-tools"><span>操作统计周期</span><el-segmented v-model="days" :options="periodOptions" @change="load"/></div></header><div v-show="data.movementSummary.total" ref="trendEl" class="chart-canvas" role="img" :aria-label="`近${days}天库存操作${data.movementSummary.total}次`"></div><div v-if="!data.movementSummary.total" class="chart-empty">近 {{days}} 天暂无库存操作</div><footer><span>{{days}} 天库存操作</span><strong>{{formatNumber(data.movementSummary.total)}} 次</strong><span>入库 {{formatNumber(data.movementSummary.inbound)}} · 出库 {{formatNumber(data.movementSummary.outbound)}}</span></footer></article>
      </section>

      <section class="statistics-tables">
        <article ref="lowStockEl" class="table-card panel"><header><div><h3>低库存预警清单</h3><span>共 {{formatNumber(data.summary.lowStock)}} 条</span></div><el-button link type="primary" @click="goScoped('/replenishment')">查看补货清单 <el-icon><ArrowRight /></el-icon></el-button></header><el-table :data="data.lowStockParts.slice(0,6)" max-height="320" empty-text="当前没有低库存备件"><el-table-column label="备件" min-width="190"><template #default="{row}"><button class="part-link" type="button" @click="locate(row)"><strong>{{row.materialDesc||row.materialCode}}</strong><small>{{row.materialCode}}</small></button></template></el-table-column><el-table-column label="货区 / 库位" min-width="125"><template #default="{row}">{{row.warehouseAreaName||'未分区'}}<small class="table-subline">{{row.locationCode||'库位待确认'}}</small></template></el-table-column><el-table-column label="当前库存" width="100" align="right"><template #default="{row}"><strong class="low-quantity">{{row.totalStock}} {{row.unit||''}}</strong></template></el-table-column></el-table></article>
        <article class="table-card panel"><header><div><h3>车间 / 货区明细</h3><span>库存数量按单位分别展示</span></div></header><el-table class="workshop-breakdown-table" :data="breakdownRows" max-height="320" empty-text="当前筛选范围暂无明细" @row-click="showTypeDetails"><el-table-column prop="workshopName" label="车间" width="130"/><el-table-column prop="warehouseAreaName" label="货区" width="150"/><el-table-column prop="partType" label="备件类型" width="130" show-overflow-tooltip/><el-table-column prop="partTypes" label="种类" width="75" align="right"/><el-table-column label="库存数量" min-width="210"><template #default="{row}">{{quantities(row.unitTotals)}}</template></el-table-column><el-table-column prop="totalValue" label="已知库存价值" width="145" align="right"><template #default="{row}">{{formatMoney(row.totalValue)}}</template></el-table-column></el-table></article>
      </section>
    </template>
    <div v-else-if="!loading" class="chart-empty">统计数据未加载，请点击刷新重试。</div>
    <el-dialog v-model="detailsVisible" :title="`${detailsType} · 库存明细`" width="min(1100px,95vw)" align-center :append-to-body="!fullscreen">
      <el-table v-loading="detailsLoading" :data="detailRows" stripe max-height="55vh"><el-table-column prop="materialCode" label="物料编码" width="130"/><el-table-column prop="materialDesc" label="名称" min-width="220"/><el-table-column prop="warehouseAreaName" label="货区" width="120"/><el-table-column prop="locationCode" label="库位" width="100"/><el-table-column label="数量" width="110"><template #default="{row}">{{ row.totalStock }} {{ row.unit }}</template></el-table-column><el-table-column label="不含税单价" width="140"><template #default="{row}">{{ row.price == null ? '未填写' : formatMoney(row.price) }}</template></el-table-column><el-table-column label="库存价值" width="140"><template #default="{row}">{{ row.price == null ? '未填写' : formatMoney(Number(row.price)*Number(row.totalStock)) }}</template></el-table-column></el-table>
      <el-pagination v-model:current-page="detailsPage" :page-size="20" :total="detailsTotal" layout="total, prev, pager, next" @current-change="loadDetails"/>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getStats, getFilters, getParts } from '../api'
import { inventoryRouteQuery } from '../utils/inventory-scope.mjs'

echarts.use([LineChart, PieChart, GridComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const loaded = ref(false), loadError = ref(''), screenEl = ref(null), fullscreen = ref(false)
const days = ref(30)
const workshopCode = ref(typeof route.query.workshopCode === 'string' ? route.query.workshopCode : '')
const scope=reactive(Object.fromEntries(['warehouseAreaName','partType','searchKeyword','stockStatus','lowStock'].map(key=>[key,typeof route.query[key]==='string'?route.query[key]:''])))
const areas=ref([]),partTypes=ref([])
const lowStockEl=ref(null)
const detailsVisible=ref(false),detailsLoading=ref(false),detailsType=ref(''),detailRows=ref([]),detailsTotal=ref(0),detailsPage=ref(1),detailsScope=ref({})
let loadToken=0,detailToken=0
function quantities(items=[]){return items.map(i=>`${formatNumber(i.total)} ${i.unit}`).join('、')||'暂无数量'}
function formatMoney(value){return Number(value||0).toLocaleString('zh-CN',{style:'currency',currency:'CNY'})}
function resetScope(){workshopCode.value='';Object.keys(scope).forEach(key=>scope[key]='');days.value=30;load()}
function changeWorkshopScope(){scope.warehouseAreaName='';load()}
function scrollToLowStock(){lowStockEl.value?.scrollIntoView({behavior:'smooth',block:'start'})}
function showTypeDetails(row){detailsType.value=row.partType;detailsScope.value={...scope,workshopCode:row.workshopCode||workshopCode.value,warehouseAreaName:row.warehouseAreaName||scope.warehouseAreaName,partType:row.partType};detailsPage.value=1;detailRows.value=[];detailsVisible.value=true;loadDetails()}
async function loadDetails(){const token=++detailToken;detailsLoading.value=true;try{const result=await getParts({...detailsScope.value,page:detailsPage.value,pageSize:20});if(token!==detailToken)return;detailRows.value=result.data||[];detailsTotal.value=result.total||0}catch{if(token===detailToken)detailRows.value=[]}finally{if(token===detailToken)detailsLoading.value=false}}
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const periodOptions = [{ label: '7天', value: 7 }, { label: '30天', value: 30 }, { label: '90天', value: 90 }]
const trendEl = ref(null)
const healthEl = ref(null)
const data = reactive({
  summary: { materialCategoryCount: 0, inventoryRecords: 0, lowStock: 0, zeroStock: 0, lowPositiveStock: 0, healthyStock: 0, unconfiguredStock: 0, totalValue: 0, missingPrice: 0, missingReorderPoint: 0 },
  typeSummaries: [], scopeBreakdown: [], unitTotals: [], areaOverview: [], lowStockParts: [], movementSummary: { total: 0, inbound: 0, outbound: 0, adjustment: 0 }, movementTrend: [], topMovingParts: []
})
const breakdownRows=computed(()=>data.scopeBreakdown.flatMap(area=>(area.typeSummaries||[]).map(type=>({...type,workshopCode:area.workshopCode,workshopName:area.workshopName,warehouseAreaName:area.warehouseAreaName}))))
let trendChart
let healthChart
let resizeObserver

const fontFamily = 'Microsoft YaHei, PingFang SC, sans-serif'
function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:4}) }
function goScoped(path,extraFilters={}) {
  const extra={...extraFilters}
  if(path==='/movements'){const end=new Date(),start=new Date();start.setDate(end.getDate()-days.value+1);extra.dateFrom=dateKey(start);extra.dateTo=dateKey(end);extra.activeOnly='1'}
  router.push({ path, query:inventoryRouteQuery({...scope,workshopCode:workshopCode.value},extra) })
}
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function locate(item) { router.push({ path: '/warehouse-3d', query: { partId: item._id || item.inventoryId, ...(item.workshopCode||workshopCode.value ? { workshopCode: item.workshopCode||workshopCode.value } : {}) } }) }
function axisStyle() { return { axisLine: { lineStyle: { color: '#dce2ea' } }, axisTick: { show: false }, axisLabel: { color: '#687386', fontFamily, fontSize: 11 }, splitLine: { lineStyle: { color: '#edf0f4' } } } }
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await screenEl.value.requestFullscreen()}catch{ElMessage.warning('当前浏览器不支持全屏，请使用浏览器全屏功能')}}
function fullscreenChanged(){fullscreen.value=document.fullscreenElement===screenEl.value;nextTick(resizeCharts)}
function renderTrend() {
  trendChart ||= echarts.init(trendEl.value)
  const labels = data.movementTrend.map(item => item.date.slice(5))
  trendChart.setOption({
    animationDuration: 700,
    color: ['#15936b', '#c91f2c', '#d97706'],
    tooltip: { trigger: 'axis', backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    legend: { show: false },
    grid: { left: 42, right: 18, top: 20, bottom: 34 },
    xAxis: { type: 'category', boundaryGap: false, data: labels, ...axisStyle(), splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle() },
    series: [
      { name: '入库', type: 'line', symbol: 'circle', showSymbol:days.value<=7, symbolSize: 6, lineStyle: { width: 3 }, data: data.movementTrend.map(item => item.in) },
      { name: '出库', type: 'line', symbol: 'circle', showSymbol:days.value<=7, symbolSize: 6, lineStyle: { width: 3 }, data: data.movementTrend.map(item => item.out) },
      { name: '盘点调整', type: 'line', symbol: 'diamond', showSymbol:days.value<=7, symbolSize: 6, lineStyle: { width: 2, type: 'dashed' }, data: data.movementTrend.map(item => item.adjustment) }
    ]
  }, true)
}

function renderHealth() {
  healthChart ||= echarts.init(healthEl.value)
  const total = Number(data.summary.inventoryRecords) || 0
  healthChart.setOption({
    animationDuration: 700,
    color: ['#20a477', '#f2b52b', '#d8333f', '#8794a5'],
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条（{d}%）', backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    title: { text: formatNumber(total), subtext: '库存记录', left: 'center', top: '37%', textStyle: { color: '#172033', fontFamily, fontSize: 22, fontWeight: 800 }, subtextStyle: { color: '#758095', fontFamily, fontSize: 11 } },
    legend: { show: false },
    series: [{ type: 'pie', radius: ['53%', '73%'], center: ['50%', '50%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#fff', borderWidth: 4 }, label: { show: false }, emphasis: { scaleSize: 8 }, data: [
      { name: '库存正常', value: Number(data.summary.healthyStock) || 0 },
      { name: '低库存', value: Number(data.summary.lowPositiveStock) || 0 },
      { name: '零库存', value: Number(data.summary.zeroStock) || 0 },
      { name: '订购点未配置', value: Number(data.summary.unconfiguredStock) || 0 }
    ] }]
  }, true)
}

async function renderCharts() { await nextTick(); if (trendEl.value) renderTrend(); if (healthEl.value) renderHealth(); resizeCharts() }
async function load() {
  const token=++loadToken
  loading.value = true
  loadError.value=''
  try {
    const [result, filters] = await Promise.all([getStats({ ...scope, days: days.value, workshopCode: workshopCode.value }),getFilters({workshopCode:workshopCode.value})])
    if(token!==loadToken)return
    if(!result.data?.summary)throw new Error('统计接口未返回完整数据')
    areas.value=filters.data?.areas||[];partTypes.value=filters.data?.partTypes||[]
    Object.assign(data, result.data || {})
    data.scopeBreakdown ||= [];loaded.value=true
    await renderCharts()
  } catch(error){if(token===loadToken){loadError.value=loaded.value?'刷新失败，当前显示上次成功获取的数据，请重试。':error.message||'统计加载失败，请重试。'}} finally { if(token===loadToken)loading.value = false }
}
function resizeCharts() { trendChart?.resize(); healthChart?.resize() }
onMounted(() => { window.addEventListener('resize', resizeCharts);document.addEventListener('fullscreenchange',fullscreenChanged);if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(resizeCharts);resizeObserver.observe(screenEl.value)}load() })
onBeforeUnmount(() => { loadToken++;detailToken++;window.removeEventListener('resize', resizeCharts);document.removeEventListener('fullscreenchange',fullscreenChanged);resizeObserver?.disconnect();trendChart?.dispose(); healthChart?.dispose() })
</script>

<style scoped>
.statistics-page{--stats-ink:#172033;--stats-muted:#758095;--stats-line:#e3e7ed;color:var(--stats-ink);min-height:100%;padding:18px 22px 24px;background:#f4f5f7}
.statistics-page.is-fullscreen{width:100%;height:100%;overflow:auto;padding:22px 28px;border-radius:0}
.statistics-page .panel{border:1px solid var(--stats-line);border-radius:14px;background:#fff;box-shadow:0 4px 16px rgba(23,32,51,.035)}
.statistics-filters{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr)) auto;gap:10px;align-items:center;margin-bottom:16px;padding:12px 14px}
.filter-actions{display:flex;justify-content:flex-end;gap:8px;white-space:nowrap}
.statistics-charts{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(0,1.5fr);gap:12px;margin-bottom:12px}
.chart-card{min-width:0;overflow:hidden;padding:0}
.chart-card>header,.table-card>header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px 8px}
.chart-card h3,.table-card h3{margin:0;font-size:15px;font-weight:700}
.chart-card header small,.table-card header span{display:block;margin-top:4px;color:#8791a0;font-size:11px}
.health-content{display:grid;grid-template-columns:minmax(140px,.95fr) minmax(150px,1fr);align-items:center;gap:8px;padding:0 15px 12px}
.chart-canvas{width:100%;height:230px}.health-canvas{height:210px}
.health-legend{display:grid;gap:13px}.health-legend>div{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:8px;align-items:center;color:#596579;font-size:12px}.health-legend i{width:9px;height:9px;border-radius:50%}.health-legend i.healthy{background:#20a477}.health-legend i.near{background:#f2b52b}.health-legend i.low{background:#d8333f}.health-legend i.unset{background:#8794a5}.health-legend strong{color:#172033;font-size:13px;font-variant-numeric:tabular-nums}
.trend-tools{display:flex;align-items:center;gap:9px}.trend-tools>span{color:#687386;font-size:11px;white-space:nowrap}.trend-tools :deep(.el-segmented){--el-segmented-item-selected-bg-color:#c91f2c;--el-segmented-item-selected-color:#fff}.chart-card>footer{display:flex;align-items:center;gap:10px;padding:0 16px 13px;color:#7d8796;font-size:11px}.chart-card>footer strong{color:#172033;font-size:14px}.chart-empty{min-height:170px;display:flex;align-items:center;justify-content:center;padding:20px;color:#929baa;text-align:center;font-size:13px}
.statistics-tables{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:12px}.table-card{min-width:0;overflow:hidden;padding-bottom:6px}.table-card>header{min-height:56px}.table-card>header>div{min-width:0}.table-card :deep(.el-table){--el-table-header-bg-color:#f7f8fa;--el-table-header-text-color:#596579;--el-table-text-color:#263247;--el-table-border-color:#edf0f4;--el-table-row-hover-bg-color:#fafbfc;font-size:12px}.table-card :deep(.el-table th.el-table__cell){font-weight:650}.table-card :deep(.el-table td.el-table__cell),.table-card :deep(.el-table th.el-table__cell){padding:8px 0}.part-link{display:block;max-width:100%;padding:0;border:0;background:none;color:#263247;text-align:left;cursor:pointer}.part-link strong,.part-link small,.table-subline{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.part-link strong{font-size:12px;font-weight:650}.part-link small,.table-subline{margin-top:3px;color:#8791a0;font-size:11px}.low-quantity{color:#bd2630}.statistics-tables .table-card:last-child :deep(.el-table__body tr){cursor:pointer}
.statistics-page button:focus-visible{outline:2px solid #409eff;outline-offset:2px}.statistics-page :deep(.el-empty__description p){color:#8791a0}.statistics-page :deep(.el-dialog){color:#172033}.statistics-page :deep(.el-pagination){margin-top:16px}
@media(max-width:1180px){.statistics-charts{grid-template-columns:1fr}.chart-canvas{height:250px}}
@media(max-width:820px){.statistics-tables{grid-template-columns:1fr}.statistics-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-actions{grid-column:1/-1;justify-content:flex-start}}
@media(max-width:560px){.statistics-page,.statistics-page.is-fullscreen{padding:12px}.statistics-filters{grid-template-columns:1fr}.filter-actions{grid-column:auto;justify-content:flex-start}.health-content{grid-template-columns:1fr;justify-items:center}.health-canvas{max-width:250px}.health-legend{width:100%;padding:0 8px 8px}.chart-card>header{align-items:flex-start}.trend-tools{align-items:flex-end;flex-direction:column;gap:4px}.chart-canvas{height:220px}}
</style>

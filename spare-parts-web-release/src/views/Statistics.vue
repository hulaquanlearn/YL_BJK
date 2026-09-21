<template>
  <div ref="screenEl" class="statistics-page" :class="{'is-fullscreen':fullscreen}" v-loading="loading">
    <section class="statistics-hero">
      <div class="hero-copy">
        <span class="hero-eyebrow">SPARE PARTS INTELLIGENCE</span>
        <h2>备件运行看板</h2>
        <p>库存结构、风险分布和出入库活动统一呈现，所有数量均按单位独立统计。</p>
        <div class="freshness"><i></i>{{ generatedText }}</div>
      </div>
      <div class="hero-controls">
        <span>统计车间</span>
        <el-select v-model="workshopCode" clearable placeholder="全部车间" style="width:100%;margin-bottom:9px" @change="changeWorkshopScope"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
        <el-select v-model="scope.warehouseAreaName" clearable filterable placeholder="全部货区" @change="load"><el-option v-for="area in areas" :key="area" :label="area" :value="area"/></el-select>
        <el-select v-model="scope.partType" clearable placeholder="全部备件类型" @change="load"><el-option v-for="type in partTypes" :key="type" :label="type" :value="type"/></el-select>
        <span>观察周期</span>
        <el-segmented v-model="days" :options="periodOptions" @change="load" />
        <el-button class="hero-refresh" :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button class="hero-refresh" @click="toggleFullscreen"><el-icon><FullScreen /></el-icon>{{ fullscreen?'退出大屏':'全屏大屏' }}</el-button>
      </div>
      <div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div>
    </section>

    <div class="statistics-scope"><span>当前筛选：{{ scopeDescription }} · 库存为当前快照</span><div><el-button text @click="goScoped('/inventory')">库存明细</el-button><el-button text @click="resetScope">清除筛选</el-button></div></div>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon style="margin-bottom:14px" />
    <template v-if="loaded">
    <section class="stat-kpis" aria-label="备件核心指标">
      <button type="button" class="is-clickable kpi-value" @click="goScoped('/inventory')"><div><span>{{data.summary.missingPrice?'已知库存价值':'库存总价值'}}</span><strong>{{formatMoney(data.summary.totalValue)}}</strong><small>库存 × 不含税单价<span v-if="data.summary.missingPrice"> · {{data.summary.missingPrice}} 条记录缺价格</span></small></div></button>
      <button type="button" class="is-clickable" @click="scrollToBreakdown"><div class="kpi-icon is-red"><el-icon><Tickets /></el-icon></div><div><span>备件种类</span><strong>{{ formatNumber(data.summary.materialCategoryCount) }}</strong><small>{{formatNumber(data.summary.inventoryRecords)}} 条库存记录 · 编码去重</small></div></button>
      <button type="button" class="is-clickable" @click="goScoped('/replenishment')"><div class="kpi-icon is-orange"><el-icon><Warning /></el-icon></div><div><span>低库存预警</span><strong>{{ formatNumber(data.summary.lowStock) }}</strong><small>当前范围零库存 {{ data.summary.zeroStock || 0 }} 条</small></div><el-icon class="kpi-arrow"><ArrowRight /></el-icon></button>
      <button type="button" class="is-clickable" @click="goScoped('/movements')"><div class="kpi-icon is-green"><el-icon><Switch /></el-icon></div><div><span>{{ days }}天库存活动</span><strong>{{ formatNumber(data.movementSummary.total) }}</strong><small>入 {{ data.movementSummary.inbound || 0 }} · 出 {{ data.movementSummary.outbound || 0 }}</small></div><el-icon class="kpi-arrow"><ArrowRight /></el-icon></button>
    </section>

    <section class="unit-ribbon panel">
      <div class="ribbon-title"><span>库存数量</span><strong>按单位拆分</strong><small>不同计量单位不相加</small></div>
      <div class="unit-list"><article v-for="item in data.unitTotals" :key="item.unit"><strong>{{ formatNumber(item.total) }}</strong><span>{{ item.unit }}</span></article><el-empty v-if="!data.unitTotals.length" :image-size="46" description="暂无库存数量" /></div>
    </section>

    <section class="distribution-layout">
      <article class="chart-card panel"><header><div><span>VALUE COMPOSITION</span><h3>备件类型价值构成</h3><p>点击类型查看种类、数量和价格明细。</p></div></header><div v-show="hasTypeValue" ref="typeEl" class="chart-canvas type-canvas" role="img" :aria-label="typeChartDescription"></div><div v-if="!hasTypeValue" class="chart-empty">{{data.summary.inventoryRecords?'暂无可计算的正库存价值':'当前范围暂无库存记录'}}</div><div class="type-value-list"><button v-for="item in data.typeSummaries" :key="item.partType" @click="showTypeDetails(item)"><span>{{item.partType}} · {{item.partTypes}} 种</span><strong>{{formatMoney(item.totalValue)}}</strong><small>{{quantities(item.unitTotals)}}<span v-if="item.missingPrice"> · 缺价格 {{item.missingPrice}} 条</span></small></button></div></article>
      <article class="chart-card panel"><header><div><span>AREA VALUE</span><h3>车间 · 货区价值分布</h3><p>按已知库存价值排序，最多显示前 12 项；完整数据见下表。</p></div></header><div v-show="data.scopeBreakdown.length" ref="areaEl" class="chart-canvas area-canvas" role="img" aria-label="各车间货区已知库存价值条形图"></div><div v-if="!data.scopeBreakdown.length" class="chart-empty">当前范围暂无货区数据</div></article>
      <article class="chart-card panel"><header><div><span>STOCK HEALTH</span><h3>库存健康度</h3><p>按库存记录统计，四种状态互斥。</p></div></header><div v-show="data.summary.inventoryRecords" ref="healthEl" class="chart-canvas health-canvas" role="img" aria-label="库存正常、低库存、零库存、订购点未配置记录分布"></div><div v-if="!data.summary.inventoryRecords" class="chart-empty">暂无库存健康数据</div><button type="button" class="card-action" @click="goScoped('/data-quality',{issue:'missing_reorder_point'})">检查订购点配置 →</button></article>
    </section>
    <section class="chart-layout">
      <article class="chart-card chart-wide panel">
        <header><div><span>FLOW TREND</span><h3>库存操作趋势</h3><p>按操作次数统计，避免混合不同单位的数量。</p></div><div class="chart-legend"><i class="in"></i>入库<i class="out"></i>出库<i class="adjust"></i>盘点调整</div></header>
        <div v-show="data.movementSummary.total" ref="trendEl" class="chart-canvas" role="img" :aria-label="`近${days}天库存操作${data.movementSummary.total}次`"></div><div v-if="!data.movementSummary.total" class="chart-empty">近 {{days}} 天暂无库存操作，不代表没有库存</div>
      </article>

      <article class="ranking-card panel">
        <header><div><span>ACTIVE PARTS</span><h3>高频流动备件</h3><p>按当前周期内库存操作次数排名。</p></div><button type="button" @click="goScoped('/movements')">全部流水</button></header>
        <ol>
          <li v-for="(item,index) in data.topMovingParts" :key="item.inventoryId" @click="locate(item)">
            <b>{{ String(index + 1).padStart(2, '0') }}</b>
            <div><strong>{{ item.materialDesc || item.materialCode }}</strong><span>{{ item.materialCode }} · 出库 {{ item.outboundQuantity }}{{ item.unit }}</span></div>
            <em>{{ item.movementCount }} 次</em>
          </li>
        </ol>
        <el-empty v-if="!data.topMovingParts.length" :image-size="62" description="当前周期暂无库存操作" />
      </article>
    </section>

    <section class="risk-strip panel">
      <header><div><span>PRIORITY ALERTS</span><h3>优先补货备件</h3></div><el-button type="danger" plain @click="goScoped('/replenishment')">生成补货清单</el-button></header>
      <div class="risk-grid">
        <button v-for="item in data.lowStockParts.slice(0, 6)" :key="item._id" type="button" @click="locate(item)">
          <span class="risk-dot" :class="{ critical: Number(item.totalStock) <= 0 }"></span>
          <div><strong>{{ item.materialDesc || item.materialCode }}</strong><small>{{ item.materialCode }} · {{ item.locationCode || item.warehouseAreaName || '库位待确认' }}</small></div>
          <em>余 {{ item.totalStock }}{{ item.unit }}</em>
        </button>
      </div>
      <el-empty v-if="!data.lowStockParts.length" :image-size="62" description="当前没有低库存预警" />
    </section>
    <section ref="breakdownEl" class="type-breakdown panel" id="type-breakdown">
      <header><div><h3>车间 / 货区 · 类型明细</h3></div></header>
      <el-table :data="breakdownRows" max-height="480" @row-click="showTypeDetails">
        <el-table-column prop="workshopName" sortable label="车间" width="110"/><el-table-column prop="warehouseAreaName" sortable label="货区" width="120"/><el-table-column prop="partType" sortable label="备件类型" width="110"/><el-table-column prop="partTypes" sortable label="种类" width="80" align="right"/>
        <el-table-column label="库存数量（分单位）" sortable :sort-method="compareUnitTotals" min-width="220"><template #default="{row}">{{ quantities(row.unitTotals) }}</template></el-table-column>
        <el-table-column prop="totalValue" label="已知库存价值" sortable min-width="160" align="right"><template #default="{row}">{{ formatMoney(row.totalValue) }}</template></el-table-column><el-table-column prop="missingPrice" label="缺价格" sortable width="100" align="right"><template #default="{row}"><span :class="{'missing-price':row.missingPrice}">{{row.missingPrice||0}} 条</span></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click.stop="showTypeDetails(row)">查看明细</el-button></template></el-table-column>
      </el-table>
    </section>
    </template>
    <div v-else-if="!loading" class="chart-empty">尚未获得统计数据，请点击刷新重试。</div>
    <el-dialog v-model="detailsVisible" :title="`${detailsType} · 库存明细`" width="min(1100px,95vw)" align-center :append-to-body="!fullscreen">
      <el-table v-loading="detailsLoading" :data="detailRows" stripe max-height="55vh"><el-table-column prop="materialCode" label="物料编码" width="130"/><el-table-column prop="materialDesc" label="名称" min-width="220"/><el-table-column prop="warehouseAreaName" label="货区" width="120"/><el-table-column prop="locationCode" label="库位" width="100"/><el-table-column label="数量" width="110"><template #default="{row}">{{ row.totalStock }} {{ row.unit }}</template></el-table-column><el-table-column label="不含税单价" width="140"><template #default="{row}">{{ row.price == null ? '未填写' : formatMoney(row.price) }}</template></el-table-column><el-table-column label="库存价值" width="140"><template #default="{row}">{{ row.price == null ? '未填写' : formatMoney(Number(row.price)*Number(row.totalStock)) }}</template></el-table-column></el-table>
      <el-pagination v-model:current-page="detailsPage" :page-size="20" :total="detailsTotal" layout="total, prev, pager, next" @current-change="loadDetails"/>
    </el-dialog>
  </div>
</template>

<script setup>
import { compareUnitTotals } from '../utils/statistics-sort.mjs'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getStats, getFilters, getParts } from '../api'
import { inventoryRouteQuery } from '../utils/inventory-scope.mjs'

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const loaded = ref(false), loadError = ref(''), screenEl = ref(null), breakdownEl = ref(null), fullscreen = ref(false)
const days = ref(30)
const workshopCode = ref(typeof route.query.workshopCode === 'string' ? route.query.workshopCode : '')
const scope=reactive(Object.fromEntries(['warehouseAreaName','partType','searchKeyword','stockStatus','lowStock'].map(key=>[key,typeof route.query[key]==='string'?route.query[key]:''])))
const areas=ref([]),partTypes=ref([])
const scopeDescription=computed(()=>[workshops.find(w=>w.code===workshopCode.value)?.name||'全部车间',scope.warehouseAreaName||'全部货区',scope.partType||'全部类型',scope.searchKeyword?`关键词：${scope.searchKeyword}`:'',scope.stockStatus?`库存状态：${scope.stockStatus}`:'',scope.lowStock?'低库存':''].filter(Boolean).join(' · '))
const detailsVisible=ref(false),detailsLoading=ref(false),detailsType=ref(''),detailRows=ref([]),detailsTotal=ref(0),detailsPage=ref(1),detailsScope=ref({})
let loadToken=0,detailToken=0
function quantities(items=[]){return items.map(i=>`${formatNumber(i.total)} ${i.unit}`).join('、')||'暂无数量'}
function formatMoney(value){return Number(value||0).toLocaleString('zh-CN',{style:'currency',currency:'CNY'})}
function resetScope(){workshopCode.value='';Object.keys(scope).forEach(key=>scope[key]='');load()}
function changeWorkshopScope(){scope.warehouseAreaName='';load()}
function showTypeDetails(row){detailsType.value=row.partType;detailsScope.value={...scope,workshopCode:row.workshopCode||workshopCode.value,warehouseAreaName:row.warehouseAreaName||scope.warehouseAreaName,partType:row.partType};detailsPage.value=1;detailRows.value=[];detailsVisible.value=true;loadDetails()}
async function loadDetails(){const token=++detailToken;detailsLoading.value=true;try{const result=await getParts({...detailsScope.value,page:detailsPage.value,pageSize:20});if(token!==detailToken)return;detailRows.value=result.data||[];detailsTotal.value=result.total||0}catch{if(token===detailToken)detailRows.value=[]}finally{if(token===detailToken)detailsLoading.value=false}}
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const periodOptions = [{ label: '7天', value: 7 }, { label: '30天', value: 30 }, { label: '90天', value: 90 }]
const trendEl = ref(null)
const healthEl = ref(null)
const areaEl = ref(null)
const typeEl = ref(null)
const generatedText = ref('正在同步实时数据')
const data = reactive({
  summary: { materialCategoryCount: 0, inventoryRecords: 0, lowStock: 0, zeroStock: 0, lowPositiveStock: 0, healthyStock: 0, unconfiguredStock: 0 },
  typeSummaries: [], scopeBreakdown: [], unitTotals: [], areaOverview: [], lowStockParts: [], movementSummary: { total: 0, inbound: 0, outbound: 0, adjustment: 0 }, movementTrend: [], topMovingParts: []
})
const breakdownRows=computed(()=>data.scopeBreakdown.flatMap(area=>(area.typeSummaries||[]).map(type=>({...type,workshopCode:area.workshopCode,workshopName:area.workshopName,warehouseAreaName:area.warehouseAreaName}))))
const hasTypeValue=computed(()=>data.typeSummaries.some(item=>Number(item.totalValue)>0))
const typeChartDescription=computed(()=>data.typeSummaries.map(item=>`${item.partType}${item.partTypes}种，已知库存价值${formatMoney(item.totalValue)}`).join('；'))
let trendChart
let healthChart
let areaChart
let typeChart
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
function axisStyle() { return { axisLine: { lineStyle: { color: '#34445b' } }, axisTick: { show: false }, axisLabel: { color: '#afbed3', fontFamily, fontSize: 12 }, splitLine: { lineStyle: { color: '#293850' } } } }
function scrollToBreakdown(){breakdownEl.value?.scrollIntoView({behavior:'smooth',block:'start'})}
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await screenEl.value.requestFullscreen()}catch{ElMessage.warning('当前浏览器不支持全屏，请使用浏览器全屏功能')}}
function fullscreenChanged(){fullscreen.value=document.fullscreenElement===screenEl.value;nextTick(resizeCharts)}
function renderType(){
  typeChart ||= echarts.init(typeEl.value)
  typeChart.setOption({color:['#ed6574','#5aafff','#c4a5ff','#54d1bc'],tooltip:{trigger:'item',valueFormatter:value=>formatMoney(value),backgroundColor:'#111d30',borderColor:'#3c506e',textStyle:{color:'#fff'}},series:[{type:'pie',radius:['48%','72%'],label:{color:'#d6e4f5',fontSize:12,formatter:'{b}\n{d}%'},itemStyle:{borderColor:'#142035',borderWidth:3},data:data.typeSummaries.map(item=>({name:item.partType,value:Number(item.totalValue)||0}))}]},true)
  typeChart.off('click');typeChart.on('click',event=>{const row=data.typeSummaries.find(item=>item.partType===event.name);if(row)showTypeDetails(row)})
}

function renderTrend() {
  trendChart ||= echarts.init(trendEl.value)
  const labels = data.movementTrend.map(item => item.date.slice(5))
  trendChart.setOption({
    animationDuration: 700,
    color: ['#54d1bc', '#ed6574', '#f5bd60'],
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
    color: ['#54d1bc', '#f5bd60', '#ed6574', '#718096'],
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条（{d}%）', backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    title: { text: formatNumber(total), subtext: '库存记录', left: 'center', top: '37%', textStyle: { color: '#edf4ff', fontFamily, fontSize: 23, fontWeight: 800 }, subtextStyle: { color: '#adbbcf', fontFamily, fontSize: 12 } },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#adbbcf', fontFamily, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['53%', '73%'], center: ['50%', '45%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#142035', borderWidth: 4 }, label: { show: false }, emphasis: { scaleSize: 8 }, data: [
      { name: '库存正常', value: Number(data.summary.healthyStock) || 0 },
      { name: '低库存', value: Number(data.summary.lowPositiveStock) || 0 },
      { name: '零库存', value: Number(data.summary.zeroStock) || 0 },
      { name: '订购点未配置', value: Number(data.summary.unconfiguredStock) || 0 }
    ] }]
  }, true)
}

function renderArea() {
  areaChart ||= echarts.init(areaEl.value)
  const items = [...data.scopeBreakdown].sort((a,b)=>Number(b.totalValue)-Number(a.totalValue)).slice(0,12).reverse()
  areaChart.setOption({
    animationDuration: 700,
    color: ['#5aafff'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter:value=>formatMoney(value), backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    grid: { left: 146, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'value', ...axisStyle(),axisLabel:{color:'#adbbcf',formatter:value=>Number(value)>=10000?`${formatNumber(Number(value)/10000)}万`:formatNumber(value)} },
    yAxis: { type: 'category', data: items.map(item => `${item.workshopName} · ${item.warehouseAreaName}`), ...axisStyle(),axisLabel:{color:'#adbbcf',width:136,overflow:'truncate',fontSize:11}, splitLine: { show: false } },
    series: [
      { name: '已知库存价值', type: 'bar', barMaxWidth: 22, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: items.map(item => Number(item.totalValue)||0) }
    ]
  }, true)
  areaChart.off('click');areaChart.on('click',event=>{const row=items[event.dataIndex];if(row)router.push({path:'/inventory',query:inventoryRouteQuery({...scope,workshopCode:row.workshopCode,warehouseAreaName:row.warehouseAreaName})})})
}

async function renderCharts() { await nextTick(); if (trendEl.value) renderTrend(); if (healthEl.value) renderHealth(); if (areaEl.value) renderArea();if(typeEl.value)renderType();resizeCharts() }
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
    generatedText.value = result.data?.generatedAt ? `数据生成于 ${new Date(result.data.generatedAt).toLocaleString('zh-CN', { hour12: false })}` : '实时数据已同步'
    await renderCharts()
  } catch(error){if(token===loadToken){loadError.value=loaded.value?'刷新失败，当前显示上次成功获取的数据，请重试。':error.message||'统计加载失败，请重试。';if(!loaded.value)generatedText.value='统计数据未加载'}} finally { if(token===loadToken)loading.value = false }
}
function resizeCharts() { trendChart?.resize(); healthChart?.resize(); areaChart?.resize();typeChart?.resize() }
onMounted(() => { window.addEventListener('resize', resizeCharts);document.addEventListener('fullscreenchange',fullscreenChanged);if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(resizeCharts);resizeObserver.observe(screenEl.value)}load() })
onBeforeUnmount(() => { loadToken++;detailToken++;window.removeEventListener('resize', resizeCharts);document.removeEventListener('fullscreenchange',fullscreenChanged);resizeObserver?.disconnect();trendChart?.dispose(); healthChart?.dispose(); areaChart?.dispose();typeChart?.dispose() })
</script>

<style scoped>
.statistics-page{--stats-red:#9d1822;--stats-ink:#172033;--stats-muted:#758095}.statistics-hero{position:relative;overflow:hidden;min-height:212px;display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:16px;padding:32px 35px;border-radius:23px;color:#fff;background:radial-gradient(circle at 76% 24%,rgba(245,197,129,.18),transparent 24%),linear-gradient(120deg,#321015 0%,#70141b 44%,#a91b27 100%);box-shadow:0 22px 50px rgba(62,11,17,.22)}.hero-copy,.hero-controls{position:relative;z-index:2}.hero-eyebrow{color:#f5c581;font-size:10px;font-weight:900;letter-spacing:.16em}.statistics-hero h2{margin:9px 0 0;font-size:34px;letter-spacing:.03em}.statistics-hero p{max-width:650px;margin:10px 0 0;color:rgba(255,255,255,.72);font-size:13px}.freshness{display:flex;align-items:center;gap:8px;margin-top:18px;color:rgba(255,255,255,.62);font-size:10px}.freshness i{width:7px;height:7px;border-radius:50%;background:#64e6ad;box-shadow:0 0 0 5px rgba(100,230,173,.13);animation:pulse 2s infinite}.hero-controls{width:290px;padding:15px;border:1px solid rgba(255,255,255,.13);border-radius:15px;background:rgba(255,255,255,.07);backdrop-filter:blur(12px)}.hero-controls>span{display:block;margin-bottom:8px;color:rgba(255,255,255,.64);font-size:10px;font-weight:800}.hero-controls :deep(.el-segmented){width:100%;--el-segmented-bg-color:rgba(0,0,0,.16);--el-segmented-item-selected-bg-color:#fff;--el-segmented-item-selected-color:#8f1720;--el-segmented-item-hover-bg-color:rgba(255,255,255,.1);color:#fff}.hero-refresh{width:100%;margin-top:9px;color:#fff!important;border-color:rgba(255,255,255,.2)!important;background:rgba(255,255,255,.08)!important}.hero-orbit{position:absolute;border:1px solid rgba(255,255,255,.08);border-radius:50%;pointer-events:none}.orbit-one{right:24%;top:-150px;width:390px;height:390px}.orbit-two{right:14%;top:-86px;width:260px;height:260px}.stat-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:15px}.stat-kpis article{position:relative;min-height:112px;display:flex;align-items:center;gap:14px;padding:18px;border:1px solid #e3e6eb;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04)}.stat-kpis article.is-clickable{cursor:pointer;transition:.2s}.stat-kpis article.is-clickable:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(23,32,51,.08)}.kpi-icon{width:43px;height:43px;flex:none;display:grid;place-items:center;border-radius:13px;font-size:21px}.kpi-icon.is-red{color:#a91b27;background:#fff0f1}.kpi-icon.is-blue{color:#2563eb;background:#eff6ff}.kpi-icon.is-orange{color:#c66b04;background:#fff7e8}.kpi-icon.is-green{color:#0f8562;background:#ecfbf6}.stat-kpis span,.stat-kpis strong,.stat-kpis small{display:block}.stat-kpis span{color:#758095;font-size:10px;font-weight:800}.stat-kpis strong{margin-top:5px;font-size:25px}.stat-kpis small{margin-top:4px;color:#98a0ae;font-size:9px}.kpi-arrow{position:absolute;right:13px;top:13px;color:#b2b8c2}.unit-ribbon{display:grid;grid-template-columns:170px 1fr;gap:18px;align-items:center;margin-bottom:15px;padding:16px 18px}.ribbon-title span,.ribbon-title strong,.ribbon-title small{display:block}.ribbon-title span{color:#a51c26;font-size:9px;font-weight:900;letter-spacing:.1em}.ribbon-title strong{margin-top:2px;font-size:15px}.ribbon-title small{margin-top:3px;color:#929aa7;font-size:9px}.unit-list{min-width:0;display:flex;gap:9px;overflow-x:auto;padding-bottom:2px}.unit-list article{min-width:98px;display:flex;align-items:baseline;gap:5px;padding:11px 13px;border:1px solid #eceef2;border-radius:11px;background:#fafbfc}.unit-list strong{font-size:17px}.unit-list span{color:#7d8796;font-size:10px}.chart-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.65fr);gap:15px;margin-bottom:15px}.chart-card,.ranking-card{min-width:0;overflow:hidden;padding:0}.chart-card>header,.ranking-card>header,.risk-strip>header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:19px 20px 0}.chart-card header span,.ranking-card header span,.risk-strip header span{color:#a51c26;font-size:8px;font-weight:900;letter-spacing:.13em}.chart-card h3,.ranking-card h3,.risk-strip h3{margin:4px 0 0;font-size:15px}.chart-card p,.ranking-card p{margin:5px 0 0;color:#8a93a4;font-size:9px}.chart-canvas{width:100%;height:315px}.health-canvas{height:272px}.area-canvas{height:330px}.chart-legend{display:flex;align-items:center;gap:6px;color:#7c8798;font-size:9px}.chart-legend i{width:8px;height:8px;margin-left:5px;border-radius:3px}.chart-legend i.in{background:#15936b}.chart-legend i.out{background:#c91f2c}.chart-legend i.adjust{background:#d97706}.card-action{width:calc(100% - 34px);display:flex;align-items:center;justify-content:center;gap:5px;margin:0 17px 16px;padding:9px;border:0;border-radius:9px;color:#8f1720;background:#fff2f3;cursor:pointer;font-size:10px;font-weight:800}.ranking-card header button{border:0;color:#a51c26;background:transparent;cursor:pointer;font-size:10px}.ranking-card ol{margin:11px 0 0;padding:0 15px 14px;list-style:none}.ranking-card li{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid #edf0f3;cursor:pointer}.ranking-card li:hover{background:#fff8f8}.ranking-card li>b{color:#b6bdc8;font-size:11px;font-variant-numeric:tabular-nums}.ranking-card li div{min-width:0}.ranking-card li strong,.ranking-card li span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ranking-card li strong{font-size:11px}.ranking-card li span{margin-top:3px;color:#8a93a4;font-size:8px}.ranking-card li em{color:#8f1720;font-size:10px;font-style:normal;font-weight:800}.risk-strip{padding-bottom:15px}.risk-strip>header{align-items:center;padding-bottom:14px}.risk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:0 16px}.risk-grid button{min-width:0;display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:9px;align-items:center;padding:12px;border:1px solid #eceef2;border-radius:11px;background:#fafbfc;cursor:pointer;text-align:left}.risk-grid button:hover{border-color:#efc9cc;background:#fff7f7}.risk-dot{width:8px;height:8px;border-radius:50%;background:#e3a321;box-shadow:0 0 0 4px #fff4d8}.risk-dot.critical{background:#d82330;box-shadow:0 0 0 4px #ffe8ea}.risk-grid div{min-width:0}.risk-grid strong,.risk-grid small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.risk-grid strong{font-size:10px}.risk-grid small{margin-top:4px;color:#8992a1;font-size:8px}.risk-grid em{color:#a51c26;font-size:9px;font-style:normal;font-weight:800}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}@media(max-width:1180px){.stat-kpis{grid-template-columns:repeat(2,1fr)}.chart-layout{grid-template-columns:1fr}.risk-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.statistics-hero{align-items:stretch;flex-direction:column;padding:24px}.statistics-hero h2{font-size:27px}.hero-controls{width:100%}.stat-kpis{gap:9px}.stat-kpis article{min-height:100px;padding:14px}.unit-ribbon{grid-template-columns:1fr}.chart-card>header{flex-direction:column}.chart-legend{align-self:flex-start}.risk-grid{grid-template-columns:1fr}.chart-canvas{height:285px}}
.stat-kpis>button{position:relative;min-height:112px;display:flex;align-items:center;gap:14px;padding:18px;border:1px solid #e3e6eb;border-radius:16px;color:inherit;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04);font:inherit;text-align:left}.stat-kpis>button.is-clickable{cursor:pointer;transition:.2s}.stat-kpis>button.is-clickable:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(23,32,51,.08)}.statistics-page :where(.hero-eyebrow,.freshness,.hero-controls>span,.stat-kpis span,.stat-kpis small,.ribbon-title span,.ribbon-title small,.unit-list span,.chart-card header span,.ranking-card header span,.risk-strip header span,.chart-card p,.ranking-card p,.chart-legend,.card-action,.ranking-card header button,.ranking-card li>b,.ranking-card li strong,.ranking-card li span,.ranking-card li em,.risk-grid strong,.risk-grid small,.risk-grid em){font-size:12px}.health-canvas{height:300px}@media(max-width:680px){.stat-kpis>button{min-height:100px;padding:14px}}
.statistics-hero{min-height:0;padding:20px 24px;align-items:center;box-shadow:none}.statistics-hero h2{font-size:26px}.hero-orbit{display:none}.hero-controls{width:320px}.hero-controls>.el-select{margin-bottom:8px}.statistics-scope{display:flex;align-items:center;justify-content:space-between;padding:0 4px 10px;font-size:13px;color:#596579}.type-breakdown{padding:16px;margin-bottom:16px}.type-breakdown header{display:flex;justify-content:space-between;gap:16px;align-items:center}.type-breakdown h3{margin:0;font-size:17px}.type-breakdown p{font-size:12px;color:#667085}.type-breakdown header>strong{font-size:24px;white-space:nowrap;color:#9d1822}.type-breakdown :deep(.el-table__row){cursor:pointer}@media(max-width:680px){.type-breakdown header{align-items:flex-start;flex-direction:column}.hero-controls{width:100%}}
.statistics-page{--stats-ink:#edf4ff;--stats-muted:#adbbcf;--stats-red:#ee8292;color:var(--stats-ink);background:#0c1525;border:1px solid #26374f;border-radius:20px;padding:24px;min-height:700px}.statistics-page.is-fullscreen{width:100%;height:100%;overflow:auto;border-radius:0;padding:24px 32px}.statistics-hero{border:0;border-bottom:1px solid #34415a;border-radius:0;background:none;padding:0 0 20px;box-shadow:none;gap:30px;margin-bottom:18px}.statistics-hero h2{font-size:30px;letter-spacing:.04em}.hero-eyebrow{color:#efa4af}.statistics-hero p{color:#adbbcf}.freshness{color:#b8c8dc}.hero-controls{width:auto;flex:0 1 610px;display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px;padding:0;border:0;background:none;backdrop-filter:none}.hero-controls>span{display:none}.hero-controls>.el-select{margin:0!important;width:100%!important}.hero-controls>.el-segmented{grid-column:1/3}.hero-refresh{margin:0!important}.hero-controls>.hero-refresh:last-child{grid-column:1/-1}.hero-controls :deep(.el-select__wrapper){background:#1b2b43;box-shadow:0 0 0 1px #3a4d69 inset}.hero-controls :deep(.el-select__selected-item){color:#edf4ff}.hero-controls :deep(.el-select__placeholder.is-transparent){color:#b8c8dc}.hero-controls :deep(.el-segmented){--el-segmented-bg-color:#1b2b43;--el-segmented-color:#d1ddef;--el-segmented-item-selected-bg-color:#a92e44;--el-segmented-item-selected-color:#fff}.statistics-scope{color:#bdcce0;gap:12px;line-height:1.6;align-items:flex-start}.statistics-scope>div{display:flex;white-space:nowrap}.statistics-scope :deep(.el-button),.ranking-card header button{color:#9dcaff}.stat-kpis{grid-template-columns:1.4fr 1fr 1fr 1.1fr;gap:14px}.stat-kpis article,.stat-kpis>button{min-width:0;color:inherit;background:linear-gradient(130deg,#1b2c45,#152238);border:1px solid #354968;border-radius:12px;box-shadow:none;min-height:135px;padding:20px}.stat-kpis strong{font-size:32px;color:#edf4ff;font-variant-numeric:tabular-nums}.stat-kpis span,.stat-kpis small{color:#b8c8dc}.stat-kpis small span{display:inline}.stat-kpis .kpi-value{background:linear-gradient(120deg,#542232,#26223a);border-color:#804355}.stat-kpis .kpi-value strong{font-size:clamp(23px,1.8vw,34px);color:#ffd1dc;white-space:nowrap}.kpi-icon{display:none}.kpi-arrow{color:#8b9fba}.statistics-page .panel{background:#142035;border:1px solid #2b3c55;border-radius:12px;box-shadow:none;color:#edf4ff}.unit-ribbon{background:none!important;border:0!important;padding:6px 4px 16px;grid-template-columns:145px 1fr}.ribbon-title span{color:#ef97a1}.ribbon-title small{color:#adbbcf}.unit-list{flex-wrap:wrap;overflow:visible}.unit-list article{background:#1b2a40;border-color:#30435e;padding:10px 13px}.unit-list span{color:#adbbcf}.distribution-layout{display:grid;grid-template-columns:1fr 1.5fr .95fr;gap:14px;margin-bottom:14px}.distribution-layout .chart-card header{min-height:86px}.type-canvas{height:230px}.area-canvas{height:365px}.health-canvas{height:305px}.chart-card h3,.ranking-card h3,.risk-strip h3,.type-breakdown h3{color:#eff5ff;font-size:17px}.chart-card p,.ranking-card p,.type-breakdown p{color:#adbbcf;line-height:1.6}.chart-card header span,.ranking-card header span,.risk-strip header span{color:#ef97a1;font-size:10px}.chart-empty{min-height:235px;display:flex;align-items:center;justify-content:center;text-align:center;padding:25px;color:#b2c1d5;font-size:13px}.type-value-list{padding:0 16px 14px}.type-value-list>button{font:inherit;display:grid;grid-template-columns:1fr auto;gap:5px;width:100%;border:0;border-top:1px solid #2b3c55;background:none;color:#d9e6f7;text-align:left;padding:10px 0;cursor:pointer;font-size:12px}.type-value-list strong{color:#ffb9c5}.type-value-list small{grid-column:1/-1;color:#adbbcf;font-size:11px}.card-action{background:#24364e;color:#b8d9ff}.chart-legend{color:#afc0d6}.chart-legend i.in{background:#54d1bc}.chart-legend i.out{background:#ed6574}.chart-legend i.adjust{background:#f5bd60}.ranking-card li{border-color:#2b3c55}.ranking-card li:hover{background:#1f3049}.ranking-card li em{color:#ffb9c5}.ranking-card li span{color:#adbbcf}.risk-grid button{background:#1b2b43;border-color:#344964;color:#edf4ff}.risk-grid button:hover{background:#28354b;border-color:#b56e7c}.risk-grid small{color:#adbbcf}.risk-grid em{color:#f5bd60}.risk-strip>header :deep(.el-button){background:#3f2936;border-color:#855363;color:#ffd2dc}.type-breakdown{margin:16px 0 0;scroll-margin-top:100px}.type-breakdown :deep(.el-table){--el-table-bg-color:#142035;--el-table-tr-bg-color:#142035;--el-table-header-bg-color:#1b2a41;--el-table-header-text-color:#d4deec;--el-table-text-color:#c6d2e3;--el-table-border-color:#2b3c55;--el-table-row-hover-bg-color:#223650;font-size:12px}.missing-price{color:#f5bd60}.statistics-page button:focus-visible{outline:2px solid #8ec9ff;outline-offset:3px}.statistics-page :deep(.el-empty__description p){color:#b2c1d5}.statistics-page :deep(.el-dialog){color:#172033}.statistics-page :deep(.el-pagination){margin-top:16px}
@media(min-width:1800px){.chart-canvas{height:350px}.type-canvas{height:250px}.health-canvas{height:330px}.area-canvas{height:390px}}
@media(max-width:1250px){.statistics-hero{align-items:flex-start}.hero-controls{flex-basis:510px}.stat-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.distribution-layout{grid-template-columns:1fr 1.3fr}.distribution-layout>article:last-child{grid-column:1/-1}.health-canvas{height:250px}.chart-layout{grid-template-columns:1fr}.statistics-hero p{max-width:400px}}
@media(max-width:850px){.statistics-hero{flex-direction:column}.hero-controls{flex-basis:auto;width:100%}.distribution-layout{grid-template-columns:1fr}.distribution-layout>article:last-child{grid-column:auto}.statistics-scope{flex-direction:column}.risk-grid{grid-template-columns:1fr}.chart-canvas{height:285px}}
@media(max-width:680px){.statistics-page,.statistics-page.is-fullscreen{padding:14px;border-radius:12px}.stat-kpis{gap:8px}.stat-kpis>button{padding:14px;min-height:125px}.stat-kpis strong,.stat-kpis .kpi-value strong{font-size:23px}.unit-ribbon{grid-template-columns:1fr}.unit-list article{min-width:0}.statistics-hero h2{font-size:26px}.hero-controls{grid-template-columns:1fr 1fr}.hero-controls>.el-select:first-of-type{grid-column:1/-1}}
.type-breakdown :deep(.el-table){color:#d5e2f3}.type-breakdown :deep(.el-table th.el-table__cell){color:#c5d5eb;background:#1d2f48}.type-breakdown :deep(.el-table td.el-table__cell){color:#d5e2f3;background:#142035}.type-breakdown :deep(.el-table__body tr:hover>td.el-table__cell),.type-breakdown :deep(.el-table__body tr.hover-row>td.el-table__cell){color:#f2f7ff;background:#263f5c}.type-breakdown :deep(.el-table .el-button--primary.is-link){color:#8cc8ff}.type-breakdown :deep(.el-table .el-button--primary.is-link:hover){color:#d0e9ff}
</style>

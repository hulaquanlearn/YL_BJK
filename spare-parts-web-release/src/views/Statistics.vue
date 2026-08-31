<template>
  <div class="statistics-page">
    <section class="statistics-hero">
      <div class="hero-copy">
        <span class="hero-eyebrow">SPARE PARTS INTELLIGENCE</span>
        <h2>备件运行态势</h2>
        <p>库存结构、风险分布和出入库活动统一呈现，所有数量均按单位独立统计。</p>
        <div class="freshness"><i></i>{{ generatedText }}</div>
      </div>
      <div class="hero-controls">
        <span>统计车间</span>
        <el-select v-model="workshopCode" clearable placeholder="全部车间" style="width:100%;margin-bottom:9px" @change="load"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
        <span>观察周期</span>
        <el-segmented v-model="days" :options="periodOptions" @change="load" />
        <el-button class="hero-refresh" :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </div>
      <div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div>
    </section>

    <section class="stat-kpis" aria-label="备件核心指标">
      <article><div class="kpi-icon is-red"><el-icon><Tickets /></el-icon></div><div><span>备件品类</span><strong>{{ formatNumber(data.summary.materialCategoryCount) }}</strong><small>不重复物料编码</small></div></article>
      <article><div class="kpi-icon is-blue"><el-icon><Collection /></el-icon></div><div><span>库存记录</span><strong>{{ formatNumber(data.summary.inventoryRecords) }}</strong><small>物料与库位记录</small></div></article>
      <button type="button" class="is-clickable" @click="goScoped('/replenishment')"><div class="kpi-icon is-orange"><el-icon><Warning /></el-icon></div><div><span>低库存预警</span><strong>{{ formatNumber(data.summary.lowStock) }}</strong><small>其中零库存 {{ data.summary.zeroStock || 0 }} 条</small></div><el-icon class="kpi-arrow"><ArrowRight /></el-icon></button>
      <button type="button" class="is-clickable" @click="goScoped('/movements')"><div class="kpi-icon is-green"><el-icon><Switch /></el-icon></div><div><span>{{ days }}天库存活动</span><strong>{{ formatNumber(data.movementSummary.total) }}</strong><small>入 {{ data.movementSummary.inbound || 0 }} · 出 {{ data.movementSummary.outbound || 0 }}</small></div><el-icon class="kpi-arrow"><ArrowRight /></el-icon></button>
    </section>

    <section class="unit-ribbon panel">
      <div class="ribbon-title"><span>库存数量</span><strong>按单位拆分</strong><small>不同计量单位不相加</small></div>
      <div class="unit-list"><article v-for="item in data.unitTotals" :key="item.unit"><strong>{{ formatNumber(item.total) }}</strong><span>{{ item.unit }}</span></article><el-empty v-if="!data.unitTotals.length" :image-size="46" description="暂无库存数量" /></div>
    </section>

    <section class="chart-layout">
      <article class="chart-card chart-wide panel">
        <header><div><span>FLOW TREND</span><h3>库存操作趋势</h3><p>按操作次数统计，避免混合不同单位的数量。</p></div><div class="chart-legend"><i class="in"></i>入库<i class="out"></i>出库<i class="adjust"></i>盘点调整</div></header>
        <div ref="trendEl" class="chart-canvas"></div>
      </article>

      <article class="chart-card panel">
        <header><div><span>STOCK HEALTH</span><h3>库存健康度</h3><p>四类状态互斥，合计等于全部有效库存记录。</p></div></header>
        <div ref="healthEl" class="chart-canvas health-canvas"></div>
        <button type="button" class="card-action" @click="goScoped('/replenishment')">查看全部预警 <el-icon><ArrowRight /></el-icon></button>
      </article>

      <article class="chart-card panel">
        <header><div><span>AREA DISTRIBUTION</span><h3>货区库存分布</h3><p>库存记录与低库存记录对比。</p></div></header>
        <div ref="areaEl" class="chart-canvas area-canvas"></div>
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
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getStats } from '../api'

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const days = ref(30)
const workshopCode = ref(typeof route.query.workshopCode === 'string' ? route.query.workshopCode : '')
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const periodOptions = [{ label: '7天', value: 7 }, { label: '30天', value: 30 }, { label: '90天', value: 90 }]
const trendEl = ref(null)
const healthEl = ref(null)
const areaEl = ref(null)
const generatedText = ref('正在同步实时数据')
const data = reactive({
  summary: { materialCategoryCount: 0, inventoryRecords: 0, lowStock: 0, zeroStock: 0, lowPositiveStock: 0, healthyStock: 0, unconfiguredStock: 0 },
  unitTotals: [], areaOverview: [], lowStockParts: [], movementSummary: { total: 0, inbound: 0, outbound: 0, adjustment: 0 }, movementTrend: [], topMovingParts: []
})
let trendChart
let healthChart
let areaChart

const fontFamily = 'Microsoft YaHei, PingFang SC, sans-serif'
function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN') }
function goScoped(path) { router.push({ path, query: workshopCode.value ? { workshopCode: workshopCode.value } : {} }) }
function locate(item) { router.push({ path: '/warehouse-3d', query: { partId: item._id || item.inventoryId, ...(workshopCode.value ? { workshopCode: workshopCode.value } : {}) } }) }
function axisStyle() { return { axisLine: { lineStyle: { color: '#d9dee7' } }, axisTick: { show: false }, axisLabel: { color: '#7c8798', fontFamily, fontSize: 12 }, splitLine: { lineStyle: { color: '#edf0f4' } } } }

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
      { name: '入库', type: 'line', smooth: .28, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3 }, areaStyle: { color: 'rgba(21,147,107,.10)' }, data: data.movementTrend.map(item => item.in) },
      { name: '出库', type: 'line', smooth: .28, symbol: 'circle', symbolSize: 6, lineStyle: { width: 3 }, data: data.movementTrend.map(item => item.out) },
      { name: '盘点调整', type: 'line', smooth: .28, symbol: 'diamond', symbolSize: 6, lineStyle: { width: 2, type: 'dashed' }, data: data.movementTrend.map(item => item.adjustment) }
    ]
  }, true)
}

function renderHealth() {
  healthChart ||= echarts.init(healthEl.value)
  const total = Number(data.summary.inventoryRecords) || 0
  healthChart.setOption({
    animationDuration: 700,
    color: ['#15936b', '#d97706', '#c91f2c', '#718096'],
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 条（{d}%）', backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    title: { text: formatNumber(total), subtext: '库存记录', left: 'center', top: '37%', textStyle: { color: '#172033', fontFamily, fontSize: 23, fontWeight: 800 }, subtextStyle: { color: '#8a93a4', fontFamily, fontSize: 12 } },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: '#687386', fontFamily, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['53%', '73%'], center: ['50%', '45%'], avoidLabelOverlap: true, itemStyle: { borderColor: '#fff', borderWidth: 4 }, label: { show: false }, emphasis: { scaleSize: 8 }, data: [
      { name: '库存正常', value: Number(data.summary.healthyStock) || 0 },
      { name: '低库存', value: Number(data.summary.lowPositiveStock) || 0 },
      { name: '零库存', value: Number(data.summary.zeroStock) || 0 },
      { name: '订购点未配置', value: Number(data.summary.unconfiguredStock) || 0 }
    ] }]
  }, true)
}

function renderArea() {
  areaChart ||= echarts.init(areaEl.value)
  const items = [...data.areaOverview].sort((a, b) => a.inventoryRecords - b.inventoryRecords)
  areaChart.setOption({
    animationDuration: 700,
    color: ['#8f1720', '#e3a321'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#172033', borderWidth: 0, textStyle: { color: '#fff', fontFamily } },
    legend: { top: 0, right: 4, itemWidth: 10, itemHeight: 8, textStyle: { color: '#687386', fontFamily, fontSize: 10 } },
    grid: { left: 82, right: 20, top: 38, bottom: 20 },
    xAxis: { type: 'value', minInterval: 1, ...axisStyle() },
    yAxis: { type: 'category', data: items.map(item => item.area), ...axisStyle(), splitLine: { show: false } },
    series: [
      { name: '库存记录', type: 'bar', barMaxWidth: 18, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: items.map(item => item.inventoryRecords) },
      { name: '低库存', type: 'bar', barMaxWidth: 18, itemStyle: { borderRadius: [0, 5, 5, 0] }, data: items.map(item => item.lowStock) }
    ]
  }, true)
}

async function renderCharts() { await nextTick(); if (trendEl.value) renderTrend(); if (healthEl.value) renderHealth(); if (areaEl.value) renderArea() }
async function load() {
  loading.value = true
  try {
    const result = await getStats({ days: days.value, workshopCode: workshopCode.value })
    Object.assign(data, result.data || {})
    generatedText.value = result.data?.generatedAt ? `数据生成于 ${new Date(result.data.generatedAt).toLocaleString('zh-CN', { hour12: false })}` : '实时数据已同步'
    await renderCharts()
  } finally { loading.value = false }
}
function resizeCharts() { trendChart?.resize(); healthChart?.resize(); areaChart?.resize() }
onMounted(() => { window.addEventListener('resize', resizeCharts); load() })
onBeforeUnmount(() => { window.removeEventListener('resize', resizeCharts); trendChart?.dispose(); healthChart?.dispose(); areaChart?.dispose() })
</script>

<style scoped>
.statistics-page{--stats-red:#9d1822;--stats-ink:#172033;--stats-muted:#758095}.statistics-hero{position:relative;overflow:hidden;min-height:212px;display:flex;align-items:flex-end;justify-content:space-between;gap:30px;margin-bottom:16px;padding:32px 35px;border-radius:23px;color:#fff;background:radial-gradient(circle at 76% 24%,rgba(245,197,129,.18),transparent 24%),linear-gradient(120deg,#321015 0%,#70141b 44%,#a91b27 100%);box-shadow:0 22px 50px rgba(62,11,17,.22)}.hero-copy,.hero-controls{position:relative;z-index:2}.hero-eyebrow{color:#f5c581;font-size:10px;font-weight:900;letter-spacing:.16em}.statistics-hero h2{margin:9px 0 0;font-size:34px;letter-spacing:.03em}.statistics-hero p{max-width:650px;margin:10px 0 0;color:rgba(255,255,255,.72);font-size:13px}.freshness{display:flex;align-items:center;gap:8px;margin-top:18px;color:rgba(255,255,255,.62);font-size:10px}.freshness i{width:7px;height:7px;border-radius:50%;background:#64e6ad;box-shadow:0 0 0 5px rgba(100,230,173,.13);animation:pulse 2s infinite}.hero-controls{width:290px;padding:15px;border:1px solid rgba(255,255,255,.13);border-radius:15px;background:rgba(255,255,255,.07);backdrop-filter:blur(12px)}.hero-controls>span{display:block;margin-bottom:8px;color:rgba(255,255,255,.64);font-size:10px;font-weight:800}.hero-controls :deep(.el-segmented){width:100%;--el-segmented-bg-color:rgba(0,0,0,.16);--el-segmented-item-selected-bg-color:#fff;--el-segmented-item-selected-color:#8f1720;--el-segmented-item-hover-bg-color:rgba(255,255,255,.1);color:#fff}.hero-refresh{width:100%;margin-top:9px;color:#fff!important;border-color:rgba(255,255,255,.2)!important;background:rgba(255,255,255,.08)!important}.hero-orbit{position:absolute;border:1px solid rgba(255,255,255,.08);border-radius:50%;pointer-events:none}.orbit-one{right:24%;top:-150px;width:390px;height:390px}.orbit-two{right:14%;top:-86px;width:260px;height:260px}.stat-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:15px}.stat-kpis article{position:relative;min-height:112px;display:flex;align-items:center;gap:14px;padding:18px;border:1px solid #e3e6eb;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04)}.stat-kpis article.is-clickable{cursor:pointer;transition:.2s}.stat-kpis article.is-clickable:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(23,32,51,.08)}.kpi-icon{width:43px;height:43px;flex:none;display:grid;place-items:center;border-radius:13px;font-size:21px}.kpi-icon.is-red{color:#a91b27;background:#fff0f1}.kpi-icon.is-blue{color:#2563eb;background:#eff6ff}.kpi-icon.is-orange{color:#c66b04;background:#fff7e8}.kpi-icon.is-green{color:#0f8562;background:#ecfbf6}.stat-kpis span,.stat-kpis strong,.stat-kpis small{display:block}.stat-kpis span{color:#758095;font-size:10px;font-weight:800}.stat-kpis strong{margin-top:5px;font-size:25px}.stat-kpis small{margin-top:4px;color:#98a0ae;font-size:9px}.kpi-arrow{position:absolute;right:13px;top:13px;color:#b2b8c2}.unit-ribbon{display:grid;grid-template-columns:170px 1fr;gap:18px;align-items:center;margin-bottom:15px;padding:16px 18px}.ribbon-title span,.ribbon-title strong,.ribbon-title small{display:block}.ribbon-title span{color:#a51c26;font-size:9px;font-weight:900;letter-spacing:.1em}.ribbon-title strong{margin-top:2px;font-size:15px}.ribbon-title small{margin-top:3px;color:#929aa7;font-size:9px}.unit-list{min-width:0;display:flex;gap:9px;overflow-x:auto;padding-bottom:2px}.unit-list article{min-width:98px;display:flex;align-items:baseline;gap:5px;padding:11px 13px;border:1px solid #eceef2;border-radius:11px;background:#fafbfc}.unit-list strong{font-size:17px}.unit-list span{color:#7d8796;font-size:10px}.chart-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.65fr);gap:15px;margin-bottom:15px}.chart-card,.ranking-card{min-width:0;overflow:hidden;padding:0}.chart-card>header,.ranking-card>header,.risk-strip>header{display:flex;align-items:flex-start;justify-content:space-between;gap:15px;padding:19px 20px 0}.chart-card header span,.ranking-card header span,.risk-strip header span{color:#a51c26;font-size:8px;font-weight:900;letter-spacing:.13em}.chart-card h3,.ranking-card h3,.risk-strip h3{margin:4px 0 0;font-size:15px}.chart-card p,.ranking-card p{margin:5px 0 0;color:#8a93a4;font-size:9px}.chart-canvas{width:100%;height:315px}.health-canvas{height:272px}.area-canvas{height:330px}.chart-legend{display:flex;align-items:center;gap:6px;color:#7c8798;font-size:9px}.chart-legend i{width:8px;height:8px;margin-left:5px;border-radius:3px}.chart-legend i.in{background:#15936b}.chart-legend i.out{background:#c91f2c}.chart-legend i.adjust{background:#d97706}.card-action{width:calc(100% - 34px);display:flex;align-items:center;justify-content:center;gap:5px;margin:0 17px 16px;padding:9px;border:0;border-radius:9px;color:#8f1720;background:#fff2f3;cursor:pointer;font-size:10px;font-weight:800}.ranking-card header button{border:0;color:#a51c26;background:transparent;cursor:pointer;font-size:10px}.ranking-card ol{margin:11px 0 0;padding:0 15px 14px;list-style:none}.ranking-card li{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid #edf0f3;cursor:pointer}.ranking-card li:hover{background:#fff8f8}.ranking-card li>b{color:#b6bdc8;font-size:11px;font-variant-numeric:tabular-nums}.ranking-card li div{min-width:0}.ranking-card li strong,.ranking-card li span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ranking-card li strong{font-size:11px}.ranking-card li span{margin-top:3px;color:#8a93a4;font-size:8px}.ranking-card li em{color:#8f1720;font-size:10px;font-style:normal;font-weight:800}.risk-strip{padding-bottom:15px}.risk-strip>header{align-items:center;padding-bottom:14px}.risk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:0 16px}.risk-grid button{min-width:0;display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:9px;align-items:center;padding:12px;border:1px solid #eceef2;border-radius:11px;background:#fafbfc;cursor:pointer;text-align:left}.risk-grid button:hover{border-color:#efc9cc;background:#fff7f7}.risk-dot{width:8px;height:8px;border-radius:50%;background:#e3a321;box-shadow:0 0 0 4px #fff4d8}.risk-dot.critical{background:#d82330;box-shadow:0 0 0 4px #ffe8ea}.risk-grid div{min-width:0}.risk-grid strong,.risk-grid small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.risk-grid strong{font-size:10px}.risk-grid small{margin-top:4px;color:#8992a1;font-size:8px}.risk-grid em{color:#a51c26;font-size:9px;font-style:normal;font-weight:800}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}@media(max-width:1180px){.stat-kpis{grid-template-columns:repeat(2,1fr)}.chart-layout{grid-template-columns:1fr}.risk-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.statistics-hero{align-items:stretch;flex-direction:column;padding:24px}.statistics-hero h2{font-size:27px}.hero-controls{width:100%}.stat-kpis{gap:9px}.stat-kpis article{min-height:100px;padding:14px}.unit-ribbon{grid-template-columns:1fr}.chart-card>header{flex-direction:column}.chart-legend{align-self:flex-start}.risk-grid{grid-template-columns:1fr}.chart-canvas{height:285px}}
.stat-kpis>button{position:relative;min-height:112px;display:flex;align-items:center;gap:14px;padding:18px;border:1px solid #e3e6eb;border-radius:16px;color:inherit;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04);font:inherit;text-align:left}.stat-kpis>button.is-clickable{cursor:pointer;transition:.2s}.stat-kpis>button.is-clickable:hover{transform:translateY(-2px);box-shadow:0 13px 30px rgba(23,32,51,.08)}.statistics-page :where(.hero-eyebrow,.freshness,.hero-controls>span,.stat-kpis span,.stat-kpis small,.ribbon-title span,.ribbon-title small,.unit-list span,.chart-card header span,.ranking-card header span,.risk-strip header span,.chart-card p,.ranking-card p,.chart-legend,.card-action,.ranking-card header button,.ranking-card li>b,.ranking-card li strong,.ranking-card li span,.ranking-card li em,.risk-grid strong,.risk-grid small,.risk-grid em){font-size:12px}.health-canvas{height:300px}@media(max-width:680px){.stat-kpis>button{min-height:100px;padding:14px}}
</style>

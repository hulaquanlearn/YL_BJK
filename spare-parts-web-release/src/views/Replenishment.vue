<template>
  <div class="replenishment-page">
    <section class="replenishment-hero">
      <div><h2>待补货备件</h2><p>结合当前库存与最高储备，实时计算建议补货量。</p></div>
      <div class="hero-actions"><el-button class="light-button" @click="goScoped('/inventory')">库存明细</el-button><el-button class="light-button" @click="goScoped('/statistics')"><el-icon><DataAnalysis /></el-icon>查看统计</el-button><el-button class="light-button" :loading="loading" @click="search"><el-icon><Refresh /></el-icon>刷新清单</el-button></div>
    </section>

    <section class="replenishment-metrics">
      <article><span>低库存记录</span><strong>{{ formatNumber(summary.total) }}</strong><small>已达到或低于订购点</small></article>
      <article class="is-critical"><span>零库存</span><strong>{{ formatNumber(summary.zeroStock) }}</strong><small>建议优先处理</small></article>
      <article class="is-config"><span>待配置目标</span><strong>{{ formatNumber(summary.missingTarget) }}</strong><small>缺少最高储备数量</small></article>
      <article class="is-money"><span>预计补货金额</span><strong>¥ {{ formatMoney(summary.estimatedAmount) }}</strong><small>仅统计已配置单价与目标的记录</small></article>
    </section>

    <section class="panel replenish-controls">
      <div class="replenish-filter">
        <div class="filter-field"><label>所属车间</label><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="workshopChanged"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></div>
        <div class="filter-field replenish-search"><label>关键词</label><el-input v-model="query.searchKeyword" clearable placeholder="物料编码、名称、规格或库位" @keyup.enter="search" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
        <div v-if="areas.length" class="filter-field"><label>货区</label><el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" style="width:100%" @change="search"><el-option v-for="area in areas" :key="area" :label="area" :value="area" /></el-select></div>
        <div class="filter-actions"><el-button @click="reset">重置</el-button><el-button type="primary" :loading="loading" @click="search">查询</el-button></div>
      </div>
      <p v-if="query.partType||query.stockStatus||query.lowStock" class="inherited-scope">沿用库存范围：{{[query.partType,query.stockStatus,query.lowStock?'低库存':''].filter(Boolean).join(' · ')}}<el-button text size="small" @click="clearInheritedScope">清除范围</el-button></p>
      <div class="selection-summary">
        <div><span>已选 {{ selectedRows.length }} 条</span><strong>{{ selectedUnitSummary }}</strong><small>建议补货数量按单位分开统计</small></div>
        <div class="selection-actions"><el-button :disabled="loading||!selectedRows.length" @click="copyList"><el-icon><CopyDocument /></el-icon>复制清单</el-button></div>
      </div>
    </section>

    <section class="panel replenish-table">
      <div class="table-toolbar"><div><strong>待补货备件</strong><span class="result-count">共 {{ total }} 条</span></div><span class="formula-tip">建议量 = 最高储备 − 当前库存</span></div>
      <el-table ref="tableRef" :data="list" v-loading="loading" row-key="_id" empty-text="当前没有低库存备件" @selection-change="selectedRows = $event">
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column label="风险" width="90" align="center"><template #default="{ row }"><el-tag :type="riskTag(row.riskLevel)" effect="dark" round>{{ riskLabel(row.riskLevel) }}</el-tag></template></el-table-column>
        <el-table-column label="物料" min-width="260"><template #default="{ row }"><div class="material-cell"><strong>{{ row.materialDesc || '未命名备件' }}</strong><span>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</span></div></template></el-table-column>
        <el-table-column label="库位" min-width="150"><template #default="{ row }"><button class="location-link" type="button" @click="locate(row)"><el-icon><Location /></el-icon>{{ row.locationCode || '3D定位' }}</button><small class="area-copy">{{ row.warehouseAreaName || '未分区' }}</small></template></el-table-column>
        <el-table-column label="当前库存" width="126" align="center"><template #default="{ row }"><strong class="stock-risk">{{ row.currentStock }} {{ row.unit || '' }}</strong></template></el-table-column>
        <el-table-column label="订购点 / 最高储备" width="150" align="center"><template #default="{ row }"><span>{{ row.reorderPoint ?? '-' }} / {{ row.maxStock ?? '待配置' }}</span></template></el-table-column>
        <el-table-column label="建议补货" width="130" align="center"><template #default="{ row }"><strong v-if="row.suggestedQuantity !== null" class="suggested-quantity">{{ row.suggestedQuantity }} {{ row.unit || '' }}</strong><el-tag v-else type="info" effect="plain">待配置</el-tag></template></el-table-column>
        <el-table-column label="预计金额" width="120" align="right"><template #default="{ row }">{{ row.estimatedAmount == null ? '-' : `¥ ${formatMoney(row.estimatedAmount)}` }}</template></el-table-column>
      </el-table>
      <div class="pagination-bar"><span>第 {{ query.page }} 页，每页 {{ query.pageSize }} 条</span><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[50,100,200]" layout="sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
    </section>

  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getFilters, getReplenishment } from '../api'
import { inventoryScope, inventoryRouteQuery } from '../utils/inventory-scope.mjs'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const areas = ref([])
const selectedRows = ref([])
const tableRef = ref(null)
const summary = ref({ total: 0, zeroStock: 0, missingTarget: 0, estimatedAmount: 0, suggestedUnitTotals: [] })
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const query = reactive({ page: 1, pageSize: 100, ...inventoryScope(route.query) })
let requestToken=0,filterToken=0
const selectedUnitSummary = computed(() => {
  const totals = new Map()
  selectedRows.value.forEach(row => {
    if (row.suggestedQuantity === null || row.suggestedQuantity <= 0) return
    const unit = row.unit || '未标单位'
    totals.set(unit, (totals.get(unit) || 0) + Number(row.suggestedQuantity))
  })
  const text = [...totals].map(([unit, value]) => `${value}${unit}`).join('、')
  return text || '暂无可计算数量'
})

function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:4}) }
function formatMoney(value) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function riskLabel(level) { return level === 'critical' ? '断货' : level === 'high' ? '紧急' : '预警' }
function riskTag(level) { return level === 'critical' ? 'danger' : level === 'high' ? 'warning' : 'info' }
function goScoped(path) { router.push({ path, query: inventoryRouteQuery(query) }) }
function locate(row) { router.push({ path: '/warehouse-3d', query: { partId: row._id, ...(query.workshopCode ? { workshopCode: query.workshopCode } : {}) } }) }

async function load() {
  const token=++requestToken
  loading.value = true
  try {
    const result = await getReplenishment({ ...query })
    if(token!==requestToken)return
    list.value = result.data || []
    total.value = Number(result.total) || 0
    summary.value = result.summary || summary.value
  } finally { if(token===requestToken)loading.value = false }
}
async function loadFilters() { const token=++filterToken;const result = await getFilters({ workshopCode: query.workshopCode });if(token===filterToken)areas.value = result.data?.areas || [] }
function workshopChanged() { query.warehouseAreaName = ''; search();loadFilters() }
function clearInheritedScope(){Object.assign(query,{partType:'',stockStatus:'',lowStock:''});search()}
function search() { query.page = 1; tableRef.value?.clearSelection(); selectedRows.value=[]; load() }
function reset() { Object.assign(query, { page: 1, ...inventoryScope() }); tableRef.value?.clearSelection(); selectedRows.value=[]; loadFilters(); load() }
function buildRows() {
  return selectedRows.value.map(row => [row.materialCode, row.materialDesc, row.spec, row.warehouseAreaName, row.locationCode, row.currentStock, row.reorderPoint, row.maxStock, row.suggestedQuantity ?? '待配置', row.unit, row.estimatedAmount ?? '', riskLabel(row.riskLevel)])
}
async function copyList() {
  const header = ['物料编码','物料名称','规格型号','货区','库位','当前库存','订购点','最高储备','建议补货','单位','预计金额','风险']
  const text = [header, ...buildRows()].map(row => row.join('\t')).join('\n')
  try { await navigator.clipboard.writeText(text); ElMessage.success('补货清单已复制') } catch { ElMessage.error('浏览器未允许复制，请手动选择表格内容') }
}
onMounted(() => Promise.allSettled([load(), loadFilters()]))
</script>

<style scoped>
.replenishment-hero{position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:16px;padding:27px 30px;border-radius:21px;color:#fff;background:linear-gradient(125deg,#6f1017 0%,#a71924 55%,#cf2834 100%);box-shadow:0 18px 42px rgba(112,13,22,.19)}.replenishment-hero::after{content:"";position:absolute;right:18%;bottom:-112px;width:290px;height:290px;border:56px solid rgba(255,255,255,.06);border-radius:50%}.replenishment-hero>div{position:relative;z-index:1}.replenishment-hero span{color:#ffd2d6;font-size:10px;font-weight:900;letter-spacing:.14em}.replenishment-hero h2{margin:7px 0 0;font-size:29px}.replenishment-hero p{margin:8px 0 0;color:rgba(255,255,255,.74);font-size:13px}.hero-actions{display:flex;gap:9px}.light-button{color:#fff!important;border-color:rgba(255,255,255,.28)!important;background:rgba(255,255,255,.1)!important}.replenishment-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:16px}.replenishment-metrics article{position:relative;min-height:113px;padding:18px 20px;border:1px solid #e3e6eb;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04)}.replenishment-metrics article::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;border-radius:16px 0 0 16px;background:#c91f2c}.replenishment-metrics .is-critical::before{background:#ef4444}.replenishment-metrics .is-config::before{background:#64748b}.replenishment-metrics .is-money::before{background:#15936b}.replenishment-metrics span,.replenishment-metrics strong,.replenishment-metrics small{display:block}.replenishment-metrics span{color:#687386;font-size:12px;font-weight:800}.replenishment-metrics strong{margin-top:9px;font-size:25px}.replenishment-metrics small{margin-top:6px;color:#98a0ae;font-size:12px}.replenish-controls{margin-bottom:15px;padding:14px 16px}.replenish-filter{display:grid;grid-template-columns:minmax(150px,.75fr) minmax(280px,1.7fr) minmax(160px,.8fr) auto;gap:10px;align-items:end}.selection-summary{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:11px;padding-top:11px;border-top:1px solid #edf0f3}.selection-summary>div:first-child{display:flex;align-items:center;gap:12px;min-width:0}.selection-summary span,.selection-summary strong,.selection-summary small{display:block}.selection-summary span{color:#8f1720;font-size:12px;font-weight:800;white-space:nowrap}.selection-summary strong{font-size:14px}.selection-summary small{color:#8a93a4;font-size:12px}.selection-actions{display:flex;gap:8px;flex-wrap:wrap}.replenish-table{overflow:hidden}.formula-tip{color:#8a93a4;font-size:12px}.location-link{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;color:#1677ff;background:transparent;cursor:pointer;font-size:12px}.area-copy,.transit-copy{display:block;margin-top:4px;color:#8a93a4;font-size:12px}.stock-risk{color:#c91f2c}.suggested-quantity{color:#8f1720;font-size:14px}.order-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:1050px){.replenishment-metrics{grid-template-columns:repeat(2,1fr)}.replenish-filter{grid-template-columns:1fr 1fr}.replenish-search{grid-column:1/-1}}@media(max-width:680px){.replenishment-hero{align-items:stretch;flex-direction:column;padding:22px}.replenishment-hero h2{font-size:24px}.hero-actions .el-button{flex:1}.replenishment-metrics{gap:9px}.replenishment-metrics article{min-height:100px;padding:14px}.replenish-filter,.order-form-grid{grid-template-columns:1fr}.replenish-search{grid-column:auto}.selection-summary,.selection-summary>div:first-child{align-items:stretch;flex-direction:column}.selection-actions .el-button{flex:1}}
.replenishment-hero{padding:14px 20px;min-height:0;border-radius:14px}.replenishment-hero h2{font-size:20px;margin:0 0 5px}.replenishment-hero p{margin:0}.replenishment-metrics article{min-height:0;padding:12px 16px}.replenishment-metrics strong{margin-top:5px;font-size:22px}
</style>

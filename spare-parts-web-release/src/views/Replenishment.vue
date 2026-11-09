<template>
  <div class="replenishment-page">

    <section class="phone-inventory-filters" aria-label="补货筛选">
      <div class="phone-inventory-search"><el-input v-model="query.searchKeyword" clearable placeholder="编码、名称、规格或库位" aria-label="搜索补货备件" @keyup.enter="search" @clear="search"/><el-button type="primary" :loading="loading" @click="search">查询</el-button></div>
      <details><summary><el-icon><Filter /></el-icon><span class="inventory-scope-label">查询范围：{{query.workshopCode ? workshopName(query.workshopCode) : '全部车间'}}</span><small>筛选补货</small><el-icon><ArrowDown /></el-icon></summary><div class="phone-inventory-filter-grid"><el-select v-model="query.workshopCode" clearable placeholder="全部车间" aria-label="补货所属车间" @change="workshopChanged"><el-option label="全部车间" value=""/><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code"/></el-select><el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" aria-label="补货货区" @change="search"><el-option v-for="area in areas" :key="area" :label="area" :value="area"/></el-select><el-button v-if="query.workshopCode||query.searchKeyword||query.warehouseAreaName" @click="reset">重置筛选</el-button></div></details>
      <p v-if="query.partType||query.stockStatus||query.lowStock" class="inherited-scope">沿用库存筛选<el-button text size="small" @click="clearInheritedScope">清除范围</el-button></p>
    </section>
    <section class="panel replenish-controls inventory-desktop-filter">
      <div class="replenish-filter">
        <div class="filter-field"><label>所属车间</label><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="workshopChanged"><el-option label="全部车间" value="" /><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></div>
        <div class="filter-field replenish-search"><label>关键词</label><el-input v-model="query.searchKeyword" clearable placeholder="物料编码、名称、规格或库位" @keyup.enter="search" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
        <div class="filter-field"><label>货区</label><el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" style="width:100%" @change="search"><el-option v-for="area in areas" :key="area" :label="area" :value="area" /></el-select></div>
        <div class="filter-actions"><el-button v-if="query.workshopCode || query.searchKeyword || query.warehouseAreaName || query.partType || query.stockStatus || query.lowStock" text @click="reset">重置</el-button><el-button :loading="loading" @click="search">查询</el-button></div>
      </div>
      <p v-if="query.partType||query.stockStatus||query.lowStock" class="inherited-scope">沿用库存范围：{{[query.partType,query.stockStatus,query.lowStock?'低库存':''].filter(Boolean).join(' · ')}}<el-button text size="small" @click="clearInheritedScope">清除范围</el-button></p>
    </section>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon><el-button size="small" @click="load">重试</el-button></el-alert>
    <el-alert v-if="filterError" title="货区读取失败，可重试或使用其他条件查询" type="warning" :closable="false"><el-button size="small" @click="loadFilters">重试货区</el-button></el-alert>

    <section v-if="!nativeAndroid" class="replenishment-metrics">
      <article><div class="metric-top"><span>低库存记录</span><span class="metric-icon"><el-icon><Warning /></el-icon></span></div><strong class="metric-value">{{ loadError ? '—' : formatNumber(summary.total) }}</strong><small class="metric-note">已达到或低于订购点</small></article>
      <article class="is-critical"><div class="metric-top"><span>零库存</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div><strong class="metric-value">{{ loadError ? '—' : formatNumber(summary.zeroStock) }}</strong></article>
      <article class="is-config"><div class="metric-top"><span>未设最高储备</span><span class="metric-icon"><el-icon><Setting /></el-icon></span></div><strong class="metric-value">{{ loadError ? '—' : formatNumber(summary.missingTarget) }}</strong></article>
      <article class="is-money"><div class="metric-top"><span>预计补货金额</span><span class="metric-icon"><el-icon><Money /></el-icon></span></div><strong class="metric-value">{{ loadError ? '—' : `¥ ${formatMoney(summary.estimatedAmount)}` }}</strong><small class="metric-note">当前筛选范围，已配置单价与目标的记录</small></article>
    </section>


    <section class="panel replenish-table">
      <div class="table-toolbar replenish-record-heading"><div><strong>待补货备件</strong><span class="result-count">共 {{ total }} 条</span></div><div v-if="!nativeAndroid" class="replenishment-table-tools"><span class="formula-tip">建议量 = 最高储备 − 当前库存</span></div></div>
      <div v-if="!nativeAndroid" class="selection-summary">
        <div class="selection-details"><template v-if="selectedRows.length"><span>已选 {{ selectedRows.length }} 条</span><strong>{{ selectedUnitSummary }}</strong><span class="selection-amount-label">已选补货金额</span><strong>¥ {{ formatMoney(selectedReplenishmentAmount) }}</strong></template><small v-else>未选择备件</small></div>
        <div v-if="!nativeAndroid" class="selection-actions"><el-button v-if="!nativeAndroid" :disabled="loading||!!loadError||!selectedRows.length" @click="exportList"><el-icon><Download /></el-icon>导出表格清单</el-button></div>
      </div>

      <div class="phone-records replenish-records" v-loading="loading" aria-label="补货备件列表">
        <el-checkbox v-if="!nativeAndroid" :disabled="loading||!!loadError||!list.length" :model-value="list.length>0&&list.every(row=>selectedRows.some(item=>item._id===row._id))" :indeterminate="list.some(row=>selectedRows.some(item=>item._id===row._id))&&!list.every(row=>selectedRows.some(item=>item._id===row._id))" @change="value=>list.forEach(row=>tableRef?.toggleRowSelection(row,value))">选择当前页</el-checkbox>
        <article v-for="row in list" :key="row._id" class="phone-record phone-replenish-record">
          <header><el-checkbox v-if="!nativeAndroid" :disabled="!canSelectRow(row)" :aria-label="`选择${row.materialDesc}`" :model-value="selectedRows.some(item=>item._id===row._id)" @change="value=>tableRef?.toggleRowSelection(row,value)"/><strong>{{ row.materialDesc || '未命名备件' }}</strong><el-tag size="small" :type="riskTag(row.riskLevel)">{{riskLabel(row.riskLevel)}}</el-tag></header>
          <p>{{ row.materialCode }}</p><p v-if="row.spec && row.spec!==row.materialDesc">规格：{{ row.spec }}</p>
          <p class="replenish-location">{{workshopName(row.workshopCode)}} · {{[row.warehouseAreaName,row.locationCode || row.locationNote].filter(Boolean).join(' · ') || '位置待补充'}}</p>
          <dl class="replenish-quantities"><div><dt>当前库存</dt><dd class="stock-risk">{{ formatNumber(row.currentStock) }} <small>{{ row.unit || '' }}</small></dd></div><div><dt>建议补货</dt><dd>{{ row.suggestedQuantity == null ? '待配置' : formatNumber(row.suggestedQuantity) }} <small v-if="row.suggestedQuantity!=null">{{row.unit || ''}}</small></dd></div></dl>
          <div class="replenish-basis"><span>订购点 {{row.reorderPoint ?? '未配置'}} · 最高储备 {{row.maxStock ?? '未配置'}}</span><span>预计金额 {{row.estimatedAmount == null ? '未配置' : `¥ ${formatMoney(row.estimatedAmount)}`}}</span></div>
          <footer><el-button link type="primary" @click="openInventory(row)">库存详情</el-button><el-button link type="primary" @click="locate(row)"><el-icon><Location /></el-icon>3D定位</el-button></footer>
        </article><el-empty v-if="!loading&&!loadError&&!list.length" description="当前没有低库存备件" />
      </div>
      <el-table v-if="!nativeAndroid" class="phone-replaced-table" ref="tableRef" :data="list" v-loading="loading" row-key="_id" :empty-text="loadError ? '补货清单读取失败，请重试' : '当前没有低库存备件'" @selection-change="selectionChanged">
        <el-table-column v-if="!nativeAndroid" type="selection" width="48" reserve-selection :selectable="canSelectRow" />
        <el-table-column label="风险" width="90" align="center"><template #default="{ row }"><el-tag :type="riskTag(row.riskLevel)" effect="dark" round>{{ riskLabel(row.riskLevel) }}</el-tag></template></el-table-column>
        <el-table-column label="物料" min-width="260"><template #default="{ row }"><div class="material-cell"><strong>{{ row.materialDesc || '未命名备件' }}</strong><span>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</span></div></template></el-table-column>
        <el-table-column label="库位" min-width="150"><template #default="{ row }"><button class="location-link" type="button" @click="locate(row)"><el-icon><Location /></el-icon>{{ row.locationCode || '3D定位' }}</button><small class="area-copy">{{ row.warehouseAreaName || '未分区' }}</small></template></el-table-column>
        <el-table-column label="当前库存" width="126" align="center"><template #default="{ row }"><strong class="stock-risk">{{ row.currentStock }} {{ row.unit || '' }}</strong></template></el-table-column>
        <el-table-column label="订购点 / 最高储备" width="150" align="center"><template #default="{ row }"><span>{{ row.reorderPoint ?? '-' }} / {{ row.maxStock ?? '待配置' }}</span></template></el-table-column>
        <el-table-column label="建议补货" width="130" align="center"><template #default="{ row }"><strong v-if="row.suggestedQuantity !== null" class="suggested-quantity">{{ row.suggestedQuantity }} {{ row.unit || '' }}</strong><el-tag v-else type="info" effect="plain">待配置</el-tag></template></el-table-column>
        <el-table-column label="预计金额" width="120" align="right"><template #default="{ row }">{{ row.estimatedAmount == null ? '-' : `¥ ${formatMoney(row.estimatedAmount)}` }}</template></el-table-column>
      </el-table>
      <div class="pagination-bar" :class="{'is-single-page':total<=query.pageSize}"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[20,50,100,200]" layout="sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
    </section>

  </div>
</template>

<script setup>
import {isAppSurface} from '../app/surface.mjs'
const nativeAndroid=isAppSurface()

import { computed, onMounted, onBeforeUnmount, nextTick, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { getFilters, getReplenishment } from '../api'
import { inventoryRouteQuery, inventoryScope } from '../utils/inventory-scope.mjs'
import { getUser } from '../auth'
import { collectParts } from '../utils/collect-parts.mjs'
import { boundedPage, createListViewState, selectedRowsFromIds } from '../utils/list-view-state.mjs'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const loadError = ref(''), filterError = ref(false)
const list = ref([])
const total = ref(0)
const areas = ref([])
const selectedRows = ref([])
const tableRef = ref(null)
const summary = ref({ total: 0, zeroStock: 0, missingTarget: 0, estimatedAmount: 0, suggestedUnitTotals: [] })
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const query = reactive({ page: 1, pageSize: nativeAndroid?20:100, ...inventoryScope(route.query) })
const viewState = createListViewState({ view: 'replenishment', user: getUser(), scope: { ...route.query }, queryKeys: Object.keys(query) })
const restoredState = viewState.read()
if (restoredState) Object.assign(query, restoredState.query, { page: boundedPage(restoredState.query.page), pageSize: [20, 50, 100, 200].includes(Number(restoredState.query.pageSize)) ? Number(restoredState.query.pageSize) : nativeAndroid ? 20 : 100 })
let selectedIds = restoredState?.selectedIds || []
let restoreScroll = restoredState?.scrollTop ?? null
let restoringSelection = false
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
const selectedReplenishmentAmount = computed(() => selectedRows.value.reduce((sum,row) => sum + Number(row.estimatedAmount || 0), 0))

function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:4}) }
function formatMoney(value) { return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function riskLabel(level) { return level === 'critical' ? '断货' : level === 'high' ? '紧急' : '预警' }
function riskTag(level) { return level === 'critical' ? 'danger' : level === 'high' ? 'warning' : 'info' }
function workshopName(code) { return workshops.find(item=>item.code===code)?.name || '未分车间' }
function openInventory(row) { router.push({path:'/inventory',query:inventoryRouteQuery({workshopCode:row.workshopCode},{inventoryId:row._id,searchKeyword:row.materialCode})}) }
function locate(row) { router.push({ path: '/warehouse-3d', query: inventoryRouteQuery({workshopCode:row.workshopCode}, { partId: row._id }) }) }

async function load() {
  const token=++requestToken
  loading.value = true
  try {
    const params = { ...query }
    const wantedIds = [...selectedIds]
    const result = await getReplenishment(params)
    if(token!==requestToken)return
    // Rehydrate selected IDs from current server rows, including selections on other pages.
    // Saved stock, suggested quantities and export amounts are never reused.
    let freshSelection = []
    if (wantedIds.length) {
      const visibleIds = new Set((result.data || []).map(row => String(row._id)))
      const rows = wantedIds.every(id => visibleIds.has(id)) ? result.data || [] : await collectParts(getReplenishment, params, () => token === requestToken)
      if (token !== requestToken || !rows) return
      freshSelection = selectedRowsFromIds(wantedIds, rows)
    }
    restoringSelection = true
    tableRef.value?.clearSelection()
    list.value = result.data || []
    total.value = Number(result.total) || 0
    summary.value = result.summary || summary.value
    selectedRows.value = freshSelection
    selectedIds = freshSelection.map(row => String(row._id))
    loadError.value = ''
    await nextTick()
    if (token !== requestToken) return
    freshSelection.forEach(row => tableRef.value?.toggleRowSelection(row, true))
    restoringSelection = false
    if (wantedIds.length > selectedIds.length) ElMessage.info('部分已选备件已不在当前补货范围，已按最新数据取消勾选。')
    const lastPage = Math.max(1, Math.ceil(total.value / query.pageSize))
    if (query.page > lastPage) { query.page = lastPage; return load() }
    if (!list.value.length && total.value > 0) loadError.value = '补货数量与明细暂未同步，请重试后核对清单。'
    if (restoreScroll !== null) { window.scrollTo(0, restoreScroll); restoreScroll = null }
  } catch { if (token === requestToken) { restoringSelection = true; tableRef.value?.clearSelection(); list.value = []; selectedRows.value = []; total.value = 0; loadError.value = '补货清单读取失败，当前结果和勾选尚未核实，重试成功后才能导出。' } }
  finally { if(token===requestToken) { restoringSelection = false; loading.value = false } }
}
async function loadFilters() { const token=++filterToken; try { const result = await getFilters({ workshopCode: query.workshopCode });if(token===filterToken) { areas.value = result.data?.areas || []; filterError.value = false } } catch { if(token===filterToken) { areas.value = []; filterError.value = true } } }
function workshopChanged() { query.warehouseAreaName = ''; search();loadFilters() }
function clearInheritedScope(){Object.assign(query,{partType:'',stockStatus:'',lowStock:''});search()}
function search() { query.page = 1; tableRef.value?.clearSelection(); selectedRows.value=[]; selectedIds=[]; restoreScroll=null; return load() }
function reset() { Object.assign(query, { page: 1, ...inventoryScope() }); tableRef.value?.clearSelection(); selectedRows.value=[]; selectedIds=[]; restoreScroll=null; loadFilters(); return load() }
function canSelectRow() { return !loading.value && !loadError.value }
function selectionChanged(rows) { if (restoringSelection || loading.value) return; selectedRows.value = rows; selectedIds = rows.map(row => String(row._id)) }
function buildRows() { return selectedRows.value.map(row => [row.materialCode,row.materialDesc,row.spec,row.warehouseAreaName,row.locationCode,row.currentStock,row.reorderPoint,row.maxStock,row.suggestedQuantity ?? '待配置',row.unit,row.estimatedAmount ?? '',riskLabel(row.riskLevel)]) }
function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`}
function exportList(){if(loading.value||loadError.value||!selectedRows.value.length)return;const header=['物料编码','物料名称','规格型号','货区','库位','当前库存','订购点','最高储备','建议补货','单位','预计金额','风险'];const csv='\uFEFF'+[header,...buildRows()].map(row=>row.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`补货清单-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);ElMessage.success(`已导出 ${selectedRows.value.length} 条补货清单`)}
function rememberView() { viewState.save({ query: { ...query }, selectedIds, scrollTop: window.scrollY }) }
onBeforeRouteLeave(rememberView)
onMounted(() => Promise.allSettled([load(), loadFilters()]))
onBeforeUnmount(() => { rememberView(); requestToken++; filterToken++ })
</script>

<style scoped>
.replenishment-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:16px}.replenishment-metrics article{position:relative;min-height:113px;padding:18px 20px;border:1px solid #e3e6eb;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04)}.replenishment-metrics article::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;border-radius:16px 0 0 16px;background:#c91f2c}.replenishment-metrics .is-critical::before{background:#ef4444}.replenishment-metrics .is-config::before{background:#64748b}.replenishment-metrics .is-money::before{background:#15936b}.replenishment-metrics span,.replenishment-metrics strong,.replenishment-metrics small{display:block}.replenishment-metrics span{color:#687386;font-size:12px;font-weight:800}.replenishment-metrics strong{margin-top:9px;font-size:25px}.replenishment-metrics small{margin-top:6px;color:#98a0ae;font-size:12px}.replenish-controls{margin-bottom:15px;padding:14px 16px}.replenish-filter{display:grid;grid-template-columns:minmax(180px,.85fr) minmax(320px,2.4fr) minmax(180px,.85fr) auto;gap:12px;align-items:end}.selection-summary{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 20px 16px}.selection-details{display:flex;align-items:center;gap:12px;min-width:0;flex-wrap:wrap}.selection-details span,.selection-details strong,.selection-details small{display:inline-block}.selection-details>span:first-child{color:#8f1720;font-size:12px;font-weight:800;white-space:nowrap}.selection-details strong{font-size:14px}.selection-details small{color:#8a93a4;font-size:12px}.selection-details .selection-amount-label{padding-left:12px;border-left:1px solid #dfe4ec;color:#667085;font-size:12px;font-weight:700;white-space:nowrap}.selection-actions{display:flex;gap:8px;flex-wrap:wrap}.replenish-table{overflow:hidden}.formula-tip{color:#8a93a4;font-size:12px}.replenishment-table-tools{display:flex;align-items:center;gap:8px}.refresh-list-button{font-size:16px}.location-link{display:inline-flex;align-items:center;gap:5px;padding:0;border:0;color:#1677ff;background:transparent;cursor:pointer;font-size:12px}.area-copy,.transit-copy{display:block;margin-top:4px;color:#8a93a4;font-size:12px}.stock-risk{color:#c91f2c}.suggested-quantity{color:#8f1720;font-size:14px}.order-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:1050px){.replenishment-metrics{grid-template-columns:repeat(2,1fr)}.replenish-filter{grid-template-columns:1fr 1fr}.replenish-search{grid-column:1/-1}}@media(max-width:680px){.replenishment-metrics{gap:9px}.replenishment-metrics article{min-height:100px;padding:14px}.replenish-filter,.order-form-grid{grid-template-columns:1fr}.replenish-search{grid-column:auto}.selection-summary{align-items:stretch;flex-direction:column}.selection-details{align-items:flex-start;flex-direction:column;gap:8px}.selection-details .selection-amount-label{padding:0;border:0}.selection-actions .el-button{width:100%}}
</style>

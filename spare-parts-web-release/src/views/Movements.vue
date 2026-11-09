<template>
  <div class="movements-page">
    <section class="phone-inventory-filters" aria-label="流水筛选">
      <div class="phone-inventory-search"><el-input v-model="query.searchKeyword" clearable placeholder="编码、名称、操作人或单号" aria-label="搜索库存流水" @keyup.enter="search" @clear="search"/><el-button type="primary" :loading="loading" @click="search">查询</el-button></div>
      <details><summary>筛选流水<span v-if="query.workshopCode||query.type||query.reasonCode||dateRange.length">已筛选</span></summary><div class="phone-inventory-filter-grid">
        <el-select v-model="query.workshopCode" clearable placeholder="全部车间" aria-label="流水所属车间" @change="workshopChanged"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code"/></el-select>
        <el-select v-model="query.type" clearable placeholder="全部操作" aria-label="流水操作类型" @change="search"><el-option label="入库" value="in"/><el-option label="出库" value="out"/><el-option label="盘点调整" value="inventory_adjustment"/><el-option label="初始建账" value="initial"/></el-select>
        <el-select v-model="query.reasonCode" clearable placeholder="全部原因" aria-label="流水原因分类" @change="search"><el-option-group label="入库"><el-option v-for="item in reasonOptions.in" :key="item.value" :label="item.label" :value="item.value"/></el-option-group><el-option-group label="出库"><el-option v-for="item in reasonOptions.out" :key="item.value" :label="item.label" :value="item.value"/></el-option-group></el-select>
        <div class="phone-filter-dates"><label>开始日期<input v-model="dateRange[0]" type="date" aria-label="流水开始日期" @change="search"/></label><label>结束日期<input v-model="dateRange[1]" type="date" aria-label="流水结束日期" @change="search"/></label></div>
        <el-button v-if="query.workshopCode||query.searchKeyword||query.type||query.reasonCode||dateRange.length" @click="reset">重置筛选</el-button>
      </div></details>
    </section>
    <section class="panel movement-filter inventory-desktop-filter">
      <div class="filter-field"><label>所属车间</label><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="workshopChanged"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></div>
      <div class="filter-field movement-search"><label>关键词</label><el-input v-model="query.searchKeyword" clearable placeholder="物料编码、名称、原因、操作人或盘点单号" @keyup.enter="search" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
      <div class="filter-field"><label>操作类型</label><el-select v-model="query.type" clearable placeholder="全部操作" style="width:100%" @change="search"><el-option label="入库" value="in" /><el-option label="出库" value="out" /><el-option label="盘点调整" value="inventory_adjustment" /><el-option label="初始建账" value="initial" /></el-select></div>
      <div class="filter-field"><label>原因分类</label><el-select v-model="query.reasonCode" clearable placeholder="全部原因" style="width:100%" @change="search"><el-option-group label="入库"><el-option v-for="item in reasonOptions.in" :key="item.value" :label="item.label" :value="item.value" /></el-option-group><el-option-group label="出库"><el-option v-for="item in reasonOptions.out" :key="item.value" :label="item.label" :value="item.value" /></el-option-group></el-select></div>
      <div class="filter-field"><label>时间范围</label><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%" @change="search" /></div>
      <div class="filter-actions"><el-button v-if="query.workshopCode || query.searchKeyword || query.warehouseAreaName || query.partType || query.stockStatus || query.lowStock || query.activeOnly || query.type || query.reasonCode || dateRange?.length" text @click="reset">重置</el-button><el-button :loading="loading" @click="search">查询</el-button></div>
    </section>

    <p v-if="query.warehouseAreaName||query.partType||query.stockStatus||query.lowStock||query.activeOnly" class="inherited-scope">沿用库存范围：{{[query.warehouseAreaName,query.partType,query.stockStatus,query.lowStock?'低库存':'',query.activeOnly?'仅当前有效备件':''].filter(Boolean).join(' · ')}}<el-button text size="small" @click="clearInheritedScope">清除范围</el-button></p>
    <section class="panel movement-table">
      <div class="table-toolbar"><div><strong>流水明细</strong><span class="result-count">共 {{ total }} 条</span></div></div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon><el-button size="small" @click="load">重试</el-button></el-alert>
      <el-alert v-if="reasonsError" title="原因分类加载失败，仍可查询流水" type="warning" :closable="false"><el-button size="small" @click="loadReasons">重试原因分类</el-button></el-alert>
      <div class="phone-records movement-records" v-loading="loading" aria-label="库存流水列表">
        <article v-for="row in list" :key="row.id" class="phone-record">
          <header><el-tag :type="movementTag(row.type)" effect="light">{{ movementLabel(row.type) }}</el-tag><time>{{ formatDate(row.createdAt) }}</time></header>
          <div class="phone-record-title"><strong>{{ row.materialDesc || '未命名备件' }}</strong><b :class="`movement-${row.type}`">{{ signedQuantity(row) }} {{ row.unit || '' }}</b></div>
          <p>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</p>
          <dl><div><dt>库存变化</dt><dd>{{ row.beforeQuantity }} → {{ row.afterQuantity }} {{ row.unit }}</dd></div><div><dt>操作人</dt><dd>{{ row.operatorName || '系统' }}</dd></div></dl>
          <p v-if="row.reason">{{ row.reason }}</p><p v-if="associationText(row)">{{ associationText(row) }}</p>
          <footer><button v-if="row.inventoryId && row.locationCode" class="phone-location" type="button" @click="locateMovement(row)"><el-icon><Location /></el-icon>{{ locationText(row) }}<el-icon><ArrowRight /></el-icon></button><span v-else>{{ locationText(row) }}</span></footer>
        </article><el-empty v-if="!loading&&!loadError&&!list.length" description="暂无符合条件的库存流水" />
      </div>
      <el-table v-if="!nativeAndroid" class="phone-replaced-table" :data="list" v-loading="loading" row-key="id" :empty-text="loadError ? '流水读取失败，请重试' : '暂无符合条件的库存流水'">
        <el-table-column label="时间" width="158"><template #default="{ row }"><span class="time-cell">{{ formatDate(row.createdAt) }}</span></template></el-table-column>
        <el-table-column label="类型" width="100" align="center"><template #default="{ row }"><el-tag :type="movementTag(row.type)" effect="light" round>{{ movementLabel(row.type) }}</el-tag></template></el-table-column>
        <el-table-column label="物料" min-width="250"><template #default="{ row }"><div class="material-cell"><strong>{{ row.materialDesc || '未命名备件' }}</strong><span>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</span></div></template></el-table-column>
        <el-table-column label="变动" width="138" align="center"><template #default="{ row }"><div class="quantity-change" :class="`is-${row.type}`"><strong>{{ signedQuantity(row) }} {{ row.unit || '' }}</strong><small>{{ row.beforeQuantity }} → {{ row.afterQuantity }}</small></div></template></el-table-column>
        <el-table-column label="库位" min-width="160"><template #default="{ row }"><button v-if="row.inventoryId && row.locationCode" class="location-link" type="button" @click="locateMovement(row)"><el-icon><Location /></el-icon>{{ locationText(row) }}</button><span v-else class="location-cell"><el-icon><Location /></el-icon>{{ locationText(row) }}</span></template></el-table-column>
        <el-table-column prop="reason" label="原因 / 关联对象" min-width="250" show-overflow-tooltip><template #default="{ row }"><div class="reason-cell"><span>{{ row.reason || '-' }}</span><small v-if="associationText(row)">{{ associationText(row) }}</small></div></template></el-table-column>
        <el-table-column label="操作人" width="110"><template #default="{ row }">{{ row.operatorName || '系统' }}</template></el-table-column>
      </el-table>
      <div class="pagination-bar" :class="{'is-single-page':total<=query.pageSize}"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[20,50,100]" layout="sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
    </section>
  </div>
</template>

<script setup>
import {isAppSurface} from '../app/surface.mjs'
const nativeAndroid=isAppSurface()

import { onMounted, onBeforeUnmount, nextTick, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { getMovementReasons, getStockMovements } from '../api'
import { inventoryScope } from '../utils/inventory-scope.mjs'
import { getUser } from '../auth'
import { boundedPage, createListViewState } from '../utils/list-view-state.mjs'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const loadError = ref(''), reasonsError = ref(false)
const reasonOptions = ref({ in: [], out: [] })
const dateRange = ref(route.query.dateFrom && route.query.dateTo ? [String(route.query.dateFrom),String(route.query.dateTo)] : [])
const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const query = reactive({ page: 1, pageSize: 20, ...inventoryScope(route.query), searchKeyword: String(route.query.searchKeyword || route.query.search || ''), activeOnly:route.query.activeOnly==='1'?'1':'', type: '', reasonCode: '' })
const viewState = createListViewState({ view: 'movements', user: getUser(), scope: { ...route.query }, queryKeys: [...Object.keys(query), 'dateFrom', 'dateTo'] })
const restoredState = viewState.read()
if (restoredState) {
  const { dateFrom, dateTo, ...savedQuery } = restoredState.query
  Object.assign(query, savedQuery, { page: boundedPage(savedQuery.page), pageSize: [20, 50, 100].includes(savedQuery.pageSize) ? savedQuery.pageSize : 20 })
  dateRange.value = dateFrom && dateTo ? [dateFrom, dateTo] : []
}
let restoreScroll = restoredState?.scrollTop ?? null
let requestToken=0

function movementLabel(type) { return ({ in: '入库', out: '出库', inventory_adjustment: '盘点调整', initial: '初始建账' })[type] || '其他' }
function movementTag(type) { return type === 'in' ? 'success' : type === 'out' ? 'danger' : type === 'inventory_adjustment' ? 'warning' : 'info' }
function signedQuantity(row) { return row.type === 'out' ? `-${row.quantity}` : row.type === 'in' || row.type === 'initial' ? `+${row.quantity}` : `${row.afterQuantity - row.beforeQuantity >= 0 ? '+' : ''}${row.afterQuantity - row.beforeQuantity}` }
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '-' }
function locationText(row) { return row.locationCode || [row.warehouseAreaName, row.shelf == null ? '' : `${row.shelf}号架`, row.layer == null ? '' : `${row.layer}层`].filter(Boolean).join(' · ') || '未设置库位' }
function associationText(row) { return [row.relatedOrderNo, row.batchNo && `批次 ${row.batchNo}`, row.department, row.recipient, row.equipmentName, row.maintenanceOrderNo].filter(Boolean).join(' · ') }
function locateMovement(row) { router.push({ path: '/warehouse-3d', query: { partId: row.inventoryId } }) }

async function load() {
  const token=++requestToken
  loading.value = true
  try {
    const result = await getStockMovements({ ...query, dateFrom: dateRange.value?.[0], dateTo: dateRange.value?.[1] })
    if(token!==requestToken)return
    list.value = result.data || []
    total.value = Number(result.total) || 0
    loadError.value = ''
    const lastPage = Math.max(1, Math.ceil(total.value / query.pageSize))
    if (query.page > lastPage) { query.page = lastPage; return load() }
    if (!list.value.length && total.value > 0) loadError.value = '流水数量与明细暂未同步，请重试；当前没有可确认的明细。'
    if (restoreScroll !== null) { await nextTick(); if (token === requestToken) { window.scrollTo(0, restoreScroll); restoreScroll = null } }
  } catch { if (token === requestToken) { list.value = []; total.value = 0; loadError.value = '流水读取失败，当前筛选结果尚未取得，请重试。' } }
  finally { if(token===requestToken)loading.value = false }
}
function search() { dateRange.value = Array.isArray(dateRange.value) ? dateRange.value : []; query.page = 1; restoreScroll = null; return load() }
function workshopChanged(){query.warehouseAreaName='';search()}
function clearInheritedScope(){Object.assign(query,{warehouseAreaName:'',partType:'',stockStatus:'',lowStock:'',activeOnly:''});search()}
function reset() { Object.assign(query, { page: 1, ...inventoryScope(), activeOnly:'', type: '', reasonCode: '' }); dateRange.value = []; restoreScroll = null; return load() }
async function loadReasons() { try { const result = await getMovementReasons(); reasonOptions.value = result.data || reasonOptions.value; reasonsError.value = false } catch { reasonsError.value = true } }
function rememberView() { viewState.save({ query: { ...query, dateFrom: dateRange.value?.[0] || '', dateTo: dateRange.value?.[1] || '' }, scrollTop: window.scrollY }) }
onBeforeRouteLeave(rememberView)
onMounted(() => Promise.allSettled([loadReasons(), load()]))
onBeforeUnmount(() => { rememberView(); requestToken++ })
</script>

<style scoped>
.location-link{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;color:#1677ff;background:transparent;cursor:pointer;font:inherit;text-align:left}.location-link:hover{text-decoration:underline}
.movement-filter{display:grid;grid-template-columns:minmax(130px,.72fr) minmax(210px,1.25fr) minmax(125px,.7fr) minmax(150px,.82fr) minmax(250px,1.25fr) auto;gap:10px;align-items:end;margin-bottom:16px;padding:14px 16px}.movement-table{overflow:hidden}.time-cell{color:#4b5563;font-variant-numeric:tabular-nums}.quantity-change strong,.quantity-change small,.reason-cell span,.reason-cell small{display:block}.quantity-change strong{font-size:13px}.quantity-change small{margin-top:3px;color:#8a93a4;font-size:12px}.quantity-change.is-in strong{color:#15803d}.quantity-change.is-out strong{color:#c91f2c}.quantity-change.is-inventory_adjustment strong{color:#b45309}.reason-cell small{margin-top:4px;color:#8a93a4;font-size:12px}@media(max-width:1350px){.movement-filter{grid-template-columns:repeat(3,minmax(0,1fr))}.movement-search{grid-column:auto}.movement-filter .filter-actions{grid-column:3;justify-content:flex-end}}@media(max-width:1100px){.movement-filter{grid-template-columns:1fr 1fr}.movement-filter .filter-actions{grid-column:2}}@media(max-width:680px){.movement-filter{grid-template-columns:1fr}.movement-search,.movement-filter .filter-actions{grid-column:auto}}
</style>

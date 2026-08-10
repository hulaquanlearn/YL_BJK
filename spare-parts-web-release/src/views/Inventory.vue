<template>
  <div>
    <div class="page-head">
      <div>
        <h2>备件库存一览</h2>
        <p>快速定位备件、查看库位，并处理库存预警。</p>
      </div>
      <div class="head-actions">
        <el-button @click="$router.push('/movements')"><el-icon><Switch /></el-icon>库存流水</el-button>
        <el-button @click="$router.push('/replenishment')"><el-icon><ShoppingCartFull /></el-icon>补货清单</el-button>
        <el-button type="primary" plain @click="$router.push('/statistics')"><el-icon><DataAnalysis /></el-icon>备件统计</el-button>
        <el-button :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon>刷新数据
        </el-button>
      </div>
    </div>

    <section class="metric-grid inventory-metric-grid" aria-label="库存指标">
      <article class="metric-card is-parts">
        <div class="metric-top"><span>备件种类</span><span class="metric-icon"><el-icon><Tickets /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.partTypes) }}</div>
        <div class="metric-note">当前数据库中的物料种类</div>
      </article>
      <article class="metric-card is-stock">
        <div class="metric-top"><span>库存记录</span><span class="metric-icon"><el-icon><Box /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.inventoryRecords) }}</div>
        <div class="metric-note" :title="unitSummary">{{ unitSummary }}</div>
      </article>
      <button type="button" class="metric-card is-alert is-clickable" @click="showLowStock">
        <div class="metric-top"><span>低库存预警</span><span class="metric-icon"><el-icon><Warning /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.lowStock) }}</div>
        <div class="metric-note">点击只看需要补充的备件</div>
      </button>
      <button type="button" class="metric-card is-quality is-clickable" @click="$router.push('/data-quality?issue=missing_reorder_point')">
        <div class="metric-top"><span>订购点未配置</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.unconfiguredStock) }}</div>
        <div class="metric-note">点击进入数据质量修复</div>
      </button>
      <button type="button" class="metric-card is-pending is-clickable" @click="$router.push('/check?status=待审批')">
        <div class="metric-top"><span>待审批盘点</span><span class="metric-icon"><el-icon><DocumentChecked /></el-icon></span></div>
        <div class="metric-value">{{ formatNumber(dashboard.pendingApproval) }}</div>
        <div class="metric-note">点击进入盘点审批</div>
      </button>
    </section>

    <section class="panel filter-panel">
      <div class="filter-row">
        <div class="filter-field">
          <label for="part-search">关键词</label>
          <el-input id="part-search" v-model="query.searchKeyword" clearable placeholder="输入编码、名称、规格、品牌或库位" @keyup.enter="search" @clear="search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="filter-field">
          <label>货区</label>
          <el-select v-model="query.warehouseAreaName" clearable filterable placeholder="全部货区" style="width:100%" @change="search">
            <el-option v-for="area in areas" :key="area" :label="area" :value="area" />
          </el-select>
        </div>
        <div class="filter-field">
          <label>排序方式</label>
          <el-select v-model="query.sort" style="width:100%" @change="search">
            <el-option label="名称顺序" value="name" />
            <el-option label="库存从低到高" value="stockAsc" />
            <el-option label="库存从高到低" value="stockDesc" />
            <el-option label="编码顺序" value="codeAsc" />
          </el-select>
        </div>
        <div class="filter-actions">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
        </div>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="table-toolbar">
        <div>
          <strong>{{ query.lowStock ? '低库存备件' : '库存明细' }}</strong>
          <span class="result-count">共 {{ total }} 条</span>
        </div>
        <div class="table-actions">
          <el-button v-if="query.lowStock" type="danger" plain size="small" @click="clearLowStock">退出预警筛选</el-button>
          <el-button v-if="isAdmin" :disabled="!selectedRows.length" type="primary" plain size="small" @click="openBatch"><el-icon><Operation /></el-icon>批量出入库（{{ selectedRows.length }}）</el-button>
          <el-popover placement="bottom-end" :width="220" trigger="click"><template #reference><el-button size="small"><el-icon><Grid /></el-icon>自定义列</el-button></template><div class="column-picker"><strong>显示字段</strong><el-checkbox-group v-model="visibleColumns"><el-checkbox v-for="item in columnOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></div></el-popover>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" row-key="_id" empty-text="没有找到符合条件的备件" @selection-change="selectedRows=$event">
        <el-table-column v-if="isAdmin" type="selection" width="48" reserve-selection />
        <el-table-column label="物料" min-width="250" fixed="left">
          <template #default="{ row }">
            <div class="material-cell">
              <strong>{{ row.materialDesc || '未命名备件' }}</strong>
              <span>{{ row.materialCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="columnVisible('partType')" prop="partType" label="备件类型" min-width="105" show-overflow-tooltip>
          <template #default="{ row }">{{ row.partType || '未填写' }}</template>
        </el-table-column>
        <el-table-column v-if="columnVisible('spec')" prop="spec" label="规格型号" min-width="150" show-overflow-tooltip>
          <template #default="{ row }"><span class="spec-cell">{{ row.spec || '未填写' }}</span></template>
        </el-table-column>
        <el-table-column v-if="columnVisible('location')" label="货区 / 库位" min-width="180">
          <template #default="{ row }">
            <span class="location-cell"><el-icon><Location /></el-icon>{{ locationText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="当前库存" width="112" align="center" sortable :sort-method="(a,b) => a.totalStock-b.totalStock">
          <template #default="{ row }">
            <span class="stock-number" :class="{ 'is-low': isLow(row) }">{{ row.totalStock }}</span>
            <span style="margin-left:4px;color:#8a93a4;font-size:11px">{{ row.unit || '个' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="columnVisible('reorderPoint')" label="订购点" width="100" align="center">
          <template #default="{ row }">{{ row.reorderPoint ?? '-' }}</template>
        </el-table-column>
        <el-table-column v-if="columnVisible('status')" label="库存状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="inventoryHealth(row).type" effect="light" round size="small">
              {{ inventoryHealth(row).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="205" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" @click="locate3d(row)">3D定位</el-button>
            <el-button v-if="isAdmin" link type="primary" :disabled="row.inventoryStatus === '待审批'" @click="openStock(row)">出入库</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <span>第 {{ query.page }} 页，每页 {{ query.pageSize }} 条</span>
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="sizes, prev, pager, next"
          @current-change="load"
          @size-change="search"
        />
      </div>
    </section>

    <el-drawer v-model="detailVisible" title="备件详情" size="min(620px, 94vw)">
      <template v-if="currentPart">
        <div class="detail-hero">
          <div>
            <h2>{{ currentPart.materialDesc }}</h2>
            <p>{{ currentPart.materialCode }}</p>
          </div>
          <div class="detail-stock">
            <strong>{{ currentPart.totalStock }} {{ currentPart.unit || '个' }}</strong>
            <span>当前库存</span>
          </div>
        </div>
        <div class="detail-actions">
          <el-button type="primary" @click="locate3d(currentPart)"><el-icon><LocationFilled /></el-icon>在3D库房中定位</el-button>
          <el-button @click="viewAllMovements(currentPart)"><el-icon><Switch /></el-icon>查看全部流水</el-button>
          <el-button v-if="isLow(currentPart)" type="danger" plain @click="goReplenishment"><el-icon><ShoppingCartFull /></el-icon>加入补货清单</el-button>
        </div>
        <div class="drawer-section">
          <h3>库存与位置</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="货区">{{ currentPart.warehouseAreaName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="存放位置">{{ locationText(currentPart) }}</el-descriptions-item>
            <el-descriptions-item label="货架">{{ valueText(currentPart.shelf, '号') }}</el-descriptions-item>
            <el-descriptions-item label="层数">{{ valueText(currentPart.layer, '层') }}</el-descriptions-item>
            <el-descriptions-item label="方位">{{ sideText(currentPart.position) }}</el-descriptions-item>
            <el-descriptions-item label="货位">{{ currentPart.location ?? '-' }}</el-descriptions-item>
          </el-descriptions>
        </div>
        <div class="drawer-section">
          <h3>物料信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="规格型号" :span="2">{{ currentPart.spec || '未填写' }}</el-descriptions-item>
            <el-descriptions-item label="备件类型">{{ currentPart.partType || '未填写' }}</el-descriptions-item>
            <el-descriptions-item label="用途">{{ currentPart.usageDescription || '-' }}</el-descriptions-item>
            <el-descriptions-item label="订购点">{{ currentPart.reorderPoint ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="最高储备">{{ currentPart.maxStock ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="不含税单价">{{ currentPart.price == null ? '-' : `${currentPart.price} 元` }}</el-descriptions-item>
            <el-descriptions-item label="在途数量">{{ currentPart.inTransit ?? 0 }}</el-descriptions-item>
            <el-descriptions-item label="盘点状态">
              <el-tag :type="inventoryTag(currentPart.inventoryStatus)" effect="plain" size="small">{{ currentPart.inventoryStatus || '未盘点' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="最近盘点">{{ currentPart.lastInventoryDate || '-' }}</el-descriptions-item>
          </el-descriptions>
        </div>
        <div class="drawer-section">
          <div class="drawer-section-title"><h3>最近库存流水</h3><el-button link type="primary" @click="viewAllMovements(currentPart)">全部记录</el-button></div>
          <div v-loading="detailMovementsLoading" class="recent-movements">
            <article v-for="movement in detailMovements" :key="movement.id">
              <span class="movement-icon" :class="`is-${movement.type}`"><el-icon><TopRight v-if="movement.type === 'in'" /><BottomLeft v-else-if="movement.type === 'out'" /><Refresh v-else /></el-icon></span>
              <div><strong>{{ movementLabel(movement.type) }} {{ signedMovement(movement) }} {{ currentPart.unit || '' }}</strong><p>{{ movement.reason || '未填写原因' }}</p><small>{{ formatDate(movement.createdAt) }} · {{ movement.operatorName || '系统' }}</small></div>
              <em>{{ movement.beforeQuantity }} → {{ movement.afterQuantity }}</em>
            </article>
            <el-empty v-if="!detailMovementsLoading && !detailMovements.length" :image-size="54" description="暂无库存流水" />
          </div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="stockVisible" title="库存调整" width="min(460px, 92vw)" destroy-on-close>
      <template v-if="stockPart">
        <div class="detail-hero" style="margin-bottom:18px">
          <div><h2 style="font-size:16px">{{ stockPart.materialDesc }}</h2><p>{{ stockPart.materialCode }}</p></div>
          <div class="detail-stock"><strong style="font-size:23px">{{ stockPart.totalStock }}</strong><span>调整前库存</span></div>
        </div>
        <el-form label-position="top">
          <el-form-item label="操作类型">
            <el-segmented v-model="stockForm.type" :options="[{label:'入库',value:'in'},{label:'出库',value:'out'}]" block />
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number v-model="stockForm.quantity" :min="1" :max="999999" controls-position="right" style="width:100%" />
          </el-form-item>
          <el-form-item label="原因分类" required><el-select v-model="stockForm.reasonCode" placeholder="请选择原因" style="width:100%"><el-option v-for="item in currentReasonOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="原因说明"><el-input v-model="stockForm.reasonDetail" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可填写维修内容、送货单或补充说明" /></el-form-item>
          <div class="stock-meta-grid"><el-form-item label="部门"><el-input v-model="stockForm.department" placeholder="例如：原粮车间" /></el-form-item><el-form-item label="领用/经办人"><el-input v-model="stockForm.recipient" /></el-form-item><el-form-item label="关联设备"><el-select v-model="stockForm.equipmentId" clearable filterable placeholder="不关联设备" style="width:100%" @change="loadWorkOrders"><el-option v-for="item in equipmentOptions" :key="item.id" :label="`${item.equipmentName}（${item.equipmentCode}）`" :value="item.id" /></el-select></el-form-item><el-form-item label="维修工单"><el-select v-model="stockForm.maintenanceOrderId" clearable placeholder="不关联工单" style="width:100%"><el-option v-for="item in workOrderOptions" :key="item.id" :label="`${item.orderNo} · ${item.title}`" :value="item.id" /></el-select></el-form-item></div>
        </el-form>
        <p class="form-tip">出库数量不能超过当前库存。待审批盘点中的备件将暂停出入库。</p>
      </template>
      <template #footer>
        <el-button @click="stockVisible=false">取消</el-button>
        <el-button type="primary" :loading="stockSubmitting" @click="submitStock">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量出入库" width="min(820px, 96vw)" destroy-on-close>
      <el-form label-position="top"><div class="stock-meta-grid"><el-form-item label="操作类型"><el-segmented v-model="batchForm.type" :options="[{label:'批量入库',value:'in'},{label:'批量出库',value:'out'}]" block /></el-form-item><el-form-item label="原因分类" required><el-select v-model="batchForm.reasonCode" placeholder="请选择原因" style="width:100%"><el-option v-for="item in batchReasonOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="部门"><el-input v-model="batchForm.department" /></el-form-item><el-form-item label="领用/经办人"><el-input v-model="batchForm.recipient" /></el-form-item><el-form-item label="关联设备"><el-select v-model="batchForm.equipmentId" clearable filterable style="width:100%" @change="loadBatchWorkOrders"><el-option v-for="item in equipmentOptions" :key="item.id" :label="item.equipmentName" :value="item.id" /></el-select></el-form-item><el-form-item label="维修工单"><el-select v-model="batchForm.maintenanceOrderId" clearable style="width:100%"><el-option v-for="item in batchWorkOrderOptions" :key="item.id" :label="`${item.orderNo} · ${item.title}`" :value="item.id" /></el-select></el-form-item></div><el-form-item label="原因说明"><el-input v-model="batchForm.reasonDetail" type="textarea" :rows="2" maxlength="200" show-word-limit /></el-form-item></el-form>
      <el-table :data="batchRows" border max-height="320"><el-table-column label="备件" min-width="300"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }} · 当前 {{ row.totalStock }} {{ row.unit }}</span></div></template></el-table-column><el-table-column label="本次数量" width="180"><template #default="{row}"><el-input-number v-model="row.quantity" :min="1" :max="batchForm.type==='out'?Number(row.totalStock):999999" controls-position="right" style="width:100%" /></template></el-table-column></el-table>
      <template #footer><el-button @click="batchVisible=false">取消</el-button><el-button type="primary" :loading="batchSubmitting" @click="submitBatch">确认批量调整</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { batchUpdateStock, getDashboard, getEquipment, getEquipmentDetail, getFilters, getMovementReasons, getPartMovements, getParts, updateStock } from '../api'
import { getUser } from '../auth'

const router = useRouter()
function readStored(key, fallback) { try { const value=JSON.parse(window.localStorage.getItem(key)||'null'); return value ?? fallback } catch { return fallback } }
const loading = ref(false)
const list = ref([])
const total = ref(0)
const areas = ref([])
const dashboard = ref({ partTypes: 0, inventoryRecords: 0, totalStock: 0, lowStock: 0, unconfiguredStock: 0, pendingApproval: 0, unitTotals: [] })
const savedQuery = readStored('spare-parts-inventory-filters', {})
const query = reactive({ page: 1, pageSize: 20, searchKeyword: '', warehouseAreaName: '', sort: 'name', lowStock: undefined, ...savedQuery })
const detailVisible = ref(false)
const currentPart = ref(null)
const detailMovements = ref([])
const detailMovementsLoading = ref(false)
const stockVisible = ref(false)
const stockPart = ref(null)
const stockSubmitting = ref(false)
const stockForm = reactive({ type: 'in', quantity: 1, reasonCode: '', reasonDetail: '', department: '', recipient: '', equipmentId: '', maintenanceOrderId: '' })
const movementReasons = ref({ in: [], out: [] })
const equipmentOptions = ref([])
const workOrderOptions = ref([])
const selectedRows = ref([])
const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchRows = ref([])
const batchWorkOrderOptions = ref([])
const batchForm = reactive({ type: 'out', reasonCode: '', reasonDetail: '', department: '', recipient: '', equipmentId: '', maintenanceOrderId: '' })
const columnOptions = [
  { value: 'partType', label: '备件类型' }, { value: 'spec', label: '规格型号' },
  { value: 'location', label: '货区 / 库位' }, { value: 'reorderPoint', label: '订购点' }, { value: 'status', label: '库存状态' }
]
const visibleColumns = ref(readStored('spare-parts-inventory-columns', ['partType','spec','location','reorderPoint','status']))
const isAdmin = getUser()?.role === 'admin'
const currentReasonOptions = computed(() => movementReasons.value[stockForm.type] || [])
const batchReasonOptions = computed(() => movementReasons.value[batchForm.type] || [])
const unitSummary = computed(() => {
  const totals = dashboard.value.unitTotals || []
  if (!totals.length) return '库存数量按单位独立统计'
  const text = totals.slice(0, 3).map(item => `${formatNumber(item.total)}${item.unit}`).join('、')
  return totals.length > 3 ? `${text} 等 ${totals.length} 种单位` : text
})

function formatNumber(value) { return new Intl.NumberFormat('zh-CN').format(Number(value) || 0) }
function columnVisible(value) { return visibleColumns.value.includes(value) }
function isLow(row) { return row.reorderPoint != null && Number(row.totalStock) <= Number(row.reorderPoint) }
function inventoryHealth(row) {
  if (Number(row.totalStock) <= 0) return { label: '零库存', type: 'danger' }
  if (row.reorderPoint == null) return { label: '订购点未配置', type: 'info' }
  return isLow(row) ? { label: '需要补充', type: 'warning' } : { label: '库存正常', type: 'success' }
}
function valueText(value, suffix) { return value === null || value === undefined || value === '' ? '-' : `${value}${suffix}` }
function locationText(row) {
  if (row.locationType === 'free_text') return [row.warehouseAreaName, row.locationNote].filter(Boolean).join(' · ') || '位置待确认'
  if (row.locationCode) return `${row.warehouseAreaName || '未指定'} · ${row.locationCode}`
  const bits = [row.warehouseAreaName, valueText(row.shelf, '号架'), valueText(row.layer, '层')].filter(value => value && value !== '-')
  return bits.join(' · ') || '未设置库位'
}
function inventoryTag(status) { return status === '已完成' ? 'success' : status === '待审批' ? 'warning' : 'info' }
function sideText(value) { return String(value) === '1' ? '东侧' : String(value) === '2' ? '西侧' : '-' }
function movementLabel(type) { return ({ in: '入库', out: '出库', inventory_adjustment: '盘点调整', initial: '初始建账' })[type] || '库存调整' }
function signedMovement(movement) {
  if (movement.type === 'out') return `-${movement.quantity}`
  if (movement.type === 'in' || movement.type === 'initial') return `+${movement.quantity}`
  const delta = Number(movement.afterQuantity) - Number(movement.beforeQuantity)
  return `${delta >= 0 ? '+' : ''}${delta}`
}
function formatDate(value) { return value ? String(value).replace('T', ' ').slice(0, 19) : '-' }

async function load() {
  loading.value = true
  try {
    const result = await getParts({ ...query })
    list.value = result.data || []
    total.value = Number(result.total) || 0
  } finally {
    loading.value = false
  }
}

async function loadDashboard() {
  const result = await getDashboard()
  dashboard.value = result.data?.dashboard || dashboard.value
}

async function loadFilters() {
  const result = await getFilters()
  areas.value = result.data?.areas || []
}

async function loadOperationOptions() {
  if (!isAdmin) return
  const [reasons, equipment] = await Promise.all([getMovementReasons(), getEquipment()])
  movementReasons.value = reasons.data || { in: [], out: [] }
  equipmentOptions.value = equipment.data || []
}

async function refreshAll() {
  await Promise.allSettled([load(), loadDashboard(), loadFilters()])
}

function search() { query.page = 1; load() }
function resetFilters() {
  Object.assign(query, { page: 1, searchKeyword: '', warehouseAreaName: '', sort: 'name', lowStock: undefined })
  load()
}
function showLowStock() { query.lowStock = '1'; query.sort = 'stockAsc'; query.page = 1; load() }
function clearLowStock() { query.lowStock = undefined; query.sort = 'name'; query.page = 1; load() }
async function openDetail(row) {
  currentPart.value = row
  detailVisible.value = true
  detailMovements.value = []
  detailMovementsLoading.value = true
  try {
    const result = await getPartMovements(row._id, { pageSize: 8 })
    detailMovements.value = result.data || []
  } finally { detailMovementsLoading.value = false }
}
function locate3d(row) { router.push({ path: '/warehouse-3d', query: { partId: row._id } }) }
function viewAllMovements(row) { router.push({ path: '/movements', query: { search: row.materialCode } }) }
function goReplenishment() { router.push('/replenishment') }
function openStock(row) {
  if (!isAdmin) return ElMessage.warning('仅管理员可以调整库存')
  stockPart.value = row
  Object.assign(stockForm, { type: 'in', quantity: 1, reasonCode: '', reasonDetail: '', department: '', recipient: '', equipmentId: '', maintenanceOrderId: '' })
  workOrderOptions.value = []
  stockVisible.value = true
}

async function loadWorkOrders(equipmentId) {
  stockForm.maintenanceOrderId = ''
  workOrderOptions.value = []
  if (!equipmentId) return
  const result = await getEquipmentDetail(equipmentId)
  workOrderOptions.value = (result.data?.workOrders || []).filter(item => item.status !== 'completed')
}

async function loadBatchWorkOrders(equipmentId) {
  batchForm.maintenanceOrderId = ''
  batchWorkOrderOptions.value = []
  if (!equipmentId) return
  const result = await getEquipmentDetail(equipmentId)
  batchWorkOrderOptions.value = (result.data?.workOrders || []).filter(item => item.status !== 'completed')
}

async function submitStock() {
  if (!stockPart.value || stockForm.quantity < 1) return
  if (!stockForm.reasonCode) return ElMessage.warning('请选择出入库原因')
  const action = stockForm.type === 'in' ? '入库' : '出库'
  try {
    await ElMessageBox.confirm(`确认${action} ${stockForm.quantity} ${stockPart.value.unit || '个'}？`, `${action}确认`, { type: 'warning' })
  } catch { return }
  stockSubmitting.value = true
  try {
    await updateStock(stockPart.value._id, { ...stockForm, equipmentId: stockForm.equipmentId || null, maintenanceOrderId: stockForm.maintenanceOrderId || null })
    ElMessage.success(`${action}完成`)
    stockVisible.value = false
    await Promise.all([load(), loadDashboard()])
  } finally { stockSubmitting.value = false }
}

function openBatch() {
  batchRows.value = selectedRows.value.map(row => ({ ...row, quantity: 1 }))
  Object.assign(batchForm, { type: 'out', reasonCode: '', reasonDetail: '', department: '', recipient: '', equipmentId: '', maintenanceOrderId: '' })
  batchWorkOrderOptions.value = []
  batchVisible.value = true
}

async function submitBatch() {
  if (!batchForm.reasonCode) return ElMessage.warning('请选择批量出入库原因')
  const items = batchRows.value.map(row => ({ inventoryId: row._id, quantity: row.quantity }))
  try {
    await ElMessageBox.confirm(`确认对 ${items.length} 条库存执行批量${batchForm.type === 'in' ? '入库' : '出库'}？`, '批量操作确认', { type: 'warning' })
  } catch { return }
  batchSubmitting.value = true
  try {
    await batchUpdateStock({ ...batchForm, equipmentId: batchForm.equipmentId || null, maintenanceOrderId: batchForm.maintenanceOrderId || null, items })
    ElMessage.success('批量库存操作已完成')
    batchVisible.value = false
    selectedRows.value = []
    await Promise.all([load(), loadDashboard()])
  } finally { batchSubmitting.value = false }
}

watch(query, value => window.localStorage.setItem('spare-parts-inventory-filters', JSON.stringify({ pageSize: value.pageSize, searchKeyword: value.searchKeyword, warehouseAreaName: value.warehouseAreaName, sort: value.sort, lowStock: value.lowStock })), { deep: true })
watch(visibleColumns, value => window.localStorage.setItem('spare-parts-inventory-columns', JSON.stringify(value)), { deep: true })
watch(() => stockForm.type, () => { stockForm.reasonCode = '' })
watch(() => batchForm.type, () => { batchForm.reasonCode = '' })
onMounted(() => Promise.allSettled([refreshAll(), loadOperationOptions()]))
</script>

<style scoped>
.inventory-metric-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.metric-card:is(button){width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer}.metric-card.is-quality{border-top-color:#7a8798}.metric-card.is-quality .metric-icon{color:#536171;background:#f1f3f5}.table-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.column-picker strong{display:block;margin-bottom:8px}.column-picker .el-checkbox-group{display:grid}.stock-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.drawer-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.drawer-section-title h3{margin:0}.recent-movements{min-height:80px;border:1px solid #e7eaf0;border-radius:13px;overflow:hidden}.recent-movements article{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 13px;border-bottom:1px solid #edf0f3}.recent-movements article:last-child{border-bottom:0}.movement-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;color:#8a93a4;background:#f2f4f7}.movement-icon.is-in{color:#0f8562;background:#ecfbf6}.movement-icon.is-out{color:#c91f2c;background:#fff0f1}.movement-icon.is-inventory_adjustment{color:#b45309;background:#fff7ed}.recent-movements strong,.recent-movements p,.recent-movements small{display:block;margin:0}.recent-movements strong{font-size:12px}.recent-movements p{margin-top:3px;color:#596274;font-size:12px}.recent-movements small{margin-top:3px;color:#929aa7;font-size:12px}.recent-movements em{color:#697386;font-size:12px;font-style:normal;font-variant-numeric:tabular-nums}@media(max-width:1250px){.inventory-metric-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:680px){.inventory-metric-grid{grid-template-columns:repeat(2,1fr)}.stock-meta-grid{grid-template-columns:1fr}.detail-actions .el-button{flex:1}.recent-movements article{grid-template-columns:32px minmax(0,1fr)}.recent-movements em{grid-column:2}}
</style>

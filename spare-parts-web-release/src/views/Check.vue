<template>
  <div>
    <div class="page-head">
      <div>
        <h2>盘点任务</h2>
        <p>盘点提交后冻结相关库存，审批通过才会同步实盘数量。</p>
      </div>
      <div class="head-actions">
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
        <el-button v-write v-if="$showControl(canCreate)" type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新建盘点</el-button>
      </div>
    </div>

    <section class="metric-grid">
      <button type="button" class="metric-card is-clickable check-metric-button" @click="setStatus('')">
        <div class="metric-top"><span>全部任务</span><span class="metric-icon"><el-icon><Files /></el-icon></span></div>
        <div class="metric-value">{{ orderSummary.total }}</div>
        <div class="metric-note">当前筛选范围内的盘点单</div>
      </button>
      <button type="button" class="metric-card is-pending is-clickable check-metric-button" @click="setStatus('待审批')">
        <div class="metric-top"><span>待审批</span><span class="metric-icon"><el-icon><Clock /></el-icon></span></div>
        <div class="metric-value">{{ statusCount('待审批') }}</div>
        <div class="metric-note">需要及时核对处理</div>
      </button>
      <button type="button" class="metric-card is-clickable check-metric-button" @click="setStatus('已通过')">
        <div class="metric-top"><span>已通过</span><span class="metric-icon" style="color:#15803d;background:#ecfdf3"><el-icon><CircleCheck /></el-icon></span></div>
        <div class="metric-value">{{ statusCount('已通过') }}</div>
        <div class="metric-note">库存已完成同步</div>
      </button>
      <button type="button" class="metric-card is-alert is-clickable check-metric-button" @click="setStatus('已驳回')">
        <div class="metric-top"><span>已驳回</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div>
        <div class="metric-value">{{ statusCount('已驳回') }}</div>
        <div class="metric-note">可重新发起盘点</div>
      </button>
    </section>

    <section class="panel filter-panel">
      <div class="filter-row check-filter-row">
        <div class="filter-field">
          <label>所属车间</label>
          <el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="searchOrders">
            <el-option v-for="item in workshopOptions" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </div>
        <div class="filter-field">
          <label>审批状态</label>
          <el-select v-model="query.status" clearable placeholder="全部状态" style="width:100%" @change="searchOrders">
            <el-option label="待审批" value="待审批" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已驳回" value="已驳回" />
          </el-select>
        </div>
        <div class="filter-field">
          <label>盘点日期</label>
          <el-date-picker v-model="query.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" clearable style="width:100%" @change="searchOrders" />
        </div>
        <div class="filter-actions">
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="primary" :loading="loading" @click="searchOrders">查询</el-button>
        </div>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="table-toolbar">
        <div><strong>盘点单记录</strong><span class="result-count">共 {{ orderTotal }} 条</span></div>
        <span style="color:#8a93a4;font-size:12px">单据按创建时间倒序</span>
      </div>
      <p class="mobile-table-hint">左右滑动表格，查看完整字段和操作</p>
      <el-table :data="list" v-loading="loading" row-key="_id" empty-text="暂无盘点单">
        <el-table-column label="盘点单号" min-width="205" fixed="left">
          <template #default="{ row }">
            <div class="material-cell"><strong>{{ row.inventoryNo }}</strong><span>{{ formatTime(row.createTime) }}</span></div>
          </template>
        </el-table-column>
        <el-table-column prop="inventoryDate" label="盘点日期" width="120" />
        <el-table-column label="所属车间" width="110"><template #default="{ row }">{{ workshopName(row.workshopCode) }}</template></el-table-column>
        <el-table-column prop="inventoryUser" label="盘点人" min-width="110" />
        <el-table-column label="盘点范围" width="110" align="center">
          <template #default="{ row }">{{ row.inventoryAllList?.length || 0 }} 项</template>
        </el-table-column>
        <el-table-column label="差异" width="95" align="center">
          <template #default="{ row }"><span :style="{color:(row.abnormalList?.length||0) ? '#c91f2c' : '#15803d',fontWeight:700}">{{ row.abnormalList?.length || 0 }} 项</span></template>
        </el-table-column>
        <el-table-column label="审批状态" width="110" align="center">
          <template #default="{ row }"><el-tag :type="statusTag(row.approveStatus)" effect="light" round>{{ row.approveStatus }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="inventoryRemark" label="盘点说明" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.inventoryRemark || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
            <template v-if="$showControl(isAdmin) && row.approveStatus === '待审批'">
              <el-button v-write link type="success" :loading="processingId===row._id" @click="approve(row, '已通过')">通过</el-button>
              <el-button v-write link type="danger" :loading="processingId===row._id" @click="approve(row, '已驳回')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar"><span>第 {{ query.page }} 页</span><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="orderTotal" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="searchOrders" /></div>
    </section>

    <el-drawer v-model="detailVisible" title="盘点单详情" size="min(760px, 94vw)">
      <template v-if="detail">
        <div class="detail-hero">
          <div><h2>{{ detail.inventoryNo }}</h2><p>{{ detail.inventoryDate }} · {{ detail.inventoryUser }}</p></div>
          <el-tag :type="statusTag(detail.approveStatus)" size="large" effect="light" round>{{ detail.approveStatus }}</el-tag>
        </div>
        <div class="order-summary">
          <span class="summary-chip">所属车间<strong>{{ workshopName(detail.workshopCode) }}</strong></span>
          <span class="summary-chip">盘点数量<strong>{{ detail.inventoryAllList?.length || 0 }} 项</strong></span>
          <span class="summary-chip">差异数量<strong style="color:#c91f2c">{{ detail.abnormalList?.length || 0 }} 项</strong></span>
          <span class="summary-chip">创建时间<strong>{{ formatTime(detail.createTime) }}</strong></span>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="盘点说明">{{ detail.inventoryRemark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审批说明">{{ detail.approveRemark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="drawer-section">
          <h3>盘点明细</h3>
          <el-table :data="detail.inventoryAllList || []" border max-height="320">
            <el-table-column prop="materialCode" label="物料编码" width="145" />
            <el-table-column label="物料名称" min-width="190" show-overflow-tooltip>
              <template #default="{ row }">{{ row.partName || row.materialDesc || '库存记录 ' + row.partId }}</template>
            </el-table-column>
            <el-table-column label="账面库存" width="105" align="center">
              <template #default="{ row }">{{ row.snapshotStock ?? row.sysStockNum ?? '-' }} {{ row.sysStockUnit || '' }}</template>
            </el-table-column>
            <el-table-column label="实盘库存" width="105" align="center">
              <template #default="{ row }">{{ actualFor(row) }}</template>
            </el-table-column>
            <el-table-column label="结果" width="90" align="center">
              <template #default="{ row }"><el-tag :type="abnormalFor(row) ? 'danger' : 'success'" size="small">{{ abnormalFor(row) ? '有差异' : '正常' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建盘点任务" width="min(1120px, 94vw)" class="inventory-create-dialog" destroy-on-close align-center>
      <el-form label-position="top">
        <div class="check-create-meta-grid">
          <el-form-item label="所属车间" required>
            <el-select v-model="form.workshopCode" :disabled="!isAdmin" style="width:100%" @change="workshopChanged">
              <el-option v-for="item in workshopOptions" :key="item.code" :label="item.name" :value="item.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="盘点人" required><el-input v-model="form.inventoryUser" disabled /></el-form-item>
          <el-form-item label="盘点日期" required><el-date-picker v-model="form.inventoryDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        </div>
        <el-form-item label="盘点说明"><el-input v-model="form.inventoryRemark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="例如：月度例行盘点" /></el-form-item>
        <el-form-item label="盘点范围" required><el-segmented v-model="form.scopeType" :options="scopeOptions" class="inventory-scope-segmented" @change="scopeChanged" /></el-form-item>
      </el-form>

      <div class="drawer-section">
        <div class="table-toolbar" style="padding:0 0 12px;border:0;flex-wrap:wrap;gap:10px">
          <div><strong>选择备件</strong><span class="result-count">已选 {{ selectedParts.length }} 项</span>
            <el-button size="small" :disabled="!candidates.length" @click="toggleSelectAll" style="margin-left:8px">{{ allSelected ? '取消全选' : '全选' }}</el-button>
          </div>
          <div class="candidate-filters">
            <el-select v-if="form.scopeType === 'area'" v-model="partArea" clearable filterable placeholder="选择货区" style="width:180px" @change="loadCandidates">
              <el-option v-for="area in areas" :key="area" :label="area" :value="area" />
            </el-select>
            <el-select v-if="form.scopeType === 'shelf'" v-model="partShelf" clearable filterable multiple collapse-tags collapse-tags-tooltip placeholder="选择一个或多个货架" style="width:260px" @change="loadCandidates">
              <el-option v-for="shelf in shelfOptions" :key="shelf.value" :label="shelf.label" :value="shelf.value" />
            </el-select>
            <el-input v-model="partKeyword" clearable placeholder="搜索编码或名称" style="width:240px" @keyup.enter="loadCandidates" @clear="loadCandidates">
              <template #append><el-button :loading="candidateLoading" @click="loadCandidates"><el-icon><Search /></el-icon></el-button></template>
            </el-input>
          </div>
        </div>
        <el-table :data="candidates" v-loading="candidateLoading" border max-height="260">
          <el-table-column label="选择" width="72" align="center">
            <template #header><el-checkbox :model-value="allSelected" :indeterminate="someSelected && !allSelected" @change="toggleSelectAll" /></template>
            <template #default="{ row }"><el-checkbox :model-value="isSelected(row)" @change="togglePart(row)" /></template>
          </el-table-column>
          <el-table-column prop="materialCode" label="编码" width="140" />
          <el-table-column prop="materialDesc" label="名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="库位" min-width="150"><template #default="{ row }">{{ candidateLocation(row) }}</template></el-table-column>
          <el-table-column label="账面库存" width="100" align="center"><template #default="{ row }">{{ row.totalStock }} {{ row.unit || '个' }}</template></el-table-column>
        </el-table>
      </div>

      <div class="drawer-section">
        <h3>填写实盘数量</h3>
        <div v-if="!selectedParts.length" class="empty-state" style="padding:28px">请先从上方选择需要盘点的备件</div>
        <div v-for="part in selectedParts" :key="part._id" class="selected-part">
          <div><strong>{{ part.materialDesc }}</strong><small>{{ part.materialCode }} · 账面 {{ part.totalStock }} {{ part.unit || '个' }}</small></div>
          <el-input-number v-model="part.actualStock" :min="0" :max="99999999" controls-position="right" style="width:100%" />
          <el-tag :type="Number(part.actualStock) === Number(part.totalStock) ? 'success' : 'danger'" size="small">{{ Number(part.actualStock) === Number(part.totalStock) ? '正常' : '差异' }}</el-tag>
          <el-button circle text type="danger" @click="removePart(part._id)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>

      <template #footer>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
          <span style="color:#697386;font-size:12px">提交后相关备件将暂停出入库，直至审批完成。</span>
          <div><el-button @click="createVisible=false">取消</el-button><el-button v-write type="primary" :loading="submitting" @click="submitOrder">提交盘点单</el-button></div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { approveInventoryOrder, createInventoryOrder, getFilters, getInventoryOrder, getInventoryOrders, getParts } from '../api'
import { canEditAnyWorkshop, getUser, userWorkshopCode } from '../auth'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const list = ref([])
const query = reactive({ status: typeof route.query.status === 'string' ? route.query.status : '', workshopCode: typeof route.query.workshopCode === 'string' ? route.query.workshopCode : '', date: '', page: 1, pageSize: 20 })
const orderTotal=ref(0),orderSummary=reactive({total:0,pending:0,approved:0,rejected:0})
let orderRequest=0
const detailVisible = ref(false)
const detail = ref(null)
const processingId = ref('')
const createVisible = ref(false)
const submitting = ref(false)
const candidateLoading = ref(false)
const candidates = ref([])
const selectedParts = ref([])
const partKeyword = ref('')
const partArea = ref('')
const partShelf = ref([])
const areas = ref([])
const shelfMap = ref({})
const scopeOptions = [{ label: '全部备件', value: 'all' }, { label: '按货区', value: 'area' }, { label: '按货架', value: 'shelf' }]
const allSelected = computed(() => candidates.value.length > 0 && candidates.value.every(row => isSelected(row)))
const someSelected = computed(() => candidates.value.some(row => isSelected(row)))
const shelfOptions = computed(() => {
  const values = new Set()
  Object.values(shelfMap.value || {}).flat().forEach(value => {
    const number = Number.parseInt(String(value), 10)
    if (Number.isFinite(number) && number > 0) values.add(number)
  })
  return [...values].sort((a, b) => a - b).map(value => ({ value, label: `${value}号货架` }))
})
const form = reactive({ workshopCode: '', inventoryUser: '', inventoryDate: today(), inventoryRemark: '', scopeType: 'all' })
const currentUser = getUser()
const isAdmin = currentUser?.role === 'admin'
const canCreate = canEditAnyWorkshop()
const workshopOptions = [
  { code: 'raw_grain', name: '原粮车间' },
  { code: 'qu_making', name: '制曲车间' },
  { code: 'brewing', name: '酿酒车间' }
]

function today() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}
function statusTag(status) { return status === '已通过' ? 'success' : status === '已驳回' ? 'danger' : 'warning' }
function statusCount(status) { return orderSummary[({'待审批':'pending','已通过':'approved','已驳回':'rejected'})[status]] || 0 }
function formatTime(value) { return value ? String(value).replace('T', ' ').slice(0, 16) : '-' }
function workshopName(code) { return workshopOptions.find(item => item.code === code)?.name || '原粮车间' }
function searchOrders(){query.page=1;load()}
function setStatus(status) { query.status = status; searchOrders() }
function resetFilters() { query.status = ''; query.workshopCode = ''; query.date = ''; router.replace({ query: {} }); searchOrders() }

async function load() {
  const request=++orderRequest
  loading.value = true
  try {
    const result = await getInventoryOrders({ ...query })
    if(request!==orderRequest)return
    list.value = result.data || []
    orderTotal.value=Number(result.total)||0
    Object.assign(orderSummary,result.summary||{})
    if(!list.value.length&&orderTotal.value>0&&query.page>1){query.page=Math.ceil(orderTotal.value/query.pageSize);await load()}
  } finally { if(request===orderRequest)loading.value = false }
}

async function viewDetail(row) {
  const result = await getInventoryOrder(row._id)
  detail.value = result.data
  detailVisible.value = true
}

function abnormalFor(row) {
  return detail.value?.abnormalList?.some(item => String(item.partId) === String(row.partId))
}
function actualFor(row) {
  const abnormal = detail.value?.abnormalList?.find(item => String(item.partId) === String(row.partId))
  const value = abnormal ? abnormal.actualStock : (row.snapshotStock ?? row.sysStockNum)
  return `${value ?? '-'} ${row.sysStockUnit || abnormal?.sysStockUnit || ''}`
}

async function approve(row, status) {
  const action = status === '已通过' ? '通过' : '驳回'
  let remark = ''
  try {
    const result = await ElMessageBox.prompt(
      status === '已通过' ? '通过后，差异库存将同步到数据库。' : '驳回后，该盘点范围可以重新盘点。',
      `确认${action}盘点单`,
      { confirmButtonText: `确认${action}`, cancelButtonText: '取消', inputPlaceholder: '审批说明（选填）', inputType: 'textarea', type: status === '已通过' ? 'success' : 'warning' }
    )
    remark = result.value || ''
  } catch { return }
  processingId.value = row._id
  try {
    await approveInventoryOrder(row._id, { status, approveRemark: remark })
    ElMessage.success(`盘点单已${action}`)
    await load()
  } finally { processingId.value = '' }
}

async function openCreate() {
  if (!canCreate) return ElMessage.warning('当前账号没有盘点权限')
  createVisible.value = true
  selectedParts.value = []
  partKeyword.value = ''
  partArea.value = ''
  partShelf.value = []
  Object.assign(form, {
    workshopCode: userWorkshopCode() || query.workshopCode || 'raw_grain',
    inventoryUser: currentUser?.displayName || currentUser?.username || '',
    inventoryDate: today(),
    inventoryRemark: '',
    scopeType: 'all'
  })
  await loadScopeOptions()
  await loadCandidates()
}

async function workshopChanged() {
  selectedParts.value = []
  partArea.value = ''
  partShelf.value = []
  await loadScopeOptions()
  await loadCandidates()
}

function scopeChanged() {
  selectedParts.value = []
  partArea.value = ''
  partShelf.value = []
  loadCandidates()
}

async function loadCandidates() {
  candidateLoading.value = true
  try {
    const params = { page: 1, pageSize: 200, searchKeyword: partKeyword.value, sort: 'name', workshopCode: form.workshopCode }
    if (form.scopeType === 'area' && partArea.value) params.warehouseAreaName = partArea.value
    if (form.scopeType === 'shelf' && partShelf.value.length === 1) params.shelf = partShelf.value[0]
    const result = await getParts(params)
    candidates.value = (result.data || []).filter(item => item.inventoryStatus !== '待审批' && (form.scopeType !== 'shelf' || !partShelf.value.length || partShelf.value.includes(Number(item.shelf))))
  } finally { candidateLoading.value = false }
}
async function loadScopeOptions() {
  try {
    const result = await getFilters({ workshopCode: form.workshopCode })
    areas.value = result.data?.areas || []
    shelfMap.value = result.data?.shelfMap || {}
  } catch {}
}
function isSelected(row) { return selectedParts.value.some(item => item._id === row._id) }
function togglePart(row) {
  if (isSelected(row)) removePart(row._id)
  else selectedParts.value.push({ ...row, actualStock: Number(row.totalStock) || 0 })
}
function toggleSelectAll() {
  if (allSelected.value) {
    const ids = new Set(candidates.value.map(row => row._id))
    selectedParts.value = selectedParts.value.filter(item => !ids.has(item._id))
  } else {
    const existing = new Set(selectedParts.value.map(item => item._id))
    const toAdd = candidates.value.filter(row => !existing.has(row._id)).map(row => ({ ...row, actualStock: Number(row.totalStock) || 0 }))
    selectedParts.value = [...selectedParts.value, ...toAdd]
  }
}
function removePart(id) { selectedParts.value = selectedParts.value.filter(item => item._id !== id) }
function candidateLocation(row) { return [row.warehouseAreaName, row.locationCode || (row.shelf != null ? `${row.shelf}号架` : '')].filter(Boolean).join(' · ') || '-' }

async function submitOrder() {
  if (!form.inventoryUser.trim()) return ElMessage.warning('请填写盘点人')
  if (!form.inventoryDate) return ElMessage.warning('请选择盘点日期')
  if (!selectedParts.value.length) return ElMessage.warning('请至少选择一项备件')

  const inventoryAllList = selectedParts.value.map(item => ({
    partId: item._id,
    partName: item.materialDesc,
    materialCode: item.materialCode,
    snapshotStock: Number(item.totalStock),
    sysStockNum: Number(item.totalStock),
    sysStockUnit: item.unit || '个',
    warehouseAreaName: item.warehouseAreaName,
    locationCode: item.locationCode,
    shelf: item.shelf,
    layer: item.layer
  }))
  const abnormalList = selectedParts.value
    .filter(item => Number(item.actualStock) !== Number(item.totalStock))
    .map(item => ({
      partId: item._id,
      partName: item.materialDesc,
      materialCode: item.materialCode,
      snapshotStock: Number(item.totalStock),
      sysStockNum: Number(item.totalStock),
      sysStockUnit: item.unit || '个',
      actualStock: Number(item.actualStock),
      warehouseAreaName: item.warehouseAreaName,
      locationCode: item.locationCode,
      shelf: item.shelf,
      layer: item.layer
    }))

  submitting.value = true
  try {
    await createInventoryOrder({
      inventoryNo: `INV-${Date.now()}`,
      inventoryDate: form.inventoryDate,
      inventoryUser: form.inventoryUser.trim(),
      inventoryRemark: form.inventoryRemark.trim(),
      filterParams: { source: 'web', workshopCode: form.workshopCode, scopeType: form.scopeType, warehouseAreaName: form.scopeType === 'area' ? partArea.value : '', shelves: form.scopeType === 'shelf' ? partShelf.value : [] },
      inventoryAllList,
      abnormalList
    })
    ElMessage.success('盘点单已提交，等待审批')
    createVisible.value = false
    query.status = '待审批'
    await load()
  } finally { submitting.value = false }
}

onMounted(load)
</script>

<style scoped>
.check-metric-button{width:100%;color:inherit;font:inherit;text-align:left}
.check-filter-row{grid-template-columns:repeat(3,minmax(0,1fr)) auto}
@media(max-width:1100px){.check-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.check-filter-row{grid-template-columns:1fr}}
.check-create-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.inventory-scope-segmented{width:auto;min-width:330px}
:deep(.inventory-scope-segmented .el-segmented__item){min-width:106px}
:deep(.inventory-scope-segmented .el-segmented__item-label){overflow:visible;text-overflow:clip}
.candidate-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
:global(.inventory-create-dialog .el-dialog__body){max-height:calc(88vh - 132px);overflow-y:auto;padding-top:16px}
:global(.inventory-create-dialog .el-dialog__footer){padding-top:14px;border-top:1px solid var(--line)}
@media(max-width:900px){.check-create-meta-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.check-create-meta-grid{grid-template-columns:1fr}.inventory-scope-segmented{display:flex;width:100%;min-width:0}.candidate-filters{align-items:stretch;flex-direction:column}.candidate-filters :deep(.el-select),.candidate-filters :deep(.el-input){width:100%!important}}
</style>

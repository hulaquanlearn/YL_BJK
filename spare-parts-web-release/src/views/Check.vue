<template>
  <div class="check-page" :class="{'check-app':nativeAndroid}">
    <AppInventoryOrders v-if="nativeAndroid" :query="query" :summary="orderSummary" :rows="list" :total="orderTotal" :loading="loading" :error="loadError" :is-admin="isAdmin" :can-create="canCreate" :has-filters="hasOrderFilters" :workshops="workshopOptions" @status="setStatus" @date="query.date=$event;searchOrders()" @reset="resetFilters" @refresh="load" @detail="viewDetail" @page="query.page=$event;load()" @create="openCreate" />
    <section v-if="!nativeAndroid" class="metric-grid check-status-summary" aria-label="筛选盘点任务状态">
      <button type="button" class="metric-card is-clickable check-metric-button" :class="{selected:query.status===''}" :aria-pressed="query.status===''" @click="setStatus('')">
        <div class="metric-top"><span>全部任务</span><span class="metric-icon"><el-icon><Files /></el-icon></span></div>
        <div class="metric-value">{{ loadError ? '—' : orderSummary.total }}</div>
      </button>
      <button type="button" class="metric-card is-pending is-clickable check-metric-button" :class="{selected:query.status==='待审批'}" :aria-pressed="query.status==='待审批'" @click="setStatus('待审批')">
        <div class="metric-top"><span>待审批</span><span class="metric-icon"><el-icon><Clock /></el-icon></span></div>
        <div class="metric-value">{{ loadError ? '—' : statusCount('待审批') }}</div>
      </button>
      <button type="button" class="metric-card is-success is-clickable check-metric-button" :class="{selected:query.status==='已通过'}" :aria-pressed="query.status==='已通过'" @click="setStatus('已通过')">
        <div class="metric-top"><span>已通过</span><span class="metric-icon"><el-icon><CircleCheck /></el-icon></span></div>
        <div class="metric-value">{{ loadError ? '—' : statusCount('已通过') }}</div>
      </button>
      <button type="button" class="metric-card is-alert is-clickable check-metric-button" :class="{selected:query.status==='已驳回'}" :aria-pressed="query.status==='已驳回'" @click="setStatus('已驳回')">
        <div class="metric-top"><span>已驳回</span><span class="metric-icon"><el-icon><CircleClose /></el-icon></span></div>
        <div class="metric-value">{{ loadError ? '—' : statusCount('已驳回') }}</div>
      </button>
    </section>

    <section v-if="!nativeAndroid" class="panel filter-panel check-order-filter">
      <div class="filter-row check-filter-row">
        <div class="filter-field">
          <label>所属车间</label>
          <el-select v-model="query.workshopCode" :disabled="!isAdmin" :clearable="isAdmin" placeholder="全部车间" style="width:100%" @change="searchOrders">
            <el-option v-for="item in workshopOptions" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </div>
<div class="filter-field">
          <label>盘点日期</label>
          <div class="phone-count-date-field"><span>{{ query.date || '全部日期' }}</span><input v-model="query.date" class="phone-count-date" type="date" aria-label="筛选盘点日期" @change="searchOrders"/></div><el-date-picker class="phone-replaced-control" v-model="query.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" clearable style="width:100%" @change="searchOrders" />
        </div>
        <div class="filter-actions" :class="{'has-reset':hasOrderFilters}">
          <el-button v-if="hasOrderFilters" text @click="resetFilters">重置</el-button>
          <el-button class="check-search-button" :loading="loading" @click="searchOrders">查询</el-button>
        </div>
      </div>
    </section>

    <section v-if="!nativeAndroid" class="panel table-panel">
      <div class="table-toolbar check-record-heading">
        <div><strong>盘点单记录</strong><span class="result-count">共 {{ orderTotal }} 条</span></div>
        <div class="head-actions">
          
          <el-button v-if="canCreate" type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新建盘点</el-button>
        </div>
      </div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon><el-button size="small" @click="load">重试</el-button></el-alert>
      <div class="phone-records" v-loading="loading" aria-label="盘点单列表">
        <article v-for="row in list" :key="row._id" class="phone-record phone-count-record">
          <header><strong>{{ row.inventoryNo }}</strong><el-tag :type="statusTag(row.approveStatus)">{{ row.approveStatus }}</el-tag></header>
          <p>{{ workshopName(row.workshopCode) }} · {{ row.inventoryUser }} · {{ row.inventoryDate }}</p>
          <dl class="phone-count-quantities"><div><dt>范围</dt><dd>{{ row.inventoryAllList?.length || 0 }} 项</dd></div><div><dt>差异</dt><dd>{{ differenceCount(row) }} 项<span v-if="unverifiedCount(row)"> · {{ unverifiedCount(row) }} 项待核实</span></dd></div></dl><p v-if="row.inventoryRemark && row.inventoryRemark!=='无说明'">{{ row.inventoryRemark }}</p>
          <footer><el-button type="primary" text @click="viewDetail(row)">查看详情<el-icon><ArrowRight /></el-icon></el-button><template v-if="canApproveRow(row) && row.approveStatus === '待审批'"><el-button v-write type="success" :loading="processingId===row._id" @click="approve(row,'已通过')">通过</el-button><el-button v-write type="danger" plain :loading="processingId===row._id" @click="approve(row,'已驳回')">驳回</el-button></template></footer>
        </article><el-empty v-if="!loading&&!loadError&&!list.length" description="暂无盘点单"/>
      </div>
      <el-table v-if="!nativeAndroid" class="phone-replaced-table" :data="list" v-loading="loading" row-key="_id" :empty-text="loadError ? '盘点记录读取失败，请重试' : '暂无盘点单'">
        <el-table-column label="盘点单号" width="220" fixed="left">
          <template #default="{ row }">
            <div class="material-cell"><strong>{{ row.inventoryNo }}</strong><span>{{ formatTime(row.createTime) }}</span></div>
          </template>
        </el-table-column>
        <el-table-column prop="inventoryDate" label="盘点日期" width="115" />
        <el-table-column label="所属车间" width="110"><template #default="{ row }">{{ workshopName(row.workshopCode) }}</template></el-table-column>
        <el-table-column prop="inventoryUser" label="盘点人" min-width="110" />
        <el-table-column label="盘点范围" width="110" align="center">
          <template #default="{ row }">{{ row.inventoryAllList?.length || 0 }} 项</template>
        </el-table-column>
        <el-table-column label="账实核对" width="160" align="center">
          <template #header><el-tooltip content="对比盘点时的账面库存与实际盘点数量；缺少实盘数的记录需要核实。" placement="top"><span class="count-result-heading">账实核对 ⓘ</span></el-tooltip></template>
          <template #default="{ row }"><span v-if="differenceCount(row)" class="count-difference">{{ differenceCount(row) }} 项账实不符</span><span v-else-if="!unverifiedCount(row)" class="count-consistent">账实一致</span><span v-if="unverifiedCount(row)" class="count-unverified">{{ unverifiedCount(row) }} 项实盘数待核实</span></template>
        </el-table-column>
        <el-table-column label="审批状态" width="110" align="center">
          <template #default="{ row }"><el-tag :type="statusTag(row.approveStatus)" effect="light" round>{{ row.approveStatus }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="inventoryRemark" label="盘点说明" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.inventoryRemark || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="right" fixed="right">
          <template #default="{ row }"><div class="check-row-actions">
            <el-button link type="primary" @click="viewDetail(row)">详情</el-button>
            <template v-if="canApproveRow(row) && row.approveStatus === '待审批'">
              <el-button v-write link type="success" :loading="processingId===row._id" @click="approve(row, '已通过')">通过</el-button>
              <el-button v-write link type="danger" :loading="processingId===row._id" @click="approve(row, '已驳回')">驳回</el-button>
            </template>
          </div></template>
        </el-table-column>
      </el-table>
      <div class="pagination-bar" :class="{'is-single-page':orderTotal<=query.pageSize}"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="orderTotal" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="searchOrders" /></div>
    </section>

    <el-dialog v-model="detailVisible" class="count-detail-drawer count-detail-dialog" title="盘点单详情" width="min(760px, 94vw)" align-center>
      <p v-if="detailLoading" role="status">正在读取盘点记录…</p>
      <el-alert v-else-if="detailError" :title="detailError" type="error" :closable="false"><el-button @click="viewDetail(detailTarget)">重试</el-button></el-alert>
      <template v-else-if="detail">
        <div class="detail-hero">
          <div><h2>{{ detail.inventoryNo }}</h2><p>{{ detail.inventoryDate }} · {{ detail.inventoryUser }}</p></div>
          <el-tag :type="statusTag(detail.approveStatus)" size="large" effect="light" round>{{ detail.approveStatus }}</el-tag>
        </div>
        <div class="order-summary">
          <span class="summary-chip">所属车间<strong>{{ workshopName(detail.workshopCode) }}</strong></span>
          <span class="summary-chip">盘点数量<strong>{{ detail.inventoryAllList?.length || 0 }} 项</strong></span>
          <span class="summary-chip">差异数量<strong :style="{color:detailCount.differenceCount ? '#c91f2c' : '#15803d'}">{{ detailCount.differenceCount }} 项</strong></span>
          <span v-if="detailCount.unverifiedCount" class="summary-chip">待核实<strong>{{ detailCount.unverifiedCount }} 项</strong></span>
          <span class="summary-chip">创建时间<strong>{{ formatTime(detail.createTime) }}</strong></span>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="盘点说明">{{ detail.inventoryRemark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审批说明">{{ detail.approveRemark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="drawer-section">
          <h3>盘点明细</h3>
          <div class="phone-records count-item-records" aria-label="盘点备件明细"><article v-for="(row,index) in (detail.inventoryAllList||[]).slice(0,detailItemLimit)" :key="inventoryCountItemId(row)||index" class="phone-record"><header><strong>{{row.partName || row.materialDesc || '库存记录 '+row.partId}}</strong><el-tag :type="countFor(row).status==='unverified'?'warning':abnormalFor(row)?'danger':'success'">{{countFor(row).status==='unverified'?'待核实':abnormalFor(row)?'有差异':'正常'}}</el-tag></header><p>{{row.materialCode || '编码未填写'}}</p><dl><div><dt>盘点时账面数量</dt><dd>{{countFor(row).snapshot ?? '未记录'}} {{countFor(row).unit}}</dd></div><div><dt>实际盘点数量</dt><dd>{{actualFor(row)}}</dd></div></dl></article><el-button v-if="(detail.inventoryAllList||[]).length>detailItemLimit" @click="detailItemLimit+=30">再显示30项（剩余 {{detail.inventoryAllList.length-detailItemLimit}} 项）</el-button></div>
          <el-table v-if="!nativeAndroid" class="phone-replaced-table" :data="detail.inventoryAllList || []" border max-height="320">
            <el-table-column prop="materialCode" label="物料编码" width="145" />
            <el-table-column label="物料名称" min-width="190" show-overflow-tooltip>
              <template #default="{ row }">{{ row.partName || row.materialDesc || '库存记录 ' + row.partId }}</template>
            </el-table-column>
            <el-table-column label="账面库存" width="105" align="center">
              <template #default="{ row }">{{ countFor(row).snapshot ?? '-' }} {{ countFor(row).unit }}</template>
            </el-table-column>
            <el-table-column label="实盘库存" width="105" align="center">
              <template #default="{ row }">{{ actualFor(row) }}</template>
            </el-table-column>
            <el-table-column label="结果" width="90" align="center">
              <template #default="{ row }"><el-tag :type="countFor(row).status==='unverified' ? 'warning' : abnormalFor(row) ? 'danger' : 'success'" size="small">{{ countFor(row).status==='unverified' ? '待核实' : abnormalFor(row) ? '有差异' : '正常' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="新建盘点任务" :width="nativeAndroid?'min(560px, 94vw)':'min(1120px, 94vw)'" class="inventory-create-dialog" :class="{'count-app-create-dialog':nativeAndroid}" :before-close="closeCreate" :close-on-click-modal="false" :close-on-press-escape="!submitting" :show-close="!submitting" destroy-on-close align-center>
      <nav v-if="nativeAndroid" class="count-create-steps" aria-label="新建盘点步骤"><button v-for="(label,index) in ['基本信息','选择备件','实盘数量']" :key="label" type="button" :disabled="submitting || index+1>createStep" :class="{active:createStep===index+1}" :aria-current="createStep===index+1?'step':undefined" @click="createStep=index+1"><b>{{index+1}}</b>{{label}}</button></nav>
      <el-form v-show="!nativeAndroid||createStep===1" label-position="top" :disabled="submitting">
        <div class="check-create-meta-grid">
          <el-form-item label="所属车间" required>
            <el-select :model-value="form.workshopCode" :disabled="!isAdmin || submitting" style="width:100%" @change="workshopChanged">
              <el-option v-for="item in workshopOptions" :key="item.code" :label="item.name" :value="item.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="盘点人" required><el-input v-model="form.inventoryUser" disabled /></el-form-item>
          <el-form-item label="盘点日期" required><div class="phone-count-date-field"><span>{{ form.inventoryDate || '选择日期' }}</span><input v-model="form.inventoryDate" class="phone-count-date" :disabled="submitting" type="date" aria-label="盘点日期"/></div><el-date-picker class="phone-replaced-control" v-model="form.inventoryDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        </div>
        <el-form-item label="盘点说明"><el-input v-model="form.inventoryRemark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="例如：月度例行盘点" /></el-form-item>
        <el-form-item label="盘点范围" required><el-segmented :key="scopeChoiceRevision" :model-value="form.scopeType" :options="scopeOptions" class="inventory-scope-segmented" @change="scopeChanged" /></el-form-item>
      </el-form>

      <div v-show="!nativeAndroid||createStep===2" class="drawer-section">
        <div class="table-toolbar" style="padding:0 0 12px;border:0;flex-wrap:wrap;gap:10px">
          <div v-if="!nativeAndroid"><strong>选择备件</strong><span class="result-count">已选 {{ selectedParts.length }} 项</span>
            <el-button size="small" :disabled="submitting || candidateLoading || !candidates.length" @click="toggleSelectAll" style="margin-left:8px">{{ allSelected ? '取消全选' : '全选' }}</el-button>
          </div>
          <div class="candidate-filters">
            <el-select v-if="form.scopeType === 'area'" v-model="partArea" :disabled="submitting" clearable filterable placeholder="选择货区" style="width:180px" @change="loadCandidates">
              <el-option v-for="area in areas" :key="area" :label="area" :value="area" />
            </el-select>
            <el-select v-if="form.scopeType === 'shelf'" v-model="partShelf" :disabled="submitting" clearable filterable multiple collapse-tags collapse-tags-tooltip placeholder="选择一个或多个货架" style="width:260px" @change="loadCandidates">
              <el-option v-for="shelf in shelfOptions" :key="shelf.value" :label="shelf.label" :value="shelf.value" />
            </el-select>
            <el-input v-model="partKeyword" :disabled="submitting" clearable placeholder="搜索编码或名称" style="width:240px" @keyup.enter="loadCandidates" @clear="loadCandidates">
              <template #append><el-button aria-label="搜索盘点备件" title="搜索盘点备件" :disabled="submitting" :loading="candidateLoading" @click="loadCandidates"><el-icon><Search /></el-icon></el-button></template>
            </el-input>
          </div>
        </div>
        <el-alert v-if="candidateError" :title="candidateError" type="error" :closable="false"><el-button size="small" :disabled="submitting" @click="loadCandidates">重试备件</el-button></el-alert>
        <el-alert v-if="scopeError" title="货区和货架读取失败，请重试后选择范围" type="warning" :closable="false"><el-button size="small" :disabled="submitting" @click="loadScopeOptions">重试范围</el-button></el-alert>
        <div class="phone-records phone-candidates" v-loading="candidateLoading">
          <div class="count-candidate-selection"><el-checkbox :disabled="submitting||candidateLoading||!!candidateError" :model-value="allSelected" :indeterminate="someSelected&&!allSelected" @change="toggleSelectAll">全选当前结果</el-checkbox><span>已选 {{selectedParts.length}} 项</span></div>
          <div v-for="row in candidates.slice(0,candidateLimit)" :key="row._id" class="phone-candidate"><el-checkbox :disabled="submitting||candidateLoading" :aria-label="`选择${row.materialDesc}`" :model-value="isSelected(row)" @change="togglePart(row)"/><span><strong>{{ row.materialDesc }}</strong><small>{{ row.materialCode }} · {{ candidateLocation(row) }}</small></span><b>{{ row.totalStock }} {{ row.unit || '个' }}</b></div>
          <el-button v-if="candidates.length>candidateLimit" @click="candidateLimit+=40">再显示40项（剩余 {{candidates.length-candidateLimit}} 项）</el-button><el-empty v-if="!candidateLoading&&!candidateError&&!candidates.length" description="暂无可盘点备件"/>
        </div>
        <el-table v-if="!nativeAndroid" class="phone-replaced-table" :data="candidates" v-loading="candidateLoading" border max-height="260" :empty-text="candidateError ? '备件读取失败' : '暂无可盘点备件'">
          <el-table-column label="选择" width="72" align="center">
            <template #header><el-checkbox :disabled="submitting" :model-value="allSelected" :indeterminate="someSelected && !allSelected" @change="toggleSelectAll" /></template>
            <template #default="{ row }"><el-checkbox :disabled="submitting" :model-value="isSelected(row)" @change="togglePart(row)" /></template>
          </el-table-column>
          <el-table-column prop="materialCode" label="编码" width="140" />
          <el-table-column prop="materialDesc" label="名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="库位" min-width="150"><template #default="{ row }">{{ candidateLocation(row) }}</template></el-table-column>
          <el-table-column label="账面库存" width="100" align="center"><template #default="{ row }">{{ row.totalStock }} {{ row.unit || '个' }}</template></el-table-column>
        </el-table>
      </div>

      <div v-show="!nativeAndroid||createStep===3" class="drawer-section">
        <h3>填写实盘数量</h3><p v-if="nativeAndroid" class="count-step-note">共 {{selectedParts.length}} 项。请逐项填写实盘数，实际为零请填 0。</p>
        <div v-if="!selectedParts.length" class="empty-state" style="padding:28px">请先从上方选择需要盘点的备件</div>
        <div v-for="part in selectedParts" :key="part._id" class="selected-part">
          <div><strong>{{ part.materialDesc }}</strong><small>{{ part.materialCode }} · 账面 {{ part.totalStock }} {{ part.unit || '个' }}</small></div>
          <el-input-number v-model="part.actualStock" :disabled="submitting" :min="0" :max="99999999" controls-position="right" style="width:100%" :aria-label="`${part.materialDesc || part.materialCode} 实盘数量，必填`" />
          <el-tag :type="!validStockCount(part.actualStock) ? 'warning' : !inventoryQuantitiesDiffer(part.totalStock,part.actualStock) ? 'success' : 'danger'" size="small">{{ !validStockCount(part.actualStock) ? '待填写' : !inventoryQuantitiesDiffer(part.totalStock,part.actualStock) ? '正常' : '差异' }}</el-tag>
          <el-button circle text type="danger" :disabled="submitting" @click="removePart(part._id)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>

      <template #footer>
        <p v-if="submitError" class="stock-submit-error" role="alert">{{ submitError }}</p>
        <div class="count-submit-footer" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
          <span v-if="!nativeAndroid||createStep===3" style="color:#697386;font-size:12px">提交后相关备件将暂停出入库，审批通过后才同步实盘数量。</span>
          <div><el-button v-if="nativeAndroid&&createStep>1" :disabled="submitting" @click="createStep--">上一步</el-button><el-button v-else :disabled="submitting" @click="closeCreate()">取消</el-button><el-button v-if="nativeAndroid&&createStep<3" type="primary" :disabled="candidateLoading||submitting" @click="nextCreateStep">{{createStep===1?'选择备件':'填写实盘数（'+selectedParts.length+'项）'}}</el-button><el-button v-else type="primary" :loading="submitting" @click="submitOrder">提交盘点单</el-button></div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import AppInventoryOrders from '../app/AppInventoryOrders.vue'
import {isAppSurface} from '../app/surface.mjs'
const nativeAndroid=isAppSurface()

import { computed, onMounted, onBeforeUnmount, nextTick, reactive, ref } from 'vue'
import { collectParts } from '../utils/collect-parts.mjs'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { approveInventoryOrder, createInventoryOrder, getFilters, getInventoryOrder, getInventoryOrders, getParts } from '../api'
import { canEditAnyWorkshop, getUser, userWorkshopCode } from '../auth'
import { boundedPage, createListViewState, validStockCount } from '../utils/list-view-state.mjs'
import { inventoryCountSummary, inventoryCountItemId, inventoryQuantitiesDiffer } from '../utils/inventory-count.mjs'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const loadError = ref(''), candidateError = ref(''), scopeError = ref(false)
const list = ref([])
const query = reactive({ status: typeof route.query.status === 'string' ? route.query.status : '', workshopCode: typeof route.query.workshopCode === 'string' ? route.query.workshopCode : '', date: '', page: 1, pageSize: 20 })
const orderTotal=ref(0),orderSummary=reactive({total:0,pending:0,approved:0,rejected:0})
let orderRequest=0
let detailRequest=0
let scopeRequest=0
const detailVisible = ref(false)
const detail = ref(null)
const detailLoading=ref(false),detailError=ref(''),detailTarget=ref(null),detailItemLimit=ref(30),submitError=ref('')
const detailCount = computed(() => inventoryCountSummary(detail.value))
const detailCountById = computed(() => new Map(detailCount.value.rows.map(item => [inventoryCountItemId(item.row), item])))
const processingId = ref('')
const createVisible = ref(false)
const createStep = ref(1)
const submitting = ref(false)
const candidateLoading = ref(false)
let candidateRequest=0
const candidates = ref([])
const candidateLimit = ref(40)
const selectedParts = ref([])
const partKeyword = ref('')
const partArea = ref('')
const partShelf = ref([])
const scopeChoiceRevision = ref(0)
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
const hasOrderFilters = computed(() => Boolean(query.status || query.date || query.workshopCode !== (isAdmin ? '' : userWorkshopCode())))
const canCreate = canEditAnyWorkshop() || (currentUser?.role === 'viewer' && Boolean(userWorkshopCode()))
if (!isAdmin) query.workshopCode = userWorkshopCode()
const viewState = createListViewState({ view: 'check', user: currentUser, scope: { ...route.query }, queryKeys: Object.keys(query) })
const restoredState = viewState.read()
if (restoredState) Object.assign(query, restoredState.query, { page: boundedPage(restoredState.query.page), pageSize: [20, 50, 100].includes(restoredState.query.pageSize) ? restoredState.query.pageSize : 20, ...(!isAdmin ? { workshopCode: userWorkshopCode() } : {}) })
if(nativeAndroid)query.workshopCode=isAdmin?'':userWorkshopCode()
let restoreScroll = restoredState?.scrollTop ?? null
let createBaseline = ''
function createSnapshot() { return JSON.stringify({ ...form, selected: selectedParts.value.map(item => ({ id: item._id, actualStock: item.actualStock })), area: partArea.value, shelves: partShelf.value }) }
const createDirty = computed(() => createVisible.value && createSnapshot() !== createBaseline)
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
function searchOrders(){query.page=1;restoreScroll=null;return load()}
function setStatus(status) { query.status = status; searchOrders() }
function resetFilters() { query.status = ''; query.workshopCode = isAdmin ? '' : userWorkshopCode(); query.date = ''; router.replace({ query: {} }); searchOrders() }
function canApproveRow(row) { return !nativeAndroid && (isAdmin || (currentUser?.role !== 'viewer' && userWorkshopCode() === row.workshopCode)) }

async function load() {
  const request=++orderRequest
  loading.value = true
  try {
    const result = await getInventoryOrders({ ...query })
    if(request!==orderRequest)return
    list.value = result.data || []
    orderTotal.value=Number(result.total)||0
    Object.assign(orderSummary,result.summary||{})
    loadError.value = ''
    const lastPage = Math.max(1, Math.ceil(orderTotal.value / query.pageSize))
    if (query.page > lastPage) { query.page = lastPage; return load() }
    if (!list.value.length && orderTotal.value > 0) loadError.value = '盘点数量与明细暂未同步，请重试后核对记录。'
    if (restoreScroll !== null) { await nextTick(); if (request === orderRequest) { window.scrollTo(0, restoreScroll); restoreScroll = null } }
  } catch { if (request === orderRequest) { list.value = []; orderTotal.value = 0; Object.assign(orderSummary, { total: 0, pending: 0, approved: 0, rejected: 0 }); loadError.value = '盘点记录读取失败，当前筛选结果尚未取得，请重试。' } }
  finally { if(request===orderRequest)loading.value = false }
}

async function viewDetail(row) {
  if(!row?._id)return
  const request=++detailRequest
  detailTarget.value=row;detail.value=null;detailError.value='';detailLoading.value=true;detailItemLimit.value=30;detailVisible.value=true
  try {const result=await getInventoryOrder(row._id);if(request===detailRequest)detail.value=result.data}
  catch(error){if(request===detailRequest)detailError.value=error.response?.data?.msg||'盘点详情读取失败，请重试'}
  finally {if(request===detailRequest)detailLoading.value=false}
}

function abnormalFor(row) {
  return countFor(row).status === 'difference'
}
function countFor(row) { return detailCountById.value.get(inventoryCountItemId(row)) || { snapshot: null, actual: null, unit: row.sysStockUnit || '', status: 'unverified' } }
function differenceCount(order) { return inventoryCountSummary(order).differenceCount }
function unverifiedCount(order) { return inventoryCountSummary(order).unverifiedCount }
function actualFor(row) {
  const item = countFor(row)
  return `${item.actual ?? '-'} ${item.unit}`
}

async function approve(row, status) {
  if (processingId.value) return
  if (!canApproveRow(row)) return ElMessage.warning('只能审批所属车间的盘点单')
  processingId.value = row._id
  const action = status === '已通过' ? '通过' : '驳回'
  let remark = ''
  try {
    const result = await ElMessageBox.prompt(
      status === '已通过' ? '通过后，差异库存将同步到数据库。' : '驳回后，该盘点范围可以重新盘点。',
      `确认${action}盘点单`,
      { confirmButtonText: `确认${action}`, cancelButtonText: '取消', inputPlaceholder: '审批说明（选填）', inputType: 'textarea', type: status === '已通过' ? 'success' : 'warning' }
    )
    remark = result.value || ''
  } catch { processingId.value = ''; return }
  try {
    await approveInventoryOrder(row._id, { status, approveRemark: remark })
    ElMessage.success(`盘点单已${action}`)
    await load()
  } catch(error) { ElMessage.error(error.response?.data?.msg || '审批未能确认成功，请刷新盘点记录后核对状态。') }
  finally { processingId.value = '' }
}

function nextCreateStep(){
 if(submitting.value||candidateLoading.value)return
 if(createStep.value===1){if(!form.workshopCode||!form.inventoryDate)return ElMessage.warning('请先选择车间和盘点日期');createStep.value=2;return}
 if(!selectedParts.value.length)return ElMessage.warning('请至少选择一项备件')
 createStep.value=3
}
async function openCreate() {
  if (createVisible.value || submitting.value) return
  if (!canCreate) return ElMessage.warning('当前账号没有盘点权限')
  submitError.value = ''
  createStep.value = 1
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
  createBaseline = createSnapshot()
  await loadScopeOptions()
  await loadCandidates()
}

async function confirmRangeChange(label) {
  if (submitting.value) return false
  if (!selectedParts.value.length) return true
  try { await ElMessageBox.confirm(`切换${label}会清空已选的 ${selectedParts.value.length} 项备件及实盘数量，是否继续？`, '盘点范围将改变', { confirmButtonText: '确认切换并清空', cancelButtonText: '保留当前填写', type: 'warning' }); return !submitting.value } catch { return false }
}
async function workshopChanged(nextWorkshop) {
  if (!isAdmin || !workshopOptions.some(item => item.code === nextWorkshop) || nextWorkshop === form.workshopCode || !await confirmRangeChange('车间')) return
  candidateRequest++
  candidates.value = []
  candidateLoading.value = true
  form.workshopCode = nextWorkshop
  selectedParts.value = []
  partArea.value = ''
  partShelf.value = []
  await loadScopeOptions()
  await loadCandidates()
}

async function scopeChanged(nextScope) {
  if (!scopeOptions.some(item => item.value === nextScope) || nextScope === form.scopeType) return
  if (!await confirmRangeChange('盘点范围')) { scopeChoiceRevision.value++; return }
  form.scopeType = nextScope
  selectedParts.value = []
  partArea.value = ''
  partShelf.value = []
  return loadCandidates()
}

async function loadCandidates() {
  if (submitting.value || !createVisible.value) return
  const request=++candidateRequest
  candidateLimit.value = 40
  candidateLoading.value = true
  candidates.value=[]
  try {
    const params = { page: 1, pageSize: 200, searchKeyword: partKeyword.value, sort: 'name', workshopCode: form.workshopCode }
    if (form.scopeType === 'area' && partArea.value) params.warehouseAreaName = partArea.value
    if (form.scopeType === 'shelf' && partShelf.value.length === 1) params.shelf = partShelf.value[0]
    const rows = await collectParts(getParts,params,()=>request===candidateRequest)
    if(!rows)return
    candidates.value = rows.filter(item => item.inventoryStatus !== '待审批' && (form.scopeType !== 'shelf' || !partShelf.value.length || partShelf.value.includes(Number(item.shelf))))
    candidateError.value = ''
  } catch { if(request===candidateRequest) { candidates.value=[]; candidateError.value='备件读取失败，请重试后再选择。' } } finally { if(request===candidateRequest)candidateLoading.value = false }
}
async function loadScopeOptions() {
  const request=++scopeRequest
  const requestedWorkshop=form.workshopCode
  try {
    const result = await getFilters({ workshopCode: requestedWorkshop })
    if(request!==scopeRequest || requestedWorkshop!==form.workshopCode)return
    areas.value = result.data?.areas || []
    shelfMap.value = result.data?.shelfMap || {}
    scopeError.value = false
  } catch { if (request === scopeRequest) { areas.value = []; shelfMap.value = {}; scopeError.value = true } }
}
function isSelected(row) { return selectedParts.value.some(item => item._id === row._id) }
function togglePart(row) {
  if (submitting.value) return
  if (isSelected(row)) removePart(row._id)
  else selectedParts.value.push({ ...row, actualStock: null })
}
function toggleSelectAll() {
  if (submitting.value) return
  if (allSelected.value) {
    const ids = new Set(candidates.value.map(row => row._id))
    selectedParts.value = selectedParts.value.filter(item => !ids.has(item._id))
  } else {
    const existing = new Set(selectedParts.value.map(item => item._id))
    const toAdd = candidates.value.filter(row => !existing.has(row._id)).map(row => ({ ...row, actualStock: null }))
    selectedParts.value = [...selectedParts.value, ...toAdd]
  }
}
function removePart(id) { if (!submitting.value) selectedParts.value = selectedParts.value.filter(item => item._id !== id) }
function candidateLocation(row) { return [row.warehouseAreaName, row.locationCode || (row.shelf != null ? `${row.shelf}号架` : '')].filter(Boolean).join(' · ') || '-' }

async function submitOrder() {
  if (submitting.value) return
  submitError.value = ''
  if (!canCreate) return ElMessage.warning('当前账号没有盘点权限')
  if (!form.inventoryUser.trim()) return ElMessage.warning('请填写盘点人')
  if (!form.inventoryDate) return ElMessage.warning('请选择盘点日期')
  if (!selectedParts.value.length) return ElMessage.warning('请至少选择一项备件')
  const invalid = selectedParts.value.find(item => !validStockCount(item.actualStock))
  if (invalid) return ElMessage.warning(`请填写「${invalid.materialDesc || invalid.materialCode}」的有效实盘数量；实际为零时请明确输入 0。`)

  const inventoryAllList = selectedParts.value.map(item => ({
    partId: item._id,
    partName: item.materialDesc,
    materialCode: item.materialCode,
    snapshotStock: Number(item.totalStock),
    sysStockNum: Number(item.totalStock),
    actualStock: Number(item.actualStock),
    sysStockUnit: item.unit || '个',
    warehouseAreaName: item.warehouseAreaName,
    locationCode: item.locationCode,
    shelf: item.shelf,
    layer: item.layer
  }))
  const abnormalList = selectedParts.value
    .filter(item => inventoryQuantitiesDiffer(item.totalStock,item.actualStock))
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
      filterParams: { source: /DigitalWorkbenchAndroid\//.test(navigator.userAgent)?'android':'web', workshopCode: form.workshopCode, scopeType: form.scopeType, warehouseAreaName: form.scopeType === 'area' ? partArea.value : '', shelves: form.scopeType === 'shelf' ? partShelf.value : [] },
      inventoryAllList,
      abnormalList
    })
    ElMessage.success('盘点单已提交，等待审批')
    createVisible.value = false
    query.status = '待审批'
    await load()
  } catch(error) { submitError.value = error.response?.data?.msg || '盘点单未能确认提交成功，填写内容已保留。请核对任务记录后再重试。'; ElMessage.error(submitError.value) }
  finally { submitting.value = false }
}

async function allowCreateLeave() {
  if (submitting.value) { ElMessage.warning('盘点单正在提交，请等待结果后再关闭。'); return false }
  if (!createDirty.value) return true
  try { await ElMessageBox.confirm('当前盘点尚未提交，关闭会丢失已选备件和实盘数量。', '保留盘点填写', { confirmButtonText: '放弃填写', cancelButtonText: '继续盘点', type: 'warning' }); return true } catch { return false }
}
async function closeCreate(done) { if (!await allowCreateLeave()) return; candidateRequest++; scopeRequest++; createVisible.value = false; if (typeof done === 'function') done() }
function beforeUnload(event) { if (createDirty.value || submitting.value) { event.preventDefault(); event.returnValue = '' } }
function rememberView() { viewState.save({ query: { ...query }, scrollTop: window.scrollY }) }
onBeforeRouteLeave(async () => { if (!await allowCreateLeave()) return false; rememberView(); return true })
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); return load() })
onBeforeUnmount(()=>{rememberView();window.removeEventListener('beforeunload',beforeUnload);candidateRequest++;orderRequest++;detailRequest++;scopeRequest++})
</script>

<style scoped>
.count-create-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 22px}
.count-create-steps button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;border:0;border-bottom:2px solid #e6ebef;background:none;font:inherit;font-size:13px;color:#708294;padding:8px 0}
.count-create-steps button.active{border-bottom-color:#ac2d48;color:#ac2d48;font-weight:600}.count-create-steps button:disabled{opacity:.55}.count-create-steps b{font-size:11px;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;background:#eef1f5}.count-create-steps .active b{background:#f7e7ec}.count-step-note{color:#64768a;font-size:13px;line-height:1.6}
:global(body.workbench-mobile .count-app-create-dialog){display:flex;flex-direction:column;height:min(88vh,820px);height:min(88dvh,820px);margin:auto!important;border-radius:16px!important;padding:0!important}
:global(body.workbench-mobile .count-app-create-dialog .el-dialog__header){flex:none;margin:0;padding:18px 20px;border-bottom:1px solid #e6ebf0}
:global(body.workbench-mobile .count-app-create-dialog .el-dialog__body){flex:1;min-height:0;max-height:none!important;overflow-y:auto;padding:16px!important}
:global(body.workbench-mobile .count-app-create-dialog .el-dialog__footer){flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom))!important}
:global(body.workbench-mobile .count-app-create-dialog .el-select__wrapper),:global(body.workbench-mobile .count-app-create-dialog .el-input__wrapper),:global(body.workbench-mobile .count-app-create-dialog .phone-count-date-field){min-height:46px!important;height:46px!important;box-sizing:border-box}
:global(body.workbench-mobile .count-app-create-dialog .el-form-item__label){line-height:20px;height:20px;margin-bottom:7px!important;padding:0!important}
:global(body.workbench-mobile .count-app-create-dialog .check-create-meta-grid){display:grid;grid-template-columns:1fr}
:global(.count-detail-dialog .el-dialog__body){max-height:72vh;overflow:auto;padding:16px}
.check-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;white-space:nowrap}.check-row-actions :deep(.el-button){margin:0!important;flex:none}.count-difference{color:#b53640;font-weight:600}.count-consistent{color:#278250}.count-result-heading{cursor:help}
:global(body.workbench-mobile .count-app-create-dialog .candidate-filters){width:100%;display:flex;flex-direction:column;gap:10px}
:global(body.workbench-mobile .count-app-create-dialog .candidate-filters .el-input),:global(body.workbench-mobile .count-app-create-dialog .candidate-filters .el-select){width:100%!important}
:global(body.workbench-mobile .count-app-create-dialog .phone-candidates){max-height:none;overflow:visible}
.count-candidate-selection{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid #e8edf2;margin-bottom:2px}.count-candidate-selection>span{font-size:12px;color:#718294;white-space:nowrap}
.check-app{min-width:0}
.check-metric-button{width:100%;color:inherit;font:inherit;text-align:left}
.count-unverified{display:block;color:#a65f10}
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

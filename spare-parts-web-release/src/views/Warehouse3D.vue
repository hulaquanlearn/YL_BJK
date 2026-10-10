<template>
  <div class="warehouse-page">
    <section class="control-panel panel">
      <div class="locator-field">
        <label>快速定位备件</label>
        <el-select
          v-model="selectedPartId"
          filterable
          remote
          clearable
          reserve-keyword
          popper-class="warehouse-part-options"
          :remote-method="searchParts"
          :loading="partSearching"
          placeholder="输入物料编码、名称、规格或六位库位码"
          style="width:100%"
          @change="choosePart"
          @clear="clearPart"
        >
          <el-option v-for="part in partOptions" :key="part._id" :value="part._id" :label="part.materialDesc || part.materialCode">
            <div class="part-option" :title="`${part.materialDesc || part.materialCode} · ${compactLocation(part)}`">
              <span><strong>{{ part.materialDesc || '未命名备件' }}</strong><small>{{ part.materialCode }} · {{ part.spec || '未填写规格' }}</small></span>
              <em>{{ compactLocation(part) }}</em>
            </div>
          </el-option>
        </el-select>
      </div>
      <div class="workshop-field">
        <label>所属车间</label>
        <el-select v-model="workshopCode" style="width:100%" @change="changeWorkshop">
          <el-option v-for="item in workshopOptions" :key="item.code" :label="item.name" :value="item.code" />
        </el-select>
      </div>
      <div class="group-filter">
        <label>区域筛选</label>
        <div class="filter-chips">
          <button type="button" :class="{ active: activeGroup === '' }" @click="setGroup('')">全部</button>
          <button
            v-for="item in groupFilters"
            :key="item.key"
            type="button"
            class="has-color"
            :class="{ active: activeGroup === item.key }"
            :style="{ '--filter-color': item.color }"
            @click="setGroup(item.key)"
          ><i aria-hidden="true"></i>{{ item.label }}</button>
        </div>
      </div>
    </section>

    <section ref="fullscreenArea" class="warehouse-workspace" :class="{ 'is-panel-collapsed': sidePanelCollapsed }">
      <article class="model-card panel">
        <div class="model-toolbar">
          <div class="model-title">
            <div class="model-title-heading"><strong>{{ layout?.room?.name || '原粮车间备件库' }}</strong>              <el-tooltip content="刷新布局" placement="top">
                <el-button class="refresh-layout-button" :loading="loading" aria-label="刷新布局" @click="loadLayout"><el-icon v-if="!loading"><Refresh /></el-icon><span>刷新</span></el-button>
              </el-tooltip></div>
            <template v-if="displayMode==='3d'"><span class="desktop-scene-help">左键拖动旋转 · Ctrl+滚轮缩放 · 右键拖动平移 · 双击复位</span><span class="touch-scene-help">单指旋转 · 双指缩放、平移 · 点击货架查看</span></template>
            <span v-else>平面图适合快速确认货架相对位置与入口方向</span>
          </div>
          <div v-if="isFullscreen" class="fullscreen-locator">
            <el-select
              v-model="selectedPartId"
              filterable
              remote
              clearable
              reserve-keyword
              :remote-method="searchParts"
              :loading="partSearching"
              placeholder="全屏搜索备件或库位码"
              @change="choosePart"
              @clear="clearPart"
            >
              <el-option v-for="part in partOptions" :key="`full-${part._id}`" :value="part._id" :label="`${part.materialCode} · ${part.materialDesc || '未命名备件'}`" />
            </el-select>
          </div>
          <div class="model-actions">
            <div class="view-mode-tools">
              <el-button-group aria-label="库房展示方式">
                <el-button :type="displayMode === '3d' ? 'primary' : ''" :aria-pressed="displayMode === '3d'" @click="displayMode='3d'">3D立体</el-button>
                <el-button :type="displayMode === '2d' ? 'primary' : ''" :aria-pressed="displayMode === '2d'" @click="displayMode='2d'">2D平面</el-button>
              </el-button-group>

            </div>
            <el-dropdown v-if="displayMode==='3d'" trigger="click" @command="setPartModelMode">
              <el-button><el-icon><Box /></el-icon>{{ partModelModeLabel }}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="hidden">隐藏备件模型</el-dropdown-item>
                  <el-dropdown-item command="all">展示全部备件</el-dropdown-item>
                  <el-dropdown-item command="normal">仅展示正常库存</el-dropdown-item>
                  <el-dropdown-item command="low">仅展示低库存</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown v-if="displayMode==='3d'" class="scene-view-menu" trigger="click" @command="setView"><el-button><el-icon><View /></el-icon>视角：{{viewMode==='perspective'?'立体':'俯视'}}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="perspective">立体视角</el-dropdown-item><el-dropdown-item command="top">俯视视角</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
            <el-button v-if="displayMode==='3d'" class="touch-reset-button" @click="resetPerspectiveView">复位视角</el-button>
            <el-button class="panel-toggle-button" :aria-pressed="!sidePanelCollapsed" :title="sidePanelCollapsed ? '显示货架' : '收起货架'" @click="toggleSidePanel">
              <el-icon><ArrowLeftBold v-if="sidePanelCollapsed" /><ArrowRightBold v-else /></el-icon>货架
            </el-button>
            <el-button class="fullscreen-button" :type="isFullscreen ? 'primary' : ''" @click="toggleFullscreen">
              <el-icon><FullScreen /></el-icon>{{ isFullscreen ? '退出全屏' : '全屏查看' }}
            </el-button>
          </div>
        </div>
        <div v-show="displayMode==='3d'" ref="stage" class="three-stage" :class="{ 'is-loading': loading }">
          <div v-if="loading" class="stage-loading"><el-icon class="is-loading"><Loading /></el-icon><span>正在构建库房模型</span></div>
          <div v-if="webglError" class="stage-error">
            <el-icon><Warning /></el-icon>
            <strong>当前浏览器未启用 3D 图形</strong>
            <span>请在新版 Chrome 或 Edge 中打开；货架列表仍可正常使用。</span>
          </div>
          <div class="stock-model-legend" aria-label="备件模型颜色说明"><span><i class="normal"></i>库存正常</span><span><i class="low"></i>需要补充</span></div>
        </div>
        <div v-show="displayMode==='2d'" class="two-stage">
          <div class="floor-label">现场平面图</div><div class="east-label">{{ eastDirectionLabel }}</div><div class="entrance-2d" :style="entrancePlanStyle"><el-icon><Right /></el-icon>入口</div>
          <button v-for="shelf in visibleShelves" :key="`plan-${shelf.id}`" type="button" class="plan-shelf" :class="{active:selectedShelf?.id===shelf.id,unnamed:shelf.shelfNo==null}" :style="planStyle(shelf)" @click="selectShelf(shelf,false)"><strong>{{ shelf.displayName }}</strong><small>{{ shelf.partsCount }} 条</small></button>
          <div v-for="sp in stagingPoints" :key="`sp-${sp.id}`" class="plan-staging" :style="stagingStyle(sp)" :title="sp.description || sp.name"><span>{{ sp.name }}</span></div>
        </div>
        <p v-if="displayMode==='2d'" class="plan-help">按真实相对位置显示；点击货架查看层数与备件。暂存点为历史只读标记。</p>
      </article>

      <aside v-show="!sidePanelCollapsed" class="shelf-panel panel" :class="{'is-stock-detail':stockDetailVisible}">
        <section v-if="stockDetailVisible" class="stock-detail-panel" v-loading="stockDetailLoading">
          <header><strong>备件详情</strong><el-button text aria-label="关闭备件详情" @click="stockDetailVisible=false"><el-icon><Close /></el-icon></el-button></header>
          <h3>{{ selectedPart?.materialDesc }}</h3><div class="stock-identity-line"><code>{{ selectedPart?.materialCode }}</code><el-tag :type="Number(selectedPart?.totalStock)===0?'danger':selectedPart?.reorderPoint!=null && Number(selectedPart?.totalStock)<=Number(selectedPart?.reorderPoint)?'warning':'success'">{{ Number(selectedPart?.totalStock)===0?'零库存':selectedPart?.reorderPoint!=null && Number(selectedPart?.totalStock)<=Number(selectedPart?.reorderPoint)?'需补货':'库存正常' }}</el-tag></div>
          <PartModelDetail :part="selectedPart" compact />
          <dl class="stock-detail-fields"><div><dt>规格型号</dt><dd>{{ selectedPart?.spec || '未填写' }}</dd></div><div><dt>库位</dt><dd>{{ compactLocation(selectedPart) }}</dd></div><div><dt>当前库存</dt><dd>{{ selectedPart?.totalStock }} {{ selectedPart?.unit }}</dd></div><div><dt>订购点 / 最高储备</dt><dd>{{ selectedPart?.reorderPoint ?? '未配置' }} / {{ selectedPart?.maxStock ?? '未配置' }}</dd></div><div><dt>不含税单价</dt><dd>{{ selectedPart?.price == null ? '未配置' : `¥ ${Number(selectedPart.price).toFixed(2)}` }}</dd></div></dl>
          <div v-if="stockDetailError" role="alert">详情加载失败 <el-button link @click="loadStockDetail(selectedPart)">重新加载</el-button></div>
          <div v-if="stockDetailCandidates.length>1" class="stock-slot-choices"><strong>同一货位的备件</strong><button v-for="part in stockDetailCandidates" :key="part._id" :class="{active:String(part._id)===String(selectedPart?._id)}" @click="locatePart(part)">{{ part.materialCode }} · {{ part.materialDesc }}</button></div>
          <el-button type="primary" @click="router.push({path:'/inventory',query:{...inventoryRouteQuery({workshopCode:selectedPart?.workshopCode}),inventoryId:selectedPart?._id}})">查看完整台账</el-button>
        </section>
        <template v-else>
        <header>
          <div><span>{{ panelMode === 'parts' ? '本架备件' : '货架导航' }}</span><strong>{{ panelMode === 'parts' ? shelfPartsCountText : `${visibleShelves.length} 组` }}</strong></div>
          <div class="panel-head-actions">
            <el-button v-write="canEditCurrentWorkshop" v-if="displayMode === '3d' && selectedShelf && $showControl(canEditCurrentWorkshop)" link type="primary" @click="openShelfEditor(selectedShelf)">
              <el-icon><EditPen /></el-icon>标牌设置
            </el-button>
          </div>
        </header>

        <div v-if="selectedShelf" class="panel-tabs" role="tablist" aria-label="货架信息视图">
          <button type="button" :class="{ active: panelMode === 'shelves' }" @click="panelMode = 'shelves'">货架导航</button>
          <button type="button" :class="{ active: panelMode === 'parts' }" @click="panelMode = 'parts'">本架备件 <b>{{ shelfPartsLoading ? '…' : displayedShelfParts.length }}</b></button>
        </div>

        <div v-if="selectedPart && panelMode === 'parts'" class="located-part">
          <div class="located-icon"><el-icon><LocationFilled /></el-icon></div>
          <div class="located-identity">
            <strong :title="selectedPartDisplay.name">{{ selectedPartDisplay.name }}</strong>
            <div class="located-code"><span>物料编码</span><code>{{ selectedPartDisplay.code }}</code></div>
          </div>
          <p v-if="selectedPartDisplay.spec" class="located-spec"><span>规格</span>{{ selectedPartDisplay.spec }}</p>
          <dl class="located-location">
            <div><dt>货架</dt><dd>{{ selectedLocationSegments.shelf }}</dd></div>
            <div><dt>侧别</dt><dd>{{ sideText(selectedPartLocation.position) }}</dd></div>
            <div><dt>层数</dt><dd>{{ selectedLocationSegments.layer }}</dd></div>
            <div><dt>货位</dt><dd>{{ selectedLocationSegments.slot }}</dd></div>
          </dl>
          <button class="located-qr" type="button" @click="openQr"><el-icon><Link /></el-icon>定位二维码</button>
        </div>

        <div v-if="selectedShelf && panelMode === 'parts'" class="layer-map">
          <div class="layer-map-title">
            <div><strong>货架层位图</strong><small>已选 {{ selectedLayers.length }}/{{ commonShelfLevels }} 层</small></div>
            <button type="button" :class="{ active: allLayersSelected }" @click="selectAllLayers">全选</button>
          </div>
          <button v-for="item in layerStats" :key="item.layer" type="button" :class="{active:selectedLayers.includes(item.layer),located:Number(selectedPartLocation.layer)===item.layer}" @click="toggleLayer(item.layer)">
            <span><b>{{ item.layer }}层</b><small>{{ item.layer === 1 ? '最下层' : item.layer === commonShelfLevels ? '最上层' : '' }}</small></span><i></i><strong>{{ item.count }} 条</strong>
          </button>
        </div>

        <div v-if="selectedShelf && panelMode === 'shelves'" class="selected-shelf-card">
          <div class="shelf-card-top">
            <div><span>当前货架</span><strong>{{ selectedShelf.displayName }}</strong></div>
            <span v-if="selectedShelf.isVendor" class="shelf-kind-badge is-vendor">厂家备件</span>
            <span v-else-if="selectedShelf.shelfNo == null" class="shelf-kind-badge is-unnamed">待编号</span>
          </div>
          <dl>
            <div><dt>所属区域</dt><dd>{{ selectedShelf.workshopGroup }}</dd></div>
            <div><dt>货架层数</dt><dd>{{ commonShelfLevels }} 层</dd></div>
            <div><dt>备件条目</dt><dd>{{ selectedShelf.partsCount }} 条</dd></div>
            <div><dt>低库存</dt><dd :class="{ danger: selectedShelf.lowStockCount }">{{ selectedShelf.lowStockCount }} 条</dd></div>
          </dl>
        </div>

        <div v-show="panelMode === 'shelves'" class="shelf-list">
          <button
            v-for="shelf in visibleShelves"
            :key="shelf.id"
            type="button"
            :class="{ active: selectedShelf?.id === shelf.id, unnamed: shelf.shelfNo == null }"
            @click="selectShelf(shelf, true)"
          >
            <span class="shelf-number">{{ shelf.shelfNo == null ? '—' : padShelf(shelf.shelfNo) }}</span>
            <span class="shelf-copy"><strong>{{ shelf.displayName }}</strong><small>{{ shelf.workshopGroup }} · {{ shelf.partsCount }} 条备件</small></span>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>

        <div v-if="selectedShelf && panelMode === 'parts'" class="shelf-parts is-expanded">
          <div class="parts-heading"><strong>货架内备件</strong><span>{{ displayedShelfParts.length }} 条</span></div>
          <div v-loading="shelfPartsLoading" class="parts-scroll">
            <button v-for="part in displayedShelfParts" :key="part._id" type="button" :class="{ active: selectedPart?._id === part._id }" @click="locatePart(part)">
              <span><strong>{{ part.materialDesc || part.materialCode }}</strong><small>{{ part.materialCode }} · {{ compactLocation(part) }}</small></span>
              <em>{{ part.totalStock }} {{ part.unit || '个' }}</em>
            </button>
            <p v-if="shelfPartsError" role="alert">{{shelfPartsError}} <button @click="selectShelf(selectedShelf,false,false,false)">重试</button></p>
            <el-empty v-if="!shelfPartsLoading && !shelfPartsError && !displayedShelfParts.length" :image-size="58" description="当前层暂无备件记录" />
          </div>
        </div>
        </template>
      </aside>
    </section>

    <section class="code-guide panel">
      <div class="code-display">
        <span class="guide-title">六位库位码 <el-tooltip content="编码依次为：两位货架号、东/西侧、一位层数、两位南北货位。点击备件后会自动更新。" placement="top"><el-icon><QuestionFilled /></el-icon></el-tooltip></span>
        <strong><i>{{ selectedLocationSegments.shelf }}</i><i>{{ selectedLocationSegments.position }}</i><i>{{ selectedLocationSegments.layer }}</i><i>{{ selectedLocationSegments.slot }}</i></strong>
      </div>
      <ol>
        <li><b>01–99</b><span>货架号</span></li>
        <li><b>1 / 2</b><span>东侧 / 西侧</span></li>
        <li><b>1–4</b><span>从下至上的层数</span></li>
        <li><b>01–99</b><span>从南至北的货位</span></li>
      </ol>
    </section>

    <el-dialog v-model="editorVisible" title="货架标牌设置" width="min(560px, 94vw)" destroy-on-close>
      <div v-if="editingShelf" class="editor-preview">
        <span class="preview-number">{{ editShelfNoText || '—' }}</span>
        <div><strong>{{ editForm.displayName || (editShelfNoText ? `${editShelfNoText}货架` : '未命名货架') }}</strong><small>{{ editingShelf.workshopGroup }} · {{ editingShelf.partsCount || 0 }} 条备件 · 固定 4 层</small></div>
        <span class="editor-status">布局固定</span>
      </div>
      <el-form label-position="top" class="shelf-editor-form">
        <section class="editor-section">
          <header><strong>标牌信息</strong><span>仅维护名称与编号，不改变位置、尺寸或工段颜色</span></header>
          <div class="editor-basic-grid">
            <el-form-item label="货架名称">
              <el-input v-model="editForm.displayName" maxlength="60" show-word-limit clearable placeholder="例如：减速机专用架" />
            </el-form-item>
            <el-form-item label="货架号（01–99）">
              <el-input v-model="editForm.shelfNo" maxlength="2" clearable placeholder="留空表示暂未编号" @input="sanitizeShelfNo" />
            </el-form-item>
          </div>
          <el-alert v-if="editorRenumbering" title="正在修改已使用货架的编号" description="保存后会同步更新本架全部备件的六位库位码，并写入审计记录。" type="warning" :closable="false" show-icon />
        </section>
        <el-alert title="实体布局已锁定" description="货架位置、朝向、尺寸、增删均由固定布局控制，避免误操作。" type="info" :closable="false" show-icon />
      </el-form>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button v-write type="primary" :loading="editorSubmitting" @click="submitShelfEdit">保存标牌</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="qrVisible" title="备件定位二维码" width="min(430px, 92vw)">
      <div class="qr-card"><img v-if="qrDataUrl" :src="qrDataUrl" alt="备件定位二维码" /><div><strong>{{ selectedPart?.materialDesc || selectedPart?.materialCode }}</strong><span>{{ compactLocation(selectedPart) }}</span><small>手机扫码后登录网页即可直接定位到此备件</small></div></div>
      <template #footer><el-button @click="copyLocationLink"><el-icon><CopyDocument /></el-icon>复制定位链接</el-button><el-button type="primary" @click="downloadQr"><el-icon><Download /></el-icon>下载二维码</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.warehouse-page .plan-shelf.active{color:#583a00;background:#ffd65a;border-color:#bf8600;outline:4px solid #f7bd3c88;filter:none}.warehouse-page .shelf-list button.active{color:#694500;background:#fff2bc;box-shadow:inset 3px 0 #e9a700}.warehouse-page .selected-shelf-card{border-color:#e8c161;background:#fffae7}
</style>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { collectParts } from '../utils/collect-parts.mjs'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { flattenStockModel, instanceStockModels, stockPartsForHit } from '../utils/stock-model-geometry.mjs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import QRCode from 'qrcode'
import PartModelDetail from '../components/PartModelDetail.vue'
import { inventoryRouteQuery } from '../utils/inventory-scope.mjs'
import { getPart, getParts, getWarehouseLayout, updateWarehouseShelf, getStagingPoints } from '../api'
import { canEditWorkshop } from '../auth'
import { overviewModelRotation, modelFitScale, slotModelBounds } from '../utils/model-fit.mjs'
import { warehouseModelUrl } from '../utils/evidence-models.mjs'
import {
  COMMON_SHELF_LEVELS,
  PHYSICAL_ROOM_HALF_DEPTH,
  PHYSICAL_ROOM_HALF_WIDTH,
  VENDOR_SIGN_COLOR,
  applyPhysicalShelfLayout,
  layerLocalY,
  partBelongsToShelf,
  resolvePartLocation,
  sideAwareSlotLocalX,
  sideLocalZ,
  slotCapacityForLocation
} from '../utils/warehouse-location.mjs'
import { locatedPartDisplay } from '../utils/located-part-display.mjs'

const stage = ref(null)
const route = useRoute()
const router = useRouter()
const fullscreenArea = ref(null)
const loading = ref(true)
const layout = ref(null)
const shelves = ref([])
const workshopCode = ref(String(route.query.workshopCode || 'raw_grain'))
const workshopOptions = ref([
  { code: 'raw_grain', name: '原粮车间' },
  { code: 'qu_making', name: '制曲车间' },
  { code: 'brewing', name: '酿酒车间' }
])
const activeGroup = ref('')
const selectedShelf = ref(null)
const stockDetailVisible = ref(false), stockDetailLoading = ref(false), stockDetailError = ref(false), stockDetailCandidates = ref([])
let stockDetailToken = 0
async function loadStockDetail(part) {
  const token=++stockDetailToken
  if (!part?._id) { stockDetailLoading.value=false; return }
  stockDetailLoading.value=true;stockDetailError.value=false
  try { const result=await getPart(part._id);if(token===stockDetailToken)selectedPart.value=result.data } catch { if(token===stockDetailToken)stockDetailError.value=true } finally { if(token===stockDetailToken)stockDetailLoading.value=false }
}
const selectedPart = ref(null)
const selectedPartId = ref('')
const partOptions = ref([])
const partSearching = ref(false)
const shelfParts = ref([])
const shelfPartsLoading = ref(false)
const shelfPartsError = ref('')
const panelMode = ref('shelves')
const sidePanelCollapsed = ref(true)
const viewMode = ref('perspective')
const displayMode = ref('3d')
const selectedLayers = ref(Array.from({ length: COMMON_SHELF_LEVELS }, (_, index) => index + 1))
const isFullscreen = ref(false)
const webglError = ref(false)
const editorVisible = ref(false)
const editingShelf = ref(null)
const editorSubmitting = ref(false)
const editForm = reactive({ displayName: '', shelfNo: '' })
const qrVisible = ref(false)
const qrDataUrl = ref('')
const partModelMode = ref('all')
const allLocatedParts = ref([])
const canEditCurrentWorkshop = computed(() => canEditWorkshop(workshopCode.value))
const stagingPoints = ref([])
const VENDOR_FILTER = '__VENDOR__'

const workshopGroups = computed(() => [...new Set(shelves.value.map(item => item.workshopGroup).filter(Boolean))])
const groupFilters = computed(() => {
  const items = workshopGroups.value.map(label => ({ key: label, label, color: areaColor(label) }))
  if (shelves.value.some(item => item.isVendor)) items.push({ key: VENDOR_FILTER, label: '厂家备件', color: VENDOR_SIGN_COLOR })
  return items
})
const visibleShelves = computed(() => shelves.value.filter(item => shelfMatchesFilter(item, activeGroup.value)))
const commonShelfLevels = computed(() => COMMON_SHELF_LEVELS)
const selectedPartLocation = computed(() => resolvePartLocation(selectedPart.value || {}))
const selectedPartDisplay = computed(() => locatedPartDisplay(selectedPart.value || {}))
const allLayersSelected = computed(() => selectedLayers.value.length === COMMON_SHELF_LEVELS)
const displayedShelfParts = computed(() => shelfParts.value.filter(part => selectedLayers.value.includes(Number(resolvePartLocation(part).layer))))
const shelfPartsCountText = computed(() => shelfPartsLoading.value ? '加载中…' : `${displayedShelfParts.value.length} 条`)
const layerStats = computed(() => Array.from({ length: COMMON_SHELF_LEVELS }, (_, index) => ({ layer: index + 1, count: shelfParts.value.filter(part => Number(resolvePartLocation(part).layer) === index + 1).length })))
const editShelfNoText = computed(() => editForm.shelfNo ? `${String(editForm.shelfNo).padStart(2, '0')}号` : '')
const editorRenumbering = computed(() => editingShelf.value && String(editForm.shelfNo || '') !== String(editingShelf.value.shelfNo || ''))
const partModelModeLabel = computed(() => ({ hidden: '隐藏备件', all: '全部备件', normal: '正常库存', low: '低库存' }[partModelMode.value] || '全部备件'))
const selectedLocationSegments = computed(() => {
  const location = selectedPartLocation.value
  return {
    shelf: location.shelf == null ? '—' : padShelf(location.shelf),
    position: location.position || '—',
    layer: location.layer || '—',
    slot: location.location == null ? '—' : padSlot(location.location)
  }
})
const currentRoom = computed(() => layout.value?.room || {
  name: '备件库', width: PHYSICAL_ROOM_HALF_WIDTH * 2, depth: PHYSICAL_ROOM_HALF_DEPTH * 2,
  height: 4.2, eastDirection: '+z', entranceWall: 'east', entranceOffset: 11.8, entranceWidth: 2.4
})
const roomWidth = computed(() => {
  const configuredWidth = Math.max(Number(currentRoom.value.width) || 19, 8)
  if (workshopCode.value !== 'raw_grain') return configuredWidth
  // Display padding follows the widened aisle; stored room dimensions stay intact.
  const halfSpan = shelves.value.reduce((span, shelf) => {
    const angle = Number(shelf.position?.rotationY) || 0
    const halfWidth = (Math.abs(Math.cos(angle)) * Number(shelf.size?.width || 4.9)
      + Math.abs(Math.sin(angle)) * Number(shelf.size?.depth || 0.9)) / 2
    return Math.max(span, Math.abs(Number(shelf.position?.x) || 0) + halfWidth)
  }, 0)
  const requiredWidth = (halfSpan + 0.5) * 2
  return Math.max(configuredWidth, Math.ceil(requiredWidth * 10) / 10)
})
const roomDepth = computed(() => Math.max(Number(currentRoom.value.depth) || 34, 8))
const entrancePlanStyle = computed(() => {
  const room = currentRoom.value
  const wall = room.entranceWall || 'west'
  const span = ['west', 'east'].includes(wall) ? roomDepth.value : roomWidth.value
  const offset = Number(room.entranceOffset) || 0
  const position = ((span / 2 - offset) / span) * 100
  // 与 planStyle 一致：俯视图将世界 X、Z 轴反向映射到屏幕。
  if (wall === 'east') return { left: '-3px', top: `${position}%`, transform: 'translateY(-50%)', '--entrance-arrow': '0deg' }
  if (wall === 'west') return { right: '-3px', left: 'auto', top: `${position}%`, transform: 'translateY(-50%)', '--entrance-arrow': '180deg' }
  if (wall === 'north') return { top: '-3px', left: `${position}%`, transform: 'translateX(-50%)', '--entrance-arrow': '90deg' }
  return { bottom: '-3px', top: 'auto', left: `${position}%`, transform: 'translateX(-50%)', '--entrance-arrow': '-90deg' }
})
const eastDirectionLabel = computed(() => ({ '+z': '东 ↑', '-z': '东 ↓', '+x': '东 →', '-x': '东 ←' }[currentRoom.value.eastDirection] || '东 ↑'))

let scene
let camera
let renderer
let labelRenderer
let controls
let raycaster
let pointer
let animationFrame
let resizeObserver
let shelfRoot
let markerRoot
let partModelsRoot
let roomRoot
let cameraAnimation
let pointerStart = null
const stagePointers = new Set()
let multiPointerGesture = false
let previousStageAspect = null
let partModelDrawToken = 0
let partModelsRequestToken = 0
let layoutRequestToken = 0
let partLocationRequestToken = 0
let partSearchRequestToken = 0
let shelfPartsRequestToken = 0
const gltfLoader = new GLTFLoader()
const customModelCache = new Map()
const stockMaterialCache = new Map()
const clickableMeshes = []

function overviewTarget() {
  return new THREE.Vector3(0, 1.2, 0)
}

function stageFramingScale(aspect = (stage.value?.clientWidth || 1) / (stage.value?.clientHeight || 1)) {
  const direction = new THREE.Vector3(-.75,.65,-1.09).normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction,right).normalize()
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera?.fov || 42) / 2)
  const tanH = tanV * Math.max(.25,aspect)
  let distance = 0
  // Fit each room corner to the viewport, including wall and shelf height.
  for (const x of [-roomWidth.value/2,roomWidth.value/2]) for (const y of [-1.2,4.8]) for (const z of [-roomDepth.value/2,roomDepth.value/2]) {
    const corner = new THREE.Vector3(x,y,z)
    distance = Math.max(distance, corner.dot(direction) + Math.max(Math.abs(corner.dot(right))/tanH,Math.abs(corner.dot(up))/tanV))
  }
  return distance * 1.1
}

function overviewCameraPosition(mode, target = overviewTarget()) {
  const aspect = (stage.value?.clientWidth || 1) / (stage.value?.clientHeight || 1)
  if (mode === 'top') {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera?.fov || 42)/2)
    return new THREE.Vector3(target.x, Math.max(roomDepth.value/(2*tanV),roomWidth.value/(2*tanV*Math.max(.25,aspect)))*1.1+6,target.z+.01)
  }
  return target.clone().add(new THREE.Vector3(-.75,.65,-1.09).normalize().multiplyScalar(stageFramingScale(aspect)))
}

function eastVector(direction = currentRoom.value.eastDirection) {
  return {
    '+x': new THREE.Vector3(1, 0, 0), '-x': new THREE.Vector3(-1, 0, 0),
    '+z': new THREE.Vector3(0, 0, 1), '-z': new THREE.Vector3(0, 0, -1)
  }[direction] || new THREE.Vector3(1, 0, 0)
}

function formatNumber(value) { return Number(value || 0).toLocaleString('zh-CN') }
function padShelf(value) { return String(value ?? '').padStart(2, '0') }
function padSlot(value) { return value == null || value === '' ? '—' : String(value).padStart(2, '0') }
function shelfLabel(value) { return value == null || value === '' ? '未编号货架' : `${padShelf(value)}号货架` }
function sideText(value) { return String(value) === '1' ? '东侧' : String(value) === '2' ? '西侧' : '未标侧面' }
function areaColor(group) {
  const value = String(group || '')
  if (value.includes('蒸')) return '#b4232d'
  if (value.includes('破曲')) return '#d97706'
  if (value.includes('五粮')) return '#0f766e'
  if (value.includes('输送')) return '#6d4ab0'
  return '#64748b'
}
function compactLocation(part) {
  if (!part) return '库位待确认'
  const location = resolvePartLocation(part)
  if (location.locationCode) return location.locationCode
  return `${shelfLabel(location.shelf)} · ${sideText(location.position)} · ${location.layer || '-'}层 · ${padSlot(location.location)}位`
}

function selectAllLayers() {
  selectedLayers.value = Array.from({ length: COMMON_SHELF_LEVELS }, (_, index) => index + 1)
}

function toggleLayer(layer) {
  const value = Number(layer)
  if (allLayersSelected.value) {
    selectedLayers.value = [value]
    return
  }
  selectedLayers.value = selectedLayers.value.includes(value)
    ? selectedLayers.value.filter(item => item !== value)
    : [...selectedLayers.value, value].sort((a, b) => a - b)
}

function planStyle(shelf) {
  const x = Number(shelf.position?.x) || 0
  const z = Number(shelf.position?.z) || 0
  const width = Math.max(Number(shelf.size?.width) || 2.8, 1.6)
  const depth = Math.max(Number(shelf.size?.depth) || 0.75, 0.6)
  return {
    left: `${((-x + roomWidth.value / 2) / roomWidth.value) * 100}%`,
    top: `${((roomDepth.value / 2 - z) / roomDepth.value) * 100}%`,
    width: `${Math.max((width / roomWidth.value) * 100, 6)}%`,
    height: `${Math.max((depth / roomDepth.value) * 100, 2.8)}%`,
    transform: `translate(-50%,-50%) rotate(${Number(shelf.position?.rotationY || 0) * 180 / Math.PI}deg)`,
    '--plan-color': shelf.isVendor ? VENDOR_SIGN_COLOR : areaColor(shelf.workshopGroup)
  }
}

function shelfMatchesFilter(shelf, filter) {
  if (!filter) return true
  if (filter === VENDOR_FILTER) return Boolean(shelf?.isVendor)
  return shelf?.workshopGroup === filter
}

async function loadLayout() {
  const requestToken = ++layoutRequestToken
  const requestedWorkshop = workshopCode.value
  const isCurrent = () => requestToken === layoutRequestToken && requestedWorkshop === workshopCode.value
  loading.value = true
  try {
    const result = await getWarehouseLayout({ workshopCode: requestedWorkshop })
    if (!isCurrent()) return
    let points = []
    try {
      const spResult = await getStagingPoints({ workshopCode: requestedWorkshop })
      points = spResult.data || []
    } catch { /* Staging points are optional; retain the warehouse layout. */ }
    if (!isCurrent()) return
    layout.value = result.data
    if (Array.isArray(result.data?.workshops) && result.data.workshops.length) workshopOptions.value = result.data.workshops
    shelves.value = (result.data?.shelves || []).map(item => applyPhysicalShelfLayout(item, requestedWorkshop))
    stagingPoints.value = points
    if (selectedShelf.value) selectedShelf.value = shelves.value.find(item => item.id === selectedShelf.value.id) || null
    await nextTick()
    if (!isCurrent()) return
    if (!scene) initScene()
    if (scene) { drawRoom(); drawShelves() }
    if (partModelMode.value !== 'hidden') await loadPartModels()
  } finally {
    if (isCurrent()) loading.value = false
  }
}

async function searchParts(keyword) {
  const requestToken = ++partSearchRequestToken
  const value = String(keyword || '').trim()
  if (!value) { partOptions.value = []; partSearching.value = false; return }
  partSearching.value = true
  try {
    const result = await getParts({ page: 1, pageSize: 20, searchKeyword: value, workshopCode: workshopCode.value })
    if (requestToken !== partSearchRequestToken) return
    partOptions.value = result.data || []
  } finally { if (requestToken === partSearchRequestToken) partSearching.value = false }
}

async function changeWorkshop() {
  partModelsRequestToken++
  partSearchRequestToken++
  shelfPartsRequestToken++
  partModelDrawToken++
  partOptions.value = []
  partSearching.value = false
  shelfPartsLoading.value = false
  allLocatedParts.value = []
  activeGroup.value = ''
  selectedShelf.value = null
  clearPart()
  shelfParts.value = []
  shelfPartsError.value = ''
  if (partModelsRoot) disposeChildren(partModelsRoot)
  await loadLayout()
}

function choosePart(id) {
  const part = partOptions.value.find(item => item._id === id)
  if (part) locatePart(part)
}

function clearPart() {
  partLocationRequestToken++
  stockDetailToken++
  stockDetailVisible.value = false
  stockDetailLoading.value = false
  stockDetailError.value = false
  stockDetailCandidates.value = []
  selectedPart.value = null
  selectedPartId.value = ''
  if (markerRoot) disposeChildren(markerRoot)
  drawShelves()
}

async function setPartModelMode(mode) {
  if (!['all','normal','low','hidden'].includes(mode)) return
  partModelsRequestToken += 1
  partModelMode.value = mode
  if (markerRoot) disposeChildren(markerRoot)
  if (mode === 'hidden') {
    allLocatedParts.value = []
    if (partModelsRoot) disposeChildren(partModelsRoot)
    return
  }
  await loadPartModels()
}

async function loadPartModels() {
  const requestToken = ++partModelsRequestToken
  const requestedMode = partModelMode.value
  const requestedWorkshop = workshopCode.value
  const rows = await collectParts(getParts, {
    workshopCode: requestedWorkshop,
    sort: 'codeAsc',
    ...(requestedMode === 'low' ? { lowStock: 1 } : requestedMode === 'normal' ? { stockStatus: 'normal' } : {})
  }, () => !(requestToken !== partModelsRequestToken || requestedMode !== partModelMode.value || requestedWorkshop !== workshopCode.value))
  if (!rows) return
  if (requestToken !== partModelsRequestToken || requestedMode === 'hidden') return
  allLocatedParts.value = rows.filter(part => /^\d{6}$/.test(String(part.locationCode || '')))
  drawPartModels()
}

function modelCategory(part) {
  const text = `${part.categoryName || ''} ${part.partType || ''} ${part.materialDesc || ''} ${part.spec || ''}`.toLowerCase()
  const rules = [
    ['轴承', /轴承|bearing/], ['断路器', /断路器|空开|breaker|mcb/], ['接触器继电器', /接触器|继电器|contactor|relay/],
    ['电机减速机', /电机|马达|motor|减速机|gearbox/], ['阀门', /阀|valve/], ['传感器开关', /传感器|接近开关|光电开关|sensor|switch/],
    ['泵', /泵|pump/], ['密封件', /密封|油封|o型圈|seal/], ['皮带链条', /皮带|链条|belt|chain/], ['紧固件', /螺栓|螺母|紧固|bolt|nut/]
  ]
  return rules.find(([,pattern]) => pattern.test(text))?.[0] || String(part.categoryName || part.partType || '通用备件').trim() || '通用备件'
}

function modelUrlFor(part) {
  return warehouseModelUrl(part)
}

function modelScaleFor(part) {
  return part.categoryModelScale || 1
}

function modelFrontRotationFor(part) {
  return Number(part.categoryFrontRotationY) || 0
}

function hasRenderedLocationModel(part) {
  if (partModelMode.value === 'hidden') return false
  const locationCode = String(resolvePartLocation(part).locationCode || '')
  return Boolean(locationCode) && allLocatedParts.value.some(item => String(resolvePartLocation(item).locationCode || '') === locationCode)
}

const STOCK_MODEL_COLORS = {
  normal: { color: 0x19a974, emissive: 0x075b40 },
  low: { color: 0xd9222f, emissive: 0x681018 }
}

function stockModelColors(lowStock) {
  return lowStock ? STOCK_MODEL_COLORS.low : STOCK_MODEL_COLORS.normal
}

function applyStockStatusMaterial(object, lowStock) {
  const status = stockModelColors(lowStock)
  object.traverse(node => {
    if (!node.isMesh) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const material of materials) {
      if (!material) continue
      material.color?.setHex(status.color)
      material.emissive?.setHex(status.emissive)
      if ('emissiveIntensity' in material) material.emissiveIntensity = 0.34
      material.needsUpdate = true
    }
  })
}

function partGeometry(part, width, height, depth) {
  // A neutral inventory marker is not a guessed spare-part model.
  return new THREE.BoxGeometry(width * .45, height * .45, depth * .45)
}

function loadCustomModel(url) {
  const absoluteUrl = new URL(url, window.location.origin).href
  if (!customModelCache.has(absoluteUrl)) {
    customModelCache.set(absoluteUrl, new Promise((resolve, reject) => {
      gltfLoader.load(absoluteUrl, gltf => {
        try { const geometry=flattenStockModel(gltf.scene); resolve(geometry) }
        catch(error){customModelCache.delete(absoluteUrl);reject(error)}
        finally { gltf.scene.traverse(node=>{node.geometry?.dispose?.();const materials=Array.isArray(node.material)?node.material:[node.material];materials.forEach(m=>{m?.map?.dispose?.();m?.dispose?.()})}) }
      }, undefined, error => { customModelCache.delete(absoluteUrl); reject(error) })
    }))
  }
  return customModelCache.get(absoluteUrl)
}

async function replaceWithCustomModel(anchor, fallback, part, placement, shelf, dimensions, lowStock, drawToken, isCurrent = () => drawToken === partModelDrawToken) {
  const modelUrl = modelUrlFor(part)
  if (!modelUrl) return
  try {
    const geometry = await loadCustomModel(modelUrl)
    if (!isCurrent() || !anchor.parent) return
    if(!stockMaterialCache.has(lowStock)) { const colors=stockModelColors(lowStock); stockMaterialCache.set(lowStock,new THREE.MeshStandardMaterial({color:colors.color,emissive:colors.emissive,emissiveIntensity:.34,roughness:.58,metalness:.08})) }
    const model = new THREE.Mesh(geometry,stockMaterialCache.get(lowStock))
    model.userData.sharedStockModel=true
    model.userData.stockParts=fallback.userData.stockParts
    // Present each model's saved front toward the default overview camera.
    model.rotation.y = overviewModelRotation(modelFrontRotationFor(part), shelf.position.rotationY || 0)
    model.updateMatrixWorld(true)
    const initialBox = new THREE.Box3().setFromObject(model)
    const initialSize = initialBox.getSize(new THREE.Vector3())
    const scale = modelFitScale(initialSize, dimensions, modelScaleFor(part))
    if (!scale) throw new Error('模型尺寸无效')
    model.scale.multiplyScalar(scale)
    model.updateMatrixWorld(true)
    const fittedBox = new THREE.Box3().setFromObject(model)
    const center = fittedBox.getCenter(new THREE.Vector3())
    model.position.set(
      fallback.position.x - center.x,
      placement.shelfSurfaceY - fittedBox.min.y,
      fallback.position.z - center.z
    )
    anchor.remove(fallback)
    fallback.geometry?.dispose()
    fallback.material?.dispose()
    anchor.add(model)
  } catch (error) {
    if (!isCurrent() || !anchor.parent) return
    console.warn(`3D模型加载失败，保留库存占位标记：${modelUrl}`, error)
    // 自包含 GLB 加载失败时保留中性库存占位标记，避免货位空白。
  }
}

function drawPartModels() {
  if (!partModelsRoot) return
  const drawToken = ++partModelDrawToken
  disposeChildren(partModelsRoot)
  if (partModelMode.value === 'hidden') return
  const groupedParts = new Map()
  for (const part of allLocatedParts.value) {
    const location = resolvePartLocation(part)
    const shelf = shelves.value.find(item => Number(item.shelfNo) === Number(location.shelf))
    if (!shelf || !shelfMatchesFilter(shelf, activeGroup.value)) continue
    // “展示全部/低库存”是全库模式，不应因用户刚刚点击过某个货架或层数而缩小范围。
    const groupKey = `${shelf.id}:${location.position}:${location.layer}:${location.location}`
    const group = groupedParts.get(groupKey)
    if (group) {
      group.parts.push(part)
      if (!modelUrlFor(group.representative) && modelUrlFor(part)) group.representative = part
      if (String(part._id) === String(selectedPart.value?._id)) group.representative = part
    } else groupedParts.set(groupKey, { shelf, location, representative: part, parts: [part] })
  }
  const pendingModels=[]
  for (const group of groupedParts.values()) {
    const { shelf, location } = group
    const part = group.parts.find(item => String(item._id) === String(selectedPart.value?._id)) || group.representative
    const placement = getPartMarkerPlacement(shelf, part)
    const { width, height, depth } = slotModelBounds({
      usableWidth: placement.usableWidth, slots: placement.slots,
      depth: shelf.size.depth, layerHeight: placement.layerHeight, sideZ: placement.z
    })
    const low = group.parts.some(item => item.safetyStock != null && Number(item.totalStock) <= Number(item.safetyStock))
    const status = stockModelColors(low)
    const material = new THREE.MeshStandardMaterial({
      color: status.color,
      emissive: status.emissive,
      emissiveIntensity: 0.34,
      roughness: 0.58,
      metalness: 0.08
    })
    const model = new THREE.Mesh(partGeometry(part, width, height, depth), material)
    model.position.set(
      Math.min(Math.max(placement.x, -shelf.size.width / 2 + width / 2 + 0.08), shelf.size.width / 2 - width / 2 - 0.08),
      placement.shelfSurfaceY + height / 2,
      Math.min(Math.max(placement.z, -shelf.size.depth / 2 + depth / 2 + 0.08), shelf.size.depth / 2 - depth / 2 - 0.08)
    )
    if (model.geometry.type === 'CylinderGeometry') model.rotation.z = Math.PI / 2
    // Apply the same envelope to fallback geometry (including rotated cylinders).
    const fallbackBox = new THREE.Box3().setFromObject(model)
    const fallbackScale = modelFitScale(fallbackBox.getSize(new THREE.Vector3()), { width, height, depth })
    model.scale.multiplyScalar(fallbackScale || 1)
    model.updateMatrixWorld(true)
    const restingBox = new THREE.Box3().setFromObject(model)
    model.position.y += placement.shelfSurfaceY - restingBox.min.y
    const anchor = new THREE.Group()
    anchor.position.set(shelf.position.x, 0, shelf.position.z)
    anchor.rotation.y = Number(shelf.position.rotationY || 0)
    model.userData.stockParts=group.parts
    anchor.userData.stockParts=group.parts
    anchor.add(model)
    partModelsRoot.add(anchor)
    pendingModels.push(replaceWithCustomModel(anchor, model, part, placement, shelf, { width, height, depth }, low, drawToken))
  }
  Promise.allSettled(pendingModels).then(()=>{if(drawToken===partModelDrawToken && partModelMode.value!=='hidden')instanceStockModels(partModelsRoot)})
}

async function locatePart(part, requestToken = ++partLocationRequestToken) {
  stockDetailToken++
  stockDetailVisible.value = false
  stockDetailLoading.value = false
  const isCurrent = () => requestToken === partLocationRequestToken
  selectedPart.value = part
  allLocatedParts.value = allLocatedParts.value.map(item => String(item._id) === String(part._id) ? part : item)
  selectedPartId.value = part._id
  if (!partOptions.value.some(item => item._id === part._id)) partOptions.value = [part, ...partOptions.value]
  const location = resolvePartLocation(part)
  if (part.workshopCode && part.workshopCode !== workshopCode.value) {
    workshopCode.value = part.workshopCode
    await loadLayout()
    if (!isCurrent()) return
  }
  const shelf = shelves.value.find(item => Number(item.shelfNo) === Number(location.shelf))
  if (!shelf) {
    ElMessage.warning('该备件尚未关联到当前 3D 货架布局')
    return
  }
  activeGroup.value = ''
  panelMode.value = 'parts'
  await selectShelf(shelf, false, false, false)
  if (!isCurrent()) return
  const targetLayer = Number(location.layer)
  if (!selectedLayers.value.includes(targetLayer)) selectedLayers.value = [targetLayer]
  drawShelves()
  drawPartModels()
  drawPartMarker(shelf, part)
  focusPart(shelf, part)
  stockDetailCandidates.value=allLocatedParts.value.filter(item=>String(item.locationCode||item.location)===String(part.locationCode||part.location) && Number(resolvePartLocation(item).shelf)===Number(location.shelf) && Number(resolvePartLocation(item).position)===Number(location.position) && Number(resolvePartLocation(item).layer)===Number(location.layer))
  stockDetailVisible.value=true;sidePanelCollapsed.value=false
  await loadStockDetail(part)
  if (!isCurrent()) return
  await nextTick();resizeScene()
}

async function locatePartById(id) {
  const value = String(id || '').trim()
  if (!value) return
  const requestToken = ++partLocationRequestToken
  const result = await getPart(value)
  if (requestToken !== partLocationRequestToken || !result.data) return
  partOptions.value = [result.data, ...partOptions.value.filter(item => item._id !== result.data._id)]
  await locatePart(result.data, requestToken)
}

async function selectShelf(shelf, focus = true, clearLocatedPart = true, resetLayers = true) {
  if (clearLocatedPart) partLocationRequestToken++
  const requestToken = ++shelfPartsRequestToken
  selectedShelf.value = shelf
  panelMode.value = 'parts'
  if (sidePanelCollapsed.value) {
    sidePanelCollapsed.value = false
    await nextTick()
    resizeScene()
  }
  if (resetLayers) selectAllLayers()
  if (clearLocatedPart && !partBelongsToShelf(selectedPart.value || {}, shelf.shelfNo)) {
    clearPart()
  }
  drawShelves()
  if (selectedPart.value && partBelongsToShelf(selectedPart.value, shelf.shelfNo)) drawPartMarker(shelf, selectedPart.value)
  if (focus) focusShelf(shelf)
  shelfParts.value = []
  shelfPartsError.value = ''
  if (shelf.shelfNo == null) { shelfPartsLoading.value = false; return }
  shelfPartsLoading.value = true
  try {
    const rows = await collectParts(getParts, { shelf: shelf.shelfNo, workshopCode: workshopCode.value, sort:'codeAsc' }, () => requestToken === shelfPartsRequestToken && selectedShelf.value?.id === shelf.id)
    if(rows)shelfParts.value=rows
  } catch(error) {
    if(requestToken===shelfPartsRequestToken)shelfPartsError.value=error?.message||'货架备件加载失败，请重试'
  } finally {
    if (requestToken === shelfPartsRequestToken) shelfPartsLoading.value = false
  }
}

function locationLink() {
  if (!selectedPart.value) return ''
  const url = new URL('/warehouse-3d', window.location.origin)
  url.searchParams.set('partId', selectedPart.value._id)
  return url.toString()
}

async function openQr() {
  if (!selectedPart.value) return
  qrDataUrl.value = await QRCode.toDataURL(locationLink(), { width: 300, margin: 2, color: { dark: '#172033', light: '#ffffff' } })
  qrVisible.value = true
}

async function copyLocationLink() {
  try { await navigator.clipboard.writeText(locationLink()); ElMessage.success('定位链接已复制') }
  catch { ElMessage.warning('浏览器未允许复制，请手动复制地址栏链接') }
}

function downloadQr() {
  if (!qrDataUrl.value) return
  const anchor = document.createElement('a')
  anchor.href = qrDataUrl.value
  anchor.download = `${selectedPart.value?.materialCode || '备件'}-定位二维码.png`
  anchor.click()
}

function setGroup(group) {
  activeGroup.value = group
  panelMode.value = 'shelves'
  drawShelves()
  if (selectedShelf.value && !shelfMatchesFilter(selectedShelf.value, group)) selectedShelf.value = null
}

function toggleSidePanel() {
  stockDetailVisible.value=false
  sidePanelCollapsed.value = !sidePanelCollapsed.value
  nextTick(() => {
    window.setTimeout(resizeScene, 30)
    window.setTimeout(resizeScene, 280)
  })
}


function stagingStyle(sp) {
  const x = Number(sp.position?.x) || 0
  const z = Number(sp.position?.z) || 0
  return {
    left: `${((-x + roomWidth.value / 2) / roomWidth.value) * 100}%`,
    top: `${((roomDepth.value / 2 - z) / roomDepth.value) * 100}%`
  }
}

function initScene() {
  if (!stage.value) return
  try {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4f5f7)
    scene.fog = new THREE.Fog(0xf4f5f7, 55, 130)
    camera = new THREE.PerspectiveCamera(43, 1, 0.1, 200)
    camera.up.set(0, 1, 0)
    camera.position.copy(overviewCameraPosition('perspective'))

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    const mobileGraphics = window.matchMedia('(max-width: 680px), (pointer: coarse)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileGraphics ? 1.5 : 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    stage.value.appendChild(renderer.domElement)

    labelRenderer = new CSS2DRenderer()
    labelRenderer.domElement.className = 'label-layer'
    stage.value.appendChild(labelRenderer.domElement)

    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enableRotate = true
    controls.enablePan = true
    controls.touches.ONE = THREE.TOUCH.ROTATE
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
    controls.rotateSpeed = 0.72
    controls.zoomSpeed = 0.9
    controls.screenSpacePanning = true
    controls.minDistance = 2.1
    controls.maxDistance = Math.max(72, overviewCameraPosition('perspective').distanceTo(overviewTarget()) * 1.4)
    controls.maxPolarAngle = Math.PI / 2.03
    controls.target.copy(overviewTarget())

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 3.1)
    sun.position.set(-8, 18, -12)
    sun.castShadow = true
    const shadowResolution = mobileGraphics ? 1024 : 2048
    sun.shadow.mapSize.set(shadowResolution, shadowResolution)
    sun.shadow.camera.left = -16
    sun.shadow.camera.right = 16
    sun.shadow.camera.top = 24
    sun.shadow.camera.bottom = -24
    scene.add(sun)

    roomRoot = new THREE.Group()
    shelfRoot = new THREE.Group()
    markerRoot = new THREE.Group()
    partModelsRoot = new THREE.Group()
    scene.add(roomRoot, shelfRoot, partModelsRoot, markerRoot)
    drawRoom()
    raycaster = new THREE.Raycaster()
    pointer = new THREE.Vector2()
    renderer.domElement.addEventListener('pointerdown', onStagePointerDown)
    renderer.domElement.addEventListener('pointerup', onStageClick)
    renderer.domElement.addEventListener('pointercancel', onStagePointerCancel)
    renderer.domElement.addEventListener('contextmenu', preventStageContextMenu)
    renderer.domElement.addEventListener('auxclick', preventStageAuxClick)
    renderer.domElement.addEventListener('wheel', onStageWheel, { capture: true, passive: false })
    renderer.domElement.addEventListener('dblclick', resetPerspectiveView)
    resizeObserver = new ResizeObserver(resizeScene)
    resizeObserver.observe(stage.value)
    resizeScene()
    animate()
  } catch (error) {
    webglError.value = true
    console.error('3D scene initialization failed', error)
  }
}

function drawRoom() {
  if (!roomRoot) return
  disposeChildren(roomRoot)
  const width = roomWidth.value
  const depth = roomDepth.value
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ color: 0xe8e9eb, roughness: 0.95 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  roomRoot.add(floor)
  const divisions = Math.max(Math.round(Math.max(width, depth)), 8)
  const grid = new THREE.GridHelper(Math.max(width, depth), divisions, 0xcbd0d8, 0xdde1e6)
  grid.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth))
  grid.position.y = 0.008
  roomRoot.add(grid)
  const rawGrainDirection = workshopCode.value === 'raw_grain'
  // Keep the direction cue on clear floor behind the first row of racks.
  const directionOrigin = new THREE.Vector3(-width / 2 + 1.25, 0.08, -depth / 2 + (rawGrainDirection ? 0.3 : 1.4))
  const direction = eastVector()
  const directionArrow = new THREE.ArrowHelper(direction, directionOrigin, 2.2, 0xc91f2c, 0.5, 0.28)
  directionArrow.line.material.depthTest = false
  directionArrow.cone.material.depthTest = false
  directionArrow.renderOrder = 6
  roomRoot.add(directionArrow)
  const eastLabel = document.createElement('div')
  eastLabel.className = 'east-label-3d'
  eastLabel.textContent = '东'
  const eastLabelObject = new CSS2DObject(eastLabel)
  eastLabelObject.position.copy(directionOrigin).add(direction.clone().multiplyScalar(rawGrainDirection ? 1.3 : 2.55)).add(new THREE.Vector3(0, 0.18, 0))
  roomRoot.add(eastLabelObject)
  addRoomWalls(roomRoot)
}

function addRoomWalls(root) {
  const room = currentRoom.value
  const width = roomWidth.value
  const depth = roomDepth.value
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const wallHeight = Number(room.height) || 4.2
  const entranceWall = room.entranceWall || 'west'
  const wallSpan = ['west', 'east'].includes(entranceWall) ? depth : width
  const entranceWidth = Math.min(Math.max(Number(room.entranceWidth) || 2.6, 0.8), wallSpan - 0.3)
  const maxOffset = Math.max(wallSpan / 2 - entranceWidth / 2, 0)
  const entranceCenter = Math.max(-maxOffset, Math.min(maxOffset, Number(room.entranceOffset) || 0))
  const openingStart = entranceCenter - entranceWidth / 2
  const openingEnd = entranceCenter + entranceWidth / 2
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf9fafb, transparent: true, opacity: 0.88, roughness: 1 })
  const addWall = (wall, start, end) => {
    if (end - start < 0.05) return
    const vertical = ['west', 'east'].includes(wall)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(vertical ? 0.12 : end - start, wallHeight, vertical ? end - start : 0.12),
      wallMaterial.clone()
    )
    mesh.position.set(
      vertical ? (wall === 'west' ? -halfWidth : halfWidth) : (start + end) / 2,
      wallHeight / 2,
      vertical ? (start + end) / 2 : (wall === 'north' ? halfDepth : -halfDepth)
    )
    mesh.receiveShadow = true
    root.add(mesh)
  }
  // 仅保留带入口的墙面，其他三面开放，避免遮挡货架与备件模型。
  addWall(entranceWall, -wallSpan / 2, openingStart)
  addWall(entranceWall, openingEnd, wallSpan / 2)

  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(['west', 'east'].includes(entranceWall) ? 0.28 : entranceWidth, 0.025, ['west', 'east'].includes(entranceWall) ? entranceWidth : 0.28),
    new THREE.MeshBasicMaterial({ color: 0x16a36f })
  )
  threshold.position.set(
    entranceWall === 'west' ? -halfWidth : entranceWall === 'east' ? halfWidth : entranceCenter,
    0.055,
    entranceWall === 'north' ? halfDepth : entranceWall === 'south' ? -halfDepth : entranceCenter
  )
  root.add(threshold)

  const label = document.createElement('div')
  label.className = 'entrance-label-3d'
  label.textContent = '入口'
  const entranceLabel = new CSS2DObject(label)
  entranceLabel.position.copy(threshold.position).add(new THREE.Vector3(0, 0.42, 0))
  root.add(entranceLabel)
}

function drawShelves() {
  if (!shelfRoot) return
  disposeChildren(shelfRoot)
  clickableMeshes.length = 0
  for (const shelf of shelves.value) {
    const hiddenByFilter = !shelfMatchesFilter(shelf, activeGroup.value)
    const selected = selectedShelf.value?.id === shelf.id
    const located = selectedPart.value && partBelongsToShelf(selectedPart.value, shelf.shelfNo)
    const group = createShelf(shelf, selected || located, hiddenByFilter)
    shelfRoot.add(group)
  }
  drawStagingPoints()
}

function drawStagingPoints() {
  if (!shelfRoot) return
  const oldMarkers = shelfRoot.children.filter(c => c.userData.stagingPoint)
  oldMarkers.forEach(c => { shelfRoot.remove(c); c.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose?.() }) })
  for (const sp of stagingPoints.value) {
    const group = new THREE.Group()
    group.position.set(sp.position.x, 0, sp.position.z)
    group.userData.stagingPoint = sp
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.9, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.3, roughness: 0.5, emissive: 0x78350f, emissiveIntensity: 0.15 })
    )
    cone.position.y = 0.45
    cone.castShadow = true
    group.add(cone)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    group.add(ring)
    const labelDiv = document.createElement('div')
    labelDiv.className = 'staging-label'
    labelDiv.textContent = sp.name
    labelDiv.style.cssText = 'padding:3px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;border:1px solid #fcd34d'
    const label = new CSS2DObject(labelDiv)
    label.position.set(0, 1.2, 0)
    group.add(label)
    shelfRoot.add(group)
  }
}

function createShelf(shelf, highlighted, hiddenByFilter) {
  const group = new THREE.Group()
  group.position.set(shelf.position.x, 0, shelf.position.z)
  group.rotation.y = Number(shelf.position.rotationY || 0)
  group.userData.shelf = shelf
  group.visible = !hiddenByFilter
  const width = shelf.size.width
  const depth = shelf.size.depth
  const height = shelf.size.height
  // 未选货架保持蓝色；选中或定位的货架用黄色，与备件红/绿库存状态区分。
  const frameColor = new THREE.Color(highlighted ? 0xf5b51b : 0x1875b8)
  const boardColor = new THREE.Color(highlighted ? 0xffd65a : 0x439ed1)
  const frameMaterial = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.34, roughness: 0.42 })
  const boardMaterial = new THREE.MeshStandardMaterial({ color: boardColor, metalness: 0.26, roughness: 0.58 })
  const postSize = 0.1
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), frameMaterial.clone())
      post.position.set(x, height / 2, z)
      post.castShadow = true
      post.userData.shelf = shelf
      group.add(post)
      clickableMeshes.push(post)
    }
  }
  const levels = COMMON_SHELF_LEVELS
  for (let layer = 1; layer <= levels; layer += 1) {
    const y = layerLocalY(height, levels, layer) - 0.04
    const board = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.08), boardMaterial.clone())
    board.position.y = y
    board.receiveShadow = true
    board.castShadow = layer === levels
    board.userData.shelf = shelf
    group.add(board)
    clickableMeshes.push(board)
  }
  for (const x of [-width / 2, width / 2]) {
    const brace = createBrace(
      new THREE.Vector3(x, 0.24, -depth / 2),
      new THREE.Vector3(x, height - 0.24, depth / 2),
      frameMaterial.clone(),
      shelf
    )
    group.add(brace)
    clickableMeshes.push(brace)
  }

  const nameplates = createShelfNameplate(shelf, highlighted, width, depth)
  nameplates.position.set(0, height - 0.23, 0)
  for (const plate of nameplates.children) {
    plate.userData.shelf = shelf
    clickableMeshes.push(plate)
  }
  group.add(nameplates)
  return group
}

function createBrace(start, end, material, shelf) {
  const direction = new THREE.Vector3().subVectors(end, start)
  const length = direction.length()
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.07, length, 0.07), material)
  brace.position.copy(start).add(end).multiplyScalar(0.5)
  brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  brace.castShadow = true
  brace.userData.shelf = shelf
  return brace
}

function createShelfNameplate(shelf, highlighted, shelfWidth, shelfDepth) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const context = canvas.getContext('2d')
  const background = shelf.isVendor ? VENDOR_SIGN_COLOR : areaColor(shelf.workshopGroup)
  const foreground = '#ffffff'
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = background
  drawRoundedRect(context, 10, 10, 1004, 246, 42)
  context.fill()
  context.strokeStyle = highlighted ? '#ffd34f' : 'rgba(255,255,255,.72)'
  context.lineWidth = highlighted ? 14 : 8
  drawRoundedRect(context, 18, 18, 996, 238, 36)
  context.stroke()

  const numberText = shelf.shelfNo == null ? '—' : padShelf(shelf.shelfNo)
  const title = shelf.customName && shelf.customName !== '未命名'
    ? `${numberText} · ${shelf.customName}`
    : shelf.displayName
  context.fillStyle = foreground
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  setFittedFont(context, title, 870, 82, 48)
  context.fillText(title, 512, 108)
  context.globalAlpha = 0.78
  context.font = '600 40px "Microsoft YaHei", "PingFang SC", sans-serif'
  const subtitle = shelf.isVendor ? `${shelf.workshopGroup}（含厂家备件） · ${shelf.partsCount} 条` : `${shelf.workshopGroup} · ${shelf.partsCount} 条`
  context.fillText(subtitle, 512, 184)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() || 1, 8)
  const plateWidth = Math.min(Math.max(shelfWidth * 0.68, 2.15), 3.15)
  const geometry = new THREE.PlaneGeometry(plateWidth, 0.64)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide, depthTest: true, depthWrite: true })
  const front = new THREE.Mesh(geometry, material)
  front.position.z = shelfDepth / 2 + 0.075
  const back = new THREE.Mesh(geometry.clone(), material.clone())
  back.position.z = -shelfDepth / 2 - 0.075
  back.rotation.y = Math.PI
  const group = new THREE.Group()
  group.add(front, back)
  return group
}

function drawRoundedRect(context, left, top, right, bottom, radius) {
  context.beginPath()
  context.moveTo(left + radius, top)
  context.lineTo(right - radius, top)
  context.quadraticCurveTo(right, top, right, top + radius)
  context.lineTo(right, bottom - radius)
  context.quadraticCurveTo(right, bottom, right - radius, bottom)
  context.lineTo(left + radius, bottom)
  context.quadraticCurveTo(left, bottom, left, bottom - radius)
  context.lineTo(left, top + radius)
  context.quadraticCurveTo(left, top, left + radius, top)
  context.closePath()
}

function setFittedFont(context, text, maxWidth, initialSize, minimumSize) {
  let size = initialSize
  do {
    context.font = `700 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
    if (context.measureText(text).width <= maxWidth) break
    size -= 2
  } while (size > minimumSize)
}

function getPartMarkerPlacement(shelf, part) {
  const location = resolvePartLocation(part)
  const levels = COMMON_SHELF_LEVELS
  const layer = Math.min(Math.max(Number(location.layer || 1), 1), levels)
  // 每一侧、每一层的货位号都是独立序列。不能使用整座货架的最大货位号，
  // 否则货位较少的层只会挤在半截货架上。接口容量和当前已加载备件互为兜底。
  const slots = slotCapacityForLocation(shelf, part, [...allLocatedParts.value, ...shelfParts.value])
  const slot = Math.min(Math.max(Number(location.location || 1), 1), slots)
  const usableWidth = Math.max(shelf.size.width - 0.82, 0.32)
  const x = sideAwareSlotLocalX(usableWidth, slots, slot, location.position)
  const layerHeight = (shelf.size.height - 0.25) / levels
  const markerHeight = Math.min(Math.max(layerHeight * 0.28, 0.12), 0.3)
  const shelfSurfaceY = layerLocalY(shelf.size.height, levels, layer)
  const y = shelfSurfaceY + markerHeight / 2
  const z = sideLocalZ(shelf.size.depth, location.position)
  const sideDirection = String(location.position) === '2' ? -1 : 1
  return { location, levels, layer, slots, slot, x, y, z, sideDirection, layerHeight, markerHeight, shelfSurfaceY, usableWidth }
}

function shelfLocalToWorld(shelf, localPosition) {
  return localPosition
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), Number(shelf.position.rotationY || 0))
    .add(new THREE.Vector3(shelf.position.x, 0, shelf.position.z))
}

function drawPartMarker(shelf, part) {
  if (!markerRoot) return
  disposeChildren(markerRoot)
  const placement = getPartMarkerPlacement(shelf, part)
  const markerAnchor = new THREE.Group()
  markerAnchor.position.set(shelf.position.x, 0, shelf.position.z)
  markerAnchor.rotation.y = Number(shelf.position.rotationY || 0)

  const layerHeight = placement.layerHeight
  // Selection adds a locator only; it never bypasses the model visibility filter.
  const pointerMaterial = new THREE.MeshBasicMaterial({ color: 0xffb11b, depthTest: false, depthWrite: false })
  const pointerHead = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 4), pointerMaterial)
  pointerHead.rotation.z = Math.PI
  const markerTop = placement.y + placement.markerHeight / 2
  pointerHead.position.set(placement.x, markerTop + 0.16, placement.z)
  pointerHead.renderOrder = 8
  markerAnchor.add(pointerHead)
  const pointerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10), pointerMaterial.clone())
  pointerStem.position.set(placement.x, markerTop + 0.52, placement.z)
  pointerStem.renderOrder = 8
  markerAnchor.add(pointerStem)

  const label = document.createElement('div')
  label.className = 'part-location-card'
  const labelKicker = document.createElement('span')
  labelKicker.textContent = '备件准确位置'
  const labelTitle = document.createElement('strong')
  labelTitle.textContent = shelf.displayName || shelfLabel(placement.location.shelf)
  const labelPosition = document.createElement('small')
  labelPosition.textContent = `${sideText(placement.location.position)} · ${placement.layer}层 · ${padSlot(placement.location.location)}货位`
  label.append(labelKicker, labelTitle, labelPosition)
  const labelObject = new CSS2DObject(label)
  labelObject.position.set(placement.x, markerTop + Math.max(layerHeight * 0.82, 0.66), placement.z)
  markerAnchor.add(labelObject)
  markerRoot.add(markerAnchor)

}

function onStagePointerDown(event) {
  if (!stagePointers.size) multiPointerGesture = false
  stagePointers.add(event.pointerId)
  if (stagePointers.size > 1) multiPointerGesture = true
  if (!multiPointerGesture) pointerStart = { x: event.clientX, y: event.clientY, button: event.button, pointerId: event.pointerId }
  if (event.button === 2) {
    event.preventDefault()
    renderer?.domElement?.setPointerCapture?.(event.pointerId)
  }
}

function onStageClick(event) {
  stagePointers.delete(event.pointerId)
  if (multiPointerGesture) {
    if (!stagePointers.size) { multiPointerGesture = false; pointerStart = null }
    return
  }
  if (!renderer || !camera || !stage.value) return
  if (!pointerStart || pointerStart.pointerId !== event.pointerId) return
  const moved = pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6
  const button = pointerStart?.button ?? event.button
  pointerStart = null
  if (button !== 0) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (moved) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects([...clickableMeshes, partModelsRoot].filter(Boolean), true)[0]
  const parts=stockPartsForHit(hit)
  if(parts.length) { locatePart(parts.find(part=>String(part._id)===String(selectedPart.value?._id)) || parts[0]); return }
  if (hit?.object?.userData?.shelf) { stockDetailVisible.value=false;selectShelf(hit.object.userData.shelf, true) }
}

function onStagePointerCancel(event) {
  stagePointers.delete(event.pointerId)
  if (!stagePointers.size) multiPointerGesture = false
  pointerStart = null
}

function preventStageContextMenu(event) {
  event.preventDefault()
  event.stopPropagation()
}

function preventStageAuxClick(event) {
  event.preventDefault()
  event.stopPropagation()
}

function onStageWheel(event) {
  if (!controls || event.ctrlKey) return
  // 普通滚轮继续滚动页面；只有 Ctrl+滚轮才缩放3D，避免大画布把页面锁住。
  controls.enableZoom = false
  queueMicrotask(() => { if (controls) controls.enableZoom = true })
}

function resetPerspectiveView() {
  setView('perspective', true)
}

function focusShelf(shelf) {
  if (!camera || !controls) return
  const target = new THREE.Vector3(shelf.position.x, 1.35, shelf.position.z)
  const isTop = viewMode.value === 'top'
  camera.up.set(0, isTop ? 0 : 1, isTop ? 1 : 0)
  const destination = isTop
    ? new THREE.Vector3(target.x, 30, target.z + 0.01)
    : target.clone().add(new THREE.Vector3(-14, 9.85, -16.5))
  cameraAnimation = { start: performance.now(), duration: 720, fromPosition: camera.position.clone(), toPosition: destination, fromTarget: controls.target.clone(), toTarget: target }
}

function focusPart(shelf, part) {
  if (!camera || !controls) return
  const placement = getPartMarkerPlacement(shelf, part)
  const target = shelfLocalToWorld(shelf, new THREE.Vector3(placement.x, placement.y, placement.z))
  const isTop = viewMode.value === 'top'
  camera.up.set(0, isTop ? 0 : 1, isTop ? 1 : 0)
  const shelfRotation = Number(shelf.position.rotationY || 0)
  const outward = new THREE.Vector3(0, 0, placement.sideDirection).applyAxisAngle(new THREE.Vector3(0, 1, 0), shelfRotation)
  const tangent = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), shelfRotation)
  // 镜头放在当前排货架的通道内，并从货位朝货架中心斜看。固定向左偏会让
  // 01等边缘货位正好被立柱挡住；距离过大又会穿过下一排货架。
  const aisleDistance = shelf.size.depth * 0.5 + 2.15
  const centerwardOffset = Math.min(Math.max(-placement.x * 0.58, -1.35), 1.35)
  const destination = isTop
    ? new THREE.Vector3(target.x, 30, target.z + 0.01)
    : target.clone().addScaledVector(outward, aisleDistance).addScaledVector(tangent, centerwardOffset).add(new THREE.Vector3(0, 2.15, 0))
  cameraAnimation = { start: performance.now(), duration: 760, fromPosition: camera.position.clone(), toPosition: destination, fromTarget: controls.target.clone(), toTarget: target }
}

function setView(mode, resetTarget = false) {
  viewMode.value = mode
  if (!camera || !controls) return
  const target = !resetTarget && selectedShelf.value
    ? new THREE.Vector3(selectedShelf.value.position.x, 1.2, selectedShelf.value.position.z)
    : overviewTarget()
  camera.up.set(0, mode === 'top' ? 0 : 1, mode === 'top' ? 1 : 0)
  const destination = resetTarget || !selectedShelf.value
    ? overviewCameraPosition(mode, target)
    : mode === 'top'
      ? new THREE.Vector3(target.x, 30, target.z + 0.01)
      : target.clone().add(new THREE.Vector3(-14, 9.85, -16.5))
  cameraAnimation = { start: performance.now(), duration: 800, fromPosition: camera.position.clone(), toPosition: destination, fromTarget: controls.target.clone(), toTarget: target }
}

function animate(time = performance.now()) {
  animationFrame = requestAnimationFrame(animate)
  if (cameraAnimation) {
    const progress = Math.min((time - cameraAnimation.start) / cameraAnimation.duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    camera.position.lerpVectors(cameraAnimation.fromPosition, cameraAnimation.toPosition, eased)
    controls.target.lerpVectors(cameraAnimation.fromTarget, cameraAnimation.toTarget, eased)
    if (progress >= 1) cameraAnimation = null
  }
  controls?.update()
  renderer?.render(scene, camera)
  labelRenderer?.render(scene, camera)
}

function resizeScene() {
  if (!stage.value || !camera || !renderer || !labelRenderer) return
  const width = Math.max(stage.value.clientWidth, 1)
  const height = Math.max(stage.value.clientHeight, 1)
  const aspect = width / height
  if (previousStageAspect && controls) {
    const ratio = stageFramingScale(aspect) / stageFramingScale(previousStageAspect)
    camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target)
    if (cameraAnimation) {
      cameraAnimation.fromPosition.sub(cameraAnimation.fromTarget).multiplyScalar(ratio).add(cameraAnimation.fromTarget)
      cameraAnimation.toPosition.sub(cameraAnimation.toTarget).multiplyScalar(ratio).add(cameraAnimation.toTarget)
    }
    controls.maxDistance = Math.max(72, overviewCameraPosition('perspective').distanceTo(overviewTarget()) * 1.4)
  }
  previousStageAspect = aspect
  camera.aspect = aspect
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, true)
  labelRenderer.setSize(width, height)
}

function disposeChildren(parent) {
  while (parent.children.length) {
    const child = parent.children[parent.children.length - 1]
    parent.remove(child)
    child.traverse?.(node => {
      if(node.userData?.sharedStockModel){node.dispose?.();return}
      node.geometry?.dispose?.()
      if (Array.isArray(node.material)) node.material.forEach(material => { material.map?.dispose?.(); material.dispose?.() })
      else { node.material?.map?.dispose?.(); node.material?.dispose?.() }
      if (node.element?.remove) node.element.remove()
    })
  }
}

async function toggleFullscreen() {
  const target = fullscreenArea.value
  if (!target) return
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else document.webkitExitFullscreen?.()
    } else if (target.requestFullscreen) {
      await target.requestFullscreen()
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen()
    } else {
      ElMessage.warning('当前浏览器不支持全屏模式，请使用新版 Chrome 或 Edge')
    }
  } catch {
    ElMessage.warning('浏览器未允许进入全屏，请再次点击全屏按钮')
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement || document.webkitFullscreenElement)
  nextTick(() => {
    window.setTimeout(resizeScene, 80)
    window.setTimeout(resizeScene, 320)
  })
}

function openShelfEditor(shelf) {
  editingShelf.value = shelf
  editForm.displayName = shelf.customName || ''
  editForm.shelfNo = shelf.shelfNo == null ? '' : String(shelf.shelfNo)
  editorVisible.value = true
}


function sanitizeShelfNo(value) { editForm.shelfNo = String(value || '').replace(/\D/g, '').slice(0, 2) }

async function submitShelfEdit() {
  if (!editingShelf.value) return
  const nextShelfNo = editForm.shelfNo === '' ? null : Number(editForm.shelfNo)
  if (nextShelfNo !== null && (!Number.isInteger(nextShelfNo) || nextShelfNo < 1 || nextShelfNo > 99)) {
    ElMessage.warning('货架号必须是 1 至 99 的整数')
    return
  }

  const currentShelfNo = editingShelf.value.shelfNo == null ? null : Number(editingShelf.value.shelfNo)
  const changedNumber = nextShelfNo !== currentShelfNo
  let confirmRenumber = false
  if (changedNumber && currentShelfNo !== null && Number(editingShelf.value.partsCount) > 0) {
    try {
      await ElMessageBox.confirm(
        `该货架关联 ${editingShelf.value.partsCount} 条备件。保存后会把这些备件的货架号由 ${padShelf(currentShelfNo)} 同步改为 ${nextShelfNo == null ? '未编号' : padShelf(nextShelfNo)}，是否继续？`,
        '确认修改货架号',
        { type: 'warning', confirmButtonText: '确认并同步更新', cancelButtonText: '取消' }
      )
      confirmRenumber = true
    } catch { return }
  }
  editorSubmitting.value = true
  try {
    await updateWarehouseShelf(editingShelf.value.id, { displayName: editForm.displayName, shelfNo: nextShelfNo, confirmRenumber })
    ElMessage.success('货架标牌已更新，实体布局未改变')
    editorVisible.value = false
    await loadLayout()
    const updated = shelves.value.find(item => item.id === editingShelf.value.id)
    if (updated) await selectShelf(updated, true)
  } finally { editorSubmitting.value = false }
}

watch(activeGroup, () => { drawShelves(); drawPartModels() })
watch(selectedLayers, layers => {
  if (!markerRoot) return
  disposeChildren(markerRoot)
  if (!selectedPart.value || !selectedShelf.value) return
  const layer = Number(resolvePartLocation(selectedPart.value).layer)
  if (layers.includes(layer) && partBelongsToShelf(selectedPart.value, selectedShelf.value.shelfNo)) {
    drawPartMarker(selectedShelf.value, selectedPart.value)
  }
}, { deep: true })
watch(displayMode, async mode => {
  await nextTick()
  if (mode === '3d') {
    window.setTimeout(resizeScene, 40)
    if (selectedShelf.value) focusShelf(selectedShelf.value)
  }
})
watch(() => route.query.partId, value => {
  if (value && shelves.value.length) locatePartById(value)
})
onMounted(async () => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  const requestToken = layoutRequestToken + 1
  await loadLayout()
  if (requestToken !== layoutRequestToken) return
  if (route.query.partId) await locatePartById(route.query.partId)
})
onBeforeUnmount(() => {
  partLocationRequestToken++
  layoutRequestToken++
  stockDetailToken++
  partSearchRequestToken++
  shelfPartsRequestToken++
  partModelDrawToken++
  partModelsRequestToken++
  for(const value of customModelCache.values())value.then(g=>g.dispose()).catch(()=>{})
  customModelCache.clear()
  for(const material of stockMaterialCache.values())material.dispose()
  stockMaterialCache.clear()
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  renderer?.domElement?.removeEventListener('pointerdown', onStagePointerDown)
  renderer?.domElement?.removeEventListener('pointerup', onStageClick)
  renderer?.domElement?.removeEventListener('pointercancel', onStagePointerCancel)
  renderer?.domElement?.removeEventListener('contextmenu', preventStageContextMenu)
  renderer?.domElement?.removeEventListener('auxclick', preventStageAuxClick)
  renderer?.domElement?.removeEventListener('wheel', onStageWheel, { capture: true })
  renderer?.domElement?.removeEventListener('dblclick', resetPerspectiveView)
  controls?.dispose()
  disposeChildren(shelfRoot || new THREE.Group())
  disposeChildren(markerRoot || new THREE.Group())
  disposeChildren(partModelsRoot || new THREE.Group())
  disposeChildren(roomRoot || new THREE.Group())
  renderer?.dispose()
  renderer?.domElement?.remove()
  labelRenderer?.domElement?.remove()
})
</script>

<style scoped>
.warehouse-page { --wine:#8f1720; --crimson:#c91f2c; --amber:#e3a321; --purple:#7254a6; --teal:#15936b; }
.warehouse-hero { position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:16px;padding:25px 28px;border-radius:20px;color:#fff;background:linear-gradient(120deg,#77131a 0%,#aa1924 56%,#cf2733 100%);box-shadow:0 18px 40px rgba(113,16,24,.18); }
.warehouse-hero::after { content:"";position:absolute;right:17%;bottom:-95px;width:280px;height:280px;border:54px solid rgba(255,255,255,.055);border-radius:50%; }
.warehouse-hero > * { position:relative;z-index:1; }
.eyebrow { display:block;margin-bottom:7px;color:#ffd2d6;font-size:11px;font-weight:800;letter-spacing:.13em; }
.warehouse-hero h2 { margin:0;font-size:29px;letter-spacing:.02em; }
.warehouse-hero p { margin:8px 0 0;color:rgba(255,255,255,.76);font-size:13px; }
.hero-actions { display:flex;align-items:center;gap:10px; }
.hero-actions :deep(.el-button:not(.el-button--primary)) { color:#475569;border-color:#dcdfe6;background:#fff; }
.control-panel { display:grid;grid-template-columns:minmax(280px,.85fr) minmax(170px,.38fr) minmax(420px,1.35fr);gap:18px;align-items:end;margin-bottom:16px;padding:17px 20px; }
.control-panel label { display:block;margin-bottom:7px;color:#596274;font-size:11px;font-weight:800; }
.group-filter { min-width:0; }
.part-option { min-width:0;display:flex;align-items:center;justify-content:space-between;gap:24px; }
.part-option span,.part-option strong,.part-option small { display:block;min-width:0; }
.part-option strong { overflow:hidden;text-overflow:ellipsis;font-size:12px; }
.part-option small { overflow:hidden;text-overflow:ellipsis;color:#8a93a4;font-size:10px; }
.part-option em { flex:none;color:#a51c26;font-size:11px;font-style:normal;font-weight:700; }
.filter-chips { display:flex;gap:7px;flex-wrap:wrap;overflow:visible; }
.filter-chips button { flex:none;display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid #e0e3e8;border-radius:9px;color:#687386;background:#fff;cursor:pointer;font-size:11px; }
.filter-chips button i { width:8px;height:8px;flex:none;border-radius:3px;background:var(--filter-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--filter-color) 16%,transparent); }
.filter-chips button.active { color:#fff;border-color:var(--crimson);background:var(--crimson); }
.filter-chips button.has-color.active { border-color:var(--filter-color);background:var(--filter-color); }
.filter-chips button.has-color.active i { background:#fff;box-shadow:none; }
.warehouse-workspace { display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,21vw,370px);gap:14px;align-items:stretch;transition:grid-template-columns .24s ease; }
.warehouse-workspace.is-panel-collapsed { grid-template-columns:minmax(0,1fr); }
.model-card { min-width:0;display:flex;flex-direction:column;overflow:hidden; }
.model-toolbar { min-height:61px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 18px;border-bottom:1px solid #e6e8ec; }
.model-title { min-width:150px; }.model-title strong,.model-title span { display:block; }.model-title strong { font-size:14px; }.model-title span { margin-top:4px;color:#8b94a3;font-size:10px; }
.model-actions { flex:none;display:flex;align-items:center;gap:9px; }
.fullscreen-locator { width:min(390px,34vw);margin-left:auto; }
.fullscreen-button { white-space:nowrap; }
.three-stage { position:relative;height:680px;overflow:hidden;background:radial-gradient(circle at 50% 20%,#fff 0%,#eff1f3 70%); }
.three-stage :deep(canvas),.three-stage :deep(.label-layer) { position:absolute;inset:0;width:100%!important;height:100%!important; }
.three-stage :deep(canvas) { cursor:grab;touch-action:none; }.three-stage :deep(canvas:active) { cursor:grabbing; }
.three-stage :deep(.label-layer) { pointer-events:none; }
.three-stage :deep(.part-location-card) { position:relative;min-width:142px;padding:9px 11px;border:1px solid rgba(255,255,255,.86);border-radius:10px;color:#fff;background:linear-gradient(145deg,#087b59,#10a775);box-shadow:0 9px 24px rgba(6,95,67,.32);white-space:nowrap; }
.three-stage :deep(.part-location-card::after) { content:"";position:absolute;left:50%;bottom:-7px;width:13px;height:13px;border-right:1px solid rgba(255,255,255,.72);border-bottom:1px solid rgba(255,255,255,.72);background:#10a775;transform:translateX(-50%) rotate(45deg); }
.three-stage :deep(.part-location-card span),.three-stage :deep(.part-location-card strong),.three-stage :deep(.part-location-card small) { position:relative;z-index:1;display:block; }
.three-stage :deep(.part-location-card span) { color:#ffe29a;font-size:9px;font-weight:900;letter-spacing:.08em; }
.three-stage :deep(.part-location-card strong) { max-width:210px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;font-size:12px; }
.three-stage :deep(.part-location-card small) { margin-top:4px;color:#d9fff2;font-size:10px;font-weight:800; }
.three-stage :deep(.east-label-3d) { min-width:34px;padding:5px 10px;border:2px solid #fff;border-radius:999px;color:#fff;background:#c91f2c;box-shadow:0 5px 14px rgba(143,23,32,.3);font-size:13px;font-weight:900;text-align:center; }
.stock-model-legend{position:absolute;right:16px;bottom:14px;z-index:2;display:flex;gap:10px;padding:7px 10px;border:1px solid rgba(255,255,255,.7);border-radius:8px;color:#566174;background:rgba(255,255,255,.86);font-size:10px;pointer-events:none}.stock-model-legend span{display:flex;align-items:center;gap:4px}.stock-model-legend i{width:8px;height:8px;border-radius:50%;box-shadow:0 0 0 2px #fff}.stock-model-legend i.normal{background:#19a974}.stock-model-legend i.low{background:#d9222f}
.stage-loading,.stage-error { position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#6b7280;background:rgba(244,245,247,.92); }
.stage-loading .el-icon,.stage-error .el-icon { color:var(--crimson);font-size:28px; }.stage-error strong { color:#273244; }.stage-error span { font-size:12px; }
.shelf-panel { min-width:0;height:742px;display:flex;flex-direction:column;overflow:hidden; }
.shelf-panel > header { flex:none;height:61px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;border-bottom:1px solid #e6e8ec; }
.shelf-panel > header > div:first-child span,.shelf-panel > header > div:first-child strong { display:block; }.shelf-panel > header > div:first-child span { color:#8a93a4;font-size:10px; }.shelf-panel > header > div:first-child strong { margin-top:2px;font-size:14px; }
.panel-head-actions { flex:none;display:flex;align-items:center; }
.panel-tabs { flex:none;display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 12px 0;padding:4px;border-radius:10px;background:#f2f4f7; }
.panel-tabs button { min-height:34px;border:0;border-radius:8px;color:#6b7483;background:transparent;cursor:pointer;font-size:11px;font-weight:700; }
.panel-tabs button.active { color:#8f1720;background:#fff;box-shadow:0 2px 8px rgba(23,32,51,.08); }
.panel-tabs b { display:inline-grid;min-width:18px;height:18px;place-items:center;margin-left:3px;border-radius:9px;color:inherit;background:#f4e6e7;font-size:9px; }
.located-part { flex:none;display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;margin:12px 12px 0;padding:14px;border:1px solid #c8e6dc;border-left:3px solid #15936e;border-radius:12px;background:#fff; }
.located-icon { width:34px;height:34px;display:grid;place-items:center;border-radius:10px;color:#168663;background:#eaf7f1;font-size:18px; }
.located-identity{min-width:0}.located-identity>strong{display:block;color:#182f2a;font-size:13px;line-height:1.55;overflow-wrap:anywhere;white-space:normal}
.located-code{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:5px}.located-code>span{color:#82948d;font-size:10px}.located-code code{color:#526b62;font-size:12px;overflow-wrap:anywhere}
.located-spec{grid-column:1/-1;margin:0;color:#657b72;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.located-spec>span{margin-right:8px;color:#8a9993;font-size:11px}
.located-location{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:3px 0 0;padding:10px 0;border-radius:9px;background:#f0f8f4;text-align:center}
.located-location>div+div{border-left:1px solid #dbeae3}.located-location dt{color:#7c9488;font-size:10px}.located-location dd{margin:4px 0 0;color:#176749;font-size:15px;font-weight:750}
.located-qr{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:6px 12px;border:1px solid #d7e7df;border-radius:8px;color:#217759;background:#fff;font-size:12px;font-weight:600;cursor:pointer}.located-qr:hover{background:#f0f8f4;border-color:#9dcbb8}.located-qr:focus-visible{outline:2px solid #15936e;outline-offset:2px}
.selected-shelf-card { flex:none;margin:12px 12px 0;padding:13px;border:1px solid #efd7d9;border-radius:13px;background:#fff8f8; }
.shelf-card-top { display:flex;align-items:flex-start;justify-content:space-between;gap:12px; }.shelf-card-top > div { min-width:0; }.shelf-card-top > div span,.shelf-card-top > div strong { display:block; }.shelf-card-top > div span { color:#a27478;font-size:9px; }.shelf-card-top > div strong { margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px; }
.shelf-kind-badge { flex:none;min-width:72px;display:inline-flex!important;align-items:center;justify-content:center;padding:6px 10px;border:1px solid #ded6ee;border-radius:8px;color:#68499a!important;background:#f7f4fc;font-size:10px!important;font-weight:700;line-height:1;white-space:nowrap;word-break:keep-all; }
.shelf-kind-badge.is-vendor { border-color:#b9ccf8;color:#1d4ed8!important;background:#eff5ff; }.shelf-kind-badge.is-unnamed { border-color:#d6dbe2;color:#66717f!important;background:#f5f6f8; }
.selected-shelf-card dl { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 0; }.selected-shelf-card dl div { padding:8px;border-radius:8px;background:#fff; }.selected-shelf-card dt { color:#8d95a2;font-size:9px; }.selected-shelf-card dd { margin:4px 0 0;font-size:10px;font-weight:800; }.selected-shelf-card dd.danger { color:var(--crimson); }
.shelf-list { flex:1;min-height:0;overflow-y:auto;padding:10px; }
.shelf-list button { width:100%;display:grid;grid-template-columns:38px minmax(0,1fr) 16px;gap:9px;align-items:center;padding:9px;border:0;border-bottom:1px solid #edf0f3;color:#303949;background:transparent;cursor:pointer;text-align:left; }.shelf-list button:hover { background:#faf5f5; }.shelf-list button.active { border-radius:9px;color:#8f1720;background:#fff0f1; }.shelf-list button.unnamed { color:#626d7c; }
.shelf-number { width:38px;height:32px;display:grid;place-items:center;border-radius:8px;color:#fff;background:#9b1b24;font-size:11px;font-weight:900; }.unnamed .shelf-number { background:#7c8797; }.active .shelf-number { background:#d29a20; }
.shelf-copy { min-width:0; }.shelf-copy strong,.shelf-copy small { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.shelf-copy strong { font-size:11px; }.shelf-copy small { margin-top:3px;color:#929aa7;font-size:9px; }
.shelf-parts { flex:1;min-height:0;display:flex;flex-direction:column;border-top:1px solid #e7e9ed; }.shelf-parts.is-expanded { margin-top:10px; }.parts-heading { flex:none;display:flex;justify-content:space-between;padding:12px 15px;color:#4d5768;font-size:12px; }.parts-heading span { color:#929aa7; }.parts-scroll { flex:1;min-height:180px;overflow-y:auto;padding:0 10px 12px; }.parts-scroll button { width:100%;min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 10px;border:0;border-bottom:1px solid #e9edf2;border-radius:8px;background:#fff;cursor:pointer;text-align:left; }.parts-scroll button:hover { background:#f5f8fb; }.parts-scroll button.active { color:#0f6f54;background:#eefaf6;box-shadow:inset 3px 0 #18a578; }.parts-scroll span { min-width:0; }.parts-scroll strong,.parts-scroll small { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.parts-scroll strong { font-size:12px; }.parts-scroll small { margin-top:4px;color:#8490a1;font-size:10px; }.parts-scroll em { flex:none;color:#9e1d27;font-size:11px;font-style:normal;font-weight:800; }
.code-guide { display:grid;grid-template-columns:240px 1fr;gap:25px;align-items:center;margin-top:16px;padding:18px 22px; }
.code-guide > div { display:flex;align-items:center;gap:16px; }.guide-title { display:inline-flex;align-items:center;gap:4px;color:#687386;font-size:11px;font-weight:800; }.code-guide strong { display:flex;gap:3px; }.code-guide i { min-width:30px;padding:7px 8px;border-radius:7px;color:#5f4302;background:#ffe58c;font-size:14px;font-style:normal;text-align:center; }.code-guide i:nth-child(2),.code-guide i:nth-child(4) { color:#075f43;background:#99e8c9; }
.code-guide ol { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0;padding:0;list-style:none; }.code-guide li { padding-left:12px;border-left:2px solid #e1e4e9; }.code-guide b,.code-guide span { display:block; }.code-guide b { font-size:11px; }.code-guide li span { margin-top:3px;color:#8992a1;font-size:9px; }
.editor-preview { display:flex;align-items:center;gap:13px;margin-bottom:18px;padding:14px;border-radius:13px;background:#f7f8fa; }.preview-number { width:52px;height:45px;display:grid;place-items:center;border-radius:10px;color:#fff;background:var(--crimson);font-size:13px;font-weight:900; }.editor-preview strong,.editor-preview small { display:block; }.editor-preview strong { font-size:14px; }.editor-preview small { margin-top:4px;color:#8b94a2;font-size:10px; }.editor-tip { margin:7px 0 0;color:#8a93a4;font-size:10px;line-height:1.6; }
.dim-row { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px }
.dim-row label { font-size:13px;color:#475467;white-space:nowrap }
.fixed-levels { color:#0f7556;font-size:13px;line-height:1.5;text-align:right; }
.three-stage :deep(.entrance-label-3d) { padding:5px 11px;border:1px solid #84d9bd;border-radius:999px;color:#087250;background:rgba(240,253,248,.95);box-shadow:0 5px 14px rgba(8,114,80,.16);font-size:12px;font-weight:800;white-space:nowrap;pointer-events:none; }
.warehouse-workspace:fullscreen { width:100vw;height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;padding:12px;background:#eef0f3; }
.warehouse-workspace:fullscreen.is-panel-collapsed { grid-template-columns:minmax(0,1fr); }
.warehouse-workspace:fullscreen .model-card,.warehouse-workspace:fullscreen .shelf-panel { height:calc(100vh - 24px);border-radius:14px;background:#fff; }
.warehouse-workspace:fullscreen .three-stage { flex:1;height:auto;min-height:0; }
.warehouse-workspace:fullscreen .model-toolbar { min-height:68px; }
.warehouse-workspace:fullscreen .shelf-panel { min-width:0; }
@media (max-width:1280px) { .control-panel { grid-template-columns:1fr 1fr; }.warehouse-workspace { grid-template-columns:minmax(0,1fr) 310px; }.three-stage { height:610px; }.shelf-panel { height:672px; } }
@media (max-width:980px) { .warehouse-workspace { grid-template-columns:1fr; }.three-stage { height:560px; }.shelf-panel { height:auto;max-height:720px; }.shelf-list { max-height:280px; }.code-guide { grid-template-columns:1fr; }.warehouse-workspace:fullscreen { grid-template-columns:minmax(0,1fr) 300px; }.fullscreen-locator { width:240px; }.warehouse-workspace:fullscreen .shelf-panel { height:calc(100vh - 24px);max-height:none; } }
@media (max-width:680px) { .warehouse-hero { align-items:stretch;flex-direction:column;padding:21px; }.warehouse-hero h2 { font-size:24px; }.hero-actions { justify-content:space-between; }.control-panel { grid-template-columns:1fr;padding:14px; }.three-stage { height:440px; }.warehouse-workspace { gap:12px; }.code-guide { padding:15px; }.code-guide > div { align-items:flex-start;flex-direction:column; }.code-guide ol { grid-template-columns:1fr 1fr; }.location-path { overflow-x:auto;justify-content:flex-start; } }
.warehouse-hero{padding:20px 24px}.warehouse-hero h2{font-size:26px}.two-stage{position:relative;height:680px;overflow:hidden;border:12px solid #dfe3e8;background:linear-gradient(#f8fafc,#f1f4f7);box-shadow:inset 0 0 0 2px #fff}.two-stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#d9dee633 1px,transparent 1px),linear-gradient(90deg,#d9dee633 1px,transparent 1px);background-size:28px 28px}.plan-shelf{position:absolute;z-index:2;min-width:76px;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 9px;border:2px solid color-mix(in srgb,var(--plan-color) 78%,#172033);border-radius:7px;color:#fff;background:var(--plan-color);box-shadow:0 5px 12px #17203322;cursor:pointer;white-space:nowrap}.plan-shelf:hover,.plan-shelf.active{z-index:4;outline:4px solid #f7bd3c66;filter:brightness(1.08)}.plan-shelf.unnamed{background:#718096}.plan-shelf strong{overflow:hidden;text-overflow:ellipsis;font-size:12px}.plan-shelf small{font-size:12px;opacity:.82}.entrance-2d{position:absolute;z-index:5;display:flex;align-items:center;gap:4px;padding:8px 12px;border-radius:999px;color:#fff;background:#13966c;box-shadow:0 4px 12px rgba(19,150,108,.22);font-size:12px;font-weight:800;white-space:nowrap;transform-origin:center}.floor-label{position:absolute;left:12px;top:8px;z-index:1;color:#7c8795;font-size:12px;font-weight:800}.east-label{position:absolute;right:12px;top:8px;z-index:1;color:#b21f2a;font-size:13px;font-weight:900}.plan-help{position:absolute;left:14px;bottom:12px;z-index:5;padding:7px 10px;border-radius:8px;color:#667085;background:#ffffffdd;font-size:12px}.layer-map{flex:none;margin:10px 12px 0;padding:10px;border:1px solid #e3e7ed;border-radius:12px;background:#f8fafc}.layer-map-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.layer-map-title strong{font-size:12px}.layer-map-title button{border:0;color:#1677ff;background:transparent;cursor:pointer;font-size:12px}.layer-map>button{width:100%;display:grid;grid-template-columns:42px 1fr 45px;gap:8px;align-items:center;margin-top:5px;padding:7px 8px;border:1px solid transparent;border-radius:8px;color:#566174;background:#fff;cursor:pointer;text-align:left}.layer-map>button i{height:5px;border-radius:4px;background:#d8dde5}.layer-map>button.active,.layer-map>button.located{color:#0f7556;border-color:#a9dfd0;background:#eefaf6}.layer-map>button.active i,.layer-map>button.located i{background:#17a378}.layer-map>button strong{text-align:right}.qr-button{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:5px;padding:7px;border:1px dashed #8ccfba;border-radius:8px;color:#0f7556;background:#fff;cursor:pointer;font-size:12px;font-weight:700}.qr-card{display:flex;align-items:center;gap:18px}.qr-card img{width:180px;height:180px;border:1px solid #e3e7ed;border-radius:12px}.qr-card strong,.qr-card span,.qr-card small{display:block}.qr-card span{margin-top:7px;color:#0f7556}.qr-card small{margin-top:8px;color:#758095;line-height:1.7}.warehouse-workspace:fullscreen .two-stage{flex:1;height:auto;min-height:0}@media(max-width:1280px){.two-stage{height:610px}}@media(max-width:980px){.two-stage{height:560px}}@media(max-width:680px){.two-stage{height:440px}.plan-shelf small{display:none}.qr-card{align-items:flex-start;flex-direction:column}.qr-card img{align-self:center}}
.entrance-2d .el-icon{transform:rotate(var(--entrance-arrow,0deg))}
.plan-staging{position:absolute;transform:translate(-50%,-50%);z-index:4;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#fef3c7;border:2px solid #f59e0b;color:#92400e;font-size:10px;font-weight:600;text-align:center;box-shadow:0 2px 8px rgba(245,158,11,.3)}
.plan-staging span{line-height:1.1;display:block}
.layer-map-title>div{display:flex;align-items:baseline;gap:7px}.layer-map-title>div small{color:#8791a1;font-size:10px}.layer-map-title>button.active{padding:4px 8px;border-radius:6px;color:#0f7556;background:#e9f8f3}.layer-map>button span b,.layer-map>button span small{display:block}.layer-map>button span b{font-size:12px}.layer-map>button span small{min-height:12px;margin-top:1px;color:#98a1af;font-size:9px}.layer-map>button.located:not(.active){border-color:#f0b62e;box-shadow:inset 3px 0 #f0b62e}.layer-map>button.located:not(.active) i{background:#f0b62e}
.shelf-editor-form{display:grid;gap:14px}.editor-preview{position:relative;margin-bottom:14px}.editor-status{margin-left:auto;padding:5px 9px;border-radius:999px;color:#0d7558;background:#e8f7f2;font-size:10px;font-weight:800}.editor-section{padding:15px;border:1px solid #e5e8ed;border-radius:12px;background:#fff}.editor-section>header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}.editor-section>header strong{font-size:13px}.editor-section>header span{color:#8a93a3;font-size:10px}.editor-basic-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(150px,.7fr);gap:14px}.editor-basic-grid :deep(.el-form-item){margin-bottom:0}.dimension-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.dimension-grid label{display:grid;gap:7px;color:#687386;font-size:11px}.dimension-grid :deep(.el-input-number){width:100%}.danger-zone{display:flex;align-items:center;justify-content:space-between;gap:16px;border-color:#f6d0d3;background:#fffafa}.danger-zone>div strong,.danger-zone>div span{display:block}.danger-zone>div strong{color:#a61c26;font-size:12px}.danger-zone>div span{margin-top:4px;color:#8d6b6e;font-size:10px}.shelf-editor-form .editor-tip{margin:11px 0 0}
.layer-map{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px;padding:9px}
.layer-map-title{grid-column:1/-1;margin-bottom:1px}
.layer-map>button{min-width:0;display:grid;grid-template-columns:1fr;gap:3px;margin-top:0;padding:7px 5px;text-align:center}
.layer-map>button span,.layer-map>button span b,.layer-map>button span small{display:block}
.layer-map>button span small{min-height:14px;color:#8a93a4;font-size:9px}
.layer-map>button strong{text-align:center}
@media(max-width:680px){.editor-basic-grid,.dimension-grid{grid-template-columns:1fr}.editor-section>header{align-items:flex-start;flex-direction:column}.danger-zone{align-items:flex-start;flex-direction:column}}
:global(.warehouse-part-options .el-select-dropdown__item){height:auto;min-height:60px;line-height:20px;padding:9px 16px}.part-option{display:grid;grid-template-columns:minmax(0,1fr) minmax(80px,32%);gap:12px;line-height:20px}.part-option strong,.part-option small{white-space:nowrap}.part-option em{white-space:normal;overflow-wrap:anywhere;text-align:right;line-height:18px}.model-load-hint{grid-column:1/-1;font-size:12px!important;white-space:normal!important;line-height:1.5;color:#63736d}
@media(min-width:761px) and (max-width:1100px){.control-panel{grid-template-columns:minmax(0,1fr) 200px}.control-panel>div:last-child{grid-column:1/-1}}

.model-toolbar{flex-wrap:wrap}
.model-title{flex:1 1 250px;min-width:0}
.model-actions{flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end;max-width:100%}
.model-actions>.el-button{margin-left:0}
.view-mode-tools{display:flex;align-items:center;gap:8px;flex:none}
.view-mode-tools .el-button-group{display:flex;white-space:nowrap}
.model-actions .refresh-layout-button{width:32px;padding:0;margin-left:0;flex:none}
@media(max-width:760px){
.model-actions .view-mode-tools{grid-column:1/-1;justify-content:space-between}
.model-actions .refresh-layout-button{width:38px}
.model-actions .view-mode-tools .el-button-group{flex:1}
.model-actions .view-mode-tools .el-button-group .el-button{flex:1}
}
</style>

<style scoped>
.model-title .touch-scene-help,.touch-reset-button{display:none}
@media(max-width:980px){
  .model-toolbar{flex-wrap:wrap;gap:12px;padding:14px}
  .model-actions{flex-wrap:wrap;gap:8px;max-width:100%}
  .model-actions .el-button{margin-left:0}
  .hero-actions{flex-wrap:wrap}
  .hero-actions .el-button{margin-left:0}
}
@media(max-width:680px){
  .warehouse-hero{padding:18px;gap:16px}
  .warehouse-hero h2{font-size:23px}
  .hero-actions{justify-content:flex-start}
  .model-title{width:100%}
  .model-title span{font-size:12px;line-height:1.6}
  .model-actions{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  .model-actions>.el-dropdown,.model-actions>.el-button,.model-actions>.el-dropdown .el-button{width:100%;min-width:0}
  .model-actions .el-button{min-height:38px;padding:8px}
  .model-actions .fullscreen-button{grid-column:1/-1}
  .model-title .desktop-scene-help{display:none}
  .model-title .touch-scene-help{display:block}
  .touch-reset-button{display:inline-flex}
  .three-stage{height:420px}
  .warehouse-workspace:fullscreen{display:flex;flex-direction:column;overflow:auto;padding:8px}
  .warehouse-workspace:fullscreen .model-card{flex:1 0 min(720px,100dvh)}
  .warehouse-workspace:fullscreen .shelf-panel{flex:none;height:auto;max-height:65dvh}
  .fullscreen-locator{width:100%;margin:0}
  .code-display{flex-wrap:wrap}
}
@media(pointer:coarse){.model-title .desktop-scene-help{display:none}.model-title .touch-scene-help{display:block}.touch-reset-button{display:inline-flex}}
.warehouse-hero{padding:0;margin-bottom:10px;background:transparent;box-shadow:none;color:#475569;justify-content:flex-end;border-radius:0}.warehouse-hero::after{display:none}.warehouse-hero>div:first-child{display:none}.warehouse-hero .el-button{background:#fff;border-color:#dcdfe6;color:#475569}.warehouse-hero .el-button--primary{background:#c6000b;color:#fff}.control-panel{padding:12px;gap:12px;grid-template-columns:minmax(260px,.65fr) minmax(160px,.3fr) minmax(460px,1.25fr);align-items:start}.warehouse-workspace:not(:fullscreen) .three-stage,.warehouse-workspace:not(:fullscreen) .two-stage{height:clamp(330px,calc(100vh - 350px),680px)}@media(max-width:760px){.control-panel{grid-template-columns:1fr}.warehouse-hero{flex-direction:row}.warehouse-workspace:not(:fullscreen) .three-stage{height:420px}}
</style>

<style scoped>
.model-title-heading{display:flex;align-items:center;gap:8px}
:global(#app) .model-title-heading .refresh-layout-button{width:auto;min-width:60px;height:32px;min-height:32px;padding:0 8px;margin-left:0;font-size:12px;border-radius:6px}
@media(max-width:760px){
  .model-title-heading{justify-content:space-between;width:100%}
  :global(#app) .model-title-heading .refresh-layout-button{height:36px;min-height:36px}
  .model-actions .view-mode-tools{display:block}
  .model-actions .view-mode-tools .el-button-group::before,.model-actions .view-mode-tools .el-button-group::after{display:none;content:none}
  .model-actions .view-mode-tools .el-button-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%}
  .model-actions .el-button{height:40px;min-height:40px}
  .model-actions .view-mode-tools .el-button-group .el-button{width:100%;margin:0;border-radius:8px!important}
  .model-actions .view-mode-tools .el-button-group .el-button:not(:first-child){border-left-color:var(--el-border-color)}
}
</style>

<style scoped>
.warehouse-page .plan-help{position:static;margin:10px 12px;line-height:1.6;background:#f4f6f9;overflow-wrap:anywhere}.entrance-2d,.floor-label,.east-label{pointer-events:none}
</style>

<style scoped>
.model-toolbar{display:flex;flex-direction:column;align-items:stretch;gap:12px}.model-actions{display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;padding-top:10px;border-top:1px solid #e5eaf0}.scene-view-menu{margin-left:auto}.model-actions .el-button{margin-left:0;min-height:36px}.stock-detail-panel{padding:16px}.stock-detail-panel>header{display:flex;align-items:center;justify-content:space-between}.stock-detail-panel h3{margin:12px 0 6px;font-size:16px;line-height:1.5}.stock-detail-panel>code{font-size:16px;color:#475569}.stock-detail-panel :deep(.visual-grid){gap:8px}.stock-detail-panel :deep(.visual-grid section){padding:8px}.stock-detail-panel :deep(.visual-grid h3){font-size:12px}.stock-detail-panel :deep(.visual-grid h3 small){display:none}.stock-detail-panel :deep(.model-preview),.stock-detail-panel :deep(.part-photo),.stock-detail-panel :deep(.visual-empty){height:160px!important}.stock-detail-fields{margin:16px 0}.stock-detail-fields>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #edf0f4;font-size:13px}.stock-detail-fields dt{color:#64748b}.stock-detail-fields dd{margin:0;text-align:right}.stock-slot-choices{display:grid;gap:6px;margin:14px 0}.stock-slot-choices>button{padding:8px;border:1px solid #e3e8ef;border-radius:6px;background:white;text-align:left;cursor:pointer}.stock-slot-choices>button.active{border-color:#be203b;background:#fff2f5}.stock-detail-panel>button{width:100%}@media(max-width:760px){.scene-view-menu{margin-left:0}.model-actions{gap:6px}}
</style>

<style scoped>
.model-toolbar .model-title{flex:none}.stock-detail-panel :deep(.model-preview){min-height:160px}
</style>

<style scoped>
.shelf-panel.is-stock-detail{align-self:stretch;display:flex;flex-direction:column}.shelf-panel.is-stock-detail .stock-detail-panel{flex:1;display:flex;flex-direction:column;min-height:0}.stock-detail-panel>button:last-child{margin-top:auto}.stock-detail-fields{overflow-wrap:anywhere}
</style>

<style scoped>
.warehouse-workspace{grid-template-columns:minmax(0,1fr) clamp(360px,24vw,430px)}.shelf-panel.is-stock-detail{height:auto;max-height:none;align-self:stretch}.stock-detail-panel{padding:20px}.stock-detail-panel>header{padding-bottom:14px;border-bottom:1px solid #e7edf3}.stock-detail-panel>header strong{font-size:18px;color:#20364e}.stock-detail-panel>h3{font-size:19px;line-height:1.5;margin:18px 0 12px}.stock-identity-line{display:flex;align-items:center;justify-content:space-between;gap:10px}.stock-identity-line code{font-size:16px;color:#50637b;background:#f2f5f9;border-radius:5px;padding:5px 8px}.stock-detail-panel :deep(.bound-model){font-size:12px;margin:0 0 12px}.stock-detail-panel :deep(.visual-grid section){padding:10px;background:#f8fafc;border-color:#e5ebf2}.stock-detail-panel :deep(.visual-grid h3){font-size:13px;margin:0 0 10px}.stock-detail-fields>div{padding:12px 0;font-size:14px}.stock-detail-fields dd{font-weight:500;color:#20364e}.stock-detail-fields dt{flex:none}.stock-detail-panel>button:last-child{min-height:46px;font-size:15px;border-radius:8px}.stock-detail-panel :deep(.compact-model-note){font-size:11px;color:#8793a4;line-height:1.5;margin:10px 0 0}@media(max-width:980px){.warehouse-workspace{grid-template-columns:1fr}.shelf-panel.is-stock-detail{height:auto}}
</style>

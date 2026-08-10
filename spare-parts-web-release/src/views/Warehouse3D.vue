<template>
  <div class="warehouse-page">
    <section class="warehouse-hero">
      <div>
        <span class="eyebrow">DIGITAL WAREHOUSE · 实时库位</span>
        <h2>备件库 3D 导航</h2>
        <p>搜索备件后，模型会定位到对应货架，并标出东/西侧、层数和货位。</p>
      </div>
      <div class="hero-actions">
        <el-button :loading="loading" @click="loadLayout"><el-icon><Refresh /></el-icon>刷新布局</el-button>
        <el-button @click="toggleFullscreen"><el-icon><FullScreen /></el-icon>全屏查看</el-button>
        <el-button-group>
          <el-button :type="displayMode === '3d' ? 'primary' : ''" @click="displayMode='3d'">3D立体</el-button>
          <el-button :type="displayMode === '2d' ? 'primary' : ''" @click="displayMode='2d'">2D平面</el-button>
        </el-button-group>
      </div>
    </section>

    <section class="warehouse-metrics">
      <article><span>实体货架</span><strong>{{ numberedCount }}</strong><small>已编号并关联库位</small></article>
      <article><span>待命名货架</span><strong>{{ unnamedCount }}</strong><small>管理员可编辑名称与编号</small></article>
      <article><span>货架备件</span><strong>{{ formatNumber(totalParts) }}</strong><small>当前布局关联条目</small></article>
      <article class="is-alert"><span>低库存</span><strong>{{ formatNumber(totalLowStock) }}</strong><small>点击货架可查看明细</small></article>
    </section>

    <section class="control-panel panel">
      <div class="locator-field">
        <label>快速定位备件</label>
        <el-select
          v-model="selectedPartId"
          filterable
          remote
          clearable
          reserve-keyword
          :remote-method="searchParts"
          :loading="partSearching"
          placeholder="输入物料编码、名称、规格或六位库位码"
          style="width:100%"
          @change="choosePart"
          @clear="clearPart"
        >
          <el-option v-for="part in partOptions" :key="part._id" :value="part._id" :label="part.materialDesc || part.materialCode">
            <div class="part-option">
              <span><strong>{{ part.materialDesc || '未命名备件' }}</strong><small>{{ part.materialCode }} · {{ part.spec || '未填写规格' }}</small></span>
              <em>{{ compactLocation(part) }}</em>
            </div>
          </el-option>
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
            <strong>{{ layout?.room?.name || '原粮车间备件库' }}</strong>
            <span>{{ displayMode==='3d' ? '按住左键拖动旋转 · 滚轮缩放 · 点击货架查看' : '平面图适合快速确认货架相对位置与入口方向' }}</span>
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
            <div class="direction-pill"><span>↑</span> 东</div>
            <el-button v-if="displayMode==='3d'" @click="setView(viewMode==='perspective'?'top':'perspective')"><el-icon><View /></el-icon>{{ viewMode==='perspective'?'俯视角':'立体角' }}</el-button>
            <el-button class="panel-toggle-button" @click="toggleSidePanel">
              <el-icon><ArrowLeftBold v-if="sidePanelCollapsed" /><ArrowRightBold v-else /></el-icon>{{ sidePanelCollapsed ? '显示列表' : '放大模型' }}
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
          <div class="stage-hint">左键拖动旋转 · 滚轮缩放 · 右键拖动平移 · 双击复位</div>
        </div>
        <div v-show="displayMode==='2d'" class="two-stage">
          <div class="floor-label">北</div><div class="east-label">东 ↑</div><div class="entrance-2d"><el-icon><Right /></el-icon>入口</div>
          <button v-for="shelf in visibleShelves" :key="`plan-${shelf.id}`" type="button" class="plan-shelf" :class="{active:selectedShelf?.id===shelf.id,unnamed:shelf.shelfNo==null}" :style="planStyle(shelf)" @click="selectShelf(shelf,false)"><strong>{{ shelf.displayName }}</strong><small>{{ shelf.partsCount }} 条</small></button>
          <div class="plan-help">按真实相对位置显示；点击货架查看层数与备件</div>
        </div>
      </article>

      <aside v-show="!sidePanelCollapsed" class="shelf-panel panel">
        <header>
          <div><span>{{ panelMode === 'parts' ? '本架备件' : '货架导航' }}</span><strong>{{ panelMode === 'parts' ? `${shelfParts.length} 条` : `${visibleShelves.length} 组` }}</strong></div>
          <div class="panel-head-actions">
            <el-button v-if="selectedShelf && isAdmin" link type="primary" @click="openShelfEditor(selectedShelf)">
              <el-icon><EditPen /></el-icon>编辑货架
            </el-button>
          </div>
        </header>

        <div v-if="selectedShelf" class="panel-tabs" role="tablist" aria-label="货架信息视图">
          <button type="button" :class="{ active: panelMode === 'shelves' }" @click="panelMode = 'shelves'">货架导航</button>
          <button type="button" :class="{ active: panelMode === 'parts' }" @click="panelMode = 'parts'">本架备件 <b>{{ shelfParts.length }}</b></button>
        </div>

        <div v-if="selectedPart && panelMode === 'parts'" class="located-part is-compact">
          <div class="located-icon"><el-icon><LocationFilled /></el-icon></div>
          <div>
            <span>已定位备件</span>
            <strong>{{ selectedPart.materialDesc || selectedPart.materialCode }}</strong>
            <small>{{ selectedPart.materialCode }} · {{ selectedPart.spec || '未填写规格' }}</small>
          </div>
          <div class="location-path">
            <b>{{ shelfLabel(selectedPartLocation.shelf) }}</b><i></i>
            <b>{{ sideText(selectedPartLocation.position) }}</b><i></i>
            <b>{{ selectedPartLocation.layer || '-' }} 层</b><i></i>
            <b>{{ padSlot(selectedPartLocation.location) }} 货位</b>
          </div>
          <button class="qr-button" type="button" @click="openQr"><el-icon><Link /></el-icon>生成定位二维码</button>
        </div>

        <div v-if="selectedShelf && panelMode === 'parts'" class="layer-map">
          <div class="layer-map-title"><strong>货架层位图</strong><button type="button" @click="layerFilter=''">全部层</button></div>
          <button v-for="item in layerStats" :key="item.layer" type="button" :class="{active:String(layerFilter)===String(item.layer),located:Number(selectedPartLocation.layer)===item.layer}" @click="layerFilter=String(item.layer)"><span>{{ item.layer }}层</span><i></i><strong>{{ item.count }} 条</strong></button>
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
          <div class="parts-heading"><strong>货架内备件</strong><span>{{ shelfParts.length }} 条</span></div>
          <div v-loading="shelfPartsLoading" class="parts-scroll">
            <button v-for="part in displayedShelfParts" :key="part._id" type="button" :class="{ active: selectedPart?._id === part._id }" @click="locatePart(part)">
              <span><strong>{{ part.materialDesc || part.materialCode }}</strong><small>{{ part.materialCode }} · {{ compactLocation(part) }}</small></span>
              <em>{{ part.totalStock }} {{ part.unit || '个' }}</em>
            </button>
            <el-empty v-if="!shelfPartsLoading && !displayedShelfParts.length" :image-size="58" description="当前层暂无备件记录" />
          </div>
        </div>
      </aside>
    </section>

    <section class="code-guide panel">
      <div><span class="guide-title">六位库位码</span><strong><i>01</i><i>1</i><i>1</i><i>01</i></strong></div>
      <ol>
        <li><b>01–99</b><span>货架号</span></li>
        <li><b>1 / 2</b><span>东侧 / 西侧</span></li>
        <li><b>1–4</b><span>从上至下的层数</span></li>
        <li><b>01–99</b><span>从南至北的货位</span></li>
      </ol>
    </section>

    <el-dialog v-model="editorVisible" title="编辑货架信息" width="min(480px, 92vw)" destroy-on-close>
      <div v-if="editingShelf" class="editor-preview">
        <span class="preview-number">{{ editShelfNoText || '—' }}</span>
        <div><strong>{{ editForm.displayName || '未命名' }}</strong><small>{{ editingShelf.workshopGroup }} · 模型位置保持不变</small></div>
      </div>
      <el-form label-position="top">
        <el-form-item label="货架名称">
          <el-input v-model="editForm.displayName" maxlength="60" show-word-limit clearable placeholder="例如：减速机专用架；留空则按货架号显示" />
        </el-form-item>
        <el-form-item label="货架号">
          <el-input v-model="editForm.shelfNo" maxlength="2" clearable placeholder="1–99，留空表示暂未编号" @input="sanitizeShelfNo" />
          <p class="editor-tip">修改已使用货架的编号时，会同步更新该架全部备件的六位库位码，并保留审计记录。</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="editorSubmitting" @click="submitShelfEdit">保存修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qrVisible" title="备件定位二维码" width="min(430px, 92vw)">
      <div class="qr-card"><img v-if="qrDataUrl" :src="qrDataUrl" alt="备件定位二维码" /><div><strong>{{ selectedPart?.materialDesc || selectedPart?.materialCode }}</strong><span>{{ compactLocation(selectedPart) }}</span><small>手机扫码后登录网页即可直接定位到此备件</small></div></div>
      <template #footer><el-button @click="copyLocationLink"><el-icon><CopyDocument /></el-icon>复制定位链接</el-button><el-button type="primary" @click="downloadQr"><el-icon><Download /></el-icon>下载二维码</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import QRCode from 'qrcode'
import { getPart, getParts, getWarehouseLayout, updateWarehouseShelf } from '../api'
import { getUser } from '../auth'
import {
  COMMON_SHELF_LEVELS,
  PHYSICAL_ROOM_HALF_DEPTH,
  VENDOR_SIGN_COLOR,
  applyPhysicalShelfLayout,
  layerLocalY,
  partBelongsToShelf,
  resolvePartLocation,
  sideLocalZ,
  slotLocalX
} from '../utils/warehouse-location.mjs'

const stage = ref(null)
const route = useRoute()
const fullscreenArea = ref(null)
const loading = ref(true)
const layout = ref(null)
const shelves = ref([])
const activeGroup = ref('')
const selectedShelf = ref(null)
const selectedPart = ref(null)
const selectedPartId = ref('')
const partOptions = ref([])
const partSearching = ref(false)
const shelfParts = ref([])
const shelfPartsLoading = ref(false)
const panelMode = ref('shelves')
const sidePanelCollapsed = ref(false)
const viewMode = ref('perspective')
const displayMode = ref('3d')
const layerFilter = ref('')
const isFullscreen = ref(false)
const webglError = ref(false)
const editorVisible = ref(false)
const editingShelf = ref(null)
const editorSubmitting = ref(false)
const editForm = reactive({ displayName: '', shelfNo: '' })
const qrVisible = ref(false)
const qrDataUrl = ref('')
const isAdmin = computed(() => getUser()?.role === 'admin')
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
const displayedShelfParts = computed(() => layerFilter.value ? shelfParts.value.filter(part => String(resolvePartLocation(part).layer) === String(layerFilter.value)) : shelfParts.value)
const layerStats = computed(() => Array.from({ length: COMMON_SHELF_LEVELS }, (_, index) => ({ layer: index + 1, count: shelfParts.value.filter(part => Number(resolvePartLocation(part).layer) === index + 1).length })))
const numberedCount = computed(() => shelves.value.filter(item => item.shelfNo != null).length)
const unnamedCount = computed(() => shelves.value.filter(item => item.shelfNo == null || item.displayName === '未命名').length)
const totalParts = computed(() => shelves.value.reduce((sum, item) => sum + Number(item.partsCount || 0), 0))
const totalLowStock = computed(() => shelves.value.reduce((sum, item) => sum + Number(item.lowStockCount || 0), 0))
const editShelfNoText = computed(() => editForm.shelfNo ? `${String(editForm.shelfNo).padStart(2, '0')}号` : '')

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
let cameraAnimation
let pointerStart = null
const clickableMeshes = []

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

function planStyle(shelf) {
  const x = Number(shelf.position?.x) || 0
  const z = Number(shelf.position?.z) || 0
  const width = Math.max(Number(shelf.size?.width) || 2.8, 1.6)
  const depth = Math.max(Number(shelf.size?.depth) || 0.75, 0.6)
  return {
    left: `${((9 - x) / 18) * 100}%`,
    top: `${((PHYSICAL_ROOM_HALF_DEPTH - z) / (PHYSICAL_ROOM_HALF_DEPTH * 2)) * 100}%`,
    width: `${Math.max((width / 18) * 100, 8)}%`,
    height: `${Math.max((depth / (PHYSICAL_ROOM_HALF_DEPTH * 2)) * 100, 3.8)}%`,
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
  loading.value = true
  try {
    const result = await getWarehouseLayout()
    layout.value = result.data
    shelves.value = (result.data?.shelves || []).map(applyPhysicalShelfLayout)
    if (selectedShelf.value) selectedShelf.value = shelves.value.find(item => item.id === selectedShelf.value.id) || null
    await nextTick()
    if (!scene) initScene()
    if (scene) drawShelves()
  } finally {
    loading.value = false
  }
}

async function searchParts(keyword) {
  const value = String(keyword || '').trim()
  if (!value) { partOptions.value = []; return }
  partSearching.value = true
  try {
    const result = await getParts({ page: 1, pageSize: 20, searchKeyword: value })
    partOptions.value = result.data || []
  } finally { partSearching.value = false }
}

function choosePart(id) {
  const part = partOptions.value.find(item => item._id === id)
  if (part) locatePart(part)
}

function clearPart() {
  selectedPart.value = null
  selectedPartId.value = ''
  if (markerRoot) disposeChildren(markerRoot)
  drawShelves()
}

async function locatePart(part) {
  selectedPart.value = part
  selectedPartId.value = part._id
  if (!partOptions.value.some(item => item._id === part._id)) partOptions.value = [part, ...partOptions.value]
  const location = resolvePartLocation(part)
  const shelf = shelves.value.find(item => Number(item.shelfNo) === Number(location.shelf))
  if (!shelf) {
    ElMessage.warning('该备件尚未关联到当前 3D 货架布局')
    return
  }
  activeGroup.value = ''
  panelMode.value = 'parts'
  layerFilter.value = String(location.layer || '')
  await selectShelf(shelf, false, false)
  drawShelves()
  drawPartMarker(shelf, part)
  focusPart(shelf, part)
}

async function locatePartById(id) {
  const value = String(id || '').trim()
  if (!value) return
  const result = await getPart(value)
  if (!result.data) return
  partOptions.value = [result.data, ...partOptions.value.filter(item => item._id !== result.data._id)]
  await locatePart(result.data)
}

async function selectShelf(shelf, focus = true, clearLocatedPart = true) {
  selectedShelf.value = shelf
  panelMode.value = 'parts'
  layerFilter.value = ''
  if (clearLocatedPart && !partBelongsToShelf(selectedPart.value || {}, shelf.shelfNo)) {
    selectedPart.value = null
    selectedPartId.value = ''
  }
  drawShelves()
  if (selectedPart.value && partBelongsToShelf(selectedPart.value, shelf.shelfNo)) drawPartMarker(shelf, selectedPart.value)
  if (focus) focusShelf(shelf)
  if (shelf.shelfNo == null) { shelfParts.value = []; return }
  shelfPartsLoading.value = true
  try {
    const result = await getParts({ page: 1, pageSize: 200, shelf: shelf.shelfNo })
    shelfParts.value = result.data || []
  } finally { shelfPartsLoading.value = false }
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
  sidePanelCollapsed.value = !sidePanelCollapsed.value
  nextTick(() => {
    window.setTimeout(resizeScene, 30)
    window.setTimeout(resizeScene, 280)
  })
}

function initScene() {
  if (!stage.value) return
  try {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4f5f7)
    scene.fog = new THREE.Fog(0xf4f5f7, 36, 76)
    camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100)
    camera.position.set(-24, 22, -35)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    controls.rotateSpeed = 0.72
    controls.zoomSpeed = 0.9
    controls.screenSpacePanning = true
    controls.minDistance = 2.1
    controls.maxDistance = 72
    controls.maxPolarAngle = Math.PI / 2.03
    controls.target.set(0, 1.2, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 3.1)
    sun.position.set(-8, 18, -12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -16
    sun.shadow.camera.right = 16
    sun.shadow.camera.top = 24
    sun.shadow.camera.bottom = -24
    scene.add(sun)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, PHYSICAL_ROOM_HALF_DEPTH * 2), new THREE.MeshStandardMaterial({ color: 0xe8e9eb, roughness: 0.95 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    const grid = new THREE.GridHelper(PHYSICAL_ROOM_HALF_DEPTH * 2, PHYSICAL_ROOM_HALF_DEPTH * 2, 0xcbd0d8, 0xdde1e6)
    grid.scale.x = 18 / (PHYSICAL_ROOM_HALF_DEPTH * 2)
    grid.position.y = 0.008
    scene.add(grid)
    addRoomWalls()

    shelfRoot = new THREE.Group()
    markerRoot = new THREE.Group()
    scene.add(shelfRoot, markerRoot)
    raycaster = new THREE.Raycaster()
    pointer = new THREE.Vector2()
    renderer.domElement.addEventListener('pointerdown', onStagePointerDown)
    renderer.domElement.addEventListener('pointerup', onStageClick)
    renderer.domElement.addEventListener('pointercancel', onStagePointerCancel)
    renderer.domElement.addEventListener('contextmenu', preventStageContextMenu)
    renderer.domElement.addEventListener('auxclick', preventStageAuxClick)
    renderer.domElement.addEventListener('dblclick', () => setView('perspective'))
    resizeObserver = new ResizeObserver(resizeScene)
    resizeObserver.observe(stage.value)
    resizeScene()
    animate()
  } catch (error) {
    webglError.value = true
    console.error('3D scene initialization failed', error)
  }
}

function addRoomWalls() {
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xf9fafb, transparent: true, opacity: 0.88, roughness: 1 })
  const back = new THREE.Mesh(new THREE.BoxGeometry(18, 4.2, 0.12), wallMaterial)
  back.position.set(0, 2.1, PHYSICAL_ROOM_HALF_DEPTH)
  back.receiveShadow = true
  scene.add(back)
  const addEntranceWallSegment = (startZ, endZ) => {
    const length = endZ - startZ
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, length), wallMaterial.clone())
    wall.position.set(9, 2.1, (startZ + endZ) / 2)
    wall.receiveShadow = true
    scene.add(wall)
  }
  const entranceStartZ = 10.6
  const entranceEndZ = 13
  const entranceCenterZ = (entranceStartZ + entranceEndZ) / 2
  addEntranceWallSegment(-PHYSICAL_ROOM_HALF_DEPTH, entranceStartZ)
  addEntranceWallSegment(entranceEndZ, PHYSICAL_ROOM_HALF_DEPTH)

  const borderPoints = [
    new THREE.Vector3(-9, 0.04, -PHYSICAL_ROOM_HALF_DEPTH), new THREE.Vector3(9, 0.04, -PHYSICAL_ROOM_HALF_DEPTH),
    new THREE.Vector3(9, 0.04, -PHYSICAL_ROOM_HALF_DEPTH), new THREE.Vector3(9, 0.04, entranceStartZ),
    new THREE.Vector3(9, 0.04, entranceEndZ), new THREE.Vector3(9, 0.04, PHYSICAL_ROOM_HALF_DEPTH),
    new THREE.Vector3(9, 0.04, PHYSICAL_ROOM_HALF_DEPTH), new THREE.Vector3(-9, 0.04, PHYSICAL_ROOM_HALF_DEPTH),
    new THREE.Vector3(-9, 0.04, PHYSICAL_ROOM_HALF_DEPTH), new THREE.Vector3(-9, 0.04, -PHYSICAL_ROOM_HALF_DEPTH)
  ]
  const borderGeometry = new THREE.BufferGeometry().setFromPoints(borderPoints)
  scene.add(new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({ color: 0x9ca3af })))

  const entranceStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.025, entranceEndZ - entranceStartZ),
    new THREE.MeshBasicMaterial({ color: 0x16a36f })
  )
  entranceStrip.position.set(8.84, 0.055, entranceCenterZ)
  scene.add(entranceStrip)
  const entranceLabel = document.createElement('div')
  entranceLabel.className = 'entrance-3d-label'
  entranceLabel.textContent = '入口'
  const entranceLabelObject = new CSS2DObject(entranceLabel)
  entranceLabelObject.position.set(8.55, 0.22, entranceCenterZ)
  scene.add(entranceLabelObject)

  const arrow = new THREE.Group()
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 12), new THREE.MeshBasicMaterial({ color: 0xc91f2c }))
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = 0.55
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), new THREE.MeshBasicMaterial({ color: 0xc91f2c }))
  head.rotation.x = Math.PI / 2
  head.position.z = 1.42
  arrow.add(shaft, head)
  arrow.position.set(7.6, 0.12, entranceEndZ)
  scene.add(arrow)
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
  const color = highlighted ? 0xe3a321 : 0x1479c9
  const frameMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.34, roughness: 0.42 })
  const boardMaterial = new THREE.MeshStandardMaterial({ color: highlighted ? 0xffd778 : 0x3b95d2, metalness: 0.26, roughness: 0.58 })
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
  for (let index = 0; index <= levels; index += 1) {
    const y = 0.16 + (height - 0.28) * index / levels
    const board = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.08, depth + 0.08), boardMaterial.clone())
    board.position.y = y
    board.receiveShadow = true
    board.castShadow = index === levels
    board.userData.shelf = shelf
    group.add(board)
    clickableMeshes.push(board)
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.13, 0.12), frameMaterial.clone())
  topBeam.position.set(0, height, -depth / 2)
  topBeam.userData.shelf = shelf
  group.add(topBeam)
  clickableMeshes.push(topBeam)

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
  const subtitle = shelf.isVendor ? `厂家备件 · ${shelf.partsCount} 条` : `${shelf.workshopGroup} · ${shelf.partsCount} 条`
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
  const slots = Math.max(Number(shelf.maxSlot || 6), Number(location.location || 1), 1)
  const slot = Math.min(Math.max(Number(location.location || 1), 1), slots)
  const x = slotLocalX(shelf.size.width, slots, slot)
  const y = layerLocalY(shelf.size.height, levels, layer)
  const sideDirection = String(location.position) === '2' ? -1 : 1
  const z = sideLocalZ(shelf.size.depth, location.position)
  return { location, levels, layer, slots, slot, x, y, z, sideDirection }
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

  const layerHeight = (shelf.size.height - 0.25) / placement.levels
  const slotWidth = shelf.size.width / placement.slots
  const locationBlock = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(slotWidth * 0.78, 0.3), layerHeight * 0.68, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x16b981, emissive: 0x087c57, emissiveIntensity: 0.68, transparent: true, opacity: 0.88 })
  )
  locationBlock.position.set(placement.x, placement.y, placement.z)
  markerAnchor.add(locationBlock)

  const locationOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(locationBlock.geometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96 })
  )
  locationOutline.position.copy(locationBlock.position)
  markerAnchor.add(locationOutline)

  const pointerMaterial = new THREE.MeshBasicMaterial({ color: 0xffb11b, depthTest: false, depthWrite: false })
  const pointerHead = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 4), pointerMaterial)
  pointerHead.rotation.z = Math.PI
  pointerHead.position.set(placement.x, placement.y + 0.35, placement.z)
  pointerHead.renderOrder = 8
  markerAnchor.add(pointerHead)
  const pointerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 10), pointerMaterial.clone())
  pointerStem.position.set(placement.x, placement.y + 0.72, placement.z)
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
  labelObject.position.set(placement.x, placement.y + 1.16, placement.z)
  markerAnchor.add(labelObject)
  markerRoot.add(markerAnchor)
}

function onStagePointerDown(event) {
  pointerStart = { x: event.clientX, y: event.clientY, button: event.button, pointerId: event.pointerId }
  if (event.button === 2) {
    event.preventDefault()
    renderer?.domElement?.setPointerCapture?.(event.pointerId)
  }
}

function onStageClick(event) {
  if (!renderer || !camera || !stage.value) return
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
  const hit = raycaster.intersectObjects(clickableMeshes, false)[0]
  if (hit?.object?.userData?.shelf) selectShelf(hit.object.userData.shelf, true)
}

function onStagePointerCancel() {
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

function focusShelf(shelf) {
  if (!camera || !controls) return
  const target = new THREE.Vector3(shelf.position.x, 1.35, shelf.position.z)
  const isTop = viewMode.value === 'top'
  camera.up.set(0, isTop ? 0 : 1, isTop ? 1 : 0)
  const destination = isTop
    ? new THREE.Vector3(target.x, 30, target.z + 0.01)
    : new THREE.Vector3(target.x - 14, 11.2, target.z - 16.5)
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
  const destination = isTop
    ? new THREE.Vector3(target.x, 43, target.z + 0.01)
    : target.clone().addScaledVector(outward, 2.02).addScaledVector(tangent, -0.58).add(new THREE.Vector3(0, 1.15, 0))
  cameraAnimation = { start: performance.now(), duration: 760, fromPosition: camera.position.clone(), toPosition: destination, fromTarget: controls.target.clone(), toTarget: target }
}

function setView(mode) {
  viewMode.value = mode
  if (!camera || !controls) return
  const target = selectedShelf.value ? new THREE.Vector3(selectedShelf.value.position.x, 1.2, selectedShelf.value.position.z) : new THREE.Vector3(0, 1.2, 0)
  camera.up.set(0, mode === 'top' ? 0 : 1, mode === 'top' ? 1 : 0)
  const destination = mode === 'top' ? new THREE.Vector3(target.x, 45, target.z + 0.01) : new THREE.Vector3(-24, 22, -35)
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
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  labelRenderer.setSize(width, height)
}

function disposeChildren(parent) {
  while (parent.children.length) {
    const child = parent.children.pop()
    child.traverse?.(node => {
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
    const result = await updateWarehouseShelf(editingShelf.value.id, { displayName: editForm.displayName, shelfNo: nextShelfNo, confirmRenumber })
    ElMessage.success(result.msg || '货架信息已更新')
    editorVisible.value = false
    await loadLayout()
    const updated = shelves.value.find(item => item.id === editingShelf.value.id)
    if (updated) await selectShelf(updated, true)
  } finally { editorSubmitting.value = false }
}

watch(activeGroup, () => drawShelves())
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
  await loadLayout()
  if (route.query.partId) await locatePartById(route.query.partId)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  renderer?.domElement?.removeEventListener('pointerdown', onStagePointerDown)
  renderer?.domElement?.removeEventListener('pointerup', onStageClick)
  renderer?.domElement?.removeEventListener('pointercancel', onStagePointerCancel)
  renderer?.domElement?.removeEventListener('contextmenu', preventStageContextMenu)
  renderer?.domElement?.removeEventListener('auxclick', preventStageAuxClick)
  controls?.dispose()
  disposeChildren(shelfRoot || new THREE.Group())
  disposeChildren(markerRoot || new THREE.Group())
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
.hero-actions :deep(.el-button:not(.el-button--primary)) { color:#fff;border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.1); }
.warehouse-metrics { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px; }
.warehouse-metrics article { position:relative;min-height:112px;padding:18px 20px;border:1px solid #e3e6eb;border-radius:16px;background:#fff;box-shadow:0 8px 22px rgba(23,32,51,.04); }
.warehouse-metrics article::before { content:"";position:absolute;inset:0 auto 0 0;width:4px;border-radius:16px 0 0 16px;background:#d98c92; }
.warehouse-metrics article:nth-child(2)::before { background:#8792a2; }
.warehouse-metrics article:nth-child(3)::before { background:#4a9180; }
.warehouse-metrics article.is-alert::before { background:#e3a321; }
.warehouse-metrics span,.warehouse-metrics small,.warehouse-metrics strong { display:block; }
.warehouse-metrics span { color:#687386;font-size:12px;font-weight:700; }
.warehouse-metrics strong { margin-top:8px;font-size:26px;line-height:1; }
.warehouse-metrics small { margin-top:7px;color:#9aa2b1;font-size:11px; }
.control-panel { display:grid;grid-template-columns:minmax(320px,.85fr) minmax(520px,1.35fr);gap:24px;align-items:end;margin-bottom:16px;padding:17px 20px; }
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
.direction-pill { display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #f0c4c7;border-radius:999px;color:var(--crimson);background:#fff7f7;font-size:11px;font-weight:800; }
.direction-pill span { margin:0;color:var(--crimson);font-size:17px; }
.three-stage { position:relative;height:680px;overflow:hidden;background:radial-gradient(circle at 50% 20%,#fff 0%,#eff1f3 70%); }
.three-stage canvas,.three-stage :deep(.label-layer) { position:absolute;inset:0;width:100%;height:100%; }
.three-stage canvas { cursor:grab;touch-action:none; }.three-stage canvas:active { cursor:grabbing; }
.three-stage :deep(.label-layer) { pointer-events:none; }
.three-stage :deep(.part-location-card) { position:relative;min-width:142px;padding:9px 11px;border:1px solid rgba(255,255,255,.86);border-radius:10px;color:#fff;background:linear-gradient(145deg,#087b59,#10a775);box-shadow:0 9px 24px rgba(6,95,67,.32);white-space:nowrap; }
.three-stage :deep(.part-location-card::after) { content:"";position:absolute;left:50%;bottom:-7px;width:13px;height:13px;border-right:1px solid rgba(255,255,255,.72);border-bottom:1px solid rgba(255,255,255,.72);background:#10a775;transform:translateX(-50%) rotate(45deg); }
.three-stage :deep(.part-location-card span),.three-stage :deep(.part-location-card strong),.three-stage :deep(.part-location-card small) { position:relative;z-index:1;display:block; }
.three-stage :deep(.part-location-card span) { color:#ffe29a;font-size:9px;font-weight:900;letter-spacing:.08em; }
.three-stage :deep(.part-location-card strong) { max-width:210px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;font-size:12px; }
.three-stage :deep(.part-location-card small) { margin-top:4px;color:#d9fff2;font-size:10px;font-weight:800; }
.three-stage :deep(.entrance-3d-label) { padding:4px 9px;border:1px solid #8ed8be;border-radius:999px;color:#0c6b4d;background:rgba(239,253,247,.94);box-shadow:0 4px 12px rgba(12,107,77,.16);font-size:10px;font-weight:800;white-space:nowrap; }
.stage-hint { position:absolute;left:16px;bottom:14px;z-index:2;padding:7px 10px;border:1px solid rgba(255,255,255,.65);border-radius:8px;color:#667085;background:rgba(255,255,255,.76);backdrop-filter:blur(8px);font-size:10px;pointer-events:none; }
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
.located-part { flex:none;display:grid;grid-template-columns:37px minmax(0,1fr);gap:10px;margin:12px 12px 0;padding:13px;border:1px solid #bce7da;border-radius:13px;background:#f2fbf8; }
.located-part.is-compact { margin-top:10px;padding:10px 12px;grid-template-columns:34px minmax(0,1fr);gap:8px; }
.located-part.is-compact .located-icon { width:34px;height:34px;border-radius:10px;font-size:17px; }
.located-part.is-compact .location-path { margin-top:1px;padding-top:8px; }
.located-icon { width:37px;height:37px;display:grid;place-items:center;border-radius:11px;color:#fff;background:var(--teal);font-size:19px; }
.located-part span,.located-part strong,.located-part small { display:block; }.located-part span { color:#578578;font-size:9px;font-weight:800; }.located-part strong { margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px; }.located-part small { margin-top:3px;overflow:hidden;text-overflow:ellipsis;color:#71837e;font-size:9px;white-space:nowrap; }
.location-path { grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:3px;padding-top:10px;border-top:1px dashed #b9ddd3; }
.location-path b { padding:4px 5px;border-radius:5px;color:#147355;background:#fff;font-size:9px; }.location-path i { width:10px;height:1px;background:#8ecbbb; }
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
.code-guide > div { display:flex;align-items:center;gap:16px; }.guide-title { color:#687386;font-size:11px;font-weight:800; }.code-guide strong { display:flex;gap:3px; }.code-guide i { padding:7px 8px;border-radius:7px;color:#5f4302;background:#ffe58c;font-size:14px;font-style:normal; }.code-guide i:nth-child(2),.code-guide i:nth-child(4) { color:#075f43;background:#99e8c9; }
.code-guide ol { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0;padding:0;list-style:none; }.code-guide li { padding-left:12px;border-left:2px solid #e1e4e9; }.code-guide b,.code-guide span { display:block; }.code-guide b { font-size:11px; }.code-guide li span { margin-top:3px;color:#8992a1;font-size:9px; }
.editor-preview { display:flex;align-items:center;gap:13px;margin-bottom:18px;padding:14px;border-radius:13px;background:#f7f8fa; }.preview-number { width:52px;height:45px;display:grid;place-items:center;border-radius:10px;color:#fff;background:var(--crimson);font-size:13px;font-weight:900; }.editor-preview strong,.editor-preview small { display:block; }.editor-preview strong { font-size:14px; }.editor-preview small { margin-top:4px;color:#8b94a2;font-size:10px; }.editor-tip { margin:7px 0 0;color:#8a93a4;font-size:10px;line-height:1.6; }
.warehouse-workspace:fullscreen { width:100vw;height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;padding:12px;background:#eef0f3; }
.warehouse-workspace:fullscreen.is-panel-collapsed { grid-template-columns:minmax(0,1fr); }
.warehouse-workspace:fullscreen .model-card,.warehouse-workspace:fullscreen .shelf-panel { height:calc(100vh - 24px);border-radius:14px;background:#fff; }
.warehouse-workspace:fullscreen .three-stage { flex:1;height:auto;min-height:0; }
.warehouse-workspace:fullscreen .model-toolbar { min-height:68px; }
.warehouse-workspace:fullscreen .shelf-panel { min-width:0; }
@media (max-width:1280px) { .control-panel { grid-template-columns:1fr 1fr; }.warehouse-workspace { grid-template-columns:minmax(0,1fr) 310px; }.three-stage { height:610px; }.shelf-panel { height:672px; } }
@media (max-width:980px) { .warehouse-metrics { grid-template-columns:repeat(2,1fr); }.warehouse-workspace { grid-template-columns:1fr; }.three-stage { height:560px; }.shelf-panel { height:auto;max-height:720px; }.shelf-list { max-height:280px; }.code-guide { grid-template-columns:1fr; }.warehouse-workspace:fullscreen { grid-template-columns:minmax(0,1fr) 300px; }.fullscreen-locator { width:240px; }.warehouse-workspace:fullscreen .shelf-panel { height:calc(100vh - 24px);max-height:none; } }
@media (max-width:680px) { .warehouse-hero { align-items:stretch;flex-direction:column;padding:21px; }.warehouse-hero h2 { font-size:24px; }.hero-actions { justify-content:space-between; }.warehouse-metrics { gap:8px; }.warehouse-metrics article { min-height:100px;padding:15px; }.control-panel { grid-template-columns:1fr;padding:14px; }.three-stage { height:440px; }.warehouse-workspace { gap:12px; }.code-guide { padding:15px; }.code-guide > div { align-items:flex-start;flex-direction:column; }.code-guide ol { grid-template-columns:1fr 1fr; }.location-path { overflow-x:auto;justify-content:flex-start; } }
.warehouse-hero{padding:20px 24px}.warehouse-hero h2{font-size:26px}.warehouse-metrics article{min-height:92px;padding:14px 17px}.warehouse-metrics strong{margin-top:6px;font-size:23px}.warehouse-metrics small,.model-title span,.part-option small,.filter-chips button,.stage-hint,.shelf-panel>header>div:first-child span,.panel-tabs button,.located-part span,.located-part small,.location-path b,.shelf-card-top>div span,.selected-shelf-card dt,.selected-shelf-card dd,.shelf-copy strong,.shelf-copy small,.parts-scroll small,.parts-scroll em,.guide-title,.code-guide b,.code-guide li span,.editor-preview small,.editor-tip{font-size:12px}.two-stage{position:relative;height:680px;overflow:hidden;border:12px solid #dfe3e8;background:linear-gradient(#f8fafc,#f1f4f7);box-shadow:inset 0 0 0 2px #fff}.two-stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#d9dee633 1px,transparent 1px),linear-gradient(90deg,#d9dee633 1px,transparent 1px);background-size:28px 28px}.plan-shelf{position:absolute;z-index:2;min-width:76px;display:flex;align-items:center;justify-content:center;gap:5px;padding:6px 9px;border:2px solid color-mix(in srgb,var(--plan-color) 78%,#172033);border-radius:7px;color:#fff;background:var(--plan-color);box-shadow:0 5px 12px #17203322;cursor:pointer;white-space:nowrap}.plan-shelf:hover,.plan-shelf.active{z-index:4;outline:4px solid #f7bd3c66;filter:brightness(1.08)}.plan-shelf.unnamed{background:#718096}.plan-shelf strong{overflow:hidden;text-overflow:ellipsis;font-size:12px}.plan-shelf small{font-size:12px;opacity:.82}.entrance-2d{position:absolute;left:-3px;top:77%;z-index:5;display:flex;align-items:center;gap:4px;padding:8px 12px;border-radius:0 999px 999px 0;color:#fff;background:#13966c;font-size:12px;font-weight:800}.floor-label{position:absolute;left:50%;top:8px;z-index:1;color:#7c8795;font-size:12px;font-weight:800}.east-label{position:absolute;right:12px;top:8px;z-index:1;color:#b21f2a;font-size:13px;font-weight:900}.plan-help{position:absolute;left:14px;bottom:12px;z-index:5;padding:7px 10px;border-radius:8px;color:#667085;background:#ffffffdd;font-size:12px}.layer-map{flex:none;margin:10px 12px 0;padding:10px;border:1px solid #e3e7ed;border-radius:12px;background:#f8fafc}.layer-map-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.layer-map-title strong{font-size:12px}.layer-map-title button{border:0;color:#1677ff;background:transparent;cursor:pointer;font-size:12px}.layer-map>button{width:100%;display:grid;grid-template-columns:42px 1fr 45px;gap:8px;align-items:center;margin-top:5px;padding:7px 8px;border:1px solid transparent;border-radius:8px;color:#566174;background:#fff;cursor:pointer;text-align:left}.layer-map>button i{height:5px;border-radius:4px;background:#d8dde5}.layer-map>button.active,.layer-map>button.located{color:#0f7556;border-color:#a9dfd0;background:#eefaf6}.layer-map>button.active i,.layer-map>button.located i{background:#17a378}.layer-map>button strong{text-align:right}.qr-button{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:5px;margin-top:5px;padding:7px;border:1px dashed #8ccfba;border-radius:8px;color:#0f7556;background:#fff;cursor:pointer;font-size:12px;font-weight:700}.qr-card{display:flex;align-items:center;gap:18px}.qr-card img{width:180px;height:180px;border:1px solid #e3e7ed;border-radius:12px}.qr-card strong,.qr-card span,.qr-card small{display:block}.qr-card span{margin-top:7px;color:#0f7556}.qr-card small{margin-top:8px;color:#758095;line-height:1.7}.warehouse-workspace:fullscreen .two-stage{flex:1;height:auto;min-height:0}@media(max-width:1280px){.two-stage{height:610px}}@media(max-width:980px){.two-stage{height:560px}}@media(max-width:680px){.two-stage{height:440px}.plan-shelf small{display:none}.qr-card{align-items:flex-start;flex-direction:column}.qr-card img{align-self:center}}
</style>

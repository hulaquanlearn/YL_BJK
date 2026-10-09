<template>
  <div class="model-library">
    <div class="library-tabs-wrap">
    <el-tabs v-model="activeTab" class="library-tabs" @tab-change="reloadCurrent">
      <el-tab-pane label="备件模型关联" name="parts">
        <section class="workbench-head panel">
          <div class="workbench-copy"><strong>查找物料</strong></div>
          <div class="search-row">
            <el-select v-model="query.workshopCode" clearable placeholder="全部车间" @change="loadParts"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
            <el-input v-model="query.search" clearable placeholder="搜索编码、名称、规格或类别" @keyup.enter="loadParts" @clear="loadParts"><template #prefix><el-icon><Search /></el-icon></template></el-input>
            <el-button type="primary" @click="loadParts">搜索</el-button>
          </div>
        </section>

        <section class="summary-row">
          <article><strong>{{ parts.length }}</strong><span>物料种类</span></article>
          <article><strong>{{ withCategoryModel }}</strong><span>备件模型生效</span></article><article><strong>{{ withoutAnyModel }}</strong><span>未绑定 / 待生成</span></article>
        </section>

        <section class="panel result-panel">
          <div class="result-toolbar">
            <div class="filter-tabs">
              <button :class="{active:filter==='all'}" @click="filter='all'">全部 {{ parts.length }}</button>
              <button :class="{active:filter==='category'}" @click="filter='category'">备件模型</button><button :class="{active:filter==='none'}" @click="filter='none'">未关联</button>
            </div>
            <div v-if="$showControl(canEditAny)" class="selection-tools"><el-button v-write size="small" @click="openImportBindings">导入模型名称绑定</el-button><el-button size="small" @click="selectVisible">全选筛选结果</el-button><el-button v-if="selected.size" size="small" @click="selected.clear()">取消选择</el-button></div>
          </div>

          <div v-if="selected.size" class="batch-workbench">
            <div><strong>已选 {{ selected.size }} 种物料</strong><span>选择模型后，统一关联所选物料。</span></div>
            <el-select v-model="batchCategoryId" filterable clearable :filter-method="searchBatchModels" placeholder="搜索并选择备件模型" @visible-change="batchCategorySearch=''" @clear="batchCategorySearch=''"><el-option v-for="item in batchCategoryOptions" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-button v-write type="primary" :disabled="!batchCategoryId" :loading="batchAssigning" @click="assignCategoryModel">关联备件模型</el-button>
            <el-button v-write :loading="batchAssigning" @click="clearCategoryModel">解除模型绑定</el-button>
          </div>

          <div v-loading="loading" class="ml-grid">
            <article v-for="item in pagedParts" :key="item.id" class="ml-card" :class="{selected:selected.has(item.id),readonly:!canEditPart(item)}">
              <el-checkbox v-if="$showControl(canEditPart(item))" :disabled="!canEditPart(item)" class="card-check" :model-value="selected.has(item.id)" @change="toggleSelect(item)" /><span v-else class="readonly-badge">只读</span>
              <div class="model-state" :class="modelState(item).type">{{ modelState(item).label }}</div>
              <div class="ml-card-img"><ModelReferenceImage :src="item.imageUrl||''" :fallback-src="item.categoryImageUrl||''" :model-url="item.categoryModelUrl||''" :alt="item.name"><template #default="{source}"><span class="image-source">{{ item.partImageUrl && source===item.partImageUrl ? '实物图' : '模型参考图' }}</span></template></ModelReferenceImage></div>
              <div class="ml-card-info"><strong :title="item.name">{{ item.name }}</strong><code>{{ item.code }}</code><p>{{ item.spec || '未填写规格' }}</p><p class="category-line">{{ item.categoryName || '未分类' }}<template v-if="item.categoryModelName"> · {{ item.categoryModelName }}</template></p></div>
              <div v-write="canEditPart(item)" v-if="$showControl(canEditPart(item))" class="card-actions">
                <el-button link type="primary" @click="openSingleBinding(item)">绑定 / 更换模型</el-button><el-upload v-write :show-file-list="false" :before-upload="file=>handleSingleUpload(item,file)" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"><el-button link type="primary">{{ item.partImageUrl?'更换实物图':'上传实物图' }}</el-button></el-upload>
              </div>
            </article>
          </div><el-pagination v-if="filteredParts.length" v-model:current-page="modelPage" :page-size="24" :total="filteredParts.length" layout="total, prev, pager, next" class="model-pagination"/><el-empty v-if="!loading&&!filteredParts.length" description="没有符合条件的备件" />
        </section>
      </el-tab-pane>

      <el-tab-pane label="备件模型管理" name="categories">
        <section class="workbench-head panel category-head">
          <div class="workbench-copy"><strong>查找备件模型</strong></div>
          <div class="search-row category-search"><el-input v-model="categorySearch" clearable placeholder="搜索名称、搜索词或说明" @keyup.enter="loadCategoryModels" @clear="loadCategoryModels"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button type="primary" @click="loadCategoryModels">搜索</el-button><el-button v-write="canEditAny" v-if="$showControl(canEditAny)" type="primary" @click="openCategoryDialog()">新增备件模型</el-button></div>
        </section>
        <div v-loading="categoryLoading" class="category-grid">
          <article v-for="item in visibleCategoryModels" :key="item.id" class="category-card">
            <button type="button" class="category-image" :aria-label="`查看${item.name}3D模型`" @click="openPreview(item)"><ModelReferenceImage :src="item.imageUrl||''" :model-url="item.modelUrl" :alt="`${item.name}参考图`" /><b>3D</b></button>
            <div class="category-copy"><strong :title="item.name">{{ item.id }} · {{ item.name }}</strong><p v-if="!item.modelUrl">模型待生成</p><p v-if="item.description">{{ item.description }}</p></div>
            <dl><div><dt>关联物料</dt><dd>{{ item.associatedParts||0 }} 种</dd></div></dl>
            <footer><el-button link type="primary" @click="openPreview(item)">查看3D</el-button><template v-if="$showControl(canMaintainModel(item))"><el-button v-write="canMaintainModel(item)" link type="primary" @click="openCategoryDialog(item)">编辑/替换</el-button><el-button v-write="canMaintainModel(item)" link type="danger" @click="removeCategoryModel(item)">删除</el-button></template></footer>
          </article>
        </div><el-empty v-if="!categoryLoading&&!visibleCategoryModels.length" description="没有找到备件模型" />
      </el-tab-pane>
    </el-tabs>
    <el-button class="library-refresh" :loading="loading || categoryLoading" aria-label="刷新模型库" title="刷新模型库" @click="reloadCurrent"><el-icon><Refresh /></el-icon><span>刷新</span></el-button>
    </div>

    <el-dialog v-model="singleBinding.visible" title="绑定备件模型" width="min(680px,94vw)" append-to-body destroy-on-close>
      <p>{{ singleBinding.part?.name }}</p><PartModelBinding v-model="singleBinding.modelId" :workshop-code="singleBinding.part?.workshopCode" />
      <template #footer><el-button @click="singleBinding.visible=false">取消</el-button><el-button v-write type="primary" :loading="singleBinding.saving" @click="saveSingleBinding">保存绑定</el-button></template>
    </el-dialog>
    <el-dialog v-model="bindingImport.visible" title="导入模型名称绑定" width="min(900px,94vw)" destroy-on-close>
      <p>只读取物料编码和模型名称，不修改库存、价格、库位或备件主信息。模型名称留空保留原绑定。</p>
      <input type="file" accept=".xlsx" @change="chooseBindingFile" />
      <el-alert v-if="bindingImport.plan" :title="`共 ${bindingImport.plan.total} 条，将改变 ${bindingImport.plan.changed} 个绑定；错误 ${bindingImport.plan.errors.length} 条`" :type="bindingImport.plan.errors.length ? 'error' : 'success'" :closable="false" />
      <el-table v-if="bindingImport.plan" :data="bindingImport.plan.errors.length ? bindingImport.plan.errors : bindingImport.plan.items" max-height="360">
        <el-table-column prop="sourceRow" label="行号" width="70"><template #default="{row}">{{ row.sourceRow || row.row }}</template></el-table-column>
        <el-table-column prop="code" label="物料编码" width="150"/><el-table-column prop="previousModelName" label="原模型"/><el-table-column prop="modelName" label="新模型"/><el-table-column prop="reason" label="错误原因"/>
      </el-table>
      <template #footer><el-button @click="bindingImport.visible=false">取消</el-button><el-button :disabled="!bindingImport.file" :loading="bindingImport.loading" @click="checkBindingImport">校验</el-button><el-button v-write type="primary" :disabled="!bindingImport.plan || bindingImport.plan.errors.length>0" :loading="bindingImport.saving" @click="applyBindingImport">导入绑定</el-button></template>
    </el-dialog>
    <el-dialog v-model="categoryDialog.visible" :title="categoryDialog.id?'编辑备件模型':'新增备件模型'" width="min(920px,94vw)" destroy-on-close @closed="resetCategoryDialog">
      <div class="category-editor-layout">
        <el-form label-position="top">
          <el-form-item label="备件模型名称" required><el-input v-model="categoryDialog.name" maxlength="80" show-word-limit /></el-form-item>
          <el-form-item label="搜索关键词（可选）"><el-input v-model="categoryDialog.keywords" placeholder="例如：轴承,bearing；多个关键词用逗号分隔" maxlength="500" /><small>关键词只用于搜索；模型绑定以手动选择或台账模型名称为准。</small></el-form-item>
          <el-form-item label="用途说明"><el-input v-model="categoryDialog.description" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
          <el-form-item label="货位占用缩放"><el-input-number v-model="categoryDialog.modelScale" :min="0.1" :max="5" :step="0.1" /><small>模型始终受单个货位和货架一侧边界限制。</small></el-form-item>
          <el-form-item :label="categoryDialog.id?'替换3D文件（可选）':'3D文件'" ><input class="native-file" type="file" accept=".glb" @change="captureCategoryFile" /><small v-if="categoryDialog.file">已选择：{{ categoryDialog.file.name }}</small><small v-else>{{ categoryDialog.id?'未选择时保留原模型':'可先保存模型名称，之后上传自包含 GLB 2.0，最大50MB' }}</small></el-form-item>
          <el-form-item :label="categoryDialog.id?'替换模型参考图（可选）':'模型参考图'" ><input class="native-file" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp" @change="captureCategoryImage" /><small v-if="categoryDialog.imageFile">已选择：{{ categoryDialog.imageFile.name }}</small><small v-else>{{ categoryDialog.id?'未选择时保留原参考图':'绑定类别后，没有实物图的备件会自动继承此图' }}</small></el-form-item>
        </el-form>
        <section class="front-editor">
          <strong>设置模型正面</strong><p>绿色“正面”标记代表 3D 库位的查看方向。点击左右旋转，保存后货架两侧会自动相向翻转。</p>
          <ModelPreview :model-url="categoryModelPreviewUrl" :front-rotation-y="categoryDialog.frontRotationY" />
          <div class="front-controls"><el-button @click="rotateCategory(-1)">左转 90°</el-button><span>{{ frontDegrees }}°</span><el-button @click="rotateCategory(1)">右转 90°</el-button></div>
          <div v-if="categoryImagePreviewUrl||categoryModelPreviewUrl" class="reference-thumb"><ModelReferenceImage :src="categoryImagePreviewUrl" :model-url="categoryModelPreviewUrl" /><span>模型参考图</span></div>
        </section>
      </div>
      <template #footer><el-button @click="categoryDialog.visible=false">取消</el-button><el-button v-write type="primary" :loading="categoryDialog.saving" @click="saveCategoryModel">保存模型</el-button></template>
    </el-dialog>

    <el-dialog v-model="previewDialog.visible" :title="previewDialog.name" width="min(760px,94vw)" destroy-on-close>
      <ModelPreview :model-url="previewDialog.modelUrl" :front-rotation-y="previewDialog.frontRotationY" height="420px" />
      <div class="preview-caption"><ModelReferenceImage :src="previewDialog.imageUrl" :model-url="previewDialog.modelUrl" :alt="`${previewDialog.name}参考图`" /><div><strong>保存的正面视角</strong><span>可拖动查看其他角度；再次打开仍以已保存正面为初始视角。</span></div></div>
    </el-dialog>

  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Picture, Refresh, Search } from '@element-plus/icons-vue'
import ModelPreview from '../components/ModelPreview.vue'
import ModelReferenceImage from '../components/ModelReferenceImage.vue'
import PartModelBinding from '../components/PartModelBinding.vue'
import { previewModelBindings, importModelBindings, batchAssignPartCategoryModel, createPartCategoryModel, deletePartCategoryModel, getPartCategoryModels, getPartModelLibrary, updatePartCategoryModel, uploadPartImage, } from '../api'
import { canEditWorkshop, canEditAnyWorkshop, isAdmin, getUser, showControl } from '../auth'
import { normalizeModelRotation } from '../utils/model-fit.mjs'
import { prepareCategoryCatalog, searchCategoryCatalog } from '../utils/category-catalog.mjs'

const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const MAX_BATCH_SIZE = 500
const route = useRoute()
const admin = isAdmin()
const currentUser = getUser()
function canMaintainModel(model){return admin || (canEditAnyWorkshop() && model.workshopCode === currentUser?.role)}
const activeTab = ref('parts')
const query = reactive({ workshopCode: '', search: '' })
const parts = ref([])
const loading = ref(false)
const filter = ref('all')
const selected = reactive(new Set())
const canEditAny = canEditAnyWorkshop()
const batchAssigning = ref(false)
const batchCategoryId = ref(null)
const categoryModels = ref([])
const categorySearch = ref('')
const categoryLoading = ref(false)
const batchCategorySearch = ref('')
const batchCategoryOptions = computed(() => searchCategoryCatalog(categoryModels.value,batchCategorySearch.value))
const visibleCategoryModels = computed(() => searchCategoryCatalog(categoryModels.value,categorySearch.value))
function searchBatchModels(text) { batchCategorySearch.value=text }

const withCategoryModel = computed(() => parts.value.filter(item => item.categoryModelId).length)
const withoutAnyModel = computed(() => parts.value.filter(item => !item.categoryModelId).length)
const modelPage = ref(1)
const pagedParts = computed(()=>filteredParts.value.slice((modelPage.value-1)*24,modelPage.value*24))
watch(()=>[query.workshopCode,query.search,filter.value],()=>{modelPage.value=1})
const filteredParts = computed(() => parts.value.filter(item => filter.value === 'category' ? Boolean(item.categoryModelId) : filter.value === 'none' ? !item.categoryModelId : true))

watch(()=>filteredParts.value.length, count=>{modelPage.value=Math.min(modelPage.value,Math.max(1,Math.ceil(count/24)))})

function modelState(item) { return item.categoryModelId ? { type:'category',label:item.categoryModelUrl ? `模型：${item.categoryModelName}` : `待生成：${item.categoryModelName}` } : {type:'generic',label:'未绑定'} }
function canEditPart(item) { return (item.workshopCodes?.length ? item.workshopCodes : [item.workshopCode]).every(canEditWorkshop) }
function modelFilename(url) { return String(url || '').split('/').pop() || '未上传' }
function validateGlb(file) { const name = String(file?.name || ''); if (!name.toLowerCase().endsWith('.glb')) { ElMessage.error('仅支持自包含GLB文件；请先把GLTF及其BIN、贴图导出为GLB'); return false } if (Number(file?.size || 0) > 50 * 1024 * 1024) { ElMessage.error('模型文件超过50MB，请压缩后重新上传'); return false } return true }
function validateImage(file) { const ext = String(file?.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''; if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) { ElMessage.error('仅支持 JPG、PNG、WebP、GIF 或 BMP 图片，不接受 SVG'); return false } return true }

function normalizePartRows(rows) {
  const byId = new Map()
  for (const source of rows || []) {
    const item = { ...source }
    const codes = Array.isArray(item.workshopCodes) ? item.workshopCodes : String(item.workshopCodes || item.workshopCode || '').split(',').filter(Boolean)
    item.workshopCodes = [...new Set(codes)]
    item.partImageUrl = Object.prototype.hasOwnProperty.call(item, 'partImageUrl') ? (item.partImageUrl || null) : (item.imageUrl || null)
    item.imageUrl = item.partImageUrl || item.categoryImageUrl || item.imageUrl || null
    const existing = byId.get(String(item.id))
    if (!existing) byId.set(String(item.id), item)
    else existing.workshopCodes = [...new Set([...existing.workshopCodes, ...item.workshopCodes])]
  }
  return [...byId.values()]
}

async function loadParts() { loading.value = true; try { const result = await getPartModelLibrary({ workshopCode: query.workshopCode, search: query.search }); parts.value = normalizePartRows(result.data); modelPage.value=1; selected.clear() } finally { loading.value = false } }
async function loadCategoryModels() { categoryLoading.value = true; try { const result = await getPartCategoryModels(); categoryModels.value = prepareCategoryCatalog(result.data || []) } finally { categoryLoading.value = false } }
async function reloadCurrent() { if (activeTab.value === 'categories') await loadCategoryModels(); else await Promise.all([loadParts(), loadCategoryModels()]) }
function toggleSelect(item) { if (canEditPart(item)) selected.has(item.id) ? selected.delete(item.id) : selected.add(item.id) }
function selectVisible() { for (const item of filteredParts.value) if (canEditPart(item)) selected.add(item.id); if (!selected.size) ElMessage.warning('当前结果没有可修改的备件') }

async function runBatches(ids, action, label) {
  const batches = []
  for (let index = 0; index < ids.length; index += MAX_BATCH_SIZE) batches.push(ids.slice(index, index + MAX_BATCH_SIZE))
  let completed = 0
  for (const batch of batches) {
    try { await action(batch); completed += batch.length }
    catch (error) { ElMessage.error(`${label}仅完成 ${completed}/${ids.length} 种物料：${error?.response?.data?.msg || error?.message || '请求失败'}`); throw error }
  }
  ElMessage.success(`${label}完成：${completed} 种物料${batches.length > 1 ? `，共 ${batches.length} 批` : ''}`)
}

async function handleSingleUpload(item, file) { if (!validateImage(file)) return false; const data = new FormData(); data.append('image', file); const result = await uploadPartImage(item.id, data); item.partImageUrl = result.data.imageUrl; item.imageUrl = result.data.imageUrl; ElMessage.success('实物图片已上传，将优先于模型参考图显示'); return false }


async function assignCategoryModel() { const ids = [...selected]; if (!ids.length || !batchCategoryId.value) return; batchAssigning.value = true; try { await runBatches(ids, batch => batchAssignPartCategoryModel({ partIds: batch, categoryModelId: batchCategoryId.value }), '模型绑定'); await Promise.all([loadParts(),loadCategoryModels()]) } finally { batchAssigning.value = false } }
async function clearCategoryModel() { const ids = [...selected]; if (!ids.length) return; batchAssigning.value = true; try { await runBatches(ids, batch => batchAssignPartCategoryModel({ partIds: batch, categoryModelId: null }), '模型绑定清除'); await Promise.all([loadParts(),loadCategoryModels()]) } finally { batchAssigning.value = false } }

const singleBinding=reactive({visible:false,saving:false,part:null,modelId:null})
function openSingleBinding(part){if(!canEditPart(part))return;Object.assign(singleBinding,{visible:true,part,modelId:part.categoryModelId ? Number(part.categoryModelId) : null})}
async function saveSingleBinding(){singleBinding.saving=true;try{await batchAssignPartCategoryModel({partIds:[singleBinding.part.id],categoryModelId:singleBinding.modelId});singleBinding.visible=false;ElMessage.success('模型绑定已保存');await reloadCurrent()}finally{singleBinding.saving=false}}
const bindingImport=reactive({visible:false,file:null,plan:null,loading:false,saving:false})
function openImportBindings(){Object.assign(bindingImport,{visible:true,file:null,plan:null})}
function chooseBindingFile(event){bindingImport.file=event.target.files?.[0]||null;bindingImport.plan=null}
function bindingImportData(){const data=new FormData();data.append('file',bindingImport.file);return data}
async function checkBindingImport(){bindingImport.loading=true;try{const result=await previewModelBindings(bindingImportData());bindingImport.plan=result.data}finally{bindingImport.loading=false}}
async function applyBindingImport(){if(!bindingImport.plan || bindingImport.plan.errors.length)return;bindingImport.saving=true;try{const result=await importModelBindings(bindingImportData());ElMessage.success(result.msg);bindingImport.visible=false;await reloadCurrent()}finally{bindingImport.saving=false}}
const categoryDialog = reactive({ visible: false, saving: false, id: null, name: '', keywords: '', description: '', modelScale: 1, frontRotationY: 0, file: null, imageFile: null, currentModelUrl: '', currentImageUrl: '', modelObjectUrl: '', imageObjectUrl: '' })
const categoryModelPreviewUrl = computed(() => categoryDialog.modelObjectUrl || categoryDialog.currentModelUrl)
const categoryImagePreviewUrl = computed(() => categoryDialog.imageObjectUrl || categoryDialog.currentImageUrl)
const frontDegrees = computed(() => Math.round(normalizeModelRotation(categoryDialog.frontRotationY) * 180 / Math.PI))
function revokeObjectUrls() { if (categoryDialog.modelObjectUrl) URL.revokeObjectURL(categoryDialog.modelObjectUrl); if (categoryDialog.imageObjectUrl) URL.revokeObjectURL(categoryDialog.imageObjectUrl) }
function resetCategoryDialog() { revokeObjectUrls(); Object.assign(categoryDialog, { saving: false, id: null, name: '', keywords: '', description: '', modelScale: 1, frontRotationY: 0, file: null, imageFile: null, currentModelUrl: '', currentImageUrl: '', modelObjectUrl: '', imageObjectUrl: '' }) }
function openCategoryDialog(item = null) { resetCategoryDialog(); if (item) Object.assign(categoryDialog, { id: item.id, name: item.name, keywords: item.keywords || '', description: item.description || '', modelScale: Number(item.modelScale) || 1, frontRotationY: Number(item.frontRotationY) || 0, currentModelUrl: item.modelUrl || '', currentImageUrl: item.imageUrl || '' }); categoryDialog.visible = true }
function captureCategoryFile(event) { const file = event.target.files?.[0] || null; if (file && !validateGlb(file)) { event.target.value = ''; return } if (categoryDialog.modelObjectUrl) URL.revokeObjectURL(categoryDialog.modelObjectUrl); categoryDialog.file = file; categoryDialog.modelObjectUrl = file ? URL.createObjectURL(file) : '' }
function captureCategoryImage(event) { const file = event.target.files?.[0] || null; if (file && !validateImage(file)) { event.target.value = ''; return } if (categoryDialog.imageObjectUrl) URL.revokeObjectURL(categoryDialog.imageObjectUrl); categoryDialog.imageFile = file; categoryDialog.imageObjectUrl = file ? URL.createObjectURL(file) : '' }
function rotateCategory(direction) { categoryDialog.frontRotationY = normalizeModelRotation(categoryDialog.frontRotationY + direction * Math.PI / 2) }
async function saveCategoryModel() { if (!categoryDialog.name.trim()) return ElMessage.warning('请填写备件模型名称'); categoryDialog.saving = true; try { const data = new FormData(); data.append('name', categoryDialog.name.trim()); data.append('keywords', categoryDialog.keywords); data.append('description', categoryDialog.description); data.append('modelScale', String(categoryDialog.modelScale)); data.append('frontRotationY', String(normalizeModelRotation(categoryDialog.frontRotationY))); if (categoryDialog.file) data.append('model', categoryDialog.file); if (categoryDialog.imageFile) data.append('image', categoryDialog.imageFile); if (categoryDialog.id) await updatePartCategoryModel(categoryDialog.id, data); else await createPartCategoryModel(data); categoryDialog.visible = false; ElMessage.success('备件模型、参考图和正面设置已保存'); await loadCategoryModels() } finally { categoryDialog.saving = false } }
async function removeCategoryModel(item) { try { await ElMessageBox.confirm(`删除备件模型“${item.name}”后，关联物料将解除绑定；物料自己的实物图不会删除。`, '删除备件模型', { type: 'warning' }); await deletePartCategoryModel(item.id); ElMessage.success('备件模型已删除'); await Promise.all([loadCategoryModels(), loadParts()]) } catch { /* cancel */ } }

const previewDialog = reactive({ visible: false, name: '', modelUrl: '', imageUrl: '', frontRotationY: 0 })
function openPreview(item) { Object.assign(previewDialog, { visible: true, name: item.name, modelUrl: item.modelUrl, imageUrl: item.imageUrl || '', frontRotationY: Number(item.frontRotationY) || 0 }) }

onMounted(async () => { query.workshopCode = String(route.query.workshopCode || ''); query.search = String(route.query.search || ''); await Promise.all([loadParts(), loadCategoryModels()]) })
</script>

<style scoped>
.model-library{padding:18px 22px}.library-tabs-wrap{position:relative}.library-tabs:deep(.el-tabs__header){margin-bottom:14px;padding-right:90px}.library-refresh{position:absolute;right:0;top:0;z-index:2}.library-refresh span{margin-left:4px}.workbench-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;padding:16px 18px}.workbench-copy strong,.workbench-copy span{display:block}.workbench-copy span{margin-top:4px;color:#687386;font-size:12px}.search-row{display:grid;grid-template-columns:150px minmax(260px,380px) auto;gap:8px}.category-search{grid-template-columns:minmax(260px,420px) auto auto}.summary-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.summary-row article{padding:14px;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(23,32,51,.06);text-align:center}.summary-row strong,.summary-row span{display:block}.summary-row strong{font-size:25px}.summary-row span{margin-top:2px;color:#687386;font-size:12px}.result-panel{padding:14px}.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.filter-tabs,.selection-tools{display:flex;gap:6px}.filter-tabs button{padding:7px 13px;border:1px solid #dfe4ec;border-radius:8px;color:#586274;background:#fff;cursor:pointer}.filter-tabs button.active{border-color:#2563eb;color:#fff;background:#2563eb}.batch-workbench{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:12px 14px;border:1px solid #b9d9f8;border-radius:10px;background:#f2f8ff}.batch-workbench>div{margin-right:auto}.batch-workbench strong,.batch-workbench span{display:block}.batch-workbench span{margin-top:2px;color:#667085;font-size:11px}.batch-workbench .el-select{width:190px}.ml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.ml-card{position:relative;overflow:hidden;border:1px solid #e1e6ed;border-radius:12px;background:#fff}.ml-card.selected{border-color:#2563eb;box-shadow:0 0 0 3px #2563eb22}.card-check{position:absolute;right:8px;top:8px;z-index:3}.readonly-badge{position:absolute;right:8px;top:8px;z-index:3;padding:2px 7px;border-radius:999px;color:#687386;background:#eef1f4;font-size:10px}.model-state{position:absolute;left:8px;top:8px;z-index:3;max-width:calc(100% - 58px);overflow:hidden;padding:3px 8px;border-radius:999px;color:#fff;font-size:10px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.model-state.category{background:#2563eb}.model-state.generic{background:#7a8493}.ml-card-img{position:relative;height:128px;display:flex;align-items:center;justify-content:center;background:#f7f9fc}.ml-card-img img{width:100%;height:100%;object-fit:contain}.image-source{position:absolute;right:7px;bottom:7px;padding:2px 7px;border-radius:999px;color:#42526a;background:#ffffffe8;font-size:10px}.no-img{display:grid;place-items:center;gap:5px;color:#9aa4b3;font-size:11px}.no-img .el-icon{font-size:34px}.ml-card-info{padding:11px 12px}.ml-card-info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ml-card-info code{display:inline-block;margin-top:4px;padding:2px 5px;border-radius:4px;color:#2563eb;background:#eef5ff;font-size:11px}.ml-card-info p{margin:5px 0 0;overflow:hidden;color:#6c7687;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.category-line{color:#2563eb!important}.card-actions{display:flex;align-items:center;justify-content:center;gap:5px;min-height:38px;padding:6px 9px;border-top:1px solid #edf0f4;flex-wrap:wrap}.category-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.category-card{display:grid;grid-template-columns:108px minmax(0,1fr);overflow:hidden;border:1px solid #dce3eb;border-radius:14px;background:#fff}.category-image{position:relative;grid-row:1/3;min-height:150px;padding:0;border:0;border-right:1px solid #edf0f4;background:#f5f8fc;cursor:pointer}.category-image img{width:100%;height:100%;min-height:150px;object-fit:contain}.category-image>span{display:grid;place-items:center;gap:6px;height:100%;color:#9aa4b3;font-size:11px}.category-image .el-icon{font-size:28px}.category-image b{position:absolute;left:7px;top:7px;padding:2px 7px;border-radius:999px;color:#fff;background:#168361;font-size:10px}.category-copy{min-width:0;padding:12px 12px 7px}.category-copy strong,.category-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.category-copy small{margin-top:3px;color:#8791a0;font-size:10px}.category-copy p{height:32px;margin:7px 0 0;overflow:hidden;color:#667085;font-size:11px;line-height:1.45}.category-card dl{grid-column:2;display:grid;grid-template-columns:1.3fr .8fr .8fr;margin:0;padding:0 12px 10px}.category-card dl div{min-width:0}.category-card dt{color:#8791a0;font-size:9px}.category-card dd{margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:700}.category-card footer{grid-column:1/3;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:7px 10px;border-top:1px solid #edf0f4}.category-card footer>:first-child{margin-right:auto}.dialog-tip{margin:0 0 18px;color:#687386}.native-file{width:100%;padding:8px;border:1px dashed #c9d1dc;border-radius:8px}.el-form-item small{display:block;margin-top:6px;color:#687386}.category-editor-layout{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(360px,1.2fr);gap:22px}.front-editor>strong{display:block;font-size:14px}.front-editor>p{margin:5px 0 10px;color:#687386;font-size:11px;line-height:1.5}.front-controls{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:9px}.front-controls span{min-width:52px;text-align:center;font-weight:700}.reference-thumb{display:flex;align-items:center;gap:9px;margin-top:10px;padding:7px;border:1px solid #e4e9ef;border-radius:10px}.reference-thumb img{width:54px;height:42px;object-fit:contain}.reference-thumb span{color:#687386;font-size:11px}.preview-caption{display:flex;align-items:center;gap:12px;margin-top:12px}.preview-caption img{width:88px;height:66px;border:1px solid #e1e6ed;border-radius:8px;object-fit:contain}.preview-caption strong,.preview-caption span{display:block}.preview-caption span{margin-top:3px;color:#687386;font-size:11px}@media(max-width:1000px){.workbench-head{align-items:stretch;flex-direction:column}.search-row,.category-search{width:100%}.summary-row{grid-template-columns:repeat(2,1fr)}.batch-workbench{align-items:stretch;flex-wrap:wrap}.category-editor-layout{grid-template-columns:1fr}}@media(max-width:680px){.search-row,.category-search{grid-template-columns:1fr}.result-toolbar{align-items:flex-start;flex-direction:column}.filter-tabs{flex-wrap:wrap}.summary-row{grid-template-columns:1fr 1fr}.category-grid{grid-template-columns:1fr}.category-card{grid-template-columns:94px minmax(0,1fr)}}
</style>

<style scoped>
.summary-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:0;overflow:hidden;border:1px solid #e3e8ee;border-radius:13px;background:#fff}
.summary-row article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 22px;border-radius:0;background:transparent;box-shadow:none;text-align:left}
.summary-row article+article{border-left:1px solid #edf0f4}.summary-row article span{order:-1;margin:0;color:#687386;font-size:13px}.summary-row article strong{font-size:27px;line-height:1.2;font-variant-numeric:tabular-nums}.summary-row article:nth-child(2) strong{color:#158164}.summary-row article:nth-child(3) strong{color:#b47716}
.selection-tools{flex-wrap:wrap;justify-content:flex-end}.selection-tools .el-button{margin:0}.batch-workbench .el-select{width:230px;flex-shrink:0}
.category-image{height:168px;min-height:168px}.reference-thumb>.reference-image{flex:none;width:54px;height:42px}.preview-caption>.reference-image{flex:none;width:88px;height:66px;border:1px solid #e1e6ed;border-radius:8px}
@media(max-width:680px){.model-library{padding:12px}.summary-row{grid-template-columns:repeat(3,minmax(0,1fr))}.summary-row article{align-items:flex-start;flex-direction:column;gap:7px;padding:13px 10px}.summary-row article span{font-size:11px}.summary-row article strong{font-size:23px}.selection-tools{justify-content:flex-start}.batch-workbench .el-select{width:100%}}
</style>

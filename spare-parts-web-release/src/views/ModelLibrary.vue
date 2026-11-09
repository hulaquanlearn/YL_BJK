<template>
  <div class="model-library">
    <div class="library-tabs-wrap">
    <el-tabs v-model="activeTab" class="library-tabs" @tab-change="reloadCurrent">
      <el-tab-pane label="物料绑定" name="parts">
        <section class="workbench-head panel">

          <div class="search-row">
            <el-select v-model="query.workshopCode" clearable placeholder="全部车间" @change="loadParts"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
            <el-input v-model="query.search" clearable placeholder="搜索编码、名称、规格或类别" @keyup.enter="loadParts" @clear="loadParts"><template #prefix><el-icon><Search /></el-icon></template></el-input>
            <el-button @click="loadParts">查询</el-button>
          </div>
        </section>

        <section class="panel result-panel">
          <div class="result-toolbar">
            <div class="filter-tabs">
              <button :class="{active:filter==='all'}" @click="filter='all'">全部 {{ parts.length }}</button>
              <button :class="{active:filter==='category'}" @click="filter='category'">已绑定 {{ withCategoryModel }}</button><button :class="{active:filter==='none'}" @click="filter='none'">未绑定 / 待生成 {{ withoutAnyModel }}</button>
            </div>
            <div v-if="$showControl(canEditAny)" class="selection-tools"><el-button text size="small" @click="selectVisible">全选筛选结果</el-button><el-button v-if="selected.size" text size="small" @click="selected.clear()">取消选择</el-button><ActionMenu :disabled="!canEditAny" aria-label="模型绑定更多操作" :items="[{key:'import',label:'导入模型名称绑定'}]" @select="openImportBindings"/></div>
          </div>

          <div v-if="selected.size" class="batch-workbench">
            <div><strong>已选 {{ selected.size }} 种物料</strong></div>
            <el-select v-model="batchCategoryId" filterable clearable :filter-method="searchBatchModels" placeholder="搜索并选择备件模型" @visible-change="batchCategorySearch=''" @clear="batchCategorySearch=''"><el-option v-for="item in batchCategoryOptions" :key="item.id" :label="`${item.name} · ${modelDisplayStatus(item).label}`" :value="item.id" /></el-select><p v-if="batchSelectedModel" class="batch-model-status" role="status">{{ modelDisplayStatus(batchSelectedModel).description }}</p>
            <el-button v-write type="primary" :disabled="!batchCategoryId" :loading="batchAssigning" @click="assignCategoryModel">关联备件模型</el-button>
            <el-button v-write :loading="batchAssigning" @click="clearCategoryModel">解除模型绑定</el-button>
          </div>

          <el-tag v-if="bindingModelFilter" closable class="binding-filter" @close="bindingModelFilter=null">模型：{{ categoryModels.find(m=>Number(m.id)===Number(bindingModelFilter))?.name }}</el-tag>
          <el-alert v-if="partsError" :title="partsError" type="error" :closable="false"><el-button link @click="loadParts">重新加载</el-button></el-alert>
          <div v-loading="loading" class="binding-list">
            <article v-for="item in pagedParts" :key="item.id" class="ml-card" :class="{selected:selected.has(item.id),readonly:!canEditPart(item)}">
              <div class="binding-selection"><el-checkbox v-if="$showControl(canEditPart(item))" :disabled="!canEditPart(item)" :aria-label="`选择${item.code}`" :model-value="selected.has(item.id)" @change="toggleSelect(item)" /></div>
              <header class="part-card-heading"><strong :title="item.name">{{ item.name }}</strong><code>{{ item.code }}</code></header>
              <div class="binding-visuals">
                <button v-if="displayedPartModel(item)" class="binding-visual model-visual" type="button" :aria-label="`查看${item.name}${partModelNeedsReview(item) ? '待核对外形预览' : '三维模型'}`" @click="openPartPreview(item)">
                  <span class="visual-title">{{ partModelNeedsReview(item) ? '待核对外形预览' : partModelReviewed(item) ? '已核对模型' : '3D 示意模型' }}</span>
                  <ModelThumbnail class="binding-thumbnail" :model-url="displayedPartModel(item)" :front-rotation-y="Number(item.categoryFrontRotationY)||0" :alt="`${item.name}三维模型缩略图`" />
                  <small v-if="partModelNeedsReview(item)" class="visual-review">{{ partModelStatus(item).label }}</small>
                </button>
                <div v-else class="binding-visual model-visual"><span class="visual-title">3D 示意模型</span><div class="visual-empty"><el-icon><Box /></el-icon><span>{{ item.categoryModelId ? '缺少三维文件' : '尚未绑定模型' }}</span></div></div>
                <button v-if="item.partImageUrl" class="binding-visual photo-visual" type="button" :aria-label="failedPhotos.has(item.partImageUrl) ? `重试${item.name}实物照片` : `放大${item.name}实物照片`" @click="failedPhotos.has(item.partImageUrl) ? failedPhotos.delete(item.partImageUrl) : openPhoto(item)">
                  <span class="visual-title">实物照片</span><img v-if="!failedPhotos.has(item.partImageUrl)" :src="item.partImageUrl" :alt="`${item.name}实物照片`" loading="lazy" @error="failedPhotos.add(item.partImageUrl)" /><span v-else class="visual-empty"><el-icon><Camera /></el-icon><span>照片加载失败<br />点击重试</span></span>
                </button>
                <div v-else class="binding-visual photo-visual"><span class="visual-title">实物照片</span><div class="visual-empty"><el-icon><Camera /></el-icon><span>尚未上传实物图</span></div></div>
              </div>
              <div class="binding-model"><strong :title="item.categoryModelName || ''">{{ item.categoryModelName || '尚未绑定模型' }}</strong><small v-if="partModelNeedsReview(item)" class="binding-review">{{ partModelStatus(item).label }}</small><small v-else-if="partModelReviewed(item)">人工核对通过</small><small v-else-if="item.categoryModelId&&!displayedPartModel(item)">缺少三维文件</small><p class="binding-spec" :title="item.spec || ''">{{ item.spec || '规格型号未填写' }}</p></div>

              <div v-write="canEditPart(item)" v-if="$showControl(canEditPart(item))" class="card-actions">
                <el-button link type="primary" @click="openSingleBinding(item)">{{ item.categoryModelId ? '更换模型' : '绑定模型' }}</el-button><el-upload v-write :show-file-list="false" :before-upload="file=>handleSingleUpload(item,file)" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp"><el-button link type="primary">{{ item.partImageUrl?'更换照片':'上传实物图' }}</el-button></el-upload>
              </div>
            </article>
          </div><el-pagination v-if="filteredParts.length" v-model:current-page="modelPage" :page-size="24" :total="filteredParts.length" layout="total, prev, pager, next" class="model-pagination"/><el-empty v-if="!loading&&!partsError&&!filteredParts.length" description="没有符合条件的备件" />
        </section>
      </el-tab-pane>

      <el-tab-pane label="模型展示台" name="categories">
        <section class="workbench-head panel category-head">

          <div class="search-row category-search"><el-input v-model="categorySearch" clearable placeholder="搜索名称、搜索词或说明" @keyup.enter="loadCategoryModels" @clear="loadCategoryModels"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button @click="loadCategoryModels">查询</el-button><el-button v-write="canEditAny" v-if="$showControl(canEditAny)" type="primary" @click="openCategoryDialog()">新增备件模型</el-button></div>
        </section>
        <el-alert v-if="categoryError" :title="categoryError" type="error" :closable="false"><el-button link @click="loadCategoryModels">重新加载</el-button></el-alert><el-alert v-if="catalogPartsError" :title="catalogPartsError" type="warning" :closable="false"><el-button link @click="loadCatalogParts">重新加载关联备件</el-button></el-alert>
        <div v-loading="categoryLoading"><ModelCatalogShowroom v-if="activeTab==='categories'" :models="visibleCategoryModels" :parts="catalogParts" :can-maintain="canMaintainModel" :can-remove="!admin" @edit="openCategoryDialog" @bindings="showModelBindings" @remove="removeCategoryModel" @reviewed="modelsReviewed" /></div><el-empty v-if="!categoryLoading&&!categoryError&&!visibleCategoryModels.length" description="没有找到备件模型" />
      </el-tab-pane>
    </el-tabs>
    <el-button class="library-refresh" :loading="loading || categoryLoading" aria-label="刷新模型库" title="刷新模型库" @click="reloadCurrent"><el-icon><Refresh /></el-icon><span>刷新模型库</span></el-button>
    </div>

    <el-dialog v-model="singleBinding.visible" title="绑定备件模型" width="min(680px,94vw)" append-to-body destroy-on-close>
      <p>{{ singleBinding.part?.name }}</p><PartModelBinding v-model="singleBinding.modelId" :workshop-code="singleBinding.part?.workshopCode" />
      <template #footer><el-button @click="singleBinding.visible=false">取消</el-button><el-button v-write type="primary" :loading="singleBinding.saving" @click="saveSingleBinding">保存绑定</el-button></template>
    </el-dialog>
    <el-dialog v-model="bindingImport.visible" title="导入模型名称绑定" class="binding-import-dialog ledger-entry-dialog" width="min(820px,96vw)" destroy-on-close>
      <p>只更新模型绑定；模型名称留空保留原绑定。</p>
      <div class="binding-import-tools"><el-button class="binding-template-download template-download" :loading="bindingTemplateLoading" @click="downloadBindingTemplate"><el-icon><Download /></el-icon>下载导入模板</el-button><el-button link class="model-name-link" @click="bindingImport.visible=false;activeTab='categories';reloadCurrent()">查看模型名称 <el-icon><ArrowRight /></el-icon></el-button></div>
      <el-upload class="ledger-upload" v-write drag :auto-upload="false" :limit="1" accept=".xlsx" :on-change="file=>{bindingImport.file=file.raw;bindingImport.plan=null}" :on-remove="()=>{bindingImport.file=null;bindingImport.plan=null}"><WorkbookUploadMark /><div class="el-upload__text">拖入 .xlsx 文件，或<em>点击选择</em></div></el-upload>
      <details v-if="!bindingImport.plan" class="import-field-details"><summary>填写示例</summary><table class="import-example"><caption class="visually-hidden">模型绑定填写示例</caption><thead><tr><th>物料编码</th><th>模型名称</th></tr></thead><tbody><tr><td>502000268</td><td>微型断路器1P</td></tr><tr><td>502000300</td><td>交流接触器</td></tr></tbody></table></details>
      <el-alert v-if="bindingImport.plan" :title="`共 ${bindingImport.plan.total} 条，将改变 ${bindingImport.plan.changed} 个绑定；错误 ${bindingImport.plan.errors.length} 条`" :type="bindingImport.plan.errors.length ? 'error' : 'success'" :closable="false" />
      <el-table v-if="bindingImport.plan" :data="bindingImport.plan.errors.length ? bindingImport.plan.errors : bindingImport.plan.items" max-height="360">
        <el-table-column prop="sourceRow" label="行号" width="70"><template #default="{row}">{{ row.sourceRow || row.row }}</template></el-table-column>
        <el-table-column prop="code" label="物料编码" width="150"/><el-table-column prop="previousModelName" label="原模型"/><el-table-column prop="modelName" label="新模型"/><el-table-column prop="reason" label="错误原因"/>
      </el-table>
      <template #footer><el-button :disabled="bindingImport.loading || bindingImport.saving" @click="bindingImport.visible=false">取消</el-button><el-button v-if="bindingImport.plan && !bindingImport.plan.errors.length" v-write type="primary" :loading="bindingImport.saving" @click="applyBindingImport">确认导入</el-button><el-button v-else type="primary" :disabled="!bindingImport.file" :loading="bindingImport.loading" @click="checkBindingImport">校验文件</el-button></template>
    </el-dialog>
    <el-dialog v-model="categoryDialog.visible" :title="categoryDialog.id?'编辑备件模型':'新增备件模型'" width="min(920px,94vw)" destroy-on-close @closed="resetCategoryDialog">
      <div class="category-editor-layout">
        <el-form label-position="top">
          <el-form-item label="备件模型名称" required><el-input v-model="categoryDialog.name" maxlength="80" show-word-limit /></el-form-item>
          <el-form-item label="搜索关键词（可选）"><el-input v-model="categoryDialog.keywords" placeholder="例如：轴承,bearing；多个关键词用逗号分隔" maxlength="500" /><small>关键词只用于搜索；模型绑定以手动选择或台账模型名称为准。</small></el-form-item>
          <el-form-item label="用途说明"><el-input v-model="categoryDialog.description" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
          <el-form-item label="货位占用缩放"><el-input-number v-model="categoryDialog.modelScale" :min="0.1" :max="5" :step="0.1" /><small>模型始终受单个货位和货架一侧边界限制。</small></el-form-item>
          <el-form-item :label="categoryDialog.id?'替换3D文件（可选）':'3D文件'" ><input class="native-file" type="file" accept=".glb" @change="captureCategoryFile" /><small v-if="categoryDialog.file">已选择：{{ categoryDialog.file.name }}</small><small v-else>{{ categoryDialog.id?'未选择时保留原模型':'可先保存模型名称，之后上传自包含 GLB 2.0，最大50MB' }}</small></el-form-item>
          <el-form-item :label="categoryDialog.id?'替换模型参考图（可选）':'模型参考图'" ><input class="native-file" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp" @change="captureCategoryImage" /><small v-if="categoryDialog.imageFile">已选择：{{ categoryDialog.imageFile.name }}</small><small v-else>{{ categoryDialog.id?'未选择时保留原参考图':'用于模型参考展示；实物照片需单独上传' }}</small></el-form-item>
        </el-form>
        <section class="front-editor">
          <strong>设置模型正面</strong><p>预览以当前正面方向复位。点击下方左右转90°调整，保存后货架两侧会自动相向翻转。</p>
          <p v-if="modelDisplayStatus(categoryModelPreviewUrl).key==='pending' && !categoryReviewActive" class="binding-review">{{ modelDisplayStatus(categoryModelPreviewUrl).description }}<el-button v-if="!categoryDialog.inspectLegacy" link @click="categoryDialog.inspectLegacy=true">预览当前外形</el-button></p>
          <ModelPreview :model-url="categoryModelPreviewUrl" :front-rotation-y="categoryDialog.frontRotationY" :allow-unreviewed="categoryDialog.inspectLegacy || categoryReviewActive" object-only />
          <div class="front-controls"><el-button @click="rotateCategory(-1)">左转 90°</el-button><span>{{ frontDegrees }}°</span><el-button @click="rotateCategory(1)">右转 90°</el-button></div>
          <div v-if="categoryImagePreviewUrl || referenceImageForModel(categoryModelPreviewUrl)" class="reference-thumb"><ModelReferenceImage :src="categoryImagePreviewUrl" :model-url="categoryModelPreviewUrl" zoomable /><span>模型参考图</span></div>
        </section>
      </div>
      <template #footer><el-button @click="categoryDialog.visible=false">取消</el-button><el-button v-write type="primary" :loading="categoryDialog.saving" @click="saveCategoryModel">保存模型</el-button></template>
    </el-dialog>

    <el-dialog v-model="photoDialog.visible" :title="photoDialog.name" width="min(900px,94vw)" destroy-on-close>
      <el-image class="photo-enlarged" :src="photoDialog.url" fit="contain" :preview-src-list="[photoDialog.url]" preview-teleported><template #error><span>照片无法加载，请关闭后重新加载。</span></template></el-image>
    </el-dialog>
    <el-dialog v-model="previewDialog.visible" :title="previewDialog.name" width="min(760px,94vw)" destroy-on-close>
      <p v-if="previewDialog.requiresReview" class="binding-review">当前外形待核对，仅供对照查看；预览不会改变核对结论。</p>
      <ModelPreview :model-url="previewDialog.modelUrl" :front-rotation-y="previewDialog.frontRotationY" :allow-unreviewed="previewDialog.requiresReview || previewDialog.reviewed" object-only height="420px" />
      <p>拖动可查看底面，滚轮或双指缩放。</p>
      <div v-if="previewDialog.imageUrl || referenceImageForModel(previewDialog.modelUrl)" class="preview-caption"><ModelReferenceImage :src="previewDialog.imageUrl" :model-url="previewDialog.modelUrl" :alt="`${previewDialog.name}参考图`" zoomable /><strong>模型参考图</strong></div>
    </el-dialog>

  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import WorkbookUploadMark from '../components/WorkbookUploadMark.vue'
import ActionMenu from '../components/ActionMenu.vue'
import { Refresh, Search, Box, Camera, Download, ArrowRight } from '@element-plus/icons-vue'
import ModelCatalogShowroom from '../components/ModelCatalogShowroom.vue'
import ModelPreview from '../components/ModelPreview.vue'
import ModelThumbnail from '../components/ModelThumbnail.vue'
import ModelReferenceImage from '../components/ModelReferenceImage.vue'
import PartModelBinding from '../components/PartModelBinding.vue'
import { downloadModelBindingsTemplate, previewModelBindings, importModelBindings, batchAssignPartCategoryModel, createPartCategoryModel, deletePartCategoryModel, getPartCategoryModels, getPartModelLibrary, updatePartCategoryModel, uploadPartImage, } from '../api'
import { canEditWorkshop, canEditAnyWorkshop, isAdmin, getUser, showControl } from '../auth'
import { displayedPartModel, partModelReviewed, partModelNeedsReview, partModelStatus, partPhotoUrl } from '../utils/bound-part-model.mjs'
import { modelReviewConfirmed } from '../utils/model-review.mjs'
import {modelDisplayStatus} from '../utils/model-display-status.mjs'
import {modelRequestFailure} from '../utils/model-request-failure.mjs'
import { normalizeModelRotation } from '../utils/model-fit.mjs'
import { prepareCategoryCatalog, searchCategoryCatalog, referenceImageForModel } from '../utils/category-catalog.mjs'

const workshops = [{ code: 'raw_grain', name: '原粮车间' }, { code: 'qu_making', name: '制曲车间' }, { code: 'brewing', name: '酿酒车间' }]
const MAX_BATCH_SIZE = 500
const route = useRoute()
const admin = isAdmin()
const currentUser = getUser()
function canMaintainModel(model){return admin || (canEditAnyWorkshop() && model.workshopCode === currentUser?.role)}
const activeTab = ref('parts')
const query = reactive({ workshopCode: '', search: '' })
const parts = ref([])
const catalogParts = ref([]), bindingModelFilter=ref(null)
const loading = ref(false)
const partsError=ref(''),categoryError=ref(''),catalogPartsError=ref('')
let partsRequest=0,categoryRequest=0,catalogPartsRequest=0,catalogGeneration=0
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
const batchSelectedModel=computed(()=>categoryModels.value.find(model=>Number(model.id)===Number(batchCategoryId.value)))
const visibleCategoryModels = computed(() => searchCategoryCatalog(categoryModels.value,categorySearch.value))
function searchBatchModels(text) { batchCategorySearch.value=text }

const withCategoryModel = computed(() => parts.value.filter(item => item.categoryModelId && item.categoryModelUrl).length)
const withoutAnyModel = computed(() => parts.value.filter(item => !item.categoryModelId || !item.categoryModelUrl).length)
const modelPage = ref(1)
const pagedParts = computed(()=>filteredParts.value.slice((modelPage.value-1)*24,modelPage.value*24))
watch(()=>[query.workshopCode,query.search,filter.value],()=>{modelPage.value=1})
const filteredParts = computed(() => parts.value.filter(item => (!bindingModelFilter.value || Number(item.categoryModelId)===Number(bindingModelFilter.value)) && (filter.value === 'category' ? Boolean(item.categoryModelId && item.categoryModelUrl) : filter.value === 'none' ? (!item.categoryModelId || !item.categoryModelUrl) : true)))

watch(()=>filteredParts.value.length, count=>{modelPage.value=Math.min(modelPage.value,Math.max(1,Math.ceil(count/24)))})


function canEditPart(item) { return (item.workshopCodes?.length ? item.workshopCodes : [item.workshopCode]).every(canEditWorkshop) }

function validateGlb(file) { const name = String(file?.name || ''); if (!name.toLowerCase().endsWith('.glb')) { ElMessage.error('仅支持自包含GLB文件；请先把GLTF及其BIN、贴图导出为GLB'); return false } if (Number(file?.size || 0) > 50 * 1024 * 1024) { ElMessage.error('模型文件超过50MB，请压缩后重新上传'); return false } return true }
function validateImage(file) { const ext = String(file?.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''; if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) { ElMessage.error('仅支持 JPG、PNG、WebP、GIF 或 BMP 图片，不接受 SVG'); return false } return true }

function normalizePartRows(rows) {
  const byId = new Map()
  for (const source of rows || []) {
    const item = { ...source }
    const codes = Array.isArray(item.workshopCodes) ? item.workshopCodes : String(item.workshopCodes || item.workshopCode || '').split(',').filter(Boolean)
    item.workshopCodes = [...new Set(codes)]
    item.partImageUrl = partPhotoUrl(item) || null
    item.imageUrl = item.partImageUrl || item.categoryImageUrl || item.imageUrl || null
    const existing = byId.get(String(item.id))
    if (!existing) byId.set(String(item.id), item)
    else existing.workshopCodes = [...new Set([...existing.workshopCodes, ...item.workshopCodes])]
  }
  return [...byId.values()]
}

async function loadParts() {
  const token=++partsRequest,criteria={workshopCode:query.workshopCode,search:query.search},catalogToken=++catalogGeneration
  const isCurrent=()=>token===partsRequest && criteria.workshopCode===query.workshopCode && criteria.search===query.search
  loading.value=true;partsError.value='';parts.value=[];selected.clear()
  try { const result=await getPartModelLibrary(criteria);if(!isCurrent())return;parts.value=normalizePartRows(result.data);if(!criteria.workshopCode&&!criteria.search&&catalogToken===catalogGeneration){catalogParts.value=parts.value;catalogPartsError.value=''}modelPage.value=1;selected.clear() }
  catch(error){if(isCurrent()){parts.value=[];selected.clear();partsError.value=error?.response?.data?.msg||'备件绑定读取失败，请重新加载'}}
  finally{if(token===partsRequest)loading.value=false}
}
async function loadCatalogParts(){
  const token=++catalogPartsRequest,generation=++catalogGeneration
  let phase='request'
  catalogPartsError.value=''
  try{const result=await getPartModelLibrary({});phase='data';if(token===catalogPartsRequest&&generation===catalogGeneration)catalogParts.value=normalizePartRows(result.data)}
  catch(error){if(token===catalogPartsRequest&&generation===catalogGeneration){catalogParts.value=[];catalogPartsError.value=modelRequestFailure(error,{scope:'associated-parts',label:'关联备件',phase})}}
}
async function showModelBindings(model){bindingModelFilter.value=model.id;filter.value='all';query.workshopCode='';query.search='';activeTab.value='parts';await loadParts()}
async function loadCategoryModels() {
  const token=++categoryRequest
  let phase='request'
  categoryLoading.value=true;categoryError.value=''
  try{const result=await getPartCategoryModels();phase='data';if(token===categoryRequest)categoryModels.value=prepareCategoryCatalog(result.data||[])}
  catch(error){if(token===categoryRequest){categoryModels.value=[];categoryError.value=modelRequestFailure(error,{scope:'model-catalog',label:'模型目录',phase})}}
  finally{if(token===categoryRequest)categoryLoading.value=false}
}
async function reloadCurrent() { if (activeTab.value === 'categories') await Promise.all([loadCategoryModels(),loadCatalogParts()]); else await Promise.all([loadParts(), loadCategoryModels()]) }
async function modelsReviewed(){await Promise.all([loadCategoryModels(),loadCatalogParts(),loadParts()])}
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

async function handleSingleUpload(item, file) { if (!validateImage(file)) return false; const data = new FormData(); data.append('image', file); const result = await uploadPartImage(item.id, data); item.partImageUrl = result.data.imageUrl; item.imageUrl = result.data.imageUrl; ElMessage.success('实物照片已更新'); return false }


async function assignCategoryModel() { const ids = [...selected]; if (!ids.length || !batchCategoryId.value) return; batchAssigning.value = true; try { await runBatches(ids, batch => batchAssignPartCategoryModel({ partIds: batch, categoryModelId: batchCategoryId.value }), '模型绑定'); await Promise.all([loadParts(),loadCategoryModels()]) } finally { batchAssigning.value = false } }
async function clearCategoryModel() { const ids = [...selected]; if (!ids.length) return; batchAssigning.value = true; try { await runBatches(ids, batch => batchAssignPartCategoryModel({ partIds: batch, categoryModelId: null }), '模型绑定清除'); await Promise.all([loadParts(),loadCategoryModels()]) } finally { batchAssigning.value = false } }

const singleBinding=reactive({visible:false,saving:false,part:null,modelId:null})
function openSingleBinding(part){if(!canEditPart(part))return;Object.assign(singleBinding,{visible:true,part,modelId:part.categoryModelId ? Number(part.categoryModelId) : null})}
async function saveSingleBinding(){singleBinding.saving=true;try{await batchAssignPartCategoryModel({partIds:[singleBinding.part.id],categoryModelId:singleBinding.modelId});singleBinding.visible=false;ElMessage.success('模型绑定已保存');await reloadCurrent()}finally{singleBinding.saving=false}}
const bindingImport=reactive({visible:false,file:null,plan:null,loading:false,saving:false})
function openImportBindings(){Object.assign(bindingImport,{visible:true,file:null,plan:null})}

function bindingImportData(){const data=new FormData();data.append('file',bindingImport.file);return data}
async function checkBindingImport(){bindingImport.loading=true;try{const result=await previewModelBindings(bindingImportData());bindingImport.plan=result.data}finally{bindingImport.loading=false}}
async function applyBindingImport(){if(!bindingImport.plan || bindingImport.plan.errors.length)return;bindingImport.saving=true;try{const result=await importModelBindings(bindingImportData());ElMessage.success(result.msg);bindingImport.visible=false;await reloadCurrent()}finally{bindingImport.saving=false}}
const categoryDialog = reactive({ visible: false, saving: false, inspectLegacy:false, id: null, name: '', keywords: '', description: '', modelScale: 1, frontRotationY: 0, file: null, imageFile: null, currentModelUrl: '', currentImageUrl: '', modelObjectUrl: '', imageObjectUrl: '' })
const categoryModelPreviewUrl = computed(() => categoryDialog.modelObjectUrl || categoryDialog.currentModelUrl)
const categoryImagePreviewUrl = computed(() => categoryDialog.imageObjectUrl || categoryDialog.currentImageUrl)
const categoryReviewActive=computed(()=>{const model=categoryModels.value.find(item=>Number(item.id)===Number(categoryDialog.id));return modelReviewConfirmed(model)&&!categoryDialog.file&&!categoryDialog.imageFile&&categoryModelPreviewUrl.value===model.modelUrl&&normalizeModelRotation(categoryDialog.frontRotationY)===normalizeModelRotation(model.frontRotationY)})
const frontDegrees = computed(() => Math.round(normalizeModelRotation(categoryDialog.frontRotationY) * 180 / Math.PI))
function revokeObjectUrls() { if (categoryDialog.modelObjectUrl) URL.revokeObjectURL(categoryDialog.modelObjectUrl); if (categoryDialog.imageObjectUrl) URL.revokeObjectURL(categoryDialog.imageObjectUrl) }
function resetCategoryDialog() { revokeObjectUrls(); Object.assign(categoryDialog, { saving: false, inspectLegacy:false, id: null, name: '', keywords: '', description: '', modelScale: 1, frontRotationY: 0, file: null, imageFile: null, currentModelUrl: '', currentImageUrl: '', modelObjectUrl: '', imageObjectUrl: '' }) }
function openCategoryDialog(item = null) { resetCategoryDialog(); if (item) Object.assign(categoryDialog, { id: item.id, name: item.name, keywords: item.keywords || '', description: item.description || '', modelScale: Number(item.modelScale) || 1, frontRotationY: Number(item.frontRotationY) || 0, currentModelUrl: item.modelUrl || '', currentImageUrl: item.imageUrl || '' }); categoryDialog.visible = true }
function captureCategoryFile(event) { const file = event.target.files?.[0] || null; if (file && !validateGlb(file)) { event.target.value = ''; return } if (categoryDialog.modelObjectUrl) URL.revokeObjectURL(categoryDialog.modelObjectUrl); categoryDialog.file = file; categoryDialog.modelObjectUrl = file ? URL.createObjectURL(file) : '' }
function captureCategoryImage(event) { const file = event.target.files?.[0] || null; if (file && !validateImage(file)) { event.target.value = ''; return } if (categoryDialog.imageObjectUrl) URL.revokeObjectURL(categoryDialog.imageObjectUrl); categoryDialog.imageFile = file; categoryDialog.imageObjectUrl = file ? URL.createObjectURL(file) : '' }
function rotateCategory(direction) { categoryDialog.frontRotationY = normalizeModelRotation(categoryDialog.frontRotationY + direction * Math.PI / 2) }
async function saveCategoryModel() { if (!categoryDialog.name.trim()) return ElMessage.warning('请填写备件模型名称'); categoryDialog.saving = true; try { const data = new FormData(); data.append('name', categoryDialog.name.trim()); data.append('keywords', categoryDialog.keywords); data.append('description', categoryDialog.description); data.append('modelScale', String(categoryDialog.modelScale)); data.append('frontRotationY', String(normalizeModelRotation(categoryDialog.frontRotationY))); if (categoryDialog.file) data.append('model', categoryDialog.file); if (categoryDialog.imageFile) data.append('image', categoryDialog.imageFile); if (categoryDialog.id) await updatePartCategoryModel(categoryDialog.id, data); else await createPartCategoryModel(data); categoryDialog.visible = false; ElMessage.success('备件模型、参考图和正面设置已保存'); await loadCategoryModels() } finally { categoryDialog.saving = false } }
async function removeCategoryModel(item) { try { await ElMessageBox.confirm(`删除备件模型“${item.name}”后，关联物料将解除绑定；物料自己的实物图不会删除。`, '删除备件模型', { type: 'warning' }); await deletePartCategoryModel(item.id); ElMessage.success('备件模型已删除'); await Promise.all([loadCategoryModels(), loadParts()]) } catch { /* cancel */ } }

const bindingTemplateLoading = ref(false)
async function downloadBindingTemplate() {
  bindingTemplateLoading.value=true
  try { const data=await downloadModelBindingsTemplate();const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download='模型名称绑定导入模板.xlsx';a.click();URL.revokeObjectURL(url) } finally { bindingTemplateLoading.value=false }
}
const failedPhotos = reactive(new Set())
const photoDialog = reactive({ visible: false, name: '', url: '' })
function openPhoto(item) { Object.assign(photoDialog, { visible: true, name: `${item.name} · 实物照片`, url: item.partImageUrl }) }
function openPartPreview(item) { openPreview({ name: `${item.name} · ${item.categoryModelName || '3D示意模型'}`, modelUrl: displayedPartModel(item), imageUrl: item.categoryImageUrl, frontRotationY: item.categoryFrontRotationY, reviewed:partModelReviewed(item), requiresReview:partModelNeedsReview(item) }) }
const previewDialog = reactive({ visible: false, name: '', modelUrl: '', imageUrl: '', frontRotationY: 0,reviewed:false,requiresReview:false })
function openPreview(item) { Object.assign(previewDialog, { visible: true, name: item.name, modelUrl: item.modelUrl, imageUrl: item.imageUrl || '', frontRotationY: Number(item.frontRotationY) || 0,reviewed:!!item.reviewed,requiresReview:!!item.requiresReview }) }

onMounted(async () => { query.workshopCode = String(route.query.workshopCode || ''); query.search = String(route.query.search || ''); await Promise.all([loadParts(), loadCategoryModels()]) })
onBeforeUnmount(()=>{partsRequest++;categoryRequest++;catalogPartsRequest++;catalogGeneration++;revokeObjectUrls()})
</script>

<style scoped>
.model-library{padding:0}.library-tabs-wrap{position:relative}.library-tabs:deep(.el-tabs__header){margin-bottom:14px;padding-right:120px}.library-refresh{position:absolute;right:0;top:0;z-index:2}.library-refresh span{margin-left:4px}
.workbench-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 18px;margin-bottom:12px}.search-row{display:grid;grid-template-columns:180px minmax(260px,560px) auto;gap:8px}.category-search{grid-template-columns:minmax(260px,560px) auto auto}.result-panel{padding:16px 18px}.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}.filter-tabs,.selection-tools{display:flex;gap:6px;flex-wrap:wrap}.filter-tabs button{padding:7px 13px;border:1px solid #dfe4ec;border-radius:8px;color:#586274;background:#fff;cursor:pointer;white-space:nowrap}.filter-tabs button.active{border-color:#be203b;color:#fff;background:#be203b}.selection-tools{justify-content:flex-end;margin-left:auto}.selection-tools .el-button{margin:0}.binding-filter{margin-bottom:12px}
.batch-workbench{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;padding:12px 14px;border:1px solid #b9d9f8;border-radius:10px;background:#f2f8ff}.batch-workbench>div{margin-right:auto}.batch-workbench strong,.batch-workbench span{display:block}.batch-workbench .el-select{width:230px;flex-shrink:0}.batch-model-status{flex-basis:100%;margin:0;font-size:12px;color:#687386}
.binding-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;min-height:120px}.ml-card{position:relative;min-width:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e1e7ef;border-radius:12px;background:#fff;transition:border-color .15s,box-shadow .15s}.ml-card:hover{border-color:#bdcbd9;box-shadow:0 3px 12px #26394d08}.ml-card.selected{border-color:#be203b;box-shadow:0 0 0 2px #be203b17}.binding-selection{position:absolute;top:10px;right:12px;z-index:2}.binding-selection .el-checkbox{height:26px}.part-card-heading{padding:14px 40px 10px 14px;min-height:85px;box-sizing:border-box}.part-card-heading strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.6;height:42px;color:#243e56;overflow-wrap:anywhere}.part-card-heading code{display:block;margin-top:5px;color:#8391a1;font-size:11px}
.binding-visuals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0 13px;border:1px solid #e7ecf2;border-radius:8px;overflow:hidden}.binding-visual{position:relative;min-width:0;height:156px;padding:26px 8px 8px;box-sizing:border-box;border:0;background:#f5f7fa;color:#8c9aab;font:inherit;text-align:center}.binding-visual+.binding-visual{border-left:1px solid #e7ecf2}.binding-visual:is(button){cursor:pointer}.binding-visual:is(button):hover{background:#eef3f8}.binding-visual:is(button):focus-visible{outline:2px solid #be203b;outline-offset:-3px}.photo-visual{background:#fff}.photo-visual img{display:block;width:100%;height:100%;object-fit:contain}.visual-title{position:absolute;top:10px;left:10px;right:7px;font-size:10px;line-height:1.4;text-align:left;color:#8797aa}.binding-thumbnail{height:100%;width:100%}.binding-thumbnail :deep(span){font-size:10px;line-height:1.6;padding:5px}.visual-review{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:2px 6px;border-radius:4px;color:#95600d;background:#fff4d9;font-size:10px}.visual-empty{display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:8px;font-size:11px;line-height:1.6}.visual-empty .el-icon{font-size:25px;color:#97a7b9}
.binding-model{padding:12px 14px;flex:1;min-width:0;font-size:12px;line-height:1.6}.binding-model strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:500;color:#596d83}.binding-model small{font-size:10px;color:#8593a4}.binding-model .binding-review,.binding-review{color:#a46b24}.binding-spec{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;margin:5px 0 0;color:#8491a1;font-size:11px;overflow-wrap:anywhere}.card-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:10px 0;border-top:1px solid #edf0f4;min-height:42px;box-sizing:border-box;align-items:center}.card-actions .el-button{margin:0;font-size:12px}.card-actions>:last-child{border-left:1px solid #edf0f4;text-align:center}.card-actions :deep(.el-upload){display:inline-flex;max-width:100%;justify-content:center}.model-pagination{margin-top:18px;justify-content:flex-end}.photo-enlarged{display:block;width:100%;height:min(65vh,600px)}
.native-file{width:100%;padding:8px;border:1px dashed #c9d1dc;border-radius:8px}.el-form-item small{display:block;margin-top:6px;color:#687386}.category-editor-layout{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(360px,1.2fr);gap:22px}.front-editor>strong{display:block;font-size:14px}.front-editor>p{margin:5px 0 10px;color:#687386;font-size:11px;line-height:1.5}.front-controls{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:9px}.front-controls span{min-width:52px;text-align:center;font-weight:700}.reference-thumb{display:flex;align-items:center;gap:9px;margin-top:10px;padding:7px;border:1px solid #e4e9ef;border-radius:10px}.reference-thumb>.reference-image{flex:none;width:54px;height:42px}.reference-thumb span{color:#687386;font-size:11px}.preview-caption{display:flex;align-items:center;gap:12px;margin-top:12px}.preview-caption>.reference-image{flex:none;width:88px;height:66px;border:1px solid #e1e6ed;border-radius:8px}.preview-caption strong,.preview-caption span{display:block}.preview-caption span{margin-top:3px;color:#687386;font-size:11px}
.binding-import-tools{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}.binding-import-dialog :deep(.el-dialog__header){border-bottom:1px solid #e5eaf0;padding-bottom:16px}.binding-import-dialog :deep(.el-dialog__footer){border-top:1px solid #e5eaf0;padding-top:16px;margin-top:18px}.binding-import-dialog>p{color:#64748b;font-size:13px;line-height:1.7}.binding-import-tools .binding-template-download{color:#be203b;background:#fff;border-color:#be203b}.binding-import-tools .binding-template-download:hover,.binding-import-tools .binding-template-download:focus-visible{color:#a71930;background:#fff1f4;border-color:#a71930}
@media(min-width:1600px){.binding-list{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:1080px){.binding-list{grid-template-columns:repeat(2,minmax(0,1fr))}.workbench-head{align-items:stretch;flex-direction:column}.search-row,.category-search{width:100%}.category-editor-layout{grid-template-columns:1fr}}
@media(max-width:680px){.search-row,.category-search{grid-template-columns:1fr}.result-panel{padding:12px}.binding-list{gap:12px}.binding-visuals{margin:0 10px}.binding-visual{height:140px;padding-inline:5px}.part-card-heading{padding-left:11px}.binding-model{padding:10px 11px}.result-toolbar{align-items:flex-start}.selection-tools{justify-content:flex-start;margin-left:0}.batch-workbench .el-select{width:100%}.library-tabs:deep(.el-tabs__header){padding-right:38px}.library-refresh span{display:none}.library-refresh{padding:8px}}
@media(max-width:540px){.binding-list{grid-template-columns:minmax(0,1fr)}.binding-visual{height:168px}.part-card-heading{min-height:79px}.card-actions{min-height:44px}}
</style>

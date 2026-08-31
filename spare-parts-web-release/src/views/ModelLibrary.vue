<template>
  <div class="model-library">
    <div class="page-head">
      <div><h2>备件模型库</h2><p>专用模型绑定具体备件；类别模型作为可维护的公共资源，供同类备件批量关联。</p></div>
      <el-button :loading="loading" @click="reloadCurrent"><el-icon><Refresh /></el-icon>刷新</el-button>
    </div>

    <el-tabs v-model="activeTab" class="library-tabs" @tab-change="reloadCurrent">
      <el-tab-pane label="备件模型关联" name="parts">
        <section class="workbench-head panel">
          <div class="workbench-copy"><strong>先搜索，再勾选需要处理的备件</strong><span>可为选中备件批量上传同一个专用模型，或批量关联一个类别模型。</span></div>
          <div class="search-row">
            <el-select v-model="query.workshopCode" clearable placeholder="全部车间" @change="loadParts"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select>
            <el-input v-model="query.search" clearable placeholder="搜索编码、名称、规格或类别" @keyup.enter="loadParts" @clear="loadParts"><template #prefix><el-icon><Search /></el-icon></template></el-input>
            <el-button type="primary" @click="loadParts">搜索</el-button>
          </div>
        </section>

        <section class="summary-row">
          <article><strong>{{ parts.length }}</strong><span>当前结果</span></article><article><strong>{{ withDedicatedModel }}</strong><span>专用模型</span></article>
          <article><strong>{{ withCategoryModel }}</strong><span>类别模型</span></article><article><strong>{{ withoutAnyModel }}</strong><span>通用模型</span></article>
        </section>

        <section class="panel result-panel">
          <div class="result-toolbar">
            <div class="filter-tabs">
              <button :class="{active:filter==='all'}" @click="filter='all'">全部 {{ filteredParts.length }}</button><button :class="{active:filter==='dedicated'}" @click="filter='dedicated'">专用模型</button>
              <button :class="{active:filter==='category'}" @click="filter='category'">类别模型</button><button :class="{active:filter==='none'}" @click="filter='none'">未关联</button>
            </div>
            <div class="selection-tools"><el-button size="small" @click="selectVisible">选择当前结果</el-button><el-button v-if="selected.size" size="small" @click="selected.clear()">取消选择</el-button></div>
          </div>

          <div v-if="selected.size" class="batch-workbench">
            <div><strong>已选 {{ selected.size }} 个备件</strong><span>所有写入仍按账号车间权限逐项校验。</span></div>
            <el-upload :show-file-list="false" :before-upload="handleBatchModelUpload" accept=".glb,.gltf"><el-button type="success" :loading="batchUploading">批量上传专用3D</el-button></el-upload>
            <el-select v-model="batchCategoryId" clearable placeholder="选择类别模型"><el-option v-for="item in categoryModels" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-button type="primary" :disabled="!batchCategoryId" :loading="batchAssigning" @click="assignCategoryModel">批量关联类别</el-button>
            <el-button :loading="batchAssigning" @click="clearCategoryModel">清除类别关联</el-button>
          </div>

          <div v-loading="loading" class="ml-grid">
            <article v-for="item in filteredParts" :key="`${item.id}-${item.workshopCode}`" class="ml-card" :class="{selected:selected.has(item.id),readonly:!canEditPart(item)}">
              <el-checkbox v-if="canEditPart(item)" class="card-check" :model-value="selected.has(item.id)" @change="toggleSelect(item)" /><span v-else class="readonly-badge">只读</span>
              <div class="model-state" :class="modelState(item).type">{{ modelState(item).label }}</div>
              <div class="ml-card-img"><img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" loading="lazy" /><div v-else class="no-img"><el-icon><Picture /></el-icon><span>暂无图片</span></div></div>
              <div class="ml-card-info"><strong>{{ item.name }}</strong><code>{{ item.code }}</code><p>{{ item.spec || '未填写规格' }}</p><p class="category-line">{{ item.categoryName || '未分类' }}<template v-if="item.categoryModelName"> · {{ item.categoryModelName }}</template></p></div>
              <div v-if="canEditPart(item)" class="card-actions">
                <el-upload :show-file-list="false" :before-upload="file=>handleSingleUpload(item,file)" accept="image/*"><el-button link type="primary">{{ item.imageUrl?'换图片':'传图片' }}</el-button></el-upload>
                <el-upload :show-file-list="false" :before-upload="file=>handleModelUpload(item,file)" accept=".glb,.gltf"><el-button link type="success" :loading="item._modelUploading">{{ item.modelUrl?'换专用3D':'传专用3D' }}</el-button></el-upload>
                <el-button v-if="item.modelUrl" link type="warning" @click="openScaleDialog(item)">缩放</el-button><el-button v-if="item.modelUrl" link type="danger" @click="handleDeleteModel(item)">删专用3D</el-button>
              </div>
            </article>
          </div><el-empty v-if="!loading&&!filteredParts.length" description="没有符合条件的备件" />
        </section>
      </el-tab-pane>

      <el-tab-pane label="类别模型管理" name="categories">
        <section class="workbench-head panel category-head">
          <div class="workbench-copy"><strong>独立维护可复用的类别模型</strong><span>可搜索、上传、修改、替换或删除；删除后关联备件自动恢复为通用模型。</span></div>
          <div class="search-row category-search"><el-input v-model="categorySearch" clearable placeholder="搜索名称、关键词或说明" @keyup.enter="loadCategoryModels" @clear="loadCategoryModels"><template #prefix><el-icon><Search /></el-icon></template></el-input><el-button type="primary" @click="loadCategoryModels">搜索</el-button><el-button v-if="admin" type="success" @click="openCategoryDialog()">新增类别模型</el-button></div>
        </section>
        <div v-loading="categoryLoading" class="category-grid">
          <article v-for="item in categoryModels" :key="item.id" class="category-card">
            <div class="category-preview"><span>3D</span><strong>{{ item.name }}</strong><small>{{ modelFilename(item.modelUrl) }}</small></div>
            <dl><div><dt>匹配关键词</dt><dd>{{ item.keywords||'未设置' }}</dd></div><div><dt>模型缩放</dt><dd>{{ Number(item.modelScale||1).toFixed(1) }}x</dd></div><div><dt>已关联备件</dt><dd>{{ item.associatedParts||0 }} 个</dd></div></dl>
            <p>{{ item.description||'暂无说明' }}</p><footer><a :href="item.modelUrl" target="_blank" rel="noopener">查看模型文件</a><template v-if="admin"><el-button link type="primary" @click="openCategoryDialog(item)">修改/替换</el-button><el-button link type="danger" @click="removeCategoryModel(item)">删除</el-button></template></footer>
          </article>
        </div><el-empty v-if="!categoryLoading&&!categoryModels.length" description="暂无类别模型" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="scaleDialog.visible" title="设置专用模型缩放" width="420px"><p class="dialog-tip">只调整当前备件专用模型在3D场景中的大小。</p><el-slider v-model="scaleDialog.scale" :min="0.1" :max="5" :step="0.1" show-input /><template #footer><el-button @click="scaleDialog.visible=false">取消</el-button><el-button type="primary" :loading="scaleDialog.saving" @click="saveScale">保存</el-button></template></el-dialog>
    <el-dialog v-model="categoryDialog.visible" :title="categoryDialog.id?'修改类别模型':'新增类别模型'" width="560px" @closed="resetCategoryDialog">
      <el-form label-position="top"><el-form-item label="类别模型名称" required><el-input v-model="categoryDialog.name" maxlength="80" show-word-limit /></el-form-item><el-form-item label="匹配关键词"><el-input v-model="categoryDialog.keywords" placeholder="用逗号分隔，例如：轴承,bearing" maxlength="500" /></el-form-item><el-form-item label="用途说明"><el-input v-model="categoryDialog.description" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item><el-form-item label="默认缩放"><el-input-number v-model="categoryDialog.modelScale" :min="0.1" :max="10" :step="0.1" /></el-form-item><el-form-item :label="categoryDialog.id?'替换3D文件（不选则保留原文件）':'3D文件'" :required="!categoryDialog.id"><input class="native-file" type="file" accept=".glb,.gltf" @change="captureCategoryFile" /><small v-if="categoryDialog.file">已选择：{{ categoryDialog.file.name }}</small></el-form-item></el-form>
      <template #footer><el-button @click="categoryDialog.visible=false">取消</el-button><el-button type="primary" :loading="categoryDialog.saving" @click="saveCategoryModel">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed,onMounted,reactive,ref} from 'vue'
import {useRoute} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {Picture,Refresh,Search} from '@element-plus/icons-vue'
import {batchAssignPartCategoryModel,batchUploadPartModel,createPartCategoryModel,deletePartCategoryModel,deletePartModel,getPartCategoryModels,getPartModelLibrary,updatePartCategoryModel,updatePartModelScale,uploadPartImage,uploadPartModel} from '../api'
import {canEditWorkshop,isAdmin} from '../auth'

const workshops=[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}]
const route=useRoute(),admin=isAdmin(),activeTab=ref('parts'),query=reactive({workshopCode:'',search:''}),parts=ref([]),loading=ref(false),filter=ref('all'),selected=reactive(new Set()),batchUploading=ref(false),batchAssigning=ref(false),batchCategoryId=ref(null),categoryModels=ref([]),categorySearch=ref(''),categoryLoading=ref(false)
const withDedicatedModel=computed(()=>parts.value.filter(item=>item.modelUrl).length),withCategoryModel=computed(()=>parts.value.filter(item=>!item.modelUrl&&item.categoryModelUrl).length),withoutAnyModel=computed(()=>parts.value.filter(item=>!item.modelUrl&&!item.categoryModelUrl).length)
const filteredParts=computed(()=>parts.value.filter(item=>filter.value==='dedicated'?Boolean(item.modelUrl):filter.value==='category'?Boolean(!item.modelUrl&&item.categoryModelUrl):filter.value==='none'?Boolean(!item.modelUrl&&!item.categoryModelUrl):true))
function modelState(item){return item.modelUrl?{type:'dedicated',label:'专用3D'}:item.categoryModelUrl?{type:'category',label:`类别：${item.categoryModelName}`}:{type:'generic',label:'通用模型'}}
function canEditPart(item){return canEditWorkshop(item.workshopCode)}function modelFilename(url){return String(url||'').split('/').pop()||'未上传'}
async function loadParts(){loading.value=true;try{const result=await getPartModelLibrary({workshopCode:query.workshopCode,search:query.search});parts.value=result.data||[];selected.clear()}finally{loading.value=false}}
async function loadCategoryModels(){categoryLoading.value=true;try{const result=await getPartCategoryModels({search:categorySearch.value});categoryModels.value=result.data||[]}finally{categoryLoading.value=false}}
async function reloadCurrent(){if(activeTab.value==='categories')await loadCategoryModels();else await Promise.all([loadParts(),loadCategoryModels()])}
function toggleSelect(item){if(canEditPart(item))selected.has(item.id)?selected.delete(item.id):selected.add(item.id)}function selectVisible(){for(const item of filteredParts.value)if(canEditPart(item))selected.add(item.id);if(!selected.size)ElMessage.warning('当前结果没有可修改的备件')}
async function handleSingleUpload(item,file){const data=new FormData();data.append('image',file);const result=await uploadPartImage(item.id,data);item.imageUrl=result.data.imageUrl;ElMessage.success('图片已上传');return false}
async function handleModelUpload(item,file){item._modelUploading=true;try{const data=new FormData();data.append('model',file);data.append('modelScale',String(item.modelScale||1));const result=await uploadPartModel(item.id,data);item.modelUrl=result.data.modelUrl;item.modelScale=result.data.modelScale;ElMessage.success('专用模型已上传')}finally{item._modelUploading=false}return false}
async function handleBatchModelUpload(file){if(!selected.size){ElMessage.warning('请先选择备件');return false}batchUploading.value=true;try{const data=new FormData();data.append('model',file);data.append('partIds',JSON.stringify([...selected]));data.append('modelScale','1');await batchUploadPartModel(data);ElMessage.success('批量专用模型已关联');await loadParts()}finally{batchUploading.value=false}return false}
async function assignCategoryModel(){if(!selected.size||!batchCategoryId.value)return;batchAssigning.value=true;try{await batchAssignPartCategoryModel({partIds:[...selected],categoryModelId:batchCategoryId.value});ElMessage.success('类别模型已批量关联');await loadParts()}finally{batchAssigning.value=false}}
async function clearCategoryModel(){if(!selected.size)return;batchAssigning.value=true;try{await batchAssignPartCategoryModel({partIds:[...selected],categoryModelId:null});ElMessage.success('类别关联已清除');await loadParts()}finally{batchAssigning.value=false}}
async function handleDeleteModel(item){try{await ElMessageBox.confirm(`确认删除“${item.name}”的专用模型？`,'删除专用模型',{type:'warning'});await deletePartModel(item.id);item.modelUrl=null;item.modelScale=1;ElMessage.success('专用模型已删除')}catch{/* cancel */}}
const scaleDialog=reactive({visible:false,saving:false,partId:null,scale:1});function openScaleDialog(item){scaleDialog.partId=item.id;scaleDialog.scale=Number(item.modelScale)||1;scaleDialog.visible=true}async function saveScale(){scaleDialog.saving=true;try{await updatePartModelScale(scaleDialog.partId,scaleDialog.scale);const item=parts.value.find(row=>row.id===scaleDialog.partId);if(item)item.modelScale=scaleDialog.scale;scaleDialog.visible=false;ElMessage.success('缩放已保存')}finally{scaleDialog.saving=false}}
const categoryDialog=reactive({visible:false,saving:false,id:null,name:'',keywords:'',description:'',modelScale:1,file:null});function resetCategoryDialog(){Object.assign(categoryDialog,{saving:false,id:null,name:'',keywords:'',description:'',modelScale:1,file:null})}function openCategoryDialog(item=null){resetCategoryDialog();if(item)Object.assign(categoryDialog,{id:item.id,name:item.name,keywords:item.keywords||'',description:item.description||'',modelScale:Number(item.modelScale)||1});categoryDialog.visible=true}function captureCategoryFile(event){categoryDialog.file=event.target.files?.[0]||null}
async function saveCategoryModel(){if(!categoryDialog.name.trim())return ElMessage.warning('请填写类别模型名称');if(!categoryDialog.id&&!categoryDialog.file)return ElMessage.warning('请选择GLB/GLTF模型文件');categoryDialog.saving=true;try{const data=new FormData();data.append('name',categoryDialog.name.trim());data.append('keywords',categoryDialog.keywords);data.append('description',categoryDialog.description);data.append('modelScale',String(categoryDialog.modelScale));if(categoryDialog.file)data.append('model',categoryDialog.file);if(categoryDialog.id)await updatePartCategoryModel(categoryDialog.id,data);else await createPartCategoryModel(data);categoryDialog.visible=false;ElMessage.success('类别模型已保存');await loadCategoryModels()}finally{categoryDialog.saving=false}}
async function removeCategoryModel(item){try{await ElMessageBox.confirm(`删除类别模型“${item.name}”后，已关联备件将恢复为通用模型。确认继续？`,'删除类别模型',{type:'warning'});await deletePartCategoryModel(item.id);ElMessage.success('类别模型已删除');await Promise.all([loadCategoryModels(),loadParts()])}catch{/* cancel */}}
onMounted(async()=>{query.workshopCode=String(route.query.workshopCode||'');query.search=String(route.query.search||'');await Promise.all([loadParts(),loadCategoryModels()])})
</script>

<style scoped>
.model-library{padding:18px 22px}.page-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px}.page-head h2{margin:0 0 4px;font-size:22px}.page-head p{margin:0;color:#687386;font-size:13px}.library-tabs:deep(.el-tabs__header){margin-bottom:14px}.workbench-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;padding:16px 18px}.workbench-copy strong,.workbench-copy span{display:block}.workbench-copy span{margin-top:4px;color:#687386;font-size:12px}.search-row{display:grid;grid-template-columns:150px minmax(260px,380px) auto;gap:8px}.category-search{grid-template-columns:minmax(260px,420px) auto auto}.summary-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.summary-row article{padding:14px;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(23,32,51,.06);text-align:center}.summary-row strong,.summary-row span{display:block}.summary-row strong{font-size:25px}.summary-row span{margin-top:2px;color:#687386;font-size:12px}.result-panel{padding:14px}.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.filter-tabs,.selection-tools{display:flex;gap:6px}.filter-tabs button{padding:7px 13px;border:1px solid #dfe4ec;border-radius:8px;color:#586274;background:#fff;cursor:pointer}.filter-tabs button.active{border-color:#2563eb;color:#fff;background:#2563eb}.batch-workbench{display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:12px 14px;border:1px solid #b9d9f8;border-radius:10px;background:#f2f8ff}.batch-workbench>div{margin-right:auto}.batch-workbench strong,.batch-workbench span{display:block}.batch-workbench span{margin-top:2px;color:#667085;font-size:11px}.batch-workbench .el-select{width:190px}.ml-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.ml-card{position:relative;overflow:hidden;border:1px solid #e1e6ed;border-radius:12px;background:#fff}.ml-card.selected{border-color:#2563eb;box-shadow:0 0 0 3px #2563eb22}.card-check{position:absolute;right:8px;top:8px;z-index:3}.readonly-badge{position:absolute;right:8px;top:8px;z-index:3;padding:2px 7px;border-radius:999px;color:#687386;background:#eef1f4;font-size:10px}.model-state{position:absolute;left:8px;top:8px;z-index:3;padding:3px 8px;border-radius:999px;color:#fff;font-size:10px;font-weight:800}.model-state.dedicated{background:#168361}.model-state.category{background:#2563eb}.model-state.generic{background:#7a8493}.ml-card-img{height:128px;display:flex;align-items:center;justify-content:center;background:#f7f9fc}.ml-card-img img{width:100%;height:100%;object-fit:contain}.no-img{display:grid;place-items:center;gap:5px;color:#9aa4b3;font-size:11px}.no-img .el-icon{font-size:34px}.ml-card-info{padding:11px 12px}.ml-card-info strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ml-card-info code{display:inline-block;margin-top:4px;padding:2px 5px;border-radius:4px;color:#2563eb;background:#eef5ff;font-size:11px}.ml-card-info p{margin:5px 0 0;overflow:hidden;color:#6c7687;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.category-line{color:#2563eb!important}.card-actions{display:flex;align-items:center;justify-content:center;gap:5px;min-height:38px;padding:6px 9px;border-top:1px solid #edf0f4;flex-wrap:wrap}.category-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.category-card{overflow:hidden;border:1px solid #dce3eb;border-radius:14px;background:#fff}.category-preview{min-height:118px;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;background:linear-gradient(135deg,#0a6b56,#16a27a)}.category-preview span{padding:3px 9px;border:1px solid #ffffff77;border-radius:999px;font-size:10px}.category-preview strong{margin-top:8px;font-size:20px}.category-preview small{margin-top:5px;opacity:.78}.category-card dl{display:grid;grid-template-columns:repeat(3,1fr);margin:0;padding:12px}.category-card dl div{min-width:0;text-align:center}.category-card dt{color:#8791a0;font-size:10px}.category-card dd{margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}.category-card>p{min-height:34px;margin:0;padding:0 14px 12px;color:#667085;font-size:11px;line-height:1.55}.category-card footer{display:flex;align-items:center;justify-content:flex-end;gap:7px;padding:8px 12px;border-top:1px solid #edf0f4}.category-card footer a{margin-right:auto;color:#2563eb;font-size:11px;text-decoration:none}.dialog-tip{margin:0 0 18px;color:#687386}.native-file{width:100%;padding:8px;border:1px dashed #c9d1dc;border-radius:8px}.el-form-item small{display:block;margin-top:6px;color:#168361}@media(max-width:1000px){.workbench-head{align-items:stretch;flex-direction:column}.search-row,.category-search{width:100%}.summary-row{grid-template-columns:repeat(2,1fr)}.batch-workbench{align-items:stretch;flex-wrap:wrap}}@media(max-width:680px){.search-row,.category-search{grid-template-columns:1fr}.result-toolbar{align-items:flex-start;flex-direction:column}.filter-tabs{flex-wrap:wrap}.summary-row{grid-template-columns:1fr 1fr}.category-grid{grid-template-columns:1fr}}
</style>

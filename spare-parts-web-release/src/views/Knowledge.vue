<template>
  <div class="knowledge-page">
    <section class="knowledge-hero">
      <div><span>FERMENTATION KNOWLEDGE HUB</span><h2>把现场经验变成可检索的标准知识</h2><p>资料、故障、原因、处置和预防措施统一沉淀，减少重复排查。</p></div>
      <div class="hero-actions"><el-button v-if="canEditAny" class="ghost-button" @click="openStageManager"><el-icon><Setting /></el-icon>配置工序/设备/标签</el-button><el-button v-if="canEditAny" type="primary" @click="openCreate"><el-icon><CirclePlus /></el-icon>新增知识</el-button></div>
    </section>

    <section class="knowledge-metrics">
      <article><span class="metric-symbol is-all"><el-icon><Collection /></el-icon></span><div><strong>{{ stats.total }}</strong><small>知识总量</small></div></article>
      <article><span class="metric-symbol is-doc"><el-icon><Document /></el-icon></span><div><strong>{{ stats.documents }}</strong><small>资料文档</small></div></article>
      <article><span class="metric-symbol is-fault"><el-icon><Warning /></el-icon></span><div><strong>{{ stats.faults }}</strong><small>故障知识</small></div></article>
      <article><span class="metric-symbol is-view"><el-icon><View /></el-icon></span><div><strong>{{ stats.views }}</strong><small>累计查阅</small></div></article>
    </section>

    <section class="knowledge-filter">
      <el-input v-model="filters.search" clearable placeholder="搜索标题、设备、故障现象、原因、处置或标签" @keyup.enter="search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
      <el-select v-model="filters.workshopCode" placeholder="全部车间" @change="workshopChanged"><el-option label="全部车间" value=""/><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code"/></el-select>
      <el-select v-model="filters.type" clearable placeholder="全部类型" @change="search"><el-option label="资料文档" value="document"/><el-option label="故障知识" value="fault"/></el-select>
      <el-select v-model="filters.category" clearable placeholder="全部分类" @change="search"><el-option v-for="item in categories" :key="item.category" :label="`${item.category} (${item.total})`" :value="item.category"/></el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="reset">重置</el-button>
    </section>

    <section class="knowledge-content">
      <div class="content-head"><div><strong>知识条目</strong><span>共 {{ total }} 条</span></div><el-button :loading="loading" text @click="load"><el-icon><Refresh /></el-icon>刷新</el-button></div>
      <div v-loading="loading" class="knowledge-grid">
        <article v-for="item in entries" :key="item.id" class="knowledge-card" @click="openDetail(item)">
          <div class="card-top"><span class="type-chip" :class="`is-${item.entryType}`"><el-icon><Document v-if="item.entryType==='document'"/><Warning v-else/></el-icon>{{ item.entryType==='document'?'资料文档':'故障知识' }}</span><span class="card-date">{{ formatDate(item.createdAt) }}</span></div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.entryType==='fault' ? (item.faultSymptom || item.summary) : (item.summary || '暂无内容摘要') }}</p>
          <div class="card-meta"><span><el-icon><FolderOpened /></el-icon>{{ item.category }}</span><span v-if="item.processStage"><el-icon><Guide /></el-icon>{{ item.processStage }}</span><span v-if="item.equipmentName"><el-icon><SetUp /></el-icon>{{ item.equipmentName }}</span></div>
          <div class="tag-row"><el-tag v-for="tag in item.tags.slice(0,4)" :key="tag" size="small" effect="plain">{{ tag }}</el-tag></div>
          <footer><span>{{ item.uploadedByName || '系统用户' }}</span><span><el-icon><View /></el-icon>{{ item.viewCount }}<template v-if="item.hasFile"> · <el-icon><Paperclip /></el-icon>附件</template></span></footer>
        </article>
      </div>
      <el-empty v-if="!loading&&!entries.length" description="没有找到符合条件的知识" />
      <div v-if="total>filters.pageSize" class="knowledge-pagination"><el-pagination v-model:current-page="filters.page" :page-size="filters.pageSize" :total="total" layout="prev, pager, next" @current-change="load"/></div>
    </section>

    <el-dialog v-model="createVisible" title="新增工程知识" width="min(720px,94vw)" destroy-on-close @closed="resetForm">
      <div class="entry-type-switch"><button :class="{active:form.entryType==='document'}" @click="form.entryType='document'"><el-icon><Document /></el-icon>资料文档</button><button :class="{active:form.entryType==='fault'}" @click="form.entryType='fault'"><el-icon><Warning /></el-icon>故障知识</button></div>
      <el-form label-position="top">
        <el-form-item label="所属车间 *"><el-select v-model="form.workshopCode" :disabled="!isAdmin" @change="formWorkshopChanged"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code"/></el-select></el-form-item>
        <div class="form-grid"><el-form-item label="标题 *"><el-input v-model="form.title" maxlength="200" show-word-limit/></el-form-item><el-form-item label="分类 *"><el-select v-model="form.category" filterable allow-create default-first-option placeholder="选择或输入分类"><el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item"/></el-select></el-form-item></div>
        <div class="form-grid"><el-form-item label="工序 / 区域"><el-select v-model="form.processStage" clearable filterable placeholder="选择已配置的工序/区域"><el-option v-for="item in activeStages" :key="item.id" :label="item.name" :value="item.name"/></el-select></el-form-item><el-form-item label="关联设备"><el-select v-model="form.equipmentName" filterable remote clearable placeholder="输入名称搜索设备台账" :remote-method="searchEquipment" :loading="equipmentLoading"><el-option v-for="item in equipmentOptions" :key="item.id" :label="item.name" :value="item.name"/></el-select><small class="field-help">设备在“配置工序/设备/标签 → 设备台账”中新增。</small></el-form-item></div>
        <el-form-item label="标签"><el-select v-model="form.tagList" multiple filterable allow-create default-first-option placeholder="可选已有标签，也可输入后回车新增临时标签" :reserve-keyword="false" @change="updateTags"><el-option v-for="tag in tagSuggestions" :key="tag" :label="tag" :value="tag"/></el-select><small class="field-help">常用标签可在统一配置中提前建立；临时标签可直接输入后回车。</small></el-form-item>
        <template v-if="form.entryType==='document'">
          <el-form-item label="资料摘要"><el-input v-model="form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="说明资料用途和适用范围，便于检索"/></el-form-item>
          <el-form-item label="资料附件 *"><el-upload ref="uploadRef" v-model:file-list="uploadFiles" drag :auto-upload="false" :limit="1" :on-change="fileChanged" :on-remove="fileRemoved" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"><el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入文件，或<em>点击选择</em></div><template #tip><div class="el-upload__tip">支持PDF、Office、文本、表格和图片，单文件不超过500MB；选择后文件名会保留，提交时上传原始文件</div></template></el-upload></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="故障现象 *"><el-input v-model="form.faultSymptom" type="textarea" :rows="3" maxlength="4000" placeholder="描述时间、位置、表现、报警或异常参数"/></el-form-item>
          <el-form-item label="原因分析"><el-input v-model="form.faultCause" type="textarea" :rows="3" maxlength="4000" placeholder="填写已确认的直接原因和根本原因"/></el-form-item>
          <el-form-item label="处理方法 *"><el-input v-model="form.solution" type="textarea" :rows="5" maxlength="20000" placeholder="按执行顺序填写安全措施、检查步骤和处理办法"/></el-form-item>
          <el-form-item label="预防措施"><el-input v-model="form.preventiveAction" type="textarea" :rows="3" maxlength="4000" placeholder="填写点检、保养或工艺控制建议"/></el-form-item>
        </template>
      </el-form>
      <el-progress v-if="submitting&&uploadProgress>0" :percentage="uploadProgress" :status="uploadProgress===100?'success':''" />
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="submit">{{ submitting ? `正在上传 ${uploadProgress}%` : '提交知识' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="stageVisible" title="知识选项配置" width="min(760px,94vw)">
      <el-select v-model="stageWorkshopCode" :disabled="!isAdmin" style="width:100%;margin-bottom:12px" @change="loadManagerData"><el-option v-for="item in editableWorkshops" :key="item.code" :label="item.name" :value="item.code"/></el-select>
      <h3 class="manager-heading">工序 / 区域</h3>
      <div class="stage-create"><el-input v-model="newStage.name" maxlength="80" placeholder="新增工序或区域名称" @keyup.enter="addStage"/><el-input-number v-model="newStage.sortOrder" :min="0" :max="99999"/><el-button type="primary" :loading="stageSaving" @click="addStage">新增</el-button></div>
      <div class="stage-list">
        <div v-for="item in stageRows" :key="item.id" class="stage-row">
          <el-input v-model="item.name" maxlength="80"/>
          <el-input-number v-model="item.sortOrder" :min="0" :max="99999"/>
          <el-switch v-model="item.enabled" inline-prompt active-text="启用" inactive-text="停用"/>
          <el-button :loading="item.saving" @click="saveStage(item)">保存</el-button>
          <el-button type="danger" plain @click="deleteStage(item)">删除</el-button>
        </div>
      </div>
      <div class="stage-footer"><p class="stage-tip">停用后不会再出现在上传选择框中，已有资料的工序信息仍会保留。</p><el-button type="primary" :loading="stageSaving" @click="saveAllStages">一键保存全部</el-button></div>
      <el-divider />
      <div class="manager-section"><div><h3>关联设备</h3><p>关联设备来自“设备与备件”台账，并按车间隔离修改权限。</p></div><el-button type="primary" plain @click="goEquipment"><el-icon><SetUp /></el-icon>打开设备台账新增</el-button></div>
      <el-divider />
      <div class="manager-section is-tags"><div><h3>常用标签</h3><p>新增后会出现在知识上传的标签下拉框中。</p></div><div class="tag-create"><el-input v-model="newTag" maxlength="60" placeholder="输入常用标签" @keyup.enter="addTag"/><el-button type="primary" :loading="tagSaving" @click="addTag">新增标签</el-button></div></div>
      <div class="managed-tags"><el-tag v-for="item in tagRows" :key="item.id" closable effect="plain" @close="removeTag(item)">{{ item.name }}</el-tag><el-empty v-if="!tagRows.length" :image-size="42" description="当前车间还没有常用标签"/></div>
    </el-dialog>

    <el-drawer v-model="detailVisible" size="min(720px,96vw)" :title="detail?.entryType==='fault'?'故障知识详情':'资料详情'">
      <div v-if="detail" class="knowledge-detail">
        <div class="detail-heading"><span class="type-chip" :class="`is-${detail.entryType}`">{{ detail.entryType==='fault'?'故障知识':'资料文档' }}</span><h2>{{ detail.title }}</h2><p>{{ detail.category }}<template v-if="detail.processStage"> · {{ detail.processStage }}</template><template v-if="detail.equipmentName"> · {{ detail.equipmentName }}</template></p></div>
        <div class="detail-tags"><el-tag v-for="tag in detail.tags" :key="tag" effect="plain">{{ tag }}</el-tag></div>
        <template v-if="detail.entryType==='fault'"><section><h3>故障现象</h3><div class="md-content" v-html="renderMd(detail.faultSymptom)"></div></section><section v-if="detail.faultCause"><h3>原因分析</h3><div class="md-content" v-html="renderMd(detail.faultCause)"></div></section><section><h3>处理方法</h3><div class="md-content" v-html="renderMd(detail.solution)"></div></section><section v-if="detail.preventiveAction"><h3>预防措施</h3><div class="md-content" v-html="renderMd(detail.preventiveAction)"></div></section></template>
        <template v-else><section><h3>资料摘要</h3><div class="md-content" v-html="renderMd(detail.summary || '暂无摘要')"></div></section><section v-if="detail.contentText"><h3>文本内容</h3><div class="md-content" v-html="renderMd(detail.contentText)"></div></section></template>
        <div class="detail-file" v-if="detail.hasFile"><el-icon><Document /></el-icon><div><strong>{{ detail.originalFilename }}</strong><small>{{ formatSize(detail.fileSize) }}</small></div><div class="file-actions"><el-button v-if="canPreview(detail)" type="primary" :loading="previewLoading" @click="openPreview(detail)">在线阅读</el-button><el-button plain :loading="downloading" @click="download(detail)"><el-icon><Download /></el-icon>下载</el-button></div></div>
        <footer class="detail-footer"><span>上传人：{{ detail.uploadedByName }}</span><span>{{ formatTime(detail.createdAt) }} · 已查阅 {{ detail.viewCount }} 次</span></footer>
        <el-button v-if="isAdmin" class="archive-button" type="danger" plain @click="removeEntry(detail)">彻底删除知识及服务器附件</el-button>
      </div>
    </el-drawer>
    <el-dialog v-model="previewVisible" :title="detail?.originalFilename||'在线阅读'" width="min(1180px,96vw)" top="3vh" destroy-on-close @closed="closePreview"><div class="file-preview"><img v-if="previewKind==='image'" :src="previewUrl" alt="资料预览"/><iframe v-else :src="previewUrl" title="资料在线预览"></iframe></div><template #footer><el-button @click="previewVisible=false">关闭</el-button><el-button @click="download(detail)">下载原文件</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { createKnowledgeEntry, createKnowledgeProcessStage, createKnowledgeTag, deleteKnowledgeEntry, deleteKnowledgeProcessStage, deleteKnowledgeTag, downloadKnowledgeFile, getEquipment, getKnowledgeEntries, getKnowledgeEntry, getKnowledgeProcessStages, getKnowledgeStats, getKnowledgeTags, previewKnowledgeFile, saveKnowledgeProcessStages, updateKnowledgeProcessStage } from '../api'
import { canEditAnyWorkshop, getUser, userWorkshopCode } from '../auth'

marked.setOptions({ breaks: true, gfm: true })
const router=useRouter()
function renderMd(text) {
  if (!text) return ''
  return DOMPurify.sanitize(marked.parse(String(text)), {
    USE_PROFILES: { html: true }
  })
}

const isAdmin = getUser()?.role === 'admin'
const canEditAny = canEditAnyWorkshop()
const workshops=[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}]
const ownWorkshop=userWorkshopCode()||'raw_grain'
const editableWorkshops=isAdmin?workshops:workshops.filter(item=>item.code===ownWorkshop)
const loading=ref(false), submitting=ref(false), downloading=ref(false), createVisible=ref(false), detailVisible=ref(false), stageVisible=ref(false), stageSaving=ref(false), uploadRef=ref()
const previewVisible=ref(false),previewLoading=ref(false),previewUrl=ref(''),previewKind=ref('document')
const uploadProgress=ref(0), stageWorkshopCode=ref(ownWorkshop)
const entries=ref([]), total=ref(0), detail=ref(null), selectedFile=ref(null), uploadFiles=ref([])
const stats=reactive({total:0,documents:0,faults:0,views:0,categories:[]})
const filters=reactive({search:'',workshopCode:'',type:'',category:'',page:1,pageSize:12})
const defaultCategories=['工艺资料','设备资料','PLC程序','机器人程序','故障经验','安全规范','操作规程','其他']
const categoryOptions=ref(defaultCategories)
const categories=ref([]), activeStages=ref([]), stageRows=ref([])
const equipmentOptions=ref([]), equipmentLoading=ref(false)
const tagSuggestions=ref([])
const tagRows=ref([]), newTag=ref(''), tagSaving=ref(false)
const newStage=reactive({name:'',sortOrder:100})
const emptyForm=()=>({workshopCode:ownWorkshop,entryType:'document',title:'',category:'',processStage:'',equipmentName:'',summary:'',tags:'',tagList:[],faultSymptom:'',faultCause:'',solution:'',preventiveAction:''})
const form=reactive(emptyForm())

async function loadStats(){const result=await getKnowledgeStats({workshopCode:filters.workshopCode||undefined});Object.assign(stats,result.data||{});categories.value=result.data?.categories||[];categoryOptions.value=[...new Set([...defaultCategories,...(result.data?.categories||[]).map(item=>item.category)])];tagSuggestions.value=result.data?.tags||[]}
async function loadStages(includeDisabled=false,workshopCode=includeDisabled?stageWorkshopCode.value:form.workshopCode){const result=await getKnowledgeProcessStages(includeDisabled,workshopCode);const rows=(result.data||[]).map(item=>({...item,enabled:item.status==='active',saving:false}));if(includeDisabled)stageRows.value=rows;activeStages.value=rows.filter(item=>item.enabled)}
async function loadTags(includeDisabled=false,workshopCode=includeDisabled?stageWorkshopCode.value:form.workshopCode){const result=await getKnowledgeTags(includeDisabled,workshopCode);const rows=result.data||[];if(includeDisabled)tagRows.value=rows;tagSuggestions.value=[...new Set([...tagSuggestions.value,...rows.filter(item=>item.status==='active').map(item=>item.name)])]}
async function loadManagerData(){await Promise.all([loadStages(true),loadTags(true)])}
async function load(){loading.value=true;try{const result=await getKnowledgeEntries(filters);entries.value=result.data||[];total.value=Number(result.total)||0}finally{loading.value=false}}
function search(){filters.page=1;load()}
function reset(){Object.assign(filters,{search:'',workshopCode:'',type:'',category:'',page:1,pageSize:12});Promise.all([load(),loadStats()])}
async function workshopChanged(){filters.page=1;await Promise.all([load(),loadStats()])}
async function openCreate(){
  Object.assign(form,emptyForm())
  createVisible.value=true
  try{await Promise.all([loadStages(false,form.workshopCode),loadTags(false,form.workshopCode)])}catch{activeStages.value=[]}
}
async function formWorkshopChanged(){form.processStage='';form.equipmentName='';form.tagList=[];form.tags='';equipmentOptions.value=[];await Promise.all([loadStages(false,form.workshopCode),loadTags(false,form.workshopCode)])}
function rawFile(file){const value=file?.raw||file;return typeof Blob!=='undefined'&&value instanceof Blob?value:null}
function resetForm(){Object.assign(form,emptyForm());form.tagList=[];selectedFile.value=null;uploadFiles.value=[];uploadProgress.value=0;uploadRef.value?.clearFiles()}
function fileChanged(file,files=[]){
  const picked=rawFile(file)||rawFile(files.at(-1))
  if(!picked){selectedFile.value=null;uploadFiles.value=[];uploadRef.value?.clearFiles();return ElMessage.error('浏览器未能读取所选文件，请重新选择')}
  if(Number(picked.size)>500*1024*1024){ElMessage.warning('附件不能超过500MB');selectedFile.value=null;uploadFiles.value=[];uploadRef.value?.clearFiles();return}
  selectedFile.value=picked
  uploadFiles.value=files.slice(-1)
}
function fileRemoved(_file,files=[]){uploadFiles.value=files;selectedFile.value=rawFile(files.at(-1))}
async function openStageManager(){stageWorkshopCode.value=ownWorkshop;await loadManagerData();stageVisible.value=true}
async function addStage(){if(!newStage.name.trim())return ElMessage.warning('请填写工序/区域名称');stageSaving.value=true;try{await createKnowledgeProcessStage({workshopCode:stageWorkshopCode.value,name:newStage.name.trim(),sortOrder:newStage.sortOrder});newStage.name='';newStage.sortOrder=100;await loadStages(true);ElMessage.success('已新增')}finally{stageSaving.value=false}}
async function saveStage(item){if(!item.name.trim())return ElMessage.warning('名称不能为空');item.saving=true;try{await updateKnowledgeProcessStage(item.id,{name:item.name.trim(),sortOrder:item.sortOrder,status:item.enabled?'active':'disabled'});await loadStages(true);ElMessage.success('已保存')}finally{item.saving=false}}
async function saveAllStages(){stageSaving.value=true;try{await saveKnowledgeProcessStages({workshopCode:stageWorkshopCode.value,items:stageRows.value.map(item=>({id:item.id,name:item.name.trim(),sortOrder:item.sortOrder,status:item.enabled?'active':'disabled'}))});await loadStages(true);ElMessage.success('全部配置已保存')}finally{stageSaving.value=false}}
async function deleteStage(item){try{const usageCount=Number(item.usageCount)||0;await ElMessageBox.confirm(`确认删除工序"${item.name}"？${usageCount>0?`该工序下有 ${usageCount} 条知识，删除后相关知识的工序字段将被清空。`:''}`,'删除工序',{type:'warning',confirmButtonText:'确认删除'});await deleteKnowledgeProcessStage(item.id);await loadStages(true);ElMessage.success('已删除')}catch{ /* 用户取消 */ }}
async function searchEquipment(keyword){if(!keyword){equipmentOptions.value=[];return}equipmentLoading.value=true;try{const result=await getEquipment({searchKeyword:keyword,workshopCode:form.workshopCode});equipmentOptions.value=(result.data||[]).map(item=>({id:item.id,name:item.equipmentName}))}finally{equipmentLoading.value=false}}
async function addTag(){if(!newTag.value.trim())return ElMessage.warning('请填写标签名称');tagSaving.value=true;try{await createKnowledgeTag({workshopCode:stageWorkshopCode.value,name:newTag.value.trim()});newTag.value='';await loadTags(true);ElMessage.success('标签已新增')}finally{tagSaving.value=false}}
async function removeTag(item){try{await ElMessageBox.confirm(`从可选标签中删除“${item.name}”？已有知识上的标签文字会保留。`,'删除标签',{type:'warning'});await deleteKnowledgeTag(item.id);await loadTags(true);ElMessage.success('标签已删除')}catch{/* 用户取消 */}}
function goEquipment(){stageVisible.value=false;router.push({path:'/equipment',query:{workshopCode:stageWorkshopCode.value}})}
function updateTags(val){form.tags=Array.isArray(val)?val.join(','):''}
async function submit(){
  if(!form.title.trim()||!form.category.trim())return ElMessage.warning('请填写标题和分类')
  const pickedFile=selectedFile.value||rawFile(uploadFiles.value.at(-1))||rawFile(uploadRef.value?.uploadFiles?.at(-1))
  if(form.entryType==='document'&&!pickedFile)return ElMessage.warning('请选择资料附件')
  if(form.entryType==='fault'&&(!form.faultSymptom.trim()||!form.solution.trim()))return ElMessage.warning('请填写故障现象和处理方法')
  const data=new FormData();Object.entries(form).forEach(([key,value])=>{if(key==='tagList')return;data.append(key,value)});if(pickedFile)data.append('file',pickedFile,pickedFile.name||'knowledge-upload.bin')
  submitting.value=true;uploadProgress.value=0;try{await createKnowledgeEntry(data,event=>{if(event.total)uploadProgress.value=Math.min(99,Math.round(event.loaded*100/event.total))});uploadProgress.value=100;ElMessage.success('知识已提交');createVisible.value=false;await Promise.all([load(),loadStats()])}finally{submitting.value=false}
}
async function openDetail(item){const result=await getKnowledgeEntry(item.id);detail.value=result.data;detailVisible.value=true;item.viewCount=detail.value.viewCount}
async function download(item){downloading.value=true;try{const blob=await downloadKnowledgeFile(item.id);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=item.originalFilename||'知识附件';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}finally{downloading.value=false}}
function fileExtension(item){return String(item?.originalFilename||'').toLowerCase().match(/\.[^.]+$/)?.[0]||''}
function canPreview(item){return ['.pdf','.txt','.md','.csv','.png','.jpg','.jpeg','.gif','.webp'].includes(fileExtension(item))}
function closePreview(){if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value=''}
async function openPreview(item){previewLoading.value=true;try{closePreview();const blob=await previewKnowledgeFile(item.id);previewKind.value=['.png','.jpg','.jpeg','.gif','.webp'].includes(fileExtension(item))?'image':'document';previewUrl.value=URL.createObjectURL(blob);previewVisible.value=true}finally{previewLoading.value=false}}
async function removeEntry(item){await ElMessageBox.confirm(`确认彻底删除“${item.title}”吗？数据库记录和服务器附件都将删除，且无法恢复。`,'彻底删除知识',{type:'error',confirmButtonText:'彻底删除'});await deleteKnowledgeEntry(item.id);ElMessage.success('知识及附件已彻底删除');detailVisible.value=false;await Promise.all([load(),loadStats()])}
function formatDate(value){return String(value||'').slice(0,10)}
function formatTime(value){return String(value||'').replace('T',' ').slice(0,16)}
function formatSize(bytes){const value=Number(bytes)||0;if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`}
onMounted(async()=>{try{await Promise.all([load(),loadStats(),loadStages(false),loadTags(false)])}catch{ /* 全局请求拦截器已提示 */ }})
</script>

<style scoped>
.knowledge-page{--knowledge:#087f78;--knowledge-dark:#075f5b}.knowledge-hero{position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px;padding:30px;border-radius:22px;color:#effffd;background:linear-gradient(135deg,#073d46,#087f78 62%,#16a394);box-shadow:0 18px 45px rgba(8,127,120,.18)}.knowledge-hero:after{content:"";position:absolute;right:-60px;top:-100px;width:260px;height:260px;border:1px solid rgba(255,255,255,.12);border-radius:50%;box-shadow:0 0 0 38px rgba(255,255,255,.04),0 0 0 76px rgba(255,255,255,.03)}.knowledge-hero>div{position:relative;z-index:1}.knowledge-hero span{font-size:10px;font-weight:800;letter-spacing:.19em;color:#8ff5e7}.knowledge-hero h2{max-width:680px;margin:10px 0 8px;font-size:28px}.knowledge-hero p{margin:0;color:#b8e5df;font-size:13px}.hero-actions{display:flex;gap:10px}.ghost-button{color:#fff;border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.1)}
.knowledge-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.knowledge-metrics article{display:flex;align-items:center;gap:14px;padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.metric-symbol{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;font-size:20px}.metric-symbol.is-all{color:#0f766e;background:#ccfbf1}.metric-symbol.is-doc{color:#2563eb;background:#dbeafe}.metric-symbol.is-fault{color:#c2410c;background:#ffedd5}.metric-symbol.is-view{color:#7c3aed;background:#ede9fe}.knowledge-metrics strong,.knowledge-metrics small{display:block}.knowledge-metrics strong{font-size:22px}.knowledge-metrics small{margin-top:3px;color:var(--muted)}
.knowledge-filter{display:grid;grid-template-columns:minmax(260px,1.5fr) 150px 190px auto auto;gap:10px;margin-bottom:18px;padding:16px;border:1px solid var(--line);border-radius:16px;background:#fff}.knowledge-content{padding:18px;border:1px solid var(--line);border-radius:18px;background:#fff}.content-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.content-head strong{font-size:16px}.content-head span{margin-left:8px;color:var(--muted);font-size:12px}.knowledge-grid{min-height:160px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.knowledge-card{min-height:260px;display:flex;flex-direction:column;padding:18px;border:1px solid #e5e9ef;border-radius:16px;background:linear-gradient(180deg,#fff,#fbfcfd);cursor:pointer;transition:.2s ease}.knowledge-card:hover{transform:translateY(-3px);border-color:#85d8ce;box-shadow:0 14px 32px rgba(7,95,91,.1)}.card-top,.knowledge-card footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.type-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700}.type-chip.is-document{color:#1d4ed8;background:#eff6ff}.type-chip.is-fault{color:#b45309;background:#fff7ed}.card-date{color:#94a3b8;font-size:11px}.knowledge-card h3{margin:17px 0 9px;font-size:16px;line-height:1.45}.knowledge-card>p{display:-webkit-box;overflow:hidden;margin:0;color:#697386;font-size:12px;line-height:1.7;-webkit-box-orient:vertical;-webkit-line-clamp:3}.card-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;color:#536174;font-size:11px}.card-meta span{display:flex;align-items:center;gap:4px}.tag-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.knowledge-card footer{margin-top:auto;padding-top:14px;border-top:1px solid #eef0f4;color:#8893a4;font-size:11px}.knowledge-card footer span{display:flex;align-items:center;gap:4px}.knowledge-pagination{display:flex;justify-content:center;margin-top:20px}
.entry-type-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;padding:5px;border-radius:12px;background:#f2f5f7}.entry-type-switch button{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:0;border-radius:9px;color:#64748b;background:transparent;cursor:pointer}.entry-type-switch button.active{color:#087f78;background:#fff;box-shadow:0 4px 12px rgba(15,23,42,.08);font-weight:800}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.knowledge-detail{padding:0 4px 30px}.detail-heading{padding:20px;border-radius:16px;background:#f4faf9}.detail-heading h2{margin:14px 0 8px;font-size:22px}.detail-heading p{margin:0;color:#64748b}.detail-tags{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}.knowledge-detail section{padding:16px 2px;border-bottom:1px solid var(--line)}.knowledge-detail section h3{margin:0 0 9px;font-size:14px}.knowledge-detail section p{margin:0;white-space:pre-wrap;color:#465266;font-size:13px;line-height:1.85}.detail-file{display:flex;align-items:center;gap:12px;margin-top:18px;padding:14px;border:1px solid #cde9e5;border-radius:14px;background:#f2fbfa}.detail-file>.el-icon{font-size:24px;color:#087f78}.detail-file div{min-width:0;flex:1}.detail-file strong,.detail-file small{display:block}.detail-file strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.detail-file small{margin-top:4px;color:#83909f}.detail-footer{display:flex;justify-content:space-between;gap:12px;margin-top:18px;color:#8994a5;font-size:11px}.archive-button{width:100%;margin-top:24px}
.detail-file .file-actions{display:flex;flex:0 0 auto;gap:8px}.file-preview{height:min(78vh,900px);display:grid;place-items:center;overflow:auto;background:#eef1f4}.file-preview iframe{width:100%;height:100%;border:0;background:#fff}.file-preview img{max-width:100%;max-height:100%;object-fit:contain}
.stage-create,.stage-row{display:grid;grid-template-columns:minmax(220px,1fr) 130px 92px auto auto;gap:10px;align-items:center}.stage-create{padding-bottom:14px;border-bottom:1px solid var(--line)}.stage-list{max-height:420px;overflow:auto}.stage-row{padding:10px 0;border-bottom:1px solid #edf1f3}.stage-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:14px}.stage-tip{margin:0;color:#7b8795;font-size:12px}.knowledge-filter{grid-template-columns:minmax(260px,1.5fr) 150px 150px 190px auto auto}
.field-help{display:block;margin-top:5px;color:#8a94a4;font-size:11px}.manager-heading,.manager-section h3{margin:0 0 8px;font-size:14px}.manager-section{display:flex;align-items:center;justify-content:space-between;gap:16px}.manager-section p{margin:0;color:#7b8795;font-size:12px}.manager-section.is-tags{align-items:flex-end}.tag-create{display:flex;gap:8px;width:min(390px,100%)}.managed-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding:12px;border-radius:10px;background:#f7f9fb}.managed-tags .el-empty{width:100%;padding:5px 0}
@media(max-width:1150px){.knowledge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-filter{grid-template-columns:1fr 1fr 1fr auto auto}}
@media(max-width:760px){.knowledge-hero{align-items:stretch;flex-direction:column;padding:22px}.knowledge-hero h2{font-size:22px}.hero-actions{flex-wrap:wrap}.hero-actions .el-button{flex:1}.knowledge-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-filter{grid-template-columns:1fr}.knowledge-grid{grid-template-columns:1fr}.form-grid,.stage-create,.stage-row{grid-template-columns:1fr}.detail-footer{flex-direction:column}}
.md-content{line-height:1.8;color:#374151;word-break:break-word}.md-content :is(h1,h2,h3,h4){margin:14px 0 6px;color:#1d2b3a}.md-content h1{font-size:20px}.md-content h2{font-size:18px}.md-content h3{font-size:16px}.md-content p{margin:6px 0}.md-content ul,.md-content ol{margin:6px 0;padding-left:22px}.md-content li{margin:3px 0}.md-content code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-size:13px;color:#c41d4f}.md-content pre{background:#1d2b3a;color:#e2e8f0;padding:12px 14px;border-radius:8px;overflow-x:auto;margin:10px 0}.md-content pre code{background:transparent;color:inherit;padding:0}.md-content blockquote{border-left:3px solid #94a3b8;margin:8px 0;padding:4px 14px;color:#64748b;background:#f8fafc}.md-content a{color:#2563eb;text-decoration:underline}.md-content table{border-collapse:collapse;width:100%;margin:10px 0}.md-content th,.md-content td{border:1px solid #e3e8ef;padding:6px 10px;text-align:left}.md-content th{background:#f8fafc;font-weight:600}
</style>

<template>
  <section class="work-storage" aria-label="数据管理">
    <DataCatalog :legacy-summary="summary" :selection-disabled="mutating" @category="selectCategory" @refresh="load" />

    <section v-if="showLegacy" class="storage-table-panel">
      <div class="storage-toolbar">
        <div class="storage-scope"><strong>履职照片</strong><span class="storage-count">{{total}} 份资料</span></div>
        <div class="storage-controls"><label>更新早于<input v-model="cutoff" type="date" :max="yesterday" :disabled="busy" @change="page=1;load()" aria-label="资料更新截止日期"/></label><button class="batch-cleanup" :disabled="busy" @click="cleanupFunction">{{busy?'处理中…':'清理过期资料'}}</button><button :disabled="busy" @click="load">刷新</button></div>
      </div>
      <p v-if="error" class="storage-error" role="alert">{{error}}</p><p v-if="message" class="storage-message" role="status">{{message}}</p>
      <table v-if="items.length"><thead><tr><th>资料</th><th>最后更新</th><th>状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="item in items" :key="`${item.kind}:${item.id}`">
          <td class="storage-name"><b>{{item.title}}</b><small>履职照片 · {{item.fileCount}} 个文件 · {{fileSize(item.bytes)}}</small></td>
          <td data-label="最后更新">{{item.updatedAt}}</td>
          <td data-label="状态"><span :class="item.historyCount||item.referenceCount?'protected':item.eligible?'eligible':'protected'">{{item.historyCount?'历史凭证':item.referenceCount?'已关联事项':item.eligible?'可清理':item.processingCount?'处理中':'不在批量范围'}}</span></td>
          <td class="storage-actions"><button class="delete-button" :disabled="busy||!item.canDelete" @click="remove(item)">删除</button></td>
        </tr>
      </tbody></table>
      <p v-else class="storage-empty">{{busy?'正在读取资料…':'暂无资料'}}</p>
      <el-pagination v-if="total>30" v-model:current-page="page" :disabled="busy" :total="total" :page-size="30" layout="prev,pager,next" @current-change="load"/>
    </section>

  </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue'
import {ElMessageBox} from 'element-plus'
import {office} from '../api/office'
import {fileSize} from '../utils/file-display.mjs'
import DataCatalog from '../components/DataCatalog.vue'
const yesterday=new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10)
const cutoff=ref(new Date(Date.now()+8*3600000-90*86400000).toISOString().slice(0,10)),page=ref(1),items=ref([]),total=ref(0),loadingList=ref(false),mutating=ref(false),error=ref(''),message=ref('')
const busy=computed(()=>loadingList.value||mutating.value)
const kind=ref('all'),summary=ref([]),showLegacy=ref(false)
function selectCategory(id){if(mutating.value)return;showLegacy.value=id==='raw_duty_photo';items.value=[];total.value=0;error.value='';message.value='';if(showLegacy.value){kind.value=id;page.value=1;return load()}listSequence++;loadingList.value=false}
const cleanupScope=()=>({function:'all',kind:kind.value==='all'?'':kind.value,cutoff:cutoff.value})
let listSequence=0
const listParams=()=>({...cleanupScope(),page:page.value})
async function readList(params=listParams(),request=++listSequence){const r=await office.get('/work-storage',{params});if(request!==listSequence)return;items.value=r.data.items;total.value=r.data.total;summary.value=r.data.summary||[]}
async function load(){if(mutating.value)return;const request=++listSequence,params=listParams();loadingList.value=true;error.value='';try{await readList(params,request)}catch(e){if(request===listSequence)error.value=e.response?.data?.msg||'资料读取失败'}finally{if(request===listSequence)loadingList.value=false}}
function deletionExplanation(){return '照片及事项中的图片关联将永久删除，保留履职文字与审计记录。'}
async function cleanupFunction(){
  if(busy.value)return
  mutating.value=true;error.value='';message.value=''
  const scope=cleanupScope()
  try{
    const r=await office.get('/work-storage/cleanup-preview',{params:scope}),preview=r.data
    if(!preview.itemCount){message.value='当前范围无符合条件资料。';return}
    if(!Array.isArray(preview.items)||preview.items.length!==preview.itemCount)throw new Error('清理预览资料不完整，请刷新后重试')
    const historyCount=preview.items.filter(item=>item.historyCount).length
    try{await ElMessageBox.confirm(`将清理最后更新早于 ${scope.cutoff} 的 ${preview.itemCount} 份资料，共 ${fileSize(preview.totalBytes)}，包含所有分页。${historyCount?`其中包含 ${historyCount} 张历史凭证照片。`:''}${deletionExplanation(scope.kind)}删除后不可恢复。`,'一键清理资料',{type:'warning',confirmButtonText:'确认清理',cancelButtonText:'取消'})}catch{return}
    const result=await office.post('/work-storage/cleanup',{...scope,items:preview.items.map(item=>({kind:item.kind,id:item.id,revision:item.revision}))})
    message.value=`已清理 ${result.data.itemCount} 份资料，释放 ${fileSize(result.data.releasedBytes)} 数据内容。`
    page.value=1;await readList()
  }catch(e){error.value=e.response?.data?.msg||e.message||'清理失败，请刷新后重试'}finally{mutating.value=false}
}
async function remove(item){
  if(busy.value||!item.canDelete)return
  mutating.value=true;error.value='';message.value=''
  try{try{await ElMessageBox.confirm(`删除“${item.title}”（${fileSize(item.bytes)}）？${item.historyCount?'这是已提交过的历史凭证。':''}${deletionExplanation(item.kind)}删除后不可恢复。`,'管理员手动删除',{type:'warning',confirmButtonText:'确认删除',cancelButtonText:'取消'})}catch{return}const r=await office.delete(`/work-storage/${item.kind}/${item.id}`,{data:{manual:true,revision:item.revision}});message.value=`已清理 ${fileSize(r.data.releasedBytes)} 数据内容。`;if(items.value.length===1&&page.value>1)page.value--;await readList()}catch(e){error.value=e.response?.data?.msg||'清理失败，请刷新后重试'}finally{mutating.value=false}
}
onMounted(load)
</script>
<style scoped>
.work-storage{width:100%;max-width:none;margin:0;color:#183047;display:grid;gap:10px;font-size:14px;min-width:0}.work-storage p{color:#607487;font-size:13px;line-height:1.8;margin:0}.work-storage button{display:inline-flex;justify-content:center;align-items:center;gap:6px;min-height:40px;padding:8px 14px;border:1px solid #dce3eb;border-radius:7px;background:white;color:#536679;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.work-storage button:disabled{opacity:.4;cursor:default}.storage-table-panel{background:white;border:1px solid #dfe6ed;border-radius:12px;padding:20px;min-width:0}.storage-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}.storage-scope{display:flex;align-items:center;gap:12px}.storage-scope .el-select{width:132px}.storage-count{font-size:13px;color:#758697}.storage-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.storage-controls label{display:flex;gap:10px;align-items:center;font-size:13px;color:#607487}.storage-controls input{height:40px;box-sizing:border-box;padding:8px 10px;border:1px solid #dce3eb;border-radius:7px;background:white;color:#183047;font:inherit;min-width:0}.work-storage .batch-cleanup{color:#b82940;border-color:#edcfd5;background:#fffafb}.work-storage table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:13px}.work-storage th{background:#f7f9fb;color:#718295;padding:13px 12px;font-weight:500}.work-storage th:first-child{width:34%}.work-storage th:nth-child(2){width:22%}.work-storage th:last-child{width:70px;text-align:right}.work-storage td{padding:18px 12px;border-bottom:1px solid #edf1f5;vertical-align:middle;line-height:1.6;overflow-wrap:anywhere}.work-storage tr:last-child td{border-bottom:0}.storage-name b{font-weight:600}.storage-name small{display:block;margin-top:6px;color:#8795a5;font-size:12px}.storage-actions{text-align:right}.work-storage .delete-button{color:#bc2940;border:0;background:transparent;padding:6px 0;min-height:32px}.eligible{color:#258161}.protected{color:#8492a6}.work-storage .storage-error{color:#bd2438;background:#fff1f2;padding:12px;border-radius:7px;margin-bottom:12px}.work-storage .storage-message{color:#258161;background:#eaf7f3;padding:12px;border-radius:7px;margin-bottom:12px}.storage-table-panel .el-pagination{justify-content:flex-end;margin-top:18px}.work-storage .storage-empty{text-align:center;padding:54px 10px;color:#8492a6}.work-storage button:focus-visible,.work-storage input:focus-visible{outline:2px solid #087f83;outline-offset:2px}
@media(max-width:760px){.storage-table-panel{padding:16px}.storage-toolbar{gap:14px}.storage-controls{width:100%}.storage-controls label{width:100%;justify-content:space-between}.storage-controls input{flex:1;max-width:220px}.work-storage button,.storage-controls input{min-height:44px}.work-storage table,.work-storage tbody,.work-storage tr,.work-storage td{display:block;width:auto}.work-storage thead{display:none}.work-storage tr{padding:10px 0;border-bottom:1px solid #edf1f5}.work-storage tr:last-child{border-bottom:0}.work-storage td{border:0;padding:6px 0}.work-storage td[data-label]{display:flex;justify-content:space-between;gap:14px}.work-storage td[data-label]:before{content:attr(data-label);color:#8795a5;flex:none}.storage-name{padding-bottom:12px!important}.storage-actions{text-align:right}.work-storage .delete-button{min-height:44px}}
</style>

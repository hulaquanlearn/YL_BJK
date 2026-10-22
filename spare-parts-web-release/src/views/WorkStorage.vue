<template>
  <section class="work-storage" aria-label="数据管理">
    <DataCatalog :legacy-summary="summary" @category="selectCategory" @refresh="load" />

    <section v-if="showLegacy" class="storage-table-panel">
      <div class="storage-toolbar">
        <div class="storage-scope"><strong>{{kind==='attendance'?'考勤当前导入':'履职照片'}}</strong><span class="storage-count">{{total}} 份资料</span></div>
        <div class="storage-controls"><label>更新早于<input v-model="cutoff" type="date" :max="yesterday" :disabled="busy" @change="page=1;load()" aria-label="资料更新截止日期"/></label><button class="batch-cleanup" :disabled="busy" @click="cleanupFunction">{{busy?'处理中…':'清理过期资料'}}</button><button :disabled="busy" @click="load">刷新</button></div>
      </div>
      <p v-if="error" class="storage-error" role="alert">{{error}}</p><p v-if="message" class="storage-message" role="status">{{message}}</p>
      <table v-if="items.length"><thead><tr><th>资料</th><th>最后更新</th><th>保留截止</th><th>状态</th><th>操作</th></tr></thead><tbody>
        <tr v-for="item in items" :key="`${item.kind}:${item.id}`">
          <td class="storage-name"><b>{{item.title}}</b><small>{{item.kind==='raw_duty_photo'?'履职照片':'考勤'}} · {{item.fileCount}} 个文件 · {{fileSize(item.bytes)}}</small></td>
          <td data-label="最后更新">{{item.updatedAt}}</td>
          <td data-label="保留截止"><button v-if="item.kind==='attendance'" class="retention-button" :disabled="busy" @click="setRetention(item)">{{item.retentionUntil||'未设置'}}<el-icon><Edit /></el-icon></button><span v-else>—</span></td>
          <td data-label="状态"><span :class="item.historyCount||item.referenceCount?'protected':item.eligible?'eligible':'protected'">{{item.historyCount?'历史凭证':item.referenceCount?'已关联事项':item.eligible?'可清理':item.processingCount?'处理中':item.retentionUntil&&item.retentionUntil>=today?'保留期内':'不在批量范围'}}</span></td>
          <td class="storage-actions"><button class="delete-button" :disabled="busy||!item.canDelete" @click="remove(item)">删除</button></td>
        </tr>
      </tbody></table>
      <p v-else class="storage-empty">{{busy?'正在读取资料…':'暂无资料'}}</p>
      <el-pagination v-if="total>30" v-model:current-page="page" :disabled="busy" :total="total" :page-size="30" layout="prev,pager,next" @current-change="load"/>
    </section>

    <details v-if="showLegacy" class="storage-audit" @toggle="loadAudit"><summary>最近清理记录</summary><ul><li v-for="entry in audit" :key="entry.id">{{entry.created_at}} · {{entry.title}} · 清理 {{fileSize(entry.released_bytes)}} · 操作人 #{{entry.actor_id}}</li></ul><p v-if="!audit.length">暂无清理记录。</p></details>
    <el-dialog v-model="retentionOpen" title="设置保留截止日期" width="min(440px, calc(100vw - 28px))" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy"><p>{{retentionItem?.title}}</p><label class="retention-field">保留到<input v-model="retentionDate" type="date" :disabled="busy"/></label><template #footer><el-button :disabled="busy" @click="retentionOpen=false">取消</el-button><el-button type="primary" :loading="busy" @click="saveRetention">保存</el-button></template></el-dialog>
  </section>
</template>
<script setup>
import {onMounted,ref} from 'vue'
import {ElMessageBox} from 'element-plus'
import {Edit} from '@element-plus/icons-vue'
import {office} from '../api/attendance'
import {fileSize} from '../utils/attendance-display.mjs'
import DataCatalog from '../components/DataCatalog.vue'
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),yesterday=new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10)
const cutoff=ref(new Date(Date.now()+8*3600000-90*86400000).toISOString().slice(0,10)),page=ref(1),items=ref([]),total=ref(0),busy=ref(false),error=ref(''),message=ref(''),audit=ref([])
const retentionOpen=ref(false),retentionItem=ref(null),retentionDate=ref('')
const kind=ref('all'),summary=ref([]),showLegacy=ref(false)
function selectCategory(id){showLegacy.value=['attendance','raw_duty_photo'].includes(id);if(showLegacy.value){kind.value=id;page.value=1;load()}}
const cleanupScope=()=>({function:'all',kind:kind.value==='all'?'':kind.value,cutoff:cutoff.value})
async function readList(){const r=await office.get('/work-storage',{params:{...cleanupScope(),page:page.value}});items.value=r.data.items;total.value=r.data.total;summary.value=r.data.summary||[]}
async function load(){if(busy.value)return;busy.value=true;error.value='';try{await readList()}catch(e){error.value=e.response?.data?.msg||'资料读取失败'}finally{busy.value=false}}
function deletionExplanation(selectedKind){return selectedKind==='raw_duty_photo'?'照片及事项中的图片关联将永久删除，保留履职文字与审计记录。':selectedKind==='attendance'?'原始文件、对应结果与相关备注将一并删除。':'考勤会连同原文件、结果和备注删除；履职照片及其事项关联将删除，保留履职文字与审计记录。'}
async function cleanupFunction(){
  if(busy.value)return
  busy.value=true;error.value='';message.value=''
  const scope=cleanupScope()
  try{
    const r=await office.get('/work-storage/cleanup-preview',{params:scope}),preview=r.data
    if(!preview.itemCount){message.value='当前范围无符合条件资料。';return}
    if(!Array.isArray(preview.items)||preview.items.length!==preview.itemCount)throw new Error('清理预览资料不完整，请刷新后重试')
    const historyCount=preview.items.filter(item=>item.historyCount).length
    try{await ElMessageBox.confirm(`将清理最后更新早于 ${scope.cutoff} 的 ${preview.itemCount} 份资料，共 ${fileSize(preview.totalBytes)}，包含所有分页。${historyCount?`其中包含 ${historyCount} 张历史凭证照片。`:''}${deletionExplanation(scope.kind)}删除后不可恢复。`,'一键清理资料',{type:'warning',confirmButtonText:'确认清理',cancelButtonText:'取消'})}catch{return}
    const result=await office.post('/work-storage/cleanup',{...scope,items:preview.items.map(item=>({kind:item.kind,id:item.id,revision:item.revision}))})
    message.value=`已清理 ${result.data.itemCount} 份资料，释放 ${fileSize(result.data.releasedBytes)} 数据内容。`
    page.value=1;await readList();await loadAudit()
  }catch(e){error.value=e.response?.data?.msg||e.message||'清理失败，请刷新后重试'}finally{busy.value=false}
}
async function remove(item){
  if(busy.value||!item.canDelete)return
  busy.value=true;error.value='';message.value=''
  try{try{await ElMessageBox.confirm(`删除“${item.title}”（${fileSize(item.bytes)}）？${item.historyCount?'这是已提交过的历史凭证。':''}${item.retentionUntil&&item.retentionUntil>=today?`当前保留到 ${item.retentionUntil}，本次为管理员提前删除。`:``}${deletionExplanation(item.kind)}删除后不可恢复。`,'管理员手动删除',{type:'warning',confirmButtonText:'确认删除',cancelButtonText:'取消'})}catch{return}const r=await office.delete(`/work-storage/${item.kind}/${item.id}`,{data:{manual:true,revision:item.revision}});message.value=`已清理 ${fileSize(r.data.releasedBytes)} 数据内容。`;if(items.value.length===1&&page.value>1)page.value--;await readList();await loadAudit()}catch(e){error.value=e.response?.data?.msg||'清理失败，请刷新后重试'}finally{busy.value=false}
}
function setRetention(item){if(busy.value)return;retentionItem.value=item;retentionDate.value=item.retentionUntil||'';retentionOpen.value=true}
async function saveRetention(){if(busy.value)return;busy.value=true;error.value='';try{await office.patch(`/work-storage/${retentionItem.value.kind}/${retentionItem.value.id}/retention`,{retentionUntil:retentionDate.value||null,revision:retentionItem.value.revision});retentionOpen.value=false;await readList()}catch(e){error.value=e.response?.data?.msg||'保留日期保存失败，请刷新后重试'}finally{busy.value=false}}
async function loadAudit(event){if(event&&!event.target.open)return;try{const r=await office.get('/work-storage/audit');audit.value=r.data}catch{error.value='清理日志读取失败'}}
onMounted(load)
</script>
<style scoped>
.work-storage{max-width:1440px;margin:auto;color:#183047;display:grid;gap:16px;font-size:14px;min-width:0}.work-storage p{color:#607487;font-size:13px;line-height:1.8;margin:0}.work-storage button{display:inline-flex;justify-content:center;align-items:center;gap:6px;min-height:40px;padding:8px 14px;border:1px solid #dce3eb;border-radius:7px;background:white;color:#536679;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.work-storage button:disabled{opacity:.4;cursor:default}.storage-table-panel{background:white;border:1px solid #dfe6ed;border-radius:12px;padding:20px;min-width:0}.storage-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}.storage-scope{display:flex;align-items:center;gap:12px}.storage-scope .el-select{width:132px}.storage-count{font-size:13px;color:#758697}.storage-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.storage-controls label{display:flex;gap:10px;align-items:center;font-size:13px;color:#607487}.storage-controls input,.retention-field input{height:40px;box-sizing:border-box;padding:8px 10px;border:1px solid #dce3eb;border-radius:7px;background:white;color:#183047;font:inherit;min-width:0}.work-storage .batch-cleanup{color:#b82940;border-color:#edcfd5;background:#fffafb}.work-storage table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:13px}.work-storage th{background:#f7f9fb;color:#718295;padding:13px 12px;font-weight:500}.work-storage th:first-child{width:34%}.work-storage th:nth-child(2){width:22%}.work-storage th:last-child{width:70px;text-align:right}.work-storage td{padding:18px 12px;border-bottom:1px solid #edf1f5;vertical-align:middle;line-height:1.6;overflow-wrap:anywhere}.work-storage tr:last-child td{border-bottom:0}.storage-name b{font-weight:600}.storage-name small{display:block;margin-top:6px;color:#8795a5;font-size:12px}.work-storage .retention-button{border:0;background:transparent;padding:0;min-height:32px;color:#52697b;white-space:normal;text-align:left;justify-content:start}.storage-actions{text-align:right}.work-storage .delete-button{color:#bc2940;border:0;background:transparent;padding:6px 0;min-height:32px}.eligible{color:#258161}.protected{color:#8492a6}.work-storage .storage-error{color:#bd2438;background:#fff1f2;padding:12px;border-radius:7px;margin-bottom:12px}.work-storage .storage-message{color:#258161;background:#eaf7f3;padding:12px;border-radius:7px;margin-bottom:12px}.storage-table-panel .el-pagination{justify-content:flex-end;margin-top:18px}.work-storage .storage-empty{text-align:center;padding:54px 10px;color:#8492a6}.storage-audit{font-size:13px;color:#607487;padding:4px 0}.storage-audit summary{cursor:pointer;color:#6b7e90;width:fit-content}.storage-audit ul{padding-left:20px}.storage-audit li{line-height:1.8;margin-top:8px}.retention-field{display:grid;gap:8px;margin:18px 0}.work-storage button:focus-visible,.work-storage input:focus-visible{outline:2px solid #087f83;outline-offset:2px}
@media(max-width:760px){.storage-table-panel{padding:16px}.storage-toolbar{gap:14px}.storage-controls{width:100%}.storage-controls label{width:100%;justify-content:space-between}.storage-controls input{flex:1;max-width:220px}.work-storage button,.storage-controls input{min-height:44px}.work-storage table,.work-storage tbody,.work-storage tr,.work-storage td{display:block;width:auto}.work-storage thead{display:none}.work-storage tr{padding:10px 0;border-bottom:1px solid #edf1f5}.work-storage tr:last-child{border-bottom:0}.work-storage td{border:0;padding:6px 0}.work-storage td[data-label]{display:flex;justify-content:space-between;gap:14px}.work-storage td[data-label]:before{content:attr(data-label);color:#8795a5;flex:none}.storage-name{padding-bottom:12px!important}.storage-actions{text-align:right}.work-storage .retention-button{min-height:24px}.work-storage .delete-button{min-height:44px}.storage-audit{padding:2px 0}}
</style>

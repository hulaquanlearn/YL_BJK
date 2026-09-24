<template>
  <main class="report-viewer">
    <section v-if="!active" class="panel">
      <header class="panel-head"><div><h2>检查通报</h2><p>查看并导出原粮车间已核对的检查通报。</p></div></header>
      <form class="filters" @submit.prevent="page=1;loadList()">
        <label>标题<input v-model="title" placeholder="搜索通报标题"></label>
        <label>更新起始日<input v-model="from" type="date"></label>
        <label>更新截止日<input v-model="to" type="date"></label>
        <button type="submit">查询</button>
      </form>
      <p v-if="loading">正在加载通报…</p>
      <div v-else class="reports">
        <button v-for="report in reports" :key="report.id" type="button" @click="openReport(report.id)">
          <strong>{{ report.title }}</strong><span>{{ report.sourceCount }} 张截图 · {{ report.updatedAt }}</span><b>查看 →</b>
        </button>
        <p v-if="!reports.length">没有符合条件的通报。</p>
      </div>
      <footer class="pages"><span>共 {{ total }} 份 · 第 {{ page }} 页</span><button type="button" :disabled="page<=1" @click="page--;loadList()">上一页</button><button type="button" :disabled="page*20>=total" @click="page++;loadList()">下一页</button></footer>
    </section>
    <template v-else>
      <header class="panel detail-head"><button type="button" @click="active=null">← 返回列表</button><div><h2>{{ active.header.title }}</h2><p>原粮车间 · 只读</p></div><button type="button" class="primary" :disabled="busy||!canExport" @click="download">导出 Excel</button></header>
      <p v-if="!canExport" class="export-note">{{ exportNote }}</p>
      <section class="panel report-meta"><p><b>检查时间</b>{{ active.header.checkTime || '未填写' }}</p><p><b>检查范围</b>{{ active.header.checkScope || '未填写' }}</p><p><b>检查人员</b>{{ active.header.inspectors || '未填写' }}</p><p><b>检查项目</b>{{ active.header.checkItems || '未填写' }}</p></section>
      <section class="panel"><h3>问题明细 · {{ active.issues.length }} 项</h3>
        <article v-for="(issue,index) in active.issues" :key="issue.id" class="issue">
          <div class="issue-title"><strong>问题 {{ index+1 }}</strong><span>{{ issue.reviewStatus==='confirmed'?'人工已确认':'待核对' }}</span></div>
          <div class="issue-meta"><span>工段：{{ issue.segment || '未填写' }}</span><span>位置：{{ issue.location || '未填写' }}</span><span>设备编号：{{ issue.equipment || '未填写' }}</span><span>类别：{{ issue.category || '未填写' }}</span></div>
          <p><b>问题描述</b>{{ issue.problem || '未填写' }}</p><p><b>整改意见</b>{{ issue.rectification || '未填写' }}</p><p v-if="issue.remarks"><b>备注</b>{{ issue.remarks }}</p>
          <div v-if="issue.photos?.length" class="photos"><InspectionImage v-for="(photo,photoIndex) in issue.photos" :key="`${photo.sourceId}-${photoIndex}`" :notice-id="active.id" :source-id="photo.sourceId" :rect="photo.rect" :alt="`问题 ${index+1} 的现场照片`" /></div>
        </article>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { inspection } from '../api/inspection'
import InspectionImage from '../components/InspectionImage.vue'

const reports=ref([]),active=ref(null),loading=ref(false),busy=ref(false)
const page=ref(1),total=ref(0),title=ref(''),from=ref(''),to=ref('')
const canExport=computed(()=>Boolean(active.value?.issues?.length)&&active.value.issues.every(row=>row.reviewStatus==='confirmed')&&active.value.sources.every(row=>row.reviewed))
const exportNote=computed(()=>{
  if(!active.value?.issues?.length)return '尚无已核对的问题，暂不能导出。'
  const pending=active.value.issues.filter(row=>row.reviewStatus!=='confirmed').length
  if(pending)return `还有 ${pending} 条问题待管理员核对，暂不能导出。`
  const sources=active.value.sources.filter(row=>!row.reviewed).length
  return sources?`还有 ${sources} 张原截图待管理员核对，暂不能导出。`:''
})
async function loadList(){
  loading.value=true
  try{const response=await inspection.get('/reports',{params:{page:page.value,pageSize:20,title:title.value,from:from.value,to:to.value}});reports.value=response.data.items;total.value=response.data.total}
  finally{loading.value=false}
}
async function openReport(id){
  loading.value=true
  try{const response=await inspection.get(`/reports/${id}`);active.value=response.data}
  finally{loading.value=false}
}
async function download(){
  if(!canExport.value){ElMessage.warning(exportNote.value);return}
  busy.value=true
  try{
    const response=await inspection.get(`/reports/${active.value.id}/export`,{responseType:'blob'})
    const url=URL.createObjectURL(response.data),a=document.createElement('a')
    a.href=url;a.download=`检查通报-${active.value.id}.xlsx`;document.body.appendChild(a);a.click();a.remove()
    setTimeout(()=>URL.revokeObjectURL(url),60000)
  }finally{busy.value=false}
}
onMounted(loadList)
</script>

<style scoped>
.report-viewer{max-width:1100px;margin:auto;display:grid;gap:16px;color:#243047}.panel{padding:22px;border:1px solid #e3e8ef;border-radius:14px;background:#fff}.panel h2,.panel h3{margin:0}.panel h2{font-size:22px}.panel h3{font-size:18px}.panel p{color:#657287;line-height:1.65}.panel-head,.detail-head,.issue-title,.pages{display:flex;align-items:center;justify-content:space-between;gap:14px}.detail-head>div{flex:1}.filters{display:grid;grid-template-columns:2fr 1fr 1fr auto;align-items:end;gap:12px;margin-top:20px}.filters label{display:grid;gap:6px;color:#586779;font-size:13px}.filters input{height:40px;padding:8px;border:1px solid #d6dfea;border-radius:8px;font:inherit}.report-viewer button{min-height:40px;padding:8px 14px;border:1px solid #d6dfea;border-radius:8px;background:#fff;color:#34445b;cursor:pointer;font:inherit}.report-viewer button:disabled{opacity:.5;cursor:not-allowed}.report-viewer .primary{background:#c51e33;border-color:#c51e33;color:#fff}.reports{display:grid;gap:9px;margin-top:18px}.reports button{display:flex;align-items:center;gap:12px;text-align:left}.reports button strong{flex:1}.reports button span{color:#657287;font-size:13px}.reports button b{color:#b71929}.pages{justify-content:flex-end;margin-top:16px}.pages span{margin-right:auto;color:#657287}.export-note{margin:0;padding:12px 16px;border-radius:8px;background:#fff8e8;color:#98610e}.report-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.report-meta p,.issue p{margin:0;white-space:pre-wrap}.report-meta b,.issue p b{display:block;color:#3d4b5c;font-size:13px}.issue{padding:18px 0;border-top:1px solid #e8edf3;display:grid;gap:12px}.issue:first-of-type{margin-top:16px}.issue-title span{padding:4px 9px;border-radius:20px;background:#eef3f9;color:#5e6b7d;font-size:12px}.issue-meta{display:flex;flex-wrap:wrap;gap:10px 18px;color:#647287;font-size:13px}.photos{display:flex;flex-wrap:wrap;gap:10px}.photos :deep(img){max-width:220px;max-height:180px;object-fit:contain;border:1px solid #e3e8ef;border-radius:8px;background:#f5f7f9}@media(max-width:650px){.panel{padding:16px}.filters,.report-meta{grid-template-columns:1fr}.reports button{display:grid}.detail-head{flex-wrap:wrap}.detail-head>div{order:-1;flex-basis:100%}.photos :deep(img){max-width:45%}}
</style>

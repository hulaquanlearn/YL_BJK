<template>
 <section class="data-catalog" aria-label="项目数据管理">
  <div class="data-toolbar">
   <nav v-if="data" class="data-function-groups" aria-label="按功能查看数据"><button v-for="group in functionalGroups" :key="group.id" :class="{active:activeGroup?.id===group.id}" :aria-pressed="activeGroup?.id===group.id" :disabled="busy||selectionDisabled" @click="selectGroup(group)">{{group.title}}</button></nav>
   <el-button :loading="busy" :disabled="selectionDisabled" @click="load" aria-label="刷新数据"><el-icon><Refresh /></el-icon></el-button>
  </div>
  <nav v-if="data&&activeGroup" class="data-categories" :aria-label="activeGroup.title+'数据分类'"><button v-for="c in activeGroup.items" :key="c.id" :class="{active:selected===c.id}" :aria-pressed="selected===c.id" :disabled="busy||selectionDisabled" @click="select(c.id)"><span>{{c.title}}</span><strong v-if="c.id!=='database'">{{c.id==='ai_logs'?c.items?.[0]?.fileCount||0:c.count}} <small>{{c.id==='ai_logs'?'条':c.unit||'项'}}</small></strong><small>{{fileSize(c.bytes)}}<template v-if="c.id==='database'"> · 受保护</template></small></button></nav>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="message" :title="message" type="success" :closable="false"/>
  <template v-if="data">
   <section v-if="selected==='database'" class="data-detail"><h3>业务数据库</h3><p>{{data.storageNote}}</p><p>库存、出入库、审批等通过对应业务流程维护，不提供整库清空。</p><details><summary>查看数据表占用（估算）</summary><ul class="database-list"><li v-for="table in data.database.tables" :key="table.name"><span>{{table.name}}</span><span>约 {{table.rowCount}} 行 · {{fileSize(table.bytes)}}</span></li></ul></details></section>
   <section v-else-if="category" class="data-detail">
    <header><div><h3>{{category.title}}</h3><p v-if="category.storageKind!=='database'">{{category.description}}</p></div><el-button v-if="['ai_logs','robot_archives'].includes(selected)" type="danger" plain :disabled="busy" @click="cleanup">{{selected==='ai_logs'?'清理90天前记录':'回收删除归档'}}</el-button></header>
    <table v-if="category.items.length"><thead><tr><th>资料名称</th><th>占用 / 状态</th><th>操作</th></tr></thead><tbody><tr v-for="item in visibleItems" :key="item.id"><td><strong>{{item.title}}</strong><small v-if="item.updatedAt">{{time(item.updatedAt)}}</small></td><td>{{fileSize(item.bytes)}}<small v-if="item.recordCount!=null">{{item.recordCount}} 条记录 · 受保护</small><small v-if="selected==='robot'">{{item.annotationCount}} 处注释</small><small v-if="selected==='knowledge'">{{item.historyCount}} 个历史版本</small><small v-if="selected==='models'">{{item.builtIn?'内置模型':`关联 ${item.referenceCount} 种备件`}}</small><small v-if="selected==='ai_logs'">{{item.fileCount}} 条记录；{{item.eligibleCount}} 条早于保留范围（未完成记录不清理）</small></td><td class="data-actions"><router-link v-if="item.link" :to="item.link">前往管理</router-link><template v-else-if="selected==='robot'"><el-button link :disabled="busy" @click="remove(item,'analysis')">清除分析</el-button><el-button link type="danger" :disabled="busy" @click="remove(item,'robot')">删除备份</el-button></template><el-button v-else-if="['knowledge','models','images'].includes(selected)" link type="danger" :disabled="busy||!!item.builtIn" @click="remove(item,selected)">{{selected==='images'?'清除图片':'删除资料'}}</el-button><span v-else>{{selected==='robot_archives'?'等待归档清理':'近90天自动保留'}}</span></td></tr></tbody></table><p v-else class="data-empty">暂无数据</p>
    <el-pagination v-if="category.items.length>20" v-model:current-page="page" :page-size="20" :total="category.items.length" layout="prev,pager,next"/>
   </section>
  </template>
 </section>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue'
import {ElMessageBox} from 'element-plus'
import {office} from '../api/office'
import {fileSize} from '../utils/file-display.mjs'
import {groupDataCategories} from '../utils/data-category-groups.mjs'
const props=defineProps({legacySummary:{type:Array,default:()=>[]},selectionDisabled:{type:Boolean,default:false}}),emit=defineEmits(['category','refresh'])
const data=ref(null),busy=ref(false),error=ref(''),message=ref(''),selected=ref('inventory_records'),page=ref(1)
const categories=computed(()=>[...(data.value?.categories||[]),...['raw_duty_photo'].map(id=>{const row=props.legacySummary.find(r=>r.kind===id);return {id,title:'履职照片',count:row?.itemCount||0,bytes:row?.bytes||0}}),{id:'database',title:'业务数据库',bytes:data.value?.database?.bytes||0}])
const functionalGroups=computed(()=>groupDataCategories(categories.value))
const activeGroup=computed(()=>functionalGroups.value.find(group=>group.items.some(item=>item.id===selected.value)))
function selectGroup(group){if(busy.value||props.selectionDisabled)return;if(!group.items.some(item=>item.id===selected.value))select(group.items[0].id)}
function select(id){if(busy.value||props.selectionDisabled)return;selected.value=id;page.value=1;emit('category',id)}
const category=computed(()=>data.value?.categories.find(c=>c.id===selected.value)),visibleItems=computed(()=>category.value?.items.slice((page.value-1)*20,page.value*20)||[])
const time=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
async function read(){data.value=(await office.get('/data-management')).data;if(!categories.value.some(item=>item.id===selected.value)){selected.value=categories.value[0]?.id||'database';page.value=1;emit('category',selected.value)}}
async function load(){if(busy.value)return;busy.value=true;error.value='';try{await read();emit('refresh')}catch(e){error.value=e.response?.data?.msg||'数据读取失败'}finally{busy.value=false}}
async function remove(item,kind){if(busy.value)return;const effects={analysis:'清除中文注释、总览、分批结果和对话，保留原始ZIP。正在分析时不能清除。',robot:'备份及分析将从所有使用者列表移除，原文件与分析进入删除归档；需要释放空间可随后回收旧归档。',knowledge:'删除知识条目、历史版本及所有附件，将不再被知识问答检索。',models:'删除模型及其上传文件，解除已绑定的备件关系，保留备件及库存。',images:'删除备件图片，保留备件及库存。'};try{await ElMessageBox.confirm(`“${item.title}”：${effects[kind]}`,'确认数据操作',{type:'warning',confirmButtonText:kind==='robot'?'删除并归档':'确认清除',cancelButtonText:'取消'})}catch{return}busy.value=true;error.value='';message.value='';try{const url={analysis:`/data-management/robot/${item.id}/analysis`,robot:`/robot-program/library/${item.id}`,knowledge:`/knowledge/${item.id}`,models:`/part-models/${item.id}`,images:`/parts/${item.id}/image`}[kind];const result=await office.delete(url,{data:{revision:item.revision}});message.value=result.msg||'操作已完成';await read();page.value=1}catch(e){error.value=e.response?.data?.msg||'操作失败，请刷新重试'}finally{busy.value=false}}
let activePreviewId=null,disposed=false
async function releaseCleanupPreview(id){if(!id)return;try{await office.delete(`/data-management/cleanup-preview/${encodeURIComponent(id)}`)}catch{/* Expiry is a fallback if cancellation cannot reach the server. */}}
async function cleanup(){
 if(busy.value||props.selectionDisabled)return
 busy.value=true;error.value='';message.value='';let previewId=null
 try{
  const p=(await office.post('/data-management/cleanup-preview',{kind:selected.value})).data
  previewId=p.id||null;activePreviewId=previewId
  if(disposed)return
  if(!p.itemCount){message.value='当前没有符合条件的可清理文件';return}
  try{await ElMessageBox.confirm(`将回收 ${p.itemCount} 个文件，共 ${fileSize(p.totalBytes)}。${p.kind==='ai_logs'?'保留近90天及未完成记录；旧日期的调用用量汇总也会减少。':'已删除备份的原ZIP与分析移入私有回收目录，删除标记保留。'}回收资料可由管理员恢复，磁盘空间不会释放。`,'核对清理范围',{type:'warning',confirmButtonText:'确认清理',cancelButtonText:'取消'})}catch{return}
  if(disposed)return
  const result=(await office.post('/data-management/cleanup',{previewId})).data;message.value=`已回收 ${fileSize(result.recycledBytes||0)}，磁盘空间未释放`;await read()
 }catch(e){error.value=e.response?.data?.msg||'清理失败，请刷新核对'}finally{if(activePreviewId===previewId)activePreviewId=null;await releaseCleanupPreview(previewId);busy.value=false}
}
onBeforeUnmount(()=>{disposed=true;void releaseCleanupPreview(activePreviewId);activePreviewId=null})
onMounted(load)
</script>
<style scoped>
.data-function-groups{display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;border-bottom:1px solid #dfe7ee}
.data-function-groups>button{border:0;border-bottom:2px solid transparent;padding:11px 16px;background:transparent;color:#667b8c;cursor:pointer;font:inherit;font-size:14px;white-space:nowrap}
.data-function-groups>button.active{color:#087f83;border-bottom-color:#16898c;font-weight:600}
.data-function-groups>button:disabled{cursor:wait;opacity:.6}
@media(max-width:800px){.data-function-groups{flex-wrap:nowrap;overflow-x:auto}.data-function-groups>button{padding:10px 12px}}
.data-catalog{display:grid;gap:10px;color:#243b50;margin-bottom:10px;min-width:0}.data-detail>header{display:flex;align-items:center;justify-content:space-between;gap:20px}.data-catalog h3{font-size:17px;margin:0 0 9px}.data-catalog p{font-size:13px;color:#748798;line-height:1.8;margin:6px 0}.data-toolbar{display:flex;align-items:flex-start;gap:12px}.data-toolbar>.el-button{flex:none}.data-categories{display:flex;flex-wrap:wrap;gap:7px;flex:1;min-width:0}.data-categories button{display:inline-flex;align-items:center;gap:8px;text-align:left;border:1px solid #dfe7ee;background:white;border-radius:7px;padding:9px 12px;color:inherit;cursor:pointer;font:inherit}.data-categories button.active{border-color:#16898c;background:#eff9f7;box-shadow:inset 0 0 0 1px #16898c}.data-categories button>span{font-size:13px}.data-categories strong{font-size:13px}.data-categories small{font-size:11px;font-weight:400;color:#748798}.data-detail{background:white;border:1px solid #dfe7ee;border-radius:12px;padding:14px;min-width:0}.data-detail table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px;table-layout:fixed}.data-detail th{text-align:left;background:#f7f9fb;color:#788a9c;padding:12px}.data-detail th:first-child{width:45%}.data-detail td{border-bottom:1px solid #edf1f5;padding:9px 12px;overflow-wrap:anywhere}.data-detail td>small{display:block;color:#7c8e9f;margin-top:3px;line-height:1.4}.data-detail td>strong{font-weight:550}.data-actions{white-space:normal}.data-actions :deep(.el-button){margin:0 12px 0 0}.data-catalog details{font-size:13px;color:#748798;line-height:2}.data-catalog summary{cursor:pointer}.database-list{list-style:none;padding:0}.database-list li{display:flex;justify-content:space-between;gap:16px;overflow-wrap:anywhere}.data-empty{padding:25px;text-align:center}.data-catalog button:focus-visible{outline:2px solid #087f83;outline-offset:3px}@media(max-width:800px){.data-detail{padding:14px}.data-detail>header{align-items:flex-start;flex-wrap:wrap}.data-detail th{display:none}.data-detail tr,.data-detail td{display:block}.data-detail td{border:0;padding:7px 0}.data-detail tr{border-bottom:1px solid #edf1f5;padding:10px 0}.data-detail .el-button{min-height:40px}.data-toolbar{gap:8px}.data-categories button{padding:9px;min-height:40px;flex-wrap:wrap}.database-list li{flex-wrap:wrap}}
</style>

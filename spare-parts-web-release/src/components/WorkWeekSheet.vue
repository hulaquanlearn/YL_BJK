<template><section class="week-sheet"><div class="sheet-head"><h2>{{name}} · 每周工作记录</h2><div v-if="selectableWeek" class="sheet-date-tools"><button class="sheet-date-picker" aria-label="选择记录日期" aria-haspopup="dialog" :disabled="refreshing" @click="$emit('select-week')">{{week}} — {{dates[5]}} <span aria-hidden="true">▾</span></button><button class="sheet-refresh" aria-label="刷新记录" :disabled="refreshing" @click="$emit('refresh')">↻</button></div><span v-else>{{week}} — {{dates[5]}}</span></div>
<div class="sheet-scroll" :class="{dragging:dragging}" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @click.capture="guardDragClick" @dragstart.prevent><table class="matrix"><thead><tr><th>工作事项</th><th>工作内容</th><th>频次</th><th>输出依据</th><th v-for="(day,i) in displayedDates" :key="day">{{labels[dates.indexOf(day)]}} · 验证记录<small>{{day.slice(5)}}</small></th></tr></thead><tbody>
<template v-for="group in groups" :key="group.name"><tr v-for="(duty,index) in group.duties" :key="duty.id"><th v-if="index===0" :rowspan="group.duties.length" class="category-name">{{group.name}}</th><th class="content">{{duty.title}}<span v-if="isDocumentDuty(duty)" class="document-badge">在线文档</span></th><td class="frequency">{{duty.frequency}}</td><td class="evidence-name">{{duty.evidence}}<div v-if="isDocumentDuty(duty)" class="duty-document"><a v-if="safeLink(documentDuty(duty).documentUrl)" :href="documentDuty(duty).documentUrl" target="_blank" rel="noopener noreferrer">{{documentDuty(duty).documentTitle||'打开在线文档'}} ↗</a><span v-else>未绑定在线文档</span><small v-if="documentDuty(duty).documentScreenshotRequired">在线填写后上传工作截图</small></div></td>
<td v-for="day in duty.frequency==='每日'?displayedDates:['week']" :key="day" :colspan="day==='week'?displayedDates.length:1"><span v-if="day===calendar?.restDate" class="rest">R 休息</span><template v-if="true"><article v-for="entry in entries(duty,day)" :key="entry.record.id"><button class="record-link" @click="$emit('open',entry.record,duty.id)">{{entry.check.status||'未选择'}}</button><strong v-if="missingMaterial(duty,entry)" class="missing-material">{{(entry.check.dutySnapshot||duty).documentScreenshotRequired?'未上传工作截图':'未上传验证材料'}}</strong><p v-if="entry.check.note">{{entry.check.note}}</p><a v-if="safeLink(entry.check.reference)" :href="entry.check.reference" target="_blank" rel="noopener noreferrer">{{(entry.check.dutySnapshot||duty).documentUrl?'填报时使用的在线文档':'在线验证材料'}} ↗</a><div class="photos"><WorkPhoto v-for="photo in entry.record.photos.filter(p=>p.task_key===duty.id)" :key="photo.id" :id="photo.id"/></div><button v-if="entry.check.productionReport" class="report-link" @click="selectedReport={report:entry.check.productionReport,date:entry.record.record_date,record:entry.record}">生产异常跟踪表</button><details v-for="task in entry.check.taskEvidence||[]" :key="task.id"><summary>{{task.title}} · 任务材料</summary><p>{{task.result}} · {{task.note}}</p><a v-if="safeLink(task.reference)" :href="task.reference" target="_blank" rel="noopener">在线验证材料 ↗</a><div class="photos"><WorkPhoto v-for="file in task.files" :key="file.id" :id="file.id" task/></div></details><small v-if="day==='week'">{{entry.record.record_date}}</small></article><span v-if="day!==calendar?.restDate && !entries(duty,day).length" :class="['empty',{missing:day==='week'?duty.frequency!=='持续':day<=today}]">{{day!=='week'&&day>today?'未到日期':duty.frequency==='持续'?'暂无记录':'未填报'}}</span></template></td></tr></template>
</tbody></table></div><p class="sheet-note">R 不计漏报；每周事项整周展示一次。点击结果查看完整材料。</p><el-dialog :model-value="Boolean(selectedReport)" @close="selectedReport=null" title="生产异常跟踪表" width="min(94vw, 760px)" append-to-body destroy-on-close><template v-if="selectedReport"><p>{{name}} · {{selectedReport.date}}</p><ProductionReportTable :report="selectedReport.report"/></template><template #footer><el-button @click="selectedReport=null">关闭</el-button><el-button v-if="canExport && selectedReport" type="primary" :loading="exporting" @click="$emit('export-report',selectedReport.record)">导出 Word</el-button></template></el-dialog></section></template>
<script setup>
import {computed,ref} from 'vue'
import WorkPhoto from './WorkPhoto.vue'
import ProductionReportTable from './ProductionReportTable.vue'
import {addDays} from '../utils/natural-week.mjs'
const props=defineProps({week:String,name:String,duties:Array,records:Array,calendar:Object,canExport:Boolean,exporting:Boolean,selectableWeek:Boolean,refreshing:Boolean})
defineEmits(['open','export-report','select-week','refresh'])
const labels=['周一','周二','周三','周四','周五','周六'],mobileDate=ref('all'),selectedReport=ref(null)
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const dragging=ref(false)
let drag=null,suppressClick=false
function startDrag(event){
  suppressClick=false
  // Touch uses native scrolling so vertical page gestures keep working.
  if(event.pointerType!=='mouse'||event.button!==0)return
  const el=event.currentTarget,rect=el.getBoundingClientRect()
  if(event.clientY>=rect.top+el.clientHeight||el.scrollWidth<=el.clientWidth)return
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:el.scrollLeft}
}
function moveDrag(event){
  if(!drag||event.pointerId!==drag.id)return
  if(!(event.buttons&1)){cancelDrag();return}
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y
  if(!dragging.value){
    if(Math.abs(dx)<6)return
    if(Math.abs(dy)>Math.abs(dx)){cancelDrag();return}
    dragging.value=true
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  event.preventDefault()
  event.currentTarget.scrollLeft=drag.left-dx
}
function endDrag(event){
  suppressClick=dragging.value
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
  cancelDrag()
}
function cancelDrag(){drag=null;dragging.value=false}
function guardDragClick(event){if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false}}
const dates=computed(()=>Array.from({length:6},(_,i)=>addDays(props.week,i)))
const displayedDates=computed(()=>mobileDate.value==='all'||!dates.value.includes(mobileDate.value)?dates.value:[mobileDate.value])
const groups=computed(()=>{const map=new Map();const all=new Map((props.duties||[]).map(d=>[d.id,d]));for(const r of props.records||[])for(const c of r.payload.checks||[])if(c.dutySnapshot)all.set(c.dutyId,c.dutySnapshot);for(const d of all.values()){if(!map.has(d.category))map.set(d.category,[]);map.get(d.category).push(d)}return [...map].map(([name,duties])=>({name,duties}))})
function entries(duty,day){return (props.records||[]).filter(r=>r.kind==='duties'&&r.status==='submitted'&&(day==='week'||r.record_date===day)&&r.payload.checks?.some(c=>c.dutyId===duty.id)).map(record=>({record,check:record.payload.checks.find(c=>c.dutyId===duty.id)}))}
const currentDuties=computed(()=>new Map((props.duties||[]).map(d=>[d.id,d])))
function documentDuty(duty){return currentDuties.value.get(duty.id)||duty}
function isDocumentDuty(duty){const item=documentDuty(duty);return item.reportMode==='document'||safeLink(item.documentUrl)}
function missingMaterial(duty,entry){const check=entry.check,item=check.dutySnapshot||duty;const abnormal=(item.abnormalOptions||[]).includes(check.status);const need=item.documentScreenshotRequired?'photo':item.abnormalEvidence&&abnormal?'either':item.reportMode==='document'?'either':item.reportMode==='photo'||(item.photoRequired&&(item.photoWhen!=='abnormal'||abnormal))?'photo':'optional';const tasks=check.taskEvidence||[];const photo=(entry.record.photos||[]).some(p=>p.task_key===duty.id)||tasks.some(t=>t.files?.length);const link=safeLink(check.reference)||tasks.some(t=>safeLink(t.reference));return need==='photo'?!photo:need==='either'?!photo&&!link:false}
function safeLink(url){return /^https?:\/\//i.test(url||'')}
</script>
<style scoped>
.sheet-scroll{cursor:grab;touch-action:pan-x pan-y;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.sheet-scroll.dragging,.sheet-scroll.dragging *{cursor:grabbing!important;user-select:none!important}
.sheet-scroll :is(button,a,summary){cursor:pointer}
.document-badge{display:inline-block;margin-top:8px;padding:2px 7px;border:1px solid #b8b4e3;border-radius:5px;background:#f0effb;color:#4a438f;font-size:12px;font-weight:600;line-height:1.5}.duty-document{display:grid;gap:5px;margin-top:7px;max-width:210px;overflow-wrap:anywhere}.duty-document a{color:#49418b;font-weight:600;text-decoration:underline;text-underline-offset:3px}.duty-document small{color:#536176;line-height:1.5;margin-top:0}.duty-document>span{color:#9b3e23}
</style>
<style scoped>.week-sheet{background:white;border:1px solid #e4e8ef;border-radius:12px;padding:16px;min-width:0}.sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.sheet-head h2{font-size:18px;margin:0;line-height:1.5}.sheet-head span,.sheet-note{font-size:13px;color:#68768a}.sheet-scroll{overflow:auto}.matrix{width:100%;min-width:1350px;border-collapse:collapse;font-size:13px}th,td{border:1px solid #dce2ea;padding:10px;text-align:left;vertical-align:top}thead th{background:#f5f7fa}small{display:block;color:#738092;font-weight:400;margin-top:6px}.content{width:260px;min-width:220px;line-height:1.6;font-weight:500}.category th{background:#edf2f7;color:#243d54}td{min-width:125px}article+article{border-top:1px solid #dce2ea;margin-top:8px;padding-top:8px}p{white-space:pre-wrap;overflow-wrap:anywhere}.record-link{color:#126c4f;background:#edf8f3;border:0;border-radius:5px;min-height:36px;cursor:pointer}.photos{display:flex;gap:4px;flex-wrap:wrap}.photos :deep(img){width:60px;height:60px;object-fit:cover}.empty,.rest{color:#7b8794}.category-name{min-width:75px;vertical-align:middle;background:#f5f7fa}.frequency{min-width:45px;white-space:nowrap}.evidence-name{min-width:95px}.empty.missing,.missing-material{color:#bd2035;background:#fff1f2}.missing-material{display:block;font-size:12px;margin:6px 0}.rest{display:block;margin-bottom:6px}.report-link{display:block;background:white;border:1px solid #dce2ea;border-radius:5px;padding:8px;margin-top:8px;cursor:pointer;color:#345b80}details{margin-top:8px}summary{cursor:pointer}details[open]{min-width:300px}.mobile-days{display:none}@media(max-width:700px){.mobile-days{display:flex;gap:4px;margin-bottom:12px}.mobile-days button{flex:1;padding:8px 4px;min-height:40px;border:1px solid #dce2ea;border-radius:6px;background:white}.mobile-days .active{background:#bd2035;color:white}.matrix{min-width:900px}.matrix:has(thead th:last-child:nth-child(2)){min-width:0}.content{min-width:150px;width:45%}.week-sheet{padding:12px}}</style>

<style scoped>
.sheet-date-tools{display:flex;align-items:center;gap:6px;flex-shrink:0}.sheet-date-picker,.sheet-refresh{border:1px solid #dce2ea;border-radius:8px;background:#fff;color:#53657e;min-height:38px;padding:8px 10px;font:inherit;font-size:13px;cursor:pointer}.sheet-date-picker{white-space:nowrap}.sheet-date-picker:hover,.sheet-refresh:hover{border-color:#5b5cab;color:#5b5cab}.sheet-date-tools button:disabled{opacity:.5;cursor:default}.sheet-date-picker:focus-visible,.sheet-refresh:focus-visible{outline:2px solid #5b5cab;outline-offset:2px}.sheet-refresh{width:38px;padding:0}@media(max-width:600px){.sheet-head{flex-wrap:wrap;gap:8px}.sheet-date-tools{margin-left:auto;max-width:100%}.sheet-date-picker{font-size:12px;padding:8px}.sheet-head h2{margin:0}}
</style>

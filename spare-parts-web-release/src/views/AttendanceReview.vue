<template>
  <main class="attendance-page">
    <section v-if="canManageAttendance" class="attendance-sources" aria-label="导入文件">
      <div class="source-files">
        <div v-for="kind in ['schedule','attendance']" :key="kind" class="source-item">
          <span class="source-icon"><el-icon><Document /></el-icon></span>
          <div class="source-copy"><div class="source-label"><b>{{ kind==='schedule'?'排班表':'考勤表' }}</b><span v-if="files[kind]" class="source-state">待校验</span><span v-else-if="analysis" class="source-state imported"><el-icon><CircleCheckFilled /></el-icon>已导入</span></div><span :title="sourceName(kind)">{{ sourceName(kind) || '请选择 .xlsx 文件（最大10MB）' }}</span></div>
          <div class="source-file-tools"><label class="file-select">{{ sourceName(kind)?'更换文件':'选择文件' }}<input :aria-label="kind==='schedule'?'上传排班表':'上传考勤表'" type="file" accept=".xlsx" :disabled="busy" @change="chooseFile($event,kind)" /></label><button v-if="report && !files[kind]" :disabled="busy" @click="downloadSource(kind)">下载</button></div>
        </div>
      </div>
      <div class="source-actions">
        <label class="period-select"><span>正常打卡时限</span><select v-model.number="hours" class="window-select" aria-label="正常打卡时限" :disabled="busy || Boolean(analysis)&&!canAutoObserve" @change="changeObservation"><option :value="0.5">30分钟</option><option :value="1">1小时</option><option :value="2">2小时</option><option :value="4">4小时</option></select></label><button class="primary" :disabled="busy || !canAnalyze" @click="analyze">{{ loadingSaved?'读取结果…':busy?'处理中…':'开始分析' }}</button>
      </div>
    </section>

    <section v-if="validationErrors.length" class="validation-panel errors" role="alert"><b>{{ errorMessage }}</b><ul><li v-for="(issue,i) in validationErrors" :key="i">{{ issueText(issue) }}</li></ul><p>本次文件未保存，请修正后重新选择。</p></section>
    <section v-if="analysis" class="validation-panel" :class="analysis.warnings.length?'warnings':'import-info'"><details :open="remindersExpanded" @toggle="remindersExpanded=$event.target.open"><summary><el-icon><component :is="analysis.warnings.length?WarningFilled:InfoFilled" /></el-icon>{{analysis.warnings.length ? `查看 ${analysis.warnings.length} 项提醒` : '查看导入信息'}}<span class="reminder-toggle">{{remindersExpanded?'收起':'展开'}}<el-icon :class="{expanded:remindersExpanded}"><ArrowRight /></el-icon></span></summary><p class="import-statistics">排班 {{analysis.month}} · {{analysis.summary.matchedPeople}} / {{analysis.summary.people}} 人工号匹配 · {{analysis.summary.eventCount}} 条有效记录 · 考勤截至 {{analysis.coverage.to}}</p><ul v-if="analysis.warnings.length"><li v-for="(issue,i) in analysis.warnings" :key="i">{{issueText(issue)}}</li></ul><div class="import-rules"><b>核查口径</b><p>正常打卡时限：应下班至下班后 {{normalHoursLabel}}；遇下一班开始则截止。班中往返单独记录，后续进出不补算上一班离场。</p></div></details></section>
    <section v-if="isLegacyReport" class="validation-panel warnings" role="status"><b>{{canManageAttendance?'此报告使用旧判断规则，请点击“开始分析”更新。':'此报告使用旧判断规则，请联系管理员更新。'}}</b><p>旧结果可能尚未按同方向2分钟合并刷脸，或缺少最新迟到及提前出门核查规则。</p></section>
    <p v-if="feedback" class="page-feedback" role="status">{{ feedback }}</p>

    <div v-if="analysis" class="attendance-workspace">
      <section class="attendance-list">
        <nav class="result-tabs" aria-label="核查类型"><button v-for="t in resultTabs" :key="t.key" :class="{active:resultTab===t.key}" @click="resultTab=t.key;page=1">{{ t.label }} <span>{{ t.count }}</span></button></nav>
        <div class="attendance-filters"><el-select v-model="shiftFilter" placeholder="全部班次" aria-label="班次筛选" @change="page=1"><el-option label="全部班次" value=""/><el-option v-for="s in shiftOptions" :key="s" :label="s" :value="s"/></el-select><el-input v-model="keyword" placeholder="请输入姓名或工号" aria-label="搜索姓名或工号" clearable @input="page=1"><template #prefix><el-icon><Search /></el-icon></template></el-input><button :disabled="!filtered.length" @click="exportCsv"><el-icon><Upload /></el-icon>导出清单</button></div>
        <div v-if="matchedPeople.length===1" class="personal-schedule-summary"><strong>{{matchedPeople[0].name}}</strong><button class="person-detail-button" @click="openPersonDetail(matchedPeople[0].id)"><el-icon><Calendar /></el-icon>查看考勤详情</button></div>
        <div v-else-if="matchedPeople.length>1" class="personal-schedule-summary"><strong>匹配 {{matchedPeople.length}} 人</strong><span>排班共 {{matchedPeople.reduce((n,p)=>n+p.shiftCount,0)}} 班</span></div>
        <div class="observation-tools"><span>{{listSummary}}</span></div>
        <div class="result-table-scroll"><table class="result-table"><thead><tr><th>人员</th><th :aria-sort="sortAria('date')"><button class="column-sort" aria-label="按排班日期排序" :title="activeSort.field==='date'&&activeSort.order==='asc'?'点击按日期从晚到早':'点击按日期从早到晚'" @click="toggleSort('date')">排班日期 / 班次<span aria-hidden="true">{{sortArrow('date')}}</span></button></th><th>本班关联出门</th><th :aria-sort="sortAria('advance')"><button class="column-sort" aria-label="按提前时长排序" :title="activeSort.field==='advance'&&activeSort.order==='desc'?'点击按提前时长从短到长':'点击按提前时长从长到短'" @click="toggleSort('advance')">提前时长<span aria-hidden="true">{{sortArrow('advance')}}</span></button></th><th>核查结果 / 线索</th><th>操作</th></tr></thead><tbody><tr v-for="r in paged" :key="r.key" :class="{selected:selectedKey===r.key,'schedule-only-row':r.rowType==='schedule'}" @click="selectRow(r)"><td><b>{{r.name}}</b><small>{{r.id}}</small></td><td>{{r.date.slice(5)}}<small>{{r.shift}}</small></td><td>{{r.rowType==='schedule'?'—':shortTime(associatedExit(r))}}<small v-if="associatedExit(r) && associatedExit(r).slice(0,10)!==r.date">{{associatedExit(r).slice(0,10)}}</small></td><td :class="{advance:r.advanceSeconds>0}">{{duration(r.advanceSeconds)}}</td><td class="result-evidence"><span class="status-badge" :class="r.status">{{statusLabel(r.status)}}</span><div v-if="r.rowType!=='schedule'" class="evidence-chips"><span v-for="item in attendanceEvidence(r)" :key="item.code" class="evidence-chip" :class="item.code">{{item.text}}</span></div><small v-if="r.rowType!=='schedule' && !r.complete && r.status!=='partial'">正常下班窗口未完整覆盖</small></td><td><button class="text-button" @click.stop="selectRow(r)">查看</button></td></tr></tbody></table></div>
        <p v-if="!filtered.length" class="empty-result">当前筛选条件下没有记录。</p>
        <div class="list-footer"><p><el-icon><InfoFilled /></el-icon>缺少出门记录不能确定离场时间；GPS 记录不能确认手机操作者。</p><el-pagination v-if="filtered.length>20" v-model:current-page="page" :page-size="20" :total="filtered.length" layout="prev,pager,next" size="small"/></div>
      </section>

      <aside ref="detailPanel" class="attendance-detail" :class="{'detail-collapsed':detailCollapsed}" aria-label="记录详情">
        <template v-if="selected"><header><h2>记录详情</h2><button class="text-button mobile-detail-back" @click="collapseDetail">收起</button></header><div class="person-title"><b>{{selected.name}}</b><span>工号 {{selected.id}}</span><button v-if="analysis.people?.some(p=>p.id===selected.id)" class="person-detail-button" @click="openPersonDetail(selected.id)"><el-icon><Calendar /></el-icon>考勤详情</button></div><p>{{selected.date}} · {{selected.shift}}</p>
          <template v-if="selected.rowType==='schedule'"><div class="detail-result" :class="selected.status">{{statusLabel(selected.status)}}</div><p class="schedule-explanation">{{scheduleExplanation(selected)}}</p><p v-if="selected.scheduleRow" class="schedule-source">排班表第 {{selected.scheduleRow}} 行</p></template>
          <template v-else>
          <p v-if="selectedOutsideFilter" class="detail-caution">此记录不在当前筛选结果中。<template v-if="noteDraft!==(notes[selected.key]?.note||'')">当前备注尚未保存。</template></p>
          <div v-if="selected.arrival?.status==='late'" class="detail-result early"><span>迟到</span><strong>{{duration(selected.arrival.lateSeconds)}}</strong></div>
          <div class="detail-result" :class="selected.status"><span>{{statusLabel(selected.status)}}</span><strong v-if="selected.advanceSeconds!=null">{{duration(selected.advanceSeconds)}}</strong></div>
          <div class="evidence-chips detail-chips"><span v-for="item in attendanceEvidence(selected)" :key="item.code" class="evidence-chip" :class="item.code">{{item.text}}</span></div>
          <ul v-if="selected.findings?.length" class="detail-findings"><li v-for="(finding,i) in selected.findings" :key="`${finding.code}-${i}`">{{finding.text}}</li></ul>
          <div v-if="selected.arrival?.time" class="detail-context"><p>上班核查时间：{{selected.arrival.time}}（{{selected.arrival.basis==='paired_gate'?'手机与闸机半小时内配对，按闸机进门':selected.arrival.basis==='gps'?'手机打卡，无进出方向':'闸机进门记录'}}）</p><p v-if="selected.arrival.mobileTime">上班手机打卡：{{selected.arrival.mobileTime}}</p><p v-if="selected.arrival.gateTime">上班闸机进门候选：{{selected.arrival.gateTime}}</p><p v-if="selected.arrival.gapSeconds!=null">手机与闸机间隔：{{duration(selected.arrival.gapSeconds)}}（{{selected.arrival.paired?'半小时内配对':'超过半小时，不作为同一次到岗'}}）</p></div>
          <h3>考勤记录时间线</h3><ol class="evidence-timeline"><li v-for="(event,i) in selected.timeline" :key="i" :class="[event.type,{ 'context-event': event.contextOnly }] "><time>{{event.time.slice(5)}}</time><el-icon><component :is="eventIcon(event.type)"/></el-icon><div><b>{{eventLabel(event.type)}}</b><span v-if="event.contextOnly" class="context-marker">后续 / 相邻班次记录</span><small v-if="event.retryScan" class="retry-marker">同方向2分钟内连续刷脸，按一次进出核查</small><small v-if="event.scopeReason" class="scope-reason">{{event.scopeReason}}</small><small v-if="event.device">{{event.device}}<template v-if="event.direction"> · {{event.direction}}</template></small><small v-if="event.gate">{{event.gate}}</small><small v-if="event.sourceRow">考勤表第 {{(event.sourceRows || [event.sourceRow]).join('、')}} 行</small></div></li></ol>
          <div class="detail-context"><p>本班关联出门：{{associatedExit(selected) || '未查到可关联记录'}}</p><p v-if="selected.normalExitEnd">正常下班窗口：{{selected.end}} 至 {{selected.normalExitEnd}}</p><p v-if="selected.returnedAt">班内最近返回：{{selected.returnedAt}}</p><p v-if="selected.nextStart">下一班应上班：{{selected.nextStart}}</p><p v-if="isLegacyReport && selected.lateExit">旧规则后续出门：{{selected.lateExit}}（需重算，不作为本班离场）</p><p v-if="!selected.complete" class="coverage-warning">文件范围未完整覆盖班次及正常下班窗口，缺记录核查尚需补充数据。</p></div>
          <ul v-if="selected.sequenceIssues?.length" class="sequence-issues"><li v-for="(issue,i) in selected.sequenceIssues" :key="`${issue.code}-${i}`">{{issue.time}} · {{issue.message}}</li></ul>
          <p class="detail-caution"><el-icon><WarningFilled /></el-icon>未见闸机出门可能涉及人工通道或记录遗漏；GPS 不能确认本人在场或手机操作者。请结合审批、监控核查。</p>
          <label class="review-note">核查备注<el-input v-model="noteDraft" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="记录培训外出时间、培训后返厂或直接下班情况，以及审批、培训签到或监控等核查依据" :disabled="!canManageAttendance || !report || busy"/></label><button v-if="canManageAttendance" :disabled="!report || busy || noteDraft===(notes[selected.key]?.note||'')" @click="saveNote">保存备注</button><small v-if="notes[selected.key]?.actorId || notes[selected.key]?.updatedAt" class="note-metadata">{{notes[selected.key]?.actorId ? '核查人编号 ' + notes[selected.key].actorId : '核查人未记录'}} · {{notes[selected.key]?.updatedAt}}</small><small v-if="!report" class="unsaved-note">确认导入后可保存核查备注。</small>
          </template>
        </template><p v-else class="empty-detail">选择一条记录查看时间线。</p>
      </aside>
    </div>
    <section v-else-if="!busy" class="attendance-empty"><el-icon><DocumentChecked /></el-icon><h2>{{canManageAttendance?'导入排班表和考勤表开始核查':'暂无已保存的考勤核查记录'}}</h2><p v-if="!canManageAttendance">请联系原粮车间管理员导入排班和考勤资料后查看。</p><p v-else>按工号、连续进出记录和排班匹配，分别展示班内外出、最终下班出门与 GPS 线索。</p><p v-if="canManageAttendance">正常打卡时限默认为下班后 2 小时，可在上方调整。夜班“24:00—8:00”按排班日期当天 00:00—08:00 计算。</p></section>

    <AttendancePersonDetail v-model="personDetailOpen" :person-id="personDetailId" :analysis="analysis" :notes="notes" @select-shift="jumpToShift" />
    <el-dialog v-model="monthRequired" title="选择排班月份" width="min(420px, calc(100vw - 28px))"><p>这份排班表没有完整年月，请补充一次。</p><input v-model="period" type="month" aria-label="补充排班月份"/><template #footer><el-button @click="monthRequired=false">取消</el-button><el-button type="primary" :disabled="!period" @click="monthRequired=false;analyze()">开始分析</el-button></template></el-dialog>
    <el-dialog v-model="confirmImport" title="请核对导入提醒" width="min(640px, calc(100vw - 28px))" :close-on-click-modal="false"><p>文件格式和关键字段已通过校验，以下问题会影响结果范围。确认后保存本次导入并替换上一份考勤及其备注；仅保留当前一份原始文件和结果。</p><ul class="import-warning-list"><li v-for="(issue,i) in analysis?.warnings||[]" :key="i">{{issueText(issue)}}</li></ul><template #footer><el-button @click="confirmImport=false" :disabled="busy">返回查看</el-button><el-button type="primary" :loading="busy" @click="persistImport">确认并保存导入</el-button></template></el-dialog>
  </main>
</template>

<script setup>
import {computed,nextTick,onMounted,onBeforeUnmount,ref,watch} from 'vue'
import {useRoute} from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {Document,DocumentChecked,CircleCheckFilled,WarningFilled,Search,Upload,InfoFilled,Clock,Switch,Location,ArrowRight,Calendar} from '@element-plus/icons-vue'
import AttendancePersonDetail from '../components/AttendancePersonDetail.vue'
import {office,downloadAttendanceSource,saveBlob} from '../api/attendance'
import {statusLabel,needsAttendanceReview,needsAttendanceReanalysis,attendancePeopleForKeyword,attendanceShiftOptions,filterAttendanceRows,associatedExit,attendanceEvidence,duration,shortTime,attendanceCsv} from '../utils/attendance-display.mjs'
import {attendanceListRows,sortAttendanceRows} from '../utils/attendance-list.mjs'
import {getToken,getUser} from '../auth'
import {attendanceReviewCache} from '../utils/attendance-review-cache.mjs'

const canManageAttendance=computed(()=>['admin','raw_grain'].includes(getUser()?.role))
const route=useRoute(),initialKeyword=String(route.query.keyword || ''),initialDate=String(route.query.date || '')
const period=ref(''),hours=ref(2),files=ref({schedule:null,attendance:null}),analysis=ref(null),report=ref(null),notes=ref({}),history=ref([]),busy=ref(false),feedback=ref(''),validationErrors=ref([]),errorMessage=ref(''),confirmImport=ref(false)
const resultTab=ref('all'),keyword=ref(initialKeyword),shiftFilter=ref(''),page=ref(1),selectedKey=ref(''),noteDraft=ref('')
const personDetailOpen=ref(false),personDetailId=ref(''),remindersExpanded=ref(false),monthRequired=ref(false),preservingSelection=ref(false),detailCollapsed=ref(false)
const sortField=ref(''),sortOrder=ref('')
const loadingSaved=ref(false),sessionToken=getToken()
const sessionFields={keyword,shiftFilter,resultTab,sortField,sortOrder,page,selectedKey,analysis,report,notes,files,period,hours,noteDraft,feedback,validationErrors,errorMessage,remindersExpanded,confirmImport,monthRequired,detailCollapsed}
let observationRequest=0,alive=true,restoringSession=false
onBeforeUnmount(()=>{if(sessionToken&&getToken()===sessionToken)attendanceReviewCache.write(sessionToken,Object.fromEntries(Object.entries(sessionFields).map(([key,value])=>[key,value.value])));alive=false;observationRequest++})
const sourceName=kind=>files.value[kind]?.name || analysis.value?.sources?.[kind]?.name || ''
const issueText=issue=>[issue.source,issue.row?`第${issue.row}行`:'',issue.column?`第${issue.column}列`:'',issue.message].filter(Boolean).join(' · ')
const canAnalyze=computed(()=>canManageAttendance.value&&(Boolean(files.value.schedule&&files.value.attendance) || Boolean(report.value&&!files.value.schedule&&!files.value.attendance)))
const canAutoObserve=computed(()=>canManageAttendance.value&&(Boolean(report.value&&!files.value.schedule&&!files.value.attendance)||Boolean(!report.value&&files.value.schedule&&files.value.attendance)))
const normalHoursLabel=computed(()=>Number(analysis.value?.options?.normalExitHours??hours.value)===0.5?'30分钟':`${analysis.value?.options?.normalExitHours??hours.value} 小时`)
const rows=computed(()=>attendanceListRows(analysis.value))
const isLegacyReport=computed(()=>needsAttendanceReanalysis(analysis.value))
const signals=row=>needsAttendanceReview(row) && row.status!=='early'
const preferredRow=results=>(initialKeyword || initialDate ? results.find(r=>(!initialDate || r.date===initialDate)&&(!initialKeyword || `${r.name} ${r.id}`.includes(initialKeyword))) : null) || results.find(signals) || results[0]
const countRows=computed(()=>filterAttendanceRows(rows.value,{tab:'all',shift:shiftFilter.value,keyword:keyword.value}))
const resultTabs=computed(()=>[{key:'all',label:'全部排班',count:countRows.value.length},{key:'late',label:'迟到',count:countRows.value.filter(r=>r.arrival?.status==='late').length},{key:'normal',label:'正常下班',count:countRows.value.filter(r=>r.status==='normal').length},{key:'early',label:'提前出门',count:countRows.value.filter(r=>r.status==='early').length},{key:'signals',label:'待核查',count:countRows.value.filter(signals).length}])
const matchedPeople=computed(()=>attendancePeopleForKeyword(analysis.value,keyword.value))
const shiftOptions=computed(()=>attendanceShiftOptions(analysis.value,keyword.value))
const activeSort=computed(()=>sortField.value?{field:sortField.value,order:sortOrder.value}:matchedPeople.value.length===1?{field:'date',order:'asc'}:{field:'advance',order:'desc'})
const filtered=computed(()=>sortAttendanceRows(filterAttendanceRows(rows.value,{tab:resultTab.value,shift:shiftFilter.value,keyword:keyword.value}),activeSort.value))
const listSummary=computed(()=>{const work=filtered.value.filter(r=>r.rowType!=='schedule').length,rest=filtered.value.filter(r=>r.scheduleType==='rest').length,leave=filtered.value.filter(r=>r.scheduleType==='leave').length,blank=filtered.value.filter(r=>r.scheduleType==='blank').length;return work===filtered.value.length?`当前筛选 ${work} 个班次`:`当前筛选 ${filtered.value.length} 条 · 上班 ${work} 班${rest?` · 休息 ${rest} 天`:''}${leave?` · 请假 / 调休 ${leave} 天`:''}${blank?` · 空排班 ${blank} 天`:''}`})
const sortAria=field=>activeSort.value.field===field?activeSort.value.order==='asc'?'ascending':'descending':'none'
const sortArrow=field=>activeSort.value.field===field?activeSort.value.order==='asc'?'↑':'↓':'↕'
function toggleSort(field){sortOrder.value=activeSort.value.field===field?(activeSort.value.order==='asc'?'desc':'asc'):field==='advance'?'desc':'asc';sortField.value=field;page.value=1}
const scheduleExplanation=row=>row.scheduleType==='rest'?'原排班为休息，不参与下班考勤核查。':row.scheduleType==='leave'?`原排班为${row.shift}，不参与工作班次核查。`:'原排班单元格为空，需核对或补充排班，不作缺勤判断。'
const paged=computed(()=>filtered.value.slice((page.value-1)*20,page.value*20))
const selected=computed(()=>rows.value.find(r=>r.key===selectedKey.value))
const detailPanel=ref(null)
const selectedOutsideFilter=computed(()=>selected.value&&!filtered.value.some(r=>r.key===selectedKey.value))
watch(selectedKey,()=>{if(restoringSession)return;detailCollapsed.value=false;noteDraft.value=notes.value[selectedKey.value]?.note||''})
watch(keyword,()=>{sortField.value='';sortOrder.value='';page.value=1},{flush:'sync'})
watch(shiftOptions,value=>{if(shiftFilter.value && !value.includes(shiftFilter.value))shiftFilter.value=''})
watch(filtered,value=>{if(!restoringSession&&!preservingSelection.value&&!value.some(r=>r.key===selectedKey.value)&&noteDraft.value===(notes.value[selectedKey.value]?.note||''))selectedKey.value=value[0]?.key||''},{flush:'post'})
async function selectRow(row){
  if(busy.value)return
  if(row.key!==selectedKey.value&&noteDraft.value!==(notes.value[selectedKey.value]?.note||'')){try{await ElMessageBox.confirm('当前备注尚未保存，切换后将放弃修改。','切换记录',{confirmButtonText:'切换',cancelButtonText:'取消'})}catch{return}}
  selectedKey.value=row.key
  detailCollapsed.value=false
  if(window.innerWidth<=950){await nextTick();detailPanel.value?.scrollIntoView({behavior:'smooth',block:'start'})}
}
function collapseDetail(){detailCollapsed.value=true}
const eventLabel=type=>({in:'闸机进门',out:'闸机出门',gps:'手机 GPS',start:'应上班',end:'应下班',window_end:'正常下班窗口截止'}[type] || '考勤记录')
const eventIcon=type=>({in:Switch,out:Switch,gps:Location,start:Clock,end:Clock,window_end:Clock}[type] || Clock)
function chooseFile(event,kind){
  if(!canManageAttendance.value)return
  const file=event.target.files?.[0];if(!file)return
  if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024||file.size===0){ElMessage.error('请选择有效的 .xlsx 文件，大小不能超过10MB');event.target.value='';return}
  files.value={...files.value,[kind]:file};validationErrors.value=[];feedback.value=analysis.value?'新文件待校验；下方仍为上一次分析结果，点击“开始分析”后更新。':'文件待校验，请同时选择排班表和考勤表。'
  if(kind==='schedule')period.value=''
  event.target.value=''
}
function importForm(){const data=new FormData();data.append('schedule',files.value.schedule);data.append('attendance',files.value.attendance);if(period.value)data.append('month',period.value);data.append('observationHours',hours.value);data.append('normalExitHours',hours.value);return data}
function showImportError(error){if(error.response?.data?.details?.some(d=>d.code==='month_required')){monthRequired.value=true;validationErrors.value=[];return}errorMessage.value=error.response?.data?.msg||'文件校验失败，请检查文件和网络';validationErrors.value=error.response?.data?.details?.length?error.response.data.details:[{message:errorMessage.value}];feedback.value=''}
async function changeObservation(){
  if(!canManageAttendance.value)return
  if(!analysis.value)return
  const previous=Number(analysis.value.options?.normalExitHours??2),wanted=hours.value
  if(busy.value||!canAutoObserve.value){hours.value=previous;return}
  if(wanted===previous&&!isLegacyReport.value)return
  const token=++observationRequest,reportId=report.value?.id,revision=report.value?.revision
  const chosenFiles=files.value,chosenPeriod=period.value,selected=selectedKey.value
  busy.value=true;preservingSelection.value=true;feedback.value='正在更新…'
  try{
    if(reportId){
      const result=await office.post(`/attendance/reports/${reportId}/reanalyze`,{normalExitHours:wanted,observationHours:wanted,revision})
      if(!alive||token!==observationRequest||report.value?.id!==reportId)return
      applyReport(result.data,{preserveDraft:true,preservePage:true})
    }else{
      const result=await office.post('/attendance/preview',importForm(),{validationRequest:true})
      if(!alive||token!==observationRequest||files.value!==chosenFiles||period.value!==chosenPeriod)return
      analysis.value=result.data;period.value=result.data.month
    }
    if(rows.value.some(r=>r.key===selected))selectedKey.value=selected
    page.value=Math.max(1,Math.min(page.value,Math.ceil(filtered.value.length/20)||1))
    await nextTick()
    feedback.value='已自动更新。'
  }catch(error){
    if(alive&&token===observationRequest){hours.value=previous;feedback.value=error.response?.data?.msg||'更新失败，已保留原结果。'}
  }finally{if(alive&&token===observationRequest){preservingSelection.value=false;busy.value=false}}
}
async function analyze(){
  if(!canManageAttendance.value)return
  if(report.value&&!files.value.schedule&&!files.value.attendance&&!isLegacyReport.value&&Number(hours.value)===Number(analysis.value.options?.normalExitHours??2)){feedback.value='文件与正常打卡时限未变，继续使用已保存的分析结果。';return}
  if(noteDraft.value!==(notes.value[selectedKey.value]?.note||'')&&!(report.value&&!files.value.schedule&&!files.value.attendance)){try{await ElMessageBox.confirm('当前备注尚未保存，导入新文件后将放弃修改。','开始分析',{confirmButtonText:'继续',cancelButtonText:'取消'})}catch{return}}
  busy.value=true;validationErrors.value=[];feedback.value=''
  try{
    if(report.value&&!files.value.schedule&&!files.value.attendance){const r=await office.post(`/attendance/reports/${report.value.id}/reanalyze`,{observationHours:hours.value,normalExitHours:hours.value,revision:report.value.revision});applyReport(r.data,{preserveDraft:true});feedback.value='分析已更新。';return}
    const result=await office.post('/attendance/preview',importForm(),{validationRequest:true});analysis.value=result.data;period.value=result.data.month;report.value=null;notes.value={};selectedKey.value=preferredRow(analysis.value.results)?.key||'';page.value=1;resultTab.value='all';
    if(analysis.value.warnings.length)confirmImport.value=true
    else {busy.value=false;await persistImport()}
  }catch(error){showImportError(error)}finally{busy.value=false}
}
async function persistImport(){
  if(!canManageAttendance.value)return
  busy.value=true
  try{const data=importForm();data.append('acknowledgeWarnings','true');const result=await office.post('/attendance/reports',data,{validationRequest:true});applyReport(result.data);files.value={schedule:null,attendance:null};confirmImport.value=false;feedback.value='导入已保存，可查看记录、保存备注和导出清单。';await loadHistory()}
  catch(error){showImportError(error)}finally{busy.value=false}
}
function applyReport(data,{preserveDraft=false,preservePage=false}={}){const key=selectedKey.value,draft=noteDraft.value,dirty=draft!==(notes.value[key]?.note||'');report.value=data;analysis.value=data.analysis;notes.value=data.notes||{};period.value=data.analysis.month;hours.value=data.analysis.options.normalExitHours??2;selectedKey.value=rows.value.some(r=>r.key===key)?key:preferredRow(data.analysis.results)?.key||'';noteDraft.value=preserveDraft&&dirty&&selectedKey.value===key?draft:notes.value[selectedKey.value]?.note||'';if(!preservePage)page.value=1}
function openPersonDetail(id){personDetailId.value=id;personDetailOpen.value=true}
async function jumpToShift(key){if(busy.value)return;const row=rows.value.find(r=>r.key===key);if(!row)return;await selectRow(row);if(selectedKey.value!==key)return;personDetailOpen.value=false;keyword.value=row.name;shiftFilter.value='';resultTab.value='all';await nextTick();const index=filtered.value.findIndex(r=>r.key===key);page.value=Math.floor(index/20)+1}
async function loadHistory(){const r=await office.get('/attendance/reports');if(alive)history.value=r.data}
async function saveNote(){if(!canManageAttendance.value)return;if(!selected.value||selected.value.rowType==='schedule')return;const key=selected.value.key;busy.value=true;try{const r=await office.patch(`/attendance/reports/${report.value.id}/notes`,{entryKey:key,note:noteDraft.value,revision:report.value.revision});notes.value={...notes.value,[key]:{note:r.data.note,actorId:r.data.actorId,updatedAt:r.data.updatedAt}};report.value.revision=r.data.revision;if(selectedKey.value===key)noteDraft.value=r.data.note;ElMessage.success('核查备注已保存')}finally{busy.value=false}}
function exportCsv(){saveBlob(new Blob([attendanceCsv(filtered.value,notes.value)],{type:'text/csv;charset=utf-8'}),`原粮考勤核查_${analysis.value.month}.csv`)}
async function downloadSource(kind){await downloadAttendanceSource(report.value.id,kind,sourceName(kind))}
async function initializeReview(){
  const cached=attendanceReviewCache.read(sessionToken)
  const retained=Boolean(cached&&(cached.analysis||cached.report||cached.files?.schedule||cached.files?.attendance))
  if(retained){
    restoringSession=true
    try{
      for(const [key,value]of Object.entries(sessionFields))if(Object.hasOwn(cached,key))value.value=cached[key]
      await nextTick()
      if(initialKeyword||initialDate){keyword.value=initialKeyword;shiftFilter.value='';resultTab.value='all';selectedKey.value=preferredRow(analysis.value?.results||[])?.key||'';await nextTick();page.value=Math.max(1,Math.floor(filtered.value.findIndex(r=>r.key===selectedKey.value)/20)+1);noteDraft.value=notes.value[selectedKey.value]?.note||''}
    }finally{restoringSession=false}
  }else{busy.value=true;loadingSaved.value=true}
  try{
    await loadHistory();if(!alive)return
    const id=report.value?.id
    if(retained){
      if(!id)return
      const metadata=history.value.find(r=>Number(r.id)===Number(id))
      if(metadata&&Number(metadata.revision)===Number(report.value.revision))return
      try{
        const response=await office.get('/attendance/reports/'+id,{validationRequest:true});if(!alive||busy.value||report.value?.id!==id)return
        const pendingFiles=Boolean(files.value.schedule||files.value.attendance),chosenHours=hours.value,chosenPeriod=period.value
        applyReport(response.data,{preserveDraft:true,preservePage:true})
        if(pendingFiles){hours.value=chosenHours;period.value=chosenPeriod}
      }catch(error){
        if(!alive)return
        if(error.response?.status!==404)throw error
        attendanceReviewCache.clear();report.value=null;analysis.value=null;notes.value={};selectedKey.value='';const current=history.value[0];if(current){const response=await office.get('/attendance/reports/'+current.id);if(!alive)return;applyReport(response.data);feedback.value='已切换到当前导入，上一份考勤不再保留。'}else feedback.value='当前没有已导入的考勤，请选择文件后重新分析。'
      }
    }else if(history.value.length){
      const response=await office.get('/attendance/reports/'+history.value[0].id);if(!alive)return
      applyReport(response.data)
    }
  }catch{if(alive)feedback.value='已保存结果读取失败，请刷新后重试。'}
  finally{if(alive&&!retained){busy.value=false;loadingSaved.value=false}}
}
onMounted(initializeReview)
</script>

<style scoped>
.attendance-page{max-width:1440px;margin:auto;color:#183047;display:grid;gap:16px}.attendance-page *{box-sizing:border-box}.attendance-page button,.file-select{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;border:1px solid #dee5ed;border-radius:7px;background:white;padding:8px 14px;color:#35465b;font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}.attendance-page button:disabled{opacity:.5;cursor:default}.attendance-page .primary{background:#5b5cab;border-color:#5b5cab;color:white}.attendance-page button:focus-visible,.file-select:focus-within{outline:2px solid #5b5cab;outline-offset:3px}.attendance-sources{background:#fff;border:1px solid #dee5ed;border-radius:10px}.source-icon{display:grid;place-items:center;width:44px;height:44px;background:#f0f0fa;color:#5b5cab;border-radius:8px;font-size:24px;flex:none}.source-copy{display:grid;gap:8px;min-width:0;flex:1;font-size:14px}.source-copy span{font-size:12px;color:#607487;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-state{font-size:12px;color:#995f15;white-space:nowrap}.source-state.imported{color:#26885b;display:flex;gap:5px;align-items:center}.file-select{position:relative;overflow:hidden;border:0;color:#5b5cab;padding:0;text-decoration:underline;font-size:12px}.file-select input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}.period-select{display:grid;gap:4px;font-size:12px;color:#607487}.period-select input{max-width:145px;border:1px solid #dee5ed;border-radius:6px;padding:8px;color:#183047;font:inherit}.validation-panel{font-size:13px;padding:12px 18px;border-radius:8px;border:1px solid #efcf94;background:#fff8eb;color:#87571c;line-height:1.7}.validation-panel summary{cursor:pointer;display:flex;gap:8px;align-items:center}.validation-panel ul{max-height:220px;overflow:auto;padding-left:22px;margin-bottom:0}.validation-panel.errors{background:#fff1f2;border-color:#edbdc5;color:#a5263b}.validation-panel p{margin:6px 0 0}.page-feedback{margin:0;font-size:13px;color:#52647b}.attendance-workspace{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:18px;align-items:start}.attendance-list,.attendance-detail{background:#fff;border:1px solid #dee5ed;border-radius:10px;padding:20px;min-width:0}.attendance-list{min-height:610px}.result-tabs{display:flex;gap:10px;border-bottom:1px solid #e6eaf0;padding-bottom:10px;overflow-x:auto}.attendance-page .result-tabs button{border-color:transparent;background:transparent;gap:12px;padding:10px 14px}.attendance-page .result-tabs button.active{background:#f0f0fa;color:#45468b;border-bottom-color:#5b5cab;font-weight:600}.result-tabs span{font-size:12px}.attendance-filters{display:flex;gap:10px;margin:20px 0 12px}.attendance-filters>.el-select{width:150px;flex-shrink:0}.attendance-filters>.el-input{min-width:130px;flex:1}.observation-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:#607487;margin:0 0 14px}.observation-tools label{display:flex;align-items:center;gap:7px}.observation-tools select{border:1px solid #dee5ed;border-radius:5px;padding:4px;color:#52647b;background:white}.observation-tools small{color:#9a651c}.result-table-scroll{overflow-x:auto}.result-table{border-collapse:collapse;width:100%;font-size:14px;text-align:left}.result-table th{background:#f6f7fa;padding:13px 12px;color:#52647b;font-size:13px;font-weight:600;white-space:nowrap}.result-table td{border-bottom:1px solid #e8ecf1;padding:16px 12px;white-space:nowrap;line-height:1.5}.result-table tr{cursor:pointer}.result-table tr.selected{background:#f0f0fa;box-shadow:inset 3px 0 #5b5cab}.result-table tr:hover{background:#f7f7fc}.result-table small{display:block;color:#687a91;font-size:12px;margin-top:5px}.result-table .advance{color:#c5223d;font-weight:600}.attendance-page .text-button{border:0;min-height:32px;padding:0 4px;color:#5b5cab;background:transparent;font-size:12px}.status-badge{display:inline-flex;border-radius:5px;padding:4px 7px;font-size:12px;background:#f2f5f8;color:#607487}.status-badge.early{background:#fff0f2;color:#c5223d}.status-badge.missing_exit,.status-badge.missing_no_gps{background:#fff5e3;color:#9a651c}.status-badge.returned,.status-badge.late_exit{background:#eaf7f3;color:#258161}.list-footer{display:grid;gap:16px;margin-top:16px}.list-footer p{display:flex;gap:7px;align-items:start;font-size:12px;line-height:1.7;color:#687a91;margin:0}.list-footer .el-pagination{justify-self:end}.attendance-detail h2{font-size:17px;margin:0}.attendance-detail header{display:flex;justify-content:space-between;align-items:center}.person-title{display:flex;align-items:center;gap:18px;margin:22px 0 8px}.person-title b{font-size:20px}.person-title span{font-size:12px;color:#687a91}.attendance-detail>p{font-size:13px;color:#687a91;margin:8px 0 14px;line-height:1.7}.detail-result{display:flex;align-items:center;gap:18px;padding:14px;background:#f2f5f8;border-radius:7px;font-size:14px;margin:16px 0}.detail-result.early{background:#fff0f2;color:#c5223d}.detail-result strong{font-size:22px}.attendance-detail h3{font-size:14px;margin:18px 0 12px}.evidence-timeline{list-style:none;padding:0;margin:0;max-height:385px;overflow:auto}.evidence-timeline li{display:grid;grid-template-columns:117px 20px minmax(0,1fr);gap:8px;align-items:start;padding:10px 0;font-size:12px;position:relative}.evidence-timeline li:not(:last-child):after{content:'';position:absolute;top:29px;bottom:-8px;left:134px;border-left:1px solid #dfe4ec}.evidence-timeline .el-icon{margin-top:1px;z-index:1;background:white;color:#5b5cab}.evidence-timeline .out .el-icon{color:#c5223d}.evidence-timeline .gps .el-icon{color:#087f86}.evidence-timeline .start,.evidence-timeline .end{color:#8492a6}.evidence-timeline b{font-size:12px;font-weight:500}.evidence-timeline small{display:block;font-size:11px;color:#8492a6;margin-top:4px;overflow-wrap:anywhere}.detail-context{border-top:1px solid #e8ecf1;margin-top:16px;padding-top:8px;font-size:12px;color:#687a91;line-height:1.7}.detail-context p{margin:5px 0}.detail-context .coverage-warning{color:#9a651c}.attendance-detail>p.detail-caution{display:flex;gap:8px;padding:10px 12px;background:#fff8eb;border:1px solid #efcf94;border-radius:7px;font-size:12px;color:#87571c;margin:16px 0}.review-note{display:grid;gap:9px;font-size:14px;font-weight:600;margin:18px 0 12px}.unsaved-note{display:block;color:#8492a6;margin-top:10px;font-size:12px}.mobile-detail-back{display:none!important}.attendance-empty{background:#fff;border:1px solid #dee5ed;border-radius:10px;text-align:center;padding:90px 24px;color:#607487}.attendance-empty>.el-icon{font-size:40px;color:#5b5cab}.attendance-empty h2{font-size:20px;color:#183047}.attendance-empty p{font-size:14px;line-height:1.8}.empty-result,.empty-detail{padding:45px 12px;text-align:center;color:#8492a6;font-size:14px}.import-warning-list{max-height:360px;overflow:auto;padding-left:22px;line-height:1.9;font-size:13px}.attendance-page :deep(.el-input__wrapper),.attendance-page :deep(.el-select__wrapper){min-height:40px;box-shadow:0 0 0 1px #dee5ed inset}
.result-table td.result-evidence{white-space:normal;min-width:220px;max-width:290px}.evidence-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.evidence-chip{display:inline-flex;padding:3px 6px;border-radius:4px;font-size:11px;background:#f2f5f8;color:#607487;line-height:1.5}.evidence-chip.gps{background:#edf8f8;color:#247c80}.evidence-chip.sequence{background:#fff5e3;color:#9a651c}.status-badge.normal,.detail-result.normal{background:#eaf7f3;color:#258161}.status-badge.sequence_review,.detail-result.sequence_review{background:#fff5e3;color:#9a651c}.status-badge.late_exit,.status-badge.returned{background:#f2f5f8;color:#607487}.detail-chips{margin:-5px 0 12px}.detail-findings,.sequence-issues{padding-left:18px;font-size:12px;line-height:1.8;color:#607487}.sequence-issues{color:#87571c}.evidence-timeline .context-event{background:#f6f7fa;border-radius:5px;padding-left:5px;padding-right:5px}.evidence-timeline .context-event .el-icon{background:#f6f7fa}.context-marker{display:block;color:#87571c;font-size:11px;margin-top:5px}.evidence-timeline small.scope-reason{color:#687a91}.note-metadata{display:block;font-size:11px;color:#687a91;line-height:1.6;margin-top:10px}
.evidence-chip.arrival{background:#fff0f2;color:#bb3146}.evidence-chip.retry{background:#eff3fa;color:#526b90}.evidence-timeline small.retry-marker{color:#526b90;line-height:1.6}
@media(max-width:1250px){.attendance-workspace{grid-template-columns:minmax(0,1fr) 345px}.attendance-list,.attendance-detail{padding:16px}.attendance-filters{flex-wrap:wrap}.attendance-filters>.el-input{order:0}.attendance-filters>.el-select{width:135px}.evidence-timeline li{grid-template-columns:108px 18px minmax(0,1fr);gap:5px}.evidence-timeline li:not(:last-child):after{left:122px}}
@media(max-width:950px){.attendance-workspace{grid-template-columns:1fr}.attendance-detail{max-width:none}.attendance-list{min-height:0}.evidence-timeline{max-height:none}.mobile-detail-back{display:inline-flex!important}.attendance-filters>.el-input{flex-basis:180px}.evidence-timeline li{grid-template-columns:130px 24px minmax(0,1fr);gap:10px}.evidence-timeline li:not(:last-child):after{left:150px}}
@media(max-width:600px){.attendance-sources{padding:16px}.source-state{display:none}.source-icon{width:36px;height:36px;font-size:21px}.attendance-list,.attendance-detail{padding:12px}.attendance-page .result-tabs button{padding:8px 10px;font-size:13px}.attendance-filters{gap:8px}.attendance-filters>.el-select{width:calc(50% - 4px)}.attendance-filters>.el-input{flex-basis:100%;order:-1}.attendance-filters>button{width:100%}.result-table{min-width:680px}.result-table td{padding:12px}.observation-tools{line-height:1.8}.attendance-empty{padding:55px 18px}.attendance-empty h2{font-size:17px}.attendance-empty p{font-size:13px}}
.attendance-sources{display:grid;gap:16px;padding:18px 22px}.source-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.source-item,.source-item+.source-item{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;padding:16px;border:1px solid #e8ecf1;border-radius:8px;background:#f8fafc;min-width:0}.source-icon{width:40px;height:40px;font-size:23px}.source-copy{gap:6px}.source-label{display:flex;align-items:center;gap:10px;min-width:0}.source-label b{font-size:14px;white-space:nowrap}.source-label .source-state{display:inline-flex;align-items:center;gap:4px;font-size:11px}.source-file-tools{display:flex;gap:7px;align-items:center}.source-file-tools .file-select,.source-file-tools button{height:40px;min-height:40px;border:1px solid #dee5ed;border-radius:6px;padding:8px 10px;background:white;text-decoration:none;font-size:12px}.source-file-tools .file-select{color:#5b5cab}.source-actions{width:100%;display:flex;gap:12px;align-items:flex-end;justify-content:flex-end;border-top:1px solid #e8ecf1;padding-top:14px}.period-select{display:grid;gap:6px;color:#607487;font-size:12px;min-width:0}.period-select input{height:40px;width:160px;max-width:none;padding:8px 10px}.source-actions>.primary{height:40px;min-height:40px;min-width:138px}.attendance-filters{flex-wrap:wrap}.attendance-filters>.result-filter{width:290px}.attendance-filters>.el-input{flex:1;min-width:190px}.personal-schedule-summary{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;font-size:12px;line-height:1.7;color:#607487;margin:0 0 14px}.personal-schedule-summary strong{font-size:13px;color:#35465b}.personal-shift-counts{display:flex;gap:8px 14px;flex-wrap:wrap;width:100%;color:#52647b}
@media(max-width:1100px){.source-item,.source-item+.source-item{grid-template-columns:40px minmax(0,1fr);gap:10px 12px}.source-file-tools{grid-column:2}}
@media(max-width:700px){.source-files{grid-template-columns:1fr}.source-item,.source-item+.source-item{grid-template-columns:40px minmax(0,1fr) auto}.source-file-tools{grid-column:auto}.source-actions{flex-wrap:wrap}.attendance-filters>.el-select{width:calc(50% - 4px)}.attendance-filters>.result-filter{width:100%}.attendance-filters>.el-input{flex-basis:100%;order:-1}.attendance-filters>button{flex:1}.attendance-sources{padding:16px}}
@media(max-width:480px){.source-item,.source-item+.source-item{grid-template-columns:36px minmax(0,1fr);padding:12px}.source-icon{width:36px;height:36px;font-size:21px}.source-file-tools{grid-column:2}.period-select{flex:1}.period-select input{width:100%;min-width:0}.source-actions>.primary{flex:1;min-width:0}.attendance-filters>.result-filter{width:100%}.attendance-filters>.el-select:not(.result-filter){flex:1}}
.attendance-filters>.result-filter{width:210px}.result-option-count{float:right;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;line-height:20px;padding:0 6px;margin-top:7px;border-radius:4px;background:#f2f4f7;color:#8492a6;font-size:11px;font-weight:400}
@media(min-width:1150px){.attendance-sources{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 277px;gap:12px;align-items:end}.source-files{display:contents}.source-item,.source-item+.source-item{grid-template-columns:38px minmax(0,1fr) auto;align-items:end;gap:9px;padding:12px}.source-icon{width:38px;height:38px;font-size:22px}.source-file-tools{gap:6px}.source-file-tools .file-select,.source-file-tools button{padding:8px;height:40px;min-height:40px}.source-actions{width:277px;gap:12px;border-top:0;padding:0 0 12px;align-items:flex-end}.period-select input{width:145px;height:40px}.source-actions>.primary{width:120px;min-width:120px;height:40px;min-height:40px;padding:8px 10px}}
@media(max-width:700px){.attendance-filters>.result-filter{width:100%}}
.validation-panel.import-info{background:#fff;border-color:#dee5ed;color:#607487}.import-rules{border-top:1px solid #e4e7eb;padding-top:8px;margin-top:12px;color:#687a91;font-size:12px}.import-rules b{font-weight:600}.import-rules p{margin-top:4px}.observation-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.observation-controls label>span{white-space:nowrap}.observation-controls .el-select{width:150px}.observation-controls select{height:40px;min-height:40px;width:100px;padding:8px 10px;font-size:14px}.observation-controls :deep(.el-select__wrapper){height:40px;min-height:40px}
@media(max-width:600px){.observation-controls{width:100%;justify-content:space-between}}
.window-select{height:40px;width:145px;max-width:100%;padding:8px 10px;border:1px solid #dee5ed;border-radius:6px;background:#fff;color:#35465b;font:inherit;font-size:14px}.window-select:focus-visible{outline:2px solid #5b5cab;outline-offset:2px}.window-select:disabled{color:#8492a6;background:#f5f7fa}.validation-panel summary{cursor:pointer}.validation-panel summary:focus-visible{outline:2px solid #5b5cab;outline-offset:6px;border-radius:3px}.reminder-toggle{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-size:13px;font-weight:600}.reminder-toggle .el-icon{transition:transform .15s}.reminder-toggle .expanded{transform:rotate(90deg)}.person-title .text-button{margin-left:auto}.personal-schedule-summary .text-button{padding:0}.observation-tools{margin-bottom:14px}
@media(max-width:480px){.window-select{width:100%}.reminder-toggle{gap:4px}}
@media(prefers-reduced-motion:reduce){.reminder-toggle .el-icon{transition:none}}
.attendance-page .person-detail-button{min-height:36px;padding:7px 12px;border:1px solid #c9c9e6;border-radius:6px;background:#f0f0fa;color:#45468b;font-size:13px;font-weight:500}.person-detail-button .el-icon{font-size:16px}.attendance-page .person-detail-button:hover{background:#e7e7f6;border-color:#a3a3d1}.person-title .person-detail-button{margin-left:auto}.person-title{flex-wrap:wrap;gap:10px 14px}
.attendance-page .column-sort{min-height:0;padding:0;border:0;background:transparent;color:#52647b;font:inherit;font-weight:600;gap:7px}.column-sort span{font-size:15px;color:#8492a6}.result-table th[aria-sort='ascending'] .column-sort span,.result-table th[aria-sort='descending'] .column-sort span{color:#5b5cab}.status-badge.rest,.status-badge.leave,.status-badge.blank{background:#f2f4f7;color:#758397}.schedule-explanation,.schedule-source{font-size:13px;color:#687a91;line-height:1.8}.schedule-only-row td{color:#758397}
@media(max-width:950px){.attendance-detail.detail-collapsed{display:none}}
.attendance-report-picker{display:flex;align-items:center;gap:12px;margin-bottom:16px;color:#65748a;font-size:13px}.attendance-report-picker .el-select{width:300px;max-width:70vw}.attendance-report-picker small{color:#8c98a9}
</style>

<template>
  <el-dialog :model-value="modelValue" :title="dialogTitle" width="min(1280px, calc(100vw - 48px))" top="5vh" class="attendance-person-dialog" append-to-body @update:model-value="emit('update:modelValue',$event)">
    <div v-if="calendar" class="person-attendance">
      <p class="person-meta">工号 {{calendar.person.id}} · {{monthLabel}}</p>
      <div class="month-metrics" aria-label="本月排班与核查统计">
        <div><strong>{{calendar.summary.workDays}}</strong><span>上班</span></div>
        <div><strong>{{calendar.summary.restDays}}</strong><span>休息</span></div>
        <div class="normal"><strong>{{calendar.summary.normalShifts}}</strong><span>正常下班</span></div>
        <div class="early"><strong>{{calendar.summary.earlyShifts}}</strong><span>提前出门</span></div>
        <div class="review"><strong>{{calendar.summary.reviewShifts}}</strong><span>待核查</span></div>
      </div>
      <p v-if="calendar.summary.leaveDays || calendar.summary.blankDays || calendar.summary.unavailableDays" class="source-range"><span v-if="calendar.summary.leaveDays">请假 / 调休 {{calendar.summary.leaveDays}} 天；</span><span v-if="calendar.summary.blankDays">原表空排班 {{calendar.summary.blankDays}} 天；</span><span v-if="calendar.summary.unavailableDays">{{calendar.summary.unavailableDays}} 天未提供排班，不能据此推断休息或缺勤。</span></p>
      <div class="early-date-list"><b>提前出门日期</b><template v-if="calendar.earlyDays.length"><button v-for="day in calendar.earlyDays" :key="day.date" :aria-label="`查看 ${day.date} 提前出门记录`" @click="selectedDate=day.date">{{dateChip(day.date)}}<span>{{duration(day.result?.advanceSeconds)}}</span></button></template><span v-else>本月未见提前出门线索</span></div>

      <div class="person-detail-layout">
        <div class="calendar-pane">
          <div class="calendar-legend" aria-label="日历状态说明"><span v-for="item in legend" :key="item.category"><i :class="item.category"></i>{{item.label}}</span></div>
          <div class="month-calendar" role="group" :aria-label="`${monthLabel}个人考勤日历`">
        <div v-for="weekday in weekdays" :key="weekday" class="weekday">{{weekday}}</div>
        <template v-for="(week,weekIndex) in calendar.weeks" :key="weekIndex">
          <template v-for="(day,index) in week" :key="`${weekIndex}-${index}`">
            <button v-if="day" class="calendar-day" :class="[day.statusCategory,{selected:selectedDate===day.date,unavailable:!day.available}]" :aria-label="dayAria(day)" :aria-pressed="selectedDate===day.date" @click="selectedDate=day.date"><strong>{{day.dayNumber}}</strong><span class="day-shift">{{day.type==='work'?day.shift:dayLabel(day)}}</span><small v-if="day.type==='work'">{{categoryLabel(day.statusCategory)}}</small></button>
            <span v-else class="calendar-padding" aria-hidden="true"></span>
          </template>
        </template>
          </div>
          <p class="calendar-note">休息和请假按原排班展示。提前出门及其他待核查结果均为记录线索。</p>
        </div>

      <div v-if="selectedDay" class="day-detail-pane"><section class="selected-day-detail" aria-label="所选日期记录">
        <header><div><h3>{{selectedDay.date}}</h3><span>{{selectedDay.type==='work'?selectedDay.shift:dayLabel(selectedDay)}}</span></div><span class="day-status" :class="selectedDay.statusCategory">{{selectedDay.type==='work'?selectedDay.result?statusLabel(selectedDay.result.status):'核查结果未生成':dayLabel(selectedDay)}}</span></header>
        <template v-if="selectedDay.result">
          <dl class="day-facts"><div><dt>本班关联出门</dt><dd>{{associatedExit(selectedDay.result) || '未查到可关联记录'}}</dd></div><div v-if="selectedDay.result.advanceSeconds!=null"><dt>提前时长</dt><dd>{{duration(selectedDay.result.advanceSeconds)}}</dd></div><div><dt>正常下班窗口</dt><dd>{{selectedDay.result.end}} 至 {{selectedDay.result.normalExitEnd || '截止时间未提供'}}</dd></div><div><dt>下班时段 GPS</dt><dd>{{selectedDay.result.gpsTimes?.length ? selectedDay.result.gpsTimes.join('；') : '未查到'}}</dd></div></dl>
          <ul v-if="selectedDay.result.findings?.length" class="day-findings"><li v-for="(finding,index) in selectedDay.result.findings" :key="`${finding.code}-${index}`">{{finding.text}}</li></ul>
          <details class="day-timeline" open><summary>原始记录时间线 · {{(selectedDay.result.timeline || []).filter(event=>event.sourceRow).length}} 条</summary><ol><li v-for="(event,index) in selectedDay.result.timeline || []" :key="index" :class="{'context-event':event.contextOnly}"><time>{{event.time}}</time><div><b>{{eventLabel(event.type)}}</b><small v-if="event.contextOnly">后续 / 相邻班次记录，不补算本班离场</small><small v-if="event.retryScan">同通道连续刷脸，按一次进出核查</small><small v-if="event.device || event.gate">{{[event.device,event.direction,event.gate].filter(Boolean).join(' · ')}}</small><small v-if="event.sourceRow">考勤表第 {{(event.sourceRows || [event.sourceRow]).join('、')}} 行</small></div></li></ol></details>
          <p v-if="notes[selectedDay.result.key]?.note" class="saved-review"><b>已保存核查备注</b><span>{{notes[selectedDay.result.key].note}}</span></p>
          <p class="evidence-limit">GPS 不能确认本人在场或手机操作者；未见闸机出门可能涉及人工通道或记录遗漏。</p>
        </template>
        <p v-else class="day-explanation">{{selectedDay.type==='work'?'该工作日尚未生成核查结果，请返回清单重新分析。':!selectedDay.available?'该日期未提供原始排班数据，无法判断出勤。':selectedDay.type==='rest'?'原排班为休息，不作为缺勤或缺下班记录。':selectedDay.type==='leave'?'原排班为请假或调休，不参与工作班次核查。':'原排班单元格为空，需补充或核对排班。'}}</p>
      </section>
      <footer v-if="selectedDay.result" class="day-detail-footer"><el-button type="primary" class="person-list-action" @click="emit('select-shift',selectedDay.result.key)">在清单中查看</el-button></footer></div>
      </div>
    </div>
    <el-empty v-else description="当前报告没有可用的个人排班明细，请重新分析原始文件。" />
  </el-dialog>
</template>

<script setup>
import {computed,ref,watch} from 'vue'
import {buildAttendanceMonth} from '../utils/attendance-person-detail.mjs'
import {associatedExit,duration,statusLabel} from '../utils/attendance-display.mjs'

const props=defineProps({modelValue:{type:Boolean,default:false},personId:{type:String,default:''},analysis:{type:Object,default:null},notes:{type:Object,default:()=>({})}})
const emit=defineEmits(['update:modelValue','select-shift'])
const calendar=computed(()=>buildAttendanceMonth(props.analysis,props.personId))
const selectedDate=ref('')
const selectedDay=computed(()=>calendar.value?.days.find(day=>day.date===selectedDate.value))
const dialogTitle=computed(()=>calendar.value?`${calendar.value.person.name} · 考勤详情`:'个人考勤详情')
const monthLabel=computed(()=>calendar.value?`${calendar.value.month.slice(0,4)}年${Number(calendar.value.month.slice(5))}月`:'')
const weekdays=['一','二','三','四','五','六','日']
const legend=[{category:'normal',label:'正常下班'},{category:'early',label:'提前出门'},{category:'review',label:'待核查'},{category:'rest',label:'休息'},{category:'leave',label:'请假 / 调休'}]
const categoryLabel=category=>({normal:'正常下班',early:'提前出门',review:'待核查',rest:'休息',leave:'请假 / 调休',blank:'空排班'}[category] || '待核查')
const dayLabel=day=>!day.available?'排班未提供':day.type==='blank'?'空排班':day.label || categoryLabel(day.statusCategory)
const dateChip=date=>`${Number(date.slice(5,7))}/${Number(date.slice(8))}`
const dayAria=day=>`${day.date}，${day.type==='work'?`${day.shift}，${categoryLabel(day.statusCategory)}`:dayLabel(day)}`
const eventLabel=type=>({in:'闸机进门',out:'闸机出门',gps:'手机 GPS',start:'应上班',end:'应下班',window_end:'正常下班窗口截止'}[type] || '考勤记录')
watch(calendar,value=>{if(!value){selectedDate.value='';return}if(!value.days.some(day=>day.date===selectedDate.value))selectedDate.value=value.earlyDays[0]?.date || value.days.find(day=>day.type==='work')?.date || value.days[0]?.date || ''},{immediate:true})
</script>

<style scoped>
.person-attendance{color:#183047;--normal-bg:#edf8f2;--normal-color:#247653;--early-bg:#fff0f2;--early-color:#bb3146;--review-bg:#fff7e8;--review-color:#956620;--rest-bg:#f2f4f7;--rest-color:#758397}.person-meta{font-size:13px;color:#687a91;margin:0 0 18px}.month-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.month-metrics>div{display:grid;gap:5px;padding:13px 10px;text-align:center;border:1px solid #e4e9ef;border-radius:8px;background:#f8fafc}.month-metrics strong{font-size:25px;line-height:1.2}.month-metrics span{font-size:12px;color:#607487}.month-metrics .normal{background:var(--normal-bg);color:var(--normal-color)}.month-metrics .early{background:var(--early-bg);color:var(--early-color)}.month-metrics .review{background:var(--review-bg);color:var(--review-color)}.source-range{font-size:12px;color:#687a91;line-height:1.8}.early-date-list{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:18px 0;font-size:12px;color:#607487}.early-date-list b{color:#35465b;font-weight:600;margin-right:4px}.early-date-list button{display:flex;gap:7px;align-items:center;border:1px solid #edbdc5;border-radius:5px;background:var(--early-bg);padding:6px 8px;color:var(--early-color);font:inherit;cursor:pointer}.early-date-list button span{font-size:11px}.calendar-legend{display:flex;gap:8px 15px;flex-wrap:wrap;font-size:11px;color:#687a91;margin:0 0 10px}.calendar-legend>span{display:flex;align-items:center;gap:5px}.calendar-legend i{width:9px;height:9px;border-radius:3px;background:#e4e9ef}.calendar-legend .normal{background:#63a583}.calendar-legend .early{background:#cf6375}.calendar-legend .review{background:#c6a362}.calendar-legend .rest{background:#a5afbd}.calendar-legend .leave{background:#b8afca}.month-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.weekday{text-align:center;font-size:12px;color:#687a91;padding:6px}.calendar-day{display:flex;flex-direction:column;gap:7px;text-align:left;border:1px solid #e3e8ef;border-radius:7px;padding:10px 8px;min-height:93px;min-width:0;font:inherit;background:white;color:#607487;cursor:pointer}.calendar-day strong{font-size:15px;line-height:1}.calendar-day .day-shift{font-size:11px;line-height:1.4;overflow-wrap:anywhere}.calendar-day small{font-size:10px;line-height:1.4}.calendar-day.normal{background:var(--normal-bg);color:var(--normal-color)}.calendar-day.early{background:var(--early-bg);color:var(--early-color)}.calendar-day.review{background:var(--review-bg);color:var(--review-color)}.calendar-day.rest,.calendar-day.blank{background:var(--rest-bg);color:var(--rest-color)}.calendar-day.leave{background:#f4f1f8;color:#7c6d99}.calendar-day.unavailable{border-style:dashed;background:white}.calendar-day.selected{outline:2px solid #5b5cab;outline-offset:1px}.calendar-day:focus-visible,.early-date-list button:focus-visible{outline:2px solid #5b5cab;outline-offset:2px}.calendar-note{margin:12px 0 20px;font-size:11px;color:#8492a6;line-height:1.7}.selected-day-detail{border:1px solid #dee5ed;border-radius:9px;padding:16px}.selected-day-detail header{display:flex;justify-content:space-between;gap:12px;align-items:center}.selected-day-detail h3{font-size:16px;margin:0 0 5px}.selected-day-detail header>div>span{font-size:12px;color:#687a91}.day-status{padding:5px 8px;border-radius:5px;font-size:12px;background:var(--rest-bg);color:var(--rest-color);max-width:55%;line-height:1.6}.day-status.normal{background:var(--normal-bg);color:var(--normal-color)}.day-status.early{background:var(--early-bg);color:var(--early-color)}.day-status.review{background:var(--review-bg);color:var(--review-color)}.day-facts{display:grid;gap:10px;margin:18px 0;font-size:12px}.day-facts>div{display:grid;grid-template-columns:115px minmax(0,1fr);gap:8px;line-height:1.7}.day-facts dt{color:#687a91}.day-facts dd{margin:0;overflow-wrap:anywhere}.day-findings{margin:14px 0;padding-left:18px;color:#607487;font-size:12px;line-height:1.8}.day-timeline{border-top:1px solid #e8ecf1;padding-top:12px;font-size:12px}.day-timeline summary{cursor:pointer;color:#52647b}.day-timeline ol{list-style:none;max-height:330px;overflow:auto;padding:0;margin:10px 0 0}.day-timeline li{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;padding:9px 0;border-bottom:1px solid #f0f2f5;line-height:1.7}.day-timeline time{color:#687a91}.day-timeline b{font-weight:500}.day-timeline small{display:block;color:#8492a6;font-size:11px;overflow-wrap:anywhere}.day-timeline .context-event{background:#f6f7fa;padding:9px 5px}.saved-review{display:grid;gap:6px;padding:10px 12px;background:#f8fafc;border-radius:6px;font-size:12px;line-height:1.8;color:#607487}.saved-review b{font-weight:600}.saved-review span{white-space:pre-wrap;overflow-wrap:anywhere}.evidence-limit,.day-explanation{font-size:12px;color:#687a91;line-height:1.8;margin:14px 0}
@media(max-width:600px){.month-metrics{gap:5px}.month-metrics>div{padding:10px 3px}.month-metrics strong{font-size:21px}.month-metrics span{font-size:10px}.month-calendar{gap:4px}.calendar-day{padding:8px 4px;min-height:90px}.calendar-day .day-shift{font-size:10px}.selected-day-detail{padding:12px}.day-facts>div{grid-template-columns:95px minmax(0,1fr)}.day-timeline li{grid-template-columns:128px minmax(0,1fr);gap:7px;font-size:11px}.day-status{font-size:11px}.early-date-list{gap:6px}}
@media(max-width:380px){.month-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.calendar-day{min-height:88px;gap:5px}.calendar-day strong{font-size:14px}.calendar-day small{font-size:9px}.selected-day-detail header{align-items:flex-start}.day-facts>div{grid-template-columns:1fr;gap:2px}.day-timeline li{grid-template-columns:1fr;gap:2px}}
:global(.attendance-person-dialog.el-dialog){max-height:90vh;display:flex;flex-direction:column;margin-bottom:5vh}:global(.attendance-person-dialog .el-dialog__header){flex:none}:global(.attendance-person-dialog .el-dialog__body){min-height:0;overflow:hidden;padding-top:8px}.person-attendance{display:flex;flex-direction:column;max-height:calc(90vh - 96px);min-height:0}.person-attendance>p,.month-metrics,.early-date-list{flex:none}.person-meta{margin-bottom:12px}.month-metrics>div{padding:10px}.early-date-list{margin:14px 0}.person-detail-layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);gap:22px;align-items:start;min-height:0;flex:1;overflow:hidden}.calendar-pane{min-width:0}.calendar-day{min-height:76px;padding:8px;gap:5px}.calendar-note{margin:10px 0 0}.selected-day-detail{min-width:0;max-height:calc(90vh - 270px);overflow-y:auto;overscroll-behavior:contain}.day-timeline ol{max-height:none;overflow:visible}
@media(max-width:900px){:global(.attendance-person-dialog .el-dialog__body){overflow-y:auto}.person-attendance{max-height:none}.person-detail-layout{grid-template-columns:1fr;overflow:visible;gap:18px}.selected-day-detail{max-height:none;overflow:visible}.calendar-day{min-height:82px}}
@media(max-height:850px) and (min-width:901px){:global(.attendance-person-dialog .el-dialog__body){overflow-y:auto}.person-attendance{max-height:none}.person-detail-layout{overflow:visible}.calendar-day{min-height:65px;padding:6px;gap:4px}.calendar-day strong{font-size:14px}.calendar-day .day-shift{font-size:10px}.person-meta{margin-bottom:10px}.month-metrics>div{padding:8px}.early-date-list{margin:10px 0}.selected-day-detail{max-height:calc(90vh - 230px)}}
@media(max-width:600px){:global(.attendance-person-dialog.el-dialog){width:calc(100vw - 20px)!important;margin-top:3vh;max-height:94vh;margin-bottom:3vh}:global(.attendance-person-dialog .el-dialog__body){padding:8px 12px 16px}.month-metrics>div{padding:10px 3px}.person-detail-layout{gap:16px}.calendar-day{padding:8px 4px;min-height:82px}.month-metrics strong{font-size:21px}.early-date-list{margin:12px 0}}
.day-detail-pane{display:flex;flex-direction:column;min-width:0;min-height:0;max-height:calc(90vh - 270px);border:1px solid #dee5ed;border-radius:9px;overflow:hidden}.day-detail-pane .selected-day-detail{border:0;border-radius:0;max-height:none;min-height:0;flex:1;overflow-y:auto}.day-detail-footer{flex:none;border-top:1px solid #e4e9ef;background:#fff;padding:11px 16px}.person-list-action.el-button{background:#5b5cab;border-color:#5b5cab;color:#fff}.person-list-action.el-button:hover,.person-list-action.el-button:focus-visible{background:#4e4f96;border-color:#4e4f96;color:#fff}
@media(max-width:900px){.day-detail-pane{max-height:none;overflow:visible}.day-detail-pane .selected-day-detail{overflow:visible}.day-detail-footer{border-radius:0 0 9px 9px}}
@media(max-height:850px) and (min-width:901px){.day-detail-pane{max-height:calc(90vh - 230px)}}
@media(max-width:600px){.day-detail-footer{padding:10px 12px}}
</style>

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {ref,computed,watch,nextTick,effectScope} from 'vue'
import * as display from '../src/utils/attendance-display.mjs'
import * as list from '../src/utils/attendance-list.mjs'
import {createAttendanceReviewCache} from '../src/utils/attendance-review-cache.mjs'

const targetKey='G1|2026-09-29|16:00-24:00'
const plain=value=>JSON.parse(JSON.stringify(value))
function monthAnalysis(normalExitHours=2,observationHours=normalExitHours) {
  const workDates=new Set([...Array.from({length:21},(_,index)=>index+1),29])
  const days=Array.from({length:30},(_,index)=>{
    const date=`2026-09-${String(index+1).padStart(2,'0')}`
    return workDates.has(index+1)?{date,type:'work',shift:'16:00-24:00',label:'16:00-24:00'}:{date,type:'rest',label:'休息'}
  })
  const results=days.filter(day=>day.type==='work').map(day=>({key:`G1|${day.date}|16:00-24:00`,id:'G1',name:'王哲',date:day.date,shift:day.shift,status:day.date==='2026-09-29'?'missing_exit':'normal',advanceSeconds:null,complete:true,timeline:[],gpsTimes:[],findings:[]}))
  return {version:2,ruleRevision:7,month:'2026-09',options:{normalExitHours,observationHours,retryWindowSeconds:120},people:[{id:'G1',name:'王哲',totalDays:30,shiftCount:22,restDays:8,leaveDays:0,blankDays:0,shiftCounts:{'16:00-24:00':22},days}],shiftOptions:['16:00-24:00'],results,warnings:[],coverage:{from:'2026-09-01 00:00:00',to:'2026-10-01 12:00:00'},summary:{people:1,matchedPeople:1,eventCount:50,shiftCount:22}}
}
const savedReport=(normalExitHours=2,observationHours=normalExitHours)=>({id:42,revision:7,analysis:monthAnalysis(normalExitHours,observationHours),notes:{[targetKey]:{note:'已保存备注',actorId:1,updatedAt:'2026-10-13 10:00:00'}}})

class TestFormData {
  constructor(){this.values=[]}
  append(key,value){this.values.push([key,value])}
  get(key){return this.values.find(([name])=>name===key)?.[1]??null}
}

function review(t,post,{confirm=async()=>{},cache=createAttendanceReviewCache(),session='review-fixture-session',get,user={role:'admin'}}={}) {
  const calls=[],confirmCalls=[],unmount=[],scope=effectScope()
  const source=fs.readFileSync(new URL('../src/views/AttendanceReview.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
  const context=vm.createContext({...display,...list,ref,computed,watch,nextTick,getToken:()=>session,getUser:()=>user,attendanceReviewCache:cache,onMounted(){},onBeforeUnmount(fn){unmount.push(fn)},useRoute:()=>({query:{}}),ElMessage:{success(){},error(){}},ElMessageBox:{confirm:async(...args)=>{confirmCalls.push(args);return confirm(...args)}},office:{post:async(url,body,options)=>{calls.push({url,body,options});return post(url,body,options)},patch:async(url,body)=>{calls.push({method:'PATCH',url,body});throw new Error('unexpected note write')},get:async(url,options)=>{if(get){calls.push({method:'GET',url});return get(url,options)}return {data:[]}}},FormData:TestFormData,window:{innerWidth:1280,addEventListener(){},removeEventListener(){}},document:{createElement:()=>({click(){}})},Blob,URL,setTimeout,clearTimeout})
  scope.run(()=>vm.runInContext(source+'\nthis.review={hours,analysis,report,notes,selectedKey,noteDraft,page,keyword,shiftFilter,resultTab,busy,changeObservation,applyReport,files,period,confirmImport,jumpToShift,personDetailOpen,personDetailId,activeSort,sortField,sortOrder,toggleSort,filtered,paged,resultTabs,listSummary,saveNote,detailCollapsed,collapseDetail,selectRow,detailPanel,initializeReview,analyze,loadingSaved,feedback};',context))
  let disposed=false
  const dispose=()=>{if(disposed)return;disposed=true;for(const fn of unmount)fn();scope.stop()}
  t.after(dispose)
  return {state:context.review,calls,confirmCalls,dispose,viewport:context.window}
}

async function loadAndEdit(state) {
  state.applyReport(savedReport());await nextTick()
  state.keyword.value='王哲';state.shiftFilter.value='16:00-24:00';state.resultTab.value='all';state.page.value=2;state.selectedKey.value=targetKey;await nextTick()
  state.noteDraft.value='现场核查草稿'
}

test('raw-grain leaders read saved attendance without starting analysis or writing notes',async t=>{
 const {state,calls}=review(t,()=>{throw new Error('readonly must not post')},{user:{role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},get:async url=>url==='/attendance/reports'?{data:[{id:42,revision:7,title:'已保存考勤'}]}:{data:savedReport()}});
 await state.initializeReview();assert.equal(state.report.value.id,42);state.hours.value=4;await state.changeObservation();await state.analyze();await state.saveNote();assert.equal(calls.some(c=>c.method==='PATCH'||c.url.includes('reanalyze')||c.url.includes('preview')),false);
});

test('returning to the page retains report, selected files, viewing state and dirty notes without reanalysis',async t=>{
  const cache=createAttendanceReviewCache(),first=review(t,async()=>{throw Error('unexpected analysis')},{cache});
  await loadAndEdit(first.state);first.state.files.value={schedule:{name:'待选排班.xlsx'},attendance:null};first.dispose();
  const returned=review(t,async()=>{throw Error('unexpected analysis')},{cache,get:async url=>{assert.equal(url,'/attendance/reports');return {data:[{id:42,revision:7}]}}});
  await returned.state.initializeReview();await nextTick();
  assert.equal(returned.state.report.value.id,42);assert.equal(returned.state.page.value,2);assert.equal(returned.state.selectedKey.value,targetKey);
  assert.equal(returned.state.noteDraft.value,'现场核查草稿');assert.equal(returned.state.keyword.value,'王哲');assert.equal(returned.state.files.value.schedule.name,'待选排班.xlsx');
  assert.deepEqual(returned.calls,[{method:'GET',url:'/attendance/reports'}]);assert.equal(returned.state.busy.value,false);assert.equal(returned.state.loadingSaved.value,false);
});
test('unchanged saved files and window reuse the result when Start Analysis is clicked',async t=>{
  const {state,calls}=review(t,async()=>{throw Error('unexpected analysis')});state.applyReport(savedReport());await nextTick();
  await state.analyze();assert.equal(calls.length,0);assert.match(state.feedback.value,/继续使用已保存/);
});
test('a changed stored revision reloads saved results and keeps the dirty draft without analyzing',async t=>{
  const cache=createAttendanceReviewCache(),first=review(t,async()=>{throw Error('unexpected')},{cache});await loadAndEdit(first.state);first.dispose();
  const updated=savedReport();updated.revision=8;
  const returned=review(t,async()=>{throw Error('unexpected analysis')},{cache,get:async url=>({data:url==='/attendance/reports'?[{id:42,revision:8}]:updated})});
  await returned.state.initializeReview();assert.equal(returned.state.report.value.revision,8);assert.equal(returned.state.noteDraft.value,'现场核查草稿');assert.equal(returned.state.page.value,2);
  assert.deepEqual(returned.calls.map(c=>c.url),['/attendance/reports','/attendance/reports/42']);
});
test('a deleted report invalidates cached results while session changes cannot reuse private state',async t=>{
  const cache=createAttendanceReviewCache(),first=review(t,async()=>{throw Error('unexpected')},{cache});first.state.applyReport(savedReport());await nextTick();first.dispose();
  const other=review(t,async()=>{throw Error('unexpected')},{cache,session:'different-account',get:async()=>({data:[]})});await other.state.initializeReview();assert.equal(other.state.analysis.value,null);
  const deleted=review(t,async()=>{throw Error('unexpected')},{cache,get:async url=>{if(url==='/attendance/reports')return {data:[]};throw {response:{status:404}}}});
  await deleted.state.initializeReview();assert.equal(deleted.state.analysis.value,null);assert.equal(deleted.state.report.value,null);assert.match(deleted.state.feedback.value,/当前没有已导入/);assert.equal(cache.read('review-fixture-session'),null);
});
test('saved reports read the selected normal-exit window and retain authoritative source people',async t=>{
  const {state}=review(t,async()=>{throw new Error('unexpected request')})
  const report=savedReport(1,4);state.applyReport(report);await nextTick()
  assert.equal(state.hours.value,1);assert.equal(state.period.value,'2026-09');assert.deepEqual(plain(state.analysis.value.people),report.analysis.people);assert.equal(state.analysis.value.people[0].shiftCount,22)
})

test('changing a saved report window automatically reanalyzes and preserves the dirty note and viewing state',async t=>{
  const updated=savedReport(4);updated.revision=8;updated.analysis.results.find(row=>row.key===targetKey).status='normal'
  const {state,calls,confirmCalls}=review(t,async()=>({data:updated}));await loadAndEdit(state)
  state.hours.value=4;await state.changeObservation();await nextTick()
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/attendance/reports/42/reanalyze');assert.deepEqual(plain(calls[0].body),{normalExitHours:4,observationHours:4,revision:7});assert.equal(confirmCalls.length,0)
  assert.equal(state.analysis.value.options.normalExitHours,4);assert.equal(state.hours.value,4);assert.equal(state.report.value.revision,8);assert.equal(state.busy.value,false)
  assert.equal(state.selectedKey.value,targetKey);assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(state.notes.value[targetKey].note,'已保存备注');assert.equal(state.page.value,2);assert.equal(state.keyword.value,'王哲');assert.equal(state.shiftFilter.value,'16:00-24:00');assert.equal(state.resultTab.value,'all');assert.equal(state.period.value,'2026-09')
})

test('failed automatic reanalysis restores the applied window and leaves analysis and unsaved notes intact',async t=>{
  const error=Object.assign(new Error('request failed'),{response:{data:{msg:'重算失败'}}})
  const {state,calls,confirmCalls}=review(t,async()=>{throw error});await loadAndEdit(state)
  const before=plain(state.analysis.value);state.hours.value=1;await state.changeObservation();await nextTick()
  assert.equal(calls.length,1);assert.equal(state.hours.value,2);assert.deepEqual(plain(state.analysis.value),before);assert.equal(state.report.value.revision,7);assert.equal(state.busy.value,false);assert.equal(confirmCalls.length,0)
  assert.equal(state.selectedKey.value,targetKey);assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(state.page.value,2);assert.equal(state.keyword.value,'王哲');assert.equal(state.shiftFilter.value,'16:00-24:00');assert.equal(state.resultTab.value,'all')
})

test('a dirty selected note survives when the refreshed result no longer matches its review tab',async t=>{
  const updated=savedReport(4);updated.analysis.results.find(row=>row.key===targetKey).status='normal'
  const {state,confirmCalls}=review(t,async()=>({data:updated}));await loadAndEdit(state)
  state.resultTab.value='signals';state.page.value=1;await nextTick();state.hours.value=4;await state.changeObservation();await nextTick()
  assert.equal(state.analysis.value.results.find(row=>row.key===targetKey).status,'normal');assert.equal(state.resultTab.value,'signals');assert.equal(state.selectedKey.value,targetKey);assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(confirmCalls.length,0)
})

test('changing an unsaved preview window refreshes its original files without saving or confirming an import',async t=>{
  const {state,calls,confirmCalls}=review(t,async()=>({data:monthAnalysis(1)}))
  state.analysis.value=monthAnalysis();state.period.value='2026-09';state.files.value={schedule:{name:'2026年9月排班.xlsx'},attendance:{name:'9月份考勤表.xlsx'}};state.selectedKey.value=targetKey;await nextTick()
  state.keyword.value='王哲';state.shiftFilter.value='16:00-24:00';state.page.value=2;state.hours.value=1;await state.changeObservation();await nextTick()
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/attendance/preview');assert.ok(calls[0].body instanceof TestFormData);assert.equal(calls[0].body.get('month'),'2026-09');assert.equal(Number(calls[0].body.get('normalExitHours')),1);assert.equal(Number(calls[0].body.get('observationHours')),1);assert.equal(calls[0].body.get('schedule').name,'2026年9月排班.xlsx');assert.equal(calls[0].body.get('attendance').name,'9月份考勤表.xlsx')
  assert.equal(confirmCalls.length,0);assert.equal(state.report.value,null);assert.equal(state.confirmImport.value,false);assert.equal(state.analysis.value.options.normalExitHours,1);assert.equal(state.hours.value,1);assert.equal(state.busy.value,false);assert.equal(state.page.value,2);assert.equal(state.keyword.value,'王哲');assert.equal(state.shiftFilter.value,'16:00-24:00')
})

test('a busy review does not start a second automatic reanalysis while its first request is pending',async t=>{
  let finish
  const pending=new Promise(resolve=>{finish=resolve}),{state,calls}=review(t,async()=>pending)
  state.applyReport(savedReport());await nextTick();state.hours.value=1;const updating=state.changeObservation()
  assert.equal(calls.length,1);assert.equal(state.busy.value,true);state.hours.value=4;await state.changeObservation()
  assert.equal(calls.length,1);assert.equal(state.analysis.value.options.normalExitHours,2)
  finish({data:savedReport(1)});await updating;await nextTick()
  assert.equal(calls[0].body.normalExitHours,1);assert.equal(state.busy.value,false);assert.equal(state.hours.value,1);assert.equal(state.analysis.value.options.normalExitHours,1)
})

test('filters and page changed during a pending refresh remain the user’s current choices',async t=>{
  let finish
  const pending=new Promise(resolve=>{finish=resolve}),{state,calls}=review(t,async()=>pending)
  await loadAndEdit(state);assert.equal(state.page.value,2);state.hours.value=4;const updating=state.changeObservation();assert.equal(calls.length,1)
  state.keyword.value='G1';state.shiftFilter.value='';state.resultTab.value='normal';state.page.value=1;await nextTick()
  const response=savedReport(4);response.analysis.results.find(row=>row.key===targetKey).status='normal';finish({data:response});await updating;await nextTick()
  assert.equal(state.hours.value,4);assert.equal(state.page.value,1,'the original page 2 must not replace the page selected while loading');assert.equal(state.keyword.value,'G1');assert.equal(state.shiftFilter.value,'');assert.equal(state.resultTab.value,'normal');assert.equal(state.noteDraft.value,'现场核查草稿')
})

test('a calendar jump to the already selected shift cannot close or rewrite a busy review',async t=>{
  const {state,calls,confirmCalls}=review(t,async()=>{throw new Error('unexpected request')});await loadAndEdit(state)
  state.keyword.value='G1';state.shiftFilter.value='16:00-24:00';state.resultTab.value='signals';state.page.value=1;state.personDetailId.value='G1';state.personDetailOpen.value=true;await nextTick();state.busy.value=true
  await state.jumpToShift(targetKey);await nextTick()
  assert.equal(state.selectedKey.value,targetKey);assert.equal(state.personDetailOpen.value,true);assert.equal(state.personDetailId.value,'G1');assert.equal(state.keyword.value,'G1');assert.equal(state.shiftFilter.value,'16:00-24:00');assert.equal(state.resultTab.value,'signals');assert.equal(state.page.value,1);assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(state.busy.value,true);assert.equal(calls.length,0);assert.equal(confirmCalls.length,0)
})

test('a late preview response cannot replace analysis after the source files have changed',async t=>{
  let finish
  const pending=new Promise(resolve=>{finish=resolve}),{state,calls}=review(t,async()=>pending)
  state.analysis.value=monthAnalysis();state.period.value='2026-09';state.files.value={schedule:{name:'旧排班.xlsx'},attendance:{name:'旧考勤.xlsx'}};await nextTick()
  const before=plain(state.analysis.value);state.hours.value=1;const updating=state.changeObservation();assert.equal(calls.length,1)
  state.files.value={schedule:{name:'新排班.xlsx'},attendance:{name:'新考勤.xlsx'}}
  finish({data:monthAnalysis(1)});await updating;await nextTick()
  assert.deepEqual(plain(state.analysis.value),before);assert.equal(state.files.value.schedule.name,'新排班.xlsx');assert.equal(state.files.value.attendance.name,'新考勤.xlsx');assert.equal(state.report.value,null)
})

test('a response arriving after the review is unmounted does not change its report or dirty note',async t=>{
  let finish
  const pending=new Promise(resolve=>{finish=resolve}),{state,calls,dispose}=review(t,async()=>pending)
  await loadAndEdit(state);const before=plain(state.analysis.value);state.hours.value=1;const updating=state.changeObservation();assert.equal(calls.length,1)
  dispose();const response=savedReport(1);response.revision=8;response.notes[targetKey].note='服务端更新后的备注';finish({data:response});await updating
  assert.deepEqual(plain(state.analysis.value),before);assert.equal(state.report.value.revision,7);assert.equal(state.notes.value[targetKey].note,'已保存备注');assert.equal(state.noteDraft.value,'现场核查草稿')
})

test('global and multi-person searches default to advance descending while one person gets chronological days',async t=>{
  const {state}=review(t,async()=>{throw new Error('unexpected request')}),report=savedReport()
  const target=report.analysis.results.find(row=>row.key===targetKey),small=report.analysis.results.find(row=>row.date==='2026-09-03');target.status='early';target.advanceSeconds=900;small.status='early';small.advanceSeconds=300
  report.analysis.people.push({id:'G2',name:'王刚',shiftCounts:{'8:00-16:00':1},days:[{date:'2026-09-02',type:'work',shift:'8:00-16:00',label:'8:00-16:00'}]});report.analysis.results.push({key:'G2-early',id:'G2',name:'王刚',date:'2026-09-02',shift:'8:00-16:00',status:'early',advanceSeconds:600})
  state.applyReport(report);await nextTick();assert.deepEqual(plain(state.activeSort.value),{field:'advance',order:'desc'});assert.deepEqual(state.filtered.value.slice(0,3).map(row=>row.advanceSeconds),[900,600,300])
  state.keyword.value='王';await nextTick();assert.deepEqual(plain(state.activeSort.value),{field:'advance',order:'desc'})
  state.keyword.value=' 王哲 ';await nextTick();assert.deepEqual(plain(state.activeSort.value),{field:'date',order:'asc'});assert.equal(state.filtered.value.length,30);assert.deepEqual(state.filtered.value.map(row=>row.date),Array.from({length:30},(_,index)=>`2026-09-${String(index+1).padStart(2,'0')}`))
  state.page.value=2;state.toggleSort('advance');assert.equal(state.page.value,1);assert.deepEqual(plain(state.activeSort.value),{field:'advance',order:'desc'});assert.equal(state.filtered.value[0].advanceSeconds,900)
  state.toggleSort('advance');assert.deepEqual(plain(state.activeSort.value),{field:'advance',order:'asc'});assert.equal(state.filtered.value[0].advanceSeconds,300)
  state.toggleSort('date');state.toggleSort('date');assert.deepEqual(plain(state.activeSort.value),{field:'date',order:'desc'});assert.equal(state.filtered.value[0].date,'2026-09-30')
  state.keyword.value='王刚';await nextTick();assert.equal(state.sortField.value,'');assert.equal(state.sortOrder.value,'');assert.equal(state.page.value,1);assert.deepEqual(plain(state.activeSort.value),{field:'date',order:'asc'});assert.deepEqual(state.filtered.value.map(row=>row.id),['G2'])
})

test('the complete month includes read-only rest days while normal, early and review counts contain only work',async t=>{
  const {state,calls}=review(t,async()=>{throw new Error('unexpected request')}),report=savedReport()
  report.analysis.results.forEach((row,index)=>{row.status=index<13?'normal':index<15?'early':'missing_exit';row.advanceSeconds=index>=13&&index<15?300:null})
  state.applyReport(report);state.keyword.value='王哲';await nextTick()
  assert.deepEqual(plain(state.resultTabs.value).map(tab=>[tab.key,tab.count]),[['all',30],['late',0],['normal',13],['early',2],['signals',7]]);assert.equal(state.listSummary.value,'当前筛选 30 条 · 上班 22 班 · 休息 8 天')
  const rest=state.filtered.value.find(row=>row.scheduleType==='rest');state.selectedKey.value=rest.key;await nextTick();state.noteDraft.value='不应提交的休息日备注';await state.saveNote()
  assert.equal(calls.length,0);assert.equal(state.report.value.revision,7)
  state.resultTab.value='signals';await nextTick();assert.equal(state.filtered.value.length,7);assert.ok(state.filtered.value.every(row=>row.rowType!=='schedule'))
  state.resultTab.value='all';state.shiftFilter.value='16:00-24:00';await nextTick();assert.equal(state.filtered.value.length,22);assert.ok(state.filtered.value.every(row=>row.rowType!=='schedule'))
})

test('late tab includes both normal departures and early exits without altering departure counts',async t=>{
  const {state}=review(t,async()=>{throw new Error('unexpected request')}),report=savedReport();
  report.analysis.results[0].status='early';report.analysis.results[0].arrival={status:'late',lateSeconds:180};
  report.analysis.results[1].arrival={status:'late',lateSeconds:60};
  state.applyReport(report);await nextTick();
  const counts=Object.fromEntries(plain(state.resultTabs.value).map(tab=>[tab.key,tab.count]));
  assert.equal(counts.late,2);assert.equal(counts.early,1);assert.equal(counts.normal,20);assert.equal(counts.signals,1);
  state.resultTab.value='late';await nextTick();assert.equal(state.filtered.value.length,2);
  assert.ok(state.filtered.value.every(r=>r.arrival.status==='late'));assert.ok(state.filtered.value.some(r=>r.status==='early'));
});

test('a replaced cached attendance opens the sole current import instead of showing removed history',async t=>{
 const cache=createAttendanceReviewCache(),first=review(t,async()=>{throw Error('unexpected')},{cache});first.state.applyReport(savedReport());await nextTick();first.dispose();
 const current={...savedReport(),id:43};const next=review(t,async()=>{throw Error('unexpected')},{cache,get:async url=>{if(url==='/attendance/reports')return {data:[{id:43,revision:current.revision}]};if(url==='/attendance/reports/43')return {data:current};throw {response:{status:404}}}});
 await next.state.initializeReview();assert.equal(next.state.report.value.id,43);assert.match(next.state.feedback.value,/上一份考勤不再保留/);
});

test('calendar jump finds the chronological page among thirty days rather than the severity-ordered source index',async t=>{
  const {state,calls,confirmCalls}=review(t,async()=>{throw new Error('unexpected request')}),report=savedReport(),target=report.analysis.results.find(row=>row.key===targetKey)
  report.analysis.results=[target,...report.analysis.results.filter(row=>row.key!==targetKey).reverse()]
  state.applyReport(report);await nextTick();state.personDetailId.value='G1';state.personDetailOpen.value=true;state.toggleSort('date');state.toggleSort('date');assert.equal(state.activeSort.value.order,'desc')
  await state.jumpToShift(targetKey);await nextTick()
  assert.equal(state.keyword.value,'王哲');assert.equal(state.personDetailOpen.value,false);assert.equal(state.selectedKey.value,targetKey);assert.equal(state.filtered.value.length,30);assert.deepEqual(plain(state.activeSort.value),{field:'date',order:'asc'});assert.equal(state.page.value,2);assert.ok(state.paged.value.some(row=>row.key===targetKey));assert.equal(calls.length,0);assert.equal(confirmCalls.length,0)
})

test('collapsing and reopening the same mobile detail preserves its dirty note without a discard prompt',async t=>{
  const {state,calls,confirmCalls,viewport}=review(t,async()=>{throw new Error('unexpected request')})
  viewport.innerWidth=600;await loadAndEdit(state)
  const scrollCalls=[];state.detailPanel.value={scrollIntoView(options){scrollCalls.push(options)}}
  state.collapseDetail();await nextTick()
  assert.equal(state.detailCollapsed.value,true);assert.equal(state.selectedKey.value,targetKey)
  assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(state.notes.value[targetKey].note,'已保存备注')
  assert.equal(confirmCalls.length,0);assert.equal(calls.length,0)
  await state.selectRow(state.filtered.value.find(row=>row.key===targetKey));await nextTick()
  assert.equal(state.detailCollapsed.value,false);assert.equal(state.selectedKey.value,targetKey)
  assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(confirmCalls.length,0);assert.equal(calls.length,0)
  assert.equal(scrollCalls.length,1);assert.equal(scrollCalls[0].block,'start')
})

test('reopening a different mobile record still requires the existing dirty-note decision',async t=>{
  let cancel=true
  const {state,calls,confirmCalls,viewport}=review(t,async()=>{throw new Error('unexpected request')},{confirm:async()=>{if(cancel)throw 'cancel'}})
  viewport.innerWidth=600;await loadAndEdit(state);state.collapseDetail();await nextTick()
  const other=state.filtered.value.find(row=>row.key!==targetKey&&row.rowType!=='schedule')
  await state.selectRow(other);await nextTick()
  assert.equal(confirmCalls.length,1);assert.match(confirmCalls[0][0],/备注尚未保存/)
  assert.equal(state.detailCollapsed.value,true);assert.equal(state.selectedKey.value,targetKey)
  assert.equal(state.noteDraft.value,'现场核查草稿');assert.equal(calls.length,0)
  cancel=false;await state.selectRow(other);await nextTick()
  assert.equal(confirmCalls.length,2);assert.equal(state.detailCollapsed.value,false)
  assert.equal(state.selectedKey.value,other.key);assert.equal(state.noteDraft.value,'')
  assert.equal(state.notes.value[targetKey].note,'已保存备注');assert.equal(calls.length,0)
})

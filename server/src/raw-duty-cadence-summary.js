const {dutyProgress,dutyState}=require('./raw-duty-progress');
const dayLabels={work:'上班',rest:'休息'}
function weekDays(start){return Array.from({length:7},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10))}
function weekMonths(start){return [...new Set(weekDays(start).map(d=>d.slice(0,7)))]}
function checkFor(entry,check={},selectedDate){
 if(entry.frequency==='每班')return (check.dailyRecords||[]).find(c=>c.date===selectedDate)||{}
 if(entry.frequency==='每月')return (check.monthlyRecords||[]).find(c=>c.month===selectedDate.slice(0,7))||{}
 return check
}
function expectedChecks(entry,check,cadence,start){
 if(!cadence?.version)return [check||{}]
 if(entry.frequency==='每班')return weekDays(start).filter(d=>cadence.calendar[d]==='work').map(d=>({date:d,...checkFor(entry,check,d)}))
 if(entry.frequency==='每月')return weekMonths(start).map(m=>({month:m,...checkFor(entry,check,m+'-01'),dateRequired:true}))
 return [{...(check||{}),dateRequired:true}]
}
function cadenceSummary(entries,checks,cadence,start,today){
 const byId=new Map(checks.map(c=>[c.dutyId,c])),flat=[]
 for(const e of entries)for(const [i,c]of expectedChecks(e,byId.get(e.id),cadence,start).entries())flat.push({...c,dutyId:e.id+':'+i})
 const progress=dutyProgress(flat.map(c=>({id:c.dutyId})),flat)
 const legacy=!cadence?.version
 const dailyOverview=weekDays(start).map((date,index)=>{
  const dailyEntries=entries.filter(e=>e.frequency==='每班')
  const datedLegacy=legacy&&dailyEntries.some(e=>byId.get(e.id)?.recordDate===date&&byId.get(e.id)?.result)
  const state=cadence?.calendar?.[date]||(datedLegacy?'work':'unknown')
  const selected=(state==='work'?dailyEntries:[]).map(e=>({id:e.id,...(legacy?(byId.get(e.id)?.recordDate===date?byId.get(e.id):{}):checkFor(e,byId.get(e.id),date)),dutyId:e.id}))
  const p=dutyProgress(selected.map(c=>({id:c.id})),selected)
  return {date,state,legacy,dayName:['周一','周二','周三','周四','周五','周六','周日'][index],shortDate:date.slice(5),unrecorded:state==='work'&&date<today?p.missing:0,notPerformed:p.incomplete+(state==='work'&&date<today?p.missing:0),label:date>today?'未到日期':state==='unknown'?(legacy?'未按日记录':'待确认'):state==='work'?(p.filled?p.filled+'/'+p.total:'未填'):dayLabels[state],...p}
 })
 const summaryFor=frequency=>{const subset=entries.filter(e=>e.frequency===frequency),slots=[];for(const e of subset)for(const [i,c]of expectedChecks(e,byId.get(e.id),cadence,start).entries())slots.push({...c,dutyId:e.id+':'+i});return dutyProgress(slots.map(c=>({id:c.dutyId})),slots)}
 const itemOverview={total:entries.length,done:0,abnormal:0,working:0,incomplete:0,missing:0,evidence:0,exempt:0}
 for(const e of entries){
  const parent=byId.get(e.id)||{};let states;
  if(legacy)states=[dutyState(parent)];
  else if(e.frequency==='每班'){
   const due=weekDays(start).filter(d=>d<=today);
   states=due.map(d=>{if(cadence.calendar[d]==='rest')return 'exempt';if(cadence.calendar[d]!=='work')return 'missing';const state=dutyState(checkFor(e,parent,d));return state==='missing'&&d<today?'incomplete':state});
  }else states=expectedChecks(e,parent,cadence,start).filter(c=>!c.month||c.month<=today.slice(0,7)).map(dutyState);
  if(states.includes('abnormal'))itemOverview.abnormal++;
  const state=['incomplete','evidence','abnormal','working','missing'].find(s=>states.includes(s))||(states.some(s=>s==='done')?'done':states.length?'exempt':'missing');
  if(state!=='abnormal')itemOverview[state]++;
 }
 return {progress,itemOverview,dailyOverview,notPerformed:dailyOverview.reduce((n,d)=>n+d.notPerformed,0),calendarPending:cadence?.version?dailyOverview.filter(d=>d.state==='unknown').length:0,weekly:summaryFor('每周'),monthly:summaryFor('每月'),continuous:summaryFor('持续开展')}
}
module.exports={dayLabels,weekDays,weekMonths,checkFor,expectedChecks,cadenceSummary};

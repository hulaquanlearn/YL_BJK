const D = require('./work-duties');

function buildWeeklyStatistics(members, records, start, today, calendars=[], catalog=D) {
  const dates = Array.from({length:6},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const byUser = new Map(members.map(m=>[String(m.user_id),[]]));
  for (const record of records) {
    if (record.kind !== 'duties' || !dates.includes(String(record.record_date).slice(0,10))) continue;
    byUser.get(String(record.user_id))?.push(record);
  }
  function item(duty, rows, future=false) {
    const found=rows.filter(r=>r.payload?.checks?.some(c=>c.dutyId===duty.id)).sort((a,b)=>Number(b.id)-Number(a.id));
    const latest=found[0],check=latest?.payload.checks.find(c=>c.dutyId===duty.id);
    let state='missing',label='未填报';
    if(future){state='future';label='未到日期';}
    else if(latest?.status==='draft'){state='draft';label='草稿';}
    else if(latest?.status==='submitted'){
      label=check.status||'已提交';
      const recordedDuty=check.dutySnapshot||duty;
      state=label==='未完成'?'unfinished':recordedDuty.abnormalOptions.includes(label)||['异常','有异常','发现问题'].includes(label)?'abnormal':'submitted';
    }
    return {dutyId:duty.id,title:duty.title,category:duty.category,state,label,
      recordId:future?null:latest?.id||null,recordDate:future?null:latest?.record_date||null,
      submittedCount:future?0:found.filter(r=>r.status==='submitted').length};
  }
  function counts(items){return {submitted:items.filter(i=>['submitted','abnormal','unfinished'].includes(i.state)).length,
    abnormal:items.filter(i=>i.state==='abnormal').length,unfinished:items.filter(i=>i.state==='unfinished').length,
    draft:items.filter(i=>i.state==='draft').length,missing:items.filter(i=>i.state==='missing').length};}
  const people=members.map((m,index)=>{
    const calendar=calendars[index]||{}, duties=require('./work-flow').activeCatalog(catalog,m.floor);
    const rows=byUser.get(String(m.user_id));
    const days=dates.map(date=>{const rest=date===calendar.restDate;const items=rest?[]:duties.list('daily').map(d=>item(d,rows.filter(r=>r.record_date===date&&r.payload.mode==='daily'),date>today));return {date,rest,future:date>today,items,...counts(items)};});
    const weekly=duties.list('weekly').map(d=>item(d,rows.filter(r=>r.payload.mode==='weekly'),start>today));
    const continuous=duties.list('continuous').map(d=>{const value=item(d,rows.filter(r=>r.payload.mode==='continuous'),start>today);return value.state==='missing'?{...value,state:'optional',label:'暂无记录'}:value;});
    return {userId:m.user_id,name:m.name,floor:m.floor,calendar,dailyDutyCount:duties.list('daily').length,days,weekly,continuous,totals:counts(days.flatMap(d=>d.items))};
  });
  return {weekStart:start,weekEnd:dates[5],today,dates,dailyDutyCount:catalog.list('daily').length,people};
}
module.exports={buildWeeklyStatistics};

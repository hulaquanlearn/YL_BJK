const D=require('./raw-duties');
const {weekDays,weekMonths,expectedChecks,cadenceSummary}=require('./raw-duty-cadence-summary');
function calendar(input,start){
 if(!input||typeof input!=='object'||Array.isArray(input))D.fail(400,'请确认每日上班情况');
 const allowed=new Set(weekDays(start)),out={};
 for(const [day,state]of Object.entries(input)){
  if(!allowed.has(day)||!['work','rest'].includes(state))D.fail(400,'每日上班情况无效');out[day]=state;
 }
 return out;
}
function validate(input,template,photos,calendarInput,start,submit=false,previousChecks=[]){
 const cal=calendar(calendarInput,start),days=weekDays(start),months=weekMonths(start),today=D.today();
 if(!Array.isArray(input)||input.length>60)D.fail(400,'履职记录格式无效');
 const seen=new Set(),byId=new Map();
 for(const c of input){if(seen.has(c.dutyId)||!template.entries.some(e=>e.id===c.dutyId))D.fail(400,'职责无效或重复');seen.add(c.dutyId);byId.set(c.dutyId,c)}
 function single(raw,e){return D.checks([{...raw,dutyId:e.id}],{entries:[e]},photos,false)[0]}
 function dateRequired(c,e,range){
  if(c.recordDate&&(c.recordDate>today||!range(c.recordDate)))D.fail(400,e.frequency==='每月'?'月度事项的执行日期须在对应月份且不能晚于今天':'执行日期须在本周且不能晚于今天');
  if(submit&&c.result&&!c.recordDate)D.fail(400,'请填写每周、每月和持续事项的执行日期');
 }
 const checks=template.entries.map(e=>{
  const raw=byId.get(e.id)||{};
  if(e.frequency==='每班'){
   if(raw.dailyRecords!==undefined&&(!Array.isArray(raw.dailyRecords)||raw.dailyRecords.length>7))D.fail(400,'每日履职记录无效');
   const unique=new Set(),dailyRecords=(raw.dailyRecords||[]).map(v=>{
    if(!days.includes(v.date)||unique.has(v.date))D.fail(400,'每日履职日期无效或重复');unique.add(v.date);
    const c=single({...v,recordDate:v.date},e);
    if(c.result||c.note||c.photoIds.length){if(v.date>today)D.fail(400,'不能提前填写未来日期的履职结果');if(cal[v.date]!=='work')D.fail(400,'请先将当日标记为上班，再填写履职情况')}
    if(c.result==='未完成'&&!c.note)D.fail(400,'每日未履职事项请填写未履职原因');
    const previous=previousChecks.find(p=>p.dutyId===e.id)?.dailyRecords?.find(p=>p.date===v.date),hasContent=c.result||c.note||c.photoIds.length;
    const signature=x=>JSON.stringify([x?.result||'',x?.note||'',x?.action||'',x?.photoIds||[]]);
    const now=new Date().toISOString(),firstRecordedAt=hasContent?(previous&&(previous.result||previous.note||previous.photoIds?.length)?previous.firstRecordedAt||'':now):'';
    return {...c,date:v.date,firstRecordedAt,recordedAt:hasContent?(previous&&signature(previous)===signature(c)?previous.recordedAt||'':now):''};
   });
   const c={dutyId:e.id,dailyRecords,result:'',note:'',action:'',recordDate:'',photoIds:[]};
   return c;
  }
  if(e.frequency==='每月'){
   if(raw.monthlyRecords!==undefined&&(!Array.isArray(raw.monthlyRecords)||raw.monthlyRecords.length>2))D.fail(400,'月度履职记录无效');
   const unique=new Set(),monthlyRecords=(raw.monthlyRecords||[]).map(v=>{
    if(!months.includes(v.month)||unique.has(v.month))D.fail(400,'月度履职月份无效或重复');unique.add(v.month);
    const c=single(v,e);dateRequired(c,e,date=>date.slice(0,7)===v.month);
    const previous=previousChecks.find(p=>p.dutyId===e.id)?.monthlyRecords?.find(p=>p.month===v.month),signature=x=>JSON.stringify([x?.result||'',x?.note||'',x?.action||'',x?.recordDate||'',x?.photoIds||[]]);const hasContent=c.result||c.note||c.photoIds.length;
    return {...c,month:v.month,originWeek:previous?.originWeek||'',recordedAt:hasContent?(previous&&signature(previous)===signature(c)?previous.recordedAt||new Date().toISOString():new Date().toISOString()):''};
   });
   return {dutyId:e.id,monthlyRecords,result:'',note:'',action:'',recordDate:'',photoIds:[]};
  }
  const c=single(raw,e);dateRequired(c,e,date=>days.includes(date));return c;
 });
 const cadence={version:2,calendar:cal},summary=cadenceSummary(template.entries,checks,cadence,start,today);
 if(submit){
  if(summary.calendarPending)D.fail(400,'请先确认本周每天的上班或休息情况');
  for(const e of template.entries){
   const c=checks.find(c=>c.dutyId===e.id),slots=expectedChecks(e,c,cadence,start);
   for(const slot of slots)D.checks([{...slot,dutyId:e.id}],{entries:[e]},photos,true);
  }
 }
 return {checks,cadence};
}
async function carryMonthly(db,report){
 const months=weekMonths(report.week_start),first=months[0]+'-01';
 const sources=await db.reportsForUser(report.user_id,first,report.week_start),chosen=new Map();
 for(const r of sources.filter(r=>r.id!==report.id&&['draft','returned','submitted','confirmed'].includes(r.status)).sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at)))){
  for(const e of report.template.entries.filter(e=>e.frequency==='每月')){
   const old=r.template.entries.find(v=>v.id===e.id&&v.frequency==='每月'&&v.title===e.title);if(!old)continue;
   const check=r.checks.find(c=>c.dutyId===e.id)||{},records=r.cadence?.version?check.monthlyRecords||[]:check.recordDate?[{...check,month:check.recordDate.slice(0,7)}]:[];
   for(const c of records)if((c.result||c.note||c.photoIds?.length)&&months.includes(c.month)){const key=e.id+':'+c.month,previous=chosen.get(key);if(!previous||String(c.recordedAt||r.updated_at)>=String(previous.c.recordedAt||previous.r.updated_at))chosen.set(key,{r,c})}
  }
 }
 if(!chosen.size)return report;
 const photoMap=new Map(),checks=[];
 for(const [key,{r,c}]of chosen){
  const photoIds=[];
  for(const id of c.photoIds||[]){const photoKey=r.id+':'+id;if(!photoMap.has(photoKey)){if(photoMap.size>=30)D.fail(400,'月度沿用图片超过30张，请联系管理员核对');const p=await db.photo(id);if(!p||Number(p.report_id)!==Number(r.id))D.fail(409,'月度来源图片不可用');photoMap.set(photoKey,await db.addPhoto(report.id,{image:p.image,mime:p.mime,filename:p.filename}))}photoIds.push(photoMap.get(photoKey))}
  const dutyId=key.slice(0,key.lastIndexOf(':'));let entry=checks.find(v=>v.dutyId===dutyId);if(!entry){entry={dutyId,monthlyRecords:[]};checks.push(entry)}entry.monthlyRecords.push({...c,photoIds,originWeek:c.originWeek||r.week_start});
 }
 return db.updateReport({...report,checks},report.revision);
}
// Monthly completion is shared by the same person/duty/month, including weeks
// that were opened before the completion was saved. Reads never rewrite history.
async function monthlyView(db,report,canRead=()=>true,withImages=false){
 if(report.cadence?.version!==2)return {...report,photos:await db.photos(report.id,withImages)};
 const months=weekMonths(report.week_start),end=new Date(months.at(-1)+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 const sources=await db.reportsForUser(report.user_id,months[0]+'-01',end.toISOString().slice(0,10));
 const checks=structuredClone(report.checks),photos=report.id?await db.photos(report.id,withImages):[],sharedMonths=[];
 for(const e of report.template.entries.filter(e=>e.frequency==='每月'))for(const month of months){
  let chosen=null;
  for(const r of [report,...sources.filter(r=>r.id!==report.id&&canRead(r))]){
   if(!r.template.entries.some(v=>v.id===e.id&&v.frequency==='每月'&&v.title===e.title))continue;
   const c=r.checks.find(v=>v.dutyId===e.id)?.monthlyRecords?.find(v=>v.month===month);
   if(!c||c.result!=='已完成'||!c.recordDate||!c.note&&!c.photoIds?.length)continue;const time=String(c.recordedAt||r.updated_at||'');
   if(!chosen||time>chosen.time)chosen={r,c,time};
  }
  if(!chosen||chosen.r.id===report.id||chosen.c.result!=='已完成'||!chosen.c.recordDate||!chosen.c.note&&!chosen.c.photoIds?.length)continue;
  let parent=checks.find(v=>v.dutyId===e.id);if(!parent){parent={dutyId:e.id,monthlyRecords:[]};checks.push(parent)}
  parent.monthlyRecords=(parent.monthlyRecords||[]).filter(v=>v.month!==month);
  const c={...chosen.c,shared:true,originWeek:chosen.c.originWeek||chosen.r.week_start,sourceReportId:chosen.r.id};parent.monthlyRecords.push(c);
  sharedMonths.push({dutyId:e.id,month,sourceReportId:chosen.r.id,sourceWeek:chosen.r.week_start});
  for(const id of c.photoIds||[])if(!photos.some(p=>p.id===id)){const p=await db.photo(id);if(!p||Number(p.report_id)!==Number(chosen.r.id))D.fail(409,'月度验证材料已变化，请刷新');const {image,...meta}=p;photos.push(withImages?p:meta)}
 }
 return {...report,checks,photos,sharedMonths};
}
function sharedInput(input,view){
 if(!Array.isArray(input)||input.length>60)D.fail(400,'履职记录格式无效');
 const checks=structuredClone(input);
 for(const s of view.sharedMonths||[]){let parent=checks.find(c=>c.dutyId===s.dutyId);if(!parent){parent={dutyId:s.dutyId,monthlyRecords:[]};checks.push(parent)}
  const expected=view.checks.find(c=>c.dutyId===s.dutyId).monthlyRecords.find(c=>c.month===s.month),incoming=parent.monthlyRecords?.find(c=>c.month===s.month);
  const signature=c=>JSON.stringify([c?.result||'',c?.note||'',c?.action||'',c?.recordDate||'',c?.photoIds||[]]);
  if(incoming&&signature(incoming)!==signature(expected))D.fail(409,'本月事项已在其他周完成，请刷新后查看；修改请进入实际记录周');
  parent.monthlyRecords=(parent.monthlyRecords||[]).filter(c=>c.month!==s.month);parent.monthlyRecords.push(expected);
 }
 return checks;
}
function localChecks(checks,original,view){
 for(const s of view.sharedMonths||[]){const parent=checks.find(c=>c.dutyId===s.dutyId),previous=original.find(c=>c.dutyId===s.dutyId)?.monthlyRecords?.find(c=>c.month===s.month);parent.monthlyRecords=parent.monthlyRecords.filter(c=>c.month!==s.month);if(previous)parent.monthlyRecords.push(previous)}return checks;
}
module.exports={calendar,validate,carryMonthly,monthlyView,sharedInput,localChecks};

// All timestamps below are workshop wall-clock time. UTC arithmetic avoids host timezone drift.
const { ApiError } = require('./utils');
const HOUR = 3600000, DAY = 24 * HOUR;
const clean = v => String(v ?? '').trim();
const stamp = n => new Date(n).toISOString().slice(0, 19).replace('T', ' ');
const fail = (message, details = []) => { throw new ApiError(400, message, details); };
function dayNumber(value) {
  const s = value instanceof Date ? value.toISOString().slice(0,10) : clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const n = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(n) && stamp(n).slice(0,10) === s ? n : NaN;
}
function timeNumber(value) {
  if (value instanceof Date) return value.getUTCHours()*HOUR + value.getUTCMinutes()*60000 + value.getUTCSeconds()*1000;
  if (typeof value === 'number' && value >= 0 && value < 1) return Math.round(value * DAY / 1000) * 1000;
  const m = clean(value).replaceAll('：',':').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[1]>23 || +m[2]>59 || +(m[3]||0)>59) return NaN;
  return +m[1]*HOUR + +m[2]*60000 + +(m[3]||0)*1000;
}
function monthValue(value) {
  const s = clean(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s) || +s.slice(0,4)<2000 || +s.slice(0,4)>2100) fail('请选择有效的排班月份');
  return s;
}
function headerRow(rows, required, source) {
  const i = rows.slice(0,20).findIndex(r => required.every(k => r.some(v => clean(v).replace(/\s/g,'') === k)));
  if (i < 0) fail(`${source}缺少必需字段：${required.join('、')}`);
  return { index:i, headers:rows[i].map(v => (v instanceof Date?v.toISOString().slice(0,10):clean(v)).replace(/\s/g,'')) };
}
function parseSchedule(rows, period) {
  const month = monthValue(period), {index,headers}=headerRow(rows,['工号','姓名'],'排班表');
  const idCols=headers.map((v,i)=>v==='工号'?i:-1).filter(i=>i>=0), nameCol=headers.indexOf('姓名');
  const columns=[];
  headers.forEach((v,c)=>{
    const m=v.match(/^(\d{1,2})月(\d{1,2})(?:号|日)?$/), iso=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m && !iso) return;
    const date=iso?v:`${month}-${String(+m[2]).padStart(2,'0')}`;
    if ((m && +m[1]!==+month.slice(5)) || !date.startsWith(month+'-') || !Number.isFinite(dayNumber(date))) fail(`排班日期与所选月份不一致或日期无效：${v}`,[{source:'排班表',row:index+1,column:c+1,message:'请检查日期表头和排班月份'}]);
    columns.push({c,date});
  });
  if (!columns.length) fail('排班表没有可识别的日期列，请使用“9月1号”或“2026-09-01”格式');
  if (new Set(columns.map(c=>c.date)).size!==columns.length) fail('排班表存在重复日期列');
  const people=[],shifts=[],errors=[],warnings=[],seen=new Set();
  for(let i=index+1;i<rows.length;i++) {
    const r=rows[i]; if(r.every(v=>!clean(v)))continue;
    const id=clean(r[idCols[0]]).toUpperCase(),name=clean(r[nameCol]);
    if(!id||!name){errors.push({source:'排班表',row:i+1,message:'工号或姓名为空'});continue;}
    if(idCols.some(c=>clean(r[c]) && clean(r[c]).toUpperCase()!==id)){errors.push({source:'排班表',row:i+1,message:'两个工号列不一致'});continue;}
    if(seen.has(id)){errors.push({source:'排班表',row:i+1,message:`工号 ${id} 重复`});continue;} seen.add(id);
    people.push({id,name,row:i+1});
    for(const {c,date} of columns) {
      const label=clean(r[c]).replaceAll('：',':').replace(/[—–]/g,'-').replace(/\s/g,'');
      if(['休息','年休假','请假','病假','事假','产假','调休'].includes(label))continue;
      if(!label){warnings.push({source:'排班表',row:i+1,column:c+1,message:`${name} ${date} 排班为空，未作出勤判断`});continue;}
      const m=label.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if(!m||+m[1]>24||+m[3]>24||+m[2]>59||+m[4]>59||(+m[1]===24&&+m[2]!==0)||(+m[3]===24&&+m[4]!==0)){errors.push({source:'排班表',row:i+1,column:c+1,message:`无法识别班次“${label}”`});continue;}
      const base=dayNumber(date),start=base+(+m[1]%24)*HOUR+(+m[2])*60000;
      let end=base+(+m[3])*HOUR+(+m[4])*60000; if(end<=start)end+=DAY;
      if(end-start>=DAY){errors.push({source:'排班表',row:i+1,column:c+1,message:'班次不能达到或超过24小时'});continue;}
      shifts.push({key:`${id}|${date}|${label}`,id,name,date,label,start,end,scheduleRow:i+1,scheduleColumn:c+1});
    }
  }
  if(errors.length)fail('排班表校验未通过，请修正后重新导入',errors.slice(0,100));
  if(!shifts.length)fail('排班表没有有效工作班次');
  const grouped=new Map(); for(const s of shifts){if(!grouped.has(s.id))grouped.set(s.id,[]);grouped.get(s.id).push(s);}
  for(const ss of grouped.values()){
    ss.sort((a,b)=>a.start-b.start);
    ss.forEach((s,i)=>{s.nextStart=ss[i+1]?.start;s.prevEnd=ss[i-1]?.end;if(s.prevEnd>s.start)errors.push({source:'排班表',row:s.scheduleRow,column:s.scheduleColumn,message:`${s.name} ${s.date} 与上一班次重叠`});});
  }
  if(errors.length)fail('存在重叠班次，请核对排班',errors.slice(0,100));
  return {month,people,shifts,warnings};
}
function parseAttendance(rows) {
  const {index,headers}=headerRow(rows,['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],'考勤表');
  const col=k=>headers.indexOf(k),events=[],errors=[],warnings=[],seen=new Map();
  let duplicates=0;
  for(let i=index+1;i<rows.length;i++) {
    const r=rows[i];if(r.every(v=>!clean(v)))continue;
    const id=clean(r[col('工号')]).toUpperCase(),name=clean(r[col('姓名')]),date=dayNumber(r[col('刷卡日期')]),time=timeNumber(r[col('刷卡时间')]),device=clean(r[col('设备号')]).toUpperCase(),direction=clean(r[col('方向')]);
    if(!id||!name||!Number.isFinite(date)||!Number.isFinite(time)){errors.push({source:'考勤表',row:i+1,message:'工号、姓名、刷卡日期或时间无效'});continue;}
    const type=device==='ONECARD'?(direction==='进'?'in':direction==='出'?'out':'invalid'):device.startsWith('GPS')?'gps':'invalid';
    if(type==='invalid'){errors.push({source:'考勤表',row:i+1,message:`不支持的设备或方向：${device} ${direction}`});continue;}
    const gate=clean(r[col('设备名称')]),key=[id,date+time,device,direction,gate].join('|');
    if(seen.has(key)){seen.get(key).sourceRows.push(i+1);duplicates++;continue;}
    const e={id,name,at:date+time,type,device,direction,gate,department:clean(r[col('部门')]),sourceRow:i+1,sourceRows:[i+1]};seen.set(key,e);events.push(e);
  }
  if(errors.length)fail('考勤表校验未通过，请修正后重新导入',errors.slice(0,100));
  if(!events.length)fail('考勤表没有有效打卡记录');
  if(duplicates)warnings.push({source:'考勤表',message:`发现 ${duplicates} 条完全重复记录，分析时已去重，原始行号保留`});
  events.sort((a,b)=>a.at-b.at);
  return {events,warnings,duplicates};
}
function analyzeAttendance(scheduleRows,attendanceRows,options={}) {
  const schedule=parseSchedule(scheduleRows,options.month),att=parseAttendance(attendanceRows);
  const hours=Number(options.observationHours??2);
  if(![0.5,1,2,4].includes(hours))fail('下班后观察时段仅支持30分钟、1小时、2小时或4小时');
  const byId=new Map();for(const e of att.events){if(!byId.has(e.id))byId.set(e.id,[]);byId.get(e.id).push(e);}
  const first=att.events[0].at,last=att.events.at(-1).at,warnings=[...schedule.warnings,...att.warnings];
  const monthStart=dayNumber(schedule.month+'-01'),monthEnd=Date.UTC(+schedule.month.slice(0,4),+schedule.month.slice(5),1);
  if(!att.events.some(e=>e.at>=monthStart&&e.at<monthEnd))fail('考勤记录与所选排班月份没有交集，请检查文件或月份');
  const population=new Set(schedule.people.map(p=>p.id)),matched=schedule.people.filter(p=>byId.has(p.id));
  for(const p of schedule.people){if(!byId.has(p.id))warnings.push({source:'人员匹配',row:p.row,message:`${p.name}（${p.id}）没有任何考勤记录，不作缺出门判断`});else if(byId.get(p.id).some(e=>e.name!==p.name))fail(`工号 ${p.id} 的两表姓名不一致，请核对人员`,[{source:'人员匹配',row:p.row,message:p.name}]);}
  const outside=[...byId.keys()].filter(id=>!population.has(id));
  if(outside.length)warnings.push({source:'人员匹配',message:`${outside.length} 个考勤工号不在排班表中，未纳入分析：${outside.slice(0,20).join('、')}`});
  if(!matched.length)fail('两张表没有匹配的工号，请检查文件是否选对');
  const serialEvent=e=>({time:stamp(e.at),type:e.type,device:e.device,direction:e.direction,gate:e.gate,sourceRow:e.sourceRow,sourceRows:e.sourceRows});
  const results=schedule.shifts.map(s=>{
    const all=byId.get(s.id)||[],lo=Math.max(s.start-2*HOUR,s.prevEnd??-Infinity);
    // Stop before the next shift's pre-entry period; a later outing is never assigned across shifts.
    const hi=Math.max(s.end,Math.min(s.end+hours*HOUR,s.nextStart? s.nextStart-2*HOUR:Infinity));
    const extendedHi=Math.max(s.end,Math.min(s.end+12*HOUR,s.nextStart?s.nextStart-2*HOUR:Infinity));
    const ev=all.filter(e=>e.at>=lo&&e.at<=Math.max(s.end,extendedHi));
    const early=ev.filter(e=>e.type==='out'&&e.at>=s.start&&e.at<s.end),exit=early.at(-1);
    const returned=exit?ev.find(e=>e.type==='in'&&e.at>exit.at&&e.at<s.end):null;
    const after=ev.find(e=>e.type==='out'&&e.at>=s.end&&e.at<=hi);
    const later=ev.find(e=>e.type==='out'&&e.at>hi&&e.at<=extendedHi);
    const gps=ev.filter(e=>e.type==='gps'&&e.at>=s.end&&e.at<=hi);
    const gpsAfterExit=exit?ev.find(e=>e.type==='gps'&&e.at>exit.at&&e.at<=hi):null;
    const entered=ev.find(e=>e.type==='in'&&e.at<s.end);
    const complete=last>=hi&&s.end<=last,matchedPerson=byId.has(s.id);
    let status='no_signal';
    if(early.length)status=returned?'returned':'early';
    else if(!matchedPerson)status='unmatched';
    else if(!complete)status='partial';
    else if(!ev.some(e=>e.at<=hi))status='no_records';
    else if(!after&&gps.length)status=later?'late_exit':'missing_exit';
    else if(!after&&!later)status='missing_no_gps';
    const timeline=[...ev.map(serialEvent),{time:stamp(s.start),type:'start'},{time:stamp(s.end),type:'end'}].sort((a,b)=>a.time.localeCompare(b.time));
    return {key:s.key,id:s.id,name:s.name,date:s.date,shift:s.label,department:all[0]?.department||'',start:stamp(s.start),end:stamp(s.end),status,complete,matched:matchedPerson,earlyCount:early.length,earlyEvents:early.map(serialEvent),earlyExit:exit?stamp(exit.at):null,advanceSeconds:exit?(s.end-exit.at)/1000:null,returnedAt:returned?stamp(returned.at):null,enteredAt:entered?stamp(entered.at):null,afterExit:after?stamp(after.at):null,lateExit:later?stamp(later.at):null,gpsTimes:gps.map(e=>stamp(e.at)),gpsAfterExit:gpsAfterExit?stamp(gpsAfterExit.at):null,observationEnd:stamp(hi),extendedEnd:stamp(extendedHi),extendedComplete:last>=extendedHi,timeline,scheduleRow:s.scheduleRow,scheduleColumn:s.scheduleColumn};
  });
  const priority={early:0,missing_exit:1,returned:2,late_exit:3,missing_no_gps:4,partial:5,unmatched:6,no_records:7,no_signal:8};
  results.sort((a,b)=>priority[a.status]-priority[b.status]||(b.advanceSeconds||0)-(a.advanceSeconds||0)||a.date.localeCompare(b.date));
  const partial=results.filter(r=>!r.complete).length;
  if(partial)warnings.push({source:'数据覆盖',message:`记录截至 ${stamp(last)}，${partial} 个排班的下班观察时段未完整覆盖，已单独标记`});
  if(first>dayNumber(schedule.month+'-01'))warnings.push({source:'数据覆盖',message:'月初夜班的提前进门记录可能位于上月，当前文件不能确认这部分进门记录'});
  const counts=Object.fromEntries(Object.keys(priority).map(k=>[k,results.filter(r=>r.status===k).length]));
  return {version:1,month:schedule.month,options:{observationHours:hours},coverage:{from:stamp(first),to:stamp(last)},summary:{people:schedule.people.length,matchedPeople:matched.length,attendancePeople:byId.size,eventCount:att.events.length,duplicateCount:att.duplicates,shiftCount:results.length,earlyEvents:results.reduce((n,r)=>n+r.earlyCount,0),counts},warnings,results};
}
module.exports={analyzeAttendance,parseSchedule,parseAttendance,dayNumber,timeNumber,stamp,monthValue};

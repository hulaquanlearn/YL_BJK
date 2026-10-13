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
    const person={id,name,row:i+1,scheduleRow:i+1,totalDays:columns.length,shiftCount:0,restDays:0,leaveDays:0,blankDays:0,shiftCounts:{},days:[]};
    people.push(person);
    for(const {c,date} of columns) {
      const label=clean(r[c]).replaceAll('：',':').replace(/[—–]/g,'-').replace(/\s/g,'');
      if(label==='休息'){person.restDays++;person.days.push({date,type:'rest',label});continue;}
      if(['年休假','请假','病假','事假','产假','调休'].includes(label)){person.leaveDays++;person.days.push({date,type:'leave',label});continue;}
      if(!label){person.blankDays++;person.days.push({date,type:'blank',label:''});warnings.push({source:'排班表',row:i+1,column:c+1,message:`${name} ${date} 排班为空，未作出勤判断`});continue;}
      const m=label.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if(!m||+m[1]>24||+m[3]>24||+m[2]>59||+m[4]>59||(+m[1]===24&&+m[2]!==0)||(+m[3]===24&&+m[4]!==0)){errors.push({source:'排班表',row:i+1,column:c+1,message:`无法识别班次“${label}”`});continue;}
      const base=dayNumber(date),start=base+(+m[1]%24)*HOUR+(+m[2])*60000;
      let end=base+(+m[3])*HOUR+(+m[4])*60000; if(end<=start)end+=DAY;
      if(end-start>=DAY){errors.push({source:'排班表',row:i+1,column:c+1,message:'班次不能达到或超过24小时'});continue;}
      shifts.push({key:`${id}|${date}|${label}`,id,name,date,label,start,end,scheduleRow:i+1,scheduleColumn:c+1});
      person.shiftCount++;person.shiftCounts[label]=(person.shiftCounts[label]||0)+1;person.days.push({date,type:'work',shift:label,label});
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
  const normalHours=Number(options.normalExitHours??2);
  if(![0.5,1,2,4].includes(normalHours))fail('正常打卡时限仅支持30分钟、1小时、2小时或4小时');
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
    const all=byId.get(s.id)||[];
    // Context is deliberately wider than attribution: early arrivals and later visits remain visible.
    const lo=Math.max(s.start-12*HOUR,s.prevEnd??-Infinity);
    const hi=Math.min(s.end+normalHours*HOUR,s.nextStart??Infinity);
    const observationEnd=Math.min(s.end+hours*HOUR,s.nextStart??Infinity);
    const contextEnd=Math.min(s.end+12*HOUR,s.nextStart?s.nextStart+2*HOUR:Infinity);
    const ev=all.filter(e=>e.at>=lo&&e.at<=contextEnd);
    const findings=[],flags=[],sequenceIssues=[];
    const finding=(code,text)=>{if(!flags.includes(code)){flags.push(code);findings.push({code,text});}};
    const issue=(code,e,message)=>{sequenceIssues.push({code,time:stamp(e.at),message});};
    const nextEntry=ev.find(e=>e.type==='in'&&e.at>=s.end&&s.nextStart&&e.at>=s.nextStart-2*HOUR);
    const attributionEnd=nextEntry?Math.min(hi,nextEntry.at):hi;
    const belongs=e=>e.at<=hi&&e.at< (s.nextStart??Infinity)&&(!nextEntry||e.at<nextEntry.at);
    // Repeated same-gate scans may be a failed opening followed by another scan.
    // Anchor to the FIRST scan, preserve raw events and never bridge a shift/window boundary.
    const gateGroups=[];
    const band=e=>e.at<=(s.prevEnd??-Infinity)?'previous':e.at<s.start?'pre':e.at<s.end?'shift':belongs(e)?'normal':'context';
    for(const e of ev.filter(e=>e.type!=='gps')){
      const group=gateGroups.at(-1),previous=group?.events.at(-1);
      if(group&&e.gate&&e.gate===previous.gate&&e.device===previous.device&&e.type===previous.type&&e.at-group.events[0].at<=180000&&band(e)===band(previous))group.events.push(e);
      else gateGroups.push({events:[e]});
    }
    const groupedGates=gateGroups.map(g=>({...g.events.at(-1),sourceRows:[...new Set(g.events.flatMap(e=>e.sourceRows))]}));
    const retryGroups=gateGroups.filter(g=>g.events.length>1).map(g=>({type:g.events[0].type,gate:g.events[0].gate,from:stamp(g.events[0].at),to:stamp(g.events.at(-1).at),scanCount:g.events.length,sourceRows:[...new Set(g.events.flatMap(e=>e.sourceRows))]}));
    const retryScanCount=retryGroups.reduce((n,g)=>n+g.scanCount-1,0);
    const retriesByRow=new Map();
    retryGroups.forEach((g,i)=>g.sourceRows.forEach(row=>retriesByRow.set(row,{retryGroupId:`${s.key}|${i}`,retryGroupSize:g.scanCount})));
    if(retryScanCount)finding('retry_scans',`同一通道同方向3分钟内有 ${retryScanCount} 条重复刷脸，可能为开闸重试；按一次进出核查，保留全部原始记录`);
    // Earlier gate visits are context. Seed the sequence with the last observed pre-shift
    // direction, so an arrival more than two hours early is still visible and usable.
    const preGate=groupedGates.filter(e=>e.at<s.start&&e.at>(s.prevEnd??-Infinity)).at(-1);
    const gates=[...(preGate?[preGate]:[]),...groupedGates.filter(e=>e.at>=s.start&&belongs(e))];
    const outings=groupedGates.filter(e=>e.type==='out'&&e.at>=s.start&&e.at<s.end);
    let previous=null,pending=null,normal=null,returned=null,returnedOutings=0;
    let ambiguous=false;
    for(const e of gates){
      if(previous&&e.at===previous.at&&e.type!==previous.type){
        issue('same_second',e,'同一秒出现进出方向冲突，无法确定顺序');ambiguous=true;
      }else if(previous&&previous.type===e.type){
        issue('repeated_direction',e,`连续${e.type==='in'?'进门':'出门'}，中间缺少相反方向记录`);ambiguous=true;
      }
      if(e.type==='out'){
        pending=e;
        if(e.at>=s.end&&!ambiguous)normal=e;
      }else if(pending){
        if(pending.at>=s.end){
          // Balanced returns within the same two-hour window remain visible. Only the
          // final associated out can supply the departure, not an intermediate outing.
          normal=null;pending=null;returned=e;
          finding('post_end_return','正常下班窗口内出门后又返回，以之后可关联的最后一次出门核查');
        }else{
          if(pending.at>=s.start){returnedOutings++;returned=e;}
          if(e.at>=s.end)finding('return_after_end','下班前出门后，在下班后返回；保留往返明细');
          pending=null;
        }
      }
      previous=e;
    }
    if(nextEntry&&nextEntry.at<=hi&&pending&&pending.at>=s.start&&pending.at<s.end){
      issue('next_shift_return',nextEntry,'下班前出门后出现临近下一班的进门，无法区分本班返回或下一班到岗');
      ambiguous=true;returned=nextEntry;pending=null;
    }
    if(previous?.type==='in'&&previous.at>=s.end&&!pending&&flags.includes('post_end_return')){
      issue('unresolved_return',previous,'下班窗口内出门后又返回，未见之后的关联出门');
      ambiguous=true;
    }
    if(ambiguous)normal=null;
    const early=pending&&pending.at>=s.start&&pending.at<s.end?pending:null;
    // GPS is a separate observation and never changes the inferred gate sequence.
    const gps=ev.filter(e=>e.type==='gps'&&e.at>=s.end&&e.at<=hi&&e.at<(s.nextStart??Infinity));
    const supplementalGps=ev.filter(e=>e.type==='gps'&&e.at>hi&&e.at<=observationEnd);
    const contextOnly=e=>!belongs(e);
    const scopeReason=e=>e.at>hi?'正常下班窗口之外，仅作后续记录':nextEntry&&e.at>=nextEntry.at?'临近下一班的进出，不补算本班离场':'下班出门后的另一次进出';
    const subsequent=ev.filter(contextOnly);
    const later=subsequent.find(e=>e.type==='out');
    const entered=gates.find(e=>e.type==='in'&&e.at<s.end);
    const gpsAfterExit=early?ev.find(e=>e.type==='gps'&&e.at>early.at&&e.at<=hi):null;
    const coverageLeft=first>s.start,coverageRight=last<hi;
    const complete=!coverageLeft&&!coverageRight,matchedPerson=byId.has(s.id);
    if(outings.length)finding('outings',`班内有 ${outings.length} 次出门，${returnedOutings} 次观察到返回；明细不等同于提前下班`);
    if(gps.length)finding('gps',`正常下班时段有 ${gps.length} 条手机GPS，不能确认离场方式或手机操作者`);
    if(supplementalGps.length)finding('supplemental_gps',`补充观察时段有 ${supplementalGps.length} 条GPS，不改变所选正常打卡时限`);
    if(nextEntry)finding('next_shift_entry',`发现临近下一班的进门 ${stamp(nextEntry.at)}，之后的出门不补算本班离场`);
    if(later)finding('subsequent_exit',`后续出门 ${stamp(later.at)} 仅作上下文，不消除本班记录缺口`);
    if(hi<s.end+normalHours*HOUR)finding('next_shift_boundary','下一班开始早于本班正常打卡时限，重叠时段不重复归属');
    if(coverageLeft)finding('coverage_left','文件最早记录晚于本班开始，班次前段数据不足');
    if(coverageRight)finding('coverage_right','文件末尾未覆盖正常下班窗口，不能完成缺记录核查');
    if(sequenceIssues.length)finding('sequence','进出顺序存在缺口或冲突，不能据此确认最终离场');
    if(!normal&&!early&&gps.length)finding('missing_gate_exit','有下班时段GPS，未见可关联的闸机下班出门；可结合人工通道及审批核查');
    if(early)finding('early_exit',`下班前最后一次未见返回的出门为 ${stamp(early.at)}，仅为提前出门线索`);
    let status;
    if(!matchedPerson)status='unmatched';
    else if(sequenceIssues.length)status='sequence_review';
    else if(normal)status='normal';
    else if(early)status='early';
    else if(!complete)status='partial';
    else if(gps.length)status='missing_exit';
    else if(!ev.some(e=>belongs(e)&&e.at>=s.start))status='no_records';
    else status='missing_no_gps';
    const finalExit=sequenceIssues.length?null:normal||early;
    const timeline=[...ev.map(e=>({...serialEvent(e),contextOnly:contextOnly(e),scopeReason:contextOnly(e)?scopeReason(e):null,retryScan:retriesByRow.has(e.sourceRow),...retriesByRow.get(e.sourceRow)})),{time:stamp(s.start),type:'start'},{time:stamp(s.end),type:'end'},{time:stamp(hi),type:'window_end'}].sort((a,b)=>a.time.localeCompare(b.time));
    return {key:s.key,id:s.id,name:s.name,date:s.date,shift:s.label,department:all[0]?.department||'',start:stamp(s.start),end:stamp(s.end),status,complete,matched:matchedPerson,normalExit:normal?stamp(normal.at):null,finalExit:finalExit?stamp(finalExit.at):null,normalExitEnd:stamp(hi),normalExitHours:normalHours,nextStart:s.nextStart?stamp(s.nextStart):null,attributionEnd:stamp(attributionEnd),contextStart:stamp(lo),contextEnd:stamp(contextEnd),flags,findings,sequenceIssues,retryGroups,retryScanCount,outingCount:outings.length,outingEvents:outings.map(serialEvent),returnedOutings,earlyCount:early?1:0,earlyEvents:early?[serialEvent(early)]:[],earlyExit:early?stamp(early.at):null,advanceSeconds:early?(s.end-early.at)/1000:null,returnedAt:returned?stamp(returned.at):null,enteredAt:entered?stamp(entered.at):null,afterExit:normal?stamp(normal.at):null,lateExit:later?stamp(later.at):null,gpsTimes:gps.map(e=>stamp(e.at)),supplementalGpsTimes:supplementalGps.map(e=>stamp(e.at)),gpsAfterExit:gpsAfterExit?stamp(gpsAfterExit.at):null,observationEnd:stamp(observationEnd),extendedEnd:stamp(contextEnd),extendedComplete:last>=contextEnd,subsequentEvents:subsequent.map(serialEvent),timeline,scheduleRow:s.scheduleRow,scheduleColumn:s.scheduleColumn};
  });
  const priority={early:0,missing_exit:1,sequence_review:2,missing_no_gps:3,partial:4,unmatched:5,no_records:6,normal:7};
  results.sort((a,b)=>priority[a.status]-priority[b.status]||(b.advanceSeconds||0)-(a.advanceSeconds||0)||a.date.localeCompare(b.date));
  const partial=results.filter(r=>!r.complete).length;
  if(partial)warnings.push({source:'数据覆盖',message:`文件记录范围 ${stamp(first)} 至 ${stamp(last)}，${partial} 个排班未覆盖班次开始至正常下班窗口，已单独标记；时间范围不能保证各人员或设备记录完整`});
  if(first>dayNumber(schedule.month+'-01'))warnings.push({source:'数据覆盖',message:'月初夜班的提前进门记录可能位于上月，当前文件不能确认这部分进门记录'});
  const counts=Object.fromEntries(Object.keys(priority).map(k=>[k,results.filter(r=>r.status===k).length]));
  return {version:2,ruleRevision:4,month:schedule.month,people:schedule.people,shiftOptions:[...new Set(schedule.shifts.map(s=>s.label))],options:{observationHours:hours,normalExitHours:normalHours,retryWindowSeconds:180},coverage:{from:stamp(first),to:stamp(last)},summary:{people:schedule.people.length,matchedPeople:matched.length,attendancePeople:byId.size,eventCount:att.events.length,duplicateCount:att.duplicates,shiftCount:results.length,earlyEvents:results.reduce((n,r)=>n+r.earlyCount,0),outingEvents:results.reduce((n,r)=>n+r.outingCount,0),counts},warnings,results};
}
module.exports={analyzeAttendance,parseSchedule,parseAttendance,dayNumber,timeNumber,stamp,monthValue};

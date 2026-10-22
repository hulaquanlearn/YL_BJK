const test=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const A=require('../src/attendance-analysis'),W=require('../src/attendance-workbook');
const sh=['工号','姓名','工号','9月17号'];
const ah=['部门','工号','姓名','刷卡日期','刷卡时间','设备号','设备名称','刷卡方式','方向'];
const event=(date,time,type='out',id='G1',name='甲')=>['原粮',id,name,date,time,type==='gps'?'GPS0999999':'ONECARD','员工通道',type==='gps'?'':'刷脸',type==='in'?'进':type==='out'?'出':''];
// Unrelated records delimit a complete imported interval, as a monthly workbook does.
const coverageStart=()=>event('2026-09-15','00:00:00','gps','G2','旁人');
const coverageEnd=()=>event('2026-09-20','20:00:00','gps','G2','旁人');
function analysis(label,events,opts={}){return A.analyzeAttendance([sh,['G1','甲','G1',label]],[ah,coverageStart(),...events,coverageEnd()],{month:'2026-09',...opts});}
test('night shift uses same schedule date and previous-day entry; exit then GPS is observable',()=>{
  const r=analysis('24:00-8:00',[event('2026-09-16','23:24:13','in'),event('2026-09-17','07:38:12'),event('2026-09-17','08:00:05','gps')]).results[0];
  assert.equal(r.flags.includes('missing_gate_exit'),false,'observed early exit is not a missing gate exit');
  assert.equal(r.status,'early');assert.equal(r.advanceSeconds,1308);assert.equal(r.end,'2026-09-17 08:00:00');assert.equal(r.enteredAt,'2026-09-16 23:24:13');assert.equal(r.gpsAfterExit,'2026-09-17 08:00:05');
});
test('middle and 18-02 shifts cross midnight and honor special shift end',()=>{
  const r=analysis('16：00-24：00',[event('2026-09-17','23:39:59'),event('2026-09-18','00:01:05','gps')]).results[0];assert.equal(r.advanceSeconds,1201);assert.equal(r.end,'2026-09-18 00:00:00');assert.equal(r.gpsTimes[0],'2026-09-18 00:01:05');
  assert.equal(analysis('18:00-2:00',[event('2026-09-18','01:50:00')]).results[0].advanceSeconds,600);
  assert.equal(analysis('10:00-18:00',[event('2026-09-17','17:19:49')]).results[0].advanceSeconds,2411);
});
test('normal exit window is fixed at two hours and includes both endpoints for every observation setting',()=>{
  for(const observationHours of [0.5,1,2,4])for(const time of ['16:00:00','17:59:59','18:00:00']){
    const report=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17',time)],{observationHours}),r=report.results[0];
    assert.equal(r.status,'normal',`setting ${observationHours}, exit ${time}`);assert.equal(r.normalExit,`2026-09-17 ${time}`);assert.equal(r.normalExitEnd,'2026-09-17 18:00:00');assert.equal(r.earlyCount,0);assert.equal(r.advanceSeconds,null);assert.equal(report.version,2);assert.equal(report.options.normalExitHours,2);
  }
  for(const observationHours of [0.5,1,2,4]){
    const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00','gps'),event('2026-09-17','18:00:01')],{observationHours}).results[0];
    assert.equal(r.status,'missing_exit');assert.equal(r.normalExit,null);assert.equal(r.lateExit,'2026-09-17 18:00:01');
  }
});
test('an explicit normal-exit setting controls departure classification and includes its exact endpoint',()=>{
  const atEnd={0.5:'16:30:00',1:'17:00:00',2:'18:00:00',4:'20:00:00'}
  for(const normalExitHours of [0.5,1,2,4]){
    const endpoint=atEnd[normalExitHours],inside=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00','gps'),event('2026-09-17',endpoint)],{normalExitHours}),r=inside.results[0]
    assert.equal(r.status,'normal');assert.equal(r.normalExit,`2026-09-17 ${endpoint}`);assert.equal(r.normalExitEnd,`2026-09-17 ${endpoint}`);assert.equal(r.normalExitHours,normalExitHours);assert.equal(inside.options.normalExitHours,normalExitHours)
    const justAfter=endpoint.slice(0,6)+'01',outside=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00','gps'),event('2026-09-17',justAfter)],{normalExitHours}).results[0]
    assert.equal(outside.status,'missing_exit');assert.equal(outside.normalExit,null);assert.equal(outside.lateExit,`2026-09-17 ${justAfter}`)
  }
  const events=[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00','gps'),event('2026-09-17','17:30:00')]
  assert.equal(analysis('8:00-16:00',events,{normalExitHours:1}).results[0].status,'missing_exit');assert.equal(analysis('8:00-16:00',events,{normalExitHours:2}).results[0].status,'normal')
  const later=[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00','gps'),event('2026-09-17','19:00:00')]
  assert.equal(analysis('8:00-16:00',later,{normalExitHours:4}).results[0].status,'normal');assert.equal(analysis('8:00-16:00',later).results[0].status,'missing_exit')
});
test('selected normal-exit windows stop at the next shift and preserve retry boundaries',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号'],['G1','甲','16:00-24:00','1:00-9:00']]
  const report=A.analyzeAttendance(schedules,[ah,coverageStart(),event('2026-09-17','15:00:00','in'),event('2026-09-18','00:20:00'),event('2026-09-18','00:40:00','in'),event('2026-09-18','09:05:00'),coverageEnd()],{month:'2026-09',normalExitHours:4}),previous=report.results.find(row=>row.date==='2026-09-17')
  assert.equal(previous.status,'normal');assert.equal(previous.normalExitEnd,'2026-09-18 01:00:00');assert.equal(previous.normalExit,'2026-09-18 00:20:00');assert.equal(previous.normalExitHours,4)
  const retry=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:59:59'),event('2026-09-17','17:00:04')],{normalExitHours:1}).results[0]
  assert.equal(retry.status,'normal');assert.equal(retry.normalExitEnd,'2026-09-17 17:00:00');assert.equal(retry.normalExit,'2026-09-17 16:59:59');assert.equal(retry.retryScanCount,0);assert.equal(retry.retryGroups.length,0);assert.ok(retry.subsequentEvents.some(e=>e.type==='out'&&e.time==='2026-09-17 17:00:04'))
});
test('unsupported normal-exit hour settings reject instead of silently changing the rule',()=>{
  for(const normalExitHours of [0,3,6,-1,'invalid',''])assert.throws(()=>analysis('8:00-16:00',[event('2026-09-17','16:05:00')],{normalExitHours}),{status:400})
});
test('multiple in-shift outings followed by a final normal exit do not count as early departure',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:40:00','in'),event('2026-09-17','10:00:00'),event('2026-09-17','10:12:00','in'),event('2026-09-17','12:17:13'),event('2026-09-17','13:36:00','in'),event('2026-09-17','16:05:42')]).results[0];
  assert.equal(r.status,'normal');assert.equal(r.normalExit,'2026-09-17 16:05:42');assert.equal(r.finalExit,r.normalExit);assert.equal(r.earlyExit,null);assert.equal(r.advanceSeconds,null);assert.equal(r.earlyCount,0);assert.equal(r.outingCount,2);assert.equal(r.returnedOutings,2);
});
test('only the final unresolved pre-end exit supplies early-departure time and seconds',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:40:00','in'),event('2026-09-17','10:00:00'),event('2026-09-17','10:12:00','in'),event('2026-09-17','15:55:12')]).results[0];
  assert.equal(r.status,'early');assert.equal(r.earlyExit,'2026-09-17 15:55:12');assert.equal(r.advanceSeconds,288);assert.equal(r.earlyCount,1);assert.equal(r.normalExit,null);
  assert.equal(analysis('8:00-16:00',[event('2026-09-17','15:59:59')]).results[0].advanceSeconds,1);
});
test('a pre-end outing returned within the normal window followed by a final exit can normalize',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','15:55:00'),event('2026-09-17','16:05:00','in'),event('2026-09-17','16:10:00')]).results[0];
  assert.equal(r.status,'normal');assert.equal(r.normalExit,'2026-09-17 16:10:00');assert.equal(r.earlyExit,null);assert.equal(r.advanceSeconds,null);assert.ok(r.findings.length>0,'return after scheduled end remains available for review');
});
test('balanced post-end outings use the final exit inside the two-hour normal window',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:10:00'),event('2026-09-17','16:20:00','in'),event('2026-09-17','16:30:00')]).results[0];
  assert.equal(r.status,'normal');assert.equal(r.normalExit,'2026-09-17 16:30:00');assert.equal(r.finalExit,r.normalExit);assert.equal(r.earlyExit,null);assert.equal(r.advanceSeconds,null);assert.equal(r.earlyCount,0);
});
test('return after a normal-window exit without another departure requires sequence review',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:10:00'),event('2026-09-17','16:20:00','in')]).results[0];
  assert.equal(r.status,'sequence_review');assert.equal(r.normalExit,null);assert.equal(r.finalExit,null);assert.ok(r.sequenceIssues.length>0);
});
test('missing exit with GPS remains a lead even when a supplemental late exit exists',()=>{
  let r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:31','gps')]).results[0];assert.equal(r.status,'missing_exit');assert.equal(r.advanceSeconds,null);
  r=analysis('24:00-8:00',[event('2026-09-16','23:30:00','in'),event('2026-09-17','09:30:17','gps'),event('2026-09-17','10:05:45')]).results[0];assert.equal(r.status,'missing_exit');assert.equal(r.normalExit,null);assert.equal(r.lateExit,'2026-09-17 10:05:45');
});
test('incomplete coverage and completely unmatched staff cannot be classified missing exit',()=>{
  const r=A.analyzeAttendance([sh,['G1','甲','G1','8:00-16:00'],['G3','无记录','G3','8:00-16:00']],[ah,event('2026-09-17','16:05:00','gps')],{month:'2026-09'});
  assert.equal(r.results.find(r=>r.id==='G1').status,'partial');assert.equal(r.results.find(r=>r.id==='G3').status,'unmatched');assert.equal(r.summary.counts.missing_exit,0);
});
test('next-shift pre-entry/exit and repeated raw lines are not counted against preceding shift',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号'],['G1','甲','16:00-24:00','1:00-9:00']];
  const r=A.analyzeAttendance(schedules,[ah,coverageStart(),event('2026-09-17','15:00:00','in'),event('2026-09-18','00:00:00'),event('2026-09-18','00:40:00','in'),event('2026-09-18','08:00:00'),event('2026-09-18','08:00:00'),coverageEnd()],{month:'2026-09'});
  const previous=r.results.find(x=>x.date==='2026-09-17'),next=r.results.find(x=>x.date==='2026-09-18');
  assert.equal(previous.status,'normal');assert.equal(previous.normalExit,'2026-09-18 00:00:00');assert.equal(previous.normalExitEnd,'2026-09-18 01:00:00');assert.equal(previous.earlyCount,0);assert.equal(next.advanceSeconds,3600);assert.equal(r.summary.duplicateCount,1);assert.equal(next.earlyEvents[0].sourceRows.length,2);
});
test('an exit belonging to the next shift is not reused as the previous shift normal departure',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号'],['G1','甲','16:00-24:00','1:00-9:00']];
  for(const nextExit of ['01:00:00','01:30:00']){
    const report=A.analyzeAttendance(schedules,[ah,coverageStart(),event('2026-09-17','15:00:00','in'),event('2026-09-18','00:02:00','gps'),event('2026-09-18','00:40:00','in'),event('2026-09-18',nextExit),coverageEnd()],{month:'2026-09'});
    const previous=report.results.find(x=>x.date==='2026-09-17'),next=report.results.find(x=>x.date==='2026-09-18');
    assert.equal(previous.status,'missing_exit');assert.equal(previous.normalExit,null);assert.equal(previous.normalExitEnd,'2026-09-18 01:00:00');assert.equal(next.status,'early');assert.equal(next.earlyExit,`2026-09-18 ${nextExit}`);
  }
});
test('next-shift entry that may be a return cannot confirm the preceding early exit',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号'],['G1','甲','16:00-24:00','1:00-9:00']];
  const report=A.analyzeAttendance(schedules,[ah,coverageStart(),event('2026-09-17','15:30:00','in'),event('2026-09-17','23:55:00'),event('2026-09-18','00:05:00','in'),event('2026-09-18','00:20:00'),event('2026-09-18','00:40:00','in'),event('2026-09-18','09:05:00'),coverageEnd()],{month:'2026-09'});
  const previous=report.results.find(x=>x.date==='2026-09-17');
  assert.equal(previous.status,'sequence_review');assert.equal(previous.earlyExit,null);assert.equal(previous.advanceSeconds,null);assert.equal(previous.normalExit,null);assert.equal(previous.finalExit,null);assert.ok(previous.sequenceIssues.some(i=>i.code==='next_shift_return'));
});
test('real Sep 29 overnight GPS and Sep 30 pre-shift in-out-in cannot fill the missing overnight exit',()=>{
  const schedules=[['工号','姓名','9月29号','9月30号'],['G101951','王哲','16:00-24:00','10:00-18:00']];
  const personEvent=(date,time,type)=>event(date,time,type,'G101951','王哲');
  const events=[event('2026-09-01','00:00:00','gps','G2','旁人'),personEvent('2026-09-29','15:32:13','in'),personEvent('2026-09-30','00:00:07','gps'),personEvent('2026-09-30','00:01:20','gps'),personEvent('2026-09-30','00:02:51','gps'),personEvent('2026-09-30','07:41:14','in'),personEvent('2026-09-30','07:44:37','out'),personEvent('2026-09-30','07:47:27','in'),event('2026-09-30','07:50:44','gps','G2','旁人')];
  for(const observationHours of [0.5,1,2,4]){
    const report=A.analyzeAttendance(schedules,[ah,...events],{month:'2026-09',observationHours}),previous=report.results.find(x=>x.date==='2026-09-29'),next=report.results.find(x=>x.date==='2026-09-30');
    assert.equal(previous.status,'missing_exit');assert.equal(previous.normalExit,null);assert.equal(previous.earlyExit,null);assert.equal(previous.gpsTimes.length,3);assert.equal(previous.normalExitEnd,'2026-09-30 02:00:00');assert.ok(previous.subsequentEvents.some(e=>e.type==='out'&&e.time==='2026-09-30 07:44:37'));
    assert.ok(next.timeline.some(e=>e.type==='in'&&e.time==='2026-09-30 07:41:14'),'next shift preserves unusually early pre-entry context');assert.equal(next.status,'partial');assert.equal(next.complete,false);
  }
});
test('post-end re-entry and conflicting consecutive directions prevent forced normal association',()=>{
  for(const gates of [
    [event('2026-09-17','16:10:00','in'),event('2026-09-17','16:15:00')],
    [event('2026-09-17','15:55:00'),event('2026-09-17','16:15:00')],
    [event('2026-09-17','16:10:00','in'),event('2026-09-17','16:10:00')]
  ]){
    const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),...gates]).results[0];
    assert.equal(r.status,'sequence_review');assert.equal(r.normalExit,null);assert.ok(r.sequenceIssues.length>0);assert.ok(r.findings.length>0);
  }
});
test('same-direction face-scan retries within two minutes form one departure and preserve every original scan and source row',()=>{
  for(const retryTime of ['16:05:39','16:07:34']){
    const report=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:34'),event('2026-09-17',retryTime)]),r=report.results[0];
    assert.equal(report.version,2);assert.equal(report.ruleRevision,7);assert.equal(report.options.retryWindowSeconds,120);assert.equal(r.status,'normal');assert.equal(r.normalExit,`2026-09-17 ${retryTime}`);assert.equal(r.sequenceIssues.length,0);assert.equal(r.retryScanCount,1);assert.equal(r.retryGroups.length,1);
    assert.deepEqual(r.retryGroups[0],{type:'out',gate:'员工通道',from:'2026-09-17 16:05:34',to:`2026-09-17 ${retryTime}`,scanCount:2,sourceRows:[4,5]});
    const rawOut=r.timeline.filter(e=>e.type==='out');assert.equal(rawOut.length,2);assert.deepEqual(rawOut.map(e=>e.sourceRows),[[4],[5]]);assert.ok(rawOut.every(e=>e.retryScan));
  }
  const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','07:30:05','in'),event('2026-09-17','16:05:34')]).results[0];
  assert.equal(r.status,'normal');assert.equal(r.normalExit,'2026-09-17 16:05:34');assert.equal(r.retryGroups.length,1);assert.equal(r.retryGroups[0].type,'in');assert.equal(r.retryGroups[0].scanCount,2);assert.equal(r.retryScanCount,1);assert.equal(r.timeline.filter(e=>e.type==='in').length,2);
});
test('retry grouping allows different or missing gate names and anchors its two minutes to the first scan',()=>{
  const gateEvent=(time,gate)=>{const row=event('2026-09-17',time);row[6]=gate;return row;};
  for(const scans of [
    [gateEvent('16:05:34','通道出口4'),gateEvent('16:05:39','通道出口5')],
    [gateEvent('16:05:34',''),gateEvent('16:05:39','')]
  ]){
    const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),...scans]).results[0];
    assert.equal(r.status,'normal');assert.equal(r.normalExit,'2026-09-17 16:05:39');assert.equal(r.retryScanCount,1);assert.equal(r.retryGroups.length,1);
    assert.equal(r.timeline.filter(e=>e.type==='out').length,2);
  }
  const outside=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00'),event('2026-09-17','16:07:01')]).results[0];
  assert.equal(outside.status,'sequence_review');assert.equal(outside.retryScanCount,0);
  const chained=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:00'),event('2026-09-17','16:06:30'),event('2026-09-17','16:08:00')]).results[0];
  assert.equal(chained.status,'sequence_review');assert.equal(chained.normalExit,null);assert.equal(chained.retryGroups.length,1);assert.equal(chained.retryGroups[0].scanCount,2);assert.equal(chained.retryGroups[0].to,'2026-09-17 16:06:30');assert.equal(chained.retryScanCount,1);assert.equal(chained.timeline.filter(e=>e.type==='out').length,3);
});
test('screenshot exits four seconds apart at different gates are one early exit, not a sequence conflict',()=>{
  const first=event('2026-09-17','07:54:22'),last=event('2026-09-17','07:54:26');
  first[6]='员工通道出口5';last[6]='员工通道出口4';
  const r=analysis('1:00-9:00',[event('2026-09-17','00:25:26','in'),first,last,event('2026-09-17','08:00:46','gps')]).results[0];
  assert.equal(r.status,'early');assert.equal(r.advanceSeconds,3934);assert.equal(r.finalExit,'2026-09-17 07:54:26');
  assert.equal(r.outingCount,1);assert.equal(r.retryScanCount,1);assert.equal(r.sequenceIssues.length,0);
  assert.equal(r.retryGroups[0].gate,'员工通道出口5；员工通道出口4');
  assert.equal(r.timeline.filter(e=>e.type==='out').length,2);assert.equal(r.returnedOutings,0);
});
test('entry retries at different gates also form one entry and keep raw scans',()=>{
  const first=event('2026-09-17','07:54:22','in'),last=event('2026-09-17','07:56:22','in');
  first[6]='员工通道入口5';last[6]='员工通道入口4';
  const r=analysis('8:00-16:00',[first,last,event('2026-09-17','16:05:00')]).results[0];
  assert.equal(r.status,'normal');assert.equal(r.retryScanCount,1);assert.equal(r.sequenceIssues.length,0);
  assert.equal(r.retryGroups[0].type,'in');assert.equal(r.timeline.filter(e=>e.type==='in').length,2);
});
test('opposite gate directions break a retry group while an intervening GPS record does not',()=>{
  const opposite=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:34'),event('2026-09-17','16:05:37','in'),event('2026-09-17','16:05:39')]).results[0];
  assert.equal(opposite.status,'normal');assert.equal(opposite.normalExit,'2026-09-17 16:05:39');assert.equal(opposite.retryScanCount,0);assert.equal(opposite.retryGroups.length,0);
  const gps=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:34'),event('2026-09-17','16:05:37','gps'),event('2026-09-17','16:05:39')]).results[0];
  assert.equal(gps.status,'normal');assert.equal(gps.normalExit,'2026-09-17 16:05:39');assert.equal(gps.retryScanCount,1);assert.equal(gps.retryGroups[0].scanCount,2);assert.deepEqual(gps.retryGroups[0].sourceRows,[4,6]);assert.equal(gps.gpsTimes.length,1);
});
test('retry scans spanning schedule boundaries retain separately attributed evidence',()=>{
  const r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','15:59:59'),event('2026-09-17','16:00:04')]).results[0];
  assert.equal(r.status,'sequence_review');assert.equal(r.normalExit,null);assert.equal(r.retryScanCount,0);assert.equal(r.retryGroups.length,0);assert.equal(r.timeline.filter(e=>e.type==='out').length,2);
  const atStart=analysis('8:00-16:00',[event('2026-09-17','07:59:59','in'),event('2026-09-17','08:00:04','in'),event('2026-09-17','16:05:00')]).results[0];
  assert.equal(atStart.status,'sequence_review');assert.equal(atStart.normalExit,null);assert.equal(atStart.retryScanCount,0);assert.equal(atStart.retryGroups.length,0);
  const atWindowEnd=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','17:59:59'),event('2026-09-17','18:00:04')]).results[0];
  assert.equal(atWindowEnd.status,'normal');assert.equal(atWindowEnd.normalExit,'2026-09-17 17:59:59');assert.equal(atWindowEnd.retryScanCount,0);assert.equal(atWindowEnd.retryGroups.length,0);assert.ok(atWindowEnd.subsequentEvents.some(e=>e.type==='out'&&e.time==='2026-09-17 18:00:04'));
});
test('file start and end limitations are explicit even when an early exit was observed',()=>{
  const report=A.analyzeAttendance([sh,['G1','甲','G1','8:00-16:00']],[ah,event('2026-09-17','15:50:00'),event('2026-09-17','16:02:00','gps'),coverageEnd()],{month:'2026-09'}),r=report.results[0];
  assert.equal(r.status,'early');assert.equal(r.earlyExit,'2026-09-17 15:50:00');assert.equal(r.complete,false);assert.ok(r.findings.length>0,'left-truncated file must not be represented as complete');
  const partial=A.analyzeAttendance([sh,['G1','甲','G1','8:00-16:00']],[ah,coverageStart(),event('2026-09-17','07:30:00','in'),event('2026-09-17','16:30:00','gps')],{month:'2026-09',observationHours:0.5}).results[0];
  assert.equal(partial.status,'partial');assert.equal(partial.complete,false);assert.equal(partial.normalExitEnd,'2026-09-17 18:00:00');
});
test('shift options contain only normalized real shifts in their source order, including special hours',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号','9月19号'],['G1','甲','18：00—2：00','休息','1:00-9:00'],['G2','乙','16:00-24:00','8:00-16:00','1:00-9:00']];
  const records=[ah,event('2026-09-15','00:00:00','gps','G9','旁人'),event('2026-09-17','17:30:00','in'),event('2026-09-17','15:30:00','in','G2','乙'),event('2026-09-20','20:00:00','gps','G9','旁人')];
  const report=A.analyzeAttendance(schedules,records,{month:'2026-09'});
  assert.deepEqual(report.shiftOptions,['18:00-2:00','1:00-9:00','16:00-24:00','8:00-16:00']);assert.equal(new Set(report.shiftOptions).size,report.shiftOptions.length);assert.ok(!report.shiftOptions.includes('休息'));assert.ok(!report.shiftOptions.includes('24:00-8:00'),'unused standard shifts must not be invented');
});
test('schedule person counters reconcile work, rest, leave and blank cells without treating leave as rest',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号','9月19号','9月20号','9月21号','9月22号'],['G1','甲','8:00-16:00','休息','年休假','','8:00-16:00','请假']];
  const records=[ah,coverageStart(),event('2026-09-17','07:30:00','in'),event('2026-09-23','20:00:00','gps','G2','旁人')];
  const report=A.analyzeAttendance(schedules,records,{month:'2026-09'}),person=report.people.find(p=>p.id==='G1');
  assert.equal(person.totalDays,6);assert.equal(person.shiftCount,2);assert.equal(person.restDays,1);assert.equal(person.leaveDays,2);assert.equal(person.blankDays,1);assert.equal(person.shiftCount+person.restDays+person.leaveDays+person.blankDays,person.totalDays);assert.equal(report.results.filter(r=>r.id===person.id).length,person.shiftCount);
  assert.deepEqual(person.shiftCounts,{'8:00-16:00':2});assert.deepEqual(person.days.map(d=>d.type),['work','rest','leave','blank','work','leave']);assert.deepEqual(person.days.map(d=>d.date),['2026-09-17','2026-09-18','2026-09-19','2026-09-20','2026-09-21','2026-09-22']);assert.equal(person.days[2].label,'年休假');assert.equal(person.days[3].label,'');assert.equal(person.days[5].label,'请假');assert.deepEqual(person.days.filter(d=>d.type==='work').map(d=>d.shift),['8:00-16:00','8:00-16:00']);
});
test('mismatched IDs, invalid dates/times/shifts and wrong months produce specific errors',()=>{
  for(const rows of [[sh,['G1','甲','G2','8:00-16:00']],[sh,['G1','甲','G1','24:30-8:00']],[sh,['G1','甲','G1','8:00-16:00'],['G1','乙','G1','8:00-16:00']]])assert.throws(()=>A.parseSchedule(rows,'2026-09'),{status:400});
  assert.throws(()=>A.parseAttendance([ah,event('2026-09-31','07:00:00')]),{status:400});assert.throws(()=>A.parseAttendance([ah,event('2026-09-17','25:00:00')]),{status:400});assert.throws(()=>A.parseSchedule([sh,['G1','甲','G1','8:00-16:00']],'2026-10'),{status:400});
  assert.throws(()=>analysis('8:00-16:00',[event('2026-09-17','07:00:00','in','G1','乙')]),{status:400});
});
test('xlsx parser checks real file contents; corrupt, renamed, empty and missing-field files reject',async()=>{
  for(const b of [Buffer.from('not xlsx'),Buffer.alloc(22)])await assert.rejects(W.readWorkbook({originalname:'fake.xlsx',buffer:b},'排班表'),{status:400});
  const wb=new ExcelJS.Workbook(),s=wb.addWorksheet('排班');s.addRows([sh,['G1','甲','G1','8:00-16:00']]);const file={originalname:'排班.xlsx',buffer:Buffer.from(await wb.xlsx.writeBuffer())};const parsed=await W.readWorkbook(file,'排班表');assert.equal(parsed.rows[1][0],'G1');
  await assert.rejects(W.readWorkbook({...file,originalname:'file.xls'},'排班表'),{status:400});
  assert.throws(()=>A.parseAttendance([['姓名','时间'],['甲','08:00']]),{status:400});
});

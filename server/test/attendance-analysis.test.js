const test=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const A=require('../src/attendance-analysis'),W=require('../src/attendance-workbook');
const sh=['工号','姓名','工号','9月17号'];
const ah=['部门','工号','姓名','刷卡日期','刷卡时间','设备号','设备名称','刷卡方式','方向'];
const event=(date,time,type='out',id='G1',name='甲')=>['原粮',id,name,date,time,type==='gps'?'GPS0999999':'ONECARD','员工通道',type==='gps'?'':'刷脸',type==='in'?'进':type==='out'?'出':''];
function analysis(label,events,opts={}){return A.analyzeAttendance([sh,['G1','甲','G1',label]],[ah,...events,event('2026-09-20','20:00:00','gps','G2','旁人')],{month:'2026-09',...opts});}
test('night shift uses same schedule date and previous-day entry; exit then GPS is observable',()=>{
  const r=analysis('24:00-8:00',[event('2026-09-16','23:24:13','in'),event('2026-09-17','07:38:12'),event('2026-09-17','08:00:05','gps')]).results[0];
  assert.equal(r.status,'early');assert.equal(r.advanceSeconds,1308);assert.equal(r.end,'2026-09-17 08:00:00');assert.equal(r.enteredAt,'2026-09-16 23:24:13');assert.equal(r.gpsAfterExit,'2026-09-17 08:00:05');
});
test('middle and 18-02 shifts cross midnight and honor special shift end',()=>{
  const r=analysis('16：00-24：00',[event('2026-09-17','23:39:59'),event('2026-09-18','00:01:05','gps')]).results[0];assert.equal(r.advanceSeconds,1201);assert.equal(r.end,'2026-09-18 00:00:00');assert.equal(r.gpsTimes[0],'2026-09-18 00:01:05');
  assert.equal(analysis('18:00-2:00',[event('2026-09-18','01:50:00')]).results[0].advanceSeconds,600);
  assert.equal(analysis('10:00-18:00',[event('2026-09-17','17:19:49')]).results[0].advanceSeconds,2411);
});
test('on-time exit is not early; all positive seconds preserved; return followed by second exit evaluated correctly',()=>{
  assert.equal(analysis('8:00-16:00',[event('2026-09-17','16:00:00')]).results[0].earlyCount,0);
  assert.equal(analysis('8:00-16:00',[event('2026-09-17','15:59:59')]).results[0].advanceSeconds,1);
  const events=[event('2026-09-17','12:17:13'),event('2026-09-17','13:36:00','in'),event('2026-09-17','16:05:42')];assert.equal(analysis('8:00-16:00',events).results[0].status,'returned');
  events.push(event('2026-09-17','15:55:00'));const r=analysis('8:00-16:00',events).results[0];assert.equal(r.status,'early');assert.equal(r.earlyCount,2);assert.equal(r.advanceSeconds,300);
});
test('missing exit with GPS is a lead; later recorded exit prevents treating it as no exit',()=>{
  let r=analysis('8:00-16:00',[event('2026-09-17','07:30:00','in'),event('2026-09-17','16:05:31','gps')]).results[0];assert.equal(r.status,'missing_exit');assert.equal(r.advanceSeconds,null);
  r=analysis('24:00-8:00',[event('2026-09-17','09:30:17','gps'),event('2026-09-17','10:05:45')]).results[0];assert.equal(r.status,'late_exit');assert.equal(r.lateExit,'2026-09-17 10:05:45');
});
test('incomplete coverage and completely unmatched staff cannot be classified missing exit',()=>{
  const r=A.analyzeAttendance([sh,['G1','甲','G1','8:00-16:00'],['G3','无记录','G3','8:00-16:00']],[ah,event('2026-09-17','16:05:00','gps')],{month:'2026-09'});
  assert.equal(r.results.find(r=>r.id==='G1').status,'partial');assert.equal(r.results.find(r=>r.id==='G3').status,'unmatched');assert.equal(r.summary.counts.missing_exit,0);
});
test('next-shift pre-entry/exit and repeated raw lines are not counted against preceding shift',()=>{
  const schedules=[['工号','姓名','9月17号','9月18号'],['G1','甲','16:00-24:00','1:00-9:00']];
  const r=A.analyzeAttendance(schedules,[ah,event('2026-09-17','15:00:00','in'),event('2026-09-18','00:00:00'),event('2026-09-18','00:40:00','in'),event('2026-09-18','08:00:00'),event('2026-09-18','08:00:00'),event('2026-09-20','20:00:00','gps','G2','旁人')],{month:'2026-09'});
  assert.equal(r.results.find(x=>x.date==='2026-09-17').earlyCount,0);assert.equal(r.results.find(x=>x.date==='2026-09-18').advanceSeconds,3600);assert.equal(r.summary.duplicateCount,1);assert.equal(r.results.find(x=>x.date==='2026-09-18').earlyEvents[0].sourceRows.length,2);
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

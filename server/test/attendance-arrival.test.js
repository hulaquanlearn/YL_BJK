const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeAttendance}=require('../src/attendance-analysis');
const headers=['工号','姓名','刷卡日期','刷卡时间','设备号','设备名称','方向'];
const event=(time,type='gps',date='2026-09-17',id='G1')=>[id,id==='G1'?'甲':'旁人',date,time,type==='gps'?'GPS0999999':'ONECARD','员工通道',type==='in'?'进':type==='out'?'出':''];
function report(events,schedule=[['工号','姓名','9月17号'],['G1','甲','8:00-16:00']]) {
  return analyzeAttendance(schedule,[headers,event('00:00:00','gps','2026-09-15','G2'),...events,event('20:00:00','gps','2026-09-20','G2')],{month:'2026-09'});
}
const row=events=>report(events).results[0];

test('phone before shift followed by nearby late entry uses entry, not the earlier phone punch',()=>{
  const r=row([event('07:59:00'),event('08:03:00','in'),event('16:05:00','out')]);
  assert.equal(r.arrival.paired,true);assert.equal(r.arrival.basis,'paired_gate');assert.equal(r.arrival.lateSeconds,180);
  assert.equal(r.status,'normal');assert.equal(r.flags.includes('late_arrival'),true);assert.equal(r.arrival.gapSeconds,240);
});
test('half-hour pairing includes the boundary but excludes one second beyond it',()=>{
  const inside=row([event('07:45:00'),event('08:15:00','in')]);
  assert.equal(inside.arrival.paired,true);assert.equal(inside.arrival.lateSeconds,900);
  const outside=row([event('07:44:59'),event('08:15:00','in')]);
  assert.equal(outside.arrival.paired,false);assert.equal(outside.arrival.basis,'gps');assert.equal(outside.arrival.lateSeconds,0);
});
test('phone after entry also pairs, and does not turn an on-time entry into lateness',()=>{
  const r=row([event('07:59:00','in'),event('08:20:00')]);
  assert.equal(r.arrival.paired,true);assert.equal(r.arrival.status,'on_time');assert.equal(r.arrival.time,'2026-09-17 07:59:00');
});
test('screenshot retains late phone punch separately from much later entry and GPS never creates a return',()=>{
  const r=row([event('08:33:31'),event('11:05:56','in'),event('11:27:18','out'),event('17:30:29'),event('17:36:18')]);
  assert.equal(r.arrival.paired,false);assert.equal(r.arrival.gapSeconds,9145);assert.equal(r.arrival.lateSeconds,2011);
  assert.equal(r.arrival.basis,'gps');assert.equal(r.arrival.time,'2026-09-17 08:33:31');
  assert.equal(r.status,'early');assert.equal(r.returnedOutings,0);assert.equal(r.advanceSeconds,16362);
  assert.match(r.findings.find(f=>f.code==='early_exit').text,/不是实际离岗时长/);
});
test('an observed outing prevents later GPS and return from becoming an arrival pair',()=>{
  const r=row([event('07:59:00'),event('08:01:00','out'),event('08:03:00','in'),event('16:05:00','out')]);
  assert.equal(r.arrival.paired,false);assert.equal(r.arrival.gateTime,null);assert.equal(r.arrival.status,'on_time');
  const unknown=row([event('08:01:00','out'),event('08:03:00','in'),event('08:04:00')]);
  assert.equal(unknown.arrival.status,'unknown');assert.equal(unknown.arrival.lateSeconds,null);
});
test('GPS-only manual entry retains phone lateness and does not invent gate direction',()=>{
  const r=row([event('08:33:31'),event('17:30:29')]);
  assert.equal(r.arrival.basis,'gps');assert.equal(r.arrival.lateSeconds,2011);assert.equal(r.enteredAt,null);
  assert.equal(r.arrival.gateTime,null);assert.equal(r.status,'missing_exit');
});
test('night arrival pairing crosses midnight and skips prior-shift records',()=>{
  const night=report([event('23:50:00','gps','2026-09-16'),event('00:10:00','in')],[['工号','姓名','9月17号'],['G1','甲','24:00-8:00']]).results[0];
  assert.equal(night.arrival.paired,true);assert.equal(night.arrival.lateSeconds,600);
  const shifts=[['工号','姓名','9月16号','9月17号'],['G1','甲','16:00-24:00','1:00-9:00']];
  const next=report([event('23:55:00','gps','2026-09-16'),event('01:05:00','in')],shifts).results.find(r=>r.date==='2026-09-17');
  assert.equal(next.arrival.mobileTime,null);assert.equal(next.arrival.basis,'gate');assert.equal(next.arrival.lateSeconds,300);
});
test('late arrival is independent of early exit and revision exposes the pairing window',()=>{
  const r=report([event('08:05:00'),event('08:10:00','in'),event('15:50:00','out')]);
  assert.equal(r.results[0].arrival.lateSeconds,600);assert.equal(r.results[0].status,'early');
  assert.equal(r.ruleRevision,7);assert.equal(r.options.arrivalPairWindowSeconds,1800);assert.equal(r.summary.lateArrivals,1);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {buildWeeklyStatistics:build}=require('../src/work-statistics');
const members=[{user_id:1,name:'甲',floor:1},{user_id:2,name:'乙',floor:2}];
const record=(id,user,date,mode,duty,status='正常',submitted='submitted')=>({id,user_id:user,record_date:date,kind:'duties',status:submitted,payload:{mode,checks:[{dutyId:duty,status}]}});
test('daily outcomes distinguish unreported, draft, explicit unfinished and abnormal',()=>{
  const data=build(members,[record(1,1,'2026-09-28','daily','production_progress','异常'),record(2,1,'2026-09-28','daily','directive_tasks','未完成'),record(3,1,'2026-09-28','daily','team_feedback','无异常','draft')],'2026-09-28','2026-09-28');
  const day=data.people[0].days[0];assert.equal(day.submitted,2);assert.equal(day.abnormal,1);assert.equal(day.unfinished,1);assert.equal(day.draft,1);assert.equal(day.missing,9);
  assert.equal(data.people[1].days[0].submitted,0);assert.equal(data.people[1].days[0].missing,12);
  assert.equal(data.people[0].days[1].missing,0);assert.ok(data.people[0].days[1].items.every(i=>i.state==='future'));
});
test('weekly and optional duties are not multiplied into seven daily obligations',()=>{
  const data=build(members,[record(1,1,'2026-09-28','weekly','energy_usage','无异常'),record(2,1,'2026-09-29','continuous','contractor_safety'),record(3,1,'2026-09-30','continuous','contractor_safety')],'2026-09-28','2026-10-04');
  const p=data.people[0];assert.equal(p.totals.submitted,0);assert.equal(p.weekly.find(i=>i.dutyId==='energy_usage').submittedCount,1);
  assert.equal(p.continuous.find(i=>i.dutyId==='contractor_safety').submittedCount,2);assert.equal(p.continuous.find(i=>i.dutyId==='safety_activity').state,'optional');
});
test('duplicate legacy records do not inflate daily counts, other weeks and people excluded',()=>{
  const rows=[record(1,1,'2026-09-28','daily','production_progress'),record(2,1,'2026-09-28','daily','production_progress','异常'),record(3,999,'2026-09-28','daily','team_feedback'),record(4,1,'2026-09-21','daily','directive_tasks')];
  const data=build(members,rows,'2026-09-28','2026-10-04');assert.equal(data.people[0].totals.submitted,1);assert.equal(data.people[0].days[0].items[0].recordId,2);assert.equal(data.people.length,2);
});
test('reporting weeks contain Monday through Saturday across a year boundary',()=>{
  const data=build(members,[],'2026-12-28','2027-01-01');assert.equal(data.weekEnd,'2027-01-02');assert.equal(data.dates.length,6);assert.equal(data.people[0].totals.missing,60);
});

test('legacy abnormal labels and snapshots still count as abnormal after catalog choices change',()=>{
 const legacy=record(1,1,'2026-09-28','daily','team_feedback','有异常');
 const snapshot=record(2,1,'2026-09-28','daily','process_adjustment','异常');
 snapshot.payload.checks[0].dutySnapshot={abnormalOptions:['异常']};
 const data=build(members,[legacy,snapshot],'2026-09-28','2026-09-28');
 assert.equal(data.people[0].days[0].abnormal,2);
 assert.equal(data.people[0].days[0].items.find(i=>i.dutyId==='team_feedback').label,'有异常');
});

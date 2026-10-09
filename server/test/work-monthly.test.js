const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/work-monthly'),W=require('../src/work-assessment'),F=require('../src/work-flow');
test('four monthly periods cover all dates, leap years and remaining days',()=>{
 for(const month of ['2026-09','2026-02','2028-02','2026-12','2027-01']){
  const p=M.periods(month);assert.equal(p.length,4);assert.equal(p[0].start,month+'-01');
  for(let i=1;i<4;i++)assert.equal(p[i].start,F.addDays(p[i-1].end,1));
 }
 assert.deepEqual(M.periods('2026-09').map(p=>[p.start,p.end]),[['2026-09-01','2026-09-06'],['2026-09-07','2026-09-13'],['2026-09-14','2026-09-20'],['2026-09-21','2026-09-30']]);
 assert.throws(()=>M.periods('2026-13'));
});
test('remaining weeks merge into period four; unpublished scores remain pending',()=>{
 const weeks=['2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28'];
 const reports=weeks.map(week_start=>({week_start,status:'published',result_json:{items:[{max:25,score:20}]}}));
 const schedules=weeks.map(week_start=>({week_start,rest_date:F.addDays(week_start,2)}));
 const result=M.summarize('2026-09',reports,[],schedules);assert.equal(result.total,80);assert.equal(result.periods[3].weeks.length,2);
 reports[4].status='draft';assert.equal(M.summarize('2026-09',reports,[],schedules).total,null);
});
test('25 point default allocation and reviewed closures reject invalid and resting evidence',()=>{
 const defaults=W.defaultRules();assert.equal(defaults.reduce((n,r)=>n+r.max,0),25);assert.equal(W.rules(defaults,{requireDuty:true}).length,17);
 assert.deepEqual(defaults.slice(0,3).map(r=>r.max),[2,2,1]);
 const rule={id:'1',dutyId:'team_feedback',max:1,kind:'manual',bonusPerClosure:0.5};
 const records=[{id:1,status:'submitted',record_date:'2026-09-21',payload:{mode:'daily',checks:[{dutyId:'team_feedback',action:'复核闭环'}]}}];
 const manual={'1':{score:0,reason:'已核查',closureRecordIds:[1]}};
 assert.equal(W.evaluate([rule],records,manual).total,0.5);
 assert.throws(()=>W.evaluate([rule],records,manual,F.schedule('2026-09-21','2026-09-21')),/有效闭环/);
 assert.throws(()=>W.evaluate([rule],records,{'1':{...manual['1'],closureRecordIds:[99]}}),/有效闭环/);
});
test('fixed document links persist and reject executable URLs',()=>{
 const duty={...W.duties.get('standard_operation'),documentUrl:'https://www.kdocs.cn/l/example',documentTitle:'工作文档'};
 assert.equal(F.validateCatalog([duty])[0].documentUrl,duty.documentUrl);
 assert.throws(()=>F.validateCatalog([{...duty,documentUrl:'javascript:alert(1)'}]),/有效/);
});

const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/raw-duties'),C=require('../src/raw-duty-cadence');
const {createFixture}=require('./fixtures/raw-duty-preview.cjs');
test('仅提供已完成和异常；异常原因必填，处理进展与历史状态保留',async t=>{
 const f=await createFixture({seed:false}),server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api/raw-duties/context`,{headers:{Authorization:'Bearer raw-preview-worker'}});
 assert.deepEqual((await res.json()).data.results,['已完成','异常']);
 const tmpl={entries:[{id:'x'}]};
 for(const submit of [false,true]){
  assert.throws(()=>D.checks([{dutyId:'x',result:'异常',action:'正在处理'}],tmpl,[],submit),/异常原因/);
  const c=D.checks([{dutyId:'x',result:'异常',note:'防护用品破损',action:'已更换并复查'}],tmpl,[],submit)[0];
  assert.equal(c.note,'防护用品破损');assert.equal(c.action,'已更换并复查');
  assert.equal(D.checks([{dutyId:'x',result:'已完成'}],tmpl,[],submit)[0].result,'已完成');
 }
 assert.equal(D.checks([{dutyId:'x',result:'进行中',note:'旧记录'}],tmpl,[])[0].result,'进行中');
});
test('每日、每周、每月和持续事项采用相同异常校验；各端统计和日历口径一致',async()=>{
 const today=D.today(),start=D.period(today).start;
 const entries=['每班','每周','每月','持续开展'].map((frequency,i)=>({id:String(i),frequency,title:'工作'+i}));
 const calendar=Object.fromEntries(Array.from({length:7},(_,i)=>[new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10),'rest']));calendar[today]='work';
 const payload=result=>entries.map(e=>{const c={result,note:result==='异常'?'发现异常':'',action:result==='异常'?'正在排查':'',recordDate:today};return e.frequency==='每班'?{dutyId:e.id,dailyRecords:[{...c,date:today}]}:e.frequency==='每月'?{dutyId:e.id,monthlyRecords:[{...c,month:today.slice(0,7)}]}:{dutyId:e.id,...c}});
 const progress=[require('../src/raw-duty-progress'),await import('../../spare-parts-web-release/src/utils/raw-duty-progress.mjs'),require('../../miniprogram/packages/work/services/raw-duty-progress')];
 const helpers=[require('../src/raw-duty-cadence-summary'),await import('../../spare-parts-web-release/src/utils/raw-duty-cadence-summary.mjs'),require('../../miniprogram/packages/work/services/raw-duty-cadence-summary')];
 const tables=[require('../src/raw-duty-week-table'),await import('../../spare-parts-web-release/src/utils/raw-duty-week-table.mjs'),require('../../miniprogram/packages/work/services/raw-duty-week-table')];
 for(const result of ['已完成','异常']){
  const valid=C.validate(payload(result),{entries},[],calendar,start,true);
  for(const h of helpers){const stats=h.cadenceSummary(entries,valid.checks,valid.cadence,start,today);assert.equal(stats.itemOverview[result==='异常'?'abnormal':'done'],4);assert.equal(stats.itemOverview.incomplete,0);assert.equal(stats.progress.ready,4)}
  if(result==='异常'&&start<today){
   const mixed={...valid.cadence,calendar:{...calendar,[start]:'work'}};
   for(const h of helpers){const stats=h.cadenceSummary(entries,valid.checks,mixed,start,today);assert.equal(stats.itemOverview.abnormal,4);assert.equal(stats.itemOverview.incomplete,1);assert.equal(stats.itemOverview.done,0)}
  }
  for(const h of progress){assert.equal(h.dutyState({result:'已完成'}),'done');assert.equal(h.dutyState({result:'异常'}),'evidence');assert.equal(h.dutyState({result:'异常',note:'原因'}),'abnormal');assert.equal(h.dutyMatches({result:'异常',note:'原因'},'abnormal'),true)}
  for(const h of tables){const row=h.weekTable(entries,valid.checks,calendar,start,today).rows[0];const cell=row.cells.find(c=>c.date===today);assert.equal(cell.text,result);assert.equal(cell.action,result==='异常'?'正在排查':'');assert.equal(row.totalMissing,0)}
 }
 for(const e of entries){const input=payload('异常');const c=input.find(c=>c.dutyId===e.id);(c.dailyRecords?.[0]||c.monthlyRecords?.[0]||c).note=' ';assert.throws(()=>C.validate(input,{entries},[],calendar,start,false),/异常原因/)}
});

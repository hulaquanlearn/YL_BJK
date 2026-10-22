const test=require('node:test'),assert=require('node:assert/strict'),ExcelJS=require('exceljs');
const {createFixture}=require('./fixtures/attendance-preview.cjs');
test('HTTP import/roles/notes/download/reanalysis/dedup/cleanup and rollback contract',async t=>{
  const f=createFixture(),server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const root=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(method,url,body,role='raw_grain')=>{const multipart=body instanceof FormData;const r=await fetch(root+url,{method,headers:{Authorization:'Bearer attendance-preview-'+role,...body&&!multipart?{'Content-Type':'application/json'}:{}},body:body?multipart?body:JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}};
  const make=async rows=>{const w=new ExcelJS.Workbook();w.addWorksheet('数据').addRows(rows);return Buffer.from(await w.xlsx.writeBuffer())};
  const schedule=await make([['工号','姓名','9月17号'],['G1','甲','8:00-16:00']]),attendance=await make([['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],['G1','甲','2026-09-17','15:40:00','ONECARD','出'],['G1','甲','2026-09-17','16:01:00','GPS0999999',''],['G2','旁人','2026-09-20','20:00:00','GPS0999999','']]);
  const form=(hours=2,ack=false)=>{const d=new FormData();d.append('month','2026-09');d.append('observationHours',hours);d.append('schedule',new Blob([schedule]),'人员排班表.xlsx');d.append('attendance',new Blob([attendance]),'原始刷卡记录.xlsx');if(ack)d.append('acknowledgeWarnings','true');return d};
  for(const role of ['qu_making','brewing']){const calls=f.inspect().calls;assert.equal((await request('GET','/attendance/reports',undefined,role)).status,403);assert.equal((await request('POST','/attendance/preview',form(),role)).status,403);assert.equal(f.inspect().calls,calls)}
  assert.equal((await request('GET','/attendance/reports',undefined,'admin')).status,200);assert.equal((await request('GET','/attendance/reports',undefined,'viewer')).status,200);assert.equal((await request('POST','/attendance/preview',form(),'viewer')).status,403);
  const invalid=new FormData();invalid.append('schedule',new Blob(['bad']),'fake.xlsx');assert.equal((await request('POST','/attendance/preview',invalid)).status,400);assert.equal(f.inspect().reports.length,0);
  assert.equal((await request('POST','/attendance/reports',form())).status,409);assert.equal(f.inspect().sources.length,0);
  const imported=await request('POST','/attendance/reports',form(2,true));assert.equal(imported.status,200);const r=imported.body.data;assert.equal(r.analysis.sources.schedule.name,'人员排班表.xlsx');assert.equal(r.analysis.results[0].advanceSeconds,1200);
  assert.equal((await request('POST','/attendance/reports',form(2,true))).body.data.id,r.id);assert.equal(f.inspect().sources.length,2);
  assert.equal((await request('POST','/attendance/reports',form(4,true))).body.data.analysis.options.observationHours,4);assert.equal(f.inspect().reports.length,1);assert.equal(f.inspect().sources.length,2);
  const current=(await request('GET',`/attendance/reports/${r.id}`)).body.data;assert.equal((await request('GET',`/attendance/reports/${r.id}`,undefined,'viewer')).status,200);for(const [method,url]of [['POST',`/attendance/reports/${r.id}/reanalyze`],['PATCH',`/attendance/reports/${r.id}/notes`],['POST','/attendance/reports']]){const before=f.inspect().calls;assert.equal((await request(method,url,{},'viewer')).status,403);assert.equal(f.inspect().calls,before)}
  const note=await request('PATCH',`/attendance/reports/${r.id}/notes`,{revision:current.revision,entryKey:r.analysis.results[0].key,note:'待核对外出审批'});assert.equal(note.status,200);
  assert.equal((await request('PATCH',`/attendance/reports/${r.id}/notes`,{revision:current.revision,entryKey:r.analysis.results[0].key,note:'覆盖旧备注'})).status,409);assert.equal(f.inspect().notes[0].note,'待核对外出审批');
  const download=await fetch(root+`/attendance/reports/${r.id}/sources/schedule/download`,{headers:{Authorization:'Bearer attendance-preview-raw_grain'}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),schedule);
  // Reimport of identical originals upgrades the saved rule version and retains human notes.
  const legacy=f.inspect().reports[0],oldAnalysis=JSON.parse(legacy.analysis_json);oldAnalysis.version=1;legacy.analysis_json=JSON.stringify(oldAnalysis);
  const upgraded=await request('POST','/attendance/reports',form(2,true));
  assert.equal(upgraded.body.data.id,r.id);assert.equal(upgraded.body.data.analysis.version,2);
  assert.equal(upgraded.body.data.notes[r.analysis.results[0].key].note,'待核对外出审批');
  assert.equal(f.inspect().sources.length,2);assert.ok(upgraded.body.data.revision>note.body.data.revision);
  const previousRevision=JSON.parse(legacy.analysis_json);previousRevision.ruleRevision=1;legacy.analysis_json=JSON.stringify(previousRevision);
  const retryUpgraded=await request('POST','/attendance/reports',form(2,true));
  assert.equal(retryUpgraded.body.data.analysis.ruleRevision,7);assert.ok(retryUpgraded.body.data.revision>upgraded.body.data.revision);
  assert.equal(retryUpgraded.body.data.notes[r.analysis.results[0].key].note,'待核对外出审批');
  assert.equal((await request('POST',`/attendance/reports/${r.id}/reanalyze`,{revision:retryUpgraded.body.data.revision,observationHours:1})).status,200);
  assert.equal((await request('GET','/work-storage?cutoff=2025-01-01')).status,403);assert.equal((await request('GET','/work-storage?cutoff=2099-01-01',undefined,'admin')).status,400);
  const state=(await request('GET',`/attendance/reports/${r.id}`)).body.data;
  assert.equal((await request('DELETE',`/work-storage/attendance/${r.id}`,{revision:state.revision,cutoff:'2026-01-01'},'admin')).status,409);assert.equal(f.inspect().sources.length,2);
  // Age this synthetic fixture only; production data is never touched.
  f.inspect().reports[0].updated_at='2024-01-01 00:00:00';
  assert.equal((await request('PATCH',`/work-storage/attendance/${r.id}/retention`,{revision:state.revision,retentionUntil:'2024-01-01'},'admin')).status,200);
  const list=(await request('GET','/work-storage?cutoff=2025-01-01',undefined,'admin')).body.data;const item=list.items.find(x=>x.kind==='attendance');assert.equal(item.eligible,true);
  assert.equal((await request('DELETE',`/work-storage/attendance/${r.id}`,{revision:item.revision,cutoff:'2025-01-01'},'admin')).status,200);assert.equal(f.inspect().sources.length,0);assert.equal(f.inspect().notes.length,0);assert.equal(f.inspect().audit.length,1);assert.equal((await request('GET',`/attendance/reports/${r.id}`)).status,404);
});
test('HTTP normal-exit setting propagates through import and reanalysis and remains applied when omitted',async t=>{
  const f=createFixture(),server=f.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());const root=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(url,body,method='POST')=>{const multipart=body instanceof FormData,response=await fetch(root+url,{method,headers:{Authorization:'Bearer attendance-preview-raw_grain',...multipart?{}:{'Content-Type':'application/json'}},body:multipart?body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
  const workbook=async rows=>{const book=new ExcelJS.Workbook();book.addWorksheet('数据').addRows(rows);return Buffer.from(await book.xlsx.writeBuffer())};
  const schedule=await workbook([['工号','姓名','9月17号'],['G1','甲','8:00-16:00']]),attendance=await workbook([['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],['G2','旁人','2026-09-15','00:00:00','GPS0999999',''],['G1','甲','2026-09-17','07:30:00','ONECARD','进'],['G1','甲','2026-09-17','16:05:00','GPS0999999',''],['G1','甲','2026-09-17','19:00:00','ONECARD','出'],['G2','旁人','2026-09-20','20:00:00','GPS0999999','']]);
  const form=new FormData();form.append('month','2026-09');form.append('normalExitHours','1');form.append('observationHours','4');form.append('acknowledgeWarnings','true');form.append('schedule',new Blob([schedule]),'排班表.xlsx');form.append('attendance',new Blob([attendance]),'考勤表.xlsx');
  const imported=await request('/attendance/reports',form);assert.equal(imported.status,200);const report=imported.body.data,key=report.analysis.results[0].key;
  assert.equal(report.analysis.options.normalExitHours,1);assert.equal(report.analysis.options.observationHours,4);assert.equal(report.analysis.results[0].status,'missing_exit');assert.equal(report.analysis.results[0].normalExitEnd,'2026-09-17 17:00:00');
  const note=await request(`/attendance/reports/${report.id}/notes`,{revision:report.revision,entryKey:key,note:'已核查人工通道'},'PATCH');assert.equal(note.status,200);
  const changed=await request(`/attendance/reports/${report.id}/reanalyze`,{revision:note.body.data.revision,normalExitHours:4,observationHours:0.5});assert.equal(changed.status,200);const applied=changed.body.data;
  assert.equal(applied.analysis.options.normalExitHours,4);assert.equal(applied.analysis.options.observationHours,0.5);assert.equal(applied.analysis.results[0].status,'normal');assert.equal(applied.analysis.results[0].normalExit,'2026-09-17 19:00:00');assert.equal(applied.analysis.results[0].normalExitEnd,'2026-09-17 20:00:00');assert.equal(applied.notes[key].note,'已核查人工通道');
  const preserved=await request(`/attendance/reports/${report.id}/reanalyze`,{revision:applied.revision,observationHours:1});assert.equal(preserved.status,200);const retained=preserved.body.data;
  assert.equal(retained.analysis.options.normalExitHours,4);assert.equal(retained.analysis.options.observationHours,1);assert.equal(retained.analysis.results[0].status,'normal');assert.equal(retained.analysis.results[0].normalExit,'2026-09-17 19:00:00');assert.equal(retained.analysis.month,'2026-09');assert.equal(retained.notes[key].note,'已核查人工通道');assert.equal(f.inspect().reports.length,1);assert.equal(f.inspect().sources.length,2);
});

test('real application rejects anonymous attendance sources, analysis, notes and cleanup before database access',async t=>{
  const f=createFixture(),app=require('../src/app'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
  const endpoints=[['GET','/attendance/reports'],['GET','/attendance/reports/1'],['GET','/attendance/reports/1/sources/schedule/download'],['POST','/attendance/preview'],['POST','/attendance/reports'],['POST','/attendance/reports/1/reanalyze'],['PATCH','/attendance/reports/1/notes'],['GET','/work-storage?cutoff=2025-01-01'],['DELETE','/work-storage/attendance/1'],['PATCH','/work-storage/attendance/1/retention']];
  for(const [method,url] of endpoints){const response=await fetch(`http://127.0.0.1:${server.address().port}/api`+url,{method});assert.equal(response.status,401,method+' '+url);assert.match(response.headers.get('cache-control'),/no-store/)}
  assert.equal(f.inspect().calls,0);
});

test('successful new import replaces prior attendance and its sources/notes atomically; failed import preserves current',async t=>{
 const f=createFixture(),server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/attendance`,headers={Authorization:'Bearer attendance-preview-raw_grain'};
 const workbook=async rows=>{const b=new ExcelJS.Workbook();b.addWorksheet('数据').addRows(rows);return Buffer.from(await b.xlsx.writeBuffer())};
 const attendance=await workbook([['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],['G1','甲','2026-09-17','08:00:00','ONECARD','进'],['G1','甲','2026-09-17','16:01:00','ONECARD','出']]);
 async function form(name){const shift=name==='甲'?'8:00-16:00':name==='甲新'?'8:30-16:30':'9:00-17:00';const d=new FormData();d.append('month','2026-09');d.append('acknowledgeWarnings','true');d.append('schedule',new Blob([await workbook([['工号','姓名','9月17号'],['G1','甲',shift]])]),'排班.xlsx');d.append('attendance',new Blob([attendance]),'考勤.xlsx');return d}
 async function post(data){const r=await fetch(base+'/reports',{method:'POST',headers,body:data});return {status:r.status,body:await r.json()}}
 const first=(await post(await form('甲'))).body.data;assert.ok(first.id);await fetch(base+`/reports/${first.id}/notes`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({revision:first.revision,entryKey:first.analysis.results[0].key,note:'旧备注'})});
 const second=(await post(await form('甲新'))).body.data;assert.notEqual(second.id,first.id);assert.equal(f.inspect().reports.length,1);assert.equal(f.inspect().notes.length,0);assert.equal(f.inspect().sources.length,2);assert.ok(f.inspect().sources.every(s=>s.report_id===second.id));assert.equal((await fetch(base+`/reports/${first.id}`,{headers})).status,404);
 const invalid=new FormData();invalid.append('schedule',new Blob(['invalid']),'bad.xlsx');assert.equal((await post(invalid)).status,400);assert.equal(f.inspect().reports[0].id,second.id);
 const query=f.pool.query;f.pool.query=async function(sql,args){if(sql.startsWith('DELETE FROM attendance_sources'))throw Error('synthetic failure during replacement');return query.call(this,sql,args)};
 assert.equal((await post(await form('第三份'))).status,500);assert.equal(f.inspect().reports.length,1);assert.equal(f.inspect().reports[0].id,second.id);assert.equal(f.inspect().sources.length,2);f.pool.query=query;
 const list=await(await fetch(base+'/reports',{headers})).json();assert.deepEqual(list.data.map(r=>r.id),[second.id]);
});

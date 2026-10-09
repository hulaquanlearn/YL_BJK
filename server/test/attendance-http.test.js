const test=require('node:test'),assert=require('node:assert/strict'),ExcelJS=require('exceljs');
const {createFixture}=require('./fixtures/attendance-preview.cjs');
test('HTTP import/roles/notes/download/reanalysis/dedup/cleanup and rollback contract',async t=>{
  const f=createFixture(),server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const root=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(method,url,body,role='raw_grain')=>{const multipart=body instanceof FormData;const r=await fetch(root+url,{method,headers:{Authorization:'Bearer attendance-preview-'+role,...body&&!multipart?{'Content-Type':'application/json'}:{}},body:body?multipart?body:JSON.stringify(body):undefined});return {status:r.status,body:await r.json()}};
  const make=async rows=>{const w=new ExcelJS.Workbook();w.addWorksheet('数据').addRows(rows);return Buffer.from(await w.xlsx.writeBuffer())};
  const schedule=await make([['工号','姓名','9月17号'],['G1','甲','8:00-16:00']]),attendance=await make([['工号','姓名','刷卡日期','刷卡时间','设备号','方向'],['G1','甲','2026-09-17','15:40:00','ONECARD','出'],['G1','甲','2026-09-17','16:01:00','GPS0999999',''],['G2','旁人','2026-09-20','20:00:00','GPS0999999','']]);
  const form=(hours=2,ack=false)=>{const d=new FormData();d.append('month','2026-09');d.append('observationHours',hours);d.append('schedule',new Blob([schedule]),'人员排班表.xlsx');d.append('attendance',new Blob([attendance]),'原始刷卡记录.xlsx');if(ack)d.append('acknowledgeWarnings','true');return d};
  for(const role of ['viewer','qu_making','brewing']){const calls=f.inspect().calls;assert.equal((await request('GET','/attendance/reports',undefined,role)).status,403);assert.equal((await request('POST','/attendance/preview',form(),role)).status,403);assert.equal(f.inspect().calls,calls)}
  assert.equal((await request('GET','/attendance/reports',undefined,'admin')).status,200);
  const invalid=new FormData();invalid.append('schedule',new Blob(['bad']),'fake.xlsx');assert.equal((await request('POST','/attendance/preview',invalid)).status,400);assert.equal(f.inspect().reports.length,0);
  assert.equal((await request('POST','/attendance/reports',form())).status,409);assert.equal(f.inspect().sources.length,0);
  const imported=await request('POST','/attendance/reports',form(2,true));assert.equal(imported.status,200);const r=imported.body.data;assert.equal(r.analysis.sources.schedule.name,'人员排班表.xlsx');assert.equal(r.analysis.results[0].advanceSeconds,1200);
  assert.equal((await request('POST','/attendance/reports',form(2,true))).body.data.id,r.id);assert.equal(f.inspect().sources.length,2);
  assert.equal((await request('POST','/attendance/reports',form(4,true))).body.data.analysis.options.observationHours,4);assert.equal(f.inspect().reports.length,1);assert.equal(f.inspect().sources.length,2);
  const current=(await request('GET',`/attendance/reports/${r.id}`)).body.data;
  const note=await request('PATCH',`/attendance/reports/${r.id}/notes`,{revision:current.revision,entryKey:r.analysis.results[0].key,note:'待核对外出审批'});assert.equal(note.status,200);
  assert.equal((await request('PATCH',`/attendance/reports/${r.id}/notes`,{revision:current.revision,entryKey:r.analysis.results[0].key,note:'覆盖旧备注'})).status,409);assert.equal(f.inspect().notes[0].note,'待核对外出审批');
  const download=await fetch(root+`/attendance/reports/${r.id}/sources/schedule/download`,{headers:{Authorization:'Bearer attendance-preview-raw_grain'}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),schedule);
  assert.equal((await request('POST',`/attendance/reports/${r.id}/reanalyze`,{revision:note.body.data.revision,observationHours:1})).status,200);
  assert.equal((await request('GET','/work-storage?cutoff=2025-01-01')).status,403);assert.equal((await request('GET','/work-storage?cutoff=2099-01-01',undefined,'admin')).status,400);
  const state=(await request('GET',`/attendance/reports/${r.id}`)).body.data;
  assert.equal((await request('DELETE',`/work-storage/attendance/${r.id}`,{revision:state.revision,cutoff:'2026-01-01'},'admin')).status,409);assert.equal(f.inspect().sources.length,2);
  // Age this synthetic fixture only; production data is never touched.
  f.inspect().reports[0].updated_at='2024-01-01 00:00:00';
  assert.equal((await request('PATCH',`/work-storage/attendance/${r.id}/retention`,{revision:state.revision,retentionUntil:'2024-01-01'},'admin')).status,200);
  const list=(await request('GET','/work-storage?cutoff=2025-01-01',undefined,'admin')).body.data;const item=list.items.find(x=>x.kind==='attendance');assert.equal(item.eligible,true);
  assert.equal((await request('DELETE',`/work-storage/attendance/${r.id}`,{revision:item.revision,cutoff:'2025-01-01'},'admin')).status,200);assert.equal(f.inspect().sources.length,0);assert.equal(f.inspect().notes.length,0);assert.equal(f.inspect().audit.length,1);assert.equal((await request('GET',`/attendance/reports/${r.id}`)).status,404);
});
test('real application rejects anonymous attendance sources, analysis, notes and cleanup before database access',async t=>{
  const f=createFixture(),app=require('../src/app'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
  const endpoints=[['GET','/attendance/reports'],['GET','/attendance/reports/1'],['GET','/attendance/reports/1/sources/schedule/download'],['POST','/attendance/preview'],['POST','/attendance/reports'],['POST','/attendance/reports/1/reanalyze'],['PATCH','/attendance/reports/1/notes'],['GET','/work-storage?cutoff=2025-01-01'],['DELETE','/work-storage/attendance/1'],['PATCH','/work-storage/attendance/1/retention']];
  for(const [method,url] of endpoints){const response=await fetch(`http://127.0.0.1:${server.address().port}/api`+url,{method});assert.equal(response.status,401,method+' '+url);assert.match(response.headers.get('cache-control'),/no-store/)}
  assert.equal(f.inspect().calls,0);
});

const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('./fixtures/attendance-preview.cjs');

async function setup(t){
  const fixture=createFixture();
  const server=await new Promise(resolve=>{const listener=fixture.app.listen(0,'127.0.0.1',()=>resolve(listener));});
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}/api/work-storage`;
  const request=async(suffix='',method='GET',body,role='admin')=>{
    const response=await fetch(base+suffix,{method,headers:{Authorization:`Bearer attendance-preview-${role}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,...await response.json()};
  };
  const preview=(feature,kind='')=>request(`/cleanup-preview?function=${feature}&kind=${kind}&cutoff=2026-01-01`);
  const cleanup=(feature,items,kind='')=>request('/cleanup','POST',{function:feature,kind,cutoff:'2026-01-01',items});
  return {fixture,request,preview,cleanup};
}
function photo(fixture,id,parentId=id+1000,bytes=1000){
  const state=fixture.inspect();
  state.archived.push({...state.archived.find(r=>r.kind==='work_photo'),id,parentId,bytes,title:`本地测试照片${id}`});
  if(!state.workParents.some(p=>p.kind==='work_photo'&&p.id===parentId))state.workParents.push({kind:'work_photo',id:parentId,revision:1,text:'保留工作文字'});
}

test('storage filters select one feature while retaining global summaries and validating type scope',async t=>{
  const {request}=await setup(t);
  const group=await request('?function=qu_making&cutoff=2026-01-01');
  assert.equal(group.status,200);assert.equal(group.data.total,2);
  assert.deepEqual(group.data.items.map(r=>r.kind),['task_file','work_photo']);
  assert.equal(group.data.summary.length,3,'summary remains global');
  const narrowed=await request('?function=qu_making&kind=task_file&cutoff=2026-01-01');
  assert.equal(narrowed.data.total,1);assert.equal(narrowed.data.items[0].id,93);
  for(const suffix of ['?function=attendance&kind=inspection&cutoff=2026-01-01','?function=unknown&cutoff=2026-01-01','/cleanup-preview?cutoff=2026-01-01'])assert.equal((await request(suffix)).status,400);
  assert.equal((await request('/cleanup-preview?function=inspection&cutoff=2026-01-01','GET',undefined,'raw_grain')).status,403);
  assert.equal((await request('/cleanup','POST',{function:'inspection',cutoff:'2026-01-01',items:[]},'raw_grain')).status,403);
});
test('cleanup preview excludes referenced, retained, newer and processing sources without deleting',async t=>{
  const {fixture,preview}=await setup(t);
  const qu=await preview('qu_making');
  assert.deepEqual(qu.data,{items:[{kind:'work_photo',id:92,revision:1,title:'本地测试 · 制曲工作截图',bytes:90000,fileCount:1}],itemCount:1,totalBytes:90000});
  fixture.inspect().inspectionSources[0].status='processing';
  assert.equal((await preview('inspection')).data.itemCount,0);
  fixture.inspect().inspectionSources[0].status='ready';
  fixture.inspect().archived.find(r=>r.kind==='inspection').retentionUntil='2099-01-01';
  assert.equal((await preview('inspection')).data.itemCount,0);
  fixture.inspect().archived.find(r=>r.kind==='inspection').retentionUntil=null;
  fixture.inspect().archived.find(r=>r.kind==='inspection').updatedAt='2026-01-01 00:00:00';
  assert.equal((await preview('inspection')).data.itemCount,0);
  assert.equal(fixture.inspect().archived.length,3);assert.equal(fixture.inspect().audit.length,0);
});
test('cleanup manifest rejects empty, duplicate, untyped and out-of-scope items before deletion',async t=>{
  const {fixture,cleanup}=await setup(t);
  for(const items of [[],[{kind:'inspection',id:91,revision:1},{kind:'inspection',id:91,revision:1}],[{kind:'inspection',id:'91',revision:1}],[{kind:'inspection',id:91,revision:'1'}],[{kind:'inspection',id:91,revision:-1}],[{kind:'work_photo',id:92,revision:1}]])assert.equal((await cleanup('inspection',items)).status,400);
  assert.equal(fixture.inspect().archived.length,3);assert.equal(fixture.inspect().audit.length,0);
});
test('preview returns candidates from all pages and refuses an oversized selection without truncating',async t=>{
  const {fixture,preview,request}=await setup(t);
  for(let i=0;i<34;i++)photo(fixture,100+i);
  assert.equal((await request('?function=qu_making&cutoff=2026-01-01')).data.items.length,30);
  assert.equal((await preview('qu_making')).data.itemCount,35);
  for(let i=34;i<1000;i++)photo(fixture,100+i);
  const tooMany=await preview('qu_making');assert.equal(tooMany.status,400);assert.match(tooMany.msg,/1000/);
  assert.equal(fixture.inspect().audit.length,0);
});
test('a stale reviewed version cancels the whole batch before any item is deleted',async t=>{
  const {fixture,preview,cleanup}=await setup(t);
  fixture.inspect().archived.find(r=>r.kind==='task_file').referenceCount=0;
  const reviewed=(await preview('qu_making')).data.items;
  fixture.inspect().workParents.find(r=>r.kind==='task_file').revision++;
  assert.equal((await cleanup('qu_making',reviewed)).status,409);
  assert.equal(fixture.inspect().archived.length,3);assert.equal(fixture.inspect().audit.length,0);
});
test('reference or time changes detected after an earlier delete roll back files, parent revisions and audit',async t=>{
  const {fixture,preview,cleanup}=await setup(t);
  fixture.inspect().archived.find(r=>r.kind==='task_file').referenceCount=0;
  fixture.inspect().archived.push({...fixture.inspect().archived.find(r=>r.kind==='task_file'),id:95,parentId:950});
  fixture.inspect().workParents.push({kind:'task_file',id:950,revision:1,text:'保留任务文字'});
  const reviewed=(await preview('qu_making','task_file')).data.items;
  fixture.inspect().archived.find(r=>r.id===95).referenceCount=1;
  assert.equal((await cleanup('qu_making',reviewed,'task_file')).status,409);
  assert.equal(fixture.inspect().archived.length,4);assert.equal(fixture.inspect().audit.length,0);
  assert.equal(fixture.inspect().workParents.find(r=>r.kind==='task_file'&&r.id===930).revision,1);
  photo(fixture,94);
  const photos=(await preview('qu_making','work_photo')).data.items;
  fixture.inspect().archived.find(r=>r.id===94).updatedAt='2099-01-01 00:00:00';
  assert.equal((await cleanup('qu_making',photos,'work_photo')).status,409);
  assert.equal(fixture.inspect().archived.length,5);assert.equal(fixture.inspect().audit.length,0);
  assert.equal(fixture.inspect().workParents.find(r=>r.kind==='work_photo'&&r.id===920).revision,1);
});
test('batch cleanup supports multiple files sharing one parent and audits exact released bytes while preserving work text',async t=>{
  const {fixture,preview,cleanup,request}=await setup(t);
  photo(fixture,94,920,30000);
  const reviewed=(await preview('qu_making','work_photo')).data.items;
  const result=await cleanup('qu_making',reviewed,'work_photo');
  assert.equal(result.status,200);assert.deepEqual(result.data,{itemCount:2,releasedBytes:120000});
  assert.equal(fixture.inspect().archived.filter(r=>r.kind==='work_photo').length,0);
  const parent=fixture.inspect().workParents.find(r=>r.id===920);assert.equal(parent.revision,3);assert.equal(parent.text,'本地测试工作记录文字');assert.equal(parent.updated_at,'2025-01-02 10:00:00','cleaning files must not refresh work text timestamp');
  assert.equal(fixture.inspect().archived.some(r=>r.kind==='inspection'),true);assert.equal(fixture.inspect().archived.some(r=>r.kind==='task_file'),true);
  const audit=(await request('/audit')).data;assert.equal(audit.length,2);assert.equal(audit.reduce((n,r)=>n+r.released_bytes,0),120000);
  assert.ok(audit.every(r=>JSON.parse(r.detail_json).preservedWorkText));
  assert.equal((await cleanup('qu_making',reviewed,'work_photo')).status,409,'removed reviewed source is stale');
});
test('individual and batch task-file cleanup block a current reference even when the UNION read is stale',async t=>{
  const {fixture,preview,cleanup,request}=await setup(t);
  fixture.inspect().archived.find(r=>r.kind==='task_file').referenceCount=0;
  const reviewed=(await preview('qu_making','task_file')).data.items;
  const original=fixture.pool.query.bind(fixture.pool),lockingReads=[];
  fixture.pool.query=async(sql,args)=>{
    const result=await original(sql,args);
    if(sql.includes(') storage WHERE kind=? AND id=?')&&args[0]==='task_file'){
      assert.equal(result[0][0].referenceCount,0,'the snapshot saw an unreferenced file');
      fixture.inspect().archived.find(r=>r.kind==='task_file').referenceCount=1;
    }
    if(sql.startsWith('SELECT file_id FROM work_task_file_references')){assert.match(sql,/FOR UPDATE$/);lockingReads.push(result[0].length);}
    return result;
  };
  assert.equal((await cleanup('qu_making',reviewed,'task_file')).status,409);
  assert.equal(fixture.inspect().archived.length,3);assert.equal(fixture.inspect().audit.length,0);
  assert.equal((await request('/task_file/93','DELETE',{cutoff:'2026-01-01',revision:1})).status,409);
  assert.deepEqual(lockingReads,[1,1]);assert.equal(fixture.inspect().archived.length,3);assert.equal(fixture.inspect().audit.length,0);
});
test('existing attendance reports remain protected until retention expires and eligible cleanup removes its files and notes',async t=>{
  const {fixture,preview,cleanup,request}=await setup(t);
  await fixture.pool.query('INSERT INTO attendance_reports',['本地考勤','2026-09',1,'{}','test-hash']);
  const state=fixture.inspect(),report=state.reports[0];report.updated_at='2025-01-01 00:00:00';
  state.sources.push({id:1,report_id:report.id,source_kind:'schedule',byte_size:5,content:Buffer.from('proof')});
  state.notes.push({report_id:report.id,entry_key:'G1|2026-09-17|8:00-16:00',note:'已核对',actor_id:1});
  assert.equal((await request('?function=attendance&cutoff=2026-01-01')).data.total,1);
  assert.equal((await preview('attendance')).data.itemCount,0);
  assert.equal((await cleanup('attendance',[{kind:'attendance',id:report.id,revision:1}])).status,409);
  assert.equal(fixture.inspect().sources.length,1);assert.equal(fixture.inspect().notes.length,1);
  assert.equal((await request(`/attendance/${report.id}/retention`,'PATCH',{retentionUntil:null,revision:1})).status,200);
  const reviewed=(await preview('attendance')).data.items;
  const result=await cleanup('attendance',reviewed);assert.equal(result.status,200);assert.equal(result.data.itemCount,1);
  assert.equal(fixture.inspect().reports.length,0);assert.equal(fixture.inspect().sources.length,0);assert.equal(fixture.inspect().notes.length,0);
  assert.equal(fixture.inspect().archived.length,3,'other features untouched');
});
test('private fixture snapshots restore source buffers, notes, cleared samples, audits and next report ID',async t=>{
  const {fixture,cleanup}=await setup(t);
  await fixture.pool.query('INSERT INTO attendance_reports',['本地考勤','2026-09',1,'{}','first-hash']);
  fixture.inspect().sources.push({id:1,report_id:1,byte_size:5,content:Buffer.from('proof')});
  fixture.inspect().notes.push({report_id:1,entry_key:'test',note:'保留备注',actor_id:1});
  assert.equal((await cleanup('inspection',[{kind:'inspection',id:91,revision:1}])).status,200);
  const saved=fixture.snapshot();
  await fixture.pool.query('INSERT INTO attendance_reports',['后续考勤','2026-09',1,'{}','second-hash']);
  fixture.restore(saved);
  assert.equal(fixture.inspect().reports.length,1);assert.equal(fixture.inspect().notes[0].note,'保留备注');
  assert.ok(Buffer.isBuffer(fixture.inspect().sources[0].content));assert.equal(fixture.inspect().sources[0].content.toString(),'proof');
  assert.equal(fixture.inspect().archived.some(r=>r.id===91),false);assert.equal(fixture.inspect().audit.length,1);
  const [inserted]=await fixture.pool.query('INSERT INTO attendance_reports',['新考勤','2026-09',1,'{}','third-hash']);assert.equal(inserted.insertId,2);
});

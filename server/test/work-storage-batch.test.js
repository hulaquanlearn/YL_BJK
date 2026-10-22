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

function addReport(fixture,id,extra={}){
 fixture.inspect().archived.push({kind:'attendance',id,title:'测试考勤'+id,workshopCode:'raw_grain',updatedAt:'2025-01-02 00:00:00',retentionUntil:null,contentBytes:1000,bytes:1000,fileCount:0,referenceCount:0,revision:1,...extra});
}

test('manual deletion overrides retention only for an admin with the reviewed revision',async t=>{
 const {fixture,request,preview,cleanup}=await setup(t);
 const report=fixture.inspect().archived[0];report.retentionUntil='2099-12-31';report.updatedAt='2099-01-01 00:00:00';
 assert.equal((await preview('attendance')).data.itemCount,0);
 assert.equal((await cleanup('attendance',[{kind:'attendance',id:91,revision:1}])).status,409);
 assert.equal((await request('/attendance/91','DELETE',{manual:true,revision:1},'raw_grain')).status,403);
 assert.equal((await request('/attendance/91','DELETE',{manual:true,revision:0})).status,409);
 fixture.inspect().retainedSources[0].status='processing';
 assert.equal((await request('/attendance/91','DELETE',{manual:true,revision:1})).status,409);
 fixture.inspect().retainedSources[0].status='ready';
 assert.equal((await request('/attendance/91','DELETE',{manual:true,revision:1})).status,200);
 assert.equal(fixture.inspect().archived.length,0);
 const audit=JSON.parse(fixture.inspect().audit[0].detail_json);assert.equal(audit.manual,true);assert.equal(audit.retentionUntil,'2099-12-31');
});

test('retired storage scopes and attachment deletion cannot touch historical data',async t=>{
 const {fixture,request,cleanup}=await setup(t);const before=fixture.inspect().calls;
 for(const suffix of ['?function=qu_making&cutoff=2026-01-01','?kind=work_photo&cutoff=2026-01-01','?function=attendance&kind=task_file&cutoff=2026-01-01','/cleanup-preview?cutoff=2026-01-01'])assert.equal((await request(suffix)).status,400);
 for(const kind of ['work_photo','task_file'])assert.equal((await request('/'+kind+'/92','DELETE',{manual:true,revision:1})).status,400);
 assert.equal((await cleanup('qu_making',[{kind:'work_photo',id:92,revision:1}])).status,400);
 assert.equal(fixture.inspect().calls,before);assert.equal(fixture.inspect().audit.length,0);
});

test('preview respects retention, processing and cutoff without writing data',async t=>{
 const {fixture,preview}=await setup(t);
 assert.equal((await preview('attendance')).data.itemCount,1);
 fixture.inspect().retainedSources[0].status='processing';assert.equal((await preview('attendance')).data.itemCount,0);
 fixture.inspect().retainedSources[0].status='ready';fixture.inspect().archived[0].retentionUntil='2099-01-01';assert.equal((await preview('attendance')).data.itemCount,0);
 fixture.inspect().archived[0].retentionUntil=null;fixture.inspect().archived[0].updatedAt='2026-01-01 00:00:00';assert.equal((await preview('attendance')).data.itemCount,0);
 assert.equal(fixture.inspect().archived.length,1);assert.equal(fixture.inspect().audit.length,0);
});

test('manifest rejects empty, duplicate, untyped and foreign items before any write',async t=>{
 const {fixture,cleanup}=await setup(t);
 for(const items of [[],[{kind:'attendance',id:91,revision:1},{kind:'attendance',id:91,revision:1}],[{kind:'attendance',id:'91',revision:1}],[{kind:'attendance',id:91,revision:'1'}],[{kind:'attendance',id:91,revision:-1}],[{kind:'work_photo',id:92,revision:1}]])assert.equal((await cleanup('attendance',items)).status,400);
 assert.equal(fixture.inspect().archived.length,1);assert.equal(fixture.inspect().audit.length,0);
});

test('preview includes all pages and refuses more than 1000 items without truncation',async t=>{
 const {fixture,preview,request}=await setup(t);
 for(let i=0;i<34;i++)addReport(fixture,100+i);
 assert.equal((await request('?function=attendance&cutoff=2026-01-01')).data.items.length,30);
 assert.equal((await preview('attendance')).data.itemCount,35);
 for(let i=34;i<1000;i++)addReport(fixture,100+i);
 const tooMany=await preview('attendance');assert.equal(tooMany.status,400);assert.match(tooMany.msg,/1000/);assert.equal(fixture.inspect().audit.length,0);
});

test('stale revisions cancel all writes and a late eligibility failure rolls the entire batch back',async t=>{
 const {fixture,preview,cleanup}=await setup(t);addReport(fixture,94);
 const reviewed=(await preview('attendance')).data.items;
 fixture.inspect().archived[1].revision++;
 assert.equal((await cleanup('attendance',reviewed)).status,409);assert.equal(fixture.inspect().audit.length,0);assert.equal(fixture.inspect().archived.length,2);
 fixture.inspect().archived[1].revision=1;fixture.inspect().archived[1].updatedAt='2099-01-01 00:00:00';
 assert.equal((await cleanup('attendance',reviewed)).status,409);
 assert.equal(fixture.inspect().archived.length,2);assert.equal(fixture.inspect().retainedSources.length,2);assert.equal(fixture.inspect().retainedNotes.length,1);assert.equal(fixture.inspect().audit.length,0);
});

test('successful cleanup reports exact bytes and preserves unrelated audit and source snapshots',async t=>{
 const {fixture,preview,cleanup}=await setup(t);addReport(fixture,94);
 const saved=fixture.snapshot(),p=(await preview('attendance')).data;
 const result=await cleanup('attendance',p.items);assert.equal(result.status,200);assert.equal(result.data.itemCount,2);assert.equal(result.data.releasedBytes,p.totalBytes);
 assert.equal(fixture.inspect().archived.length,0);assert.equal(fixture.inspect().audit.length,2);assert.equal(fixture.inspect().retainedSources.length,0);
 fixture.restore(saved);assert.equal(fixture.inspect().archived.length,2);assert.equal(fixture.inspect().audit.length,0);assert.equal(fixture.inspect().retainedSources.length,2);
});

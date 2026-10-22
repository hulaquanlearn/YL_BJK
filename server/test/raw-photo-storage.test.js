const test=require('node:test'),assert=require('node:assert/strict');
const {createFixture}=require('./fixtures/attendance-preview.cjs');
async function setup(t){
 const fixture=createFixture(),state=fixture.inspect();
 state.rawReports.push({id:501,revision:7,updatedAt:'2025-01-01 10:00:00',week_start:'2024-12-30',status:'confirmed',submitted_at:'2025-01-02',identity_json:{name:'照片测试'},checks_json:[{dutyId:'weekly',note:'保留文字',result:'已完成',photoIds:[1,3],dailyRecords:[{photoIds:[2]}],monthlyRecords:[{photoIds:[1]}]}],cadence_json:{version:2,legacyChecks:[{photoIds:[1,3]}]},summary:'保留总结'});
 for(const id of [1,2,3])state.rawPhotos.push({id,report_id:501,filename:'照片'+id+'.jpg',byte_size:100*id,image:Buffer.alloc(id)});
 state.rawEvents.push({report_id:501,action:'submitted',detail:{checks:[{photoIds:[1,2,3]}]}});
 const server=fixture.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();server.closeAllConnections()});
 const base='http://127.0.0.1:'+server.address().port+'/api/work-storage';
 const request=async(url='',method='GET',body,role='admin')=>{const r=await fetch(base+url,{method,headers:{Authorization:'Bearer attendance-preview-'+role,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()}};
 const preview=()=>request('/cleanup-preview?function=all&kind=raw_duty_photo&cutoff=2026-01-01');
 const cleanup=items=>request('/cleanup','POST',{function:'all',kind:'raw_duty_photo',cutoff:'2026-01-01',items});
 return {fixture,request,preview,cleanup};
}
test('sysadmin previews historical and referenced photos; other roles cannot read or delete',async t=>{
 const {fixture,request,preview}=await setup(t);const result=await preview();assert.equal(result.status,200);assert.equal(result.data.itemCount,3);assert.equal(result.data.totalBytes,600);assert.ok(result.data.items.every(i=>i.historyCount&&i.referenceCount));
 for(const role of ['raw_grain','qu_making','brewing','viewer']){assert.equal((await request('?function=all&cutoff=2026-01-01','GET',undefined,role)).status,403);assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:7},role)).status,403)}
 assert.equal(fixture.inspect().rawPhotos.length,3);
 const list=await request('?function=all&kind=raw_duty_photo&cutoff=2026-01-01');assert.ok(list.data.items.every(i=>i.canDelete&&i.eligible));
});
test('batch deletes several photos under one parent revision, unlinks all cadence references and retains text and audit history',async t=>{
 const {fixture,preview,cleanup}=await setup(t);const items=(await preview()).data.items.filter(i=>i.id!==3).map(({kind,id,revision})=>({kind,id,revision}));
 const result=await cleanup(items);assert.equal(result.status,200);assert.equal(result.data.releasedBytes,300);const s=fixture.inspect(),r=s.rawReports[0];assert.equal(r.revision,8);assert.equal(r.summary,'保留总结');assert.equal(r.status,'confirmed');assert.equal(r.submitted_at,'2025-01-02');assert.equal(r.updatedAt,'2025-01-01 10:00:00');assert.equal(r.checks_json[0].note,'保留文字');assert.deepEqual(r.checks_json[0].photoIds,[3]);assert.deepEqual(r.checks_json[0].dailyRecords[0].photoIds,[]);assert.deepEqual(r.checks_json[0].monthlyRecords[0].photoIds,[]);assert.deepEqual(r.cadence_json.legacyChecks[0].photoIds,[3]);assert.deepEqual(s.rawPhotos.map(p=>p.id),[3]);assert.equal(s.rawEvents[0].action,'submitted');assert.deepEqual(s.rawEvents[0].detail.checks[0].photoIds,[1,2,3]);assert.equal(s.rawEvents.at(-1).action,'photo_removed_admin');assert.equal(s.audit.length,2);assert.ok(s.audit.every(e=>JSON.parse(e.detail_json).wasHistorical&&JSON.parse(e.detail_json).wasReferenced));
});
test('stale or missing reviewed photos cancel the entire batch; later writes use refreshed versions',async t=>{
 const {fixture,preview,cleanup,request}=await setup(t),items=(await preview()).data.items.map(({kind,id,revision})=>({kind,id,revision}));
 fixture.inspect().rawReports[0].revision=8;assert.equal((await cleanup(items)).status,409);assert.equal(fixture.inspect().rawPhotos.length,3);assert.equal(fixture.inspect().audit.length,0);
 fixture.inspect().rawReports[0].revision=7;fixture.inspect().rawPhotos.splice(2,1);assert.equal((await cleanup(items)).status,409);assert.equal(fixture.inspect().rawPhotos.length,2);assert.equal(fixture.inspect().audit.length,0);
 assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:7})).status,200);assert.equal((await request('/raw_duty_photo/2','DELETE',{manual:true,revision:7})).status,409);assert.equal((await request('/raw_duty_photo/2','DELETE',{manual:true,revision:8})).status,200);
});
test('batch date limits and malformed reference data cannot be bypassed by admin deletion',async t=>{
 const {fixture,preview,request}=await setup(t);fixture.inspect().rawReports[0].updatedAt='2099-01-01';assert.equal((await preview()).data.itemCount,0);assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:false,cutoff:'2026-01-01',revision:7})).status,409);
 fixture.inspect().rawReports[0].checks_json='{broken';assert.equal((await request('/raw_duty_photo/1','DELETE',{manual:true,revision:7})).status,409);assert.equal(fixture.inspect().rawPhotos.length,3);assert.equal(fixture.inspect().audit.length,0);
});

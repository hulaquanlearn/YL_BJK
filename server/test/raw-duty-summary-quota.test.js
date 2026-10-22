const test=require('node:test'),assert=require('node:assert/strict'),Q=require('../src/raw-duty-summary-quota');
const {memoryStore,createFixture}=require('./fixtures/raw-duty-preview.cjs');
test('daily summary quota resets at Beijing midnight and only system admins are unlimited',async()=>{
 const w=Q.quotaWindow(new Date('2026-10-15T15:59:59Z')),next=Q.quotaWindow(new Date('2026-10-15T16:00:00Z'));
 assert.equal(w.date,'2026-10-15');assert.equal(next.date,'2026-10-16');assert.equal(next.start,'2026-10-15T16:00:00.000Z');
 const store=memoryStore();for(let i=0;i<3;i++)await store.event(1,11,'ai_summary_generated',{quotaDate:w.date,generatedAt:w.now});
 assert.equal((await Q.usage(store,{id:11,role:'viewer'},w)).remaining,0);assert.equal((await Q.usage(store,{id:11,role:'raw_grain'},w)).unlimited,false);
 assert.equal((await Q.usage(store,{id:11,role:'viewer'},next)).remaining,3);assert.equal((await Q.usage(store,{id:11,role:'admin'},w)).unlimited,true);
});
test('atomic reservations share one account quota across weeks and failures release their slots',async()=>{
 const store=memoryStore(),user={id:11,role:'viewer'};
 const reserved=await Promise.allSettled([1,2,3,4].map(reportId=>store.transaction(db=>Q.reserve(db,user,reportId))));
 assert.equal(reserved.filter(r=>r.status==='fulfilled').length,3);assert.equal(reserved.find(r=>r.status==='rejected').reason.status,429);
 assert.equal((await Q.usage(store,user)).remaining,0);
 await store.releaseSummaryReservation(reserved[0].value.id,user.id);assert.equal((await Q.usage(store,user)).remaining,1);
 const added=await store.transaction(db=>Q.reserve(db,user,8));await store.finishSummaryReservation(added.id,user.id,{quotaDate:added.detail.quotaDate,generatedAt:new Date().toISOString()});assert.equal((await Q.usage(store,user)).remaining,0);
 const admin={id:1,role:'admin'};for(let i=0;i<5;i++)await store.transaction(db=>Q.reserve(db,admin,i));assert.equal((await Q.usage(store,admin)).unlimited,true);
});
test('HTTP: success deducts one, generation failure deducts none, fourth call is rejected before AI',async t=>{
 let calls=0,fail=true;const f=await createFixture({summaryGenerator:async()=>{calls++;if(fail)throw Error('test failure');return {summary:'根据材料整理的总结',evidenceIds:['test'],generatedAt:new Date().toISOString()}}});
 const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/raw-duties`,r=(await f.store.reports(require('../src/raw-duties').period().start)).find(r=>r.user_id===12),headers={Authorization:'Bearer raw-preview-worker2','Content-Type':'application/json'};
 async function call(){const res=await fetch(base+'/reports/'+r.id+'/summary',{method:'POST',headers,body:JSON.stringify({revision:r.revision})});return {status:res.status,body:await res.json()}}
 assert.equal((await call()).status,500);assert.equal((await Q.usage(f.store,{id:12,role:'viewer'})).remaining,3);fail=false;
 for(let i=0;i<3;i++){const response=await call();assert.equal(response.status,200);assert.equal(response.body.data.summaryQuota.remaining,2-i)}
 const fourth=await call();assert.equal(fourth.status,429);assert.equal(calls,4);
 const quota=await (await fetch(base+'/summary-quota',{headers})).json();assert.equal(quota.data.remaining,0);
 assert.ok((await f.store.events(r.id)).every(e=>e.action!=='ai_summary_reserved'&&e.action!=='ai_summary_failed'));
});

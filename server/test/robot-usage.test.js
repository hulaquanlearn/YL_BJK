const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createUsage,windowAt,annotationPlan,BATCH_QUESTION}=require('../src/robot-usage');
const manager={id:2,role:'qu_making'},admin={id:1,role:'admin'};
const saved={id:'backup-a',report:{files:[{id:'main',readable:true,kind:'program',lineCount:320,routines:[{startLine:1,endLine:100}]}]},batchState:{},analysis:null};
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-quota-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root}
test('daily quota persists across instances/backups, isolates accounts, refunds failures and resets at Beijing midnight',async t=>{
 const root=await fixture(t);let clock=new Date('2026-10-18T15:59:59Z');const store=()=>createUsage(root,{now:()=>clock});
 assert.equal(windowAt(clock).date,'2026-10-18');assert.equal(windowAt(clock).resetAt,'2026-10-18T16:00:00.000Z');
 await assert.rejects(store().execute(manager,{backupId:'a'},async()=>{throw Error('upstream failure')}),/upstream failure/);assert.equal((await store().usage(manager)).remaining,3);
 for(let i=0;i<3;i++)await store().execute(manager,{backupId:'backup-'+i},async()=>i);
 assert.equal((await store().usage(manager)).remaining,0);await assert.rejects(store().execute(manager,{backupId:'other'},async()=>assert.fail('quota must block before upstream')),e=>e.status===429);
 assert.equal((await store().usage({id:3,role:'raw_grain'})).remaining,3);
 clock=new Date('2026-10-18T16:00:00Z');assert.equal((await store().usage(manager)).remaining,3);await store().execute(manager,{backupId:'a'},async()=>true);assert.equal((await store().usage(manager)).used,1);
 for(let i=0;i<20;i++)await store().execute(admin,{backupId:'a'},async()=>i);assert.equal((await store().usage(admin)).unlimited,true);assert.equal((await store().usage(admin)).limit,null);
});
test('one annotation run spans all batches; pause, restart, full quota and failed retry do not double-charge',async t=>{
 const root=await fixture(t),q=createUsage(root);const run=await q.startAnnotations(manager,saved);assert.equal(run.plan.length,3);assert.equal((await q.usage(manager)).used,0);
 await assert.rejects(q.execute(manager,{backupId:saved.id,runId:run.id,target:run.plan[0]},async()=>{throw Error('failed first batch')}),/failed/);assert.equal((await q.usage(manager)).used,0);
 await q.execute(manager,{backupId:saved.id,runId:run.id,target:run.plan[0]},async()=>true);assert.equal((await q.usage(manager)).used,1);
 for(let i=0;i<2;i++)await q.execute(manager,{backupId:'b'},async()=>true);
 const restarted=createUsage(root),continued=await restarted.startAnnotations(manager,saved);assert.equal(continued.id,run.id);assert.equal(continued.plan.length,2);
 await assert.rejects(restarted.execute(manager,{backupId:saved.id,runId:run.id,target:run.plan[1]},async()=>{throw Error('later failed batch')}),/failed/);assert.equal((await restarted.usage(manager)).used,3);
 for(const target of continued.plan)await restarted.execute(manager,{backupId:saved.id,runId:run.id,target},async()=>true);
 assert.equal((await restarted.usage(manager)).used,3);await assert.rejects(restarted.execute(manager,{backupId:saved.id,runId:run.id,target:run.plan[0]},async()=>assert.fail()),e=>e.status===409);
 await assert.rejects(restarted.startAnnotations(manager,{...saved,id:'other'}),e=>e.status===429);
});
test('annotation entitlement cannot be reused by another account, backup, target or direct unregistered batch',async t=>{
 const q=createUsage(await fixture(t)),run=await q.startAnnotations(manager,saved);
 for(const [user,options]of [[{id:3,role:'brewing'},{backupId:saved.id,runId:run.id,target:run.plan[0]}],[manager,{backupId:'other',runId:run.id,target:run.plan[0]}],[manager,{backupId:saved.id,runId:run.id,target:{fileId:'main',startLine:2,endLine:3}}],[manager,{backupId:saved.id,target:run.plan[0]}]])await assert.rejects(q.execute(user,options,async()=>assert.fail('forged entitlement')),e=>e.status===400);
 await assert.rejects(q.execute({id:4,role:'viewer'},{backupId:'a'},async()=>assert.fail()),e=>e.status===403);
 assert.deepEqual(annotationPlan({...saved,analysis:{annotations:[{fileId:'main',line:2}]},batchState:{'main:1-150':{status:'done'}}}).map(t=>t.startLine),[151,301]);
 assert.deepEqual(annotationPlan({...saved,analysis:{annotations:[{fileId:'main',line:2}]}},{scope:'missing',fileId:'main'}),[]);
});
test('concurrent calls across usage instances share one reservation; corrupt ledger fails closed',async t=>{
 const root=await fixture(t),a=createUsage(root),b=createUsage(root);let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const pending=a.execute(manager,{backupId:'a'},async()=>{entered();await gate;return true});await started;assert.equal((await b.usage(manager)).used,1);
 await assert.rejects(b.execute(manager,{backupId:'b'},async()=>assert.fail()),e=>e.status===429);release();await pending;
 await fs.writeFile(path.join(root,'.usage','2.json'),'broken');await assert.rejects(b.usage(manager));await assert.rejects(b.execute(manager,{backupId:'b'},async()=>assert.fail()));
});
test('HTTP enforces manager quota for questions/modifications and one full run, while admin exceeds the old request cap',async t=>{
 const archiver=require('archiver'),express=require('express'),{createLibrary}=require('../src/robot-library');
 const root=await fixture(t),library=createLibrary(root),zip=archiver('zip'),chunks=[];const buffer=new Promise((r,e)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>r(Buffer.concat(chunks)));zip.on('error',e)});
 zip.append('MODULE Main\nPROC main()\nWaitDI diReady,1;\nENDPROC\n'+'! demonstration\n'.repeat(310)+'ENDMODULE',{name:'RAPID/TASK1/PROGMOD/Main.mod'});await zip.finalize();let current=await library.upload(await buffer,'demo.zip'),calls=0,fail=false,lastQuestion;
 const accounts={admin,manager,raw:{id:3,role:'raw_grain'},brewing:{id:4,role:'brewing'},viewer:{id:5,role:'viewer'}};
 const app=express();app.use((req,_res,next)=>{req.user=accounts[req.get('Authorization')];next()});app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library,config:{enabled:false},analyzeImpl:async(report,options)=>{calls++;lastQuestion=options.question;if(fail)throw Error('upstream failed');const target=options.target||{fileId:report.files[0].id,startLine:3,endLine:3};return {sourceHash:report.sha256,mode:options.mode,target:options.target,summary:'分析结果',sections:[{title:'依据',content:'示例',refs:[target]}],annotations:[{fileId:target.fileId,line:target.startLine,text:'中文说明'}],changes:[],questions:[]}}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/robot-program`,url=base+'/library/'+current.id;
 const request=(method,uri,role='manager',body)=>fetch(uri,{method,headers:{Authorization:role,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 for(const role of ['manager','raw','brewing']){const state=(await(await request('GET',base+'/status',role)).json()).data;assert.equal(state.canInteract,true);assert.equal(state.canManage,false);assert.equal(state.quota.remaining,3);assert.equal(state.issues,undefined);for(const method of ['DELETE','PATCH'])assert.equal((await request(method,url,role,{revision:1,name:'no'})).status,403);assert.equal((await request('POST',base+'/connection-check',role,{})).status,403)}
 assert.equal((await request('POST',url+'/analyze','viewer',{revision:1,question:'no'})).status,403);
 const beforeDenied=calls;assert.equal((await request('POST',url+'/annotation-run','manager',{revision:current.revision})).status,403);
 assert.equal((await request('POST',url+'/analyze','manager',{revision:current.revision,target:{fileId:current.report.files[0].id,startLine:1,endLine:150}})).status,403);
 assert.equal((await request('POST',url+'/analyze','manager',{revision:current.revision,runId:'old-run'})).status,403);assert.equal(calls,beforeDenied);
 const initialNotes=current.analysis?.annotations.length||0;
 for(let i=0;i<1;i++){const response=await request('POST',url+'/analyze','manager',{revision:current.revision,question:'普通问答'});assert.equal(response.status,200);current=(await response.json()).data;assert.equal(current.analysis.annotations.length,initialNotes)}
 fail=true;assert.equal((await request('POST',url+'/analyze','manager',{revision:current.revision,question:'失败'})).status,500);fail=false;
 for(const mode of ['analyze','modify']){const response=await request('POST',url+'/analyze','manager',{revision:current.revision,mode,question:'提问'});assert.equal(response.status,200);current=(await response.json()).data}
 assert.equal(current.quota.remaining,0);const before=calls;assert.equal((await request('POST',url+'/analyze','manager',{revision:current.revision,question:'超额'})).status,429);assert.equal(calls,before);
 for(let i=0;i<15;i++){const response=await request('POST',url+'/analyze','admin',{revision:current.revision,question:'管理员调用'});assert.equal(response.status,200);current=(await response.json()).data;assert.equal(current.quota.unlimited,true)}
});

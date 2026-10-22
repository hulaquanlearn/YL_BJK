const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createUsage}=require('../src/knowledge-usage');
async function setup(t,options){const root=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-quota-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,usage:createUsage(root,options)}}
const manager={id:2,role:'raw_grain'},answer=async()=>({answer:'测试答复'});
test('knowledge quotas persist across service instances, separate accounts, and reset at Beijing midnight',async t=>{
 let now=new Date('2026-10-18T15:59:00Z');const {root,usage}=await setup(t,{now:()=>now});
 for(let i=0;i<3;i++)await usage.execute(manager,answer);assert.equal((await usage.usage(manager)).remaining,0);
 await assert.rejects(createUsage(root,{now:()=>now}).execute(manager,answer),{status:429});assert.equal((await usage.execute({id:3,role:'qu_making'},answer)).quota.remaining,2);
 now=new Date('2026-10-18T16:00:00Z');assert.equal((await usage.execute(manager,answer)).quota.remaining,2);assert.equal((await usage.usage(manager)).date,'2026-10-19');
});
test('failure, restricted answers and retrieval-only fallback release charges; system admin is unlimited',async t=>{
 const {usage}=await setup(t);await assert.rejects(usage.execute(manager,async()=>{throw Error('upstream failed')}));
 for(const value of [{degraded:true},{restricted:true}])await usage.execute(manager,async()=>value);
 assert.equal((await usage.usage(manager)).used,0);
 for(let i=0;i<25;i++)assert.equal((await usage.execute({id:1,role:'admin'},answer)).quota.unlimited,true);
 for(const role of ['viewer','unknown',undefined])await assert.rejects(usage.execute({id:4,role},answer),{status:403});
});
test('concurrent requests across service instances cannot overrun a shared account',async t=>{
 const {root,usage}=await setup(t);let enter,release;const started=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
 const pending=usage.execute(manager,async()=>{enter();await gate;return {answer:'完成'}});await started;
 await assert.rejects(createUsage(root).execute(manager,answer),{status:429});assert.equal((await usage.usage(manager)).used,1);release();await pending;assert.equal((await usage.usage(manager)).used,1);
});
test('unfinished precharges survive restart and corrupt ledgers fail closed without model invocation',async t=>{
 const {root,usage}=await setup(t);await usage.execute(manager,answer);const file=path.join(root,'.knowledge-usage','2.json'),ledger=JSON.parse(await fs.readFile(file,'utf8'));ledger.entries[0].state='pending';await fs.writeFile(file,JSON.stringify(ledger));assert.equal((await createUsage(root).usage(manager)).used,1);
 await fs.writeFile(file,'broken');let called=false;await assert.rejects(createUsage(root).execute(manager,async()=>{called=true}),{status:503});assert.equal(called,false);
});

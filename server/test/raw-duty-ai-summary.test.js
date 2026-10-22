const test=require('node:test'),assert=require('node:assert/strict');
const {summaryEvidence,generateSummary}=require('../src/raw-duty-ai-summary');
const config={provider:'deepseek',enabled:true,apiUrl:'https://api.deepseek.com/chat/completions',token:'test-only',model:'test',timeoutMs:1000};
const report={week_start:'2026-10-12',template:{entries:[{id:'d',title:'检查设备',frequency:'每班'},{id:'m',title:'月度检查',frequency:'每月'}]},cadence:{version:2,calendar:{'2026-10-12':'work','2026-10-13':'rest'}},checks:[{dutyId:'d',dailyRecords:[{date:'2026-10-12',result:'已完成',note:'已检查并登记',photoIds:[1]},{date:'2026-10-13',result:'已完成',note:'休息日残留'}]},{dutyId:'m',monthlyRecords:[{month:'2026-10',result:'已完成',note:'月度检查已完成',recordDate:'2026-10-06',shared:true,originWeek:'2026-10-05'}]}]};

test('AI summary uses dated evidence and shared monthly origins without inventing photo contents',async()=>{
 const payload=summaryEvidence(report,'2026-10-15');assert.equal(payload.evidence.length,2);assert.equal(payload.evidence[0].photoCount,1);assert.equal(payload.evidence[1].date,'2026-10-06');assert.equal(payload.evidence[1].sharedFromWeek,'2026-10-05');assert.ok(!JSON.stringify(payload).includes('休息日残留'));
 let request;const result=await generateSummary(report,{config,fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'已登记当日设备检查，月度检查实际于10月6日完成。',evidenceIds:['d:2026-10-12','m:2026-10']})}}]})}}});
 assert.match(request.messages[0].content,/不得描述为已完成/);assert.match(request.messages[0].content,/不评分/);assert.equal(result.evidenceIds.length,2);
});

test('AI summary rejects unconfigured channels, invalid references, malformed output and unavailable upstream',async()=>{
 await assert.rejects(generateSummary(report,{config:{...config,token:''}}),e=>e.status===503);
 await assert.rejects(generateSummary(report,{config:{...config,enabled:false}}),e=>e.status===503);
 for(const content of ['not json',JSON.stringify({summary:'已完成',evidenceIds:['invented']}),JSON.stringify({summary:'',evidenceIds:[]})])await assert.rejects(generateSummary(report,{config,fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content}}]})})}),e=>e.status===502);
 await assert.rejects(generateSummary(report,{config,fetchImpl:async()=>{throw new Error('credentials must never leak')}}),e=>e.status===502&&!e.message.includes('credentials'));
});

test('DeepSeek summary is explicitly enabled and sends JSON mode only to the official endpoint',async()=>{
 const deepseek={provider:'deepseek',enabled:true,token:'test-only',apiUrl:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'};let called=false;
 const fetchImpl=async(url,o)=>{called=true;assert.equal(url,deepseek.apiUrl);const body=JSON.parse(o.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.deepEqual(body.thinking,{type:'disabled'});return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'按已填报设备检查整理。',evidenceIds:['d:2026-10-12']})}}]})}};
 await generateSummary(report,{config:deepseek,fetchImpl});assert.equal(called,true);called=false;
 await assert.rejects(generateSummary(report,{config:{...deepseek,enabled:false},fetchImpl}),e=>e.status===503);
 await assert.rejects(generateSummary(report,{config:{...deepseek,apiUrl:'https://untrusted.invalid/chat/completions'},fetchImpl}),e=>e.status===503);assert.equal(called,false);
});

test('HTTP summary is owner-only, revision-checked, and preserves the saved summary until accepted',async t=>{
 const {createFixture}=require('./fixtures/raw-duty-preview.cjs');let calls=0,during;
 const f=await createFixture({summaryGenerator:async r=>{calls++;if(during)await during(r);return {summary:'根据实际填报生成的测试总结',evidenceIds:summaryEvidence(r).evidence.map(e=>e.id),generatedAt:new Date().toISOString()}}});
 const server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/raw-duties`;
 const r=(await f.store.reports(require('../src/raw-duties').period().start)).find(r=>r.user_id===12);
 async function call(user,body){const res=await fetch(base+'/reports/'+r.id+'/summary',{method:'POST',headers:{Authorization:'Bearer raw-preview-'+user,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,body:await res.json()}}
 assert.equal((await call('admin',{revision:r.revision})).status,403);assert.equal((await call('worker',{revision:r.revision})).status,403);assert.equal(calls,0);
 assert.equal((await call('worker2',{revision:r.revision-1})).status,409);assert.equal(calls,0);
 const good=await call('worker2',{revision:r.revision});assert.equal(good.status,200);assert.equal(good.body.data.sourceRevision,r.revision);assert.match(good.body.data.summary,/测试总结/);assert.equal((await f.store.reportById(r.id)).summary,r.summary);
 during=async current=>{await f.store.updateReport({...current,summary:'另一标签页的新内容'},current.revision)};
 assert.equal((await call('worker2',{revision:r.revision})).status,409);assert.equal((await f.store.reportById(r.id)).summary,'另一标签页的新内容');
});

test('AI资料包含异常原因及处理进展，异常不算已完成',()=>{
 const r=structuredClone(report),c=r.checks[0].dailyRecords[0];c.result='异常';c.note='设备温度异常';c.action='已停机检查，等待维修';
 const p=summaryEvidence(r,'2026-10-15');assert.equal(p.statistics.异常,1);assert.equal(p.statistics.已完成,1);assert.equal(p.evidence[0].note,c.note);assert.equal(p.evidence[0].action,c.action);assert.equal(p.evidence[0].result,'异常');
});

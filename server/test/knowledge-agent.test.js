const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function setup(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'knowledge-agent-'));
 const config=require('../src/config'),{pool}=require('../src/db'),saved={config:config.knowledgeAi,query:pool.query};
 const state={calls:[],dbCalls:0,fail:false,row:{id:7,title:'设备维修手册',entryType:'document',revisionNo:2,contentText:'现场文件正文：检查传感器接插件是否松动，核对报警代码。',equipmentName:'输送设备',indexStatus:'ready',originalFilename:'维护手册.pdf'}};
 config.knowledgeAi={...saved.config,enabled:true,token:'PRIVATE_TEST_KEY'};
 pool.query=async sql=>{state.dbCalls++;return sql.includes('FROM fermentation_knowledge_entries')?[state.row?[{...state.row}]:[]]:[[]]};
 const audit=require('../src/ai-call-audit').createStore(root),usage=require('../src/knowledge-usage').createUsage(root),app=express();app.use(express.json());
 const fetchImpl=async(url,options)=>{state.calls.push({url,options,body:JSON.parse(options.body)});return new Response(JSON.stringify({choices:[{message:{content:'检查接插件。[知识#7]'}}],usage:{total_tokens:12}}),{status:state.fail?503:200})};
 app.use((req,_res,next)=>{const role=req.get('x-role');if(role)req.user={id:role==='admin'?1:role==='raw_grain'?2:3,role,username:'fixture'};next()});app.use((req,res,next)=>req.user?next():res.sendStatus(401));app.use('/api',require('../src/ai-call-audit').auditMiddleware(audit));app.use('/api',require('../src/routes/ai').createRouter({usage,fetchImpl}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 // Finish response/audit writes before removing the fixture directory. Separate
 // hooks previously removed it first, racing late audit writes on Windows and
 // leaving the model/config mocks unrestored for subsequent cases.
 t.after(async()=>{server.close();server.closeAllConnections();try{await audit.flush();}finally{config.knowledgeAi=saved.config;pool.query=saved.query;}await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
 const ask=async({role='admin',client='web',context,question='设备故障怎么排查？'}={})=>{const r=await fetch(base+'/api/ai/chat',{method:'POST',headers:{'x-role':role,'X-Client-Platform':client,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:question}],...(context===undefined?{}:{context})})});return {status:r.status,...await r.json()}};
 return {state,ask,usage,audit};
}
test('current-file agent reads trusted revision and body, prioritizes file evidence, and ignores browser-supplied contents',async t=>{
 const {state,ask}=await setup(t);const result=await ask({context:{entryId:7,revisionNo:2,text:'FORGED_BROWSER_CONTENT'},question:'这个怎么处理？'});assert.equal(result.status,200);const request=state.calls[0];assert.equal(request.url,'https://api.deepseek.com/chat/completions');assert.equal(request.options.headers.Authorization,'Bearer PRIVATE_TEST_KEY');assert.match(request.body.messages[0].content,/现场文件正文/);assert.match(request.body.messages[0].content,/当前打开文件/);assert.doesNotMatch(JSON.stringify(request.body),/FORGED_BROWSER_CONTENT/);assert.equal(result.data.evidence[0].context.currentFile,true);assert.equal(result.data.evidence[0].context.revisionNo,2);assert.equal(result.data.evidence[0].citation,'知识#7');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TEST_KEY/);
 assert.equal((await ask({context:{entryId:7,revisionNo:2},question:'分析这个文件'})).data.degraded,undefined);assert.equal(state.calls.length,2);
 state.row.contentText='设备正文与检查步骤。'.repeat(5000);const long=await ask({context:{entryId:7,revisionNo:2}});assert.equal(long.data.evidence[0].context.partial,true);const packed=JSON.parse(state.calls.at(-1).body.messages[0].content.split('检索证据：')[1]);assert.ok(JSON.stringify(packed).length<=30000);assert.equal(packed[0].context.currentFile,true);
});
test('permission rejection happens before retrieval or model egress; daily quota is shared across web, mini and app',async t=>{
 const {state,ask}=await setup(t);for(const role of ['viewer','invalid'])assert.equal((await ask({role})).status,403);assert.equal(state.dbCalls,0);assert.equal(state.calls.length,0);
 for(const client of ['web','miniprogram','android'])assert.equal((await ask({role:'raw_grain',client})).status,200);const blocked=await ask({role:'raw_grain'});assert.equal(blocked.status,429);assert.match(blocked.msg,/3次/);assert.equal(state.calls.length,3);
 assert.equal((await ask({role:'qu_making'})).status,200);
});
test('stale, deleted, invalid or unparsed files do not call DeepSeek or charge a quota',async t=>{
 const {state,ask,usage}=await setup(t);for(const context of [{entryId:'7',revisionNo:2},{entryId:7,revisionNo:1}])assert.ok([400,409].includes((await ask({role:'raw_grain',context})).status));
 state.row.contentText='';const unparsed=await ask({role:'raw_grain',context:{entryId:7,revisionNo:2}});assert.equal(unparsed.data.degraded,true);assert.match(unparsed.data.answer,/尚未提取/);assert.equal((await usage.usage({id:2,role:'raw_grain'})).used,0);
 state.row=null;assert.equal((await ask({context:{entryId:7,revisionNo:2}})).status,404);assert.equal(state.calls.length,0);
});
test('admin bypasses AI-specific count limit; model failures and unrelated questions remain uncharged and audited',async t=>{
 const {state,ask,audit,usage}=await setup(t);for(let i=0;i<21;i++)assert.equal((await ask()).status,200);
 state.fail=true;assert.equal((await ask({role:'raw_grain'})).data.degraded,true);assert.equal((await usage.usage({id:2,role:'raw_grain'})).used,0);
 assert.equal((await ask({role:'raw_grain',question:'今天的天气如何？'})).data.restricted,true);const logs=await audit.list();assert.equal(logs.items.filter(i=>i.outcome==='fallback').length,1);assert.equal(logs.items.filter(i=>i.outcome==='restricted').length,1);assert.doesNotMatch(JSON.stringify(logs),/现场文件正文|PRIVATE_TEST_KEY/);
});

test('knowledge calls use the next compatible configuration and audit its real provider',async t=>{
 const {state,ask,audit}=await setup(t),config=require('../src/config');
 Object.assign(config.knowledgeAi,{provider:'openai-compatible',apiUrl:'https://api.provider.com/v1/chat/completions',model:'gpt-5-mini',token:'COMPATIBLE_TEST_KEY'});
 assert.equal((await ask()).data.degraded,undefined);const first=state.calls.at(-1);assert.equal(first.url,config.knowledgeAi.apiUrl);assert.equal(first.options.headers.Authorization,'Bearer COMPATIBLE_TEST_KEY');assert.equal(first.body.max_completion_tokens,4000);
 for(const key of ['thinking','temperature','tool_choice','response_format','max_tokens'])assert.equal(first.body[key],undefined,key);
 Object.assign(config.knowledgeAi,{model:'other-text-model',token:'NEXT_TEST_KEY'});await ask();assert.equal(state.calls.at(-1).body.model,'other-text-model');assert.equal(state.calls.at(-1).body.max_tokens,4000);assert.equal(state.calls.at(-1).options.headers.Authorization,'Bearer NEXT_TEST_KEY');
 const records=await audit.list();assert.equal(records.items.length,2);assert.ok(records.items.every(row=>row.provider==='openai-compatible'));assert.doesNotMatch(JSON.stringify(records),/COMPATIBLE_TEST_KEY|NEXT_TEST_KEY/);
});

test('current spare documents pass manufacturer, source pages and unresolved differences to AI evidence',async t=>{
 const {state,ask}=await setup(t);
 state.row.category='备件资料';
 state.row.referenceMetadata=JSON.stringify({family:'气动元件',manufacturer:'AirTAC',models:['SC40'],sourceUrl:'https://www.airtac.com/manual.pdf',sourcePages:'PDF第3页 / 印刷39页',verification:'partial',verifiedScope:'外露拉杆与主尺寸',limitations:'未核实安装附件'});
 const result=await ask({context:{entryId:7,revisionNo:2},question:'这个气缸安装要注意什么？'});
 assert.equal(result.status,200);
 const evidence=result.data.evidence[0];
 assert.equal(evidence.context.referenceMetadata.manufacturer,'AirTAC');
 assert.equal(evidence.context.referenceMetadata.sourcePages,'PDF第3页 / 印刷39页');
 assert.match(state.calls[0].body.messages[0].content,/跨品牌同号不得默认为可替换/);
 assert.match(state.calls[0].body.messages[0].content,/未核实安装附件/);
});

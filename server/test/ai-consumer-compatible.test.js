const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');
const {modelOptions}=require('../src/ai-provider-payload');
const R=require('../src/fire-recognition'),{generateSummary,summaryEvidence}=require('../src/raw-duty-ai-summary'),A=require('../src/robot-agent');
const compatible={enabled:true,provider:'openai-compatible',transport:'openai-compatible',apiUrl:'https://api.provider.com/v1/chat/completions',token:'TEST_ONLY_COMPATIBLE_KEY',model:'gpt-5-mini',visionEnabled:true,timeoutMs:1000};
const report={sha256:'fixture-backup',statistics:{},files:[{id:'main',path:'Main.mod',kind:'program',readable:true,lineCount:3,text:'MODULE Main\nWaitTime 1;\nENDMODULE',routines:[]}]};
const robotAnswer={summary:'等待一秒',sections:[{title:'流程',content:'第二行等待一秒。',refs:[{fileId:'main',startLine:2,endLine:2}]}],annotations:[],changes:[],questions:[]};
function card(){return {cardCount:1,cardComplete:true,deviceCode:'005',deviceType:'extinguisher',typeConfidence:0.99,codeConfidence:0.99,year:2026,cardYearText:'2026',yearConfidence:0.99,month:10,rowLabel:'10月',rowConfidence:0.99,checks:R.CHECKS.extinguisher.map(([key,name])=>({key,name,mark:'√',confidence:0.99})),concerns:[]};}
function minimal(body,budget){assert.equal(body.model,compatible.model);assert.equal(body.max_completion_tokens,budget);for(const key of ['thinking','temperature','tool_choice','tools','response_format','max_tokens'])assert.equal(body[key],undefined,key);assert.equal(body.stream,false);}
const response=content=>new Response(JSON.stringify({choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content)}}]}));

test('compatible payloads omit provider extensions and use reasoning-model token budgets',()=>{
 assert.deepEqual(modelOptions(compatible,{maxTokens:100,temperature:0.2,json:true}),{max_completion_tokens:100});
 for(const model of ['o1','o3-mini','o4-mini','gpt-5.2'])assert.deepEqual(modelOptions({...compatible,model},{maxTokens:100}),{max_completion_tokens:100});
 assert.deepEqual(modelOptions({...compatible,model:'other-text-model'},{maxTokens:100,temperature:0,json:true}),{max_tokens:100});
 assert.deepEqual(modelOptions({provider:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions'},{maxTokens:100,json:true,temperature:0}),{max_tokens:100,thinking:{type:'disabled'},temperature:0,response_format:{type:'json_object'}});
 assert.equal(A.validChannel(compatible),true);assert.equal(A.validChannel({...compatible,apiUrl:'http://127.0.0.1/chat/completions'}),false);
});

test('fire, weekly summary and robot calls accept compatible models while keeping evidence validation',async()=>{
 let calls=0;
 const fire=await R.recognizePhoto(Buffer.from('isolated-image'),'2026-10',{config:compatible,fetchImpl:async(url,options)=>{calls++;assert.equal(url,compatible.apiUrl);const body=JSON.parse(options.body);minimal(body,3500);assert.match(body.messages[1].content[1].image_url.url,/^data:image\/jpeg;base64,/);assert.equal(body.messages[1].content[1].image_url.detail,undefined);return response(card());}});
 assert.equal(fire.result,'normal');assert.equal(fire.model,compatible.model);
 await assert.rejects(R.recognizePhoto(Buffer.from('isolated'),'2026-10',{config:{...compatible,visionEnabled:false},fetchImpl:async()=>assert.fail('disabled image channel must not call')}),e=>e.status===503);
 const weekly={week_start:'2026-10-12',template:{entries:[{id:'d',title:'检查设备',frequency:'每周'}]},checks:[{dutyId:'d',result:'已完成',note:'检查并登记'}]};
 const id=summaryEvidence(weekly).evidence[0].id;
 const summary=await generateSummary(weekly,{config:compatible,fetchImpl:async(_url,options)=>{calls++;minimal(JSON.parse(options.body),2600);return response({summary:'设备检查已登记。',evidenceIds:[id]});}});assert.deepEqual(summary.evidenceIds,[id]);
 await assert.rejects(generateSummary(weekly,{config:compatible,fetchImpl:async()=>response({summary:'虚构资料',evidenceIds:['invented']})}),e=>e.status===502);
 const analyzed=await A.analyze(report,{config:compatible,fetchImpl:async(_url,options)=>{calls++;minimal(JSON.parse(options.body),14000);return response(robotAnswer);}});assert.equal(analyzed.model,compatible.model);
 await assert.rejects(A.analyze(report,{config:compatible,fetchImpl:async()=>response({...robotAnswer,sections:[{title:'虚构行号',content:'错误依据',refs:[{fileId:'main',startLine:99,endLine:99}]}]})}),e=>e.status===502);
 const checked=await A.checkConnection(compatible,{fetchImpl:async(_url,options)=>{minimal(JSON.parse(options.body),512);return response('OK');}});assert.equal(checked.ready,true);assert.equal(calls,3);
});

test('private override changes are read by all consumer getters without restarting the process',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ai-consumer-hot-')),file=path.join(directory,'settings.env');
 const names=['AI_SETTINGS_FILE','ROBOT_AGENT_ENABLED','FIRE_PHOTO_AI_ENABLED','KNOWLEDGE_AI_MODEL','RAW_DUTY_AI_MODEL','ROBOT_AGENT_MODEL','FIRE_PHOTO_AI_MODEL'],before=Object.fromEntries(names.map(n=>[n,process.env[n]]));
 t.after(async()=>{for(const name of names)if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];await fs.rm(directory,{recursive:true,force:true});});
 Object.assign(process.env,{AI_SETTINGS_FILE:file,ROBOT_AGENT_ENABLED:'true',FIRE_PHOTO_AI_ENABLED:'true',KNOWLEDGE_AI_MODEL:'legacy-knowledge',RAW_DUTY_AI_MODEL:'legacy-summary',ROBOT_AGENT_MODEL:'legacy-robot',FIRE_PHOTO_AI_MODEL:'deepseek-flash'});
 const config=require('../src/config');assert.equal(config.knowledgeAi.model,'legacy-knowledge');assert.equal(config.rawDutyAiSummary.model,'legacy-summary');assert.equal(A.agentConfig().model,'legacy-robot');
 const write=(model,vision)=>fs.writeFile(file,`AI_PROVIDER=openai-compatible\nAI_ENDPOINT=${compatible.apiUrl}\nAI_MODEL=${model}\nAI_API_KEY=TEST_ONLY_${model.replace(/[^a-z0-9]/gi,'_')}_KEY\nAI_VISION_ENABLED=${vision}\n`,{mode:0o600});
 await write('model-first',true);
 for(const current of [config.knowledgeAi,config.rawDutyAiSummary,A.agentConfig(),R.configuration()]){assert.equal(current.model,'model-first');assert.equal(current.apiUrl,compatible.apiUrl);assert.match(current.token,/TEST_ONLY_model_first/);}
 assert.equal(R.configuration().enabled,true);
 let revision=1;const seen=[],library={root:directory,get:async()=>({id:'a',revision,report,history:[]}),exclusive:async(_id,run)=>run(),saveResult:async(_id,_revision,result)=>({...result,revision:++revision})};
 const usage={usage:async()=>({}),execute:async(_actor,_scope,run)=>({value:await run(),quota:{}})};
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:1,role:'admin'};next()});app.use('/robot',require('../src/routes/robot-program').createRouter({library,usage,checkConnectionImpl:async c=>{seen.push(c);return {ready:true}},analyzeImpl:async(_r,{config:c})=>{seen.push(c);return {...robotAnswer,sourceHash:report.sha256,mode:'analyze'}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();server.closeAllConnections()});const base=`http://127.0.0.1:${server.address().port}/robot`;
 assert.equal((await(await fetch(base+'/status')).json()).data.model,'model-first');
 await write('model-second',false);
 assert.equal((await(await fetch(base+'/status')).json()).data.model,'model-second');
 for(const route of ['/connection-check','/library/a/analyze'])assert.equal((await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,question:'解释第二行'})})).status,200);
 assert.equal(seen.length,2);assert.ok(seen.every(c=>c.model==='model-second'&&/TEST_ONLY_model_second/.test(c.token)));
 for(const current of [config.knowledgeAi,config.rawDutyAiSummary,A.agentConfig(),R.configuration()])assert.equal(current.model,'model-second');
 assert.equal(R.configuration().enabled,false);assert.match(R.configuration().reason,/联系管理员配置/);
});

test('balance reads never send a compatible provider key to the old DeepSeek or GLM endpoints',async()=>{
 let settings={...compatible},calls=[];
 const service=require('../src/personal-usage').createUsageService({env:{DEEPSEEK_API_KEY:'OLD_DEEP_KEY',GLM_API_KEY:'OLD_GLM_KEY'},settingsReader:()=>settings,codexReader:async()=>({status:'unconfigured'}),fetchImpl:async(url,options)=>{calls.push({url,authorization:options.headers.Authorization});return new Response(JSON.stringify(url.includes('deepseek')?{is_available:true,balance_infos:[{currency:'CNY',total_balance:'1'}]}:{success:true,data:{availableBalance:1}}));}});
 const generic=await service.read();assert.equal(generic.activeProvider,'openai-compatible');assert.equal(generic.deepseek.status,'unconfigured');assert.equal(calls.length,1);assert.equal(calls[0].authorization,'OLD_GLM_KEY');
 settings={...settings,provider:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions',token:'NEW_DEEP_ONLY_KEY'};
 const changed=await service.read();assert.equal(changed.deepseek.status,'ok');assert.ok(calls.some(c=>c.url==='https://api.deepseek.com/user/balance'&&c.authorization==='Bearer NEW_DEEP_ONLY_KEY'));assert.ok(!calls.some(c=>c.authorization.includes(compatible.token)));assert.doesNotMatch(JSON.stringify(changed),/KEY/);
});

test('default model transport rejects unsafe addresses before any network request',async()=>{
 await assert.rejects(require('../src/ai-call-audit').modelFetch('http://127.0.0.1/chat/completions',{method:'POST',body:'{}'}),e=>e.status===400);
});

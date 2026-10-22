const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {once,EventEmitter}=require('node:events');
async function listen(t,app){const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.close();server.closeAllConnections()});return 'http://127.0.0.1:'+server.address().port}
test('own profile edits preserve identity, role and workshop; forged privilege and account fields never reach SQL',async t=>{
 const {pool}=require('../src/db'),old=pool.query,changes=[];
 pool.query=async(sql,args)=>{if(sql.includes('FROM app_sessions'))return [[{id:11,username:'worker',display_name:'旧姓名',role:'viewer',staff_workshop_code:'raw_grain',staff_position:'employee',enabled:1,session_id:22}]];if(sql==='UPDATE app_users SET display_name = ? WHERE id = ?'){changes.push(args);return [{affectedRows:1}]};throw Error('Unexpected SQL')};t.after(()=>{pool.query=old});
 const app=express();app.use(express.json());app.use('/api/auth',require('../src/routes/auth'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));const base=await listen(t,app),headers={Authorization:'Bearer '+'a'.repeat(43),'Content-Type':'application/json'};
 for(const body of [{displayName:'x',role:'admin'},{displayName:'x',id:1},{displayName:'x',workshopCode:'brewing'},{displayName:''},{displayName:'x'.repeat(51)},{displayName:{value:'x'}},[]])assert.equal((await fetch(base+'/api/auth/profile',{method:'PATCH',headers,body:JSON.stringify(body)})).status,400);
 assert.equal(changes.length,0);assert.equal((await fetch(base+'/api/auth/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"displayName":"姓名"}'})).status,401);
 const result=await fetch(base+'/api/auth/profile',{method:'PATCH',headers,body:'{"displayName":" 新姓名 "}'});assert.equal(result.status,200);const user=(await result.json()).data.user;assert.equal(user.id,'11');assert.equal(user.role,'viewer');assert.equal(user.staffWorkshopCode,'raw_grain');assert.equal(user.displayName,'新姓名');assert.deepEqual(changes,[['新姓名','11']]);
});
test('every non-admin is rejected before usage reads or any external request; responses are private',async t=>{
 let reads=0;const app=express();app.use((req,_res,next)=>{if(req.get('Authorization'))req.user={role:req.get('Authorization')};next()});app.use('/api/personal-usage',require('../src/routes/personal-usage').createRouter({read:async()=>{reads++;return {ok:true}}},{list:async()=>{reads++;return {providers:{},summary:{}}}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));const base=await listen(t,app);
 for(const route of ['providers','records-summary'])for(const role of ['', 'viewer','raw_grain','qu_making','brewing']){const r=await fetch(base+'/api/personal-usage/'+route,{headers:role?{Authorization:role}:{}});assert.equal(r.status,role?403:401);assert.match(r.headers.get('cache-control'),/no-store/)}
 assert.equal(reads,0);assert.equal((await fetch(base+'/api/personal-usage/providers',{headers:{Authorization:'admin'}})).status,200);assert.equal(reads,1);
});
test('provider reads use fixed official endpoints, sanitize data and errors, share concurrent cache, and keep unknown usage unknown',async()=>{
 const calls=[],env={DEEPSEEK_API_KEY:'SECRET_DEEP',GLM_API_KEY:'SECRET_GLM'},service=require('../src/personal-usage').createUsageService({env,codexReader:async()=>({status:'unconfigured'}),fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('deepseek')?{is_available:true,balance_infos:[{currency:'CNY',total_balance:'10.04',granted_balance:'0.00',topped_up_balance:'10.04',secret:'NOT_PUBLIC'}]}:{success:true,data:{availableBalance:9.898829,totalSpendAmount:0.101171,key:'NOT_PUBLIC',customer:'NOT_PUBLIC'}}))}});
 const results=await Promise.all([service.read(),service.read()]);assert.equal(calls.length,2);assert.equal(results[0],results[1]);await service.read();assert.equal(calls.length,2);assert.equal(calls[0].url,'https://api.deepseek.com/user/balance');assert.equal(calls[0].options.headers.Authorization,'Bearer SECRET_DEEP');assert.equal(calls[1].url,'https://open.bigmodel.cn/api/biz/account/query-customer-account-report');assert.equal(calls[1].options.headers.Authorization,'SECRET_GLM');assert.equal(calls[1].options.redirect,'error');assert.equal(results[0].glm.balance,'9.898829');assert.equal(results[0].glm.totalSpent,'0.101171');assert.equal(results[0].glm.todaySpent,null);assert.equal(results[0].glm.limits,undefined);assert.ok(!JSON.stringify(results).includes('SECRET'));assert.ok(!JSON.stringify(results).includes('NOT_PUBLIC'));
 const failed=await require('../src/personal-usage').createUsageService({env,fetchImpl:async()=>{throw Error('SECRET_DEEP')},codexReader:async()=>{throw Error('ACCESS_TOKEN')}}).read();assert.equal(failed.deepseek.status,'unavailable');assert.equal(failed.codex.status,'unavailable');assert.ok(!JSON.stringify(failed).includes('SECRET_DEEP'));assert.ok(!JSON.stringify(failed).includes('ACCESS_TOKEN'));
 const unsupported=await require('../src/personal-usage').createUsageService({env,fetchImpl:async()=>new Response('{"success":false,"code":500,"msg":"SECRET"}'),codexReader:async()=>({status:'unconfigured'})}).read();assert.equal(unsupported.glm.status,'unavailable');assert.ok(!JSON.stringify(unsupported).includes('SECRET'));
});
test('GLM API account accepts zero balance, preserves decimal amounts and rejects missing or malformed account data',async()=>{
 const read=async json=>(await require('../src/personal-usage').createUsageService({env:{GLM_API_KEY:'SECRET_GLM'},codexReader:async()=>({status:'unconfigured'}),fetchImpl:async()=>new Response(JSON.stringify(json))}).read()).glm;
 const zero=await read({success:true,data:{availableBalance:0,totalSpendAmount:'0.123456',todaySpendAmount:0}});assert.equal(zero.status,'ok');assert.equal(zero.balance,'0');assert.equal(zero.totalSpent,'0.123456');assert.equal(zero.todaySpent,'0');
 for(const json of [{success:false,data:{availableBalance:1}},{success:true},{success:true,data:{totalSpendAmount:2}},{success:true,data:{availableBalance:'PRIVATE'}},{success:true,data:{availableBalance:null}}]){const result=await read(json);assert.equal(result.status,'unavailable');assert.equal(result.balance,undefined);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET/)}
});
test('Codex bridge sends only initialize and read methods and exposes no identity, credentials or raw output',async()=>{
 const sent=[],child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{};
 child.stdin.write=line=>{const m=JSON.parse(line);sent.push(m);queueMicrotask(()=>{if(m.id===1)child.stdout.emit('data',Buffer.from(JSON.stringify({id:1,result:{}})+'\n'));if(m.id===2)child.stdout.emit('data',Buffer.from(JSON.stringify({id:2,result:{rateLimitsByLimitId:{codex:{limitId:'codex',primary:{usedPercent:8,windowDurationMins:10080,resetsAt:1792904485},email:'PRIVATE'}}}})+'\n'));if(m.id===3)child.stdout.emit('data',Buffer.from(JSON.stringify({id:3,result:{summary:{lifetimeTokens:123,identity:'PRIVATE'},token:'SECRET'}})+'\n'))})};
 const data=await require('../src/codex-usage').readLocal({executable:'codex',spawnImpl:(exe,args,options)=>{assert.equal(exe,'codex');assert.deepEqual(args,['app-server']);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);return child}});
 assert.deepEqual(sent.map(m=>m.method),['initialize','initialized','account/rateLimits/read','account/usage/read']);assert.equal(data.windows[0].usedPercent,8);assert.equal(data.summary.lifetimeTokens,123);assert.equal(data.summary.peakDailyTokens,null);assert.doesNotMatch(JSON.stringify(data),/PRIVATE|SECRET/);
});
test('Codex lifetime-usage failures preserve separately returned quota windows in either reply order',async()=>{
 for(const usageFirst of [true,false]){
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{};const requests=[];
  child.stdin.write=line=>{const m=JSON.parse(line);requests.push(m.method);queueMicrotask(()=>{
   if(m.id===1)child.stdout.emit('data',Buffer.from(JSON.stringify({id:1,result:{}})+'\n'));
   if(m.id===3){const replies=[{id:2,result:{rateLimits:{primary:{usedPercent:11,windowDurationMins:10080}}}},{id:3,error:{code:-32603,message:'PRIVATE_USAGE_ERROR'}}];if(usageFirst)replies.reverse();for(const reply of replies)child.stdout.emit('data',Buffer.from(JSON.stringify(reply)+'\n'))}
  })};
  const data=await require('../src/codex-usage').readLocal({spawnImpl:()=>child});assert.equal(data.windows[0].usedPercent,11);assert.equal(data.summary.lifetimeTokens,null);assert.doesNotMatch(JSON.stringify(data),/PRIVATE/);assert.deepEqual(requests,['initialize','initialized','account/rateLimits/read','account/usage/read']);
 }
});
test('Codex quota errors preserve valid cumulative usage while two failed reads remain unavailable',async()=>{
 for(const bothFail of [false,true]){
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.end=()=>{};child.kill=()=>{};
  child.stdin.write=line=>{const m=JSON.parse(line);queueMicrotask(()=>{
   const reply=m.id===1?{id:1,result:{}}:m.id===2?{id:2,error:{code:-32603,message:'PRIVATE_RATE_ERROR'}}:m.id===3?(bothFail?{id:3,error:{code:-32603,message:'PRIVATE_USAGE_ERROR'}}:{id:3,result:{summary:{lifetimeTokens:1234}}}):null;
   if(reply)child.stdout.emit('data',Buffer.from(JSON.stringify(reply)+'\n'));
  })};
  const pending=require('../src/codex-usage').readLocal({spawnImpl:()=>child});
  if(bothFail)await assert.rejects(pending,/Codex usage unavailable/);else{const data=await pending;assert.equal(data.windows.length,0);assert.equal(data.summary.lifetimeTokens,1234);assert.doesNotMatch(JSON.stringify(data),/PRIVATE/)}
 }
});

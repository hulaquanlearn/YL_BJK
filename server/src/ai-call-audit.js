const {AsyncLocalStorage}=require('node:async_hooks'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {ApiError,asyncHandler}=require('./utils');
const context=new AsyncLocalStorage(),stores=new WeakMap();
const day=value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10);
const clients=['web','miniprogram','android','unknown'];
const features=['knowledge_chat','raw_summary','robot_annotation_start','robot_annotations','robot_question','robot_modify','robot_connection'];
const outcomes=['pending','success','failed','blocked','fallback','restricted','interrupted'];
function featureFor(req){
 if(req.method!=='POST')return null;
 if(req.path==='/ai/chat')return 'knowledge_chat';
 if(/^\/raw-duties\/reports\/\d+\/summary$/.test(req.path))return 'raw_summary';
 if(req.path==='/robot-program/connection-check')return 'robot_connection';
 if(/^\/robot-program\/library\/[^/]+\/annotation-run$/.test(req.path))return 'robot_annotation_start';
 if(/^\/robot-program\/library\/[^/]+\/analyze$/.test(req.path))return req.body?.target?'robot_annotations':req.body?.mode==='modify'?'robot_modify':'robot_question';
 return null;
}
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function noteUsage(envelope){const current=context.getStore();if(!current)return;const u=envelope?.usage;if(!u||typeof u!=='object')return;current.promptTokens=count(u.prompt_tokens);current.completionTokens=count(u.completion_tokens);current.totalTokens=count(u.total_tokens)??(current.promptTokens!==null&&current.completionTokens!==null?current.promptTokens+current.completionTokens:null);current.cachedTokens=count(u.prompt_cache_hit_tokens)}
function noteOutcome(value){if(context.getStore()&&outcomes.includes(value))context.getStore().outcome=value}
function noteRobotMode(mode){const row=context.getStore();if(row&&['robot_question','robot_modify'].includes(row.feature)&&['analyze','modify'].includes(mode))row.feature=mode==='modify'?'robot_modify':'robot_question'}
function noteOperation(value){if(context.getStore()&&typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value))context.getStore().operationId=value}
async function modelFetch(url,options,fetchImpl=fetch){
 const current=context.getStore();
 if(current){current.modelCalls++;current.provider=String(url).startsWith('https://api.deepseek.com/')?'deepseek':/^https:\/\/(?:open\.bigmodel\.cn|api\.z\.ai)\//.test(String(url))?'glm':'unknown';try{current.model=String(JSON.parse(options.body).model||'').slice(0,120)}catch{};
  try{await stores.get(current).write({...current})}catch{current.modelCalls--;throw new ApiError(503,'AI 调用记录暂不可写，本次尚未调用模型，请联系管理员')}
 }
 try{const response=await fetchImpl(url,options);if(current)current.upstreamStatus=Number.isInteger(response.status)?response.status:null;return response}
 catch(error){if(current)current.failureType=error.name==='AbortError'?'timeout':'network';throw error}
}
function createStore(root=process.env.AI_AUDIT_DIR||path.resolve(__dirname,'../uploads/ai-call-logs')){
 root=path.resolve(root);const pending=new Set();
 async function write(row){const folder=path.join(root,day(row.startedAt));await fs.mkdir(folder,{recursive:true,mode:0o700});const file=path.join(folder,row.id+'.json'),tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(row),{flag:'wx',mode:0o600});await fs.rename(tmp,file)}finally{await fs.unlink(tmp).catch(()=>{})}}
 function finish(row){const promise=write(row);pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise}
 async function flush(){await Promise.all([...pending])}
 function date(value,fallback){const text=String(value||fallback);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text+'T00:00:00Z'))||new Date(text+'T00:00:00Z').toISOString().slice(0,10)!==text)throw new ApiError(400,'日期无效');return text}
 async function list(query={}){
  await flush();const today=day(new Date()),from=date(query.from,today),to=date(query.to,from),span=(Date.parse(to)-Date.parse(from))/86400000;
  if(span<0||span>30)throw new ApiError(400,'每次可查询连续31天，请调整日期范围');
  for(const [key,allowed]of [['client',clients],['feature',features],['outcome',outcomes]])if(query[key]&&!allowed.includes(query[key]))throw new ApiError(400,'筛选条件无效');
  const page=Math.max(1,Number.parseInt(query.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(query.pageSize,10)||20)),actor=String(query.actor||'').trim().toLowerCase();let rows=[];
  for(let offset=0;offset<=span;offset++){
   const folder=path.join(root,new Date(Date.parse(from)+offset*86400000).toISOString().slice(0,10));let names;try{names=await fs.readdir(folder)}catch(e){if(e.code==='ENOENT')continue;throw e}
   const namesToRead=names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n));
   for(let start=0;start<namesToRead.length;start+=16)rows.push(...await Promise.all(namesToRead.slice(start,start+16).map(async name=>{const row=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));if(row.schema!==1||!outcomes.includes(row.outcome))throw Error('Invalid AI audit record');return row})));
  }
  rows=rows.filter(r=>(!query.client||r.client===query.client)&&(!query.feature||r.feature===query.feature)&&(!query.outcome||r.outcome===query.outcome)&&(!actor||[r.accountId,r.username,r.displayName].some(v=>String(v).toLowerCase().includes(actor)))).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id));
  const providers={};
  for(const row of rows){if(!row.provider)continue;const p=providers[row.provider]??={modelCalls:0,totalTokens:0,unknownTokenCalls:0};p.modelCalls+=row.modelCalls;if(row.totalTokens!==null)p.totalTokens+=row.totalTokens;else p.unknownTokenCalls+=row.modelCalls}
  const summary={requests:rows.length,modelCalls:0,success:0,failed:0,blocked:0,totalTokens:0,unknownTokenCalls:0};
  for(const row of rows){summary.modelCalls+=row.modelCalls;if(row.outcome==='success')summary.success++;if(['failed','interrupted'].includes(row.outcome))summary.failed++;if(['blocked','restricted'].includes(row.outcome))summary.blocked++;if(row.totalTokens!==null)summary.totalTokens+=row.totalTokens;else summary.unknownTokenCalls+=row.modelCalls}
  return {from,to,page,pageSize,total:rows.length,summary,providers,items:rows.slice((page-1)*pageSize,page*pageSize)};
 }
 return {root,write,finish,flush,list};
}
const defaultStore=createStore();
function auditMiddleware(store=defaultStore){return asyncHandler(async(req,res,next)=>{
 const feature=featureFor(req);if(!feature)return next();
 const reported=req.get('X-Client-Platform'),client=clients.includes(reported)?reported:'unknown';
 const row={schema:1,id:crypto.randomUUID(),startedAt:new Date().toISOString(),finishedAt:null,accountId:String(req.user.id),username:String(req.user.username||'').slice(0,100),displayName:String(req.user.displayName||'').slice(0,100),role:req.user.role,client,feature,operationId:typeof req.body?.runId==='string'&&/^[a-f0-9-]{36}$/.test(req.body.runId)?req.body.runId:null,outcome:'pending',modelCalls:0,provider:null,model:null,promptTokens:null,completionTokens:null,totalTokens:null,cachedTokens:null,upstreamStatus:null,failureType:null,httpStatus:null,durationMs:null};
 try{await store.write(row)}catch{throw new ApiError(503,'AI 调用记录暂不可写，本次尚未调用模型，请联系管理员')}
 stores.set(row,store);
 let finished=false;const started=Date.now();
 function finish(interrupted=false){if(finished)return;finished=true;row.finishedAt=new Date().toISOString();row.durationMs=Math.max(0,Date.now()-started);row.httpStatus=interrupted?null:res.statusCode;row.outcome=interrupted?'interrupted':res.statusCode>=400?(res.statusCode<500?'blocked':'failed'):row.outcome==='pending'?'success':row.outcome;store.finish({...row}).catch(()=>console.error('AI audit finalization failed:',row.id))}
 res.once('finish',()=>finish());res.once('close',()=>{if(!res.writableFinished)finish(true)});
 context.run(row,next);
})}
module.exports={createStore,defaultStore,auditMiddleware,modelFetch,noteUsage,noteOutcome,noteOperation,noteRobotMode,features,clients,outcomes};

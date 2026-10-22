const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {ApiError}=require('./utils');
const {workshopForRole}=require('./workshop-scope');
const LIMIT=3,active=new Set();
const BATCH_QUESTION='结合完整程序与信号配置，只解释本批次行范围：关键变量、例程目的、调用、等待、I/O与异常路径。本范围内每个例程至少给出一条目的与条件说明；最多80条简洁中文注释，区分源码事实、名称推测、现场待确认，不根据点位名称或轴配置断言工具朝向。';
const canAnalyze=user=>user?.role==='admin'||Boolean(workshopForRole(user?.role));
function windowAt(now){const time=new Date(now);if(!Number.isFinite(time.getTime()))throw Error('Invalid quota clock');const date=new Date(time.getTime()+8*3600000).toISOString().slice(0,10);return {date,resetAt:new Date(Date.parse(date+'T00:00:00+08:00')+86400000).toISOString()}}
const targetKey=t=>`${t.fileId}:${t.startLine}-${t.endLine}`;
function annotationPlan(saved,{scope='full',fileId}={}){
 if(!['full','missing'].includes(scope))throw new ApiError(400,'注释范围无效');
 let files=saved.report.files.filter(f=>f.readable&&f.kind==='program');
 if(scope==='missing'){files=files.filter(f=>f.id===fileId);if(!files.length)throw new ApiError(400,'请选择可读程序文件')}
 const plan=[];
 for(const file of files){
  const notes=(saved.analysis?.annotations||[]).filter(a=>a.fileId===file.id);
  const ranges=scope==='full'?[{startLine:1,endLine:file.lineCount}]:file.routines.filter(r=>!notes.some(n=>n.line>=r.startLine&&n.line<=r.endLine));
  for(const range of ranges)for(let startLine=range.startLine;startLine<=range.endLine;startLine+=150){const target={fileId:file.id,startLine,endLine:Math.min(startLine+149,range.endLine)},key=targetKey(target);if(scope==='missing'||saved.batchState?.[key]?.status!=='done')plan.push({...target,key})}
 }
 return plan;
}
function createUsage(libraryRoot,{now=()=>new Date()}={}){
 const root=path.resolve(libraryRoot,'.usage');
 function filename(user){if(!canAnalyze(user)||!/^[1-9]\d*$/.test(String(user.id)))throw new ApiError(403,'仅系统管理员和车间管理员可以调用机器人分析');return path.join(root,String(user.id)+'.json')}
 async function load(user){try{const value=JSON.parse(await fs.readFile(filename(user),'utf8'));if(value.schema!==1||value.accountId!==String(user.id)||!Array.isArray(value.entries))throw Error('Invalid usage ledger');return value}catch(e){if(e.code==='ENOENT')return {schema:1,accountId:String(user.id),entries:[]};throw e}}
 async function save(user,ledger){
  // Keep today's charges and unfinished annotation runs for 30 days. No credentials or program text.
  const today=windowAt(now()).date,cutoff=new Date(new Date(now()).getTime()-30*86400000).toISOString();
  ledger.entries=ledger.entries.filter(e=>e.day===today||e.kind==='annotations'&&e.createdAt>=cutoff&&e.done.length<e.plan.length);
  await fs.mkdir(root,{recursive:true,mode:0o700});const file=filename(user),tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify(ledger),{flag:'wx',mode:0o600});await fs.rename(tmp,file)}finally{await fs.unlink(tmp).catch(()=>{})}
 }
 function status(user,ledger){const w=windowAt(now()),unlimited=user.role==='admin',used=unlimited?0:ledger.entries.filter(e=>e.charged&&e.day===w.date).length;return {...w,unlimited,limit:unlimited?null:LIMIT,used,remaining:unlimited?null:Math.max(0,LIMIT-used)}}
 async function usage(user){return status(user,user.role==='admin'?{entries:[]}:await load(user))}
 async function exclusive(user,fn){const key=filename(user);if(active.has(key))throw new ApiError(429,'当前账号已有程序分析正在进行');active.add(key);try{return await fn()}finally{active.delete(key)}}
 async function startAnnotations(user,saved,options={}){
  const plan=annotationPlan(saved,options);if(!plan.length)throw new ApiError(400,'所选范围没有待生成的注释批次');
  if(user.role==='admin')return {id:null,plan,quota:await usage(user)};
  return exclusive(user,async()=>{
   const ledger=await load(user),scope=options.scope||'full',fileId=scope==='missing'?options.fileId:null;
   let entry=ledger.entries.find(e=>e.kind==='annotations'&&e.backupId===saved.id&&e.scope===scope&&e.fileId===fileId&&e.done.length<e.plan.length&&e.createdAt>=new Date(new Date(now()).getTime()-30*86400000).toISOString());
   if(!entry){if(status(user,ledger).remaining<=0)throw new ApiError(429,'今日机器人分析已达3次上限，请北京时间零点后再试；未完成的注释可继续');entry={id:crypto.randomUUID(),kind:'annotations',backupId:saved.id,scope,fileId,plan,done:[],charged:false,day:null,createdAt:new Date(now()).toISOString()};ledger.entries.push(entry);await save(user,ledger)}
   const available=new Set(plan.map(targetKey));return {id:entry.id,plan:entry.plan.filter(t=>!entry.done.includes(t.key)&&available.has(t.key)),quota:status(user,ledger)};
  });
 }
 async function execute(user,{backupId,runId=null,target=null},fn){
  if(user.role==='admin')return {value:await fn(),quota:await usage(user)};
  return exclusive(user,async()=>{
   const ledger=await load(user);let entry;
   if(runId){entry=ledger.entries.find(e=>e.id===runId&&e.kind==='annotations'&&e.backupId===backupId);if(!entry||entry.createdAt<new Date(new Date(now()).getTime()-30*86400000).toISOString()||!target||!entry.plan.some(t=>t.key===targetKey(target)))throw new ApiError(400,'注释任务或批次无效，请重新开始');if(entry.done.includes(targetKey(target)))throw new ApiError(409,'本批次已生成，请刷新后继续未完成批次')}
   else{if(target)throw new ApiError(400,'分批注释请先创建注释任务');entry={id:crypto.randomUUID(),kind:'single',backupId,createdAt:new Date(now()).toISOString(),charged:false};ledger.entries.push(entry)}
   const newCharge=!entry.charged;
   if(newCharge){if(status(user,ledger).remaining<=0)throw new ApiError(429,'今日机器人分析已达3次上限，请北京时间零点后再试');entry.charged=true;entry.day=windowAt(now()).date}
   // Charge before the upstream call. A restart cannot erase a pending charge.
   entry.pending=true;await save(user,ledger);
   let value;
   try{value=await fn()}
   catch(error){entry.pending=false;if(newCharge)entry.charged=false;if(entry.kind==='single')ledger.entries=ledger.entries.filter(e=>e!==entry);await save(user,ledger);throw error}
   entry.pending=false;if(target)entry.done.push(targetKey(target));await save(user,ledger);
   return {value,quota:status(user,ledger)};
  });
 }
 return {usage,startAnnotations,execute};
}
module.exports={LIMIT,BATCH_QUESTION,canAnalyze,windowAt,targetKey,annotationPlan,createUsage};

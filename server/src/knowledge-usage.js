const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {ApiError}=require('./utils'),{workshopForRole}=require('./workshop-scope');
const LIMIT=3,active=new Set();
const canAsk=user=>user?.role==='admin'||Boolean(workshopForRole(user?.role));
function requireAsker(user){if(!canAsk(user)||!/^[1-9]\d*$/.test(String(user.id)))throw new ApiError(403,'仅系统管理员和车间管理员可以使用知识问答')}
const day=now=>new Date(new Date(now).getTime()+8*3600000).toISOString().slice(0,10);
function createUsage(auditRoot,{now=()=>new Date()}={}){
 const root=path.resolve(auditRoot,'.knowledge-usage');
 const filename=user=>path.join(root,String(user.id)+'.json');
 async function load(user){try{const ledger=JSON.parse(await fs.readFile(filename(user),'utf8'));if(ledger.schema!==1||ledger.accountId!==String(user.id)||!Array.isArray(ledger.entries)||ledger.entries.some(e=>typeof e.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.day)||!['pending','done'].includes(e.state)))throw Error('Invalid knowledge usage ledger');return ledger}catch(e){if(e.code==='ENOENT')return {schema:1,accountId:String(user.id),entries:[]};throw new ApiError(503,'知识问答次数记录暂不可读，请联系管理员')}}
 async function save(user,ledger){
  await fs.mkdir(root,{recursive:true,mode:0o700});const file=filename(user),tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify(ledger),{flag:'wx',mode:0o600});await fs.rename(tmp,file)}catch{throw new ApiError(503,'知识问答次数记录暂不可写，请联系管理员')}finally{await fs.unlink(tmp).catch(()=>{})}
 }
 function quota(user,ledger){const date=day(now()),unlimited=user.role==='admin',used=unlimited?0:ledger.entries.filter(e=>e.day===date).length;return {date,unlimited,limit:unlimited?null:LIMIT,used,remaining:unlimited?null:Math.max(0,LIMIT-used)}}
 async function usage(user){requireAsker(user);return quota(user,user.role==='admin'?{entries:[]}:await load(user))}
 async function execute(user,fn){
  requireAsker(user);if(user.role==='admin')return {value:await fn(),quota:await usage(user)};
  const key=filename(user);if(active.has(key))throw new ApiError(429,'当前账号已有知识问答正在进行，请稍候');active.add(key);
  try{
   const ledger=await load(user);if(quota(user,ledger).remaining<=0)throw new ApiError(429,'今日知识问答已达3次上限，请北京时间零点后再试');
   const entry={id:crypto.randomUUID(),day:day(now()),state:'pending'};ledger.entries=ledger.entries.filter(e=>e.day===entry.day);ledger.entries.push(entry);await save(user,ledger);
   let value;try{value=await fn()}catch(e){ledger.entries=ledger.entries.filter(e=>e.id!==entry.id);await save(user,ledger);throw e}
   if(value?.degraded||value?.restricted)ledger.entries=ledger.entries.filter(e=>e.id!==entry.id);else entry.state='done';
   await save(user,ledger);return {value,quota:quota(user,ledger)};
  }finally{active.delete(key)}
 }
 return {usage,execute};
}
module.exports={LIMIT,canAsk,requireAsker,createUsage};

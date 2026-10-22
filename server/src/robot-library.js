const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {ApiError}=require('./utils');
const {parseBackup,sha256}=require('./robot-backup');
const {validateResult,validateTarget}=require('./robot-agent');
// Per-response validation remains in robot-agent; accumulated notes span the whole backup.
const MAX_RECORD_BYTES=32*1024*1024;
function createLibrary(root=process.env.ROBOT_LIBRARY_DIR||path.resolve(__dirname,'../uploads/robot-program-library')){
 root=path.resolve(root);const locks=new Set();
 function directory(id){if(!/^[a-f0-9]{64}$/.test(id))throw new ApiError(400,'备份编号无效');return path.join(root,id)}
 async function exclusive(id,fn){if(locks.has(id))throw new ApiError(409,'该备份正在保存或分析，请稍后刷新');locks.add(id);try{return await fn()}finally{locks.delete(id)}}
 async function atomic(filename,value){const text=JSON.stringify(value);if(Buffer.byteLength(text)>MAX_RECORD_BYTES)throw new ApiError(413,'分析记录超过32MB保存上限，现有结果保留，请联系管理员归档');const tmp=filename+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,text,{flag:'wx',mode:0o600});await fs.rename(tmp,filename)}finally{await fs.unlink(tmp).catch(()=>{})}}
 async function record(id){try{const filename=path.join(directory(id),'record.json');if((await fs.stat(filename)).size>MAX_RECORD_BYTES)throw new ApiError(413,'分析记录超过32MB读取上限，请联系管理员');const text=await fs.readFile(filename,'utf8');if(Buffer.byteLength(text)>MAX_RECORD_BYTES)throw new ApiError(413,'分析记录超过32MB读取上限，请联系管理员');const r=JSON.parse(text);if(r.id!==id||r.schema!==1)throw new Error('invalid record');return r}catch(e){if(e.code==='ENOENT')throw new ApiError(404,'备份不存在');throw e}}
 async function list(){let names;try{names=await fs.readdir(root,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return [];throw e}const rows=[];for(const entry of names.filter(e=>e.isDirectory()&&/^[a-f0-9]{64}$/.test(e.name))){let r;try{r=await record(entry.name)}catch(e){if(e.status===404)continue;throw e}rows.push({id:r.id,filename:r.filename,displayName:r.displayName||r.filename,uploadedAt:r.uploadedAt,updatedAt:r.updatedAt,revision:r.revision,robotModel:r.robotModel,robotWare:r.robotWare,statistics:r.statistics,annotationCount:r.analysis?.annotations.length||0})}return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))}
 async function get(id){const r=await record(id),bytes=await fs.readFile(path.join(directory(id),'backup.zip'));if(sha256(bytes)!==id)throw new ApiError(409,'保存的备份校验失败，请联系管理员');const report=await parseBackup(bytes,r.filename);return {...r,report}}
 function cleanAnalysis(input,report){if(!input)return null;if(input.sourceHash!==report.sha256)throw new ApiError(409,'注释与备份不一致');return {...validateResult(input,report,{allowChanges:input.mode==='modify'}),sourceHash:report.sha256,model:typeof input.model==='string'?input.model.slice(0,120):'',mode:input.mode==='modify'?'modify':'analyze',generatedAt:input.generatedAt}}
 async function upload(bytes,filename,initial=null,progress={}, {origin='upload'}={}){const report=await parseBackup(bytes,filename),id=report.sha256;return exclusive('upload',()=>exclusive(id,async()=>{
  try{return await get(id)}catch(e){if(e.status!==404)throw e}
  if(origin==='legacy-cache'){try{await fs.access(path.join(root,'.deleted',id+'.json'));throw new ApiError(410,'该备份已删除，不再自动恢复旧浏览器记录；需要时请重新导入原ZIP')}catch(e){if(e.code!=='ENOENT')throw e}}
  if((await list()).length>=100)throw new ApiError(413,'备份库已达100份，请联系管理员归档后再上传');
  const analysis=cleanAnalysis(initial,report),now=new Date().toISOString(),r={schema:1,id,filename:report.filename,uploadedAt:now,updatedAt:now,robotModel:report.robotModel,robotWare:report.robotWare,statistics:report.statistics,revision:1,analysis,history:[],batchState:{}};
  if(analysis&&progress&&typeof progress==='object')for(const [key,state]of Object.entries(progress).slice(0,1000)){const match=key.match(/^(.+):(\d+)-(\d+)$/);if(!match||state?.status!=='done')continue;try{const target=validateTarget({fileId:match[1],startLine:Number(match[2]),endLine:Number(match[3])},report);if(analysis.annotations.some(a=>a.fileId===target.fileId&&a.line>=target.startLine&&a.line<=target.endLine))r.batchState[key]={status:'done'}}catch{}}
  await fs.mkdir(root,{recursive:true,mode:0o700});const stage=path.join(root,'.upload-'+crypto.randomUUID());await fs.mkdir(stage,{mode:0o700});try{await fs.writeFile(path.join(stage,'backup.zip'),bytes,{flag:'wx',mode:0o600});await atomic(path.join(stage,'record.json'),r);await fs.rename(stage,directory(id))}finally{await fs.unlink(path.join(stage,'backup.zip')).catch(()=>{});await fs.unlink(path.join(stage,'record.json')).catch(()=>{});await fs.rmdir(stage).catch(()=>{})}return {...r,report}
 }))}
 async function saveResult(id,expectedRevision,result,{question='',target=null,overview=false,overviewScope=null,resetHistory=false}={}){const r=await record(id);if(r.revision!==expectedRevision)throw new ApiError(409,'备份分析已更新，请刷新后继续');const {report}=await get(id),incoming=cleanAnalysis(result,report),previous=r.analysis;if(resetHistory)r.history=[];
  const notes=new Map((previous?.annotations||[]).map(a=>[a.fileId+':'+a.line,a]));for(const a of incoming.annotations)notes.set(a.fileId+':'+a.line,a);
  const sections=new Map([...(previous?.sections||[]),...incoming.sections].map(s=>[s.title+JSON.stringify(s.refs),s]));const annotations=[...notes.values()];
  r.analysis={...incoming,annotations,sections:[...sections.values()].slice(-24),questions:[...new Set([...(previous?.questions||[]),...incoming.questions])].slice(-16)};
  if(target)r.batchState[`${target.fileId}:${target.startLine}-${target.endLine}`]={status:'done'};
  if(target){r.batchReports=r.batchReports||{};r.batchReports[`${target.fileId}:${target.startLine}-${target.endLine}`]={...incoming,annotations:[],target};}
  else if(overview)r.overview={...incoming,annotations:[],coverage:overviewScope};else r.dialogueAnalysis={...incoming,annotations:[]};
  if(question&&!target&&!overview)r.history=[...r.history,{role:'user',content:question},{role:'assistant',content:incoming.summary.slice(0,12000)}].slice(-8);
  r.revision++;r.updatedAt=new Date().toISOString();await atomic(path.join(directory(id),'record.json'),r);return {...r,report}
 }
 async function rename(id,name,expectedRevision){
  if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\x00-\x1f\x7f\\/:*?"<>|]/.test(name)||['.','..'].includes(name.trim()))throw new ApiError(400,'名称须为1至80个字符，不能包含换行或 / \\ : * ? " < > |');
  return exclusive(id,async()=>{const r=await record(id);if(expectedRevision!==r.revision)throw new ApiError(409,'备份已更新，请刷新后重命名');r.displayName=name.trim();r.updatedAt=new Date().toISOString();r.revision++;await atomic(path.join(directory(id),'record.json'),r);return get(id)});
 }
 async function remove(id,expectedRevision,actorId){
  return exclusive(id,async()=>{
   const current=await record(id);if(expectedRevision!==current.revision)throw new ApiError(409,'备份已更新，请刷新后再删除');
   const archiveRoot=path.join(root,'.deleted');await fs.mkdir(archiveRoot,{recursive:true,mode:0o700});
   const archiveName=id+'-'+crypto.randomUUID(),archived=path.join(archiveRoot,archiveName);
   await fs.rename(directory(id),archived);
   try{await atomic(path.join(archiveRoot,id+'.json'),{schema:1,id,archiveName,deletedAt:new Date().toISOString(),actorId:String(actorId),revision:current.revision})}
   catch(error){await fs.rename(archived,directory(id));throw error}
   return {id,deleted:true,archived:true};
  });
 }
 async function clearAnalysis(id,expectedRevision){return exclusive(id,async()=>{const r=await record(id);if(r.revision!==expectedRevision)throw new ApiError(409,'备份已更新，请刷新后清除');for(const key of ['analysis','overview','dialogueAnalysis'])r[key]=null;r.history=[];r.batchState={};r.batchReports={};r.revision++;r.updatedAt=new Date().toISOString();await atomic(path.join(directory(id),'record.json'),r);return {id,revision:r.revision}})}
 return {root,list,get,upload,saveResult,exclusive,rename,remove,clearAnalysis};
}
const defaultLibrary=createLibrary();
module.exports={createLibrary,defaultLibrary};

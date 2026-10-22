const crypto=require('node:crypto');
const path=require('node:path');
const yauzl=require('yauzl');
const iconv=require('iconv-lite');
const {ApiError}=require('./utils');
const MAX_ZIP=20*1024*1024,MAX_TOTAL=64*1024*1024,MAX_FILE=2*1024*1024;
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function decode(buffer){
 if(buffer.includes(0)||[...buffer.subarray(0,8192)].filter(b=>b<32&&![9,10,13].includes(b)).length>8)return null;
 try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(buffer),encoding:'UTF-8'}}catch{
  const text=iconv.decode(buffer,'gb18030');return text.includes('\ufffd')?null:{text,encoding:'GB18030'};
 }
}
function safePath(raw){
 let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(raw)}catch{name=iconv.decode(raw,'gb18030')}
 name=name.replaceAll('\\','/');
 if(name.length>500||/[\x00-\x1f\x7f:]/.test(name)||name.startsWith('/')||name.split('/').some(s=>s==='..'||s==='.')||!name)throw new ApiError(400,'压缩包中包含不安全的路径');
 return name;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
async function readZip(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>MAX_ZIP)throw new ApiError(413,'备份ZIP不能超过20MB');
 return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:false,validateEntrySizes:true},(error,zip)=>{
  if(error)return reject(new ApiError(400,'ZIP格式无效或已损坏'));
  let total=0,count=0,settled=false;const selected=[],seen=new Set();
  const fail=e=>{if(settled)return;settled=true;zip.close();reject(e.status?e:new ApiError(400,'ZIP内容损坏或无法读取'))};
  zip.on('error',fail);zip.on('end',()=>{if(!settled){settled=true;resolve({selected,entryCount:count,totalBytes:total})}});
  zip.on('entry',entry=>{
   try{
    const name=safePath(entry.fileName),key=name.toLowerCase();count++;total+=entry.uncompressedSize;
    if(count>1000||total>MAX_TOTAL)throw new ApiError(413,'备份解压后超过64MB或1000个条目');
    if(seen.has(key))throw new ApiError(400,'备份中存在重复文件路径');seen.add(key);
    if((entry.externalFileAttributes>>>16&0xf000)===0xa000)throw new ApiError(400,'备份中不能包含符号链接');
    if(entry.generalPurposeBitFlag&1)throw new ApiError(400,'暂不支持带密码的ZIP，请上传未加密备份');
    if(name.endsWith('/'))return zip.readEntry();
    const program=/(?:^|\/)RAPID\/[^/]+\/(?:PROGMOD|SYSMOD)\/[^/]+\.(?:modx?|sysx?|rapid)$/i.test(name);
    const config=/(?:^|\/)SYSPAR\/(?:EIO|SYS)\.cfg$/i.test(name);
    const info=/(?:^|\/)BACKINFO\/backinfo\.txt$/i.test(name);
    if(!program&&!config&&!info)return zip.readEntry();
    if(entry.uncompressedSize>MAX_FILE)throw new ApiError(413,'单个程序或配置文件不能超过2MB');
    zip.openReadStream(entry,(err,stream)=>{
     if(err)return fail(err);let size=0;const chunks=[];
     stream.on('error',fail);stream.on('data',chunk=>{size+=chunk.length;if(size>MAX_FILE){stream.destroy();fail(new ApiError(413,'文件解压大小超限'))}else chunks.push(chunk)});
     stream.on('end',()=>{if(settled)return;const bytes=Buffer.concat(chunks);if(bytes.length!==entry.uncompressedSize||crc32(bytes)!==entry.crc32)return fail(new ApiError(400,'备份文件校验失败'));selected.push({path:name,kind:program?'program':config?'config':'info',bytes});zip.readEntry()});
    });
   }catch(e){fail(e)}
  });zip.readEntry();
 }));
}
// Remove comments without interpreting quoted strings as program instructions.
function codePart(line){let quoted=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue}quoted=!quoted}else if(line[i]==='!'&&!quoted)return line.slice(0,i)}return line}
function parseRoutines(lines){
 const routines=[];let current=null;
 for(let i=0;i<lines.length;i++){
  const code=codePart(lines[i]),m=code.match(/^\s*(?:LOCAL\s+)?(PROC|FUNC|TRAP)\s+(?:(\w+)\s+)?([A-Za-z_]\w*)\s*(?:\(|$)/i);
  if(m){current={name:m[3],kind:m[1].toUpperCase(),startLine:i+1,endLine:lines.length,calls:[],motionCount:0,ioNames:[]};routines.push(current)}
  if(!current)continue;
  const command=code.trim().match(/^([A-Za-z_]\w*)\b/)?.[1];
  if(command&&/^(MoveJ|MoveL|MoveC|MoveAbsJ|SearchL|SearchC)$/i.test(command))current.motionCount++;
  if(command&&!/^(PROC|FUNC|TRAP|ENDPROC|ENDFUNC|ENDTRAP|VAR|PERS|CONST|LOCAL|IF|ELSEIF|ELSE|ENDIF|FOR|ENDFOR|WHILE|ENDWHILE|TEST|CASE|DEFAULT|ENDTEST|ERROR|UNDO|BACKWARD|RETURN)$/i.test(command)&&!code.includes(':='))current.calls.push({name:command,line:i+1});
  if(new RegExp('^\\s*END'+current.kind+'\\b','i').test(code)){current.endLine=i+1;current=null}
 }return routines;
}
function configRecords(text,section){
 const lines=text.split(/\r?\n/),records=[];let active=false,current=null;
 function flush(){if(current)records.push(current);current=null}
 for(let i=0;i<lines.length;i++){
  const line=lines[i],header=line.match(/^([A-Za-z_]\w*):\s*$/);
  if(header){flush();active=header[1].toUpperCase()===section;continue}
  if(!active)continue;
  if(/^\s*#/.test(line)){flush();active=false;continue}
  if(/^\s*-(?:Name|Routine)\s+"/i.test(line)){flush();current={line:i+1,fields:{}}}
  if(current)for(const m of line.matchAll(/-([A-Za-z_]\w*)\s+(?:"([^"]*)"|([^\s\\]+))/g))current.fields[m[1].toLowerCase()]=m[2]??m[3];
 }flush();return records;
}
async function parseBackup(buffer,filename='ABB-backup.zip'){
 const archive=await readZip(buffer),files=[];let lineCount=0;
 const info=archive.selected.find(f=>f.kind==='info'),infoText=info&&decode(info.bytes)?.text||'';
 const aliases=Object.fromEntries([...infoText.matchAll(/>>(TASK\d+):\s*\(([^,\n]+)/gi)].map(m=>[m[1].toUpperCase(),m[2].trim()]));
 for(const entry of archive.selected.filter(f=>f.kind!=='info')){
  const decoded=decode(entry.bytes),text=decoded?.text||'',lines=text.split(/\r\n|\n|\r/);lineCount+=lines.length;
  if(lineCount>40000)throw new ApiError(413,'程序超过40000行，请按任务拆分备份');
  const folder=entry.path.match(/\/RAPID\/([^/]+)\//i)?.[1]||entry.path.match(/^RAPID\/([^/]+)\//i)?.[1]||'';
  const module=text.match(/^\s*MODULE\s+([A-Za-z_]\w*)/im)?.[1]||'';
  const readable=!!decoded&&(entry.kind==='config'||!!module);
  const file={id:'file-'+(files.length+1),path:entry.path,name:path.posix.basename(entry.path),kind:entry.kind,task:aliases[folder.toUpperCase()]||folder,taskFolder:folder,module,readable,encoding:decoded?.encoding||'binary',sha256:sha256(entry.bytes),bytes:entry.bytes.length,text:readable?text:'',lineCount:readable?lines.length:0,routines:readable&&entry.kind==='program'?parseRoutines(lines):[],reason:readable?'':'非文本或不可识别的模块，可能受保护；未解密'};
  Object.defineProperty(file,'originalBytes',{value:entry.bytes});files.push(file);
 }
 const modules=files.filter(f=>f.kind==='program');if(!modules.length)throw new ApiError(400,'没有找到 RAPID/任务/PROGMOD 或 SYSMOD 下的程序模块');
 const signals=files.filter(f=>f.kind==='config'&&/EIO\.cfg$/i.test(f.path)&&f.readable).flatMap(f=>configRecords(f.text,'EIO_SIGNAL').map(r=>({fileId:f.id,line:r.line,name:r.fields.name||'',type:r.fields.signaltype||'',label:r.fields.label||'',device:r.fields.device||'',map:r.fields.devicemap||''})));
 const hooks=files.filter(f=>f.kind==='config'&&/SYS\.cfg$/i.test(f.path)&&f.readable).flatMap(f=>configRecords(f.text,'CAB_EXEC_HOOKS').map(r=>({fileId:f.id,line:r.line,...r.fields})));
 const definitions=modules.flatMap(f=>f.routines.map(r=>({fileId:f.id,task:f.task,...r})));
 for(const f of modules)for(const r of f.routines){r.calls=r.calls.map(c=>({...c,targets:definitions.filter(d=>d.task===f.task&&d.name.toLowerCase()===c.name.toLowerCase()).map(d=>({fileId:d.fileId,line:d.startLine}))}));const tokens=new Set(f.text.split(/\r\n|\n|\r/).slice(r.startLine-1,r.endLine).map(codePart).join('\n').match(/\b[A-Za-z_]\w*\b/g)||[]);r.ioNames=signals.filter(s=>tokens.has(s.name)).map(s=>s.name)}
 return {filename:path.basename(filename).slice(0,200),sha256:sha256(buffer),robotWare:infoText.match(/RobotWare Version:\s*([^\r\n]+)/i)?.[1]||'',robotModel:infoText.match(/^\s*(IRB\s+\d+[^\r\n]*)/m)?.[1]?.trim()||'',files,signals,hooks,statistics:{archiveEntries:archive.entryCount,totalBytes:archive.totalBytes,tasks:[...new Set(modules.map(f=>f.task))].length,modules:modules.length,readableModules:modules.filter(f=>f.readable).length,unreadableModules:modules.filter(f=>!f.readable).length,routines:definitions.length,signals:signals.length},warnings:modules.filter(f=>!f.readable).map(f=>`${f.path}：${f.reason}`)};
}
module.exports={MAX_ZIP,sha256,decode,codePart,parseRoutines,configRecords,parseBackup,readZip};

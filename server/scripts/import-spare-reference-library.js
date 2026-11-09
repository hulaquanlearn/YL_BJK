/* Explicit, idempotent import of a curated local manifest. No network or AI calls. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {referenceMetadata}=require('../src/knowledge-reference');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readLibrary(manifestPath){
 const absolute=path.resolve(manifestPath),base=path.join(path.dirname(absolute),'library-files');
 const manifest=JSON.parse(fs.readFileSync(absolute,'utf8'));
 if(manifest.schema!==1||manifest.category!=='备件资料'||!Array.isArray(manifest.entries)||manifest.entries.length>1000)throw Error('资料清单格式无效');
 const seen=new Set();
 const entries=manifest.entries.map(row=>{
  const meta=referenceMetadata(row.referenceMetadata,{strict:true});
  if(!meta||!meta.sourceUrl||!meta.manufacturer||!meta.verifiedScope||!meta.limitations)throw Error('资料缺少来源或核实范围');
  if(!/^[a-f0-9]{64}\.(pdf|md)$/.test(row.file)||row.file.split('.')[0]!==row.sha256||meta.fileSha256!==row.sha256)throw Error('资料文件名/哈希无效');
  const source=path.join(base,row.file),stat=fs.lstatSync(source);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50*1024*1024)throw Error('资料原件范围无效');
  const bytes=fs.readFileSync(source);
  if(digest(bytes)!==row.sha256||seen.has(row.sha256))throw Error('资料哈希不符或重复');
  seen.add(row.sha256);
  const pdf=row.file.endsWith('.pdf');
  if(pdf&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('PDF原件无效');
  if(row.mimeType!==(pdf?'application/pdf':'text/markdown'))throw Error('资料格式不符');
  if(!row.title||row.title.length>200||!row.originalFilename||row.originalFilename.length>255||path.basename(row.originalFilename)!==row.originalFilename||/[\\/\x00-\x1f]/.test(row.originalFilename))throw Error('资料标题或显示名无效');
  if(!row.contentText||row.contentText.length>100000||!row.summary||row.summary.length>1000)throw Error('资料索引/摘要无效');
  return {...row,source,size:bytes.length,referenceMetadata:meta};
 });
 return {batch:manifest.batch,entries};
}
async function importLibrary({connection,library,uploadDir,apply=false,receiptPath}){
 const uploadRoot=path.resolve(uploadDir),createdFiles=[],inserted=[],skipped=[];
 const receipt={batch:library.batch,startedAt:new Date().toISOString(),apply,status:'checking',inserted,skipped};
 const save=()=>{if(receiptPath)fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});};
 if(apply&&(!receiptPath||fs.existsSync(receiptPath)))throw Error('应用导入必须提供新的私有回执路径');
 if(receiptPath&&path.resolve(receiptPath).startsWith(uploadRoot+path.sep))throw Error('导入回执不能位于上传目录');
 const [[lock]]=await connection.query("SELECT GET_LOCK('spare_reference_library_import',10) AS acquired");
 if(Number(lock?.acquired)!==1)throw Error('另一个资料导入正在运行');
 let transaction=false,committed=false;
 try{
  const [rows]=await connection.query("SELECT id,stored_filename AS filename,reference_metadata AS metadata FROM fermentation_knowledge_entries WHERE status='active'");
  const existing=new Map();
  for(const row of rows){
   const metadata=referenceMetadata(row.metadata);
   let hash=metadata?.fileSha256;
   if(!hash&&row.filename&&path.basename(row.filename)===row.filename){
    const file=path.join(uploadRoot,row.filename);
    if(fs.existsSync(file)&&fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink())hash=digest(fs.readFileSync(file));
   }
   if(hash)existing.set(hash,String(row.id));
  }
  const pending=library.entries.filter(row=>{const id=existing.get(row.sha256);if(id){skipped.push({sha256:row.sha256,id,reason:'same-file-already-exists'});return false;}return true;});
  receipt.pending=pending.length;save();
  if(!apply){receipt.status='dry-run';save();return receipt;}
  fs.mkdirSync(uploadRoot,{recursive:true});
  await connection.beginTransaction();transaction=true;
  for(const row of pending){
   const filename='ref-'+row.file,destination=path.join(uploadRoot,filename);
   if(fs.existsSync(destination)){if(digest(fs.readFileSync(destination))!==row.sha256)throw Error('目标原件已存在且哈希不同');}
   else{fs.copyFileSync(row.source,destination,fs.constants.COPYFILE_EXCL);fs.chmodSync(destination,0o640);createdFiles.push(destination);}
   const [result]=await connection.query(`INSERT INTO fermentation_knowledge_entries
    (workshop_code,entry_type,title,category,summary,content_text,tags,original_filename,stored_filename,mime_type,file_size,
     uploaded_by,uploaded_by_name,status,revision_no,index_status,index_message,indexed_at,reference_metadata)
    VALUES ('raw_grain','document',?,'备件资料',?,?,?,?,?,?,?,NULL,'资料整理（Codex与DSH）','active',1,'ready',?,NOW(),?)`,
    [row.title,row.summary,row.contentText,[row.referenceMetadata.family,row.referenceMetadata.manufacturer].join(','),row.originalFilename,filename,row.mimeType,row.size,
     '分类与核实摘要已建索；原图与完整型号须回查原件，扫描页未全文OCR',JSON.stringify(row.referenceMetadata)]);
   inserted.push({id:String(result.insertId),sha256:row.sha256,filename,title:row.title});save();
  }
  await connection.commit();transaction=false;committed=true;receipt.status='imported';receipt.finishedAt=new Date().toISOString();save();return receipt;
 }catch(error){
  if(transaction)await connection.rollback();
  receipt.status=committed?'imported-receipt-write-failed':'failed';receipt.error=error.message;
  if(!committed&&createdFiles.length){const bin=path.join(path.dirname(receiptPath),'failed-import-files-'+Date.now());fs.mkdirSync(bin,{recursive:true,mode:0o700});for(const file of createdFiles)fs.renameSync(file,path.join(bin,path.basename(file)));receipt.recoveredFiles=createdFiles.map(p=>path.basename(p));receipt.recoveryDirectory=bin;}
  save();throw error;
 }finally{await connection.query("SELECT RELEASE_LOCK('spare_reference_library_import')");}
}
module.exports={readLibrary,importLibrary};
if(require.main===module){
 (async()=>{
  const args=process.argv.slice(2),manifest=args.find(a=>!a.startsWith('--'));
  if(!manifest)throw Error('用法：node scripts/import-spare-reference-library.js manifest.json [--apply --receipt=/private/new-receipt.json]');
  const library=readLibrary(manifest);require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
  const config=require('../src/config'),mysql=require('mysql2/promise'),connection=await mysql.createConnection(config.mysql);
  try{const receipt=await importLibrary({connection,library,uploadDir:config.knowledge.uploadDir,apply:args.includes('--apply'),receiptPath:args.find(a=>a.startsWith('--receipt='))?.slice(10)});console.log(JSON.stringify({status:receipt.status,pending:receipt.pending,inserted:receipt.inserted.length,skipped:receipt.skipped.length}));}finally{await connection.end();}
 })().catch(error=>{console.error(error.message);process.exitCode=1;});
}

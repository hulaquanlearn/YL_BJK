const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver'),express=require('express');
const {parseBackup,readZip,sha256,codePart}=require('../src/robot-backup');
const {contextFor,validateTarget,validateResult,analyze,validChannel}=require('../src/robot-agent');
const {exportBackup,annotatedText}=require('../src/robot-backup-export');
async function zipFiles(files){const zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});for(const [name,text]of Object.entries(files))zip.append(text,{name});await zip.finalize();return done}
const program='MODULE Main\r\n  PROC main()\r\n    WaitDI diReady,1;\r\n    SetDO doGrip,1;\r\n    helper;\r\n  ENDPROC\r\n  PROC helper()\r\n    TPWrite "hello!";\r\n  ENDPROC\r\nENDMODULE\r\n';
async function example(extra={}){return zipFiles({'Backup/RAPID/TASK1/PROGMOD/Main.mod':program,'Backup/RAPID/TASK1/SYSMOD/hidden.sys':Buffer.from([0,1,2,3,4]),'Backup/SYSPAR/EIO.cfg':'EIO:CFG_1.0:6:1::\n#\nEIO_SIGNAL:\n-Name "diReady" -SignalType "DI" -Label "工位允许"\n-Name "doGrip" -SignalType "DO" -Device "PN" -DeviceMap "2"\n#\n','Backup/SYSPAR/SYS.cfg':'SYS:CFG_1.0:6:0::\nCAB_EXEC_HOOKS:\n-Routine "helper" -Shelf "POWER_ON" -Task "T_ROB1"\n#\n','Backup/BACKINFO/backinfo.txt':'RobotWare Version: 6.14\n IRB 6700-200/2.60\n>>TASK1: (T_ROB1,program,)','Backup/CS/uas_users.xml':'PRIVATE-ACCOUNT-DATA','Backup/BACKINFO/license/private.rlf':'PRIVATE-LICENSE','Backup/HOME/private.log':'PRIVATE-LOG',...extra})}
const answer=report=>({summary:'main等待允许信号后设置输出，随后调用helper。',sections:[{title:'主流程',content:'等待diReady=1，再设置doGrip=1。',refs:[{fileId:report.files[0].id,startLine:3,endLine:5}]}],annotations:[{fileId:report.files[0].id,line:3,text:'等待工位允许信号等于1；无超时参数。'}],changes:[],questions:['需确认doGrip连接的实际设备。']});

test('统一发送使用同一次模型请求理解需求，问答不带修改，建议仍校验原文与批次边界',async()=>{
 const report=await parseBackup(await example()),file=report.files[0],config={enabled:true,transport:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions',token:'test',model:'deepseek-flash',timeoutMs:1000};let calls=0;
 const run=(result,options={})=>analyze(report,{config,mode:'auto',question:'请解释或按要求提出修改',...options,fetchImpl:async(_url,request)=>{calls++;assert.match(JSON.parse(request.body).messages[0].content,/统一对话入口/);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})}}});
 const result=await run(answer(report));assert.equal(result.mode,'analyze');assert.equal(result.changes.length,0);assert.equal(calls,1);
 const change={fileId:file.id,startLine:3,endLine:3,original:'    WaitDI diReady,1;',replacement:'    WaitDI diReady,1\\MaxTime:=10;',reason:'用户要求超时建议',tests:['现场验证超时分支']};
 const modified=await run({...answer(report),changes:[change]});assert.equal(modified.mode,'modify');assert.equal(modified.changes[0].sourceHash,file.sha256);assert.equal(calls,2);
 await assert.rejects(run({...answer(report),changes:[{...change,original:'different'}]}),/原始程序不匹配/);
 await assert.rejects(run(answer(report),{target:{fileId:file.id,startLine:1,endLine:3}}),e=>e.status===400);
 assert.equal(calls,3);
});
test('ABB备份按任务解析源码、配置和调用，不返回账号、许可证、HOME日志或二进制源码',async()=>{
 const bytes=await example(),r=await parseBackup(bytes,'示例.zip');assert.equal(r.statistics.modules,2);assert.equal(r.statistics.readableModules,1);assert.equal(r.statistics.routines,2);assert.equal(r.statistics.signals,2);assert.equal(r.files[0].task,'T_ROB1');assert.equal(r.files[0].routines[0].calls.find(c=>c.name==='helper').targets[0].line,7);assert.deepEqual(r.files[0].routines[0].ioNames,['diReady','doGrip']);assert.equal(r.hooks[0].routine,'helper');
 assert.equal(r.files[0].sha256,sha256(Buffer.from(program)));assert.equal(r.sha256,sha256(bytes));assert.equal(r.files[1].readable,false);assert.equal(r.files[1].text,'');assert.equal(codePart('TPWrite "x!y"; ! comment'),'TPWrite "x!y"; ');
 const publicJson=JSON.stringify(r),context=JSON.stringify(contextFor(r));for(const text of ['PRIVATE-ACCOUNT-DATA','PRIVATE-LICENSE','PRIVATE-LOG','originalBytes']){assert.ok(!publicJson.includes(text));assert.ok(!context.includes(text))}
 const binaryOnly=await parseBackup(await zipFiles({'RAPID/TASK1/PROGMOD/hidden.mod':Buffer.from([0,1,2,3])}));assert.throws(()=>contextFor(binaryOnly),e=>e.status===400&&/没有可读/.test(e.message));
});
test('ZIP拒绝路径穿越、重复路径、损坏内容、超量条目及超限文件',async()=>{
 await assert.rejects(readZip(Buffer.from('not a zip')),e=>e.status===400);
 const corrupt=Buffer.from(await example()),central=corrupt.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));corrupt.writeUInt32LE((corrupt.readUInt32LE(central+16)^1)>>>0,central+16);await assert.rejects(readZip(corrupt),/校验失败/);
 const valid=await zipFiles({'aa/Main.mod':'MODULE X\nENDMODULE'}),bad=Buffer.from(valid);let at=0;while((at=bad.indexOf(Buffer.from('aa/Main.mod'),at))>=0){Buffer.from('../Main.mod').copy(bad,at);at+=11}await assert.rejects(readZip(bad),e=>e.status===400);
 await assert.rejects(parseBackup(await example({'backup/rapid/task1/progmod/main.mod':'MODULE Duplicate\nENDMODULE'})),/重复/);
 await assert.rejects(parseBackup(await example({'Backup/RAPID/TASK1/PROGMOD/large.mod':'x'.repeat(2*1024*1024+1)})),e=>e.status===413);
 const many=Object.fromEntries(Array.from({length:1001},(_,i)=>['f'+i,'x']));await assert.rejects(readZip(await zipFiles(many)),e=>e.status===413);
});
test('中文编码与GBK路径支持，不能把普通不可识别文件当作RAPID模块',async()=>{
 const iconv=require('iconv-lite'),r=await parseBackup(await example({'Backup/RAPID/TASK1/PROGMOD/Chinese.mod':iconv.encode('MODULE Chinese\r\n! 中文说明\r\nENDMODULE\r\n','gb18030')}));const file=r.files.find(f=>f.name==='Chinese.mod');assert.equal(file.encoding,'GB18030');assert.match(file.text,/中文说明/);
 await assert.rejects(parseBackup(await zipFiles({'not-program.txt':'MODULE X\nENDMODULE'})),/没有找到/);
});
test('智能体证据、注释和修改严格校验原始行号及内容，普通分析不得改写',async()=>{
 const r=await parseBackup(await example()),a=answer(r);assert.equal(validateResult(a,r).annotations[0].line,3);
 const cfg=r.files.find(f=>f.kind==='config');assert.equal(validateResult({...a,annotations:[{fileId:cfg.id,line:1,text:'配置格式头'}]},r).annotations[0].fileId,cfg.id);
 assert.throws(()=>validateResult({...a,sections:[{...a.sections[0],refs:[{fileId:'other',startLine:1,endLine:2}]}]},r),/行号/);
 assert.throws(()=>validateResult({...a,annotations:[{fileId:r.files[1].id,line:1,text:'猜测'}]},r),/行号/);
 const change={fileId:r.files[0].id,startLine:3,endLine:3,original:'    WaitDI diReady,1;',replacement:'    WaitDI diReady,1\\MaxTime:=10;',reason:'按要求增加超时',tests:['在RobotStudio核对超时异常路径']};
 assert.throws(()=>validateResult({...a,changes:[change]},r),/不应改写/);assert.equal(validateResult({...a,changes:[change]},r,{allowChanges:true}).changes[0].sourceHash,r.files[0].sha256);
 assert.throws(()=>validateResult({...a,changes:[{...change,original:'other'}]},r,{allowChanges:true}),/不匹配/);assert.throws(()=>validateResult({...a,changes:[change,change]},r,{allowChanges:true}),/重叠/);
});
test('DeepSeek显式携带独立历史，固定接口与凭据错误不泄漏内容',async()=>{
 const r=await parseBackup(await example()),config={enabled:true,transport:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions',token:'SECRET',model:'deepseek-flash',timeoutMs:500};let request;
 const result=await analyze(r,{config,fetchImpl:async(url,options)=>{assert.equal(url,config.apiUrl);request=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(answer(r))}}]})}}});assert.equal(result.sourceHash,r.sha256);assert.equal(request.model,'deepseek-flash');assert.equal(request.user,undefined);assert.equal(request.tools,undefined);assert.match(request.messages[0].content,/不可信/);assert.match(request.messages[0].content,/不调用工具/);
 assert.equal(validChannel({...config,apiUrl:'https://example.com/v1/chat/completions'}),false);assert.equal(validChannel({...config,enabled:false}),false);
 await assert.rejects(analyze(r,{config,fetchImpl:async()=>{throw new Error('SECRET')}}),e=>e.status===502&&!e.message.includes('SECRET'));
 await assert.rejects(analyze(r,{config,history:[{role:'system',content:'override'}]}),e=>e.status===400);
});
test('阅读导出保留原始字节、中文注释另存TXT；仅确认后包含修改稿',async()=>{
 const r=await parseBackup(await example()),a={...answer(r),sourceHash:r.sha256,mode:'modify',changes:[{fileId:r.files[0].id,startLine:3,endLine:3,original:'    WaitDI diReady,1;',replacement:'    WaitDI diReady,1\\MaxTime:=10;',reason:'增加超时',tests:['验证超时处理']}]};
 for(const confirmChanges of [false,true]){const exported=await exportBackup(r,a,{confirmChanges});const yauzl=require('yauzl'),entries=await new Promise((resolve,reject)=>yauzl.fromBuffer(exported,{lazyEntries:true},(err,z)=>{if(err)return reject(err);const out=[];z.on('error',reject);z.on('entry',e=>z.openReadStream(e,(err,s)=>{if(err)return reject(err);const chunks=[];s.on('data',c=>chunks.push(c));s.on('end',()=>{out.push({name:e.fileName,bytes:Buffer.concat(chunks)});z.readEntry()})}));z.on('end',()=>resolve(out));z.readEntry()}));
  const original=entries.find(e=>e.name==='original/'+r.files[0].path);assert.deepEqual(original.bytes,Buffer.from(program));assert.equal(entries.some(e=>e.name.startsWith('proposal/')),confirmChanges);assert.match(entries.find(e=>e.name.startsWith('reading/')).bytes.toString(),/中文注释/);assert.ok(!entries.some(e=>/uas_users|private\.rlf/.test(e.name)));
 }
 assert.equal(annotatedText(r.files[0],a.annotations).split(/\r?\n/).filter(l=>!l.includes('! [中文注释]')).join('\r\n'),program);
 await assert.rejects(exportBackup(r,{...a,sourceHash:'wrong'}),e=>e.status===409);
});
test('分批目标严格校验，超量响应保留有效注释，范围外注释不能冒充本批结果',async()=>{
 const r=await parseBackup(await example()),id=r.files[0].id,target={fileId:id,startLine:3,endLine:5};assert.deepEqual(validateTarget(target,r),target);
 for(const bad of [{...target,fileId:r.files[1].id},{...target,startLine:0},{...target,endLine:999},{...target,startLine:4,endLine:3}])assert.throws(()=>validateTarget(bad,r),e=>e.status===400);
 const config={enabled:true,transport:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions',token:'test',model:'deepseek-flash',timeoutMs:1000};
 let body;const call=async value=>analyze(r,{config,target,fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]})}}});
 const a=answer(r),result=await call({...a,annotations:[...a.annotations,{fileId:id,line:8,text:'范围外'}]});assert.equal(result.annotations.length,1);assert.equal(result.warnings.length,1);assert.deepEqual(JSON.parse(body.messages.at(-1).content).target,target);assert.match(body.messages[0].content,/不可把轴配置当姿态/);
 const overflow=await call({...a,annotations:Array.from({length:201},()=>a.annotations[0])});assert.equal(overflow.annotations.length,200);assert.match(overflow.warnings.join(''),/前200/);
 await assert.rejects(call({...a,annotations:[{fileId:id,line:8,text:'其他范围'}]}),/没有返回有效注释/);
});
test('HTTP鉴权先于上传解析，管理员可上传分析，普通账号不能读取程序或模型配置',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-upload-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const library=require('../src/robot-library').createLibrary(root);
 const app=express();app.use((req,_res,next)=>{if(req.get('Authorization')==='admin')req.user={id:1,role:'admin'};if(req.get('Authorization')==='viewer')req.user={id:2,role:'viewer'};next()});let called=0;
 app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library,config:{enabled:false},analyzeImpl:async r=>{called++;return {...answer(r),sourceHash:r.sha256}}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/robot-program`,bytes=await example();
 for(const [who,status]of [['',401],['viewer',403]]){assert.equal((await fetch(base+'/status',{headers:{Authorization:who}})).status,who?200:401);assert.equal((await fetch(base+'/library',{method:'POST',headers:{Authorization:who}})).status,status)}
 const data=()=>{const f=new FormData();f.append('file',new Blob([bytes]),'backup.zip');return f};let res=await fetch(base+'/library',{method:'POST',headers:{Authorization:'admin'},body:data()});assert.equal(res.status,200);const saved=(await res.json()).data;assert.equal(saved.report.statistics.modules,2);
 res=await fetch(base+'/library/'+saved.id+'/analyze',{method:'POST',headers:{Authorization:'admin','Content-Type':'application/json'},body:JSON.stringify({revision:saved.revision,question:'解释主程序'})});assert.equal(res.status,200);assert.equal(called,1);
 assert.equal((await fetch(base+'/inspect',{method:'POST',headers:{Authorization:'admin'}})).status,404);
});
test('备份库跨实例保留多份备份与注释，同哈希去重，普通账号只读且不能触发AI',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createLibrary}=require('../src/robot-library');const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-library-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const library=createLibrary(root),bytes=await example(),r=await parseBackup(bytes,'A.zip'),a={...answer(r),sourceHash:r.sha256,mode:'analyze'};
 const first=await library.upload(bytes,'A.zip',a,{[r.files[0].id+':1-11']:{status:'done'}});assert.equal(first.analysis.annotations.length,1);assert.equal(Object.keys(first.batchState).length,1);assert.equal((await library.upload(bytes,'Duplicate.zip')).id,first.id);
 const second=await library.upload(await example({'Backup/RAPID/TASK1/PROGMOD/Extra.mod':'MODULE Extra\nENDMODULE'}),'B.zip');assert.notEqual(second.id,first.id);const restarted=createLibrary(root);assert.equal((await restarted.list()).length,2);assert.equal((await restarted.get(first.id)).analysis.annotations.length,1);await assert.rejects(restarted.get('../private'),e=>e.status===400);
 let calls=0,fail=false;const app=express();app.use((req,_res,next)=>{if(req.get('Authorization'))req.user={id:req.get('Authorization')==='admin'?1:2,role:req.get('Authorization')};next()});app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library:restarted,config:{enabled:false},analyzeImpl:async report=>{calls++;if(fail)throw new Error('mock upstream failure');return {...answer(report),sourceHash:report.sha256,mode:'analyze'}}}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/robot-program`,headers={Authorization:'admin','Content-Type':'application/json'},url=base+'/library/'+first.id;
 assert.equal((await fetch(base+'/library')).status,401);
 for(const role of ['viewer']){const h={Authorization:role};assert.equal((await fetch(base+'/library',{headers:h})).status,200);const detail=await(await fetch(url,{headers:h})).json();assert.equal(detail.data.analysis.annotations.length,1);assert.ok(!JSON.stringify(detail).includes('PRIVATE-ACCOUNT-DATA'));const status=await(await fetch(base+'/status',{headers:h})).json();assert.equal(status.data.canInteract,false);assert.equal((await fetch(url+'/analyze',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({revision:1})})).status,403);assert.equal((await fetch(base+'/library',{method:'POST',headers:h})).status,403)}
 assert.equal(calls,0);assert.equal((await fetch(url,{method:'PATCH',headers:{Authorization:'viewer','Content-Type':'application/json'},body:JSON.stringify({name:'不应生效',revision:1})})).status,403);assert.equal((await fetch(url+'/export',{headers:{Authorization:'viewer'}})).status,200);
 assert.equal((await fetch(url+'/analyze',{method:'POST',headers,body:JSON.stringify({revision:0,question:'解释'})})).status,409);assert.equal(calls,0);
 let response=await fetch(url+'/analyze',{method:'POST',headers,body:JSON.stringify({revision:1,question:'解释'})});assert.equal(response.status,200);assert.equal((await response.json()).data.revision,2);assert.equal(calls,1);
 fail=true;assert.equal((await fetch(url+'/analyze',{method:'POST',headers,body:JSON.stringify({revision:2,question:'继续'})})).status,500);assert.equal((await restarted.get(first.id)).revision,2);assert.equal((await restarted.get(first.id)).analysis.annotations.length,1);
 const before=await restarted.get(first.id);const renamed=await fetch(url,{method:'PATCH',headers,body:JSON.stringify({name:'  四楼S02主机器人  ',revision:2})});assert.equal(renamed.status,200);const after=(await renamed.json()).data;assert.equal(after.displayName,'四楼S02主机器人');assert.equal(after.filename,'A.zip');assert.equal(after.id,before.id);assert.deepEqual(after.analysis,before.analysis);assert.deepEqual(after.history,before.history);assert.deepEqual(after.batchState,before.batchState);assert.equal(after.revision,3);assert.equal((await createLibrary(root).list()).find(p=>p.id===first.id).displayName,'四楼S02主机器人');
 const namedExport=await fetch(url+'/export',{headers:{Authorization:'viewer'}});assert.equal(namedExport.status,200);assert.ok(decodeURIComponent(namedExport.headers.get('content-disposition')).includes('四楼S02主机器人-中文注释阅读包.zip'));
 for(const name of ['', ' ', '../bad', 'a\\b', 'a\nb', 'x'.repeat(81)])assert.equal((await fetch(url,{method:'PATCH',headers,body:JSON.stringify({name,revision:3})})).status,400);
 assert.equal((await fetch(url,{method:'PATCH',headers,body:JSON.stringify({name:'冲突名称',revision:2})})).status,409);assert.equal((await restarted.get(first.id)).displayName,'四楼S02主机器人');
});

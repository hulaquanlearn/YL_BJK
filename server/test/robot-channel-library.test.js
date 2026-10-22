const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),archiver=require('archiver'),express=require('express');
const {agentConfig,validChannel,channelStatus,checkConnection,analyze}=require('../src/robot-agent');
const {createLibrary}=require('../src/robot-library');
async function bytes(name='Main'){
 const zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});
 zip.append(`MODULE ${name}\nPROC main()\nWaitDI diReady,1;\nENDPROC\nENDMODULE`,{name:`RAPID/TASK1/PROGMOD/${name}.mod`});await zip.finalize();return done;
}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-delete-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return createLibrary(root)}
test('batch accumulation exceeds 2000 notes and 2MB without losing earlier notes, and survives restart/export',async t=>{
 const lib=await fixture(t),zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});
 zip.append(['MODULE Main','PROC main()',...Array.from({length:3700},()=> 'WaitTime 0.1;'),'ENDPROC','ENDMODULE'].join('\n'),{name:'RAPID/TASK1/PROGMOD/Main.mod'});await zip.finalize();let saved=await lib.upload(await done,'large.zip');const fileId=saved.report.files[0].id;
 const result=(start,count)=>({sourceHash:saved.id,summary:'分批注释',sections:[{title:'流程',content:'按源码生成注释',refs:[{fileId,startLine:start,endLine:start+count-1}]}],annotations:Array.from({length:count},(_,i)=>({fileId,line:start+i,text:'注'.repeat(590)})),changes:[],questions:[]});
 saved=await lib.saveResult(saved.id,saved.revision,result(3,1800));saved=await lib.saveResult(saved.id,saved.revision,result(1803,1800));assert.equal(saved.analysis.annotations.length,3600);
 assert.ok((await fs.stat(path.join(lib.root,saved.id,'record.json'))).size>2*1024*1024);
 const restarted=createLibrary(lib.root),restored=await restarted.get(saved.id);assert.equal(restored.analysis.annotations.length,3600);assert.equal(restored.analysis.annotations[0].line,3);assert.equal(restored.analysis.annotations.at(-1).line,3602);
 const updated=result(3,1);updated.annotations[0].text='更新同一行';saved=await restarted.saveResult(saved.id,saved.revision,updated,{target:{fileId,startLine:3,endLine:3}});assert.equal(saved.analysis.annotations.length,3600);assert.equal(saved.analysis.annotations[0].text,'更新同一行');assert.equal(saved.batchState[fileId+':3-3'].status,'done');
 const {exportBackup}=require('../src/robot-backup-export'),{readZip}=require('../src/robot-backup');const exported=await exportBackup(saved.report,saved.analysis);assert.ok(exported.length>0);const parsed=await readZip(exported);assert.ok(parsed.selected.some(f=>f.kind==='program'));
 await assert.rejects(restarted.saveResult(saved.id,saved.revision,result(3,2001)),e=>e.status===502);assert.equal((await restarted.get(saved.id)).analysis.annotations.length,3600);
});
test('DeepSeek defaults use only the provider key; direct analysis validates source references without OpenClaw',async t=>{
 const c=agentConfig({ROBOT_AGENT_ENABLED:'true',DEEPSEEK_API_KEY:'test-provider-secret'});assert.equal(c.transport,'deepseek');assert.equal(validChannel(c),true);assert.equal(c.model,'deepseek-flash');
 const lib=await fixture(t),saved=await lib.upload(await bytes(),'Main.zip');let calls=0;
 const result=await analyze(saved.report,{config:c,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-provider-secret');const body=JSON.parse(options.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.tools,undefined);const file=saved.report.files[0];return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'等待信号',sections:[{title:'流程',content:'等待输入为1',refs:[{fileId:file.id,startLine:3,endLine:3}]}],annotations:[{fileId:file.id,line:3,text:'等待输入为1'}],changes:[],questions:[]})}}]})}}});
 assert.equal(calls,1);assert.equal(result.transport,'deepseek');assert.equal(result.agentId,null);assert.equal(result.annotations.length,1);assert.equal(result.sourceHash,saved.id);
 assert.equal(validChannel(agentConfig({DEEPSEEK_API_KEY:'test'})),false); // explicit switch still required
});
test('connection diagnostics identify missing configuration and never expose upstream credentials or bodies',async()=>{
 const missing=agentConfig({});assert.deepEqual(channelStatus(missing).issues.map(i=>i.setting),['ROBOT_AGENT_ENABLED=true','DEEPSEEK_API_KEY']);
 assert.equal((await checkConnection(missing,{fetchImpl:async()=>assert.fail('disabled channel must not call upstream')})).ready,false);
 const c=agentConfig({ROBOT_AGENT_ENABLED:'true',DEEPSEEK_API_KEY:'secret-not-for-ui'});
 for(const status of [401,402,403,404,429,500]){const r=await checkConnection(c,{fetchImpl:async()=>({ok:false,status,text:async()=>{throw Error('must not read secret body')}})});assert.equal(r.ready,false);assert.ok(!JSON.stringify(r).includes(c.token))}
 const ok=await checkConnection(c,{fetchImpl:async(_url,o)=>{assert.equal(JSON.parse(o.body).thinking.type,'disabled');return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:'OK'}}]})}}});assert.equal(ok.ready,true);
 const failed=await checkConnection(c,{fetchImpl:async()=>{throw Error(c.token)}});assert.equal(failed.ready,false);assert.ok(!failed.message.includes(c.token));assert.ok(!/OpenClaw/.test(failed.message));
});
test('deleting a backup archives its data, preserves others, rejects stale revisions and prevents cache resurrection',async t=>{
 const lib=await fixture(t),aBytes=await bytes(),a=await lib.upload(aBytes,'A.zip'),b=await lib.upload(await bytes('Other'),'B.zip');
 const changed=await lib.rename(a.id,'新名称',a.revision);
 await assert.rejects(lib.remove(a.id,a.revision,1),e=>e.status===409);assert.equal((await lib.list()).length,2);
 await assert.rejects(lib.exclusive(a.id,()=>lib.remove(a.id,changed.revision,1)),e=>e.status===409);
 assert.deepEqual(await lib.remove(a.id,changed.revision,1),{id:a.id,deleted:true,archived:true});
 assert.deepEqual((await lib.list()).map(r=>r.id),[b.id]);await assert.rejects(lib.get(a.id),e=>e.status===404);
 const marker=JSON.parse(await fs.readFile(path.join(lib.root,'.deleted',a.id+'.json'),'utf8'));
 assert.deepEqual(await fs.readFile(path.join(lib.root,'.deleted',marker.archiveName,'backup.zip')),aBytes);
 assert.equal(JSON.parse(await fs.readFile(path.join(lib.root,'.deleted',marker.archiveName,'record.json'),'utf8')).displayName,'新名称');
 const restarted=createLibrary(lib.root);await assert.rejects(restarted.upload(aBytes,'A.zip',null,{}, {origin:'legacy-cache'}),e=>e.status===410);
 const reimported=await restarted.upload(aBytes,'A.zip');assert.equal(reimported.revision,1);assert.equal(reimported.analysis,null);assert.equal((await restarted.get(b.id)).filename,'B.zip');
 await restarted.remove(b.id,b.revision,1);await restarted.remove(a.id,reimported.revision,1);assert.deepEqual(await restarted.list(),[]);
 await assert.rejects(restarted.remove('../private',1,1),e=>e.status===400);
});
test('delete and model checks require an administrator; active analysis locks deletion until its result is saved',async t=>{
 const lib=await fixture(t),a=await lib.upload(await bytes(),'A.zip');let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let checks=0;
 const app=express();app.use((req,_res,next)=>{const role=req.get('Authorization');if(role)req.user={id:role==='admin'?1:2,role};next()});
 app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library:lib,config:agentConfig({ROBOT_AGENT_ENABLED:'true',DEEPSEEK_API_KEY:'test'}),checkConnectionImpl:async()=>{checks++;return {ready:true}},analyzeImpl:async report=>{entered();await gate;const id=report.files[0].id;return {sourceHash:report.sha256,summary:'解释',sections:[{title:'流程',content:'等待输入',refs:[{fileId:id,startLine:3,endLine:3}]}],annotations:[{fileId:id,line:3,text:'等待输入'}],changes:[],questions:[]}}}));
 app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{release();server.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/robot-program`,url=base+'/library/'+a.id;
 const request=(method,uri,role,body={})=>fetch(uri,{method,headers:{Authorization:role,'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const [role,status]of [['',401],['viewer',403]]){assert.equal((await request('DELETE',url,role,{revision:1})).status,status);assert.equal((await request('POST',base+'/connection-check',role)).status,status)}assert.equal(checks,0);
 assert.equal((await request('POST',base+'/connection-check','admin')).status,200);assert.equal(checks,1);
 const pending=request('POST',url+'/analyze','admin',{revision:1,question:'解释'});await started;
 assert.equal((await request('DELETE',url,'admin',{revision:1})).status,409);release();assert.equal((await pending).status,200);
 assert.equal((await request('DELETE',url,'admin',{revision:1})).status,409);
 assert.equal((await request('DELETE',url,'admin',{revision:2})).status,200);assert.deepEqual(await lib.list(),[]);
});

test('program overview, user answer and batch explanation persist independently',async t=>{
 const lib=await fixture(t);let saved=await lib.upload(await bytes(),'main.zip');const fileId=saved.report.files[0].id;const result=summary=>({sourceHash:saved.id,summary,sections:[{title:'主流程',content:summary,refs:[{fileId,startLine:3,endLine:3}]}],annotations:[],changes:[],questions:[]});
 saved=await lib.saveResult(saved.id,saved.revision,result('整套用途'),{overview:true,overviewScope:{providedLines:5,totalReadableLines:5}});assert.equal(saved.history.length,0);
 saved=await lib.saveResult(saved.id,saved.revision,result('用户问题的答案'),{question:'解释等待'});
 saved=await lib.saveResult(saved.id,saved.revision,{...result('仅第三行的批次'),annotations:[{fileId,line:3,text:'等待信号'}]},{target:{fileId,startLine:3,endLine:3}});
 const restored=await createLibrary(lib.root).get(saved.id);assert.equal(restored.overview.summary,'整套用途');assert.equal(restored.dialogueAnalysis.summary,'用户问题的答案');assert.equal(restored.batchReports[fileId+':3-3'].summary,'仅第三行的批次');assert.equal(restored.history.length,2);assert.equal(restored.analysis.annotations.length,1);
});

test('clearing analysis preserves original ZIP, checks revision and shares active analysis lock',async t=>{const lib=await fixture(t),original=await bytes();let saved=await lib.upload(original,'keep.zip');await assert.rejects(lib.clearAnalysis(saved.id,0),e=>e.status===409);await assert.rejects(lib.exclusive(saved.id,()=>lib.clearAnalysis(saved.id,1)),e=>e.status===409);await lib.clearAnalysis(saved.id,1);saved=await lib.get(saved.id);assert.equal(saved.revision,2);assert.equal(saved.analysis,null);assert.deepEqual(saved.history,[]);assert.deepEqual(saved.batchReports,{});assert.deepEqual(await fs.readFile(path.join(lib.root,saved.id,'backup.zip')),original)});

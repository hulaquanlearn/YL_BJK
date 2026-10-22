import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {annotationBatches,annotationCoverage,explanationReview,missingRoutineBatches} from '../src/utils/robot-program.mjs'
const clone=value=>JSON.parse(JSON.stringify(value))
function project(id){return {id,filename:id+'.zip',revision:1,updatedAt:'2026-10-18T00:00:00Z',report:{sha256:id,filename:id+'.zip',files:[{id:'file-'+id,name:'MainModule.mod',kind:'program',readable:true,lineCount:3,text:'MODULE Main\nENDMODULE\n',routines:[]}],warnings:[]},analysis:null,history:[],batchState:{}}}
function preview({projects=[project('a'),project('b')],confirm=async()=>{},enabled=true,cache=null,migrateDeleted=false,failBatch=false,canManage=true,remaining=3}={}){
 let mounted;const rows=new Map(projects.map(p=>[p.id,clone(p)])),calls=[],status={accountId:'1',canInteract:true,canManage,quota:canManage?{unlimited:true,remaining:null}:{unlimited:false,remaining,limit:3,used:3-remaining},enabled,transport:'deepseek',model:'deepseek-flash',message:enabled?'已配置':'机器人分析尚未开启',issues:[]};
 const source=fs.readFileSync(new URL('../src/views/RobotProgram.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted:fn=>mounted=fn,onBeforeUnmount(){},nextTick:async()=>{},annotationBatches,annotationCoverage,explanationReview,missingRoutineBatches,
  localStorage:{setItem(){},getItem(){return ''},removeItem(){}},FormData,Blob,URL,setTimeout,
  ElMessageBox:{confirm,alert:async()=>{}},robotSession:async(_account,action)=>{calls.push({type:'cache',action});return action==='get'?cache:undefined},
  getRobotAgentStatus:async()=>({data:status}),listRobotBackups:async()=>({data:[...rows.values()].map(clone)}),getRobotBackup:async id=>({data:clone(rows.get(id))}),
  startRobotAnnotationRun:async(id,body)=>{calls.push({type:'run',id,body:clone(body)});return {data:{id:'server-run',plan:annotationBatches(rows.get(id).report),quota:status.quota}}},
  checkRobotAgentConnection:async()=>{calls.push({type:'connection'});return {data:{ready:enabled,message:enabled?'调用成功':'机器人分析尚未开启'}}},
  deleteRobotBackup:async(id,revision)=>{calls.push({type:'delete',id,revision});rows.delete(id)},
  saveRobotBackup:async body=>{calls.push({type:'upload',origin:body.get('origin')});if(migrateDeleted)throw {response:{status:410,data:{msg:'已删除'}}};const p=project('new');rows.set(p.id,p);return {data:clone(p)}},
  askRobotBackup:async(id,body)=>{calls.push({type:'analysis',id,body:clone(body)});const failure=typeof failBatch==='function'?await failBatch(body):failBatch;if(failure)throw typeof failure==='object'?failure:{response:{data:{msg:'测试额度不足'}}};const p=rows.get(id);p.revision++;p.analysis={sourceHash:id,annotations:[{fileId:p.report.files[0].id,line:1,text:'说明'}]};if(body.target)p.batchState[body.target.fileId+':'+body.target.startLine+'-'+body.target.endLine]={status:'done'};return {data:clone(p)}}
 });
 vm.runInContext(source+'\nthis.subject={agentStatus,library,projectId,report,analysis,error,reading,busy,pendingFile,batchState,autoAnalyze,localNotice,stopBatch,orderedFiles,fileGroups,question,canManage,canInteract,ask,acceptProject,readBackup,generateBatches};',context)
 context.subject.agentStatus.value=status
 return {state:context.subject,calls,mount:()=>mounted(),rows}
}
test('destructive backup controls are centralized in data management while rename stays in context',()=>{
 const source=fs.readFileSync(new URL('../src/views/RobotProgram.vue',import.meta.url),'utf8');assert.doesNotMatch(source,/removeBackup|deleteRobotBackup/);assert.match(source,/@click="renameBackup\(item\)"/);
})
test('new upload automatically generates notes; failed batch retains backup and exposes retryable reason',async()=>{
 for(const failBatch of [false,true]){const {state:s,calls,rows}=preview({failBatch});s.pendingFile.value=new Blob(['zip']);Object.defineProperty(s.pendingFile.value,'name',{value:'new.zip'});await s.readBackup();assert.ok(rows.has('new'));assert.equal(calls.filter(c=>c.type==='analysis').length,1);assert.equal(s.busy.value,false);if(failBatch){assert.match(s.error.value,/1 批失败/);assert.match(Object.values(s.batchState.value)[0].error,/测试额度不足/);assert.equal(Object.values(s.batchState.value)[0].status,'failed')}else assert.equal(s.analysis.value.annotations.length,1)}
})
test('missing channel still saves upload; clicking generate explains failure without making an analysis call',async()=>{
 const {state:s,calls,rows}=preview({enabled:false});s.pendingFile.value=new Blob(['zip']);Object.defineProperty(s.pendingFile.value,'name',{value:'new.zip'});await s.readBackup();assert.ok(rows.has('new'));assert.match(s.localNotice.value,/尚未开启/);await s.generateBatches();assert.match(s.error.value,/尚未开启/);assert.equal(calls.filter(c=>c.type==='analysis').length,0);assert.equal(s.busy.value,false)
})
test('deleted legacy cache is discarded while other saved backups still load without auto-analysis on refresh',async()=>{
 const p=preview({cache:{schema:1,file:new Blob(['old']),hash:'deleted'},migrateDeleted:true});await p.mount();assert.equal(p.state.reading.value,false);assert.equal(p.state.error.value,'');assert.equal(p.state.projectId.value,'a');assert.ok(p.calls.some(c=>c.type==='cache'&&c.action==='delete'));assert.equal(p.calls.filter(c=>c.type==='analysis').length,0)
})
test('only administrators generate notes; managers keep question access and their daily limit',async()=>{
 const p=preview({canManage:false,remaining:0});p.state.acceptProject(project('a'));await p.state.generateBatches();assert.equal(p.calls.filter(c=>c.type==='run'||c.type==='analysis').length,0);assert.match(p.state.error.value,/仅系统管理员/);assert.equal(p.state.busy.value,false);
 assert.equal(p.state.canInteract.value,true);p.state.question.value='新问题';await p.state.ask('analyze');assert.match(p.state.error.value,/3次上限/);
 const allowed=preview({canManage:false});allowed.state.acceptProject(project('a'));allowed.state.question.value='解释功能';await allowed.state.ask();assert.equal(allowed.calls.filter(c=>c.type==='analysis').length,1)
})
test('one send action submits an automatic request once, without a separate modify confirmation',async()=>{
 const p=preview({confirm:async()=>assert.fail('sending a review suggestion does not need another confirmation')});p.state.acceptProject(project('a'));p.state.question.value='给等待输入增加超时，展示修改建议';await p.state.ask();const calls=p.calls.filter(c=>c.type==='analysis');assert.equal(calls.length,1);assert.equal(calls[0].body.mode,'auto');assert.equal(calls[0].body.question,'给等待输入增加超时，展示修改建议');assert.equal(p.state.question.value,'');await p.state.ask();assert.equal(p.calls.filter(c=>c.type==='analysis').length,1);
})

test('manager missing-channel guidance never invokes administrator connection check or legacy cache upload',async()=>{
 const p=preview({canManage:false,enabled:false,cache:{schema:1,file:new Blob(['old']),hash:'old'}});await p.mount();await p.state.generateBatches();assert.equal(p.calls.filter(c=>['connection','upload','analysis'].includes(c.type)).length,0);assert.match(p.state.error.value,/仅系统管理员/)
})

test('one click processes later batches after an error and retry only revisits failed work',async()=>{
 let first=true;const p=project('a');p.report.files[0].lineCount=450;
 const app=preview({projects:[p],failBatch:async body=>{if(first&&body.target.startLine===1){first=false;return {response:{status:502,data:{msg:'本批引用校验失败'}}}}return false}});app.state.acceptProject(p);await app.state.generateBatches();
 assert.deepEqual(app.calls.filter(c=>c.type==='analysis').map(c=>c.body.target.startLine),[1,151,301]);assert.equal(app.state.batchState.value['file-a:1-150'].status,'failed');assert.equal(app.state.batchState.value['file-a:301-450'].status,'done');assert.match(app.state.error.value,/1 批失败/);assert.equal(app.state.busy.value,false);
 await app.state.generateBatches();assert.deepEqual(app.calls.filter(c=>c.type==='analysis').map(c=>c.body.target.startLine),[1,151,301,1]);assert.equal(app.state.error.value,'');assert.equal(app.state.batchState.value['file-a:1-150'].status,'done');
});
test('manual pause finishes the active batch and authentication failure stops the whole queue',async()=>{
 const p=project('a');p.report.files[0].lineCount=450;let app;
 app=preview({projects:[p],failBatch:async()=>{app.state.stopBatch.value=true;return false}});app.state.acceptProject(p);await app.state.generateBatches();assert.equal(app.calls.filter(c=>c.type==='analysis').length,1);assert.match(app.state.localNotice.value,/暂停/);assert.equal(app.state.batchState.value['file-a:1-150'].status,'done');
 const denied=preview({projects:[p],failBatch:{response:{status:401,data:{msg:'请先登录'}}}});denied.state.acceptProject(p);await denied.state.generateBatches();assert.equal(denied.calls.filter(c=>c.type==='analysis').length,1);assert.match(denied.state.error.value,/任务已停止/);
});
test('unreadable files follow every readable task and configuration without changing source order',()=>{
 const p=project('a'),file=p.report.files[0];p.report.files=[{...file,id:'binary',name:'Base.mod',readable:false,task:'T_ROB1'},file,{...file,id:'cfg',kind:'config',task:''}];const app=preview({projects:[p]});app.state.acceptProject(p);assert.deepEqual(Array.from(app.state.orderedFiles.value,f=>f.id),['file-a','cfg','binary']);assert.deepEqual(Array.from(app.state.fileGroups.value,g=>g.name),['系统配置','不可读文件']);assert.equal(p.report.files[0].id,'binary');
});
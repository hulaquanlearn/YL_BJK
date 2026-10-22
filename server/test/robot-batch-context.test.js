const test=require('node:test'),assert=require('node:assert/strict');
const {contextFor,analyze,agentConfig}=require('../src/robot-agent');

function fixture(){
 const lines=Array.from({length:12000},(_,i)=>`! line ${i+1}: ${'large backup '.repeat(6)}`);
 lines[0]='MODULE BuJiu';lines[299]='PROC main()';lines[300]='WaitDI diReady,1;';lines[301]='helper;';lines[302]='ENDPROC';lines[11999]='ENDMODULE';
 const file={id:'main',path:'RAPID/TASK1/PROGMOD/BuJiu.mod',kind:'program',readable:true,task:'T_ROB1',module:'BuJiu',sha256:'module-hash',lineCount:lines.length,text:lines.join('\n'),routines:[{name:'main',startLine:300,endLine:303,calls:[{name:'helper',line:302,targets:[{fileId:'helper',line:2}]}]}]};
 const helper={...file,id:'helper',path:'RAPID/TASK1/PROGMOD/Helper.mod',module:'Helper',lineCount:5,text:'MODULE Helper\nPROC helper()\nSetDO doReady,1;\nENDPROC\nENDMODULE',routines:[{name:'helper',startLine:2,endLine:4,calls:[]}]};
 const config={...file,id:'eio',path:'SYSPAR/EIO.cfg',kind:'config',lineCount:6,text:'EIO_SIGNAL:\n-Name "diReady" -SignalType "DI"\n  -Label "允许"\n-Name "doReady" -SignalType "DO"\n#\n',routines:[]};
 return {sha256:'backup-hash',files:[file,helper,config],statistics:{modules:2},warnings:[],signals:[{fileId:'eio',line:2,name:'diReady',type:'DI',label:'允许'},{fileId:'eio',line:4,name:'doReady',type:'DO'}],hooks:[]};
}
const config=agentConfig({ROBOT_AGENT_ENABLED:'true',DEEPSEEK_API_KEY:'test'});
test('small backups keep complete readable modules so cross-module references do not fail at artificial batch gaps',async()=>{
 const report=fixture();report.files[0].text=report.files[0].text.split('\n').slice(0,509).join('\n');report.files[0].lineCount=509;
 const target={fileId:'main',startLine:151,endLine:300},context=contextFor(report,{target});
 assert.equal(context.scope.allReadableSource,true);assert.deepEqual(context.files.find(f=>f.id==='main').ranges,[{startLine:1,endLine:509}]);
 const result=await analyze(report,{config,target,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'跨模块调用',sections:[{title:'关联源码',content:'参照完整可读模块',refs:[{fileId:'main',startLine:61,endLine:138},{fileId:'helper',startLine:1,endLine:5}]}],annotations:[{fileId:'main',line:151,text:'本批范围说明'}],changes:[],questions:[]})}}]})})});
 assert.equal(result.annotations[0].line,151);
});
test('long explanations request semantic paragraph breaks and preserve decoded newlines',async()=>{
 const report=fixture(),text='【源码事实】\n1、先等待允许。\n2、再进入调用。\n\n【现场待确认】\n核对实际设备。';
 const result=await analyze(report,{config,target:{fileId:'main',startLine:300,endLine:449},fetchImpl:async(_url,options)=>{
  assert.match(JSON.parse(options.body).messages[0].content,/必须按语义换行/);
  return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:text,sections:[{title:'流程',content:text,refs:[{fileId:'main',startLine:301,endLine:301}]}],annotations:[{fileId:'main',line:301,text:'等待允许'}],changes:[],questions:[]})}}]})};
 }});
 assert.equal(result.summary,text);assert.equal(result.sections[0].content,text);
});
test('large backups send only bounded batch evidence, preserving original lines, calls and matching signal records',()=>{
 const report=fixture(),target={fileId:'main',startLine:300,endLine:449};
 assert.throws(()=>contextFor(report),e=>e.status===413);
 const context=contextFor(report,{target}),json=JSON.stringify(context);
 assert.ok(json.length<180000);assert.equal(context.scope.completeBackup,false);
 assert.match(context.files.find(f=>f.id==='main').source,/301\|WaitDI diReady,1;/);
 assert.match(context.files.find(f=>f.id==='helper').source,/3\|SetDO doReady,1;/);
 assert.match(context.files.find(f=>f.id==='eio').source,/3\|  -Label/);
 assert.equal(context.signals.length,2);assert.ok(!json.includes('line 11000:'));
 assert.equal(report.files[0].lineCount,12000);assert.match(report.files[0].text,/line 11000:/);
});
test('successive batches of an oversized backup reach the provider and reject references to unseen source',async()=>{
 const report=fixture();let calls=0;
 for(const start of [1,151,301]){
  const target={fileId:'main',startLine:start,endLine:start+149};
  const result=await analyze(report,{config,target,fetchImpl:async(_url,options)=>{
   calls++;const payload=JSON.parse(options.body),context=JSON.parse(payload.messages[1].content.split('\n').slice(1).join('\n'));
   assert.ok(JSON.stringify(context).length<180000);assert.deepEqual(context.scope.target,target);
   return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'批次说明',sections:[{title:'本批次',content:'仅描述已提供源码',refs:[{fileId:'main',startLine:start,endLine:start}]}],annotations:[{fileId:'main',line:start,text:'当前行说明'}],changes:[],questions:[]})}}]})};
  }});
  assert.equal(result.annotations[0].line,start);
 }
 assert.equal(calls,3);
 await assert.rejects(analyze(report,{config,target:{fileId:'main',startLine:1,endLine:150},fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'错误引用',sections:[{title:'未提供',content:'不应接受',refs:[{fileId:'main',startLine:11000,endLine:11000}]}],annotations:[],changes:[],questions:[]})}}]})})}),/没有返回有效注释/);
});

test('unsupported batch narrative is discarded while independently valid target annotations survive',async()=>{
 const report=fixture(),target={fileId:'main',startLine:1,endLine:150};const result=await analyze(report,{config,target,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'不应保存的未提供推断',sections:[{title:'未提供',content:'不能把未提供行当作证据',refs:[{fileId:'main',startLine:11000,endLine:11000}]}],annotations:[{fileId:'main',line:1,text:'模块声明'}],changes:[],questions:[]})}}]})})});assert.equal(result.annotations.length,1);assert.match(result.warnings.join(''),/已排除/);assert.ok(!JSON.stringify(result.sections).includes('11000'));assert.ok(!result.summary.includes('不应保存'));
});
test('program overview spans module structure with bounded, source-backed excerpts and no annotations',async()=>{
 const report=fixture();const result=await analyze(report,{config,overview:true,fetchImpl:async(_url,options)=>{const payload=JSON.parse(options.body),context=JSON.parse(payload.messages[1].content.split('\n').slice(1).join('\n'));assert.equal(context.scope.type,'program-overview');assert.ok(JSON.stringify(context).length<180000);assert.ok(context.moduleIndex.some(file=>file.fileId==='helper'));assert.match(payload.messages[0].content,/主流程/);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'主程序等待允许，随后调用helper输出完成信号。',sections:[{title:'主流程',content:'先等待允许，再调用helper。',refs:[{fileId:'main',startLine:300,endLine:303}]}],annotations:[{fileId:'main',line:301,text:'不应新增'}],changes:[],questions:[]})}}]})}}});assert.equal(result.annotations.length,0);assert.equal(result.overviewScope.type,'program-overview');
});

test('questions on large backups get bounded evidence; unseen modification ranges still fail',async()=>{const report=fixture();let called=false;const respond=changes=>async(_url,options)=>{called=true;const context=JSON.parse(JSON.parse(options.body).messages[1].content.split('\n').slice(1).join('\n'));assert.equal(context.scope.type,'program-overview');assert.ok(JSON.stringify(context).length<180000);return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'等待允许',sections:[{title:'等待',content:'先等待输入',refs:[{fileId:'main',startLine:301,endLine:301}]}],annotations:[],changes,questions:[]})}}]})}};const answer=await analyze(report,{config,allowAnnotations:false,question:'main如何工作',fetchImpl:respond([])});assert.equal(called,true);assert.equal(answer.annotations.length,0);const source=report.files[0].text.split('\n')[10999];await assert.rejects(analyze(report,{config,mode:'modify',question:'main增加超时',fetchImpl:respond([{fileId:'main',startLine:11000,endLine:11000,original:source,replacement:'! modify',reason:'测试',tests:['核对']}])}),/超出本次提供/)});

test('overview asks the model to retract unsupported claims once, then validates the replacement',async()=>{const report=fixture();for(const repairWorks of [true,false]){let calls=0;const task=analyze(report,{config,overview:true,fetchImpl:async(_url,options)=>{calls++;if(calls===2){const correction=JSON.parse(JSON.parse(options.body).messages.at(-1).content);assert.match(correction.correction,/撤回或改写/);assert.equal(correction.issue.unsupportedRefs[0].startLine,11000)}return {ok:true,text:async()=>JSON.stringify({choices:[{message:{content:JSON.stringify({summary:calls===2?'纠正后的说明':'错误说明',sections:[{title:'主流程',content:'只描述输入允许',refs:[{fileId:'main',startLine:calls===2&&repairWorks?301:11000,endLine:calls===2&&repairWorks?301:11000}]}],annotations:[],changes:[],questions:[]})}}]})}}});if(repairWorks)assert.equal((await task).summary,'纠正后的说明');else await assert.rejects(task,/引用了未提供源码/);assert.equal(calls,2)}});

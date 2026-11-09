const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver');
const {parseBackup}=require('../src/robot-backup');
const {createSimulation,advanceSimulation}=require('../src/robot-sim');
async function report(source){const zip=archiver('zip'),chunks=[],done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});zip.append('MODULE Optional\n'+source+'\nENDMODULE',{name:'Backup/RAPID/T_ROB1/PROGMOD/Optional.mod'});await zip.finalize();return parseBackup(await done,'optional.zip')}
function execute(r,options={}){const fresh=createSimulation(r,{routine:'main',...options});assert.equal(fresh.error,undefined);return advanceSimulation(r,{state:fresh.state})}
test('EXIT inside a nested loop terminates the complete program, including caller and later maintenance code',async()=>{
 const r=await report('PROC main()\ninner;\nSetDO afterCaller,1;\nENDPROC\nPROC inner()\nWHILE TRUE DO\nFOR i FROM 1 TO 3 DO\nSetDO beforeExit,1;\nEXIT;\nSetDO afterExit,1;\nENDFOR\nENDWHILE\nSetDO afterLoop,1;\nENDPROC');const o=execute(r);assert.equal(o.stop.reason,'exit');assert.equal(o.state.signals.beforeexit,1);for(const key of ['aftercaller','afterexit','afterloop'])assert.notEqual(o.state.signals[key],1);
});
test('Present distinguishes omitted optional values from supplied FALSE/zero in functions and procedures',async()=>{
 const r=await report('PROC main()\nSetGO absent,flag();\nSetGO zero,flag(\\value:=0);\nSetGO falseValue,flag(\\value:=FALSE);\ncheck;\ncheck\\on;\nENDPROC\nFUNC num flag(\\num value)\nIF Present(value) THEN\nRETURN 1;\nELSE\nRETURN 0;\nENDIF\nENDFUNC\nPROC check(\\switch on)\nIF Present(on) THEN\nSetDO switched,1;\nELSE\nSetDO omitted,1;\nENDIF\nENDPROC');const o=execute(r);assert.equal(o.stop.type,'end');assert.equal(o.state.signals.absent,0);assert.equal(o.state.signals.zero,1);assert.equal(o.state.signals.falsevalue,1);assert.equal(o.state.signals.omitted,1);assert.equal(o.state.signals.switched,1);
});
test('optional INOUT binding survives a wait checkpoint and writes back to its named caller variable',async()=>{
 const r=await report('VAR num x:=4;\nPROC main()\nincreaseValue 3\\target:=x;\nSetGO answer,x;\nENDPROC\nPROC increaseValue(num delta\\INOUT num target)\nWaitTime 1;\nIF Present(target) target:=target+delta;\nENDPROC');let o=execute(r);assert.equal(o.stop.type,'wait');o=advanceSimulation(r,{state:JSON.parse(JSON.stringify(o.state)),elapsed:1});assert.equal(o.stop.type,'end');assert.equal(o.state.signals.answer,7);
});
test('optional parameters on an entry routine may be omitted or supplied with case-insensitive names',async()=>{
 const r=await report('PROC main(\\num value)\nIF Present(value) THEN\nSetGO answer,value;\nELSE\nSetGO answer,9;\nENDIF\nENDPROC');assert.equal(execute(r).state.signals.answer,9);assert.equal(execute(r,{parameters:{VALUE:0}}).state.signals.answer,0);
});
test('reading an absent parameter or testing a non-optional variable blocks explicitly',async()=>{
 for(const body of ['SetGO answer,value;','IF Present(x) SetDO answer,1;']){const r=await report('VAR num x:=0;\nPROC main(\\num value)\n'+body+'\nENDPROC'),o=execute(r);assert.equal(o.stop.type,'blocked');assert.ok(/optional-absent|present-parameter/.test(o.stop.code))}
});
test('OpMode uses explicit offline mode and retains a source Stop outside manual mode',async()=>{
 const r=await report('PROC main()\nWHILE OpMode()<>OP_MAN_PROG DO\nStop;\nENDWHILE\nSetDO returned,1;\nENDPROC');assert.equal(execute(r,{operatingMode:1}).stop.type,'pause');assert.equal(execute(r,{operatingMode:2}).state.signals.returned,1);assert.equal(createSimulation(r,{routine:'main',operatingMode:99}).error.code,'operating-mode-invalid');
});

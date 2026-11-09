const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver'),express=require('express');
const {parseBackup}=require('../src/robot-backup');
const {createSimulation,advanceSimulation,Blocked}=require('../src/robot-sim');

async function zipFiles(files){const zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});for(const [name,text]of Object.entries(files))zip.append(text,{name});await zip.finalize();return done}
test('VelSet and custom orientation speed persist across motion checkpoints; restart restores defaults',async()=>{
  const source=`MODULE Speed\nCONST jointtarget j:=[[0,0,0,0,90,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\nVAR speeddata v:=[5000,120,200,500];\nPROC main()\nVelSet 50,800;\nAccSet 60,70;\nMoveAbsJ j,v,fine,tool0;\nMoveAbsJ j,v,fine,tool0;\nENDPROC\nENDMODULE`;
  const parsed=await parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Speed.mod':source}),'speed.zip');
  const fresh=createSimulation(parsed,{routine:'main'});const first=advanceSimulation(parsed,{state:fresh.state,stopOnMotion:true});
  assert.deepEqual(first.events.find(e=>e.type==='motion').speed,{ref:'v',tcp:5000,orientation:120,override:50,maxTcp:800,acceleration:60,ramp:70});
  const next=advanceSimulation(parsed,{state:first.state,stopOnMotion:true});assert.equal(next.events.find(e=>e.type==='motion').speed.override,50);
  assert.equal(createSimulation(parsed,{routine:'main'}).state.motionSettings,undefined);
});
test('XOR 真值表与嵌套现场维修条件可编译并选择正确分支',async()=>{
  const source=`MODULE Logic
    PROC main()
      IF (di20=1 OR di21=1 OR pdOK=1 OR (di25=1 XOR di26=1)) AND di102=1 THEN
        SetDO do1,1;
      ELSE
        SetDO do1,0;
      ENDIF
    ENDPROC
  ENDMODULE`;
  const parsed=await parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Logic.mod':source}),'logic.zip');
  for(const [a,b] of [[0,0],[0,1],[1,0],[1,1]])for(const enabled of [0,1]){
    const created=createSimulation(parsed,{routine:'main',signals:{di20:0,di21:0,pdOK:0,di25:a,di26:b,di102:enabled}});assert.equal(created.error,undefined);
    const result=advanceSimulation(parsed,{state:created.state});assert.equal(result.stop.type,'end');assert.equal(result.state.signals.do1,Number(enabled&&a!==b));
  }
});
test('RAPID OR/XOR 同级左结合、AND 优先于 NOT，括号可改变顺序',async()=>{
  for(const [expression,expected] of [['TRUE OR TRUE XOR TRUE',false],['TRUE XOR TRUE AND FALSE',true],['NOT FALSE AND FALSE',true],['(NOT FALSE) AND FALSE',false],['NOT TRUE XOR TRUE',true]]){
    const source=`MODULE Logic\nPROC main()\nIF ${expression} THEN\nSetDO do1,1;\nELSE\nSetDO do1,0;\nENDIF\nENDPROC\nENDMODULE`;
    const parsed=await parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Logic.mod':source}),'logic.zip');
    const result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'main'}).state});assert.equal(result.stop.type,'end',expression);assert.equal(result.state.signals.do1,Number(expected),expression);
  }
});
test('TEST 多值 CASE 只执行首个匹配分支，未命中执行 DEFAULT',async()=>{
  for(const [choice,expected] of [[1,7],[2,7],[3,8],[4,9]]){
    const source=`MODULE Cases\nPROC main()\nTEST ${choice}\nCASE 1,2:\nSetGO result,7;\nCASE 2,3:\nSetGO result,8;\nDEFAULT:\nSetGO result,9;\nENDTEST\nENDPROC\nENDMODULE`;
    const parsed=await parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Cases.mod':source}),'case.zip');
    const result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'main'}).state});assert.equal(result.stop.type,'end');assert.equal(result.state.signals.result,expected);
  }
  const source='MODULE Cases\nPROC main()\nTEST "A,B"\nCASE "A,B","C":\nSetDO do1,1;\nDEFAULT:\nSetDO do1,0;\nENDTEST\nENDPROC\nENDMODULE';
  const parsed=await parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Cases.mod':source}),'case.zip');assert.equal(advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'main'}).state}).state.signals.do1,1);
});
const program=`MODULE MainModule
  CONST robtarget p1:=[[100,0,300],[1,0,0,0],[0,0,0,0],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
  PERS jointtarget jHome:=[[0,0,0,0,30,0],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
  PERS jointtarget jOther:=[[10,20,30,40,50,60],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
  PERS num counter;
  PERS robtarget pMissing;
  PERS tooldata tool1:=[TRUE,[[15,0,0],[1,0,0,0]],[10,[0,0,0],[1,0,0,0],0,0,0]];
  PERS wobjdata wobj_1:=[FALSE,TRUE,"",[[100,50,0],[0,0,0.7071068,0.7071068]],[[0,0,0],[1,0,0,0]]];
  VAR speeddata v500:=[500,500,5000,1000];
  PROC main()
    MoveAbsJ jHome,v500,z50,tool0\\WObj:=wobj0;
    WaitDI di1,1;
    SetDO do1,1;
    IF di2=1 THEN
      MoveL p1,v500,fine,tool1\\WObj:=wobj_1;
    ELSE
      MoveAbsJ jHome,v500,z10,tool0;
    ENDIF
    counter:=counter+1;
    FOR counter FROM 1 TO 2 DO
      MoveAbsJ jHome,v500,z10,tool0;
    ENDFOR
    ExitCycle;
  ENDPROC
  PROC solvePath()
    MoveL p1,v500,fine,tool1\\WObj:=wobj_1;
  ENDPROC
  PROC roundtrip()
    VAR jointtarget j1:=[[10,20,30,40,50,60],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
    VAR robtarget pRound;
    pRound:=CalcRobT(j1,tool1\\WObj:=wobj_1);
    MoveL pRound,v500,fine,tool1\\WObj:=wobj_1;
  ENDPROC
  PROC syncSub()
    MoveAbsJ jOther,v500,z10,tool0;
  ENDPROC
  PROC syncPath()
    syncSub;
    MoveAbsJ jHome,v500,z10,tool0;
  ENDPROC
  PROC twoMoves()\n    MoveAbsJ jOther,v500,z10,tool0;\n    MoveAbsJ jHome,v500,z10,tool0;\n    MoveAbsJ jOther,v500,z10,tool0;\n  ENDPROC
  PROC missingPath()
    MoveL pMissing,v500,fine,tool0\\WObj:=wobj0;
  ENDPROC
  PROC controlPath()
    StopMove;
    MoveAbsJ jHome,v500,z10,tool0;
    StartMove;
    AccSet 50,10;
  ENDPROC
  PROC trigPath()
    TriggL p1,v500,trig1,z50,tool0;
  ENDPROC
  FUNC num twice(num a)
    RETURN a*2;
  ENDFUNC
  PROC flowPath(num mode)
    VAR num total;
    VAR num k;
    IF mode = 1 THEN
      total:=twice(5);
    ELSEIF mode = 2 THEN
      total:=99;
    ELSE
      total:=1;
    ENDIF
    FOR k FROM 1 TO 3 DO
      total:=total+k;
    ENDFOR
    WHILE total < 20 DO
      total:=total+10;
    ENDWHILE
    TEST total
    CASE 20:
      SetDO do1,1;
    CASE 30:
      SetDO do1,0;
    DEFAULT:
      SetDO do1,1;
    ENDTEST
    SetGO pngo30,total;
    GOTO done;
    SetDO do1,0;
  done:
  ENDPROC
  PROC incHelper(num value)
    SetGO pngo31,value;
  ENDPROC
  PROC incPath()
    counter:=0;
    Incr counter;
    Incr counter;
    SetGO pngo30,counter;
    incHelper 5;
  ENDPROC
  PROC toolArgPath()
    VAR jointtarget j;
    j:=CalcJointT(p1,tool0\\WObj:=wobj0);
  ENDPROC
  PROC trapPath()
    VAR intnum trap1;
    CONNECT trap1 WITH trapHandler;
    ISignalDi di2,1,trap1;
    IWatch trap1;
    SetGO pngo30,1;
  ENDPROC
  TRAP trapHandler()
    SetGO pngo31,1;
  ENDTRAP
  PROC guardPath(num mode)
    IF mode = 1 THEN
      SetDO do1,1;
    ELSE
      SetDO do1,0;
    ENDIF
    SetGO pngo30,7;
  ENDPROC
  PROC nestedPath(num a,num b)
    IF a = 1 THEN
      IF b = 1 THEN
        SetDO do1,1;
      ELSE
        SetDO do1,0;
      ENDIF
    ELSE
      SetDO do1,0;
    ENDIF
    SetGO pngo30,9;
  ENDPROC
  PROC unknownPath()
    Foo bar;
  ENDPROC
ENDMODULE
`;
const config='EIO:CFG_1.0:6:1::\n#\nEIO_SIGNAL:\n-Name "di1" -SignalType "DI" -Label "允许启动"\n-Name "di2" -SignalType "DI" -Label "直行分支"\n-Name "do1" -SignalType "DO" -Label "已启动"\n#\n';
async function report(){return parseBackup(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Main.mod':program,'Backup/SYSPAR/EIO.cfg':config,'Backup/BACKINFO/backinfo.txt':'RobotWare Version: 6.08\n IRB 6700-150/3.20\n>>TASK1: (T_ROB1,program,)'}),'仿真示例.zip')}

test('初始关节可指定，子例程运动同步父frame关节',async()=>{
  const parsed=await report();
  const created=createSimulation(parsed,{routine:'syncPath',joints:[5,6,7,8,9,10]});
  assert.deepEqual(created.state.stack[0].robotJoints,[5,6,7,8,9,10]);
  let result=advanceSimulation(parsed,{state:created.state});
  assert.equal(result.stop.type,'yield');assert.equal(result.stop.reason,'motion');
  assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  const firstMotion=result.events.find(event=>event.type==='motion');
  assert.deepEqual(firstMotion.from,[5,6,7,8,9,10]);
  assert.deepEqual(firstMotion.to,[10,20,30,40,50,60]);
  assert.deepEqual(result.state.stack[0].robotJoints,[10,20,30,40,50,60]);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'yield');
  assert.deepEqual(result.events[0].from,[10,20,30,40,50,60]);
  assert.equal(result.state.stack.length,1);
  assert.deepEqual(result.state.stack[0].robotJoints,[0,0,0,0,30,0]);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'end');
});

test('每次响应最多包含一段运动，默认运动即yield，可继续执行下一段',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'twoMoves'}).state});
  assert.equal(result.stop.type,'yield');assert.equal(result.stop.reason,'motion');
  assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  const secondPc=result.state.stack[0].pc;
  result=advanceSimulation(parsed,{state:result.state,stopOnMotion:false});
  assert.equal(result.stop.type,'yield');assert.equal(result.stop.reason,'next-motion');
  assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  assert.equal(result.state.stack[0].pc,secondPc+1);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'yield');assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'end');
});

test('仿真按源码执行、在真实等待行停下，用户信号满足后继续',async()=>{
  const parsed=await report();
  let state=createSimulation(parsed,{routine:'main'}).state;
  let result=advanceSimulation(parsed,{state});
  assert.equal(result.stop.type,'yield');assert.equal(result.events.length,1);
  state=result.state;
  result=advanceSimulation(parsed,{state});
  assert.equal(result.stop.type,'wait');assert.equal(result.stop.signal,'di1');assert.equal(result.stop.expected,1);
  state=result.state;
  result=advanceSimulation(parsed,{state,signals:{di1:1}});
  assert.ok(result.events.some(event=>event.type==='io'&&event.signal==='do1'&&event.value===1));
  assert.equal(result.stop.type,'yield');assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  state=result.state;
  result=advanceSimulation(parsed,{state});
  assert.equal(result.stop.type,'yield');assert.equal(result.events.filter(event=>event.type==='motion').length,1);
  state=result.state;
  result=advanceSimulation(parsed,{state});
  assert.equal(result.stop.type,'yield');
  state=result.state;
  result=advanceSimulation(parsed,{state});
  assert.equal(result.stop.type,'end');assert.equal(result.stop.reason,'exit');
  assert.equal(result.state.globals.counter,3);
  assert.equal(result.state.signals.do1,1);
});

test('笛卡尔运动请求查看器IK并逐段返回；求解失败按原行blocked',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'solvePath'}).state});
  assert.equal(result.stop.type,'robot-solve');assert.equal(result.stop.request.kind,'ik');
  assert.equal(result.stop.request.frame,'flange');assert.deepEqual(result.stop.request.seed,[0,0,0,0,90,0]);
  assert.equal(result.stop.fileId,'file-1');assert.equal(result.stop.routine,'solvePath');
  const motionLine=result.stop.line;assert.equal(typeof motionLine,'number');
  const failed=advanceSimulation(parsed,{state:result.state,solve:{error:{code:'ik-failed',message:'不可达'}}});
  assert.equal(failed.stop.type,'blocked');assert.equal(failed.stop.code,'ik-failed');assert.equal(failed.stop.line,motionLine);
  assert.ok(failed.state.pendingSolve);
  const invalid=advanceSimulation(parsed,{state:failed.state,solve:{pose:{pos:[NaN,0,0],quat:[1,0,0,0]}}});
  assert.equal(invalid.stop.type,'blocked');assert.equal(invalid.stop.code,'solve-invalid');
  const joints=[11,22,33,44,55,66];
  result=advanceSimulation(parsed,{state:invalid.state,solve:{joints}});
  assert.equal(result.stop.type,'yield');assert.equal(result.events.length,1);
  assert.deepEqual(result.events[0].joints,joints);assert.equal(result.events[0].straight,true);
  assert.equal(result.events[0].fileId,'file-1');assert.equal(result.events[0].routine,'solvePath');
  assert.ok(result.events[0].toolPose&&Number.isFinite(result.events[0].toolPose.pos[0]));assert.ok(result.events[0].wobjPose);
  assert.deepEqual(result.state.stack[0].robotJoints,joints);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'end');
});

test('CalcRobT 按官方语义 jointtarget→robtarget，非零工具/工件往返得到同一关节',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'roundtrip'}).state});
  assert.equal(result.stop.type,'robot-solve');assert.equal(result.stop.request.kind,'fk');
  assert.deepEqual(result.stop.request.joints,[10,20,30,40,50,60]);
  const flange={pos:[500,120,800],quat:[0.9238795,0,0.3826834,0]};
  result=advanceSimulation(parsed,{state:result.state,solve:{pose:flange}});
  assert.equal(result.stop.type,'robot-solve');assert.equal(result.stop.request.kind,'ik');
  const request=result.stop.request;
  assert.ok(Math.abs(request.pose.pos[0]-flange.pos[0])<1e-6);
  assert.ok(Math.abs(request.pose.pos[1]-flange.pos[1])<1e-6);
  assert.ok(Math.abs(request.pose.pos[2]-flange.pos[2])<1e-6);
  const dot=request.pose.quat.reduce((sum,value,index)=>sum+value*flange.quat[index],0);
  assert.ok(Math.abs(Math.abs(dot)-1)<1e-6);
  assert.notDeepEqual(request.tool.tcp,[0,0,0]);assert.notDeepEqual(request.wobj.pos,[0,0,0]);
  result=advanceSimulation(parsed,{state:result.state,solve:{joints:[10,20,30,40,50,60]}});
  assert.equal(result.stop.type,'yield');assert.deepEqual(result.events[0].joints,[10,20,30,40,50,60]);
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'end');
});

test('缺失PERS可由用户显式输入，不要求前端改state；参数与输入校验',async()=>{
  const parsed=await report();
  const bare=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'missingPath'}).state});
  assert.equal(bare.stop.type,'blocked');assert.equal(bare.stop.code,'motion-target');
  assert.ok(Array.isArray(bare.stop.needs)&&bare.stop.needs.length===1);assert.equal(bare.stop.routine,'missingPath');
  const created=createSimulation(parsed,{routine:'missingPath',variables:{pMissing:[[100,0,300],[1,0,0,0],[0,0,0,0],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]]}});
  assert.ok(created.state);assert.equal(created.state.globals.pmissing.kind,'robtarget');
  const result=advanceSimulation(parsed,{state:created.state});
  assert.equal(result.stop.type,'robot-solve');assert.equal(result.stop.request.kind,'ik');
  assert.deepEqual(result.stop.request.target.pos,[100,0,300]);
  assert.equal(createSimulation(parsed,{routine:'missingPath',variables:{nope:1}}).error.code,'variables-invalid');
  assert.equal(createSimulation(parsed,{routine:'missingPath',variables:{pMissing:1}}).error.code,'variables-invalid');
  assert.equal(createSimulation(parsed,{routine:'main',joints:[1,2,3]}).error.code,'joints-invalid');
  assert.equal(createSimulation(parsed,{routine:'main',joints:[1,2,3,4,5,NaN]}).error.code,'joints-invalid');
});

test('maxSteps 与求解结果做有限性/范围校验',async()=>{
  const parsed=await report();
  const created=createSimulation(parsed,{routine:'twoMoves'});
  assert.throws(()=>advanceSimulation(parsed,{state:created.state,maxSteps:0}),error=>error instanceof Blocked&&error.code==='max-steps-invalid');
  assert.throws(()=>advanceSimulation(parsed,{state:created.state,maxSteps:999999}),error=>error instanceof Blocked&&error.code==='max-steps-invalid');
  assert.throws(()=>advanceSimulation(parsed,{state:created.state,maxSteps:1.5}),error=>error instanceof Blocked&&error.code==='max-steps-invalid');
  const invalidState={...created.state,stack:[{...created.state.stack[0],robotJoints:[1,2,3]}]};
  assert.throws(()=>advanceSimulation(parsed,{state:invalidState}),error=>error instanceof Blocked&&error.code==='state-invalid');
});

test('StopMove/StartMove 有标记事件，TriggL 保留触发参数，不静默跳过',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'controlPath'}).state});
  assert.equal(result.stop.type,'yield');
  const markers=result.events.filter(event=>event.type==='marker').map(event=>event.instruction);
  assert.deepEqual(markers,['StopMove']);
  assert.ok(result.events.some(event=>event.type==='motion'&&event.instruction==='MoveAbsJ'));
  result=advanceSimulation(parsed,{state:result.state});
  assert.equal(result.stop.type,'end');
  assert.deepEqual(result.events.filter(event=>event.type==='marker').map(event=>event.instruction),['StartMove','AccSet']);
  let trig=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'trigPath'}).state});
  assert.equal(trig.stop.type,'robot-solve');
  trig=advanceSimulation(parsed,{state:trig.state,solve:{joints:[11,22,33,44,55,66]}});
  assert.equal(trig.stop.type,'yield');
  assert.equal(trig.events[0].instruction,'TriggL');assert.equal(trig.events[0].trigger,'trig1');
});

test('IF/ELSEIF、FOR、WHILE、TEST、FUNC、GOTO 按源码执行；未知语句停原行',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'flowPath',parameters:{mode:1}}).state});
  assert.equal(result.stop.type,'end');
  assert.equal(result.state.signals.do1,1);
  assert.equal(result.state.signals.pngo30,26);
  const branch=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'flowPath',parameters:{mode:2}}).state});
  assert.equal(branch.stop.type,'end');assert.equal(branch.state.signals.pngo30,105);assert.equal(branch.state.signals.do1,1);
  const other=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'flowPath',parameters:{mode:3}}).state});
  assert.equal(other.stop.type,'end');assert.equal(other.state.signals.pngo30,27);assert.equal(other.state.signals.do1,1);
  const unknown=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'unknownPath'}).state});
  assert.equal(unknown.stop.type,'blocked');assert.equal(unknown.stop.routine,'unknownPath');
  assert.ok(['unparsed-statement','unknown-routine'].includes(unknown.stop.code));assert.ok(unknown.stop.line>0);
});

test('无括号调用、Incr 与 CalcJointT 的 tool0 位置参数按源码执行',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'incPath'}).state});
  assert.equal(result.stop.type,'end');assert.equal(result.state.globals.counter,2);
  assert.equal(result.state.signals.pngo30,2);assert.equal(result.state.signals.pngo31,5);
  result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'toolArgPath'}).state});
  assert.equal(result.stop.type,'robot-solve');assert.equal(result.stop.request.kind,'ik');
  assert.equal(result.stop.request.continuous,false,'CalcJointT calculates a target; it is not a MoveL path');
  assert.equal(result.stop.request.normalizeTurns,false,'calculation preserves the selected absolute joint turns');
  result=advanceSimulation(parsed,{state:result.state,solve:{joints:[1,2,3,4,5,6]}});
  assert.equal(result.stop.type,'end');
});

test('IF 真分支不落入 ELSE，嵌套 IF/ELSE 按源码分支执行',async()=>{
  const parsed=await report();
  const run=async(routine,parameters)=>{let state=createSimulation(parsed,{routine,parameters}).state,stop;for(let i=0;i<20;i++){const result=advanceSimulation(parsed,{state});state=result.state;stop=result.stop;if(stop.type==='end'||stop.type==='blocked')break}return {state,stop}};
  const guard1=await run('guardPath',{mode:1});
  assert.equal(guard1.stop.type,'end');assert.equal(guard1.state.signals.do1,1);assert.equal(guard1.state.signals.pngo30,7);
  const guard2=await run('guardPath',{mode:2});
  assert.equal(guard2.state.signals.do1,0);
  const nested=await run('nestedPath',{a:1,b:1});
  assert.equal(nested.state.signals.do1,1);assert.equal(nested.state.signals.pngo30,9);
  const nestedElse=await run('nestedPath',{a:1,b:0});
  assert.equal(nestedElse.state.signals.do1,0);
  const nestedOuter=await run('nestedPath',{a:2,b:1});
  assert.equal(nestedOuter.state.signals.do1,0);
});

test('TRAP 配置记录但不静默执行；触发条件满足时停在真实行',async()=>{
  const parsed=await report();
  let result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'trapPath',signals:{di2:0}}).state});
  assert.equal(result.stop.type,'end');
  result=advanceSimulation(parsed,{state:createSimulation(parsed,{routine:'trapPath',signals:{di2:1}}).state});
  assert.equal(result.stop.type,'blocked');assert.equal(result.stop.code,'trap-triggered');
  assert.equal(result.stop.routine,'trapPath');assert.ok(result.stop.line>0);
  assert.equal(result.state.traps.trap1.active,true);
});

test('maxSteps:1 单步协议每次最多一段运动，不越过未处理运动',async()=>{
  const parsed=await report();
  let state=createSimulation(parsed,{routine:'main'}).state,motions=0,steps=0,stop;
  while(steps++<60){
    const result=advanceSimulation(parsed,{state,signals:{di1:1},maxSteps:1,stopOnMotion:true});
    assert.ok(result.events.filter(event=>event.type==='motion').length<=1);
    motions+=result.events.filter(event=>event.type==='motion').length;
    state=result.state;stop=result.stop;
    if(stop.type==='robot-solve'){const solved=advanceSimulation(parsed,{state,signals:{di1:1},maxSteps:1,solve:{joints:[0,0,0,0,90,0]}});state=solved.state;stop=solved.stop;continue}
    if(stop.type==='end')break;
  }
  assert.equal(stop.type,'end');
  assert.equal(motions,4);
  assert.ok(steps<60);
});


test('仿真接口与查看备份同权限、无AI调用、状态不落库',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createLibrary}=require('../src/robot-library');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-sim-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const library=createLibrary(root),saved=await library.upload(await zipFiles({'Backup/RAPID/TASK1/PROGMOD/Main.mod':program,'Backup/SYSPAR/EIO.cfg':config}),'仿真示例.zip');
  let aiCalls=0;
  const app=express();app.use((req,_res,next)=>{if(req.get('Authorization')==='viewer')req.user={id:2,role:'viewer'};next()});
  app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library,config:{enabled:false},analyzeImpl:async()=>{aiCalls++;throw new Error('不应调用AI')}}));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({msg:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}/api/robot-program`,headers={Authorization:'viewer','Content-Type':'application/json'};
  assert.equal((await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routine:'main'})})).status,401);
  let response=await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers,body:JSON.stringify({routine:'main',joints:[1,2,3,4,5,6]})});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  let data=(await response.json()).data;assert.equal(data.stop.type,'ready');assert.deepEqual(data.state.stack[0].robotJoints,[1,2,3,4,5,6]);
  response=await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers,body:JSON.stringify({state:data.state})});
  data=(await response.json()).data;assert.equal(data.stop.type,'yield');assert.equal(data.events.length,1);
  response=await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers,body:JSON.stringify({state:data.state})});
  data=(await response.json()).data;assert.equal(data.stop.type,'wait');
  assert.equal((await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers,body:JSON.stringify({state:data.state,maxSteps:0})})).status,400);
  const stale=await fetch(base+'/library/'+saved.id+'/simulate',{method:'POST',headers,body:JSON.stringify({state:{...data.state,sourceHash:'other'}})});
  assert.equal(stale.status,409);
  assert.equal(aiCalls,0);assert.equal((await library.get(saved.id)).revision,saved.revision);
});

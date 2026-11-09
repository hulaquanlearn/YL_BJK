const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver'),express=require('express');
const {parseBackup}=require('../src/robot-backup');
const {buildMotionPlan,SCHEMA}=require('../src/robot-motion');

async function zipFiles(files){const zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',c=>chunks.push(c));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});for(const [name,text]of Object.entries(files))zip.append(text,{name});await zip.finalize();return done}
const program=`MODULE MainModule
  CONST robtarget p1:=[[100,0,300],[1,0,0,0],[0,0,0,0],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
  PERS robtarget pRuntime;
  PERS jointtarget j1:=[[0,0,0,0,30,0],[9E+9,9E+9,9E+9,9E+9,9E+9,9E+9]];
  PERS jointtarget jRuntime;
  PERS tooldata tool1:=[TRUE,[[0,0,0],[1,0,0,0]],[130,[-93.1,-1.5,401],[1,0,0,0],0,0,0]];
  PERS wobjdata wobj_1:=[FALSE,TRUE,"",[[0,0,0],[1,0,0,0]],[[0,0,0],[0.885475,0,0,0.464687]]];
  VAR speeddata v500:=[500,500,5000,1000];
  PROC main()
    MoveAbsJ j1\\NoEOffs,v1000,z50,tool0\\WObj:=wobj0;
    MoveL p1,v500,z10,tool1\\WObj:=wobj_1;
    MoveL pRuntime,v500,fine,tool0;
    MoveAbsJ jRuntime\\NoEOffs,v1000,z50,tool0;
    MoveL Offs(p1,0,0,100),v500,z10,tool0;
    MoveL CalcRobT(p1,tool0),v500,z10,tool0;
    MoveL p1{1},v500,z10,tool0;
    TriggL p1,v500,trig1,z50,tool0;
    MoveC p1,p1,v500,z10,tool0;
    IF di1=1 THEN
      MoveL p1,v500,z10,tool0;
    ENDIF
  ENDPROC
  PROC staticOnly()
    MoveL p1,v500,z10,tool0;
  ENDPROC
ENDMODULE
`;
const config='EIO:CFG_1.0:6:1::\n#\nEIO_SIGNAL:\n-Name "di1" -SignalType "DI" -Label "允许启动"\n#\n';
async function example(){return zipFiles({'Backup/RAPID/TASK1/PROGMOD/Main.mod':program,'Backup/SYSPAR/EIO.cfg':config,'Backup/BACKINFO/backinfo.txt':'RobotWare Version: 6.08\n IRB 6700-150/3.20\n>>TASK1: (T_ROB1,program,)'})}

test('运动计划只从源码推导静态目标、工具/工件与诊断，不猜测运行时值',async()=>{
  const report=await parseBackup(await example(),'示例.zip'),{plan}=buildMotionPlan(report);
  assert.equal(plan.schema,SCHEMA);assert.equal(plan.sourceHash,report.sha256);assert.equal(plan.robot.model,'IRB 6700-150/3.20');
  const counts=plan.capabilities.counts;
  assert.equal(counts.motion,11);assert.equal(counts.static,6);assert.equal(counts.unresolved,5);
  assert.equal(counts.byInstruction.MoveAbsJ,2);assert.equal(counts.byInstruction.TriggL,1);assert.equal(counts.byInstruction.MoveC,1);
  assert.equal(plan.frames.tools.find(tool=>tool.name==='tool1').mass,130);
  assert.deepEqual(plan.frames.wobjs.find(wobj=>wobj.name==='wobj_1').oframe.quat,[0.885475,0,0,0.464687]);
  const main=buildMotionPlan(report,{routine:'file-1:main'}).plan;
  assert.equal(main.actions.length,10);assert.equal(main.routine.preview,'blocked');
  const [absJoint,lNamed,lRuntime,absRuntime,lOffs,lComputed,lIndexed,lTrigg,lCircle,lBranch]=main.actions;
  assert.equal(absJoint.instruction,'MoveAbsJ');assert.deepEqual(absJoint.target.joints,[0,0,0,0,30,0]);assert.equal(absJoint.target.resolution,'static');
  assert.equal(lNamed.target.resolution,'static');assert.deepEqual(lNamed.target.pose.pos,[100,0,300]);
  assert.equal(lNamed.wobj.ref,'wobj_1');assert.equal(lNamed.wobj.resolution,'static');assert.equal(lNamed.tool.ref,'tool1');
  assert.equal(lNamed.speed.ref,'v500');assert.deepEqual(lNamed.speed.data,{tcp:500,ori:500,leax:5000,reax:1000});
  assert.equal(lRuntime.target.resolution,'runtime');assert.equal(lRuntime.target.ref,'pRuntime');
  assert.equal(absRuntime.target.resolution,'runtime');
  assert.equal(lOffs.target.resolution,'static');assert.deepEqual(lOffs.target.offset,[0,0,100]);assert.deepEqual(lOffs.target.pose.pos,[100,0,400]);assert.equal(lOffs.target.baseRef,'p1');
  assert.equal(lComputed.target.resolution,'computed');assert.equal(lComputed.target.name,'CalcRobT');
  assert.equal(lIndexed.target.resolution,'indexed');assert.equal(lIndexed.target.name,'p1');
  assert.equal(lTrigg.target.resolution,'static');assert.equal(lTrigg.zone.ref,'z50');
  assert.equal(lCircle.target.resolution,'static');
  assert.equal(lBranch.target.resolution,'static');assert.ok(lBranch.context.some(item=>item.type==='IF'&&item.text==='di1=1'));
  assert.equal(plan.diagnosticsSummary.byCode['runtime-target'],2);
  assert.ok(plan.diagnosticsSummary.byCode['computed-target']===1);
  assert.ok(plan.diagnosticsSummary.byCode['indexed-target']===1);
  assert.ok(plan.diagnosticsSummary.byCode['unsupported-instruction']===1);
  assert.ok(plan.simulationInputs.some(item=>item.kind==='signal'&&item.name==='di1'));
  assert.ok(plan.entries.some(item=>item.name==='main'&&item.kind==='main'));
  const staticOnly=buildMotionPlan(report,{routine:'staticOnly'}).plan;
  assert.equal(staticOnly.routine.preview,'static');assert.equal(staticOnly.actions.length,1);
  assert.deepEqual(staticOnly.diagnostics,[]);
});

test('运动计划确定性输出且未知例程明确拒绝，不静默返回空计划',async()=>{
  const report=await parseBackup(await example(),'示例.zip');
  const first=buildMotionPlan(report),second=buildMotionPlan(report);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(first).includes('originalBytes'),false);
  const unknown=buildMotionPlan(report,{routine:'no_such_routine'});
  assert.equal(unknown.error.code,'unknown-routine');assert.equal(unknown.plan.actions,undefined);
  assert.equal(buildMotionPlan(report,{routine:'main'}).plan.routine.name,'main');
});

test('只读运动计划接口与查看备份同权限，不调用AI、不改变记录',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createLibrary}=require('../src/robot-library');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'robot-motion-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const library=createLibrary(root),bytes=await example(),saved=await library.upload(bytes,'运动示例.zip');
  let aiCalls=0;
  const app=express();app.use((req,_res,next)=>{if(req.get('Authorization')==='viewer')req.user={id:2,role:'viewer'};if(req.get('Authorization')==='admin')req.user={id:1,role:'admin'};next()});
  app.use('/api/robot-program',require('../src/routes/robot-program').createRouter({library,config:{enabled:false},analyzeImpl:async()=>{aiCalls++;throw new Error('不应调用AI')}}));
  app.use((e,_req,res,_next)=>res.status(e.status||500).json({msg:e.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}/api/robot-program`;
  assert.equal((await fetch(base+'/library/'+saved.id+'/motion')).status,401);
  let response=await fetch(base+'/library/'+saved.id+'/motion',{headers:{Authorization:'viewer'}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const plan=(await response.json()).data;assert.equal(plan.schema,SCHEMA);assert.equal(plan.sourceHash,saved.report.sha256);assert.equal(plan.routine,undefined);
  response=await fetch(base+'/library/'+saved.id+'/motion?routine='+encodeURIComponent('file-1:main'),{headers:{Authorization:'viewer'}});
  assert.equal(response.status,200);assert.equal((await response.json()).data.actions.length,10);
  assert.equal((await fetch(base+'/library/'+saved.id+'/motion?routine=nope',{headers:{Authorization:'viewer'}})).status,400);
  assert.equal((await fetch(base+'/library/'+saved.id+'/motion?routine='+'x'.repeat(201),{headers:{Authorization:'viewer'}})).status,400);
  assert.equal(aiCalls,0);assert.equal((await library.get(saved.id)).revision,saved.revision);
});

const test=require('node:test'),assert=require('node:assert/strict'),archiver=require('archiver');
const {parseBackup}=require('../src/robot-backup'),{createSimulation,advanceSimulation,requestCellAutoFeed}=require('../src/robot-sim');
async function report(source){const zip=archiver('zip'),chunks=[];const done=new Promise((resolve,reject)=>{zip.on('data',b=>chunks.push(b));zip.on('end',()=>resolve(Buffer.concat(chunks)));zip.on('error',reject)});zip.append(source,{name:'Backup/RAPID/TASK1/PROGMOD/Cell.mod'});await zip.finalize();return parseBackup(await done,'cell.zip')}
function run(r,name='main'){let out=createSimulation(r,{routine:name});for(let i=0;i<100;i++){out=advanceSimulation(r,{state:out.state});if(!['yield','limit'].includes(out.stop.type))return out}throw Error('loop')}
test('protected local-height feedback updates the layer offset used by BuJiu layer/cover branches',async()=>{
 const {createDepositGrid,depositSegment}=require('../src/robot-deposit-grid'),{readSurfaceFeedback}=require('../src/robot-deposit-state');
 const r=await report(`MODULE M
 PERS num nDisZOffs:=500;
 PERS num gaiding:=0;
 PERS num cengshu:=0;
 PERS num gaidingqidianJISHU:=0;
 PERS num gai_ding_gao_du:=400;
 PERS bool zhongtu:=TRUE;
 PERS num branch:=0;
 PROC main()
 IF (cengshu=4 AND gaiding=0 AND di102_shangzhen_jieshu=0) OR (zhongtu=TRUE AND nDisZOffs<gai_ding_gao_du) THEN
 branch:=1;
 ENDIF
 IF (gaiding=1 AND gaidingqidianJISHU=4 AND di102_shangzhen_jieshu=0) OR (zhongtu=TRUE AND nDisZOffs>=gai_ding_gao_du) THEN
 branch:=2;
 ENDIF
 ENDPROC
 ENDMODULE`);
 for(const height of [0,300,800])for(const cover of [0,1]){
  const grid=createDepositGrid({targetHeight:height||800});if(height)depositSegment(grid,{volume:grid.targetVolume});
  const state={cell:{barrel:'left',targetHeight:grid.targetHeight,targetVolume:grid.targetVolume,height,depositGrid:{...grid,cells:Object.fromEntries(Object.entries(grid.cells).map(([k,c])=>[k,c.volume]))}},globals:{ndiszoffs:500,gaiding:cover,zaomiangaodu:0,zaomiangaodu_guding:0},signals:{}};
  const feedback=readSurfaceFeedback(state);assert.equal(feedback.simulated,true);assert.equal(feedback.compensation,feedback.measured>50&&!cover?85:80);assert.equal(state.globals.ndiszoffs,Math.max(0,Math.min(800,feedback.measured-feedback.compensation)));assert.equal(state.signals.gi192_207_zaomian_gaodu1,Math.round(feedback.measured));
  if(height)assert.ok(feedback.measured<height,'measurement is the low centre, not equivalent bulk height');
  const start=createSimulation(r,{routine:'main',variables:{nDisZOffs:state.globals.ndiszoffs,gaiding:cover}}),out=advanceSimulation(r,{state:start.state});assert.equal(out.stop.type,'end');assert.equal(out.state.globals.branch,feedback.offset<400?1:2);
 }
});
test('vertical return descent cannot invent deposited volume',()=>{
 const {consumeCellMotion}=require('../src/robot-cell-sim'),{emptyDepositState}=require('../src/robot-deposit-state');
 const state={signals:{do22_boji_zz_dk:1},globals:{wobjbarrell:{uframe:{pos:[0,0,0],quat:[1,0,0,0]}}},cell:{barrel:'left',targetHeight:800,targetVolume:3.241445211677006,capacityLitres:90,bucketVolume:.09,depositedVolume:0,depositGrid:emptyDepositState(800,3.241445211677006)}};
 consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[0,0,500]}});consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[0,0,140]}});
 assert.equal(state.cell.depositedVolume,0);assert.equal(state.cell.bucketVolume,.09);
 consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[100,0,140]}});assert.ok(state.cell.depositedVolume>0);
});
test('CTime/string records and clocks work; Stop pauses once without skipping following lines',async()=>{
 const r=await report(`MODULE M
 VAR clock timer;
 PERS string recorded{2}:=["old","old"];
 PERS num seconds:=0;
 PROC main()
 ClkReset timer;
 ClkStart timer;
 recorded{1}:=CTime();
 WaitTime 2;
 ClkStop timer;
 seconds:=ClkRead(timer);
 recorded{2}:=NumToStr(seconds,1);
 Stop;
 SetDO done,1;
 ENDPROC
 ENDMODULE`);let o=run(r);assert.equal(o.stop.kind,'time');o=advanceSimulation(r,{state:o.state});assert.equal(o.stop.type,'pause');assert.equal(o.state.globals.seconds,2);assert.match(o.state.globals.recorded.items[0],/^\d{2}:\d{2}:\d{2}$/);assert.equal(o.state.globals.recorded.items[1],'2.0');assert.equal(o.state.signals.done,undefined);o=advanceSimulation(r,{state:o.state});assert.equal(o.stop.type,'end');assert.equal(o.state.signals.done,1)
});
test('nested RelTool/Offs preserves optional rotations, degree units and runtime frame copies',async()=>{
 const r=await report(`MODULE M
 PERS wobjdata original:=[FALSE,TRUE,"",[[0,0,0],[1,0,0,0]],[[0,0,0],[1,0,0,0]]];
 PERS wobjdata changing:=[FALSE,TRUE,"",[[0,0,0],[1,0,0,0]],[[0,0,0],[1,0,0,0]]];
 PERS robtarget p:=[[100,0,0],[1,0,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];
 PERS num trig:=0;
 PROC main()
 changing:=original;
 changing.oframe.rot:=OrientZYX(90,0,0);
 trig:=Sin(90);
 MoveL Offs(RelTool(p,10,0,0\\Rz:=90),0,20,30),v100,fine,tool0\\WObj:=changing;
 ENDPROC
 ENDMODULE`);const o=run(r);assert.equal(o.stop.type,'robot-solve');assert.equal(o.state.globals.trig,1);assert.deepEqual(o.state.globals.original.oframe.quat,[1,0,0,0]);assert.ok(Math.abs(o.stop.request.pose.pos[0]+20)<1e-6);assert.ok(Math.abs(o.stop.request.pose.pos[1]-110)<1e-6);assert.equal(o.stop.request.pose.pos[2],30);assert.ok(Math.abs(Math.abs(o.stop.request.pose.quat[3])-1)<1e-6)
});
test('INOUT procedure writes back to caller and FUNC ELSE executes its false branch',async()=>{
 const r=await report(`MODULE M
 PERS num n:=1;
 PROC modify(INOUT num x)
 x:=x+4;
 ENDPROC
 FUNC num choose(num x)
 IF x=1 THEN
 RETURN 6;
 ELSE
 RETURN 8;
 ENDIF
 ENDFUNC
 PROC main()
 modify n;
 n:=n+choose(0);
 ENDPROC
 ENDMODULE`);const o=run(r);assert.equal(o.stop.type,'end');assert.equal(o.state.globals.n,13)
});
test('automatic workcell config is rejected for unrelated backups and input time is bounded',async()=>{
 const r=await report('MODULE M\nPROC main()\nWaitTime 1;\nENDPROC\nENDMODULE');assert.equal(createSimulation(r,{routine:'main',automation:{profile:'brewing-cell@1'}}).error.code,'automation-invalid');const initial=createSimulation(r,{routine:'main'});assert.throws(()=>advanceSimulation(r,{state:initial.state,elapsed:Infinity}),/模拟时间/)
});

test('bulk volume is conserved across partial final loads and height comes from deposited volume',()=>{
 const {updateCell,consumeCellMotion,potVolume,potHeight}=require('../src/robot-cell-sim');const targetVolume=potVolume(40),cell={targetHeight:40,barrel:'left',capacityLitres:90,bucketVolume:0,depositedVolume:0,suppliedVolume:0,targetVolume,bucketFraction:0,fillCount:0,complete:false,loaded:false,receiving:false};const state={cell,signals:{do99_bopi_zhuangliao:1,go32_47_boqi_zhuansu:1000,go48_63_dasan_zhuansu:1000},globals:{ndiszoffs:800,nlayerthick:40,wobjbarrell:{uframe:{pos:[782,2093,-443]}}},virtualTime:0};
 updateCell(state,[]);assert.ok(cell.height<.001,'commanded offset cannot create material');state.virtualTime=3;updateCell(state,[]);assert.equal(cell.bucketVolume,.09);state.signals.do99_bopi_zhuangliao=0;state.signals.do22_boji_zz_dk=1;updateCell(state,[]);
 const motion=x=>consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[782+x,2093,-200]}});for(let cycle=0;cycle<2;cycle++){for(let i=0;i<30;i++)motion(i%2?700:-700);updateCell(state,[]);assert.ok(Math.abs(cell.suppliedVolume-cell.hopperVolume-cell.bucketVolume-cell.depositedVolume)<1e-10);if(cycle===0){state.signals.do99_bopi_zhuangliao=1;updateCell(state,[]);state.virtualTime+=3;updateCell(state,[]);assert.ok(cell.bucketVolume<.09,'last dose only receives what the preset still needs');state.signals.do99_bopi_zhuangliao=0;updateCell(state,[])}}
 assert.ok(Math.abs(cell.height-40)<1e-6);assert.ok(Math.abs(cell.suppliedVolume-cell.hopperVolume-targetVolume)<1e-10);assert.ok(cell.bucketVolume<1e-8);assert.equal(state.signals.di102_shangzhen_jieshu,1);for(const height of [40,400,800,900])assert.ok(Math.abs(potHeight(potVolume(height))-height)<1e-6)
});

test('empty bucket is marked for return and calls existing GoFeedCnv2 once per empty cycle',()=>{
 const routine={name:'JS_pd1'};
 const feed={id:'sim:feed',name:'GoFeedCnv2',kind:'PROC',localDefaults:{}};
 const env={frames:[{routineId:'main',pc:4,robotJoints:[0,0,0,0,90,0]}],program:{routines:new Map([[feed.id,feed]])},events:[]};
 const state={cell:{bucketVolume:0,receiving:false,complete:false,autoFeedInjected:false},signals:{do22_boji_zz_dk:1}};
 assert.equal(requestCellAutoFeed(state,env,{name:'JS_jiuzao'}),false,'never inject mid-spreading path');assert.equal(requestCellAutoFeed(state,env,routine),true);
 assert.equal(env.frames.length,2);assert.equal(env.frames[1].autoFeedRoutine,feed.id);
 assert.equal(env.events.at(-1).stage,'空斗自动返回接料');assert.equal(state.cell.autoFeedInjected,true);
 assert.equal(requestCellAutoFeed(state,env,routine),false,'already inside feed frame');
 env.frames.pop();
 state.cell.bucketVolume=1e-9;state.cell.autoFeedInjected=false;state.signals.do22_boji_zz_dk=0;
 assert.equal(requestCellAutoFeed(state,env,routine),false,'no spreading output');
 state.signals.do22_boji_zz_dk=1;state.cell.receiving=true;assert.equal(requestCellAutoFeed(state,env,routine),false);
 state.cell.receiving=false;state.cell.bucketVolume=.01;assert.equal(requestCellAutoFeed(state,env,routine),false);
 state.cell.bucketVolume=0;assert.equal(requestCellAutoFeed(state,env,{name:'GoFeedCnv2'}),false,'never re-enter the feed routine itself');
 const noFeed={frames:[{routineId:'main',pc:0,robotJoints:[0,0,0,0,90,0]}],program:{routines:new Map()},events:[]};
 assert.equal(requestCellAutoFeed({cell:{bucketVolume:0,receiving:false,complete:false},signals:{do22_boji_zz_dk:1}},noFeed,routine),false);
});
test('cell stage exposes empty-return and clears injection latch after refill',()=>{
 const {updateCell}=require('../src/robot-cell-sim');const cell={targetHeight:800,barrel:'left',capacityLitres:90,targetVolume:1,bucketVolume:0,depositedVolume:0,suppliedVolume:0,bucketFraction:0,fillCount:1,complete:false,loaded:false,receiving:false,autoFeedInjected:true,stage:'铺料'};const state={cell,signals:{do22_boji_zz_dk:1},globals:{nlayerthick:40},virtualTime:7};updateCell(state,[]);assert.equal(cell.stage,'空斗返回');assert.equal(cell.emptySince,7);state.signals.do22_boji_zz_dk=0;state.cell.bucketVolume=.09;updateCell(state,[]);assert.equal(cell.autoFeedInjected,false);assert.equal(cell.emptySince,null);
});
test('cell exposes gate and chain state alongside empty return',()=>{
 const {updateCell}=require('../src/robot-cell-sim');const cell={targetHeight:800,barrel:'left',capacityLitres:90,targetVolume:1,bucketVolume:0,depositedVolume:0,suppliedVolume:0,bucketFraction:0,fillCount:0,complete:false,loaded:false,receiving:false,autoFeedInjected:false,emptySince:null,gateOpen:0,chainActive:0,stage:'初始化'};const state={cell,signals:{do22_boji_zz_dk:1},globals:{nlayerthick:40},virtualTime:0};updateCell(state,[]);assert.equal(cell.stage,'空斗返回');assert.equal(cell.gateOpen,0);assert.equal(cell.chainActive,1);state.signals.do99_bopi_zhuangliao=1;updateCell(state,[]);assert.equal(cell.receiving,true);assert.equal(cell.gateOpen,0,'empty hopper stays closed while chain refills');assert.equal(cell.chainActive,1);
});
test('temporary hopper refills by chain, transfers only after ready, and survives stop/resume',()=>{
 const {updateCell,consumeCellMotion,potVolume}=require('../src/robot-cell-sim');
 const cell={targetHeight:40,barrel:'left',capacityLitres:90,targetVolume:potVolume(40),bucketVolume:0,hopperVolume:0,hopperCapacityLitres:135,chainRateLitresPerSecond:90,transferSeconds:.5,suppliedVolume:0,depositedVolume:0,bucketFraction:0,fillCount:0,complete:false,loaded:false,receiving:false,autoFeedInjected:false,emptySince:null,gateOpen:0,chainActive:0,stage:'初始化',lastUpdateTime:0,readyAt:0,transferAt:0,pendingBucketVolume:0};
 const state={cell,signals:{},globals:{nlayerthick:40},virtualTime:0};
 updateCell(state,[]);assert.equal(cell.stage,'初始化');assert.equal(cell.gateOpen,0);assert.equal(cell.chainActive,1,'empty temporary hopper starts chain');
 state.signals.do99_bopi_zhuangliao=1;updateCell(state,[]);assert.equal(cell.receiving,true);assert.equal(cell.gateOpen,0);assert.equal(cell.bucketVolume,0,'no fake full at request');assert.equal(state.signals.di103_boqi_liao_man,0);assert.equal(cell.chainActive,1);
 state.virtualTime=1;updateCell(state,[]);assert.ok(cell.hopperVolume>.089);assert.equal(cell.bucketVolume,0,'chain still transferring');assert.equal(cell.chainActive,1);assert.ok(Math.abs(cell.suppliedVolume-cell.hopperVolume-cell.bucketVolume-cell.depositedVolume)<1e-10);
 const restored=JSON.parse(JSON.stringify(state));restored.virtualTime=3;updateCell(restored,[]);assert.ok(restored.cell.bucketVolume>.089);assert.equal(restored.cell.loaded,true);assert.ok(restored.cell.hopperVolume>.038,'high-stock refill retains the untransferred reserve');assert.equal(restored.signals.di103_boqi_liao_man,1);
 const resumed=restored;resumed.signals.do99_bopi_zhuangliao=0;updateCell(resumed,[]);assert.equal(resumed.cell.stage,'转运');assert.equal(resumed.cell.receiving,false);
 resumed.signals.do22_boji_zz_dk=1;resumed.signals.go32_47_boqi_zhuansu=1000;resumed.signals.go48_63_dasan_zhuansu=1000;updateCell(resumed,[]);const motion=x=>consumeCellMotion(resumed,{instruction:'MoveL',tcpBase:{pos:[782+x,2093,-200]}});for(let i=0;i<60;i++)motion(i%2?700:-700);resumed.cell.bucketVolume=0;resumed.cell.bucketFraction=0;resumed.cell.loaded=false;resumed.virtualTime=3.4;updateCell(resumed,[]);assert.equal(resumed.cell.stage,'空斗返回');assert.equal(resumed.cell.chainActive,0,'a returning empty bucket does not itself request hopper refill');
 assert.ok(Math.abs(resumed.cell.suppliedVolume-resumed.cell.hopperVolume-resumed.cell.bucketVolume-resumed.cell.depositedVolume)<1e-10);
});
test('motion deposits are recorded only along covered path and sum equals cell volume',()=>{
 const {consumeCellMotion,potVolume}=require('../src/robot-cell-sim');const cell={targetHeight:40,barrel:'left',capacityLitres:90,targetVolume:potVolume(40),bucketVolume:.01,hopperVolume:0,depositedVolume:0,suppliedVolume:0,bucketFraction:0,loaded:true,receiving:false,complete:false,layerThickness:40,depositCells:{},depositGridSize:24,depositRadiusMm:1090};const state={cell,signals:{do22_boji_zz_dk:1},globals:{wobjbarrell:{uframe:{pos:[782,2093,-443]}}}};
 consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[782,2093,-200]}});assert.equal(Object.keys(cell.depositGrid?.cells||{}).length,0,'first motion establishes reference only');
 consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[800,2093,-200]}});assert.ok(Object.keys(cell.depositGrid?.cells||{}).length>=1);let sum=Object.values(cell.depositGrid?.cells||{}).reduce((n,e)=>n+e,0);assert.ok(Math.abs(sum-cell.depositedVolume)<1e-12);assert.ok(cell.depositedVolume>0);
 const before=Object.keys(cell.depositGrid?.cells||{}).length;consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[782,2200,-200]}});assert.ok(Object.keys(cell.depositGrid?.cells||{}).length>=before);sum=Object.values(cell.depositGrid?.cells||{}).reduce((n,e)=>n+e,0);assert.ok(Math.abs(sum-cell.depositedVolume)<1e-12);
 const volume=cell.depositedVolume;state.signals.do22_boji_zz_dk=0;consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[900,2300,-200]}});assert.equal(cell.depositedVolume,volume,'no deposit when spread output off');state.signals.do22_boji_zz_dk=1;cell.receiving=true;consumeCellMotion(state,{instruction:'MoveL',tcpBase:{pos:[920,2350,-200]}});assert.equal(cell.depositedVolume,volume,'no deposit while receiving');
});
test('spreading drives belt/rotor outputs from DO22 and GO speeds; gates are distinct',()=>{
 const {updateCell}=require('../src/robot-cell-sim');const cell={targetHeight:800,barrel:'left',capacityLitres:90,targetVolume:1,bucketVolume:.09,hopperVolume:0,hopperCapacityLitres:135,chainRateLitresPerSecond:90,transferSeconds:.5,suppliedVolume:0,depositedVolume:0,bucketFraction:0,fillCount:0,complete:false,loaded:false,receiving:false,autoFeedInjected:false,emptySince:null,gateOpen:0,chainActive:0,stage:'初始化',lastUpdateTime:0,readyAt:0,transferAt:0,pendingBucketVolume:0,depositCells:{}};const state={cell,signals:{do22_boji_zz_dk:1,go32_47_boqi_zhuansu:750,go48_63_dasan_zhuansu:2500,do19_pidai_fanzhuan:0,do21_dasan_fanzhuan:0,do16_dakai_huzhao:1,do99_bopi_zhuangliao:0},globals:{nlayerthick:40},virtualTime:0};updateCell(state,[]);assert.equal(state.signals.do18_pidai_zhengzhuan,1);assert.equal(state.signals.do20_dasan_zhengzhuan,1);assert.equal(cell.toolDrive.beltSpeed,750);assert.equal(cell.toolDrive.rotorSpeed,2500);assert.equal(cell.clothGateClosed,0);assert.equal(cell.feedGateOpen,0);
 state.signals.do22_boji_zz_dk=0;updateCell(state,[]);assert.equal(state.signals.do18_pidai_zhengzhuan,0);assert.equal(state.signals.do20_dasan_zhengzhuan,0);
 state.signals.do16_dakai_huzhao=0;state.signals.do99_bopi_zhuangliao=0;updateCell(state,[]);assert.equal(cell.clothGateClosed,1);assert.equal(cell.feedGateOpen,0);
 state.signals.do99_bopi_zhuangliao=1;updateCell(state,[]);assert.equal(cell.feedGateOpen,1);assert.equal(cell.clothGateClosed,1);assert.equal(cell.gateWarning,'');state.signals.do16_dakai_huzhao=1;updateCell(state,[]);assert.equal(cell.clothGateClosed,1);assert.equal(state.signals.do16_dakai_huzhao,1,'source request must remain untouched');assert.equal(state.signals.do18_pidai_zhengzhuan,0);assert.equal(state.signals.do20_dasan_zhengzhuan,0);assert.match(cell.gateWarning,/离线联动已关闭/);
});

test('less than one litre returns for a top-up, preserving the residual and full target',()=>{
 const {updateCell,cellBucketEmpty}=require('../src/robot-cell-sim');
 const cell={targetHeight:800,targetVolume:1,capacityLitres:90,bucketVolume:.0007,hopperVolume:.135,suppliedVolume:.1357,depositedVolume:0,fillCount:1};
 const state={cell,signals:{do22_boji_zz_dk:1},globals:{},virtualTime:0};updateCell(state,[]);
 assert.equal(state.signals.di20_boqi_wuliao,1);assert.equal(cell.stage,'空斗返回');assert.equal(cell.bucketVolume,.0007,'residual must remain in mass accounting');
 state.signals.do99_bopi_zhuangliao=1;state.signals.do22_boji_zz_dk=0;updateCell(state,[]);assert.ok(Math.abs(cell.pendingBucketVolume-.0893)<1e-12);
 state.virtualTime=1;updateCell(state,[]);assert.ok(Math.abs(cell.bucketVolume-.09)<1e-12);assert.ok(Math.abs(cell.suppliedVolume-cell.bucketVolume-cell.hopperVolume-cell.depositedVolume)<1e-12);
 assert.equal(cellBucketEmpty({bucketVolume:.0007,targetVolume:1,depositedVolume:0}),true);
 assert.equal(cellBucketEmpty({bucketVolume:.001,targetVolume:1,depositedVolume:0}),false);
 assert.equal(cellBucketEmpty({bucketVolume:.0005,targetVolume:1,depositedVolume:.9995}),false,'the last partial dose must finish rather than repeat an unfillable final load');
});

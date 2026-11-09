const test=require('node:test'),assert=require('node:assert/strict');
const {updateInfrared,selectInfraredRegion}=require('../src/robot-infrared-sim');
const {updateCameraMeasurements}=require('../src/robot-infrared-sim');
test('DS77 height and AT20 temperature use independent delayed latches and never invent temperature values',()=>{
 const s=plant(),events=[],set=(k,v)=>s.signals[k]=v;s.signals.do178_duqu_zaomian_gaodu=1;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di177_zaomian_celiang_ok,0);assert.equal(s.signals.di179_wendu_xieru_ok,0);s.virtualTime=.21;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di177_zaomian_celiang_ok,1);assert.equal(s.cell.sensors.height.count,1);assert.equal(s.signals.gi192_207_zaomian_gaodu1,300)
 for(const request of ['do181_duqu_robot_wendu','do182_duqu_zaomian_wendu'])for(let i=0;i<3;i++){s.signals[request]=1;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di179_wendu_xieru_ok,0);s.virtualTime+=.21;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di179_wendu_xieru_ok,1);s.signals[request]=0;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di179_wendu_xieru_ok,0)}
 assert.equal(s.cell.sensors.temperature.count,6);assert.equal(s.cell.sensors.temperature.value,null);assert.equal(s.signals.gi48_63_wendu_zhi,undefined);assert.equal(s.cell.sensors.height.count,1);s.signals.do178_duqu_zaomian_gaodu=0;updateCameraMeasurements(s,set,events);assert.equal(s.signals.di177_zaomian_celiang_ok,0)
});
function plant(barrel='left'){return {cell:{barrel,height:300,targetHeight:800,targetVolume:3,depositedVolume:1},signals:{go320_336_sifu_weizhi:barrel==='left'?1:2},globals:{ndiszoffs:215,gai_ding_gao_du:1000}}}
function step(state){const events=[];const set=(k,v)=>{state.signals[k]=v};updateInfrared(state,set,events);state.virtualTime=(state.virtualTime||0)+10;updateInfrared(state,set,events);return events}
test('central rotary camera requires the complete 180 degree turn before right-pot recognition',()=>{
 const s=plant(),set=(k,v)=>s.signals[k]=v;step(s);s.cell.barrel='right';s.signals.go320_336_sifu_weizhi=2;s.signals.do176_hongwai_qiyong=1;s.signals.do179_receive_hy=1;updateInfrared(s,set,[])
 const start=s.virtualTime;assert.ok(Math.abs(s.cell.infrared.rotationSeconds-4)<1e-9);assert.equal(s.cell.infrared.mount,'central-rotary')
 s.virtualTime=start+2;updateInfrared(s,set,[]);assert.equal(s.signals.gi320_335xiangji_weizhi,1);assert.equal(s.signals.di178_hy_receiveok,0)
 s.virtualTime=start+4.21;updateInfrared(s,set,[]);assert.equal(s.signals.gi320_335xiangji_weizhi,2);assert.equal(s.signals.di178_hy_receiveok,1)
});
test('camera retracts to the midpoint on park and releases no scan while returning',()=>{
 const s=plant(),set=(k,v)=>s.signals[k]=v;step(s);assert.ok(s.cell.infrared.reach>2);s.signals.go320_336_sifu_weizhi=3;s.signals.do176_hongwai_qiyong=1;s.signals.do179_receive_hy=1;updateInfrared(s,set,[]);assert.equal(s.signals.di178_hy_receiveok,0);s.virtualTime+=10;updateInfrared(s,set,[]);assert.equal(s.cell.infrared.reach,0);assert.equal(s.signals.gi320_335xiangji_weizhi,3);assert.equal(s.signals.di178_hy_receiveok,0)
});
test('camera enable does not turn into cover; fresh request latches one valid HY result until acknowledged',()=>{
 const state=plant();state.signals.do176_hongwai_qiyong=1;step(state);assert.equal(state.signals.di105_gaiding||0,0);assert.equal(state.signals.di178_hy_receiveok,0);
 state.signals.do179_receive_hy=1;const events=step(state);assert.equal(state.signals.di178_hy_receiveok,1);assert.equal(state.cell.infrared.scanCount,1);assert.ok([11,21,31,41,888].includes(state.signals.gi208_223_area_noa1));assert.equal(state.cell.infrared.temperature,null);assert.ok(events.some(e=>e.stage==='红外模拟识别'));
 step(state);assert.equal(state.cell.infrared.scanCount,1);state.signals.do179_receive_hy=0;step(state);assert.equal(state.signals.di178_hy_receiveok,0);state.signals.do179_receive_hy=1;step(state);assert.equal(state.cell.infrared.scanCount,2);
});
test('left/right camera position and park do not deliver results for the other pot',()=>{
 for(const barrel of ['left','right']){const s=plant(barrel),selected=barrel==='left'?1:2;s.signals={do176_hongwai_qiyong:1,do179_receive_hy:1,go320_336_sifu_weizhi:3-selected};step(s);assert.equal(s.signals.di178_hy_receiveok,0);s.signals.go320_336_sifu_weizhi=selected;step(s);assert.equal(s.signals.gi320_335xiangji_weizhi,selected);assert.equal(s.signals.di178_hy_receiveok,1);s.signals.go320_336_sifu_weizhi=3;step(s);assert.equal(s.signals.gi320_335xiangji_weizhi,3);assert.equal(s.signals.di178_hy_receiveok,0)}
});
test('cover handshake is independent of height and infrared; proxy and region proxy changes when a sector is filled',()=>{
 const s=plant();s.globals.ndiszoffs=1000;step(s);assert.equal(s.signals.di105_gaiding||0,0);const {updateCell}=require('../src/robot-cell-sim');s.signals.do105_gaiding=1;updateCell(s,[]);assert.equal(s.signals.di105_gaiding,0);s.virtualTime+=.3;updateCell(s,[]);assert.equal(s.signals.di105_gaiding,1);s.signals.do105_gaiding=0;updateCell(s,[]);assert.equal(s.signals.di105_gaiding,0);
 const {createDepositGrid,depositSegment}=require('../src/robot-deposit-grid');const grid=createDepositGrid({targetHeight:800});s.cell.depositGrid={...grid,cells:{}};const a=selectInfraredRegion(s.cell);depositSegment(grid,{fromU:a.u,fromV:a.v,toU:a.u,toV:a.v,volume:.04,widthM:.4});s.cell.depositGrid={...grid,cells:Object.fromEntries(Object.entries(grid.cells).map(([k,c])=>[k,c.volume]))};const b=selectInfraredRegion(s.cell);assert.notDeepEqual([b.area,b.startAngle],[a.area,a.startAngle]);
});

test('GO320 zero releases a command after arrival without erasing position (ModMain:188)',()=>{const s=plant();step(s);assert.equal(s.signals.gi320_335xiangji_weizhi,1);s.signals.go320_336_sifu_weizhi=0;s.signals.do176_hongwai_qiyong=1;s.signals.do179_receive_hy=1;step(s);assert.equal(s.cell.infrared.command,0);assert.equal(s.signals.gi320_335xiangji_weizhi,1);assert.equal(s.signals.di178_hy_receiveok,1)});
test('IR41 point pour consumes material during dwell but never from vertical travel or a disabled belt',()=>{
 const {consumeCellPause,consumeCellMotion,potVolume}=require('../src/robot-cell-sim'),{emptyDepositState}=require('../src/robot-deposit-state');
 const s={globals:{hongwai:41,wobjbarrell:{uframe:{pos:[0,0,0],quat:[1,0,0,0]}}},signals:{do22_boji_zz_dk:1},cell:{barrel:'left',targetHeight:120,targetVolume:potVolume(120),capacityLitres:90,bucketVolume:.005,depositedVolume:0,depositGrid:emptyDepositState(120,potVolume(120))}};
 consumeCellPause(s,1);assert.equal(s.cell.depositedVolume,0);
 consumeCellMotion(s,{instruction:'MoveL',tcpBase:{pos:[0,0,250]}});consumeCellMotion(s,{instruction:'MoveL',tcpBase:{pos:[0,0,150]}});assert.equal(s.cell.depositedVolume,0,'vertical travel alone is not a pour');
 consumeCellPause(s,.1);assert.ok(s.cell.depositedVolume>0);assert.ok(Math.abs(s.cell.bucketVolume+s.cell.depositedVolume-.005)<1e-12);const before=s.cell.depositedVolume;s.signals.do22_boji_zz_dk=0;consumeCellPause(s,10);assert.equal(s.cell.depositedVolume,before);
});

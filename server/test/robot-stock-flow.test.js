const test=require('node:test'),assert=require('node:assert/strict');
const {createCell,updateCell,consumeCellMotion}=require('../src/robot-cell-sim');
function setup(){
 const text='pFeedWork WobjBarrelL WobjBarrelR tGripOutlet GI112_127_ZaoYuan di103_boqi_liao_man do99_bopi_zhuangliao do22_boji_zz_DK';
 const report={files:[{id:'m',readable:true,name:'M',text,routines:[{name:'main'}]}]},cell=createCell(report,{profile:'brewing-cell@1',targetHeight:800,hopperCapacityLitres:135});
 return {cell,signals:{},globals:{nlayerthick:40},virtualTime:0};
}
function mass(state){const c=state.cell;assert.ok(Math.abs(c.suppliedVolume-c.hopperVolume-c.bucketVolume-c.depositedVolume)<1e-10);assert.ok(c.hopperVolume>=-1e-10&&c.bucketVolume>=-1e-10);assert.ok(!(c.gateOpen&&c.chainActive),'chain and open hopper gate are mutually exclusive')}
test('temporary hopper starts stocked, drains progressively after opening, closes before replenishing and preserves mass across resume',()=>{
 const s=setup(),c=s.cell;assert.equal(c.hopperVolume,.135);assert.equal(c.suppliedVolume,.135);updateCell(s,[]);assert.equal(c.chainActive,0)
 s.signals.do99_bopi_zhuangliao=1;updateCell(s,[]);assert.equal(c.gateOpen,1);assert.equal(c.bucketVolume,0)
 s.virtualTime=.3;updateCell(s,[]);assert.equal(c.bucketVolume,0,'gate is still opening');mass(s)
 s.virtualTime=.65;updateCell(s,[]);assert.ok(Math.abs(c.bucketVolume-.045)<1e-10);assert.ok(Math.abs(c.hopperVolume-.09)<1e-10);assert.equal(c.chainActive,0);mass(s)
 const resumed=JSON.parse(JSON.stringify(s)),before=resumed.cell.bucketVolume;updateCell(resumed,[]);assert.equal(resumed.cell.bucketVolume,before,'no virtual elapsed time means no flow')
 resumed.virtualTime=.9;updateCell(resumed,[]);assert.equal(resumed.cell.loaded,true);assert.equal(resumed.cell.gateOpen,0);assert.equal(resumed.cell.chainActive,0);mass(resumed)
 resumed.virtualTime=1.1;updateCell(resumed,[]);assert.equal(resumed.cell.chainActive,0,'wait for gate to finish closing')
 resumed.virtualTime=1.4;updateCell(resumed,[]);assert.equal(resumed.cell.chainActive,0);assert.ok(Math.abs(resumed.cell.hopperVolume-.045)<1e-10,'one receiving cycle does not automatically trigger replenishment');mass(resumed)
 resumed.virtualTime=2.4;updateCell(resumed,[]);assert.ok(Math.abs(resumed.cell.hopperVolume-.045)<1e-10);assert.equal(resumed.cell.chainActive,0);mass(resumed)
})
test('chain starts only at low stock, continues through the hysteresis band, and stops at high stock',()=>{
 const s=setup(),c=s.cell;c.hopperVolume=.02;c.suppliedVolume=.02;s.virtualTime=.1;updateCell(s,[]);assert.equal(c.chainActive,1);assert.ok(c.hopperVolume>.027,'replenishment continues after crossing the low threshold');mass(s)
 s.virtualTime=2;updateCell(s,[]);assert.equal(c.chainActive,0);assert.equal(c.refillActive,false);assert.ok(Math.abs(c.hopperVolume-.12825)<1e-10);mass(s)
})
test('a new pot cycle accepts remaining shared hopper stock and validates capacity without inventing supply',()=>{
 const text='pFeedWork WobjBarrelL WobjBarrelR tGripOutlet GI112_127_ZaoYuan di103_boqi_liao_man do99_bopi_zhuangliao do22_boji_zz_DK',report={files:[{id:'m',readable:true,text,routines:[{name:'main'}]}]};
 const c=createCell(report,{profile:'brewing-cell@1',targetHeight:800,barrel:'right',hopperCapacityLitres:1130,initialHopperLitres:800});assert.equal(c.hopperVolume,.8);assert.equal(c.suppliedVolume,.8);assert.throws(()=>createCell(report,{profile:'brewing-cell@1',initialHopperLitres:1200}));
})
test('spreading consumes material only when belt and scatter drives run with nonzero speeds',()=>{
 const s=setup(),c=s.cell;c.bucketVolume=.09;c.hopperVolume=.045;c.suppliedVolume=.135;s.signals={do22_boji_zz_dk:1,do18_pidai_zhengzhuan:1,do20_dasan_zhengzhuan:1,go32_47_boqi_zhuansu:1000,go48_63_dasan_zhuansu:1000};s.globals.wobjbarrell={uframe:{pos:[0,0,0]}};c.layerThickness=40
 const motion=x=>consumeCellMotion(s,{instruction:'MoveL',tcpBase:{pos:[x,0,200]}});motion(0);motion(200);assert.ok(c.depositedVolume>0);const before=c.bucketVolume
 for(const key of ['do18_pidai_zhengzhuan','do20_dasan_zhengzhuan','go32_47_boqi_zhuansu','go48_63_dasan_zhuansu']){const value=s.signals[key];s.signals[key]=0;motion(400);assert.equal(c.bucketVolume,before,key);s.signals[key]=value}mass(s)
})

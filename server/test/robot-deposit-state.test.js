const test=require('node:test'),assert=require('node:assert/strict');
const {depositPoint,depositWorldPoint,appendDeposit,emptyDepositState,surfaceHeightAt,surfaceCoordinates,followSurface}=require('../src/robot-deposit-state');
const {createDepositGrid,depositSegment}=require('../src/robot-deposit-grid');
test('a RAPID-style changing workobject angle remains a physical arc in fixed pot inventory coordinates',()=>{
 const fixed={uframe:{pos:[700,2100,-440],quat:[Math.cos(.01),Math.sin(.01),0,0]},oframe:{pos:[0,0,0],quat:[1,0,0,0]}};
 for(let degrees=0;degrees<=360;degrees+=5){
  const angle=degrees*Math.PI/180,moving={...fixed,oframe:{pos:[0,0,0],quat:[Math.cos(angle/2),0,0,Math.sin(angle/2)]}},world=depositWorldPoint([960,0,140],moving),physical=depositPoint(world,fixed);
  assert.ok(Math.abs(physical[0]-960*Math.cos(angle))<1e-8);assert.ok(Math.abs(physical[1]+960*Math.sin(angle))<1e-8);assert.ok(Math.abs(physical[2]-140)<1e-8);
 }
});

test('outlet follows actual local material and preserves source clearance in both tilted pot frames',()=>{
 const g=createDepositGrid({targetHeight:800});depositSegment(g,{volume:g.targetVolume});
 const cell={targetHeight:800,targetVolume:g.targetVolume,height:800,depositGrid:{...g,cells:Object.fromEntries(Object.entries(g.cells).map(([k,c])=>[k,c.volume]))}};
 for(const side of [-1,1]){
  const frame={uframe:{pos:[782,side*2100,-443],quat:[Math.cos(.01),Math.sin(.01),0,0]},oframe:{pos:[5,2,0],quat:[1,0,0,0]}};
  const source=depositWorldPoint([250,200,640],frame),result=followSurface(cell,source,frame,500),local=depositPoint(result.point,frame);
  assert.ok(Math.abs(result.clearance-140)<1e-8);assert.ok(Math.abs(local[2]-result.surfaceHeight-140)<1e-8);assert.ok(local[2]>900);
  assert.ok(Math.abs(local[0]-250)<1e-8);assert.ok(Math.abs(local[1]-200)<1e-8);
  assert.ok(surfaceHeightAt(cell,.95,0)>surfaceHeightAt(cell,0,0)+20);
  const sampled=surfaceCoordinates(cell,950,0),expanded=(1.09+.11/.97*sampled.height/1000)*1000;assert.ok(Math.abs(sampled.u*expanded-950)<.001,'taper inversion keeps deposit aligned under outlet');
  const approach=followSurface(cell,depositWorldPoint([250,200,600],frame),frame,0,{approach:true});assert.ok(approach.targetHeight>1060);
 }
});
test('both pots use their own full workobject frame and ABB Y maps to negative scene Z',()=>{
 for(const y of [2093.4,-2102.4]){
  const frame={uframe:{pos:[782,y,-443],quat:[1,0,0,0]},oframe:{pos:[0,0,0],quat:[1,0,0,0]}};
  const a=depositPoint([882,y+300,-343],frame);assert.deepEqual(a,[100,-300,100]);
  const cell={targetHeight:800,targetVolume:3.241445211677006,depositGrid:emptyDepositState(800,3.241445211677006)};
  appendDeposit(cell,[882,y+300,-343],[962,y+300,-343],.0001,frame);
  const keys=Object.keys(cell.depositGrid.cells).map(key=>key.split(':').map(Number));
  assert.ok(keys.every(([,iz])=>iz<12),'ABB positive Y must stay on negative scene Z in either pot');const entries=Object.entries(cell.depositGrid.cells),total=entries.reduce((sum,[,v])=>sum+v,0),meanX=entries.reduce((sum,[key,v])=>sum+(Number(key.split(':')[0])+.5)*v,0)/total;assert.ok(meanX>12,'pour footprint follows positive X');
 }
 const s=Math.SQRT1_2,frame={uframe:{pos:[100,200,300],quat:[s,0,0,s]},oframe:{pos:[10,0,0],quat:[1,0,0,0]}};
 const local=depositPoint([80,240,330],frame);assert.ok(Math.abs(local[0]-30)<1e-10);assert.ok(Math.abs(local[1]+20)<1e-10);assert.ok(Math.abs(local[2]-30)<1e-10);
});

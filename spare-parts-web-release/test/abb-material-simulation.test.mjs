import test from 'node:test'
import assert from 'node:assert/strict'
import {Matrix4,Vector3} from 'three'
import {createMaterialSimulation} from '../src/utils/abb-material-simulation.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'
import {createFeedStation} from '../src/utils/abb-feed-station.mjs'
test('bulk material stays inside the chosen pot, reaches the preset height, and stops particle flow when paused',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),pot=brewingWorkcell.pots[0];model.setCell({barrel:'left',height:800,targetHeight:800,complete:true,signals:{do22_boji_zz_dk:1}});model.update(.05,{running:false,toolPoint:new Vector3(1,2,3)});const result=model.inspect();assert.equal(result[0].height,.8);assert.equal(result[1].visible,false);assert.ok(model.root.children.filter(x=>x.isInstancedMesh).every(x=>!x.visible));assert.ok(result[0].height<pot.dimensions.height);model.setCell(null);model.update(0,{programVisible:false});assert.ok(model.inspect().every(x=>!x.visible));model.dispose()
});
test('chain plates move along the feed direction and stay on the original deck elevation',()=>{
 const station=createFeedStation(),parts=station.userData.parts,original=new Matrix4(),after=new Matrix4();parts.plates.getMatrixAt(0,original);station.userData.setChainPhase(.1);parts.plates.getMatrixAt(0,after);assert.ok(after.elements[14]<original.elements[14]);assert.ok(Math.abs(after.elements[13]-original.elements[13])<1e-6);station.userData.dispose()
});

test('feeder stream requires receiving position and an open buffer gate; spreading has its own outlet stream',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),point=new Vector3(1,2,3),state={barrel:'left',height:0,targetHeight:800,bucketFraction:1,receiving:true,signals:{do22_boji_zz_dk:0}};model.setCell(state);
 const update=extra=>model.update(.05,{running:true,feederPoint:point,toolPoint:point,rate:1,gateAmount:1,guardAmount:1,atReceiving:true,...extra});
 update({gateAmount:0});assert.equal(model.streams[0].visible,false);update({atReceiving:false});assert.equal(model.streams[0].visible,false);update({});assert.equal(model.streams[0].visible,true);
 state.receiving=false;state.signals.do22_boji_zz_dk=1;update({});assert.equal(model.streams[0].visible,false);assert.equal(model.streams[1].visible,true);assert.equal(model.inspect()[0].height,0,'spreading command alone cannot invent a 35 mm layer');
 update({running:false});assert.ok(model.streams.every(s=>!s.visible));model.dispose()
});
test('empty-bucket return drives chain material and reports one consistent logical state',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots);
 model.setCell({barrel:'left',height:24,targetHeight:800,bucketFraction:0,receiving:false,complete:false,stage:'空斗返回',hopperVolume:.045,hopperCapacityLitres:135,chainActive:1,signals:{do22_boji_zz_dk:1}});
 model.update(.05,{running:true,rate:1,guardAmount:1,atReceiving:false});
 const state=model.materialState();
 assert.equal(state.emptyReturn,true);assert.equal(state.chainActive,true);assert.equal(state.feeding,false);assert.ok(state.bucketFill<.01);
 assert.equal(state.streams.find(s=>s.name==='receiving-grains').visible,false);
 model.setCell({barrel:'left',height:24,targetHeight:800,bucketFraction:1,receiving:true,complete:false,stage:'接料',signals:{do22_boji_zz_dk:0}});
 model.update(.05,{running:true,rate:1,gateAmount:1,atReceiving:true});
 assert.equal(model.materialState().feeding,true);assert.equal(model.materialState().emptyReturn,false);
 model.dispose();
});
test('visual hopper stock and chain read the same serializable cell state',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots);
 model.setCell({barrel:'left',height:0,targetHeight:800,bucketFraction:0,receiving:false,complete:false,stage:'空斗返回',hopperVolume:.045,hopperCapacityLitres:135,chainActive:1,signals:{do22_boji_zz_dk:0}});
 model.update(.05,{running:true,rate:1});
 let state=model.materialState();assert.ok(Math.abs(state.buffer-.3333333333)<1e-6);assert.ok(Math.abs(state.hopperLitres-.045)<1e-9);assert.equal(state.chainActive,true);
 model.setCell({barrel:'left',height:0,targetHeight:800,bucketFraction:0,receiving:true,complete:false,stage:'接料',hopperVolume:0,hopperCapacityLitres:135,chainActive:1,signals:{do22_boji_zz_dk:0}});
 model.update(.05,{running:true,rate:1,gateAmount:1,atReceiving:true});
 state=model.materialState();assert.equal(state.buffer,0);assert.equal(state.feeding,false,'empty hopper cannot emit receiving grains');assert.equal(state.chainActive,false,'open gate inhibits chain material');
 model.dispose();
});
test('jiupei texture is deep brown, not light tan or yellow',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),root=model.root;let map=null;root.traverse(o=>{if(!map&&o.material&&o.material.map)map=o.material.map});assert.ok(map&&map.image&&map.image.data);const data=map.image.data;let dark=0,brown=0;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(r<150&&g<120&&b<100)dark++;if(r>g&&g>b)brown++}assert.ok(dark>data.length/4*.5,'texture should be predominantly dark');assert.equal(brown,data.length/4,'all samples should be R>G>B brown');model.dispose();
});
test('spatial deposit cells start local, expand with trajectory, and never grow while paused',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),pot='pot-left',cellsMesh=model.root.getObjectByName(pot+'-deposit-surface');
 const state={barrel:'left',height:5,targetHeight:800,complete:false,stage:'铺料',depositedVolume:.0005,depositCells:{'5:5':{u:0,v:0,volume:.0005}},depositGridSize:24,depositRadiusMm:1090,signals:{do22_boji_zz_dk:1},hopperVolume:0,hopperCapacityLitres:135,chainActive:0};
 model.setCell(state);model.update(.05,{running:true,rate:1});let info=model.inspect().find(x=>x.id===pot);let logical=model.materialState();
 assert.equal(info.spatial,true);assert.equal(info.cells,1);assert.ok(Math.abs(info.volume-.0005)<1e-9);assert.ok(cellsMesh.geometry.index.count>0);assert.equal(cellsMesh.visible,true);assert.equal(model.root.getObjectByName(pot+'-material').visible,false,'no whole-pot prefill');assert.ok(Math.abs(logical.depositedVolume-logical.cellDepositedVolume)<1e-12);
 state.depositCells['5:6']={u:0,v:.08,volume:.0004};state.depositedVolume=.0009;model.setCell(state);model.update(.05,{running:true,rate:1});info=model.inspect().find(x=>x.id===pot);assert.equal(info.cells,2);assert.ok(Math.abs(info.volume-.0009)<1e-9);assert.ok(Math.abs(info.renderedVolume-info.volume)<1e-8);
 const before=JSON.stringify(info);model.update(.05,{running:false,rate:1});info=model.inspect().find(x=>x.id===pot);assert.equal(JSON.stringify(info),before,'paused/stopped must not grow material');
 model.dispose();
});
test('bucket visual stays empty until robot is at receiving pose and hopper gate is open',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),state={barrel:'left',height:0,targetHeight:800,bucketFraction:1,receiving:true,gateOpen:1,complete:false,stage:'接料',signals:{do22_boji_zz_dk:0},hopperVolume:.09,hopperCapacityLitres:135,chainActive:0};
 model.setCell(state);model.update(.1,{running:true,rate:1,gateAmount:0,atReceiving:false});assert.ok(model.bucketFill<.01,'must not fill before robot arrives');
 model.update(.1,{running:true,rate:1,gateAmount:1,atReceiving:true});assert.ok(model.bucketFill>.01,'fills only after gate and pose are ready');model.dispose();
});

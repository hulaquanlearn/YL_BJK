import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {createInfraredCamera} from '../src/utils/abb-infrared-camera.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'
test('camera follows pot position codes, pauses, parks and points its lens downward',()=>{
 const camera=createInfraredCamera(brewingWorkcell.pots),api=camera.userData
 assert.ok(camera.getObjectByName('camera-downward-lens'));assert.equal(api.dimensionsEstimated,true)
 for(const position of [1,2,3]){api.setCell({height:400,infrared:{position,enabled:true}});api.update(.1,{running:true,rate:10});for(let i=0;i<6;i++)api.update(.1,{running:true,rate:10});const state=api.inspect();assert.equal(state.position,position);if(position<3){assert.ok(new Vector3(...state.head).distanceTo(new Vector3(brewingWorkcell.pots[position-1].position[0],0,brewingWorkcell.pots[position-1].position[2]))<.01);assert.equal(state.observing,true)}else assert.equal(state.observing,false)}
 api.setCell({infrared:{position:1,enabled:true}});const before=api.inspect().head;api.update(1,{running:false});assert.deepEqual(api.inspect().head,before);api.setCell(null);assert.equal(api.inspect().position,0);assert.equal(api.inspect().observing,false)
});
test('central camera parks between pots and extends its lens directly over either pot',()=>{
 const camera=createInfraredCamera(brewingWorkcell.pots),api=camera.userData,pots=brewingWorkcell.pots
 const centre=new Vector3(...pots[0].position).add(new Vector3(...pots[1].position)).multiplyScalar(.5);centre.y=0
 assert.equal(api.mechanism,'central-rotary');assert.equal(camera.getObjectByName('camera-support-rail'),undefined);assert.equal(camera.getObjectByName('camera-slider'),undefined)
 assert.ok(new Vector3(...api.inspect().head).distanceTo(centre)<1e-9)
 for(const position of [1,2]){
  api.setCell({height:400,infrared:{targetPosition:position,position,enabled:true}})
  for(let i=0;i<50;i++){api.update(.1,{running:true});const s=api.inspect();assert.ok(Math.abs(Math.hypot(s.head[0]-centre.x,s.head[2]-centre.z)-s.reach)<1e-9);assert.ok(s.reach>=0&&s.reach<=s.radius)}
  const s=api.inspect(),pot=pots[position-1];assert.ok(Math.abs(s.lens[0]-pot.position[0])<1e-9);assert.ok(Math.abs(s.lens[2]-pot.position[2])<1e-9);assert.ok(s.lens[1]>pot.position[1]+pot.dimensions.height);assert.equal(s.observing,true)
 }
 api.setCell({infrared:{targetPosition:3,position:3,enabled:false}});for(let i=0;i<50;i++)api.update(.1,{running:true});assert.ok(new Vector3(...api.inspect().head).distanceTo(centre)<1e-9);assert.equal(api.inspect().observing,false)
});
test('thermal and height cameras share one housing and one hanging bracket, so visibility and travel cannot split them',()=>{
 const camera=createInfraredCamera(brewingWorkcell.pots);let housings=0,stems=0;camera.traverse(n=>{if(n.name==='camera-body')housings++;if(n.name==='camera-hanging-bracket')stems++});assert.equal(housings,1);assert.equal(stems,1);assert.deepEqual(camera.userData.sensors,['AT20','DS77pro']);assert.equal(camera.userData.sharedHousing,true)
 const thermal=camera.getObjectByName('camera-downward-lens'),height=camera.getObjectByName('ds77pro-height-lens');assert.equal(thermal.parent,height.parent);const delta=height.position.clone().sub(thermal.position);camera.userData.setCell({infrared:{position:2,enabled:true}});for(let i=0;i<5;i++)camera.userData.update(1,{running:true});assert.ok(height.getWorldPosition(new Vector3()).distanceTo(thermal.getWorldPosition(new Vector3()))-delta.length()<1e-9)
});

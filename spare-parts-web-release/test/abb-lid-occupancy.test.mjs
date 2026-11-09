import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'

const source=fs.readFileSync(new URL('../src/components/agv/AbbRobotViewer.vue',import.meta.url),'utf8')
function fixture(){
 const model=new THREE.Group(),potModel=new THREE.Group(),meshes=[],cameraState={yaw:0,reach:0}
 for(const side of ['left','right']){
  const pot=new THREE.Group(),lid=new THREE.Group();pot.name='pot-'+side;pot.position.x=side==='left'?-3:3;lid.name='hydraulic-pot-lid';pot.add(lid);potModel.add(pot)
  const region=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1));let target=1,updates=0
  pot.userData.lid={intersectsSweep:box=>box.intersectsBox(region),setTarget:t=>target=t,update:()=>{updates++;return true},get target(){return target},get updates(){return updates}}
 }
 function part(id,x){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3));mesh.userData.partId=id;mesh.position.set(x,1,0);model.add(mesh);meshes.push(mesh);return mesh}
 const robot=part('axis4',-3),camera=part('infrared-camera',3),infrared=new THREE.Group(),assembly=new THREE.Group();infrared.name='infrared-camera';assembly.userData.inspect=()=>cameraState;infrared.add(assembly);model.add(infrared)
 const context={THREE,model,potModel,meshes,lidClearCache:new Map(),joints:{value:[0,0,0,0,0,0]},toolId:{value:'tool-640'},toolModel:null,spread:{value:0},hidden:{value:new Set()},lidTargets:{left:1,right:1},lidMessage:{value:''},sceneDirty:false,labelsDirty:false,programCell:{barrel:'left',complete:false,infrared:{position:1}},programRunning:{value:false},robotPotStations:[{id:'pot-left'},{id:'pot-right'}]}
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function lidClear('),source.indexOf('function toggleProgram()')),context)
 return {context,robot,camera,cameraState,potModel,refresh(){context.joints.value[0]++}}
}
test('closing checks only the requested pot and describes its actual robot/camera blocker',()=>{
 const f=fixture(),s=f.context;s.toggleLid('left');assert.match(s.lidMessage.value,/左甑.*机器人或工具/)
 s.toggleLid('right');assert.match(s.lidMessage.value,/右甑.*相机/)
 f.camera.position.x=0;f.cameraState.reach=1;s.programRunning.value=true;s.toggleLid('right');assert.equal(s.lidTargets.right,0);assert.equal(s.lidMessage.value,'','running left program does not block the empty right pot');s.programRunning.value=false
 s.updateHydraulicLids(.1);assert.equal(f.potModel.getObjectByName('pot-right').userData.lid.target,0);assert.equal(f.potModel.getObjectByName('pot-right').userData.lid.updates,1,'manual close animates while the other program is paused')
 f.robot.position.x=0;f.refresh();s.toggleLid('left');assert.equal(s.lidTargets.left,0,'stale left cell/IR status does not block a physically clear pot')
})
test('display-only hiding cannot bypass occupancy and entering a closing pot reopens that pot',()=>{
 const f=fixture(),s=f.context;f.robot.visible=false;f.refresh();s.toggleLid('left');assert.equal(s.lidTargets.left,1,'hidden physical arm remains an obstacle')
 f.robot.position.x=0;f.refresh();s.toggleLid('left');assert.equal(s.lidTargets.left,0)
 f.robot.position.x=-3;f.refresh();s.updateHydraulicLids(.1);assert.equal(s.lidTargets.left,1);assert.match(s.lidMessage.value,/左甑/);assert.equal(s.lidTargets.right,1)
 f.camera.visible=false;f.cameraState.reach=1;s.toggleLid('right');assert.equal(s.lidTargets.right,1,'hidden camera still occupies the same pot')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {brewingStationProfile as profile,brewingWorkcell as cell,abbPointToScene,placeBrewingPot} from '../src/utils/abb-workcell-layout.mjs'
import {flangeTarget,poseMatrix} from '../src/utils/abb-inverse-kinematics.mjs'
import {robotCadTransforms,robotFlangeMatrix,robotJointLimits} from '../src/utils/abb-kinematics.mjs'
import {robotPlantEquipment} from '../src/utils/abb-robot.mjs'
import {createToolMechanics} from '../src/utils/abb-tool-mechanics.mjs'
const load=async name=>{const b=await readFile(new URL('../public/models/abb-irb6700/'+name+'.glb',import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}
const position=m=>new T.Vector3().setFromMatrixPosition(m)
function mountTool(root){const mount=new T.Group(),axis=new T.Group();mount.position.set(2.1125,2.26,0);mount.rotation.z=-Math.PI/2;mount.add(root);axis.add(mount);axis.applyMatrix4(robotCadTransforms(cell.receivingJoints)[6]);axis.updateMatrixWorld(true);return axis}

test('program home uses saved pRobHome and keeps the complete bucket outside feeder solids',async()=>{
 const expected=flangeTarget(profile.home,profile.homeTool,profile.base),actual=robotFlangeMatrix(cell.homeJoints)
 assert.ok(position(actual).distanceTo(position(expected))<1e-6)
 const tool=await load('tool-640'),axis=mountTool(tool);axis.matrixAutoUpdate=false;axis.matrix.copy(robotCadTransforms(cell.homeJoints)[6]);axis.updateMatrixWorld(true)
 const bucketBounds=new T.Box3().setFromObject(axis),asset=robotPlantEquipment[0],feeder=asset.create();feeder.position.fromArray(asset.position);feeder.rotation.y=asset.rotationY;feeder.updateMatrixWorld(true)
 feeder.traverse(mesh=>{if(!mesh.isMesh||mesh.isInstancedMesh)return;const overlap=bucketBounds.clone().intersect(new T.Box3().setFromObject(mesh)),size=overlap.getSize(new T.Vector3());assert.ok(Math.min(size.x,size.y,size.z)<1e-5,'initial bucket intersects '+mesh.name)})
 feeder.userData.dispose()
})
test('both outer-side lid sweeps clear the complete bucket at program home and receiving poses',async()=>{
 const cad=await load('gujing-pot'),tool=await load('tool-640'),mounted=mountTool(tool);
 for(const joints of [cell.homeJoints,cell.receivingJoints]){
  mounted.matrixAutoUpdate=false;mounted.matrix.copy(robotCadTransforms(joints)[6]);mounted.updateMatrixWorld(true);const bucket=new T.Box3().setFromObject(mounted);
  for(const station of cell.pots){const pot=placeBrewingPot(cad,station);pot.updateMatrixWorld(true);const lid=pot.getObjectByName('hydraulic-pot-lid'),obstacle=bucket.clone().applyMatrix4(lid.matrixWorld.clone().invert());assert.equal(pot.userData.lid.intersectsSweep(obstacle),false,station.id+' must clear the parked bucket')}
 }
})

test('receiving pose reaches the saved brewing pFeedWork TCP in WobjBase, not the flange or old display pose',()=>{
 const expected=poseMatrix(profile.base.uframe).multiply(poseMatrix(profile.base.oframe)).multiply(poseMatrix(profile.receiving))
 const actual=robotFlangeMatrix(cell.receivingJoints).multiply(poseMatrix({pos:profile.tool.tcp,quat:profile.tool.quat}))
 assert.ok(position(actual).distanceTo(position(expected))<.000001)
 assert.ok(new T.Quaternion().setFromRotationMatrix(actual).angleTo(new T.Quaternion().setFromRotationMatrix(expected))<.000001)
 cell.receivingJoints.forEach((q,i)=>assert.ok(q>=robotJointLimits[i][0]&&q<=robotJointLimits[i][1]))
 assert.ok(position(flangeTarget(profile.receiving,profile.tool,profile.base)).distanceTo(position(expected))>.9)
 assert.deepEqual(abbPointToScene([1000,2000,3000]),[1,3,-2])
})
for(const type of ['tool-640','tool-700'])test(type+' full feeder footprint falls inside the actual bucket and the open gate stays above the tool',async()=>{
 const tool=await load(type);createToolMechanics(tool,type);const axis=mountTool(tool)
 tool.traverse(n=>{if(n.isMesh)n.material.side=T.DoubleSide})
 const asset=robotPlantEquipment[0],feeder=asset.create();feeder.position.fromArray(asset.position);feeder.rotation.y=asset.rotationY;feeder.updateMatrixWorld(true)
 const dims=feeder.userData.outlet,ray=new T.Raycaster(),down=new T.Vector3(0,-1,0)
 // Sample the full open short-pipe aperture, including points 1 mm from its edges.
 for(let ix=0;ix<=12;ix++)for(let iz=0;iz<=12;iz++){
  const p=new T.Vector3((ix/12-.5)*(dims.innerWidth-.002),dims.bottomY,(iz/12-.5)*(dims.innerDepth-.002)).applyMatrix4(feeder.matrixWorld)
  ray.set(p,down);const hit=ray.intersectObject(axis,true)[0]
  assert.ok(hit,'material misses bucket at '+p.toArray())
  assert.match(hit.object.name,/皮带U17|接料口|挡边带/,'material strikes '+hit.object.name+' at '+p.toArray())
 }
 const toolTop=new T.Box3().setFromObject(axis).max.y
 for(let i=0;i<=20;i++){feeder.userData.setGate(i/20);feeder.updateMatrixWorld(true);const gate=new T.Box3().setFromObject(feeder.getObjectByName('gate'));assert.ok(gate.min.y>toolTop+.05,'gate clears tool throughout opening')}
 feeder.userData.dispose()
})

test('pots use saved left/right frames, inner floor, height and radii rather than grounding a union bbox',async()=>{
 const cad=await load('gujing-pot'),original=new T.Box3().setFromObject(cad)
 for(const station of cell.pots){
  const pot=placeBrewingPot(cad,station);pot.updateMatrixWorld(true)
  assert.ok(pot.position.distanceTo(new T.Vector3(...abbPointToScene(station.frame.pos)))<1e-12)
  const inv=pot.matrixWorld.clone().invert(),rings=new Map()
  pot.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){
   const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv),y=v.y.toFixed(4),r=Math.hypot(v.x,v.z);rings.set(y,Math.min(rings.get(y)??Infinity,r))
  }})
  assert.ok(Math.abs(rings.get('0.0000')-1.09)<.0001,'inner floor/lower radius')
  assert.ok(Math.abs(rings.get('0.9700')-1.2)<.0001,'rim/upper radius')
  assert.ok([...rings.keys()].some(y=>Number(y)<-.09),'outer base remains below the inner floor')
  const rim=new T.Vector3(0,.97,0).applyMatrix4(pot.matrixWorld),basis=new T.Matrix4().makeRotationX(-Math.PI/2)
  assert.ok(rim.distanceTo(new T.Vector3(0,0,.97).applyMatrix4(poseMatrix(station.frame)).applyMatrix4(basis))<1e-7)
 }
 assert.deepEqual(new T.Box3().setFromObject(cad),original,'shared CAD remains unchanged')
 assert.ok(cell.pots[1].position[2]-cell.pots[0].position[2]>4.19)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildCraneModel,applyCranePose,craneModelDimensions,craneModelNote} from '../src/utils/crane-model.mjs'
import {craneSystems,craneSystemPartIds} from '../src/utils/crane-parts.mjs'
import {craneAxes,craneHomePose,cranePose} from '../src/utils/crane-state.mjs'

const AXIS_IDS=['travel','trolley','hoist','rotation','grip','transfer','transferHoist','flip','scan']
const home=craneHomePose
const boxOf=object=>{
 let node=object
 while(node.parent)node=node.parent
 node.updateMatrixWorld(true)
 return new THREE.Box3().setFromObject(object)
}
const nearZero=value=>Math.abs(value)<1e-9
const byName=(model,name)=>model.parts.find(part=>part.name===name)
const worldPosition=part=>{part.updateMatrixWorld(true);return part.getWorldPosition(new THREE.Vector3())}
function solidBoxes(object){const list=[];object.updateWorldMatrix(true,true);object.traverse(o=>{if(o.isMesh&&!o.material?.transparent){o.geometry.computeBoundingBox();list.push(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld))}});return list}
function overlapsVolume(a,b){const box=a.clone().intersect(b),size=box.getSize(new THREE.Vector3());return !box.isEmpty()&&Math.min(size.x,size.y,size.z)>.001}
function dispose(root){
 const geometries=new Set()
 const materials=new Set()
 root.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry)
  const list=Array.isArray(object.material)?object.material:[object.material]
  for(const material of list)if(material)materials.add(material)
 })
 geometries.forEach(geometry=>geometry.dispose())
 materials.forEach(material=>material.dispose&&material.dispose())
}

test('model exposes root/parts/materials that match the shared system list exactly',()=>{
 const model=buildCraneModel()
 try{
  assert.ok(model.root instanceof THREE.Group)
  assert.equal(model.root.name,'intelligent-crane')
  assert.equal(typeof craneModelNote,'string')
  assert.ok(craneModelNote.includes('示意'))
  const names=model.parts.map(part=>part.name)
  assert.equal(names.length,craneSystemPartIds.length)
  assert.equal(new Set(names).size,names.length)
  assert.deepEqual([...names].sort(),[...craneSystemPartIds].sort())
  const systemIds=new Set(craneSystems.map(system=>system.id))
  for(const part of model.parts){
   assert.equal(part.parent,model.root,`${part.name} is not a direct child of root`)
   assert.equal(part.userData.partId,part.name)
   assert.equal(typeof part.userData.label,'string')
   assert.ok(part.userData.label.length>0)
   assert.equal(typeof part.userData.description,'string')
   assert.ok(part.userData.description.length>0)
   assert.ok(systemIds.has(part.userData.system),`${part.name} has unknown system`)
   const system=craneSystems.find(entry=>entry.id===part.userData.system)
   assert.ok(system.parts.includes(part.name),`${part.name} missing from its system`)
   assert.ok(Array.isArray(part.userData.sourceSlides)&&part.userData.sourceSlides.length>0)
   for(const page of part.userData.sourceSlides){
    assert.ok(Number.isInteger(page)&&page>=1&&page<=168,`${part.name} page ${page}`)
   }
   assert.equal(part.userData.presentationOffset.length,3)
   for(const value of part.userData.presentationOffset)assert.ok(Number.isFinite(value))
  }
  for(const system of craneSystems){
   assert.equal(typeof system.id,'string')
   assert.equal(typeof system.label,'string')
   assert.equal(typeof system.description,'string')
   assert.ok(Array.isArray(system.sourceSlides)&&system.sourceSlides.length>0)
   for(const page of system.sourceSlides)assert.ok(Number.isInteger(page)&&page>=1&&page<=168)
  }
  assert.ok(Object.keys(model.materials).length>=12)
  assert.equal(model.dimensions,craneModelDimensions)
  assert.equal(model.rig.grabRopes.length,4)
  assert.equal(model.rig.transferRopes.length,4)
 }finally{dispose(model.root)}
})

test('runway is the fixed environment group and no sampled pose sinks below the floor',()=>{
 const model=buildCraneModel()
 try{
  const poses=[
   home(),
   {travel:0,trolley:0,hoist:0,rotation:0,grip:0,transfer:0,transferHoist:0,flip:0},
   {travel:1,trolley:1,hoist:1,rotation:1,grip:1,transfer:1,transferHoist:1,flip:1},
   {travel:.2,trolley:.8,hoist:.5,rotation:.3,grip:.6,transfer:.7,transferHoist:.4,flip:.5}
  ]
  for(const pose of poses){
   applyCranePose(model,pose)
   assert.deepEqual(byName(model,'runway').position.toArray(),[0,0,0])
   for(const part of model.parts){
    const box=boxOf(part)
    assert.ok(Number.isFinite(box.min.y),`${part.name} has a non-finite box`)
    assert.ok(box.min.y>=-.02,`${part.name} below floor at y=${box.min.y}`)
   }
  }
 }finally{dispose(model.root)}
})

test('大车行走 moves every bridge part along X and 伸缩小车横移 moves the trolley along Z',()=>{
 const model=buildCraneModel()
 try{
  applyCranePose(model,{...home(),travel:0,trolley:0})
  assert.equal(byName(model,'bridge-girder').position.x,-craneModelDimensions.travelDisplay/2)
  assert.equal(byName(model,'endcarriage-south').position.x,-craneModelDimensions.travelDisplay/2)
  assert.equal(byName(model,'bridge-cabinet').position.x,-craneModelDimensions.travelDisplay/2)
  assert.equal(byName(model,'trolley-frame').position.z,-craneModelDimensions.trolleyDisplay/2)
  assert.equal(byName(model,'grab').position.z,-craneModelDimensions.trolleyDisplay/2)
  assert.equal(byName(model,'bridge-girder').position.z,0)
  const bridgeX=byName(model,'bridge-girder').position.x
  for(const name of ['bridge-walkway','endcarriage-north','alarm-beacon','limit-switches','cable-chains','wireless-bridge','laser-gateway','code-reader','transfer-cabinet']){
   assert.equal(byName(model,name).position.x,bridgeX,`${name} did not follow 大车行走`)
   assert.equal(byName(model,name).position.z,0,`${name} should not follow 小 car`)
  }
  applyCranePose(model,{...home(),travel:1,trolley:1})
  assert.equal(byName(model,'bridge-girder').position.x,craneModelDimensions.travelDisplay/2)
  const end=cranePose({...home(),travel:1,trolley:1})
  assert.equal(byName(model,'trolley-frame').position.z,(end.trolley-.5)*craneModelDimensions.trolleyDisplay)
  assert.equal(byName(model,'trolley-frame').position.x,craneModelDimensions.travelDisplay/2)
  assert.equal(byName(model,'grab').position.z,(end.trolley-.5)*craneModelDimensions.trolleyDisplay)
 }finally{dispose(model.root)}
})

test('提升 lowers the grab with three connected mast sections and four ropes that stay attached',()=>{
 const model=buildCraneModel()
 try{
  for(const hoist of [0,.25,.5,.75,1]){
   applyCranePose(model,{...home(),hoist})
   const grabTop=craneModelDimensions.mastRetractedBottom-craneModelDimensions.mastExtension*hoist
   const grab=byName(model,'grab')
   assert.ok(Math.abs(grab.position.y-grabTop)<1e-9,`grab top ${grab.position.y}`)
   // 最内节底部与抓斗顶部保持同一位置，演示中不会断开
   const stageBox=boxOf(model.rig.stage3)
   assert.ok(Math.abs(stageBox.min.y-(grabTop-.07))<.02,`stage3 bottom ${stageBox.min.y} vs ${grabTop}`)
   // 四根钢丝绳：长度与抓斗高度一致，中点在两端之间
   for(const entry of model.rig.grabRopes){
    const expected=Math.abs(craneModelDimensions.trolleyUnderside-grabTop)
    assert.ok(Math.abs(entry.object.scale.y-expected)<.01,`rope length ${entry.object.scale.y} vs ${expected}`)
    const midpoint=(craneModelDimensions.trolleyUnderside+grabTop)/2
    assert.ok(Math.abs(entry.object.position.y-midpoint)<.01,`rope midpoint ${entry.object.position.y}`)
   }
   // 抓斗最高点不超过主梁下弦，最低点不穿地
   const grabBox=boxOf(grab)
   assert.ok(!solidBoxes(byName(model,'bridge-girder')).some(a=>solidBoxes(grab).some(b=>overlapsVolume(a,b))),'grab actuator enters a solid girder')
   assert.ok(grabBox.min.y>=0,`grab bottom ${grabBox.min.y}`)
  }
 }finally{dispose(model.root)}
})

test('抓斗旋转 turns the grab and jaws together while 抓斗开合 opens both jaws symmetrically',()=>{
 const model=buildCraneModel()
 try{
  applyCranePose(model,{...home(),rotation:0,grip:0})
  assert.ok(Math.abs(byName(model,'grab').rotation.y)<1e-9)
  assert.ok(Math.abs(byName(model,'grab-jaws').rotation.y)<1e-9)
  const closed=boxOf(byName(model,'grab-jaws'))
  applyCranePose(model,{...home(),rotation:0,grip:0})
  assert.equal(byName(model,'grab').rotation.y,0)
  applyCranePose(model,{...home(),rotation:1,grip:0})
  assert.ok(Math.abs(byName(model,'grab').rotation.y-Math.PI/2)<1e-9)
  applyCranePose(model,{...home(),rotation:.25,grip:0})
  assert.equal(byName(model,'grab-jaws').rotation.y,byName(model,'grab').rotation.y)
  applyCranePose(model,{...home(),grip:1})
  assert.ok(byName(model,'grab').rotation.y===0&&model.rig.jawA.rotation.x<0&&model.rig.jawB.rotation.x>0)
  assert.ok(Math.abs(model.rig.jawA.rotation.x+model.rig.jawB.rotation.x)<1e-9)
  const opened=boxOf(byName(model,'grab-jaws'))
  assert.ok(opened.max.z-closed.max.z>.15,`jaw opening did not widen the bucket: ${closed.max.z} -> ${opened.max.z}`)
 }finally{dispose(model.root)}
})

test('周转小车 follows its own travel axis; 周转提升 and 周转翻转 move and tilt the fixture with ropes attached',()=>{
 const model=buildCraneModel()
 try{
  applyCranePose(model,{...home(),transfer:0})
  const left=cranePose({...home(),transfer:0})
  assert.equal(byName(model,'transfer-car').position.z,(left.transfer-.5)*craneModelDimensions.transferDisplay)
  applyCranePose(model,{...home(),transfer:1})
  assert.equal(byName(model,'transfer-car').position.z,craneModelDimensions.transferDisplay/2)
  assert.equal(byName(model,'transfer-car').position.x,craneModelDimensions.transferRailX)
  applyCranePose(model,{...home(),transferHoist:0})
  assert.equal(byName(model,'turnover-flip').position.y,craneModelDimensions.transferFixtureTopY)
  applyCranePose(model,{...home(),transferHoist:1})
  assert.equal(byName(model,'turnover-flip').position.y,craneModelDimensions.transferFixtureTopY-craneModelDimensions.transferHoistDisplay)
  applyCranePose(model,{...home(),flip:0})
  assert.equal(byName(model,'turnover-flip').rotation.z,0)
  applyCranePose(model,{...home(),flip:1})
  assert.equal(byName(model,'turnover-flip').rotation.z,0,'suspension frame stays level')
  assert.ok(Math.abs(model.rig.flipFrame.rotation.z-Math.PI)<1e-9)
  applyCranePose(model,{...home(),flip:-1})
  assert.ok(Math.abs(model.rig.flipFrame.rotation.z+Math.PI)<1e-9)
  const fixtureBox=boxOf(byName(model,'turnover-flip'))
  assert.ok(fixtureBox.min.y>=0,`fixture below floor ${fixtureBox.min.y}`)
  // 四根周转钢丝绳在任意提升/翻转组合下都应该连接滑轮与吊点
  for(const combination of [{transferHoist:0,flip:0},{transferHoist:1,flip:0},{transferHoist:.6,flip:1}]){
   applyCranePose(model,{...home(),...combination})
   const fixtureTop=craneModelDimensions.transferFixtureTopY-craneModelDimensions.transferHoistDisplay*combination.transferHoist
   for(const entry of model.rig.transferRopes){
    const expected=craneModelDimensions.transferHoistFrameY-fixtureTop
    assert.ok(Math.abs(entry.object.scale.y-expected)<.01,`transfer rope ${entry.object.scale.y} vs ${expected}`)
   }
  }
 }finally{dispose(model.root)}
})

test('assembly wheels contact their rails, both walkways exist, and 2D axis moves only the sensor',()=>{
 const model=buildCraneModel()
 try{
  const tyre=(name,r,h)=>{
   const meshes=[];byName(model,name).traverse(o=>{if(o.geometry?.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop===r&&o.geometry.parameters.height===h)meshes.push(o)});return meshes;
  }
  applyCranePose(model,home());model.root.updateMatrixWorld(true)
  for(const w of tyre('trolley-drive',.2,.14)){
   const p=worldPosition(w);assert.ok(Math.abs(Math.abs(p.x)-1.75)<1e-8);assert.ok(Math.abs(p.y-.2-6.19)<1e-8)
  }
  for(const w of tyre('transfer-car',.17,.12)){
   const p=worldPosition(w);assert.ok(Math.abs(Math.abs(p.x)-1.30)<1e-8);assert.ok(Math.abs(p.y-.17-4.76)<1e-8)
  }
  const deck=boxOf(byName(model,'bridge-walkway'));assert.ok(deck.min.x<-3&&deck.max.x>3)
  const mount=byName(model,'laser-gimbal').position.toArray()
  applyCranePose(model,{...home(),scan:1});assert.equal(model.rig.scanner.rotation.y,Math.PI/2)
  assert.deepEqual(byName(model,'laser-gimbal').position.toArray(),mount)
  applyCranePose(model,home());assert.equal(model.rig.scanner.rotation.y,0)
  applyCranePose(model,{...home(),transferHoist:1})
  assert.equal(byName(model,'laser-gimbal').position.y,model.rig.hopper.position.y)
 }finally{dispose(model.root)}
})

test('applyCranePose is idempotent, clamps values and falls back to the shared rest pose',()=>{
 const model=buildCraneModel()
 try{
  const pose={travel:.2,trolley:.9,hoist:.4,rotation:.1,grip:.8,transfer:.3,transferHoist:.7,flip:.2}
  applyCranePose(model,pose)
  const first=model.parts.map(part=>part.position.toArray())
  const rotations=model.parts.map(part=>part.rotation.toArray())
  applyCranePose(model,pose)
  assert.deepEqual(model.parts.map(part=>part.position.toArray()),first)
  assert.deepEqual(model.parts.map(part=>part.rotation.toArray()),rotations)
  applyCranePose(model,{...pose,travel:5,trolley:-2,grip:9})
  applyCranePose(model,{travel:1,trolley:0,hoist:.4,rotation:.1,grip:1,transfer:.3,transferHoist:.7,flip:.2})
  const clamped=model.parts.map(part=>part.position.toArray())
  applyCranePose(model,{...pose,travel:5,trolley:-2,grip:9})
  assert.deepEqual(model.parts.map(part=>part.position.toArray()),clamped)
  applyCranePose(model,{...home(),travel:NaN,trolley:'bad',hoist:null,rotation:undefined})
  const fallback=model.parts.map(part=>part.position.toArray())
  applyCranePose(model,home())
  assert.deepEqual(model.parts.map(part=>part.position.toArray()),fallback)
  assert.throws(()=>applyCranePose(null,home()))
 }finally{dispose(model.root)}
})

test('home pose matches the shared crane-state axes and rest positions',()=>{
 const model=buildCraneModel()
 try{
  assert.deepEqual(craneAxes.map(axis=>axis.id).sort(),[...AXIS_IDS].sort())
  applyCranePose(model,craneHomePose())
  assert.ok(nearZero(byName(model,'bridge-girder').position.x))
  assert.equal(byName(model,'trolley-frame').position.z,(home().trolley-.5)*craneModelDimensions.trolleyDisplay)
  assert.equal(byName(model,'grab').position.y,craneModelDimensions.mastRetractedBottom)
  assert.ok(nearZero(byName(model,'grab').rotation.y))
  assert.ok(nearZero(model.rig.jawA.rotation.x))
  assert.ok(nearZero(model.rig.jawB.rotation.x))
  assert.equal(byName(model,'transfer-car').position.z,(home().transfer-.5)*craneModelDimensions.transferDisplay)
  assert.equal(byName(model,'turnover-flip').position.y,craneModelDimensions.transferFixtureTopY)
  assert.ok(nearZero(byName(model,'turnover-flip').rotation.z))
 }finally{dispose(model.root)}
})

test('moving groups keep clearance instead of passing through the bridge or each other',()=>{
 const model=buildCraneModel()
 try{
  const girderBoxAt=()=>boxOf(byName(model,'bridge-girder'))
  for(const hoist of [0,.5,1])for(const trolley of [0,.5,1])for(const travel of [0,1]){
   applyCranePose(model,{...home(),hoist,trolley,travel})
   const grabBox=boxOf(byName(model,'grab'))
   assert.ok(!solidBoxes(byName(model,'bridge-girder')).some(a=>solidBoxes(byName(model,'grab')).some(b=>overlapsVolume(a,b))),`grab intersects solid girders at hoist ${hoist}`)
  }
  for(const hoist of [0,1])for(const transferHoist of [0,1])for(const flip of [0,1])for(const transfer of [0,1])for(const trolley of [0,1]){
   applyCranePose(model,{...home(),hoist,transferHoist,flip,transfer,trolley})
   const grabBox=boxOf(byName(model,'grab'))
   assert.ok(!boxOf(byName(model,'turnover-flip')).intersectsBox(grabBox),'fixture hits the grab')
   assert.ok(!solidBoxes(byName(model,'transfer-car')).some(b=>overlapsVolume(b,grabBox)),'transfer car hits the grab')
   assert.ok(!boxOf(byName(model,'trolley-frame')).intersectsBox(boxOf(byName(model,'transfer-car'))),'trolley hits the transfer car')
  }
 }finally{dispose(model.root)}
})

test('raised grab can enter the lowered transfer passage; rectangular bin clears the fixed frame while flipping',()=>{
 const model=buildCraneModel()
 try{
  for(let i=0;i<=20;i++){
   applyCranePose(model,{...home(),transfer:1,transferHoist:1,trolley:.85+i*.15/20},{workshop:true})
   assert.ok(Math.abs(model.rig.grab.position.z-(.35+i*.15/20)*17)<1e-8)
   const moving=[...model.rig.trolley,...model.rig.grabAttached].flatMap(solidBoxes),carriage=model.rig.transfer.flatMap(solidBoxes)
   assert.ok(!moving.some(a=>carriage.some(b=>overlapsVolume(a,b))),'raised grab/arm crosses solid carriage')
  }
  for(let i=-12;i<=12;i++){
   applyCranePose(model,{...home(),transferHoist:1,flip:i/12})
   const fixed=[...byName(model,'turnover-flip').children.filter(o=>o!==model.rig.flipFrame),...model.rig.turnoverAttached].flatMap(solidBoxes),moving=[model.rig.hopper,...model.rig.turnoverRotating,model.rig.gimbal].flatMap(solidBoxes)
   assert.ok(!moving.some(a=>fixed.some(b=>overlapsVolume(a,b))),`bin/attachments intersect outer frame at ${i/12*180} degrees`)
   for(const part of [...model.rig.turnoverRotating,model.rig.gimbal])assert.equal(part.rotation.z,model.rig.hopper.rotation.z)
  }
 }finally{dispose(model.root)}
})

test('overall proportions stay in the documented illustrative envelope',()=>{ const model=buildCraneModel()
 try{
  applyCranePose(model,home())
  const rootBox=boxOf(model.root)
  const size=rootBox.getSize(new THREE.Vector3())
  assert.ok(size.x>=30&&size.x<31.2,`runway length ${size.x}`)
  assert.ok(size.z>20&&size.z<22.5,`span ${size.z}`)
  assert.ok(size.y>6.5&&size.y<9,`height ${size.y}`)
  assert.ok(rootBox.min.y>=-.02)
  // 抓斗位于两主梁之间、主梁下弦以下，端梁与小车都在展示行程内。
  assert.equal(byName(model,'grab').position.x,0)
  assert.ok(byName(model,'grab').position.y<4.6)
  assert.ok(byName(model,'grab').position.x>-craneModelDimensions.span/2)
  applyCranePose(model,{...home(),travel:1,trolley:1})
  assert.ok(byName(model,'endcarriage-north').position.x<=craneModelDimensions.travelDisplay/2)
  assert.ok(byName(model,'trolley-frame').position.z<=craneModelDimensions.trolleyDisplay/2+1e-9)
 }finally{dispose(model.root)}
})

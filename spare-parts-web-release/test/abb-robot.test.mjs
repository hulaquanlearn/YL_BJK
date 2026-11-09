import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {robotParts,robotGroups,robotFrames,robotTools,applyRobotSpread,applyRobotWristPose} from '../src/utils/abb-robot.mjs'
import {mobileModules} from '../src/utils/mobile-workspace.mjs'
import {applyRobotJoints,robotReferenceJoints} from '../src/utils/abb-kinematics.mjs'
import {robotDisassemblyStages,disassemblyProgress} from '../src/utils/abb-robot-disassembly.mjs'
import {createRobotServicePanel} from '../src/utils/abb-service-panel.mjs'

test('six black brake-release buttons sit in the CAD guard and follow axis 1 during motion and disassembly',async()=>{
 const bytes=await readFile(new URL('../public/models/abb-irb6700/irb6700-150-320.glb',import.meta.url))
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const panel=createRobotServicePanel(scene),guard=panel.getObjectByName('brake-button-guard'),buttons=panel.children.filter(n=>n.userData.axis)
 assert.equal(buttons.length,6);assert.ok(guard.geometry.attributes.position.count/3>100);assert.equal(panel.getObjectByName('brake-button-backing'),undefined,'no fabricated backing plate')
 assert.deepEqual(buttons.map(n=>n.userData.axis),[1,2,3,4,5,6]);assert.ok(buttons.every(n=>n.material.color.getHexString()==='171b1e'))
 const guardBox=new THREE.Box3().setFromObject(guard)
 scene.updateMatrixWorld(true)
 for(const cap of buttons){
  assert.equal(cap.geometry.type,'CylinderGeometry','brake control stays a round cap')
  const hit=new THREE.Raycaster(new THREE.Vector3(cap.position.x,cap.position.y,-.8),new THREE.Vector3(0,0,1)).intersectObject(cap)[0]
  assert.ok(hit,'button '+cap.userData.axis+' faces the service opening')
  assert.ok(guardBox.containsPoint(cap.position),'button '+cap.userData.axis+' sits inside the CAD guard recess')
   const capBack=cap.position.z+.002
   assert.ok(Math.abs(capBack-cap.userData.bodyMountZ)<1e-7,'button back contacts robot body mounting plane')
   assert.ok(cap.position.z-.002>guardBox.min.z+.04,'button front stays behind the projecting anti-touch guard')
   const body=scene.getObjectByName('axis1').children.filter(item=>item.isMesh)
   const bodyHit=new THREE.Raycaster(cap.position.clone(),new THREE.Vector3(0,0,1)).intersectObjects(body,true)[0]
   assert.ok(bodyHit&&Math.abs(bodyHit.distance-.002)<1e-5,'original CAD body supports each cap at the robot body plane')
   assert.equal(bodyHit.object.name,cap.userData.bodyMountMesh)
  assert.ok(cap.userData.labelAnchor.length===3&&cap.userData.labelNormal.length===3,'label anchor/normal metadata')
 }
 const middle=buttons[2],side=new THREE.Vector3(-1,0,-1).normalize()
 const sideHit=new THREE.Raycaster(middle.position.clone().addScaledVector(side,.5),side.negate()).intersectObject(scene,true)[0]
 assert.equal(sideHit.object,middle,'side window exposes the body-mounted cap instead of a guard or body face covering it')
 const local=buttons[0].position.clone();applyRobotJoints(scene,[50,0,0,0,90,0],1)
 assert.ok(buttons[0].getWorldPosition(new THREE.Vector3()).distanceTo(local.applyMatrix4(scene.getObjectByName('axis1').matrixWorld))<1e-8)
 scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
})

test('disassembly separates every adjoining axis and reverses stages to the exact assembly',async()=>{
 const bytes=await readFile(new URL('../public/models/abb-irb6700/irb6700-150-320.glb',import.meta.url))
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 const box=id=>new THREE.Box3().setFromObject(scene.getObjectByName(id))
 const gap=(a,b)=>Math.max(...['x','y','z'].map(d=>Math.max(a.min[d]-b.max[d],b.min[d]-a.max[d])))
 for(const pose of [robotReferenceJoints,[0,0,0,0,0,0]]){
  applyRobotJoints(scene,pose,0);const original=scene.children.map(node=>node.matrixWorld.clone())
  for(let stage=0;stage<robotDisassemblyStages.length;stage++){
   const progress=(stage+.5)/robotDisassemblyStages.length
   applyRobotJoints(scene,pose,progress)
   for(let later=stage+1;later<robotDisassemblyStages.length;later++)for(const id of robotDisassemblyStages[later].ids){
    if(id==='tool')continue
    assert.equal(disassemblyProgress(id,progress),0,id+' stays assembled until its stage')
   }
  }
  applyRobotJoints(scene,pose,1)
  for(let axis=1;axis<=6;axis++)assert.ok(gap(box(axis===1?'base':'axis'+(axis-1)),box('axis'+axis))>.15,'clear interface before axis '+axis)
  assert.ok(gap(box('axis1'),box('axis2'))>.5,'axis 1 and axis 2 are actually separated')
  for(let stage=robotDisassemblyStages.length;stage>=0;stage--)applyRobotJoints(scene,pose,stage/robotDisassemblyStages.length)
  scene.children.forEach((node,i)=>assert.deepEqual(node.matrixWorld.elements,original[i].elements,node.name+' restored exactly'))
 }
 scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
})

test('ABB assembly keeps the exact variant, component inventory and metric CAD envelope',async()=>{
 const bytes=await readFile(new URL('../public/models/abb-irb6700/irb6700-150-320.glb',import.meta.url))
 const source=JSON.parse(await readFile(new URL('../public/models/abb-irb6700/source.json',import.meta.url)))
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.glbSha256)
 assert.equal(source.model,'ABB IRB 6700-150/3.20');assert.equal(source.reachM,3.2);assert.equal(source.payloadKg,150)
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
 assert.equal(scene.children.length,12)
 assert.deepEqual(new Set(scene.children.map(n=>n.name)),new Set(robotParts.map(p=>p.id)))
 assert.deepEqual(new Set(robotGroups.flatMap(g=>g.ids)),new Set(robotParts.map(p=>p.id)))
 const base=new THREE.Box3().setFromObject(scene.getObjectByName('base')).getSize(new THREE.Vector3())
 assert.ok(Math.abs(base.x-1.004)<.0001);assert.ok(Math.abs(base.z-.720)<.0001)
 const bounds=new THREE.Box3().setFromObject(scene)
 assert.ok(bounds.max.y>2.44&&bounds.max.y<2.45,'original CAD height is 2445 mm')
 let triangles=0
 scene.traverse(mesh=>{if(!mesh.isMesh)return;triangles+=mesh.geometry.index.count/3;assert.ok(mesh.geometry.attributes.position.count>0);for(const n of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(n))})
 assert.equal(triangles,77788);assert.equal(triangles,source.parts.reduce((n,p)=>n+p.triangles,0))
 for(const frame of robotFrames){
  assert.ok(scene.getObjectByName(frame.parent))
  assert.deepEqual(frame.position,source.frames[frame.id].position)
  const axes=['x','y','z'].map(axis=>new THREE.Vector3().fromArray(frame[axis]))
  assert.ok(axes[0].clone().cross(axes[1]).equals(axes[2]),'right-handed '+frame.id)
  for(const axis of ['x','y','z'])assert.deepEqual(frame[axis],source.frames[frame.id][axis])
 }
 assert.deepEqual(robotFrames[0].z,[0,1,0],'ABB Z-up converts to glTF Y-up')
 applyRobotWristPose(scene)
 const flange=new THREE.Vector3(...robotFrames[1].position).applyMatrix4(scene.getObjectByName('axis6').matrixWorld)
 assert.ok(flange.distanceTo(new THREE.Vector3(1.9125,2.06,0))<1e-6,'display pose keeps the original 200 mm wrist offset')
 const before=scene.children.map(n=>n.position.clone())
 applyRobotSpread(scene,1);assert.equal(scene.getObjectByName('base').position.length(),0)
 assert.ok(scene.getObjectByName('axis6').position.length()>1)
 applyRobotSpread(scene,0);scene.children.forEach((node,i)=>assert.ok(node.position.equals(before[i]),node.name+' restores exactly'))
 scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
})

test('both local feeder heads keep their adapter at the same flange and expose only the requested tool choices',async()=>{
 assert.deepEqual(robotTools.map(t=>t.id),['tool-640','tool-700'])
 const metadata=JSON.parse(await readFile(new URL('../public/models/abb-irb6700/equipment.json',import.meta.url)))
 for(const asset of metadata.assets){
  const bytes=await readFile(new URL('../public/models/abb-irb6700/'+asset.id+'.glb',import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.glbSha256)
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const bounds=new THREE.Box3().setFromObject(scene);assert.ok(!bounds.isEmpty());assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))
  if(asset.id.startsWith('tool-')){
   let draws=0;scene.traverse(node=>{assert.ok(!/体积模拟|模拟物料重量/.test(node.name),'CAD load placeholders must not seal the hopper inlet');if(node.isMesh)draws++})
   assert.ok(draws<=280,'batch CAD faces into at most one draw per component')
   assert.equal(asset.omittedReferenceSolids.length,1)
   const mount=scene.getObjectByProperty('name','FJLA00091006_ABB机械臂转接法兰_默认按加工') || (()=>{let found;scene.traverse(n=>{if(n.name.includes('ABB机械臂转接法兰'))found=n});return found})()
   assert.ok(mount,asset.id+' has the original ABB adapter')
   const box=new THREE.Box3().setFromObject(mount),center=box.getCenter(new THREE.Vector3())
   assert.ok(Math.abs(center.x)<.00001&&Math.abs(center.z)<.00001,'adapter centred on tool assembly axis')
   assert.ok(Math.abs(box.min.y+.005)<.00001,'matching adapter mounting face')
   assert.ok(Math.abs(box.max.y-.163)<.00001,'matching adapter height')
   assert.ok(bounds.max.y>.9&&bounds.max.y<1,'feeder head retains its original scale')
  }
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
 }
})

test('web and native App navigation expose the renamed entry through the existing route',()=>{
 for(const options of [{},{nativeAndroid:true}])for(const user of [{role:'admin'},{role:'qu_making'}]){
  const links=mobileModules(user,options).flatMap(g=>g.links)
  assert.equal(links.find(l=>l.path==='/agv-vehicles')?.label,'设备模型展示')
 }
})

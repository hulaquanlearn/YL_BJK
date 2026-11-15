import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {OBB} from 'three/addons/math/OBB.js'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

const bounds=mesh=>new THREE.Box3().setFromObject(mesh)
const overlaps=(a,b)=>['x','y','z'].every(axis=>Math.min(a.max[axis],b.max[axis])-Math.max(a.min[axis],b.min[axis])>1e-5)
const orientedBounds=mesh=>{mesh.geometry.computeBoundingBox();return new OBB().fromBox3(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld)}
function withModel(check,variant='old'){
 const model=buildAgvModel({variant});model.root.updateMatrixWorld(true)
 try{check(model)}finally{const materials=new Set();model.root.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m)});materials.forEach(m=>m.dispose())}
}

const inspectHousingZones=({root,parts})=>{
 assert.equal(root.userData.internalLayoutVersion,3)
 assert.equal(root.userData.internalPlacement,'illustrative')
 const ids=['drive-left','drive-right','lift','control','plc','relay-bank','fuse-panel','io-board','aux-power','auxiliary-unit','wireless-connectors','dcdc','kinco-left','kinco-right','tpm','ekk','supercapacitor']
 // Named hard solids only. Wiring, fasteners and intended contacts within one
 // assembly are not a CAD interference/kinematic analysis.
 const solids=parts.filter(p=>ids.includes(p.name)).flatMap(part=>part.children.filter(o=>o.isMesh&&o.name&&o.geometry.type!=='TubeGeometry').map(mesh=>({part:part.name,mesh,box:bounds(mesh)})))
 const required=['smps-housing','dcdc-housing','tpm-housing','ekk-housing','capacitor-enclosure','drive-encoder','lift-lower-rail',...(root.userData.variant==='old'?['plc-housing','auxiliary-finned-housing']:['controller-housing','kinco-drive-housing'])]
 for(const name of required)assert.ok(solids.some(s=>s.mesh.name===name),name)
 for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){
  const a=solids[i],b=solids[j];if(a.part===b.part)continue
  // Rotated scissor arms have large empty AABB corners. A separating OBB
  // proves those candidates clear; a remaining candidate still needs review.
  const candidate=overlaps(a.box,b.box)&&orientedBounds(a.mesh).intersectsOBB(orientedBounds(b.mesh),1e-9)
  assert.ok(!candidate,`${a.part}/${a.mesh.name} has an unresolved solid-overlap candidate with ${b.part}/${b.mesh.name}`)
 }
 const chassis=parts.find(p=>p.name==='chassis')
 for(const plate of parts.find(p=>p.name==='pickup').children.filter(o=>o.name==='pickup-plate'))for(const frame of chassis.children.filter(o=>o.isMesh))assert.ok(!overlaps(bounds(plate),bounds(frame)),'pickup plate intersects chassis/keel')
 for(const drive of parts.filter(p=>p.name.startsWith('drive-'))){
  const tyre=bounds(drive.getObjectByName('drive-tyre'))
  for(const frame of chassis.children.filter(o=>o.isMesh))assert.ok(!overlaps(tyre,bounds(frame)),'tyre intersects chassis/floor')
 }
}
for(const variant of ['old','new'])test(`${variant} schematic housings occupy separate static zones, clear of drive and lift solids`,()=>withModel(inspectHousingZones,variant))

test('scissor arms have separate thickness planes, center pins and recognizable drive suspension',()=>withModel(({parts})=>{
 const lift=parts.find(p=>p.name==='lift')
 const a=lift.children.filter(o=>o.name==='scissor-arm-a'),b=lift.children.filter(o=>o.name==='scissor-arm-b')
 assert.equal(a.length,2);assert.equal(b.length,2)
 for(let i=0;i<2;i++)assert.ok(!overlaps(bounds(a[i]),bounds(b[i])),'crossing arms must not occupy the same thickness plane')
 for(const name of ['scissor-center-pin','lift-yoke','lift-slider','lift-screw','lift-servo','lift-limit-switch','lift-nut-lug'])assert.ok(lift.getObjectByName(name),name)
 const link=bounds(lift.getObjectByName('lift-linkage'))
 for(const name of ['lift-gearbox','lift-servo'])assert.ok(!overlaps(link,bounds(lift.getObjectByName(name))),`draw linkage penetrates ${name}`)
 for(const drive of parts.filter(p=>p.name.startsWith('drive-')))for(const name of ['drive-pivot-base','drive-adjustment-seat','drive-spring'])assert.ok(drive.getObjectByName(name),name)
 assert.match(lift.userData.description,/不模拟或验证举升运动/)
}))

test('navigation scanner clears the rear recess and the proximity switch sits inside the central platform opening',()=>withModel(({parts})=>{
 const navigation=parts.find(p=>p.name==='navigation'),rear=parts.find(p=>p.name==='rear-cover'),platform=parts.find(p=>p.name==='platform')
 const head=navigation.getObjectByName('navigation-scan-head')
 assert.ok(head.position.x<-.60)
 assert.ok(Math.abs(head.position.z)<.02,'navigation radar must be at the transverse centre')
 const ray=new THREE.Raycaster(new THREE.Vector3(head.position.x,head.position.y,head.position.z),new THREE.Vector3(-1,0,0),0,.3)
 assert.equal(ray.intersectObject(rear,true).length,0,'outward scan ray should pass through the central end recess')
 ray.ray.origin.y=.36
 assert.ok(ray.intersectObject(rear,true).length>0,'upper end beam is still present above the recess')
 ray.ray.origin.y=.15
 assert.ok(ray.intersectObject(rear,true).length>0,'lower end beam is still present below the recess')
 const deck=platform.getObjectByName('platform-deck')
 const down=(x,z)=>{const probe=new THREE.Raycaster(new THREE.Vector3(x,.6,z),new THREE.Vector3(0,-1,0));return probe.intersectObject(deck).length}
 assert.equal(down(-.02,0),0,'central platform opening is not a painted disc')
 assert.equal(down(-.075,0),0,'rectangular opening extends beyond the old circular hole')
 assert.equal(down(0,.06),1,'opening is rectangular, not the old 50 mm circle')
 assert.equal(down(.10,0),1,'solid deck remains beside the opening')
 assert.ok(platform.getObjectByName('deck-bent-flap'),'bent sheet over the opening is modelled')
 assert.equal(platform.getObjectByName('load-switch-lever'),undefined,'old vehicle has no external lever')
 assert.equal(platform.getObjectByName('load-switch-base'),undefined,'old vehicle has no external switch base')
 const sensor=bounds(platform.getObjectByName('load-proximity-body'))
 assert.ok(sensor.min.x>-.083&&sensor.max.x<.053&&sensor.min.z>-.040&&sensor.max.z<.040,'switch fits inside the central rectangular opening')
 assert.ok(sensor.max.y<.440&&sensor.min.y>.418,'switch sits below the bent flap and above the frame')
 const bracket=platform.getObjectByName('load-proximity-bracket')
 const through=new THREE.Raycaster(new THREE.Vector3(-.01,.427,0),new THREE.Vector3(1,0,0),0,.03)
 assert.equal(through.intersectObject(bracket).length,0,'mounting bracket has a real hole around the threaded sensor')
 assert.ok(platform.getObjectByName('load-proximity-cable'))
}))

test('exploded internals retain their assembly relationships and pickup plates never fall through the floor',()=>withModel(({parts})=>{
 for(const id of ['drive-left','drive-right','lift','tpm','ekk','supercapacitor'])assert.deepEqual(parts.find(p=>p.name===id).userData.explodeOffset,[0,0,0],id)
 for(const part of parts){
  assert.equal(part.userData.explodeOffset.length,3,part.name)
  assert.ok(part.userData.explodeOffset.every(Number.isFinite),`${part.name}: finite per-part display offset`)
 }
 // Control/navigation are now independent selectable assemblies; their public
 // explode offsets intentionally differ from the old all-in-one zero offset.
 const pickup=parts.find(p=>p.name==='pickup')
 assert.equal(pickup.children.filter(o=>o.name==='pickup-plate').length,2)
 for(const progress of [0,.25,.5,.75,1])for(const part of parts){
  part.position.fromArray(part.userData.explodeOffset).multiplyScalar(progress);part.updateMatrixWorld(true)
  assert.ok(bounds(part).min.y>-.004,`${part.name} below floor while expanded ${progress}`)
 }
 assert.match(pickup.userData.description,/不代表实际拆装方向/)
}))

// Static geometry regressions, not a manufacturing, motion or safety certificate.
// Private photos are evidence only and are never imported into the published model.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

const EPS=2e-6
const boxOf=object=>new THREE.Box3().setFromObject(object)
const meshes=object=>{const found=[];object.traverse(node=>{if(node.isMesh)found.push(node)});return found}
function withModel(variant,check){
 const model=buildAgvModel({variant});model.root.updateMatrixWorld(true)
 try{check(model)}finally{const materials=new Set();model.root.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material)});materials.forEach(material=>material.dispose())}
}
// These wheels are circular cylinders aligned with world Z. Use the ideal circular
// envelope (conservative for the actual 32-sided mesh), not its rectangular AABB.
function wheelSpec(mesh){
 assert.equal(mesh.geometry.type,'CylinderGeometry')
 const {radiusTop,radiusBottom,height}=mesh.geometry.parameters
 assert.equal(radiusTop,radiusBottom)
 const centre=mesh.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld)
 assert.ok(Math.abs(axis.z)>1-1e-8,'wheel axis must be Z for this analytic check')
 return {centre,radius:radiusTop,halfLength:height/2}
}
function pointWheelDistance(point,wheel){
 const radial=Math.hypot(point.x-wheel.centre.x,point.y-wheel.centre.y)-wheel.radius
 const axial=Math.abs(point.z-wheel.centre.z)-wheel.halfLength
 return Math.hypot(Math.max(radial,0),Math.max(axial,0))+Math.min(Math.max(radial,axial),0)
}
// Exact separation of an axis-aligned rectangular solid and the ideal Z cylinder.
// AABB overlap alone is NOT a failure: a box near a round wheel's corner may clear.
function wheelBoxDistance(wheel,box){
 const dx=Math.max(box.min.x-wheel.centre.x,0,wheel.centre.x-box.max.x)
 const dy=Math.max(box.min.y-wheel.centre.y,0,wheel.centre.y-box.max.y)
 const radial=Math.hypot(dx,dy)-wheel.radius
 const axial=Math.max(box.min.z-wheel.centre.z-wheel.halfLength,wheel.centre.z-wheel.halfLength-box.max.z)
 return Math.hypot(Math.max(radial,0),Math.max(axial,0))+Math.min(Math.max(radial,axial),0)
}
// Solid distance is 1-Lipschitz. A triangle is within its longest edge length
// of every vertex, so min(vertex distances)-longestEdge is a conservative
// lower bound for ALL its points. This checks the real rendered triangles,
// including between samples; it does not mislabel a centreline-only sample as
// a continuous-curve proof. Tube UV.x identifies the working span by arc length.
function tubeClearance(tube,distance,{from=0,to=1}={}){
 const {position,uv}=tube.geometry.attributes,index=tube.geometry.index
 let minimum=Infinity,checked=0
 const vertex=id=>new THREE.Vector3().fromBufferAttribute(position,id).applyMatrix4(tube.matrixWorld)
 for(let i=0;i<(index?.count??position.count);i+=3){
  const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset)
  if(ids.some(id=>uv.getX(id)<from||uv.getX(id)>to))continue
  const [a,b,c]=ids.map(vertex),edge=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))
  minimum=Math.min(minimum,Math.min(distance(a),distance(b),distance(c))-edge);checked++
 }
 assert.ok(checked>0,'tube working-span geometry is not empty')
 return minimum
}

test('clearance predicate distinguishes AABB candidates, real old interference and a positive axial gap',()=>{
 const wheel={centre:new THREE.Vector3(.01,.135,.278),radius:.135,halfLength:.044}
 const box=(min,max)=>new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max))
 const corner=box([.14,.26,.25],[.15,.27,.26])
 const wheelAabb=box([-.125,0,.234],[.145,.27,.322])
 assert.ok(wheelAabb.intersectsBox(corner),'candidate deliberately overlaps the rectangular wheel envelope')
 assert.ok(wheelBoxDistance(wheel,corner)>.04,'round wheel clears this AABB corner candidate')
 assert.ok(wheelBoxDistance(wheel,box([-.14,.14,.165],[.02,.27,.265]))<-.01,'old gearbox genuinely enters the wheel solid')
 assert.ok(Math.abs(wheelBoxDistance(wheel,box([-.14,.14,.12],[.02,.27,.22]))-.014)<1e-10,'inboard box has a computed 14mm axial clearance')
})

for(const variant of ['old','new']){
 test(`${variant} R01: three separated fixed-side drive harnesses clear the rotating tyre`,()=>withModel(variant,({parts})=>{
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const wheel=wheelSpec(drive.getObjectByName('drive-tyre'))
   const wires=meshes(drive).filter(mesh=>mesh.geometry.type==='TubeGeometry'&&mesh.name!=='drive-spring')
   assert.equal(wires.length,3,`${drive.name}: three drive circuits remain visible`)
   const starts=[]
   for(const wire of wires){
    const start=wire.geometry.parameters.path.getPoint(0).applyMatrix4(wire.matrixWorld);starts.push(start)
    assert.ok(start.x<-.30,`${drive.name}: fixed encoder-side takeoff, not wheel face ${start.toArray()}`)
    const encoder=drive.getObjectByName('drive-encoder'),local=encoder.worldToLocal(start.clone()),parameters=encoder.geometry.parameters
    assert.ok(Math.hypot(local.x,local.z)<parameters.radiusTop&&Math.abs(local.y)<parameters.height/2,`${drive.name}: each harness centreline starts inside the fixed casing, not floating beside it`)
    assert.ok(Math.abs(start.z)<.23,`${drive.name}: harness remains on the inboard side`)
    const clearance=tubeClearance(wire,point=>pointWheelDistance(point,wheel))
    assert.ok(clearance>.002,`${drive.name}/${wire.name}: conservative tyre clearance ${clearance}m`)
   }
   for(let i=0;i<starts.length;i++)for(let j=i+1;j<starts.length;j++)assert.ok(starts[i].distanceTo(starts[j])>.0046,'drive wires must not coincide or occupy the same cross-section')
  }
 }))
 test(`${variant} R02: gearbox clears wheel band while motor has a continuous shaft connection`,()=>withModel(variant,({parts})=>{
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const wheel=wheelSpec(drive.getObjectByName('drive-tyre')),gear=drive.getObjectByName('drive-gearbox'),motor=drive.getObjectByName('drive-motor')
   const clearance=wheelBoxDistance(wheel,boxOf(gear))
   assert.ok(clearance>.005,`${drive.name}: gearbox-to-wheel clearance ${clearance}m`)
   // The transmission shaft/flange may intentionally overlap both housings.
   const shaft=drive.getObjectByName('drive-motor-coupling');assert.ok(shaft,'the former 5mm motor/gearbox gap has a connector')
   const connector=boxOf(shaft),g=boxOf(gear),m=boxOf(motor)
   assert.ok(connector.min.x<=m.max.x+EPS&&connector.max.x>=g.min.x-EPS,'shaft bridges the two housing end planes')
   assert.ok(connector.intersectsBox(g)&&connector.intersectsBox(m),'connector reaches both housings')
  }
 }))
 test(`${variant} R05: inboard transmission clears both scissor leaves and protruding centre pins`,()=>withModel(variant,({parts})=>{
  const lift=parts.find(part=>part.name==='lift'),pins=meshes(lift).filter(mesh=>mesh.name==='scissor-center-pin')
  assert.equal(pins.length,2)
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const gear=boxOf(drive.getObjectByName('drive-gearbox')),motor=boxOf(drive.getObjectByName('drive-motor'))
   for(const pin of pins){
    const clearance=wheelBoxDistance(wheelSpec(pin),gear)
    assert.ok(clearance>.002,`${drive.name}: gear-to-centre-pin true cylinder/box clearance ${clearance}m`)
   }
   for(const arm of meshes(lift).filter(mesh=>['scissor-arm-a','scissor-arm-b'].includes(mesh.name))){
    const slab=boxOf(arm)
    for(const [name,housing] of [['gearbox',gear],['motor',motor]]){
     const gap=Math.max(housing.min.z-slab.max.z,slab.min.z-housing.max.z)
     assert.ok(gap>.002,`${drive.name}/${name}: separating thickness-plane clearance to ${arm.name} ${gap}m`)
    }
   }
  }
 }))
 test(`${variant} R03: spring working coils clear the seat rather than hiding in a solid block`,()=>withModel(variant,({parts})=>{
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const spring=drive.getObjectByName('drive-spring'),seat=boxOf(drive.getObjectByName('drive-adjustment-seat'))
   // End coils can touch seats. The central 80% is the working span, not a joint.
   const positions=spring.geometry.attributes.position,uv=spring.geometry.attributes.uv,index=spring.geometry.index
   let workingMinY=Infinity
   for(let i=0;i<(index?.count??positions.count);i+=3){
    const ids=[0,1,2].map(offset=>index?index.getX(i+offset):i+offset),times=ids.map(id=>uv.getX(id))
    if(Math.max(...times)<.1||Math.min(...times)>.9)continue
    // Include the WHOLE boundary triangles, not just the sampled vertices in
    // range; this also certifies the portions crossing the UV=.1/.9 planes.
    for(const id of ids){
     const point=new THREE.Vector3().fromBufferAttribute(positions,id).applyMatrix4(spring.matrixWorld)
     workingMinY=Math.min(workingMinY,point.y)
    }
   }
   assert.ok(Number.isFinite(workingMinY),'spring working-span triangles are nonempty')
   // Triangle interiors interpolate vertex Y: this is a continuous separating
   // plane for the working mesh, not an AABB-only interference judgement.
   for(const [name,support] of [['seat',seat],['rocker',boxOf(drive.getObjectByName('drive-rocker'))]]){
    const clearance=workingMinY-support.max.y
    assert.ok(clearance>.005,`${drive.name}: working-coil vertical clearance to ${name} ${clearance}m`)
   }
   const springBounds=boxOf(spring)
   assert.ok(springBounds.max.y-springBounds.min.y>.075,'do not remove/compress the working spring to conceal interference')
   assert.ok(seat.max.y-seat.min.y<.025,'lower seat is a seat, not the former 90mm solid enclosure')
  }
 }))
 test(`${variant} R06: schematic supports actually touch their floor, seat and power housings`,()=>withModel(variant,({parts})=>{
  const floors=meshes(parts.find(part=>part.name==='chassis')).filter(mesh=>mesh.name==='floor-end').map(boxOf)
  const faceContact=(upper,lower)=>Math.abs(upper.min.y-lower.max.y)<1e-6&&['x','z'].every(axis=>Math.min(upper.max[axis],lower.max[axis])-Math.max(upper.min[axis],lower.min[axis])>1e-5)
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const pivot=boxOf(drive.getObjectByName('drive-pivot-base')),seat=boxOf(drive.getObjectByName('drive-adjustment-seat')),rocker=boxOf(drive.getObjectByName('drive-rocker'))
   assert.ok(floors.some(floor=>faceContact(pivot,floor)),`${drive.name}: pivot lands on end floor`)
   assert.ok(faceContact(seat,rocker),`${drive.name}: seat lands on rocker top`)
   const feet=meshes(drive).filter(mesh=>mesh.name==='drive-spring-seat-foot')
   assert.equal(feet.length,2)
   for(const foot of feet)assert.ok(faceContact(seat,boxOf(foot)),`${drive.name}: seat touches each mounting foot`)
  }
  for(const id of ['ekk','dcdc']){
   const unit=parts.find(part=>part.name===id),tray=boxOf(unit.getObjectByName(`${id}-tray`)),housing=boxOf(unit.getObjectByName(`${id}-housing`))
   assert.ok(faceContact(housing,tray),`${id}: housing sits on its tray, without a floating assembly gap`)
   const supports=meshes(unit).filter(mesh=>mesh.name===`${id}-tray-support`)
   assert.equal(supports.length,2)
   for(const support of supports){
    const leg=boxOf(support)
    assert.ok(faceContact(tray,leg),`${id}: tray touches support top`)
    assert.ok(floors.some(floor=>faceContact(leg,floor)),`${id}: support lands on floor`)
   }
  }
 }))
 test(`${variant} R04: every caster tyre clears chassis solids using circle/box geometry`,()=>withModel(variant,({parts})=>{
  const chassis=parts.find(part=>part.name==='chassis'),frames=meshes(chassis)
  let casterCount=0
  for(const drive of parts.filter(part=>['drive-left','drive-right'].includes(part.name))){
   const casters=meshes(drive).filter(mesh=>mesh.geometry.type==='CylinderGeometry'&&Math.abs(mesh.geometry.parameters.radiusTop-.034)<1e-8&&Math.abs(mesh.geometry.parameters.height-.030)<1e-8)
   assert.equal(casters.length,2,`${drive.name}: both schematic caster wheels retained`)
   for(const caster of casters){
    casterCount++;const wheel=wheelSpec(caster)
    for(const frame of frames){
     const distance=wheelBoxDistance(wheel,boxOf(frame))
     assert.ok(distance>=-EPS,`${drive.name} caster ${wheel.centre.toArray()} intersects chassis ${frame.name||frame.geometry.type}: ${distance}m`)
    }
   }
  }
  assert.equal(casterCount,4)
 }))
}

test('photo-visible electrical and navigation units are independent nonempty top-level parts',()=>withModel('old',({root,parts})=>{
 const required=['control','plc','relay-bank','fuse-panel','io-board','aux-power','auxiliary-unit','wireless-connectors','dcdc','sensors','navigation','tim-front','tim-rear','pickup','tpm','ekk','supercapacitor']
 const names=parts.map(part=>part.name);assert.equal(new Set(names).size,names.length)
 for(const id of required){
  const part=parts.find(candidate=>candidate.name===id);assert.ok(part,id)
  assert.equal(part.parent,root,`${id}: independent selection/explosion boundary`)
  assert.equal(part.userData.partId,id)
  assert.ok(meshes(part).length>0,`${id}: no empty compatibility placeholder`)
  assert.ok(part.userData.description?.trim().length,`${id}: evidence/functional description retained`)
 }
 const store=parts.find(part=>part.name==='supercapacitor'),manager=parts.find(part=>part.name==='ekk')
 assert.match(store.userData.label,/EKS/);assert.match(manager.userData.label,/EKK/)
 assert.equal(parts.filter(part=>/管理器/.test(part.userData.label)).length,1,'EKK is the manager, not an extra duplicate box')
 assert.equal(meshes(store).filter(mesh=>mesh.name==='capacitor-block').length,0,'six naked schematic blocks must not replace the photographed complete EKS unit')
 const relays=meshes(parts.find(part=>part.name==='relay-bank')).filter(mesh=>mesh.name==='relay-housing')
 assert.ok(relays.length>5,'photographed long bank replaces the former isolated five-relay cluster')
}))

test('old side covers have thin folded skins and actual through-openings, not painted vents on a solid backing',()=>withModel('old',({parts})=>{
 for(const id of ['left-cover','right-cover']){
  const cover=parts.find(part=>part.name===id),items=meshes(cover)
  const skins=items.filter(mesh=>{
   const parameters=mesh.geometry.parameters,shapes=[parameters?.shapes].flat().filter(Boolean)
   return mesh.geometry.type==='ExtrudeGeometry'&&shapes.some(shape=>shape.holes?.length)&&parameters.options.depth<=.004
  })
  assert.ok(skins.length>0,`${id}: sheet-metal skin contains geometric vent holes`)
  let probed=0
  for(const skin of skins){
   const shapes=[skin.geometry.parameters.shapes].flat()
   for(const shape of shapes)for(const hole of shape.holes){
    const points=hole.getPoints(32),centre=points.reduce((sum,point)=>sum.add(point),new THREE.Vector2()).multiplyScalar(1/points.length)
    const normal=new THREE.Vector3(0,0,1).transformDirection(skin.matrixWorld)
    const origin=new THREE.Vector3(centre.x,centre.y,0).applyMatrix4(skin.matrixWorld).addScaledVector(normal,.05)
    const ray=new THREE.Raycaster(origin,normal.clone().negate(),0,.1)
    assert.equal(ray.intersectObjects(skins).length,0,`${id}: another solid skin must not fill the vent opening`);probed++
   }
  }
  assert.ok(probed>0)
  const folds=items.filter(mesh=>mesh.geometry.type==='BoxGeometry'&&Math.min(...boxOf(mesh).getSize(new THREE.Vector3()).toArray())<=.004+EPS)
  assert.ok(folds.length>=3,`${id}: real thin flanges/returns, not just a thick silhouette extrusion`)
 }
}))

test('new vehicle retains electrical-only evidence boundaries and does not inherit unidentified old-photo devices',()=>withModel('new',({root,parts})=>{
 assert.equal(root.userData.newMechanicalAssemblyAvailable,false)
 assert.equal(root.userData.geometryVariantScope,'electrical-composition-only')
 for(const id of ['fuse-panel','io-board','auxiliary-unit','wireless-connectors'])assert.ok(!parts.some(part=>part.name===id),`${id} is old-photo evidence, not confirmed new-car hardware`)
 for(const id of ['kinco-left','kinco-right'])assert.equal(parts.find(part=>part.name===id)?.userData.sourceKnowledgeId,26)
}))

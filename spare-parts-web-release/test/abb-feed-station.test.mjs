import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createFeedStation,FEED_STATION_PARTS} from '../src/utils/abb-feed-station.mjs'

function triangles(root){
  let count=0
  root.traverse(object=>{
    if(!object.geometry)return
    const instances=object.isInstancedMesh?object.count:1
    const geometry=object.geometry
    count+=(geometry.index?geometry.index.count:geometry.attributes.position.count)/3*instances
  })
  return count
}
function rayHits(root,origin,direction){
  root.updateMatrixWorld(true)
  const raycaster=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction).normalize())
  return raycaster.intersectObject(root,true)
}
function overlap(a,b){
  const first=new THREE.Box3().setFromObject(a),second=new THREE.Box3().setFromObject(b)
  const size=new THREE.Vector3();first.clone().intersect(second).getSize(size)
  return size.x>1e-6&&size.y>1e-6&&size.z>1e-6
}

test('outletHeight 是短管下沿高度，弧形挡料板在其下方，出口XZ=0、允许悬空',()=>{
  const root=createFeedStation()
  assert.ok(root.isGroup);assert.equal(root.name,'abb-feed-station')
  assert.equal(root.userData.dimensionsEstimated,true);assert.match(root.userData.source,/无量尺/)
  assert.equal(root.userData.outletHeight,2.05)
  assert.deepEqual(root.userData.outlet.bottomCenter,[0,2.05,0])
  assert.deepEqual(root.userData.outlet.center,[0,2.05+.14,0])
  assert.equal(root.userData.outlet.bottomY,2.05)
  assert.match(root.userData.convention,/底沿|底面/)
  const outlet=root.getObjectByName('outlet')
  assert.ok(outlet);assert.equal(outlet.position.x,0);assert.equal(outlet.position.z,0);assert.ok(Math.abs(outlet.position.y-2.05)<1e-9)
  const gate=root.getObjectByName('gate');root.updateMatrixWorld(true)
  const gateClosed=new THREE.Box3().setFromObject(root.getObjectByName('gate-plate'))
  assert.ok(gateClosed.min.y<2.04&&gateClosed.max.y<2.05,'弧形挡料板位于短管底沿下方')
  const bounds=new THREE.Box3().setFromObject(root)
  assert.ok(bounds.min.y>1,'喂料机允许悬空，不应有落地支架');assert.ok(bounds.max.y>3.9&&bounds.max.y<4.6)
  root.userData.dispose()
})

test('outletHeight 可调，整机随高度变化且保持悬空',()=>{
  const low=createFeedStation({outletHeight:1.9}),high=createFeedStation({outletHeight:2.4})
  assert.ok(Math.abs(low.userData.outlet.bottomY-1.9)<1e-9)
  assert.ok(Math.abs(high.userData.outlet.bottomY-2.4)<1e-9)
  assert.ok(Math.abs(low.getObjectByName('outlet').position.y-1.9)<1e-9)
  const lowBounds=new THREE.Box3().setFromObject(low),highBounds=new THREE.Box3().setFromObject(high)
  assert.ok(highBounds.max.y>lowBounds.max.y);assert.ok(Math.abs((highBounds.max.y-lowBounds.max.y)-.5)<.02)
  assert.ok(lowBounds.min.y>1&&highBounds.min.y>1)
  for(const value of [0,NaN,-1,6,'x'])assert.throws(()=>createFeedStation({outletHeight:value}),RangeError)
  low.userData.dispose();high.userData.dispose()
})

test('短管/收缩斗/上斗是四壁薄板开口结构，上下开口尺寸与短管衔接',()=>{
  const root=createFeedStation()
  for(const name of FEED_STATION_PARTS)assert.ok(root.getObjectByName(name),'缺少 '+name)
  const outlet=root.userData.outlet,shrink=root.userData.shrinkingHopper,upper=root.userData.upperHopper
  assert.ok(Math.abs(shrink.bottomInnerWidth-outlet.innerWidth)<1e-9)
  assert.ok(Math.abs(shrink.bottomInnerDepth-outlet.innerDepth)<1e-9)
  assert.ok(Math.abs(shrink.topInnerWidth-upper.innerWidth)<1e-9)
  assert.ok(Math.abs(shrink.topInnerDepth-upper.innerDepth)<1e-9)
  for(const wall of ['front','back','left','right'])assert.ok(root.getObjectByName('outlet-walls-'+wall))
  assert.ok(!root.getObjectByName('outlet-tube'),'短管不应再是实心Box')
  assert.ok(!root.getObjectByName('upper-hopper-solid'),'上斗不应再是实心Box')
  assert.ok(triangles(root)<5000);let meshes=0;root.traverse(object=>{if(object.isMesh||object.isInstancedMesh)meshes++});assert.ok(meshes<80)
  root.userData.dispose()
})

test('闸板关闭封住出料口；打开后垂直射线贯通，无实心底板压住进料口',()=>{
  const root=createFeedStation()
  const closed=rayHits(root,[0,2.051,.10],[0,-1,0])
  assert.ok(closed.length>0);assert.match(closed[0].object.name,/gate/)
  const closedUp=rayHits(root,[0,1,.10],[0,1,0]);assert.ok(closedUp.length>0);assert.match(closedUp[0].object.name,/gate/)
  root.userData.setGate(1);root.updateMatrixWorld(true)
  assert.equal(rayHits(root,[0,2.051,.10],[0,-1,0]).length,0,'打开后闸板不应再挡住出口垂直路径')
  assert.equal(rayHits(root,[0,1,.10],[0,1,0]).filter(h=>/^gate/.test(h.object.name)).length,0)
  const mouth=rayHits(root,[0,5,-.36],[0,-1,0])
  assert.ok(!mouth.some(hit=>{let node=hit.object;while(node&&node!==root){if(/^chain-deck|chain-plates/.test(node.name))return true;node=node.parent}return false}),'链板/底板不应封住暂存斗顶口')
  root.userData.dispose()
})

test('链板沿 Z 输送、末端在暂存斗顶口上方卸料，挡板在X两侧',()=>{
  const root=createFeedStation()
  const floor=root.getObjectByName('chain-deck-floor'),left=root.getObjectByName('chain-deck-left-wall'),right=root.getObjectByName('chain-deck-right-wall')
  const floorSize=new THREE.Box3().setFromObject(floor).getSize(new THREE.Vector3())
  assert.ok(floorSize.z>floorSize.x*1.5)
  assert.ok(new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3()).z>new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3()).x)
  assert.ok(new THREE.Box3().setFromObject(right).getSize(new THREE.Vector3()).z>new THREE.Box3().setFromObject(right).getSize(new THREE.Vector3()).x)
  const plates=root.getObjectByName('chain-plates')
  assert.ok(plates.isInstancedMesh&&plates.count>=12)
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),zValues=[],xValues=[]
  for(let index=0;index<plates.count;index++){plates.getMatrixAt(index,matrix);position.setFromMatrixPosition(matrix);zValues.push(position.z);xValues.push(position.x)}
  assert.ok(Math.max(...zValues)-Math.min(...zValues)>1);assert.ok(Math.max(...xValues)-Math.min(...xValues)<1e-6)
  assert.ok(root.userData.chainDeck.dischargeZ<0&&root.userData.chainDeck.dischargeZ>-.47)
  assert.ok(root.userData.chainDeck.tailZ>1)
  root.userData.dispose()
})

test('气缸闸板联动：关闭底面/开合/杆端连接，模型移动后仍无悬空',()=>{
  const root=createFeedStation()
  const gate=root.getObjectByName('gate'),cylinder=root.getObjectByName('cylinder'),rod=root.getObjectByName('cylinder-rod')
  const mount=root.userData.gate.mount,barrelLength=root.userData.gate.barrelLength
  for(const amount of [0,.5,1]){
    assert.equal(root.userData.setGate(amount),amount)
    assert.equal(root.userData.getGate(),amount)
    assert.ok(Math.abs(gate.rotation.x-(-1.45*amount))<1e-9)
    root.updateMatrixWorld(true)
    const pin=root.userData.gate.pinLocal.clone().applyMatrix4(gate.matrixWorld)
    const rodEnd=cylinder.localToWorld(new THREE.Vector3(0,-(barrelLength+root.userData.gate.rodLength),0))
    assert.ok(rodEnd.distanceTo(pin)<1e-6)
    assert.ok(rod.scale.y>.04)
    assert.ok(Math.abs(rod.position.y-(-barrelLength-root.userData.gate.rodLength/2))<1e-9)
    assert.ok([...pin.toArray(),rod.scale.y].every(Number.isFinite))
    assert.ok(new THREE.Box3().setFromObject(root).min.y>1)
  }
  root.position.set(4,0,-2);root.rotation.y=.6;root.updateMatrixWorld(true);root.userData.setGate(.7);root.updateMatrixWorld(true)
  const movedPin=root.userData.gate.pinLocal.clone().applyMatrix4(gate.matrixWorld)
  const movedRodEnd=cylinder.localToWorld(new THREE.Vector3(0,-(barrelLength+root.userData.gate.rodLength),0))
  assert.ok(movedRodEnd.distanceTo(movedPin)<1e-6)
  assert.equal(root.userData.setGate(2),1);assert.equal(root.userData.setGate(-3),0);assert.equal(root.userData.setGate(NaN),0)
  root.userData.dispose()
})

test('无四脚支架/横梁/链板落地柱；气缸支架固定在收缩斗斗体上',()=>{
  const root=createFeedStation()
  for(const name of ['support-frame','support-leg-1','support-beam-left','support-beam-front','chain-deck-column-1','chain-deck-column-2'])assert.equal(root.getObjectByName(name),undefined,name+' 应已移除')
  let supports=0;root.traverse(object=>{if(/support-leg|support-beam|support-brace|chain-deck-column/.test(object.name))supports++})
  assert.equal(supports,0,'不应残留落地支架或链板尾柱')
  const bracket=root.getObjectByName('cylinder-bracket'),shrink=root.getObjectByName('shrinking-hopper'),cylinder=root.getObjectByName('cylinder')
  assert.ok(bracket&&shrink&&cylinder)
  root.updateMatrixWorld(true)
  assert.ok(overlap(bracket,shrink),'气缸支架必须与收缩斗斗体重叠固定')
  assert.ok(new THREE.Box3().setFromObject(bracket).containsPoint(root.userData.gate.mount),'气缸安装点必须在固定支架内')
  assert.ok(overlap(bracket,cylinder),'气缸与固定支架相连')
  root.userData.dispose()
})

test('每个实例材质独立，dispose 一个不影响另一个',()=>{
  const first=createFeedStation(),second=createFeedStation()
  const materials=root=>{const set=new Set();root.traverse(object=>{if(object.isMesh||object.isInstancedMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])set.add(material)});return set}
  const firstMaterials=materials(first),secondMaterials=materials(second)
  for(const material of firstMaterials)assert.ok(!secondMaterials.has(material),'两个实例不应共享材质')
  let disposed=0
  const sample=[...secondMaterials][0];sample.addEventListener('dispose',()=>{disposed++})
  first.userData.dispose()
  assert.equal(disposed,0,'dispose 第一个实例不应影响第二个')
  assert.ok(second.getObjectByName('outlet'));assert.equal(second.userData.setGate(1),1)
  second.userData.dispose()
})

test('无虚构内部件命名；低网格银灰金属',()=>{
  const root=createFeedStation()
  const names=[];const metals=new Set()
  root.traverse(object=>{if(object.name)names.push(object.name.toLowerCase());if((object.isMesh||object.isInstancedMesh)&&object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])metals.add(material)})
  assert.ok(!names.some(name=>/motor|gearbox|bearing|internal|fan/.test(name)))
  assert.ok(metals.size>=4)
  for(const material of metals){assert.ok(material.metalness>=.5);assert.ok(material.roughness>0&&material.roughness<1)}
  assert.ok(triangles(root)<5000)
  root.userData.dispose()
})

test('outletWidth/outletDepth 可选参数联动短管/收缩斗下口/闸板/铰轴；集成尺寸 .35×.22 贯通',()=>{
  const defaults=createFeedStation()
  assert.equal(defaults.userData.outlet.outerWidth,.46);assert.equal(defaults.userData.outlet.outerDepth,.36)
  assert.ok(Math.abs(defaults.userData.outlet.innerWidth-.428)<1e-9)
  assert.ok(Math.abs(defaults.userData.outlet.innerDepth-.328)<1e-9)
  const root=createFeedStation({outletWidth:.35,outletDepth:.22})
  const outlet=root.userData.outlet,shrink=root.userData.shrinkingHopper
  assert.ok(Math.abs(outlet.outerWidth-.35)<1e-9);assert.ok(Math.abs(outlet.outerDepth-.22)<1e-9)
  assert.ok(Math.abs(outlet.innerWidth-.318)<1e-9);assert.ok(Math.abs(outlet.innerDepth-.188)<1e-9)
  assert.ok(Math.abs(shrink.bottomInnerWidth-outlet.innerWidth)<1e-9)
  assert.ok(Math.abs(shrink.bottomInnerDepth-outlet.innerDepth)<1e-9)
  assert.equal(outlet.gateHinge[2],0)
  assert.ok(root.userData.gate.pinLocal.z>outlet.outerDepth/2)
  const plateSize=new THREE.Box3().setFromObject(root.getObjectByName('gate-plate')).getSize(new THREE.Vector3())
  assert.ok(Math.abs(plateSize.x-.39)<1e-6);assert.ok(Math.abs(plateSize.z-.26)<1e-6)
  for(const wall of ['front','back','left','right'])assert.ok(root.getObjectByName('outlet-walls-'+wall))
  assert.equal(root.getObjectByName('support-frame'),undefined)

  const probeZ=Math.min(.10,outlet.outerDepth*.25)
  const closedDown=rayHits(root,[0,2.051,probeZ],[0,-1,0])
  assert.ok(closedDown.length>0);assert.match(closedDown[0].object.name,/gate/)
  root.userData.setGate(1);root.updateMatrixWorld(true)
  assert.equal(rayHits(root,[0,2.051,probeZ],[0,-1,0]).length,0)
  assert.equal(rayHits(root,[0,1,probeZ],[0,1,0]).filter(h=>/^gate/.test(h.object.name)).length,0)

  const gate=root.getObjectByName('gate'),cylinder=root.getObjectByName('cylinder'),rod=root.getObjectByName('cylinder-rod')
  const barrelLength=root.userData.gate.barrelLength
  for(const amount of [0,.5,1]){
    root.userData.setGate(amount);root.updateMatrixWorld(true)
    const pin=root.userData.gate.pinLocal.clone().applyMatrix4(gate.matrixWorld)
    const rodEnd=cylinder.localToWorld(new THREE.Vector3(0,-(barrelLength+root.userData.gate.rodLength),0))
    assert.ok(rodEnd.distanceTo(pin)<1e-6)
    assert.ok(rod.scale.y>.04)
  }
  root.rotation.y=Math.PI/2;root.updateMatrixWorld(true);root.userData.setGate(.7);root.updateMatrixWorld(true)
  const rotatedPin=root.userData.gate.pinLocal.clone().applyMatrix4(gate.matrixWorld)
  const rotatedRodEnd=cylinder.localToWorld(new THREE.Vector3(0,-(barrelLength+root.userData.gate.rodLength),0))
  assert.ok(rotatedRodEnd.distanceTo(rotatedPin)<1e-6,'旋转90°后气缸杆仍连闸板销轴')

  for(const options of [{outletWidth:.2},{outletWidth:1.6},{outletWidth:NaN},{outletDepth:.1},{outletDepth:1.6},{outletDepth:NaN}])assert.throws(()=>createFeedStation(options),RangeError)
  defaults.userData.dispose();root.userData.dispose()
})

for(const options of [{},{outletWidth:.35,outletDepth:.20}])test('弧形挡料板完整关闭、全开让出内口，气缸全行程连接 '+JSON.stringify(options),()=>{
 const root=createFeedStation(options),o=root.userData.outlet,plate=root.getObjectByName('gate-plate')
 assert.ok(plate.geometry.attributes.position.count>80,'曲面由多段圆弧组成')
 const y=[]
 for(const z of [-o.innerDepth*.42,0,o.innerDepth*.42]){const h=rayHits(root,[0,o.bottomY+.001,z],[0,-1,0])[0];assert.ok(h);assert.equal(h.object,plate);y.push(h.point.y)}
 assert.ok(y[0]-y[1]>.004&&y[2]-y[1]>.004,'中心低、两侧高，不能是直板')
 for(let i=0;i<=50;i++){root.userData.setGate(i/50);root.updateMatrixWorld(true);const pin=root.userData.gate.pinLocal.clone().applyMatrix4(root.getObjectByName('gate').matrixWorld),end=root.getObjectByName('cylinder').localToWorld(new THREE.Vector3(0,-(root.userData.gate.barrelLength+root.userData.gate.rodLength),0));assert.ok(pin.distanceTo(end)<1e-6,'全行程杆端不脱开')}
 root.userData.setGate(0)
 for(let ix=0;ix<=6;ix++)for(let iz=0;iz<=6;iz++){const x=(ix/6-.5)*(o.innerWidth-.002),z=(iz/6-.5)*(o.innerDepth-.002);const closed=rayHits(root,[x,o.bottomY+.001,z],[0,-1,0])[0];assert.equal(closed?.object,plate);root.userData.setGate(1);assert.equal(rayHits(root,[x,o.bottomY+.001,z],[0,-1,0]).length,0);root.userData.setGate(0)}
 root.userData.dispose()
})

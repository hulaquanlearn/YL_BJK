import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createToolMechanics} from '../src/utils/abb-tool-mechanics.mjs'
import {robotPotStations,robotPlantEquipment,stainlessEquipment} from '../src/utils/abb-robot.mjs'
import {pendantKeyAt} from '../src/utils/abb-pendant-controls.mjs'

const source=(root,id)=>{let found;root.traverse(n=>{if(n.userData.sourceInstance===String(id))found=n});return found}
async function load(name){const b=await readFile(new URL('../public/models/abb-irb6700/'+name+'.glb',import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}
function interference(guard,rake){
 // Broad phase only crops target triangles; exact edge/surface intersections
 // still run against their original world coordinates (both face directions).
 const region=new T.Box3().setFromObject(guard),positions=[],vertices=[new T.Vector3(),new T.Vector3(),new T.Vector3()],bounds=new T.Box3()
 rake.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position,index=n.geometry.index;for(let i=0;i<(index?.count||p.count);i+=3){vertices.forEach((v,j)=>v.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(n.matrixWorld));if(bounds.setFromPoints(vertices).intersectsBox(region))vertices.forEach(v=>positions.push(...v.toArray()))}})
 if(!positions.length)return 0
 const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)),material=new T.MeshBasicMaterial({side:T.DoubleSide}),meshes=[new T.Mesh(geometry,material)]
 const box=new T.Box3().setFromObject(rake),triBox=new T.Box3(),ray=new T.Raycaster(),v=[new T.Vector3(),new T.Vector3(),new T.Vector3()];let hits=0
 guard.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position,ind=n.geometry.index;for(let i=0;i<(ind?.count||p.count);i+=3){for(let j=0;j<3;j++)v[j].fromBufferAttribute(p,ind?ind.getX(i+j):i+j).applyMatrix4(n.matrixWorld);if(!triBox.setFromPoints(v).intersectsBox(box))continue;for(let j=0;j<3;j++){const direction=v[(j+1)%3].clone().sub(v[j]),length=direction.length();if(length<.002)continue;ray.set(v[j],direction.normalize());ray.near=.001;ray.far=length-.001;hits+=ray.intersectObjects(meshes,false).length}}})
 geometry.dispose();material.dispose();return hits
}
for(const type of ['tool-640','tool-700'])test(type+' cylinder eyes follow the guard in 3D, piston stroke stays within 55mm and the guard clears fixed rake teeth',async()=>{
 const root=await load(type),rig=createToolMechanics(root,type),guard=source(root,type==='tool-640'?159:135),rake=source(root,type==='tool-640'?169:187)
 const initial=guard.matrixWorld.clone(),baseLocations=rig.cylinders.map(c=>c.base.clone())
 for(let i=0;i<=20;i++){
  const states=rig.setGuard(i/20)
  states.forEach((state,j)=>{
   const cylinder=rig.cylinders[j],actual=new T.Box3().setFromObject(cylinder.eyeAux[0]).getCenter(new T.Vector3())
   assert.ok(Math.hypot(actual.x-state.eye.x,actual.y-state.eye.y)<1e-6,'actual pin axis follows the guard, rather than the yoke bounding-box centre')
   const pinBounds=new T.Box3().setFromObject(cylinder.pin)
   assert.ok(state.eye.z>=pinBounds.min.z&&state.eye.z<=pinBounds.max.z,'connection pin spans the cylinder joint plane')
   assert.ok(state.base.distanceTo(baseLocations[j])<1e-9)
   assert.ok(cylinder.restStroke+state.extension>=-.001&&cylinder.restStroke+state.extension<=.0551)
  })
  assert.equal(interference(guard,rake),0,'rake penetration at '+i*5+'%')
  assert.equal(interference(guard,rig.frame),0,'bucket frame penetration at '+i*5+'%')
 }
 rig.setGuard(0);assert.ok(guard.matrixWorld.elements.every((n,i)=>Math.abs(n-initial.elements[i])<1e-9))
 let belt;root.traverse(n=>{if(n.name.includes('皮带U17'))belt=n})
 const drumBox=new T.Box3().setFromObject(source(root,73)),beltBox=new T.Box3().setFromObject(belt)
 assert.ok(drumBox.getSize(new T.Vector3()).z>=beltBox.getSize(new T.Vector3()).z-.002,'drum spans belt width')
 assert.ok(Math.abs(drumBox.getCenter(new T.Vector3()).z-beltBox.getCenter(new T.Vector3()).z)<.001)
 const rakeBox=new T.Box3().setFromObject(rig.rake),supportZ=rig.supports.map(n=>new T.Box3().setFromObject(n).getCenter(new T.Vector3()).z)
 assert.ok(Math.abs(rakeBox.min.z-Math.min(...supportZ))<1e-6,'rake end meets one bucket mounting plane')
 assert.ok(Math.abs(rakeBox.max.z-Math.max(...supportZ))<1e-6,'rake end meets the opposite mounting plane')
 const before=rig.rotorCenter.clone();rig.setRotor(1.2);assert.ok(new T.Box3().setFromObject(source(root,73)).getCenter(new T.Vector3()).distanceTo(before)<.001)
})
test('current feeder places its suspended outlet within robot reach; steel preserves the yellow belt and pots stay separate',async()=>{
 assert.deepEqual(robotPlantEquipment.map(asset=>asset.id),['feed-station','infrared-camera'])
 const asset=robotPlantEquipment[0],station=asset.create();station.position.fromArray(asset.position);station.updateMatrixWorld(true)
 const outlet=new T.Vector3().fromArray(station.userData.outlet.bottomCenter).applyMatrix4(station.matrixWorld)
 assert.ok(Math.hypot(outlet.x,outlet.z)<2.5,'receiving station stays within nominal robot reach');assert.ok(outlet.y>1.85&&outlet.y<2)
 assert.ok(station.getObjectByName('chain-deck'));assert.ok(station.getObjectByName('cylinder'));assert.equal(asset.url,undefined,'retired CAD is not downloaded')
 station.userData.dispose()
 const root=await load('tool-700');stainlessEquipment(root)
 root.traverse(n=>{if(!n.isMesh)return;if(n.material.name==='yellow-conveyor-belt')assert.ok(n.material.color.r>n.material.color.b);else{assert.equal(n.material.opacity,1);assert.equal(n.material.transparent,false);assert.ok(Math.abs(n.material.color.r-n.material.color.g)<.1)}})
 assert.equal(robotPotStations.length,2);assert.ok(robotPotStations[1].position[2]-robotPotStations[0].position[2]>4.19)
})
test('physical keys follow the ABB RW6 hard-button diagram with texture UV flip accounted for',()=>{
 for(const [id,x,y] of [['preset-1',29.5,70],['preset-2',68,43],['preset-3',112,65],['preset-4',73,93],['mechanical-unit',27,137],['axis-group',27,235.5],['motion-mode',27,186.5],['increment',27,284],['start',73,329],['backward',29.5,350],['forward',112,358],['stop',68,379.5]])assert.equal(pendantKeyAt(x/150,1-y/419),id)
})

for(const type of ['tool-640','tool-700'])test(type+' belt surface and both drums move together without moving CAD frame or belt geometry',async()=>{
 const root=await load(type),rig=createToolMechanics(root,type),positions=Array.from(rig.belt.geometry.attributes.position.array),frame=rig.frame.matrixWorld.clone(),initial=rig.drums.map(n=>n.matrixWorld.clone()),centers=rig.drums.map(n=>new T.Box3().setFromObject(n).getCenter(new T.Vector3()));
 rig.setBeltTravel(.08);assert.ok(rig.beltTexture.offset.x>0);rig.drums.forEach((n,i)=>{assert.notDeepEqual(n.matrixWorld.elements,initial[i].elements);assert.ok(new T.Box3().setFromObject(n).getCenter(new T.Vector3()).distanceTo(centers[i])<.002)});
 assert.deepEqual(Array.from(rig.belt.geometry.attributes.position.array),positions);assert.deepEqual(rig.frame.matrixWorld.elements,frame.elements);
 rig.setBeltTravel(-.08);assert.ok(rig.beltTexture.offset.x<0);rig.setBeltTravel(0);rig.drums.forEach((n,i)=>assert.ok(n.matrixWorld.elements.every((v,j)=>Math.abs(v-initial[i].elements[j])<1e-8)));
})

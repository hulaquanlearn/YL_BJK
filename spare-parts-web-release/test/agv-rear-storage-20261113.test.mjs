import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

const box=o=>new THREE.Box3().setFromObject(o)
function check(fn){const m=buildAgvModel({variant:'old'});m.root.updateMatrixWorld(true);try{fn(m)}finally{const mats=new Set();m.root.traverse(o=>{o.geometry?.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat)mats.add(mat)});for(const mat of mats)mat.dispose()}}

test('central scanner aperture passes through the complete hood in both directions',()=>check(({parts})=>{
 const rear=parts.find(p=>p.name==='rear-cover')
 for(const z of [-.025,0,.025])for(const y of [.205,.23,.255])for(const dir of [-1,1]){
  const ray=new THREE.Raycaster(new THREE.Vector3(dir===1?-.8:-.3,y,z),new THREE.Vector3(dir,0,0),0,.5)
  assert.equal(ray.intersectObject(rear,true).length,0,`real empty opening at ${y}/${z}, direction ${dir}`)
 }
 for(const y of [.15,.35])assert.ok(new THREE.Raycaster(new THREE.Vector3(-.8,y,0),new THREE.Vector3(1,0,0),0,.5).intersectObject(rear,true).length,'solid upper/lower beams remain')
}))

test('deep rear side walls leave with the hood and long side covers stop at its seam',()=>check(({parts})=>{
 const rear=parts.find(p=>p.name==='rear-cover'),walls=rear.children.filter(o=>o.name==='rear-end-return')
 assert.equal(walls.length,2)
 for(const wall of walls){const b=box(wall);assert.ok(b.max.x-b.min.x>.19);assert.ok(b.max.z-b.min.z<.003)}
 for(const id of ['left-cover','right-cover'])assert.ok(box(parts.find(p=>p.name===id)).min.x>=-.44201,'no side-cover geometry stranded on the removable rear hood')
 const outer=rear.children.filter(o=>o.name==='rear-lower-skin')[0]
 assert.ok(box(outer).max.x-box(outer).min.x>.03,'lower face has a real recessed centre, not a flat plate')
}))

test('rear groove has slanted ends with a coplanar straight middle and keeps scanner clearance',()=>check(({parts})=>{
 const rear=parts.find(p=>p.name==='rear-cover')
 const hitAt=z=>new THREE.Raycaster(new THREE.Vector3(-.8,.23,z),new THREE.Vector3(1,0,0),0,.5).intersectObject(rear,true)[0]
 for(const z of [-.12,-.08,.08,.12]){
  const hit=hitAt(z)
  assert.ok(hit&&Math.abs(hit.point.x+.575)<.002,'straight middle margins remain coplanar')
 }
 for(const z of [-.28,-.24,.24,.28]){
  const hit=new THREE.Raycaster(new THREE.Vector3(-.8,.23,z),new THREE.Vector3(1,0,0),0,.5).intersectObject(rear,true)[0]
  const expected=-.574+(Math.abs(z)-.145)*.129/.180
  assert.ok(hit&&Math.abs(hit.point.x-expected)<.003,'slanted side follows trapezoid, rather than a rectangular baffle')
 }
 assert.ok(hitAt(.28).point.x>hitAt(.24).point.x,'ends run toward the vehicle interior')
 assert.equal(hitAt(0),undefined,'middle scanner aperture stays open')
}))

test('both old TIM units sit inside side-corner windows with downward black scanning cylinders',()=>check(({parts})=>{
 for(const [id,hoodId,x,side] of [['tim-front','operator-panel',.55,-1],['tim-rear','rear-cover',-.55,1]]){
  const unit=parts.find(p=>p.name===id),hood=parts.find(p=>p.name===hoodId)
  const ray=new THREE.Raycaster(new THREE.Vector3(x,.139,side*.45),new THREE.Vector3(0,0,-side),0,.13)
  assert.equal(ray.intersectObject(hood,true).length,0,id+': actual geometric side aperture')
  assert.ok(ray.intersectObject(unit,true).length,id+': TIM visible behind the aperture')
  const casing=box(unit.getObjectByName(id+'-housing')),cylinder=box(unit.getObjectByName(id+'-cylinder'))
  assert.ok(cylinder.min.y<.07&&cylinder.max.y<=casing.min.y+.002,'black cylinder extends below the casing')
 }
}))

test('outside the trapezoid the middle cavity is empty while top and bottom outer skins remain',()=>check(({parts})=>{
 const rear=parts.find(p=>p.name==='rear-cover')
 for(const name of ['rear-recess-cheek','rear-side-inner-shell','rear-inner-stiffener-web','rear-inner-stiffener-upper-fold','rear-inner-stiffener-lower-fold','rear-inner-crossbar','rear-crossbar-retainer'])assert.equal(rear.getObjectByName(name),undefined,name)
 const top=rear.getObjectByName('rear-skin-return'),bottom=rear.getObjectByName('rear-lower-return')
 assert.ok(top&&bottom,'both missing outer shells restored')
 assert.ok(box(top).min.y>.38&&box(bottom).max.y<.105,'outer skins stay outside the middle cavity')
 assert.ok(box(top).max.y-box(top).min.y>.018,'top follows the sloped upper side edge instead of floating above it')
 for(const [x,z]of [[-.655,0],[-.55,-.338],[-.55,.338]]){
  const seam=new THREE.Raycaster(new THREE.Vector3(x,.42,z),new THREE.Vector3(0,-1,0),0,.34)
  for(const skin of [top,bottom])assert.ok(seam.intersectObject(skin).length,'outer skin reaches the front and both side lips without a rectangular gap')
 }
 let samples=0
 for(const z of [-.30,-.25,-.20,-.12,0,.12,.20,.25,.30])for(const x of [-.625,-.602,-.588,-.56,-.53,-.49]){
  const boundary=-.574+Math.max(0,Math.abs(z)-.145)*.129/.180
  if(x>=boundary-.008)continue
  const down=new THREE.Raycaster(new THREE.Vector3(x,.28,z),new THREE.Vector3(0,-1,0),0,.11)
  assert.equal(down.intersectObject(rear,true).length,0,`no outer floor/baffle at ${x}/${z}`)
  const shellProbe=new THREE.Raycaster(new THREE.Vector3(x,.42,z),new THREE.Vector3(0,-1,0),0,.34)
  assert.ok(shellProbe.intersectObject(top).length,'outer top skin retained above the cavity')
  assert.ok(shellProbe.intersectObject(bottom).length,'outer bottom skin retained below the cavity')
  samples++
 }
 assert.ok(samples>35,'probe both slanted ends and the whole flat middle')
 const floor=rear.getObjectByName('rear-groove-floor')
 for(const [x,z]of [[-.52,0],[-.47,-.27],[-.47,.27]])assert.ok(new THREE.Raycaster(new THREE.Vector3(x,.3,z),new THREE.Vector3(0,-1,0),0,.2).intersectObject(floor).length,'floor exists only inside the channel')
 assert.ok(rear.getObjectByName('rear-green-button')&&rear.getObjectByName('rear-estop')&&rear.getObjectByName('rear-rubber-bumper'),'controls and bumper retained')
}))

test('EKS uses three sealed cassettes and perforated protective skins at the photo-relative installed end',()=>check(({parts})=>{
 const store=parts.find(p=>p.name==='supercapacitor'),casings=store.children.filter(o=>o.name==='capacitor-enclosure'),skins=store.children.filter(o=>o.name==='capacitor-perforated-side')
 assert.equal(casings.length,3);assert.equal(skins.length,3)
 const b=box(store);assert.ok(b.min.x>.37&&b.max.x<.62,'move out of the unsupported rear-corner position')
 assert.ok(b.min.y>=.0939&&b.max.y<.37,'inside the vehicle beneath the platform')
 assert.ok(Math.max(Math.abs(b.min.z),Math.abs(b.max.z))<.10,'inboard of the side electrical bays')
 for(const skin of skins){
  const shape=skin.geometry.parameters.shapes;assert.ok(shape.holes.length>0)
  for(const hole of shape.holes){const points=hole.getPoints(),c=points.reduce((s,p)=>s.add(p),new THREE.Vector2()).multiplyScalar(1/points.length),origin=skin.localToWorld(new THREE.Vector3(c.x,c.y,.02));
   assert.equal(new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1),0,.019).intersectObject(skin).length,0,'diamond aperture is missing protective-sheet material')
  }
 }
 assert.equal(parts.filter(p=>p.name==='supercapacitor').length,1,'sealed sections are one EKS, not duplicated storage systems')
}))

test('EKK has a flat black lid, two red end caps and the photographed four round / three rectangular ports',()=>check(({parts})=>{
 const manager=parts.find(p=>p.name==='ekk'),items=name=>manager.children.filter(o=>o.name===name)
 assert.equal(items('ekk-flat-lid').length,1);assert.equal(items('ekk-red-end-cover').length,2)
 assert.equal(items('ekk-signal-port').length,4);assert.equal(items('ekk-power-connector').length,3)
 assert.equal(items('ekk-deep-fin').length,0,'do not replace the photographed flat top with cooling fins')
 assert.deepEqual(items('ekk-power-connector').map(o=>o.userData.connector),['X2381','X2361','X1501'])
 assert.notEqual(parts.find(p=>p.name==='supercapacitor'),manager)
}))

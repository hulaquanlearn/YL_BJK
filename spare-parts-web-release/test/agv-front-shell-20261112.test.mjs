import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

for(const variant of ['old','new'])test(`${variant} front has a rolled shoulder, wraparound cheeks and a red inset over an open bottom`,()=>{
 const {root,parts}=buildAgvModel({variant}),panel=parts.find(p=>p.name==='operator-panel');root.updateMatrixWorld(true)
 try{
  const skin=panel.getObjectByName('front-formed-u-shell');assert.ok(skin)
  const hit=(y,z,object=skin)=>new THREE.Raycaster(new THREE.Vector3(.8,y,z),new THREE.Vector3(-1,0,0),0,.22).intersectObject(object,true)[0]?.point.x
  const face=hit(.30,0),shoulder=hit(.395,0),corner=hit(.30,.340)
  assert.ok(face>.664&&face<.666)
  assert.ok(shoulder<face-.014&&shoulder>face-.030,'broad top roll changes the actual surface, not just a decorative edge strip')
  assert.ok(corner<face-.017,'side cheeks wrap back in plan')
  assert.equal(hit(.185,0),undefined,'front skin does not span across the recess')
  const inset=hit(.185,0,panel.getObjectByName('front-cavity'));assert.ok(inset<face-.035&&inset>face-.065,'centre is substantially recessed')
  assert.equal(hit(.130,0,panel),undefined,'centre opening connects to the bottom instead of a punched rectangular hole')
  assert.ok(hit(.135,.280)>.66,'both side cheeks extend below the inset')
  assert.ok(hit(.135,-.280)>.66)
  const extent=new THREE.Box3().setFromObject(skin);assert.ok(extent.max.x-extent.min.x>.035,'formed skin itself has a broad shoulder depth before counting switches or side walls')
  const walls=panel.children.filter(o=>o.name==='front-end-return');assert.equal(walls.length,2)
  for(const wall of walls){const bounds=new THREE.Box3().setFromObject(wall);assert.ok(bounds.max.x-bounds.min.x>.18,'hood side wraps longitudinally, not just a shallow 40mm flange')}
  for(const [cover,side]of [['left-cover',1],['right-cover',-1]]){
   const ray=new THREE.Raycaster(new THREE.Vector3(.53,.25,side),new THREE.Vector3(0,0,-side),0,.8)
   assert.ok(ray.intersectObject(panel,true).some(h=>Math.abs(h.point.z)>.34),'deep hood owns the side surface above the end compartment')
   assert.equal(ray.intersectObject(parts.find(p=>p.name===cover),true).length,0,'long cover must not duplicate the removable hood side')
  }
 }finally{const materials=new Set();root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});materials.forEach(m=>m.dispose())}
})

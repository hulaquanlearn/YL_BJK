import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { displayedPartModel, partPhotoUrl } from '../src/utils/bound-part-model.mjs'
import { modelObservationParts, normalizeShowroomModel } from '../src/utils/model-observation.mjs'

test('unbound and pending parts cannot borrow a generic or stale independent model', () => {
  assert.equal(displayedPartModel({}), '')
  assert.equal(displayedPartModel({ categoryModelId: 7, modelUrl: '/models/old.glb' }), '')
  assert.equal(displayedPartModel({ categoryModelId: 7, categoryModelUrl: '/models/7.glb' }), '/models/7.glb')
})

test('reviewed bearing mesh mapping covers the actual asset once and keeps its materials', async () => {
  const url='/models/supplement-20261009/spherical-roller-bearing-22212e.glb'
  const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)})
  const original=meshes.map(m=>m.material)
  const parts=modelObservationParts(url,meshes)
  assert.equal(parts.length,4)
  assert.equal(parts.find(p=>p.id==='rollers').objects.length,36)
  assert.equal(new Set(parts.flatMap(p=>p.objects)).size,40)
  normalizeShowroomModel(THREE,scene,Math.PI/2)
  assert.deepEqual(meshes.map(m=>m.material),original)
  assert.equal(modelObservationParts('/uploads/part-models/unreviewed.glb',meshes).length,0)
  assert.equal(modelObservationParts(url,meshes.slice(0,3)).length,0)
  scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose()})
})

test('framing is stable for tiny, large, rotated and planar geometry without changing asset transforms', () => {
  for(const size of [.001,10000]){
    const object=new THREE.Mesh(new THREE.BoxGeometry(size,size*2,size*.4),new THREE.MeshStandardMaterial())
    object.position.set(3,4,5);object.rotation.y=.3
    const before=object.matrix.clone(),position=object.position.clone(),rotation=object.rotation.clone()
    const wrapper=normalizeShowroomModel(THREE,object,Math.PI/2)
    const box=new THREE.Box3().setFromObject(wrapper),extent=box.getSize(new THREE.Vector3())
    assert.ok(Math.abs(Math.max(extent.x,extent.y,extent.z)-4.2)<1e-5)
    assert.ok(Math.abs(box.min.y+2.60)<1e-5)
    assert.ok(object.position.equals(position));assert.ok(object.rotation.equals(rotation))
    wrapper.remove(object)
    const again=normalizeShowroomModel(THREE,object,Math.PI/2)
    assert.ok(new THREE.Box3().setFromObject(again).getCenter(new THREE.Vector3()).distanceTo(box.getCenter(new THREE.Vector3()))<1e-5)
    object.geometry.dispose();object.material.dispose()
  }
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,3),new THREE.MeshBasicMaterial())
  assert.doesNotThrow(()=>normalizeShowroomModel(THREE,plane))
  assert.throws(()=>normalizeShowroomModel(THREE,new THREE.Group()),/有效几何/)
  plane.geometry.dispose();plane.material.dispose()
})

test('real photos survive model rebinding and never borrow catalog reference pictures',()=>{
 const part={partImageUrl:'/uploads/part-images/photo.jpg',imageUrl:'/uploads/part-images/photo.jpg',categoryImageUrl:'/model-ref.png'}
 assert.equal(partPhotoUrl(part),'/uploads/part-images/photo.jpg')
 assert.equal(partPhotoUrl({...part,categoryModelId:99,categoryModelUrl:'/new.glb'}),partPhotoUrl(part))
 assert.equal(partPhotoUrl({partImageUrl:null,imageSource:'category',imageUrl:'/model-ref.png'}),'')
 assert.equal(partPhotoUrl({imageSource:'part',imageUrl:'/photo.jpg'}),'/photo.jpg')
 assert.equal(partPhotoUrl({imageUrl:'/unknown.jpg'}),'')
})
test('reviewed legacy families cover each actual mesh once without assigning names to unknown files',async()=>{
 for(const id of [1,5,7,85,87,179,105,110,127,146]){
  const url='/models/ledger-20261008/'+id+'.glb',bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)})
  const parts=modelObservationParts(url,meshes),mapped=parts.flatMap(p=>p.objects)
  assert.ok(parts.length>=3,'parts for '+id);assert.equal(mapped.length,meshes.length);assert.equal(new Set(mapped).size,meshes.length)
  assert.ok(parts.every(p=>p.description?.length>12))
  assert.equal(modelObservationParts(url,meshes.slice(1)).length,0)
  assert.equal(modelObservationParts('/uploads/custom.glb',meshes).length,0)
  scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose()})
 }
})

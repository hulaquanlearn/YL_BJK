import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import {modelObservationParts,normalizeShowroomModel} from '../src/utils/model-observation.mjs'
import {warehouseModelUrl} from '../src/utils/evidence-models.mjs'
async function load(url){const b=await fs.readFile(new URL('../public'+url,import.meta.url));return {b,scene:(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}}
const dispose=scene=>scene.traverse(n=>{n.geometry?.dispose();[].concat(n.material||[]).forEach(m=>m.dispose())})
test('every catalog asset parses, has finite geometry and sits on the display surface in four orientations',async()=>{
 let mapped=0
 for(const entry of catalog.models){const {b,scene}=await load(entry.url),meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)})
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'),entry.sha256,entry.url);assert.equal(meshes.length,entry.meshCount,entry.url)
  for(const m of meshes){assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite),entry.url);assert.ok([...m.geometry.attributes.normal.array].every(Number.isFinite),entry.url)}
  const parts=modelObservationParts(entry.url,meshes)
  if(['rebuilt','annotated'].includes(entry.status)){assert.equal(parts.length,entry.partCount,entry.url);assert.equal(new Set(parts.flatMap(p=>p.objects)).size,meshes.length,entry.url);assert.equal(parts.flatMap(p=>p.objects).length,meshes.length,entry.url);mapped++}
  for(const alias of entry.aliases||[])assert.equal(modelObservationParts(alias,meshes).length,parts.length)
  for(const angle of[0,Math.PI/2,Math.PI,3*Math.PI/2]){scene.removeFromParent();const wrapper=normalizeShowroomModel(T,scene,angle),bounds=new T.Box3().setFromObject(wrapper);assert.ok(Math.abs(bounds.min.y+2.6)<1e-5,entry.url);const size=bounds.getSize(new T.Vector3());assert.ok(Math.max(size.x,size.y,size.z)<=4.20001,entry.url)}
  dispose(scene)
 }
 assert.equal(mapped,227)
})
test('22220 E has a through bore and the reviewed 100 x 180 x 46 envelope',async()=>{
 const {scene}=await load('/models/reviewed-20261023/skf-22220-e.glb');scene.updateMatrixWorld(true)
 const bounds=new T.Box3().setFromObject(scene),size=bounds.getSize(new T.Vector3());assert.ok(Math.abs(size.x-.18)<1e-5);assert.ok(Math.abs(size.y-.18)<1e-5);assert.ok(Math.abs(size.z-.046)<1e-5)
 const ray=new T.Raycaster(new T.Vector3(0,0,1),new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(scene,true).length,0)
 const parts=[];scene.traverse(n=>{if(n.isMesh)parts.push(n.userData.observation)});assert.equal(parts.filter(p=>p.id==='rolling').length,36);dispose(scene)
})
test('adapter sleeve, oval flange and split housing are hollow, and SC cylinders have four tie rods',async()=>{
 for(const url of ['/models/ledger-20261008/123.glb','/models/pending-20261009/505002392.glb']){const {scene}=await load(url);scene.updateMatrixWorld(true);const center=new T.Box3().setFromObject(scene).getCenter(new T.Vector3());if(url.includes('123'))center.set(0,0,1);else center.set(0,.6,1);const ray=new T.Raycaster(center,new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(scene,true).length,0,url);dispose(scene)}
 const {scene}=await load('/models/pending-20261009/505003760.glb');const ties=[];scene.traverse(n=>{if(n.userData.observation?.id==='ties')ties.push(n)});assert.equal(ties.length,4);dispose(scene)
})
test('review-pending and unbound stock cannot silently display a fabricated part model',()=>{
 assert.equal(warehouseModelUrl({categoryModelUrl:'/models/ledger-20261008/13.glb'}),'')
 assert.equal(warehouseModelUrl({name:'SKF,轴承,22220E'}),'')
 assert.equal(warehouseModelUrl({categoryModelUrl:'/models/reviewed-20261023/skf-22220-e.glb'}),'/models/reviewed-20261023/skf-22220-e.glb')
})

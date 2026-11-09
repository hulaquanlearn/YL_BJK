// Batch B9: oil seals (90x110x12 and RB60x80x5.5), rubber spring, temperature
// probe and a ZL6 coupling representative. Sizes come from the ledger names.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:197,kind:'seal',outer:110,width:12},
 {id:198,kind:'seal',outer:80,width:5.5},
 {id:73,kind:'probe'},
 {id:140,kind:'coupling'}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B9 seals and mechanical parts keep the recorded sizes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  if(unit.kind==='seal'){
   assert.ok(Math.abs(size.x-unit.outer/1000)<2e-5,`${unit.id} OD ${(size.x*1000).toFixed(2)}`)
   assert.ok(Math.abs(size.z-unit.width/1000)<2e-5,`${unit.id} width`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='lip').length,1,`${unit.id} lip`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='spring').length,1,`${unit.id} spring`)
  }else if(unit.kind==='probe'){
   assert.ok(size.y>0.05,`${unit.id} probe length`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='thread').length,1,`${unit.id} thread`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='cable').length,1,`${unit.id} lead`)
   assert.match(entry.note,/M5/)
  }else{
   assert.ok(size.x>0.4&&size.y>0.4,`${unit.id} coupling envelope`)
   assert.match(entry.note,/ZL6/)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

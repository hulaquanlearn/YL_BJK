// Batch B12: corrected IM155-6 PN/3 HF, Leuze Ex switch, Turck barrel sensor and
// Kuebler encoder from verified sources.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:70,kind:'module',W:100,H:117,D:74},
 {id:43,kind:'sensor',W:27.5,H:87,L:54},
 {id:54,kind:'barrel',diameter:30,length:44},
 {id:44,kind:'encoder',flange:58,shaft:20}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B12 corrected and sensor parts keep their verified envelopes',async()=>{
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
  if(unit.kind==='module'){
   assert.ok(Math.abs(size.y-unit.H/1000)<2e-5&&Math.abs(size.z-unit.W/1000)<2e-5,`${unit.id} module ${[size.x,size.y,size.z].map(v=>+(v*1000).toFixed(1))}`)
   assert.match(entry.note,/PN\/3 HF/)
   assert.match(entry.note,/6ES7155-6AU30-0CN0/)
   assert.match(entry.note,/不是同一型号/)
  }else if(unit.kind==='sensor'){
   assert.ok(Math.abs(size.y-unit.H/1000)<2e-5&&Math.abs(size.z-unit.W/1000)<2e-5,`${unit.id} sensor`)
   assert.match(entry.note,/S-EX n/)
   assert.match(entry.note,/27\.5/)
  }else if(unit.kind==='barrel'){
   assert.ok(Math.abs(size.y-unit.diameter/1000)<2e-5&&Math.abs(size.z-unit.diameter/1000)<2e-5,`${unit.id} barrel diameter`)
   assert.ok(size.x>=unit.length/1000,`${unit.id} barrel length`)
  }else{
   assert.ok(Math.abs(size.y-unit.flange/1000)<2e-5&&Math.abs(size.z-unit.flange/1000)<2e-5,`${unit.id} flange`)
   assert.ok(size.x>=unit.shaft/1000,`${unit.id} shaft`)
   assert.match(entry.note,/ø10×20|ø10/)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

// Batch B14: SICK safety laser scanner, Schneider contactor representative and a
// 96x96 panel meter.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:31,kind:'scanner',dims:[102,152,106]},
 {id:2,kind:'contactor',dims:[45,74,80]},
 {id:56,kind:'meter',dims:[96,96,80]}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B14 scanner, contactor and meter keep their documented envelopes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const body=meshes.find(mesh=>mesh.userData.observation?.id==='body')
  assert.ok(body,`${unit.id} body`)
  const size=new T.Box3().setFromObject(body).getSize(new T.Vector3())
  for(const [index,value] of unit.dims.entries())assert.ok(Math.abs([size.x,size.y,size.z][index]-value/1000)<2e-5,`${unit.id} body axis ${index}`)
  if(unit.kind==='scanner')assert.match(entry.note,/SICK/)
  if(unit.kind==='contactor'){assert.match(entry.note,/LC1N0910/);assert.match(entry.note,/12 个接触器型号/)}
  if(unit.kind==='meter'){assert.match(entry.note,/DIN 43700/);assert.match(entry.note,/深度未给出/)}
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

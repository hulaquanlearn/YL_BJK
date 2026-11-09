// Batch B11: V-belts and roller chains from public profile/pitch standards.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:92,family:'v-belt',topWidth:13},
 {id:93,family:'v-belt',topWidth:17},
 {id:101,family:'v-belt',topWidth:16.3},
 {id:120,family:'v-belt',topWidth:10},
 {id:102,family:'timing-belt',width:30},
 {id:98,family:'roller-chain',pitch:25.4},
 {id:113,family:'roller-chain',pitch:25.4}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('V-belts and roller chains keep their standard profile/pitch sizes',async()=>{
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
  if(unit.family==='v-belt'){
   assert.ok(Math.abs(size.z-unit.topWidth/1000)<2e-5,`${unit.id} belt width ${(size.z*1000).toFixed(2)}`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='belt').length,1,`${unit.id} belt body`)
  }else if(unit.family==='timing-belt'){
   assert.ok(Math.abs(size.y-unit.width/1000)<0.003,`${unit.id} width`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='teeth').length,163,`${unit.id} teeth`)
  }else{
   assert.ok(size.x>unit.pitch/1000,`${unit.id} chain length`)
   const rollers=meshes.filter(mesh=>mesh.userData.observation?.id==='rollers').length,plates=meshes.filter(mesh=>mesh.userData.observation?.id==='plates').length
   assert.equal(rollers,unit.id===98?2:16,`${unit.id} rollers`)
   assert.equal(plates,unit.id===98?4:32,`${unit.id} plates`)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

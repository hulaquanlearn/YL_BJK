// Batch B13: Omron limit switch, Moxa switch and bearing representatives.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:25,kind:'limit'},
 {id:33,kind:'switch'},
 {id:85,kind:'bearing',outer:72,width:19},
 {id:87,kind:'bearing',outer:160,width:40}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B13 switches and bearing representatives keep their sizes',async()=>{
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
  if(unit.kind==='limit'){
   assert.ok(Math.abs(size.z-.0217)<2e-5,`${unit.id} depth`)
   assert.ok(Math.abs(size.x-.04)<2e-5,`${unit.id} width`)
   assert.ok(size.y>=.055,`${unit.id} height`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='roller').length,1,`${unit.id} roller`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='mount').length,2,`${unit.id} mounting holes`)
  }else if(unit.kind==='switch'){
   const body=meshes.find(mesh=>mesh.userData.observation?.id==='body')
   const bodySize=new T.Box3().setFromObject(body).getSize(new T.Vector3())
   assert.ok(Math.abs(bodySize.x-.053)<2e-5&&Math.abs(bodySize.y-.135)<2e-5&&Math.abs(bodySize.z-.105)<2e-5,`${unit.id} body`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='ports').length,10,`${unit.id} ports`)
  }else{
   assert.ok(Math.abs(size.x-unit.outer/1000)<2e-5&&Math.abs(size.z-unit.width/1000)<2e-5,`${unit.id} bearing envelope`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='inner').length,1,`${unit.id} inner ring`)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='outer').length,1,`${unit.id} outer ring`)
   assert.match(entry.note,/SKF/)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

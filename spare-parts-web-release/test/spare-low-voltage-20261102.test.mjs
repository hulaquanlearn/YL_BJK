// Batch B8 low-voltage devices: modular MCBs/fuse holder use DIN modular pitch;
// GV2 and EZD100 use Schneider product data sheets.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:1,W:18,H:85,D:78.5,source:'standard'},
 {id:5,W:54,H:85,D:78.5,source:'standard'},
 {id:7,W:36,H:85,D:78.5,source:'standard'},
 {id:64,W:54,H:85,D:70,source:'standard'},
 {id:3,W:45,H:89,D:78.5,source:'datasheet'},
 {id:6,W:75,H:130,D:60,source:'datasheet'}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('low-voltage devices keep their modular or datasheet envelopes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.ok(['standard-and-ledger','manufacturer-datasheet'].includes(entry.source?.type),`${unit.id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const body=meshes.find(mesh=>mesh.userData.observation?.id==='body')
  assert.ok(body,`${unit.id} body`)
  const size=new T.Box3().setFromObject(body).getSize(new T.Vector3())
  for(const [axis,value] of [['x',unit.W],['y',unit.H],['z',unit.D]]){
   assert.ok(Math.abs(size[axis]-value/1000)<2e-5,`${unit.id} body ${axis} ${(size[axis]*1000).toFixed(2)} != ${value}`)
  }
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='terminals').length,2,`${unit.id} terminals`)
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='mount').length,unit.id===6?4:1,`${unit.id} mount features`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

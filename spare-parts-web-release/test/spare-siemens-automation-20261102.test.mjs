// Batch B10: Siemens automation modules and SCALANCE switch from data sheets.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:16,W:35,H:147,D:129,kind:'module'},
 {id:19,W:15,H:73,D:58,kind:'module'},
 {id:20,W:15,H:73,D:58,kind:'module'},
 {id:21,W:45,H:100,D:87,kind:'switch'},
 {id:37,W:35,H:142,D:129,kind:'module'}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('Siemens automation modules keep their datasheet envelopes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.equal(entry.source.type,'manufacturer-datasheet',`${unit.id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const body=meshes.find(mesh=>mesh.userData.observation?.id==='body')
  assert.ok(body,`${unit.id} body`)
  const size=new T.Box3().setFromObject(body).getSize(new T.Vector3())
  const expected=unit.kind==='switch'?[unit.W,unit.H,unit.D]:[unit.D,unit.H,unit.W]
  for(const [index,value] of expected.entries())assert.ok(Math.abs([size.x,size.y,size.z][index]-value/1000)<2e-5,`${unit.id} body axis ${index}`)
  assert.match(entry.note,/mm/)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

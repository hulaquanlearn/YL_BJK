// Batch B19: electrical items rebuilt from manufacturer data sheets.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:11,body:[63,125.2,113.5]},
 {id:4,body:[105,143,151*.72]},
 {id:14,body:[75,100,110]},
 {id:8,body:[42,48,26]},
 {id:59,body:[18.5,28,5]}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B19 electrical items keep their datasheet envelopes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`${unit.id} catalog`)
  assert.equal(entry.source?.type,'manufacturer-datasheet',`${unit.id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  const body=meshes.find(mesh=>mesh.userData.observation?.id==='body')
  assert.ok(body,`${unit.id} body`)
  const size=new T.Box3().setFromObject(body).getSize(new T.Vector3())
  for(const [index,value] of unit.body.entries())assert.ok(Math.abs([size.x,size.y,size.z][index]-value/1000)<2e-5,`${unit.id} body axis ${index}`)
  assert.match(entry.note,/数据表/)
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  assert.ok(root.extras?.evidence,`${unit.id} evidence`)
  assert.ok(root.extras.evidence.unknown.length>=2,`${unit.id} unknown`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

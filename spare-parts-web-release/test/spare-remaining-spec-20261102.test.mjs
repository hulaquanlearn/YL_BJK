// Batch B18: remaining plan-spec items (SEW series reducers + generic structural
// and standard parts). Every item must be a real GLB change vs input-330 and keep
// an explicit source/unknown record.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import plan from '../../tools/modeling/model-review-plan-20261023.json' with {type:'json'}
import progress from '../../docs/SPARE_REBUILD_PROGRESS_20261102.json' with {type:'json'}

const batch=progress.batches.find(record=>record.id==='B18-remaining-spec-items')
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B18 items are real baseline changes with source and unknown records',async()=>{
 assert.ok(batch,`B18 batch exists`)
 assert.equal(batch.items.length,54,`B18 item count`)
 for(const id of batch.items){
  const entry=catalog.models.find(model=>String(model.id)===String(id))
  const row=plan.models.find(model=>String(model.id)===String(id))
  assert.ok(entry&&row,`${id} catalog/plan`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  assert.notEqual(entry.sha256,row.originalSha256,`${id} must differ from baseline`)
  assert.ok(entry.source,`${id} source`)
  assert.ok(entry.note.length>20,`${id} note`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.ok(meshes.length>=3,`${id} structure`)
  assert.equal(meshes.length,entry.meshCount,`${id} mesh count`)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),`${id} finite`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  assert.ok(root.extras?.evidence,`${id} evidence`)
  assert.ok(root.extras.evidence.unknown.length>=2,`${id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

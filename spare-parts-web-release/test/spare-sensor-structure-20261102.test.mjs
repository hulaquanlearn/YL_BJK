// Batch B20: sensor/relay/transmitter items rebuilt as category structure with
// explicit "no manufacturer dimensions" evidence; id 57 uses DIN 43700 front size.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import plan from '../../tools/modeling/model-review-plan-20261023.json' with {type:'json'}

const ids=[10,15,23,24,26,27,38,39,47,48,50,52,53,55,57,60,61]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B20 sensor items are real baseline changes with structure evidence',async()=>{
 for(const id of ids){
  const entry=catalog.models.find(model=>model.id===id)
  const row=plan.models.find(model=>model.id===id)
  assert.ok(entry&&row,`${id} rows`)
  assert.ok(['plan-structure-illustrative','public-standard','category-reference','ledger-functional-structure'].includes(entry.source?.type),`${id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  assert.notEqual(entry.sha256,row.originalSha256,`${id} must differ from baseline`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.ok(meshes.length>=3,`${id} structure`)
  assert.equal(meshes.length,entry.meshCount,`${id} mesh count`)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),`${id} finite`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  assert.ok(root.extras?.evidence,`${id} evidence`)
  assert.ok(root.extras.evidence.unknown.length>=2,`${id} unknown`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

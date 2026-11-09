// Batch B16: structure-illustrative rebuilds for generic items without any
// manufacturer/model/dimension data. They must still be real GLB changes vs the
// input-330 baseline and carry explicit "structure only" evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import plan from '../../tools/modeling/model-review-plan-20261023.json' with {type:'json'}

// 88 was reidentified from its bound material as SKF 22216 EK; its stronger
// product/geometry contract now lives in spare-identity-corrections.test.mjs.
const ids=[89,91,96,106,108,147,149]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('structure-illustrative items are real GLB changes with explicit evidence',async()=>{
 for(const id of ids){
  const entry=catalog.models.find(model=>model.id===id)
  const row=plan.models.find(model=>model.id===id)
  assert.ok(entry,`catalog ${id}`)
  assert.equal(entry.source?.type,'plan-structure-illustrative',`${id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  assert.notEqual(entry.sha256,row.originalSha256,`${id} must differ from input-330 baseline`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.ok(meshes.length>=3,`${id} real structure`)
  assert.equal(meshes.length,entry.meshCount,`${id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${id} part count`)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),`${id} finite envelope`)
  assert.match(entry.note,/无厂家型号与安装尺寸资料|结构示意/)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  assert.equal(root.extras?.structureIllustrative,true,`${id} userData flag`)
  const evidence=root.extras?.evidence
  assert.ok(evidence,`${id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

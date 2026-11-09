// Batch B17: SEW-series reducers (and the YFB4-112M-4 motor) rebuilt as series
// structure illustrations because no SEW installation drawings are available.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import plan from '../../tools/modeling/model-review-plan-20261023.json' with {type:'json'}

const ids=[216,221,223,225,227,228,237,238,239,240,241,250,251]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('SEW-series items are real changes and carry structure-only evidence',async()=>{
 for(const id of ids){
  const entry=catalog.models.find(model=>model.id===id)
  const row=plan.models.find(model=>model.id===id)
  assert.ok(entry,`catalog ${id}`)
  assert.equal(entry.source?.type,id===251?'public-standard':'plan-structure-illustrative',`${id} source type`)
  assert.match(entry.note,/安装尺寸/)
  assert.ok(entry.source?.ledgerModel,`${id} ledger model`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  assert.notEqual(entry.sha256,row.originalSha256,`${id} must differ from baseline`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.ok(meshes.length>=3,`${id} structure`)
  assert.equal(meshes.length,entry.meshCount,`${id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${id} part count`)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.ok([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0),`${id} finite envelope`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  assert.equal(root.extras?.structureIllustrative,true,`${id} flag`)
  assert.ok(root.extras?.evidence,`${id} evidence`)
  assert.ok(root.extras.evidence.unknown.length>=2,`${id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

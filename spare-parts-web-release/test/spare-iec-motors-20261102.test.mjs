// Batch B15: IEC-frame motors built from the IEC 60072 frame chart.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:105,frame:'160L',H:160,A:254,B:254,D:42,E:110},
 {id:110,frame:'200L',H:200,A:318,B:267,D:55,E:110},
 {id:127,frame:'180M',H:180,A:279,B:241,D:48,E:110},
 {id:146,frame:'280M',H:280,A:457,B:419,D:80,E:170}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('IEC motors keep their frame dimensions',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.equal(entry.source.type,'public-standard',`${unit.id} source type`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const shaft=meshes.find(mesh=>mesh.userData.observation?.id==='shaft')
  assert.ok(shaft,`${unit.id} shaft`)
  const shaftBox=new T.Box3().setFromObject(shaft)
  assert.ok(Math.abs((shaftBox.max.y+shaftBox.min.y)/2-unit.H/1000)<0.002,`${unit.id} shaft height`)
  assert.ok(Math.abs((shaftBox.max.z-shaftBox.min.z)-unit.D/1000)<2e-5,`${unit.id} shaft diameter`)
  const feet=meshes.find(mesh=>mesh.userData.observation?.id==='feet')
  assert.ok(feet,`${unit.id} feet`)
  assert.match(entry.note,/IEC 60072/)
  assert.match(entry.note,new RegExp(unit.frame))
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

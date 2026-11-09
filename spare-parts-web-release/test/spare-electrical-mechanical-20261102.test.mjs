// Batch B7: automation modules, sensors, a DN50 safety valve and an electric
// cylinder. Envelopes come from manufacturer data sheets or the ledger record.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:12,kind:'module',W:100,H:292},
 {id:17,kind:'module',W:35,H:147},
 {id:18,kind:'module',W:15,H:73},
 {id:29,kind:'module',W:73,H:199},
 {id:13,kind:'sensor',W:100,H:108.7,L:48.3},
 {id:42,kind:'sensor',W:20.5,H:76.3,L:44},
 {id:99,kind:'valve',flange:165,height:300},
 {id:132,kind:'cylinder',stroke:450,rod:25}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B7 electrical and mechanical parts keep their documented envelopes',async()=>{
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
  const near=(axis,value,tolerance=2e-5)=>assert.ok(Math.abs(size[axis]-value/1000)<tolerance,`${unit.id} ${axis} ${(size[axis]*1000).toFixed(2)} != ${value}`)
  if(unit.kind==='module'){
   near('y',unit.H);near('z',unit.W)
   assert.ok(size.x>=unit.W/1000*.5,`${unit.id} depth present`)
   assert.match(entry.note,/W\d+/)
  }else if(unit.kind==='sensor'){
   near('y',unit.H);near('z',unit.W)
   assert.ok(size.x>=unit.L/1000,`${unit.id} length`)
  }else if(unit.kind==='valve'){
   near('x',unit.flange);near('z',unit.flange)
   assert.ok(size.y>=unit.height/1000-1e-6,`${unit.id} height`)
   assert.match(entry.note,/DN50/)
  }else{
   assert.ok(size.x>=unit.stroke/1000,`${unit.id} stroke`)
   const rod=meshes.filter(mesh=>mesh.userData.observation?.id==='rod')
   assert.equal(rod.length,1,`${unit.id} rod`)
   const rodBox=new T.Box3().setFromObject(rod[0])
   assert.ok(Math.abs((rodBox.max.y-rodBox.min.y)-unit.rod/1000)<2e-5,`${unit.id} rod diameter`)
   assert.match(entry.note,/450/)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

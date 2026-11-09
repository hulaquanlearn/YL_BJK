// Batch B6: more SC cylinders plus fitting, nozzle, wire rope, drive shaft and
// rubber spring built from the catalogue page or the ledger material record.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:306,kind:'sc',A:150,B:62,stroke:250},
 {id:307,kind:'sc',A:150,B:62,stroke:200},
 {id:308,kind:'sc',A:150,B:62,stroke:100},
 {id:310,kind:'sc',A:153,B:75,stroke:250},
 {id:311,kind:'sc',A:153,B:75,stroke:150},
 {id:82,kind:'fitting',tubeOd:10},
 {id:67,kind:'nozzle',length:530,height:80},
 {id:97,kind:'rope',length:1000},
 {id:137,kind:'shaft',length:1400},
 {id:126,kind:'spring',outer:96,height:96}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('B6 cylinders and small parts keep their recorded sizes',async()=>{
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
  if(unit.kind==='sc'){
   near('x',unit.A+unit.stroke);near('y',unit.B);near('z',unit.B)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='ties').length,4,`${unit.id} tie rods`)
   assert.match(entry.note,/亚德客中文原厂样本/)
  }else if(unit.kind==='fitting'){near('y',unit.tubeOd*1.75);assert.match(entry.note,/R1\/4/)}
  else if(unit.kind==='nozzle'){assert.ok(size.x>=unit.length/1000-1e-6,`${unit.id} length`);near('y',unit.height);assert.match(entry.note,/530/)}
  else if(unit.kind==='rope'){near('x',unit.length,0.0015);assert.match(entry.note,/7\(股\)/)}
  else if(unit.kind==='shaft'){near('x',unit.length);assert.match(entry.note,/1400/)}
  else{near('x',unit.outer);near('y',unit.height);near('z',unit.outer);assert.match(entry.note,/∅96/)}
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

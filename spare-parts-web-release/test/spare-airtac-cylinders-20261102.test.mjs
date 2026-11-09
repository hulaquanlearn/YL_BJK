// Batch B4 AirTAC cylinders. Dimensions come from the printed Chinese catalogue
// pages (SC p.39, SAI p.23) read visually; total length is A + stroke.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:205,kind:'sc',A:142,B:50,D:16,stroke:100},
 {id:214,kind:'sc',A:153,B:75,D:20,stroke:350},
 {id:215,kind:'sc',A:150,B:62,D:20,stroke:150},
 {id:222,kind:'sai',A:332,B:180,D:40,stroke:370},
 {id:224,kind:'sc',A:150,B:62,D:20,stroke:475},
 {id:230,kind:'sc',A:150,B:62,D:20,stroke:125},
 {id:231,kind:'sc',A:150,B:62,D:20,stroke:300},
 {id:232,kind:'sai',A:229,B:115,D:25,stroke:200},
 {id:236,kind:'sc',A:150,B:62,D:20,stroke:1500},
 {id:254,kind:'sc',A:153,B:75,D:20,stroke:600},
 {id:255,kind:'sc',A:188,B:112,D:25,stroke:450}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('SC and SAI cylinders keep the catalogue envelope and keep their structures apart',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.equal(entry.source?.manufacturer,'AirTAC 亚德客',`${unit.id} source manufacturer`)
  assert.ok([39,23].includes(entry.source?.printedPage),`${unit.id} printed catalogue page`)
  assert.match(entry.note,/亚德客中文原厂样本/)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  for(const [axis,value] of [['x',unit.A+unit.stroke],['y',unit.B],['z',unit.B]]){
   assert.ok(Math.abs(size[axis]-value/1000)<2e-5,`${unit.id} ${axis} ${(size[axis]*1000).toFixed(2)} != ${value}`)
  }
  const byPart=(id)=>meshes.filter(mesh=>mesh.userData.observation?.id===id)
  const rod=byPart('rod')
  assert.equal(rod.length,1,`${unit.id} rod`)
  const rodBox=new T.Box3().setFromObject(rod[0])
  assert.ok(Math.abs((rodBox.max.y-rodBox.min.y)-unit.D/1000)<2e-5,`${unit.id} rod diameter ${unit.D}`)
  assert.equal(byPart('ports').length,2,`${unit.id} two air ports`)
  if(unit.kind==='sc'){
   assert.equal(byPart('ties').length,4,`${unit.id} four exposed tie rods`)
   assert.equal(byPart('barrel').length,1,`${unit.id} barrel`)
   assert.equal(byPart('front-cap').length,1,`${unit.id} front cap`)
  }else{
   assert.equal(byPart('ties').length,0,`${unit.id} SAI must not have tie rods`)
   assert.equal(byPart('sensor-groove').length,2,`${unit.id} sensor grooves`)
   assert.equal(byPart('caps').length,2,`${unit.id} end caps`)
  }
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.equal(evidence.dimensionSource?.manufacturer,'AirTAC 亚德客')
  assert.match(evidence.dimensionSource?.url||'',/airtac\.com/)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

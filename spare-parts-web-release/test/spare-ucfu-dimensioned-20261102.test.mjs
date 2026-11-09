// Batch B5: UCFU206/207 (LYC reference envelope) plus ledger-dimensioned ducts,
// belts, roller, burst disc, sleeve and diverter gate.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:201,kind:'ucfu',model:'UCFU206',L:108,A0:13},
 {id:248,kind:'ucfu',model:'UCFU207',L:117,A0:44.4},
 {id:81,kind:'duct',diameter:250,height:400},
 {id:114,kind:'duct',diameter:200,height:360},
 {id:104,kind:'belt',width:32,teeth:84},
 {id:128,kind:'roller',shaftLength:978,diameter:89},
 {id:131,kind:'strip',length:1000,height:12.5,width:650},
 {id:152,kind:'disc',length:395,width:195},
 {id:159,kind:'sleeve',diameter:60,length:80},
 {id:167,kind:'gate',size:300}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('UCFU and ledger-dimensioned parts keep their recorded sizes',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  const near=(axis,value,tolerance=2e-5)=>assert.ok(Math.abs(size[axis]-value/1000)<tolerance,`${unit.id} ${axis} ${(size[axis]*1000).toFixed(2)} != ${value}`)
  if(unit.kind==='ucfu'){
   near('x',unit.L);near('y',unit.L);near('z',unit.A0)
   assert.match(entry.note,/LYC/)
   assert.match(entry.note,/内圈宽度未列出|未建内圈/)
   assert.match(entry.source?.caveat||'',/E=402|不擅自|UCFU 为独立系列/)
   assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='set-screws').length,0,`${unit.id} no insert`)
  }else if(unit.kind==='duct'){near('x',unit.diameter);near('z',unit.diameter);near('y',unit.height)}
  else if(unit.kind==='belt'){assert.ok(Math.abs(size.y-unit.width/1000)<.003,`${unit.id} belt width`);assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='teeth').length,unit.teeth,`${unit.id} teeth`)}
  else if(unit.kind==='roller'){near('x',unit.shaftLength);near('y',unit.diameter)}
  else if(unit.kind==='strip'){near('x',unit.length);near('y',unit.height);near('z',unit.width)}
  else if(unit.kind==='disc'){near('x',unit.length);near('y',unit.width)}
  else if(unit.kind==='sleeve'){near('x',unit.diameter);near('y',unit.length)}
  else if(unit.kind==='gate'){near('y',unit.size);near('z',unit.size);assert.ok(size.x>=unit.size/1000-1e-6,`${unit.id} body`)}
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=2,`${unit.id} unknown list`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

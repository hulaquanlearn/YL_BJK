// Batch B2 split plummer block housings: dimensions come from SKF datasheets
// generated from skf.com (local PDFs, dimension page visually checked). The
// tests prove the modelled geometry, not the ledger brand's physical hardware.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:207,A:115,A1:80,H:155,H1:80,H2:30,J:230,L:280,N:24,N1:18,Da:130},
 {id:243,A:120,A1:90,H:177,H1:95,H2:32,J:260,L:315,N:28,N1:22,Da:140},
 {id:244,A:120,A1:90,H:177,H1:95,H2:32,J:260,L:315,N:28,N1:22,Da:140},
 {id:253,A:148,A1:100,H:210,H1:112,H2:35,J:290,L:345,N:28,N1:22,Da:170},
 {id:304,A:160,A1:110,H:218,H1:112,H2:40,J:320,L:380,N:32,N1:26,Da:180},
 {id:309,A:148,A1:100,H:210,H1:112,H2:35,J:290,L:345,N:28,N1:22,Da:170},
 {id:316,A:105,A1:70,H:134,H1:70,H2:30,J:210,L:255,N:24,N1:18,Da:110},
 {id:328,A:105,A1:70,H:134,H1:70,H2:30,J:210,L:255,N:24,N1:18,Da:110},
 {id:329,A:125,A1:90,H:183,H1:95,H2:32,J:260,L:320,N:28,N1:22,Da:150},
 {id:209,A:143,A1:100,H:192,H1:100,H2:35,J:290,L:345,N:28,N1:22,Da:160},
 {id:242,A:175,A1:120,H:240,H1:125,H2:45,J:350,L:410,N:32,N1:26,Da:200},
 {id:296,A:185,A1:120,H:271,H1:140,H2:45,J:350,L:410,N:32,N1:26,Da:215},
 {id:297,A:143,A1:100,H:192,H1:100,H2:35,J:290,L:345,N:28,N1:22,Da:160},
 {id:317,A:205,A1:150,H:302,H1:150,H2:50,J:420,L:500,N:42,N1:35,Da:250}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
const bboxOf=list=>{const box=new T.Box3();for(const mesh of list)box.expandByObject(mesh);return box}

test('split housings keep the SKF envelope, seat bore, split face and foot slots',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.match(entry.source?.url||'',/skf|klium|rs-online/,`${unit.id} SKF datasheet source`)
  assert.match(entry.note,/SKF 尺寸表/)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  for(const [axis,value] of [['x',unit.L],['y',unit.H],['z',unit.A]]){
   assert.ok(Math.abs(size[axis]-value/1000)<2e-5,`${unit.id} ${axis} ${(size[axis]*1000).toFixed(2)} != ${value}`)
  }
  assert.ok(Math.abs(box.min.y)<1e-6,`${unit.id} rests on the floor`)

  const base=meshes.filter(mesh=>mesh.userData.observation?.id==='base')
  const lower=meshes.filter(mesh=>mesh.userData.observation?.id==='lower')
  const cap=meshes.filter(mesh=>mesh.userData.observation?.id==='cap')
  const seal=meshes.filter(mesh=>mesh.userData.observation?.id==='seal')
  assert.equal(base.length,1,`${unit.id} base`)
  assert.equal(lower.length,3,`${unit.id} lower`)
  assert.equal(cap.length,1,`${unit.id} cap`)
  assert.equal(seal.length,1,`${unit.id} seal`)

  // Seat bore is open along the shaft axis at the published centre height.
  const bore=new T.Raycaster(new T.Vector3(0,unit.H1/1000,1),new T.Vector3(0,0,-1))
  assert.equal(bore.intersectObject(scene,true).length,0,`${unit.id} seat bore open`)

  // Cap starts at the split face; the lower half ends there.
  assert.ok(Math.abs(bboxOf(cap).min.y-unit.H1/1000)<2e-5,`${unit.id} cap split face`)
  const lowerBody=[...lower].sort((left,right)=>right.geometry.attributes.position.count-left.geometry.attributes.position.count)[0]
  assert.ok(lowerBody,`${unit.id} lower body mesh`)
  assert.ok(Math.abs(bboxOf([lowerBody]).max.y-unit.H1/1000)<2e-5,`${unit.id} lower split face`)

  // Foot bolt slots are open to the sides (N long), with material between them.
  const slotZ=Math.abs(unit.A1/2-unit.N/4)/1000
  for(const side of [-1,1]){
   const slotRay=new T.Raycaster(new T.Vector3(side*unit.J/2000,1,side*slotZ),new T.Vector3(0,-1,0))
   assert.equal(slotRay.intersectObject(base[0],true).length,0,`${unit.id} foot slot open`)
   const railRay=new T.Raycaster(new T.Vector3(side*(unit.L/2-.01)/1000,1,0),new T.Vector3(0,-1,0))
   assert.ok(railRay.intersectObject(base[0],true).length>0,`${unit.id} foot rail material`)
  }

  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.equal(evidence.style,'split-housing')
  assert.match(evidence.dimensionSource?.url||'',/skf|klium|rs-online/)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=4,`${unit.id} unknown list`)
  for(const item of ['密封槽与密封型式','插入轴承的内部结构'])assert.ok(evidence.unknown.includes(item),`${unit.id} unknown ${item}`)
  assert.ok(root.name.includes('SN'),`${unit.id} keeps its ledger name: ${root.name}`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

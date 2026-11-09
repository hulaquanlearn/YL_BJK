// Cross-brand reference checks for the three 2026-11-02 UCP pillow blocks.
// Ledger brand is SKF; dimensions come from Timken pages for the same
// designation, so this proves what was built, not that SKF hardware matches.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:211,url:'/models/pending-20261009/505013668.glb',model:'UCP 310',d:50,H:75,L:275,A:75,J:212,N:20,N1:35,H1:24,H2:148,B:61,S:22},
 {id:212,url:'/models/pending-20261009/505013669.glb',model:'UCP 312',d:60,H:85,L:330,A:85,J:250,N:25,N1:38,H1:29,H2:167,B:71,S:26},
 {id:235,url:'/models/pending-20261009/505019154.glb',model:'UCP 308',d:40,H:60,L:220,A:60,J:170,N:17,N1:27,H1:19,H2:118,B:52,S:19}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene,doc:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())}
}

test('ledger brand stays SKF and the Timken reference is recorded, never presented as SKF data',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.equal(entry.url,unit.url)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.equal(entry.source?.ledgerBrand,'SKF',`${unit.id} ledger brand unchanged`)
  assert.equal(entry.source?.manufacturer,'Timken')
  assert.match(entry.source?.caveat||'',/未核对SKF实物/)
  assert.match(entry.note,/台账品牌为SKF/)
  assert.match(entry.note,/跨品牌参考/)
  assert.match(entry.note,/不能当作SKF厂家资料已核实/)
  const {bytes,scene,doc}=await load(unit.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]]
  const evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} carries evidence userData`)
  assert.equal(evidence.ledgerBrand,'SKF')
  assert.equal(evidence.dimensionSource?.manufacturer,'Timken')
  assert.match(evidence.dimensionSource?.caveat||'',/未核对SKF实物/)
  assert.equal(evidence.axialOffsetSmm,unit.S)
  assert.equal(evidence.style,'pillow');assert.match(evidence.axialOffsetNote,/S/)
  for(const item of ['球面座半径','内圈外径（OD）','密封型式与材料','铸件圆角/凸台直径'])assert.ok(evidence.unknown.includes(item),`${unit.id} unknown ${item}`)
  assert.ok(root.name.includes('SKF'),`${unit.id} keeps its SKF ledger name: ${root.name}`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

test('published envelope, stadium slots, S offset and bore are actually built',async()=>{
 for(const unit of units){
  const {scene}=await load(unit.url)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='set-screws').length,2,`${unit.id} two set screws`)
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='grease-nipple').length,1,`${unit.id} grease nipple`)
  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  assert.ok(Math.abs(size.x-unit.L/1000)<1e-5,`${unit.id} length`)
  assert.ok(Math.abs(size.y-unit.H2/1000)<1e-5,`${unit.id} height`)
  assert.ok(Math.abs(box.min.y)<1e-6,`${unit.id} floor contact`)
  // The wide inner ring protrudes on the +z side beyond the housing width A.
  const expectedDepth=unit.A/2+Math.max(unit.A/2,unit.B-unit.S)
  assert.ok(Math.abs(size.z-expectedDepth/1000)<1e-5,`${unit.id} depth ${(size.z*1000).toFixed(2)} vs ${expectedDepth}`)
  // Housing alone still keeps the published width A.
  const housing=new T.Box3()
  for(const mesh of meshes)if(mesh.userData.observation?.id==='housing')housing.expandByObject(mesh)
  assert.ok(Math.abs((housing.max.z-housing.min.z)-unit.A/1000)<1e-5,`${unit.id} housing width`)

  // Stadium slot: full-width straight section, open at 90% of the straight run.
  const straight=(unit.N1-unit.N)/2/1000
  for(const side of [-1,1])for(const fraction of [0,.9]){
   const x=side*unit.J/2000+side*fraction*straight
   const ray=new T.Raycaster(new T.Vector3(x,1,unit.N/2000*.42),new T.Vector3(0,-1,0))
   assert.equal(ray.intersectObject(scene,true).length,0,`${unit.id} stadium slot open at ${fraction}`)
  }
  // An ellipse hole would already be closed near the straight-section end; a
  // stadium keeps the full slot width there.
  const nearEnd=new T.Raycaster(new T.Vector3(unit.J/2000+straight*.95,1,unit.N/2000*.475),new T.Vector3(0,-1,0))
  assert.equal(nearEnd.intersectObject(scene,true).length,0,`${unit.id} slot has straight sides, not an ellipse`)
  // Beyond the N1 length the base is solid again.
  const pastEnd=new T.Raycaster(new T.Vector3(unit.J/2000+straight+(unit.N/2+2)/1000,1,0),new T.Vector3(0,-1,0))
  assert.ok(pastEnd.intersectObject(scene,true).length>0,`${unit.id} slot is capped at N1`)
  const solid=new T.Raycaster(new T.Vector3(0,1,0),new T.Vector3(0,-1,0))
  assert.ok(solid.intersectObject(scene,true).length>0,`${unit.id} base material between slots`)

  // Through bore at shaft diameter.
  const bore=new T.Raycaster(new T.Vector3(0,unit.H/1000,1),new T.Vector3(0,0,-1))
  assert.equal(bore.intersectObject(scene,true).length,0,`${unit.id} bore open`)

  // Inner ring keeps bore d, width B and the published S axial offset.
  const inner=meshes.filter(mesh=>mesh.userData.observation?.id==='inner')
  const innerBox=new T.Box3();for(const mesh of inner)innerBox.expandByObject(mesh)
  assert.ok(Math.abs((innerBox.max.z-innerBox.min.z)-unit.B/1000)<1e-5,`${unit.id} inner width B`)
  assert.ok(Math.abs(innerBox.min.z+unit.S/1000)<1e-5,`${unit.id} S offset from -z end`)
  assert.ok(Math.abs(innerBox.max.z-(unit.B-unit.S)/1000)<1e-5,`${unit.id} remaining B-S`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

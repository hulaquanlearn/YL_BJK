// Batch B1 bearing units: dimensions come from the public JTEKT/Koyo product
// pages read on 2026-11-02. Ledger brands differ, so this proves the modelled
// geometry only, not that the ledger-brand hardware was verified.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

// id, style, and the confirmed table values used to build the model.
const units=[
 {id:204,style:'pillow',d:40,H:49.2,L:184,A:54,J:137,N:17,N1:21,H1:18,H2:98,B:49.2,S:19},
 {id:208,style:'pillow',d:70,H:79.4,L:266,A:72,J:210,N:25,N1:30,H1:27,H2:157,B:74.6,S:30.2},
 {id:246,style:'pillow',d:65,H:76.2,L:265,A:70,J:203,N:25,N1:30,H1:27,H2:150,B:65.1,S:25.4},
 {id:247,style:'pillow',d:90,H:101.6,L:327,A:88,J:262,N:27,N1:40,H1:33,H2:198,B:96,S:39.7},
 {id:314,style:'pillow',d:35,H:47.6,L:167,A:48,J:127,N:17,N1:21,H1:18,H2:95,B:42.9,S:17.5},
 {id:211,style:'pillow',d:50,H:75,L:275,A:75,J:212,N:20,N1:35,H1:24,H2:148,B:61,S:22},
 {id:212,style:'pillow',d:60,H:85,L:330,A:85,J:250,N:25,N1:38,H1:29,H2:167,B:71,S:26},
 {id:235,style:'pillow',d:40,H:60,L:220,A:60,J:170,N:17,N1:27,H1:19,H2:118,B:52,S:19},
 {id:203,style:'pillow',d:65,H:76.2,L:265,A:70,J:203,N:25,N1:30,H1:27,H2:150,B:65.1,S:25.4},
 {id:206,style:'pillow',d:30,H:42.9,L:165,A:48,J:121,N:17,N1:21,H1:17,H2:84,B:38.1,S:15.9},
 {id:200,style:'square-flange',d:50,L:143,A:40,J:111,N:16,B:51.6,S:19,A0:54.6,A1:16,A2:22},
 {id:210,style:'square-flange',d:35,L:135,A:36,J:100,N:19,B:48,S:19,A0:49,A1:16,A2:20},
 {id:234,style:'square-flange',d:50,L:175,A:48,J:132,N:23,B:61,S:22,A0:67,A1:19,A2:28},
 {id:245,style:'square-flange',d:40,L:150,A:40,J:112,N:19,B:52,S:19,A0:56,A1:17,A2:23},
 {id:312,style:'square-flange',d:65,L:187,A:50,J:149,N:19,B:65.1,S:25.4,A0:69.7,A1:22,A2:30},
 {id:313,style:'square-flange',d:55,L:162,A:43,J:130,N:19,B:55.6,S:22.2,A0:58.4,A1:18,A2:25},
 {id:315,style:'square-flange',d:25,L:95,A:27,J:70,N:12,B:34.1,S:14.3,A0:35.8,A1:13,A2:16},
 {id:202,style:'oval-flange',d:40,H:175,L:100,A:36,J:144,N:16,B:49.2,S:19,A3:51.2,A1:14,A2:21},
 {id:213,style:'oval-flange',d:20,H:113,L:60,A:25.5,J:90,N:12,B:31,S:12.7,A3:33.3,A1:11,A2:15},
 {id:303,style:'oval-flange',d:25,H:130,L:68,A:27,J:99,N:16,B:34.1,S:14.3,A3:35.8,A1:13,A2:16},
 {id:305,style:'oval-flange',d:35,H:161,L:90,A:34,J:130,N:16,B:42.9,S:17.5,A3:44.4,A1:14,A2:19}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
const bbox=list=>{const box=new T.Box3();for(const mesh of list)box.expandByObject(mesh);return box}

test('batch B1 units keep the published envelope, holes, bore and inner-ring width',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.equal(entry.status,'rebuilt',`${unit.id} rebuilt asset`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.ok(/jtekt\.co\.jp|cad\.timken\.com/.test(entry.source?.url||''),`${unit.id} source url`)
  assert.match(entry.note,/跨品牌参考/)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='set-screws').length,2,`${unit.id} two set screws`)
  assert.equal(meshes.filter(mesh=>mesh.userData.observation?.id==='grease-nipple').length,1,`${unit.id} grease nipple`)

  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  const expected=unit.style==='pillow'
   ?{x:unit.L,y:unit.H2,z:unit.A/2+Math.max(unit.A/2,unit.B-unit.S)}
   :unit.style==='square-flange'?{x:unit.L,y:unit.L,z:unit.A0}:{x:unit.H,y:unit.L,z:unit.A3}
  for(const axis of ['x','y','z'])assert.ok(Math.abs(size[axis]-expected[axis]/1000)<2e-5,`${unit.id} ${axis} ${(size[axis]*1000).toFixed(2)} != ${expected[axis]}`)

  // Through bore at the published shaft diameter.
  const bore=new T.Raycaster(new T.Vector3(0,unit.style==='pillow'?unit.H/1000:0,1),new T.Vector3(0,0,-1))
  assert.equal(bore.intersectObject(scene,true).length,0,`${unit.id} bore open`)

  // Mounting holes: two stadium slots (pillow) or round holes through the plate.
  if(unit.style==='pillow'){
   const straight=(unit.N1-unit.N)/2/1000
   for(const side of [-1,1])for(const fraction of [0,.9]){
    const x=side*unit.J/2000+side*fraction*straight
    const ray=new T.Raycaster(new T.Vector3(x,1,unit.N/2000*.42),new T.Vector3(0,-1,0))
    assert.equal(ray.intersectObject(scene,true).length,0,`${unit.id} stadium slot open`)
   }
  }else{
   const holes=unit.style==='square-flange'
    ?[[-unit.J/2000,-unit.J/2000],[unit.J/2000,-unit.J/2000],[-unit.J/2000,unit.J/2000],[unit.J/2000,unit.J/2000]]
    :[[-unit.J/2000,0],[unit.J/2000,0]]
   for(const [x,y] of holes){
    const ray=new T.Raycaster(new T.Vector3(x,y,1),new T.Vector3(0,0,-1))
    assert.equal(ray.intersectObject(scene,true).length,0,`${unit.id} bolt hole open at ${x},${y}`)
   }
  }

  // Inner ring: bore d, width B, and the S information recorded in userData.
  const inner=meshes.filter(mesh=>mesh.userData.observation?.id==='inner')
  const innerBox=bbox(inner)
  assert.ok(Math.abs((innerBox.max.z-innerBox.min.z)-unit.B/1000)<2e-5,`${unit.id} inner width B`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.equal(evidence.style,unit.style)
  assert.equal(evidence.axialOffsetSmm,unit.S)
  assert.ok(evidence.axialOffsetNote,`${unit.id} S placement note`)
  assert.match(evidence.dimensionSource?.caveat||'',/跨品牌参考/)
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=4,`${unit.id} unknown list`)
  assert.ok(root.name&&root.name.length>0,`${unit.id} keeps the ledger name`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

test('two UCFU reference items stay blocked instead of being faked as UCF units',()=>{
 for(const id of [201,248]){
  const entry=catalog.models.find(model=>model.id===id)
  assert.ok(entry)
  assert.match(entry.note,/UCFU/)
  assert.equal(entry.requiresReview,true)
 }
})

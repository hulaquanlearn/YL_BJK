// Batch B3 ledger-dimensioned parts. The principal sizes come from the ledger
// material description; anything the description does not give is illustrative.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const units=[
 {id:83,check:size=>Math.abs(size.x-.15)<1e-5&&size.y>.15,label:'caster 150'},
 {id:84,check:size=>Math.abs(size.x-.1)<1e-5,label:'caster 100'},
 {id:90,check:size=>Math.abs(size.x-1)<1e-5&&Math.abs(size.y-.01)<1e-5&&Math.abs(size.z-.025)<1e-5,label:'strip 10x25'},
 {id:129,check:size=>Math.abs(size.x-.21)<1e-5&&Math.abs(size.y-.01)<1e-5,label:'packing coil'},
 {id:109,check:size=>Math.abs(size.x-.2)<1e-5&&Math.abs(size.y-.3)<1e-5,label:'sleeve 200x5'},
 {id:119,check:size=>Math.abs(size.y-2)<1e-5&&size.x>.12&&size.x<.14,label:'duct 120x2000'},
 {id:124,check:size=>Math.abs(size.x-.39)<1e-5&&Math.abs(size.y-1.55)<1e-5,label:'screen mesh 390x1550'},
 {id:125,check:size=>Math.abs(size.x-1.55)<1e-5&&Math.abs(size.y-.695)<1e-5&&Math.abs(size.z-.002)<1e-5,label:'screen plate 1550x695x2'},
 {id:144,check:size=>Math.abs(size.y-2)<1e-5&&size.x>.14&&size.x<.15,label:'filter bag 140x2000'},
 {id:169,check:size=>Math.abs(size.x-.978)<1e-5&&Math.abs(size.y-.089)<1e-5,label:'roller 89x950'},
 {id:189,check:size=>Math.abs(size.x-1.515)<1e-5&&Math.abs(size.y-.385)<1e-5&&Math.abs(size.z-.002)<1e-5,label:'plate 1515x385x2'},
 {id:116,check:size=>Math.abs(size.z-.2)<1e-5,label:'backstop 60/200'}
]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes,scene}
}
test('ledger-size parts keep their recorded principal dimensions',async()=>{
 for(const unit of units){
  const entry=catalog.models.find(model=>model.id===unit.id)
  assert.ok(entry,`catalog ${unit.id}`)
  assert.ok(entry.source,`${unit.id} evidence source`)
  assert.equal(entry.source?.type,'ledger-material-spec',`${unit.id} source type`)
  assert.match(entry.note,/台账物料规格/)
  const {bytes,scene}=await load(entry.url)
  assert.equal(sha(bytes),entry.sha256,`${unit.id} hash`)
  const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
  assert.equal(meshes.length,entry.meshCount,`${unit.id} mesh count`)
  assert.equal(new Set(meshes.map(mesh=>mesh.userData.observation?.id)).size,entry.partCount,`${unit.id} part count`)
  const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3())
  assert.ok(unit.check(size),`${unit.id} ${unit.label} measured ${[size.x,size.y,size.z].map(value=>+(value*1000).toFixed(1))}`)
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],evidence=root.extras?.evidence
  assert.ok(evidence,`${unit.id} evidence`)
  assert.equal(evidence.dimensionSource?.type,'ledger-material-spec')
  assert.ok(Array.isArray(evidence.unknown)&&evidence.unknown.length>=1,`${unit.id} unknown list`)
  assert.ok(root.name&&root.name.length>0,`${unit.id} keeps ledger name`)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

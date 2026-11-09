// Independent acceptance: validate the complete original inventory and compare
// rendered world-space geometry, never counting names/materials/extras as a rebuild.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
import {GLTFLoader} from '../../spare-parts-web-release/node_modules/three/examples/jsm/loaders/GLTFLoader.js'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'))
export async function inspectGeometry(bytes){
 assert.equal(bytes.subarray(0,4).toString(),'glTF')
 assert.equal(bytes.readUInt32LE(4),2)
 assert.equal(bytes.readUInt32LE(8),bytes.length)
 const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'))
 assert.ok((document.buffers||[]).every(buffer=>!buffer.uri),'External buffers are not portable')
 assert.ok((document.images||[]).every(image=>!image.uri),'External textures are not portable')
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 const primitives=[],observations=new Set();let meshes=0,vertices=0,triangles=0
 const point=new T.Vector3()
 try{
  scene.traverse(mesh=>{
   if(!mesh.isMesh)return
   meshes++
   const position=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index
   assert.ok(position?.count>0&&normal?.count===position.count,'Missing positions or normals')
   const coordinates=new Float64Array(position.count*3)
   for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld)
    assert.ok([point.x,point.y,point.z,normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite),'Nonfinite geometry')
    coordinates[i*3]=Math.round(point.x*1e8)/1e8
    coordinates[i*3+1]=Math.round(point.y*1e8)/1e8
    coordinates[i*3+2]=Math.round(point.z*1e8)/1e8
   }
   const indices=new Uint32Array(index?.count||0)
   for(let i=0;i<indices.length;i++){const value=index.getX(i);assert.ok(Number.isInteger(value)&&value>=0&&value<position.count,'Invalid vertex index');indices[i]=value}
   vertices+=position.count;triangles+=(index?.count||position.count)/3
   const fingerprint=crypto.createHash('sha256').update(Buffer.from(coordinates.buffer)).update(Buffer.from(indices.buffer)).digest('hex')
   primitives.push(fingerprint)
   if(mesh.userData.observation?.id)observations.add(mesh.userData.observation.id)
  })
  assert.ok(meshes>0&&vertices>0)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.ok([size.x,size.y,size.z].every(Number.isFinite)&&Math.max(size.x,size.y,size.z)>0,'Empty model bounds')
  return {fingerprint:sha(Buffer.from(primitives.sort().join('|'))),meshes,vertices,triangles,observations:observations.size,bounds:[size.x,size.y,size.z]}
 }finally{scene.traverse(mesh=>{mesh.geometry?.dispose();for(const material of [].concat(mesh.material||[]))material.dispose()})}
}

export async function verifyRebuild({web=path.join(root,'spare-parts-web-release'),output}={}){
 const original=await readJSON(path.join(root,'spare-parts-web-release/test/fixtures/model-baseline-fingerprints.json'))
 const catalog=await readJSON(path.join(web,'src/utils/reviewed-model-catalog.json'))
 const progress=await readJSON(path.join(root,'docs/SPARE_REBUILD_PROGRESS_20261102.json'))
 assert.equal(original.models.length,330)
 assert.deepEqual(catalog.models.map(row=>row.id).sort(),original.models.map(row=>row.id).sort(),'Catalog IDs changed')
 const rows=[]
 for(const before of original.models){
  const entry=catalog.models.find(row=>row.id===before.id)
  const frozen=progress.items.find(row=>row.id===before.id)
  assert.equal(entry.url,before.url,'Binding URL changed for '+entry.id)
  assert.equal(frozen?.status,'frozen','Not completed: '+entry.id)
  const current=await fs.readFile(path.join(web,'public',entry.url))
  assert.equal(before.sha256,frozen.baselineSha256,'Baseline hash record changed: '+entry.id)
  assert.equal(sha(current),entry.sha256,'Catalog hash: '+entry.id)
  assert.equal(sha(current),frozen.frozenSha256,'Frozen hash: '+entry.id)
  const now=await inspectGeometry(current),prior=before.rendered
  assert.notEqual(now.fingerprint,prior.fingerprint,'No rendered geometry change: '+entry.id)
  assert.equal(now.meshes,entry.meshCount,'Mesh count: '+entry.id)
  assert.ok(entry.source,'Missing provenance: '+entry.id)
  for(const alias of entry.aliases||[])assert.equal(sha(await fs.readFile(path.join(web,'public',alias))),entry.sha256,'Alias hash: '+entry.id)
  rows.push({id:entry.id,url:entry.url,sha256:entry.sha256,baselineSha256:before.sha256,geometrySha256:now.fingerprint,baselineGeometrySha256:prior.fingerprint,...now,fingerprint:undefined,batch:frozen.batch,source:entry.source,status:entry.status,requiresReview:entry.requiresReview===true,note:entry.note})
 }
 const report={schema:1,at:new Date().toISOString(),originalCount:330,rebuilt:rows.length,geometryChanged:rows.length,idsAndBindingUrlsPreserved:true,method:'Three.js GLTFLoader; world-space POSITION plus triangle indices; ignores names, materials and extras; validates finite vertices/normals, bounds, catalog/freeze/alias hashes',scope:'Rebuild acceptance does not certify unverified installation dimensions or physical suitability.',rows}
 if(output)await fs.writeFile(output,JSON.stringify(report,null,2))
 return report
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await verifyRebuild({web:process.argv[2]?path.resolve(process.argv[2]):undefined,output:process.argv[3]?path.resolve(process.argv[3]):undefined})
 console.log(JSON.stringify({...report,rows:undefined}))
}

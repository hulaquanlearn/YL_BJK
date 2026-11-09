// Structural-consistency checks for the A-type hollow-shaft reducers.
// The model name and saved descriptions only support the hollow-shaft category,
// not measured bores: every assertion below is about the generated geometry.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const hollowIds=[217,218,219,220,226,229,249,252,259,260,261,262,267,268,269,274]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const boxOf=list=>{const box=new T.Box3();for(const mesh of list)box.expandByObject(mesh);return box}

async function load(url){
  const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
  scene.updateMatrixWorld(true)
  return {bytes,scene}
}
function meshesByPart(scene){
  const map={}
  scene.traverse(node=>{if(!node.isMesh)return;const id=node.userData?.observation?.id;if(id)(map[id]??=[]).push(node)})
  return map
}

test('hollow-shaft reducers keep a seated output flange and a documented bore state',async()=>{
  for(const id of hollowIds){
    const entry=catalog.models.find(model=>model.id===id)
    assert.ok(entry,`catalog ${id}`)
    assert.equal(entry.status,'rebuilt',`${id} stays a rebuilt illustrative asset`)
    assert.equal(entry.requiresReview,true,`${id} still needs drawing review`)
    assert.match(entry.note,/厂家图纸|图纸核对/,`${id} note names the missing evidence`)
    const {bytes,scene}=await load(entry.url)
    assert.equal(sha(bytes),entry.sha256,`${id} hash`)
    const parts=meshesByPart(scene)
    const hollow=parts.shaft?.find(mesh=>mesh.userData?.hollowShaft)
    assert.ok(hollow,`${id} carries hollow-shaft metadata`)
    const meta=hollow.userData.hollowShaft
    assert.equal(meta.schema,1)
    assert.equal(meta.boreDiameterMm,170)
    assert.match(meta.note,/图纸|核对/)

    const gearbox=boxOf(parts.gearbox||[]),output=boxOf(parts.output||[]),shaft=boxOf(parts.shaft||[])
    assert.ok(!gearbox.isEmpty()&&!output.isEmpty()&&!shaft.isEmpty(),`${id} bounds`)
    // A flange that floats away from the housing would read as a separate ring.
    if(meta.throughBore){
      assert.ok(output.min.z<gearbox.max.z,`${id} flange seats on the housing face`)
      const ray=new T.Raycaster(new T.Vector3(0,.5,3),new T.Vector3(0,0,-1))
      assert.equal(ray.intersectObject(scene,true).length,0,`${id} bore is visibly open`)
    }else{
      assert.ok(output.min.x<gearbox.max.x,`${id} parallel-type flange seats on the housing face`)
      const ray=new T.Raycaster(new T.Vector3(3,.72,0),new T.Vector3(-1,0,0))
      const hits=ray.intersectObject(scene,true).map(hit=>hit.object.userData?.observation?.id)
      assert.ok(hits.includes('gearbox'),`${id} documents that the parallel bore is still closed`)
    }
    scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
  }
})

test('the hollow-shaft metadata does not leak onto solid-output categories',()=>{
  const marked=catalog.models.filter(entry=>entry.note.includes('A型空心输出端'))
  assert.deepEqual(marked.map(entry=>entry.id).sort((a,b)=>a-b),hollowIds)
})

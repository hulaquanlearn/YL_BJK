import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCraneModel,applyCranePose} from '../src/utils/crane-model.mjs'
import {craneHomePose} from '../src/utils/crane-state.mjs'
import {createCraneComponents} from '../src/utils/crane-components.mjs'

test('ray-hit meshes map to functional parts, including separate motors, wheels, rails and jaws',()=>{
 const model=buildCraneModel(),registry=createCraneComponents(model)
 assert.ok(registry.components.length>model.parts.length)
 for(const id of ['travel-motors','grab-jaws','endcarriage-north','bridge-girder']){
  const pieces=registry.components.filter(c=>c.partId===id)
  assert.ok(pieces.length>=2,id)
  for(const p of pieces)for(const mesh of p.meshes)assert.equal(registry.byMesh.get(mesh),p)
 }
 assert.ok(registry.components.some(c=>c.userData.label==='左侧主梁'))
 assert.ok(registry.components.some(c=>c.userData.label==='左侧梁顶小车轨道'))
 registry.dispose()
})
test('green highlighting isolates one component even when original paint materials were shared',()=>{
 const model=buildCraneModel(),before=new Map();model.root.traverse(n=>{if(n.isMesh)before.set(n,n.material)})
 const registry=createCraneComponents(model),a=registry.components.find(c=>c.userData.label==='左侧主梁'),b=registry.components.find(c=>c.userData.label==='右侧主梁')
 const original=b.meshes[0].material.color.getHexString()
 registry.select(a.name)
 assert.equal(a.meshes[0].material.color.getHexString(),'46c96b')
 assert.equal(b.meshes[0].material.color.getHexString(),original)
 registry.select(b.name)
 assert.equal(a.meshes[0].material.color.getHexString(),original)
 assert.equal(b.meshes[0].material.color.getHexString(),'46c96b')
 registry.select('');assert.equal(b.meshes[0].material.color.getHexString(),original)
 registry.dispose();for(const [mesh,material] of before)assert.equal(mesh.material,material)
})
test('selection identity survives motion and material disposal restores the original rig',()=>{
 const model=buildCraneModel(),registry=createCraneComponents(model),jaw=registry.components.find(c=>c.userData.label==='抓斗颚板（一）'),mesh=jaw.meshes[0]
 for(const pose of [{hoist:1,grip:1},{rotation:1},{travel:1,trolley:.7}]){
  applyCranePose(model,{...craneHomePose(),...pose});assert.equal(registry.byMesh.get(mesh),jaw)
 }
 registry.select(jaw.name);assert.equal(mesh.material.color.getHexString(),'46c96b')
 registry.dispose();assert.notEqual(mesh.material.color.getHexString(),'46c96b')
})

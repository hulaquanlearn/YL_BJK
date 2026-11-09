import test from 'node:test'
import assert from 'node:assert/strict'
import { modelMeshInventory } from '../src/utils/model-mesh-inventory.mjs'
test('raw inspection inventory keeps separate same-name meshes and actual geometry counts without inventing semantic names',()=>{
 const meshes=[{name:'Shell',geometry:{attributes:{position:{count:24}},index:{count:36}}},{name:'Shell',geometry:{attributes:{position:{count:9}}}},{name:'',geometry:{attributes:{position:{count:6}}}}]
 const out=modelMeshInventory(meshes)
 assert.deepEqual(out.map(m=>m.id),['mesh-1','mesh-2','mesh-3']);assert.deepEqual(out.map(m=>m.triangleCount),[12,3,2]);assert.equal(out[2].name,'未命名网格 3');assert.equal(out[0].name,'Shell');assert.equal(meshes[0].name,'Shell')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { displayedPartModel, PUBLIC_PART_MODEL, createPublicPartModel } from '../src/utils/public-part-model.mjs'
test('unbound parts use public geometry; pending bound models stay pending',()=>{
  assert.equal(displayedPartModel({}),PUBLIC_PART_MODEL)
  assert.equal(displayedPartModel({categoryModelId:9,categoryModelName:'待生成'}),'')
  assert.equal(displayedPartModel({categoryModelUrl:'/models/part.glb'}),'/models/part.glb')
  const model=createPublicPartModel()
  assert.ok(model.isGroup)
  assert.equal(model.children.length,2)
  model.traverse(node=>{node.geometry?.dispose();node.material?.dispose()})
})

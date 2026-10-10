import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

test('193 original named catalog entries retain IDs and all assets load', async () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../../server/data/ledger-model-catalog.json', import.meta.url)))
  assert.equal(catalog.models.length, 193)
  assert.equal(new Set(catalog.models.map(m => m.name)).size, 193)
  assert.deepEqual(catalog.models.map(m => m.id), Array.from({ length: 193 }, (_, i) => i + 1))
  const loader = new GLTFLoader()
  for (const model of catalog.models) {
    if (!model.modelUrl) { assert.match(model.description, /暂不展示猜测外形/); continue }
    const bytes = fs.readFileSync(new URL('../public' + model.modelUrl, import.meta.url))
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', model.name)
    assert.equal(bytes.readUInt32LE(8), bytes.length, model.name)
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    assert.equal(new Box3().setFromObject(gltf.scene).isEmpty(), false, model.name)
    gltf.scene.traverse(node => { node.geometry?.dispose(); if (Array.isArray(node.material)) node.material.forEach(m => m.dispose()); else node.material?.dispose() })
  }
})

test('shared formerly pending assets identify their original model names and IDs', async()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../../server/data/ledger-model-catalog.json',import.meta.url)))
  assert.equal(catalog.assetUpdates[0].models.length,11)
  for(const update of catalog.assetUpdates[0].models){
    const model=catalog.models.find(m=>m.name===update.name)
    assert.equal(model.modelUrl,update.modelUrl)
    const bytes=fs.readFileSync(new URL('../public'+model.modelUrl,import.meta.url))
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
    assert.equal(gltf.scene.children[0].userData.modelName,model.name)
    assert.equal(gltf.scene.children[0].userData.catalogId,model.id)
    assert.equal(gltf.scene.children[0].userData.manufacturerCAD,false)
    gltf.scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose()})
  }
  assert.ok(catalog.models.find(m=>m.id===86).modelUrl,'both screenshot bearings keep the shared named model 86')
})

test('pending ledger assets load and retain exact material provenance', async () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../../server/data/ledger-model-catalog.json', import.meta.url)))
  const models = catalog.supplements.find(b => b.version === 'pending-ledger-20261009-v1').models
  assert.equal(models.length, 131)
  assert.equal(new Set(models.map(m => m.materialCode)).size, models.length)
  for (const code of ['502004846','505002286','505020164','505023260','505024096','505024097']) assert.ok(models.some(m => m.materialCode === code), code)
  for (const model of models) {
    const bytes = fs.readFileSync(new URL('../public' + model.modelUrl, import.meta.url))
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    assert.equal(gltf.scene.children[0].userData.materialCode, model.materialCode)
    const bounds = new Box3().setFromObject(gltf.scene)
    assert.equal(bounds.isEmpty(), false)
    assert.ok([bounds.min.x,bounds.max.x,bounds.min.y,bounds.max.y].every(Number.isFinite))
    gltf.scene.traverse(n => { n.geometry?.dispose(); n.material?.dispose() })
  }
})

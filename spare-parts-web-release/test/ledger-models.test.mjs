import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

test('193 catalog entries have unique IDs/names; available models load and pending shapes are explicit', async () => {
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

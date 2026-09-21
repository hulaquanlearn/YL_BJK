import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'
import { slotModelBounds, modelFitScale, normalizeModelRotation } from '../src/utils/model-fit.mjs'

const models = ['bearing.glb', 'circuit-breaker.glb', 'valve.glb', 'sensor.glb']

test('system category GLB models are present and structurally recognizable', () => {
  for (const name of models) {
    const buffer = fs.readFileSync(new URL(`../public/models/categories/${name}`, import.meta.url))
    assert.ok(buffer.length > 1000, `${name} should contain a non-empty model`)
    assert.equal(buffer.subarray(0, 4).toString('ascii'), 'glTF', `${name} should use the GLB container`)
    assert.equal(buffer.readUInt32LE(4), 2, `${name} should use glTF 2.0`)
    assert.equal(buffer.readUInt32LE(8), buffer.length, `${name} should declare its exact byte length`)
  }
})

test('seven photo reference models load, are grounded, self-contained and fit dense slots', async () => {
  const base = new URL('../public/models/reference-20260904/', import.meta.url)
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', base)))
  assert.equal(manifest.models.length, 7)
  for (const entry of manifest.models) {
    assert.equal(typeof entry.frontRotationY, 'number')
    assert.equal(normalizeModelRotation(entry.frontRotationY), entry.frontRotationY)
    const buffer = fs.readFileSync(new URL(entry.model, base))
    assert.equal(buffer.readUInt32LE(8), buffer.length)
    assert.equal(createHash('sha256').update(buffer).digest('hex'), entry.modelSha256)
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(entry.image,base))).digest('hex'),entry.imageSha256)
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString())
    assert.ok(json.buffers.every(b => !b.uri))
    assert.ok(json.nodes.filter(n => n.mesh != null).length >= 10)
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')
    const box = new Box3().setFromObject(gltf.scene), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3())
    assert.ok(Math.abs(box.min.y) < .0001,entry.key+' rests on floor')
    assert.ok(Math.abs(center.x)<.0001 && Math.abs(center.z)<.0001,entry.key+' is centred')
    for (const slots of [4,12,30,99]) {
      const bounds = slotModelBounds({usableWidth:4.08,slots,depth:.9,layerHeight:.74,sideZ:.252})
      const s = modelFitScale(size,bounds,1.6)
      assert.ok(size.x*s <= bounds.width+.000001)
      assert.ok(size.y*s <= bounds.height+.000001)
      assert.ok(size.z*s <= bounds.depth+.000001)
    }
  }
})

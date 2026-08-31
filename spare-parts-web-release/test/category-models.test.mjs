import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

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

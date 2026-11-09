import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
import { layoutModelCallouts } from '../src/utils/model-callout-layout.mjs'
import {modelSurfaceAnchor} from '../src/utils/model-surface-anchor.mjs'

const anchor = (id, anchorX, anchorY) => ({ id, name: id, anchorX, anchorY })
function assertBounds(result, width, top, bottom) {
  for (const label of result.labels) { assert.ok(label.x >= 0 && label.x + label.width <= width); assert.ok(label.y >= top && label.y + label.height <= bottom + 1e-6); assert.ok(!/NaN|Infinity/.test(label.path)) }
  for (let a = 0; a < result.labels.length; a++) for (let b = a + 1; b < result.labels.length; b++) {
    const first = result.labels[a], second = result.labels[b]
    assert.ok(first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y + 1e-6 || second.y + second.height <= first.y + 1e-6, `overlap ${first.id}/${second.id}`)
  }
}
function crosses(first, second) {
  const determinant = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const segments = item => [[[item.anchorX, item.anchorY], [item.railX, item.anchorY]], [[item.railX, item.anchorY], [item.endX, item.endY]]]
  return segments(first).some(([a, b]) => segments(second).some(([c, d]) => determinant(a, b, c) * determinant(a, b, d) < -1e-6 && determinant(c, d, a) * determinant(c, d, b) < -1e-6))
}
test('the first-listed right-end output label stays right and near the projected model edge', () => {
  const input = { width: 760, height: 430, top: 50, bottom: 340, modelBounds: { left: 220, right: 500, centerX: 360 }, anchors: [anchor('output', 480, 150), anchor('body', 250, 220)] }
  const result = layoutModelCallouts(input), output = result.labels.find(item => item.id === 'output')
  assert.ok(output.right); assert.ok(output.x > input.modelBounds.right); assert.ok(output.x < 600)
  assert.ok(Math.min(output.anchorX, output.railX, output.endX) > input.modelBounds.centerX)
  assert.deepEqual(layoutModelCallouts({ ...input, anchors: [...input.anchors].reverse() }).labels, result.labels)
  assert.equal(output.anchorX, 480); assert.equal(output.anchorY, 150)
})
test('same-side labels follow anchor height without crossing when definitions arrive out of order', () => {
  const result = layoutModelCallouts({ width: 736, height: 430, top: 60, bottom: 340, modelBounds: { left: 230, right: 490, centerX: 360 }, anchors: [anchor('low', 440, 260), anchor('high', 470, 110), anchor('middle', 450, 185)] })
  assert.deepEqual(result.labels.map(item => item.id), ['high', 'middle', 'low'])
  assert.equal(result.labels.length, 3); assertBounds(result, 736, 60, 340)
  for (let a = 0; a < result.labels.length; a++) for (let b = a + 1; b < result.labels.length; b++) assert.equal(crosses(result.labels[a], result.labels[b]), false)
})
test('320 and 390px touch screens retain all six common labels above controls', () => {
  for (const width of [320, 390]) {
    const centerX = width / 2
    const anchors = [anchor('left-high', centerX - 60, 115), anchor('left-middle', centerX - 35, 200), anchor('left-low', centerX - 15, 275), anchor('right-high', centerX + 15, 125), anchor('right-middle', centerX + 35, 205), anchor('right-low', centerX + 60, 280)]
    const result = layoutModelCallouts({ width, height: 430, top: 64, bottom: 340, labelHeight: 42, padding: 10, modelBounds: { left: centerX - 80, right: centerX + 80, centerX }, anchors })
    assert.equal(result.labels.length, 6); assert.deepEqual(result.overflowIds, []); assertBounds(result, width, 64, 340)
    for (const label of result.labels) assert.equal(label.right, label.anchorX > centerX)
    for (let a = 0; a < result.labels.length; a++) for (let b = a + 1; b < result.labels.length; b++) assert.equal(crosses(result.labels[a], result.labels[b]), false)
  }
})
test('crowded models expose overflow rather than overlapping and prioritize the selected hidden part', () => {
  const anchors = Array.from({ length: 11 }, (_, index) => anchor('part-' + index, 205 + index, 155 + index * 3))
  const input = { width: 320, height: 430, top: 125, bottom: 330, labelHeight: 42, modelBounds: { left: 70, right: 245, centerX: 160 }, anchors, selectedId: 'part-10' }
  const result = layoutModelCallouts(input)
  assert.ok(result.overflowIds.length > 0); assert.ok(result.labels.some(item => item.id === 'part-10'))
  assert.equal(new Set([...result.labels.map(item => item.id), ...result.overflowIds]).size, 11)
  assertBounds(result, 320, 125, 330)
})
test('zoomed/clipped projections never put labels over their visible anchors or cross leader lines', () => {
  const result = layoutModelCallouts({ width: 320, height: 430, top: 80, bottom: 335, labelHeight: 42, modelBounds: { left: -30, right: 350, centerX: 160 }, selectedId: 'selected', anchors: [anchor('one', 250, 265), anchor('two', 280, 282), anchor('selected', 300, 300), anchor('offscreen', 360, 200)] })
  assert.ok(result.labels.some(item => item.id === 'selected')); assert.ok(result.overflowIds.includes('offscreen')); assertBounds(result, 320, 80, 335)
  for (const label of result.labels) for (const other of result.labels) assert.ok(!(other.anchorX > label.x && other.anchorX < label.x + label.width && other.anchorY > label.y && other.anchorY < label.y + label.height), 'label covers an active leader anchor')
  for (let a = 0; a < result.labels.length; a++) for (let b = a + 1; b < result.labels.length; b++) assert.equal(crosses(result.labels[a], result.labels[b]), false)
})

function componentSubject(parts, currentModel, camera) {
  const source = fs.readFileSync(new URL('../src/components/ModelPreview.vue', import.meta.url), 'utf8'), start = source.indexOf('function updateCallouts(){')
  const context = { THREE, layoutModelCallouts, modelSurfaceAnchor, currentModel, camera, meshes: parts.flatMap(part => part.objects), props: { inspectMeshes: false }, parts: { value: parts }, selected: { value: '' }, callouts: { value: [] }, overflowParts: { value: [] }, labelsVisible: { value: true }, viewWidth: { value: 760 }, viewHeight: { value: 430 }, host: { value: null }, window: { matchMedia: () => ({ matches: false }) } }
  vm.runInNewContext(source.slice(start, source.indexOf('\nfunction render()', start)), context)
  return context
}
test('current camera projection moves the same real output mesh from right to left after a half-turn', () => {
  const geometry = new THREE.BoxGeometry(.7, .7, .7), material = new THREE.MeshBasicMaterial(), output = new THREE.Mesh(geometry, material), body = new THREE.Mesh(geometry, material), model = new THREE.Group()
  output.position.x = 2; body.position.x = -2; model.add(output, body)
  const camera = new THREE.PerspectiveCamera(36, 760 / 430, .05, 120); camera.position.set(0, 1, 9); camera.lookAt(0, 0, 0)
  const context = componentSubject([{ id: 'output', name: '输出端', objects: [output] }, { id: 'body', name: '机体', objects: [body] }], model, camera)
  context.updateCallouts(); assert.equal(context.callouts.value.find(item => item.id === 'output').right, true)
  camera.position.set(0, 1, -9); camera.lookAt(0, 0, 0); context.updateCallouts()
  assert.equal(context.callouts.value.find(item => item.id === 'output').right, false)
  assert.equal(context.parts.value[0].objects[0], output); assert.equal(output.position.x, 2)
  geometry.dispose(); material.dispose()
})
test('a hollow ring leader intersects the real surface instead of pointing into its empty center', () => {
  const geometry = new THREE.RingGeometry(1, 2, 48), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), ring = new THREE.Mesh(geometry, material), model = new THREE.Group(); model.add(ring)
  const camera = new THREE.PerspectiveCamera(36, 760 / 430, .05, 120); camera.position.set(0, 0, 9); camera.lookAt(0, 0, 0)
  const context = componentSubject([{ id: 'outer', name: '外圈', objects: [ring] }], model, camera); context.updateCallouts()
  const label = context.callouts.value.find(item => item.id === 'outer'); assert.ok(label)
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(label.anchorX/380-1,1-label.anchorY/215),camera)
  assert.ok(ray.intersectObject(ring).length);assert.ok(Math.hypot(label.anchorX - 380, label.anchorY - 215) > 30)
  geometry.dispose(); material.dispose()
})
test('raw inspection projects only the selected mesh while a thousand mesh entries remain selectable elsewhere', () => {
  const geometry = new THREE.BoxGeometry(.04, .04, .04), material = new THREE.MeshBasicMaterial(), model = new THREE.Group()
  const parts = Array.from({ length: 1000 }, (_, index) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set((index % 50 - 25) * .03, Math.floor(index / 50) * .02, 0); model.add(mesh); return { id: 'mesh-' + index, name: '原始网格' + index, objects: [mesh] } })
  const camera = new THREE.PerspectiveCamera(36, 760 / 430, .05, 120); camera.position.set(0, 1, 9); camera.lookAt(0, 0, 0)
  const context = componentSubject(parts, model, camera); context.props.inspectMeshes = true; context.selected.value = 'mesh-700'; context.updateCallouts()
  assert.equal(context.parts.value.length, 1000); assert.equal(context.callouts.value.length, 1); assert.equal(context.callouts.value[0].id, 'mesh-700')
  assert.equal(context.overflowParts.value.length, 0)
  context.selected.value = 'mesh-701'; context.updateCallouts(); assert.equal(context.callouts.value.length, 1); assert.equal(context.callouts.value[0].id, 'mesh-701')
  geometry.dispose(); material.dispose()
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  COMMON_SHELF_LEVELS,
  PHYSICAL_ROW_GAP_Z,
  PHYSICAL_ROOM_HALF_DEPTH,
  applyPhysicalShelfLayout,
  layerLocalY,
  partBelongsToShelf,
  resolvePartLocation,
  sideAwareSlotLocalX,
  sideLocalZ,
  slotLocalX
} from '../src/utils/warehouse-location.mjs'

const warehouseViewSource = fs.readFileSync(new URL('../src/views/Warehouse3D.vue', import.meta.url), 'utf8')

test('uses the six-digit location code as the canonical shelf position', () => {
  const part = {
    locationCode: '021406',
    shelf: 8,
    position: 2,
    layer: 1,
    location: 1
  }
  assert.deepEqual(resolvePartLocation(part), {
    shelf: 2,
    position: '1',
    layer: 4,
    location: 6,
    locationCode: '021406',
    source: 'locationCode'
  })
  assert.equal(partBelongsToShelf(part, 2), true)
  assert.equal(partBelongsToShelf(part, 8), false)
})

test('falls back to discrete location fields when no six-digit code exists', () => {
  assert.deepEqual(resolvePartLocation({ shelf: 10, position: 2, layer: 3, location: 4 }), {
    shelf: 10,
    position: '2',
    layer: 3,
    location: 4,
    locationCode: null,
    source: 'fields'
  })
})

test('matches the supplied room drawing and keeps four physical levels', () => {
  const shelf1 = applyPhysicalShelfLayout({ shelfNo: 1, layoutKey: 'shelf-01', position: {}, size: {} })
  const shelf2 = applyPhysicalShelfLayout({ shelfNo: 2, layoutKey: 'shelf-02', position: {}, size: {} })
  const shelf15 = applyPhysicalShelfLayout({ shelfNo: 15, layoutKey: 'shelf-15', position: {}, size: {} })
  const unnamed = applyPhysicalShelfLayout({ shelfNo: null, layoutKey: 'unnamed-03', position: {}, size: {} })

  assert.deepEqual(shelf1.position, { x: -2.3, z: -7.2, rotationY: 0 })
  assert.deepEqual(shelf2.position, { x: 2.3, z: -7.2, rotationY: 0 })
  assert.deepEqual(shelf15.position, { x: -6.4, z: -7.2, rotationY: 0 })
  assert.deepEqual(unnamed.position, { x: 4.8, z: 9.6, rotationY: 0 })
  assert.equal(shelf1.levels, COMMON_SHELF_LEVELS)
  assert.equal(shelf1.size.width, 4.2)
  assert.equal(shelf15.size.width, 3.6)
  assert.equal(unnamed.size.width, 3.8)
  assert.equal(PHYSICAL_ROOM_HALF_DEPTH, 16)
})

test('keeps shelves 1 and 2 mirrored with a visible gap instead of overlapping', () => {
  const shelf1 = applyPhysicalShelfLayout({ shelfNo: 1, layoutKey: 'shelf-01', position: {}, size: {} })
  const shelf2 = applyPhysicalShelfLayout({ shelfNo: 2, layoutKey: 'shelf-02', position: {}, size: {} })
  const clearGap = Math.abs(shelf2.position.x - shelf1.position.x) - (shelf1.size.width + shelf2.size.width) / 2
  assert.ok(Math.abs(clearGap - 0.4) < 1e-9)
})

test('keeps a wide viewing aisle between front and back shelf rows', () => {
  const firstRow = applyPhysicalShelfLayout({ shelfNo: 1, layoutKey: 'shelf-01', position: {}, size: {} })
  const secondRow = applyPhysicalShelfLayout({ shelfNo: 3, layoutKey: 'shelf-03', position: {}, size: {} })
  assert.ok(Math.abs((secondRow.position.z - firstRow.position.z) - PHYSICAL_ROW_GAP_Z) < 1e-9)
  assert.equal(PHYSICAL_ROW_GAP_Z, 2.4)
})

test('keeps a physical rack in place after an administrator renumbers it', () => {
  const shelf = applyPhysicalShelfLayout({ shelfNo: 21, layoutKey: 'shelf-01', position: { x: 99, z: 99 }, size: {} })
  assert.deepEqual(shelf.position, { x: -2.3, z: -7.2, rotationY: 0 })
})

test('does not apply the raw-grain floor plan to another workshop', () => {
  const shelf = applyPhysicalShelfLayout({ workshopCode: 'qu_making', shelfNo: 1, layoutKey: 'shelf-01', position: { x: 7, z: 8 }, size: { width: 5 } })
  assert.deepEqual(shelf.position, { x: 7, z: 8 })
  assert.equal(shelf.size.width, 5)
  assert.equal(shelf.levels, 4)
})

test('orders shelf slots from south to north', () => {
  const southSlot = slotLocalX(4.2, 6, 1)
  const northSlot = slotLocalX(4.2, 6, 6)
  assert.ok(southSlot < 0)
  assert.ok(northSlot > 0)
  assert.ok(southSlot < northSlot)
})

test('mirrors slot numbering when viewed from the opposite shelf side', () => {
  assert.equal(sideAwareSlotLocalX(4.2, 6, 1, 1), slotLocalX(4.2, 6, 1))
  assert.equal(sideAwareSlotLocalX(4.2, 6, 1, 2), -slotLocalX(4.2, 6, 1))
  assert.equal(sideAwareSlotLocalX(4.2, 6, 6, 2), -slotLocalX(4.2, 6, 6))
})

test('maps side 1 east and side 2 west on the same shelf', () => {
  assert.ok(sideLocalZ(0.9, 1) > 0)
  assert.ok(sideLocalZ(0.9, 2) < 0)
  assert.ok(Math.abs(sideLocalZ(0.9, 1)) < 0.9 / 2)
  assert.ok(Math.abs(sideLocalZ(0.9, 2)) < 0.9 / 2)
})

test('maps layer numbers from the bottom shelf upwards', () => {
  const firstLayer = layerLocalY(3.2, 4, 1)
  const fourthLayer = layerLocalY(3.2, 4, 4)
  assert.ok(firstLayer < fourthLayer)
})

test('uses a precise location card and side-aware camera instead of a sphere ring marker', () => {
  assert.doesNotMatch(warehouseViewSource, /TorusGeometry|SphereGeometry|part-3d-label/)
  assert.match(warehouseViewSource, /part-location-card/)
  assert.match(warehouseViewSource, /addScaledVector\(outward/)
  assert.match(warehouseViewSource, /shelf\.size\.depth \* 0\.5 \+ 4\.2/)
  assert.doesNotMatch(warehouseViewSource, /EdgesGeometry|locationOutline/)
})

test('layer map supports single selection, multi selection and select all filtering', () => {
  assert.match(warehouseViewSource, /@click="toggleLayer\(item\.layer\)"/)
  assert.match(warehouseViewSource, /@click="selectAllLayers"/)
  assert.match(warehouseViewSource, /selectedLayers\.value = \[value\]/)
  assert.match(warehouseViewSource, /selectedLayers\.value\.filter\(item => item !== value\)/)
  assert.match(warehouseViewSource, /selectedLayers\.value\.includes\(Number\(resolvePartLocation\(part\)\.layer\)\)/)
  assert.match(warehouseViewSource, /selectShelf\(shelf, false, false, false\)/)
})

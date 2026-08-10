export const COMMON_SHELF_LEVELS = 4
export const VENDOR_SIGN_COLOR = '#1d4ed8'
export const PHYSICAL_ROOM_HALF_DEPTH = 16
export const PHYSICAL_ROW_GAP_Z = 3.4

const PHYSICAL_SHELF_WIDTH = 4.9
const CENTRAL_LEFT_X = -1.25
const CENTRAL_RIGHT_X = -6.35
const LEFT_COLUMN_X = 6.35
const FIRST_ROW_Z = -10.5
const UNNAMED_ROW_Z = 13.4

export function resolvePartLocation(part = {}) {
  const code = String(part.locationCode || '').trim()
  if (/^\d{6}$/.test(code)) {
    return {
      shelf: Number(code.slice(0, 2)),
      position: code.slice(2, 3),
      layer: Number(code.slice(3, 4)),
      location: Number(code.slice(4, 6)),
      locationCode: code,
      source: 'locationCode'
    }
  }

  return {
    shelf: part.shelf == null || part.shelf === '' ? null : Number(part.shelf),
    position: part.position == null ? '' : String(part.position),
    layer: part.layer == null || part.layer === '' ? null : Number(part.layer),
    location: part.location == null || part.location === '' ? null : Number(part.location),
    locationCode: code || null,
    source: 'fields'
  }
}

export function partBelongsToShelf(part, shelfNo) {
  return Number(resolvePartLocation(part).shelf) === Number(shelfNo)
}

export function slotLocalX(width, slots, slot) {
  const safeWidth = Math.max(Number(width) || 0, 0)
  const safeSlots = Math.max(Number(slots) || 1, 1)
  const safeSlot = Math.min(Math.max(Number(slot) || 1, 1), safeSlots)
  return -safeWidth / 2 + safeWidth * (safeSlot - 0.5) / safeSlots
}

export function sideLocalZ(depth, position, offset = 0.18) {
  const sideDirection = String(position) === '2' ? -1 : 1
  return sideDirection * ((Math.max(Number(depth) || 0, 0) / 2) + offset)
}

export function layerLocalY(height, levels, layer) {
  const safeHeight = Math.max(Number(height) || 0, 0)
  const safeLevels = Math.max(Number(levels) || 1, 1)
  const safeLayer = Math.min(Math.max(Number(layer) || 1, 1), safeLevels)
  return safeHeight - (safeLayer - 0.5) * (safeHeight - 0.25) / safeLevels
}

export function applyPhysicalShelfLayout(shelf) {
  const next = {
    ...shelf,
    position: { ...(shelf.position || {}) },
    size: { ...(shelf.size || {}) }
  }
  const layoutMatch = String(shelf.layoutKey || '').match(/^shelf-(\d{2})$/)
  const physicalShelfNo = layoutMatch ? Number(layoutMatch[1]) : Number(shelf.shelfNo)
  let placement = null

  if (Number.isInteger(physicalShelfNo) && physicalShelfNo >= 1 && physicalShelfNo <= 14) {
    const row = Math.floor((physicalShelfNo - 1) / 2)
    placement = {
      x: physicalShelfNo % 2 === 1 ? CENTRAL_LEFT_X : CENTRAL_RIGHT_X,
      z: FIRST_ROW_Z + row * PHYSICAL_ROW_GAP_Z
    }
  } else if (Number.isInteger(physicalShelfNo) && physicalShelfNo >= 15 && physicalShelfNo <= 20) {
    placement = {
      x: LEFT_COLUMN_X,
      z: FIRST_ROW_Z + (physicalShelfNo - 15) * PHYSICAL_ROW_GAP_Z
    }
  } else {
    const unnamedIndex = {
      'unnamed-01': 0,
      'unnamed-02': 1,
      'unnamed-03': 2
    }[shelf.layoutKey]
    if (unnamedIndex !== undefined) {
      placement = {
        x: [6.35, 1.25, -3.85][unnamedIndex],
        z: UNNAMED_ROW_Z
      }
    }
  }

  if (!placement) return next
  next.position = { ...next.position, ...placement, rotationY: 0 }
  next.size = {
    ...next.size,
    width: PHYSICAL_SHELF_WIDTH,
    depth: Number(next.size.depth) || 0.9,
    height: Number(next.size.height) || 3.2
  }
  next.levels = COMMON_SHELF_LEVELS
  return next
}

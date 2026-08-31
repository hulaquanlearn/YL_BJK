export const COMMON_SHELF_LEVELS = 4
export const VENDOR_SIGN_COLOR = '#1d4ed8'
export const PHYSICAL_ROOM_HALF_WIDTH = 9
export const PHYSICAL_ROOM_HALF_DEPTH = 16
export const PHYSICAL_ROW_GAP_Z = 2.4

// 原粮库按现场平面图固定为：01-14 双列、15-20 单列，北侧三组待命名货架。
// 这里恢复现场确认过的旧版尺寸与坐标；自定义拖拽过的位置仍以数据库为准。
const CENTRAL_SHELF_WIDTH = 4.2
const SINGLE_SHELF_WIDTH = 3.6
const UNNAMED_SHELF_WIDTH = 3.8
const CENTRAL_LEFT_X = -2.3
const CENTRAL_RIGHT_X = 2.3
const SINGLE_COLUMN_X = -6.4
const FIRST_ROW_Z = -7.2
const SINGLE_ROW_Z = [-7.2, -4.8, -2.4, 0.6, 3, 5.4]
const UNNAMED_ROW_Z = 9.6

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

// 两侧货位号都从各自通道观察方向依次递增，因此西侧在 3D 本地坐标中
// 必须镜像，否则同一个“01 货位”会落到货架的错误一端。
export function sideAwareSlotLocalX(width, slots, slot, position) {
  const x = slotLocalX(width, slots, slot)
  return String(position) === '2' ? -x : x
}

export function sideLocalZ(depth, position, offset = 0.18) {
  const sideDirection = String(position) === '2' ? -1 : 1
  const safeDepth = Math.max(Number(depth) || 0, 0)
  const insideOffset = Math.min(safeDepth * 0.28, Math.max(safeDepth / 2 - Math.max(Number(offset) || 0, 0), 0))
  return sideDirection * insideOffset
}

export function layerLocalY(height, levels, layer) {
  const safeHeight = Math.max(Number(height) || 0, 0)
  const safeLevels = Math.max(Number(levels) || 1, 1)
  const safeLayer = Math.min(Math.max(Number(layer) || 1, 1), safeLevels)
  const boardCenter = safeLevels === 1
    ? 0.16
    : 0.16 + (safeHeight - 0.32) * (safeLayer - 1) / (safeLevels - 1)
  return boardCenter + 0.04
}

export function applyPhysicalShelfLayout(shelf, workshopCode = shelf?.workshopCode || 'raw_grain') {
  const next = {
    ...shelf,
    position: { ...(shelf.position || {}) },
    size: { ...(shelf.size || {}) }
  }
  let placement = null
  let physicalWidth = null

  // The measured 01-20 + three unnamed layout belongs to the raw-grain room
  // only. Other workshops keep their database-configured coordinates.
  if (workshopCode === 'raw_grain' && !shelf.positionOverridden) {
    const layoutMatch = String(shelf.layoutKey || '').match(/^shelf-(\d{2})$/)
    const physicalShelfNo = layoutMatch ? Number(layoutMatch[1]) : Number(shelf.shelfNo)

    if (Number.isInteger(physicalShelfNo) && physicalShelfNo >= 1 && physicalShelfNo <= 14) {
      const row = Math.floor((physicalShelfNo - 1) / 2)
      placement = {
        x: physicalShelfNo % 2 === 1 ? CENTRAL_LEFT_X : CENTRAL_RIGHT_X,
        z: FIRST_ROW_Z + row * PHYSICAL_ROW_GAP_Z
      }
      physicalWidth = CENTRAL_SHELF_WIDTH
    } else if (Number.isInteger(physicalShelfNo) && physicalShelfNo >= 15 && physicalShelfNo <= 20) {
      placement = {
        x: SINGLE_COLUMN_X,
        z: SINGLE_ROW_Z[physicalShelfNo - 15]
      }
      physicalWidth = SINGLE_SHELF_WIDTH
    } else {
      const unnamedIndex = {
        'unnamed-01': 0,
        'unnamed-02': 1,
        'unnamed-03': 2
      }[shelf.layoutKey]
      if (unnamedIndex !== undefined) {
        placement = {
          x: [-4.8, 0, 4.8][unnamedIndex],
          z: UNNAMED_ROW_Z
        }
        physicalWidth = UNNAMED_SHELF_WIDTH
      }
    }
  }

  next.size = workshopCode === 'raw_grain'
    ? {
        ...next.size,
        width: !shelf.positionOverridden && physicalWidth ? physicalWidth : (Number(next.size.width) || CENTRAL_SHELF_WIDTH),
        depth: Number(next.size.depth) || 0.9,
        height: Number(next.size.height) || 3.2
      }
    : { ...next.size, width: Number(next.size.width) || 4.1, depth: Number(next.size.depth) || 0.9, height: Number(next.size.height) || 3.2 }
  next.levels = COMMON_SHELF_LEVELS

  if (placement) {
    next.position = { ...next.position, ...placement, rotationY: 0 }
  }

  return next
}

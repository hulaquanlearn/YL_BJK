// Limits belong to each slot, not to a category's source-model units.
export function slotModelBounds({ usableWidth, slots, depth, layerHeight, sideZ }) {
  const slot = Math.max(0.001, Number(usableWidth) / Math.max(1, Number(slots)))
  const shelfDepth = Math.max(0.001, Number(depth))
  const z = Math.abs(Number(sideZ) || 0)
  // Stay within the shelf edge AND the assigned half of a double-sided shelf.
  const sideDepth = Math.max(0.001, Math.min(z * 2, shelfDepth - z * 2))
  return {
    width: slot * 0.78,
    height: Math.max(0.001, Number(layerHeight) - 0.08) * 0.72,
    depth: sideDepth * 0.82
  }
}

export function modelFitScale(size, bounds, preferredScale = 1) {
  const axes = [['x','width'],['y','height'],['z','depth']]
  if (axes.some(([axis,key]) => !Number.isFinite(size[axis]) || size[axis] <= 0 || !Number.isFinite(bounds[key]) || bounds[key] <= 0)) return 0
  const fit = Math.min(...axes.map(([axis,key]) => bounds[key] / size[axis]))
  // 1x uses most of the safe envelope; values above 1 can still enlarge the
  // model until it reaches the envelope. This keeps scale controls meaningful
  // without ever allowing a model to cross its own slot or shelf side.
  const requested = Number(preferredScale)
  const multiplier = Math.max(.1, Number.isFinite(requested) && requested > 0 ? requested : 1)
  return fit * Math.min(1, .78 * multiplier)
}

export function normalizeModelRotation(value) {
  const angle = Number(value)
  if (!Number.isFinite(angle)) return 0
  const fullTurn = Math.PI * 2
  const normalized = ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
  return Math.abs(normalized) < 1e-10 ? 0 : normalized
}

// Category models use +Y as up and +Z as the saved front. The second side of
// a double-sided shelf faces the opposite aisle, so it needs a half turn.
export function modelFacingRotation(frontRotationY = 0, side = '1') {
  return normalizeModelRotation(Number(frontRotationY) + (String(side) === '2' ? Math.PI : 0))
}

// Keep the saved model front facing the initial overview camera in world space.
// Cancel the shelf parent's rotation so every shelf presents the same front.
export function overviewModelRotation(frontRotationY = 0, shelfRotationY = 0) {
  return normalizeModelRotation(Number(frontRotationY) + Math.atan2(-.75, -1.09) - Number(shelfRotationY))
}

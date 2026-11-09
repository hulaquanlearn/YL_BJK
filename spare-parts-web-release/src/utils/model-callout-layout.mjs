const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const finite = value => typeof value === 'number' && Number.isFinite(value)

function chooseVisible(items, capacity, selectedId) {
  if (items.length <= capacity) return items
  if (capacity <= 0) return []
  const selected = items.find(item => item.id === selectedId), chosen = new Set(selected ? [selected] : [])
  for (let slot = 0; chosen.size < capacity && slot < capacity * 2; slot++) chosen.add(items[Math.round(slot * (items.length - 1) / Math.max(1, capacity - 1)) % items.length])
  for (const item of items) { if (chosen.size >= capacity) break; chosen.add(item) }
  return [...chosen].sort((a, b) => a.anchorY - b.anchorY || String(a.id).localeCompare(String(b.id)))
}

function openIntervals(top, bottom, anchors, x, width) {
  const bands = anchors.filter(anchor => anchor.anchorX >= x - 4 && anchor.anchorX <= x + width + 4)
    .map(anchor => [Math.max(top, anchor.anchorY - 6), Math.min(bottom, anchor.anchorY + 6)])
    .filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0])
  const intervals = []; let cursor = top
  for (const [start, end] of bands) { if (start > cursor) intervals.push([cursor, start]); cursor = Math.max(cursor, end) }
  if (cursor < bottom) intervals.push([cursor, bottom])
  return intervals
}

// Ordered assignment keeps labels in the same vertical order as their anchors.
// Candidate positions include both interval edges and each label's nearest position.
function placeVertically(items, intervals, labelHeight, gap, selectedId) {
  const positions = new Set(), step = labelHeight + gap
  for (const [start, end] of intervals) {
    if (end - start < labelHeight) continue
    positions.add(start); positions.add(end - labelHeight)
    for (const item of items) for (let offset = -items.length; offset <= items.length; offset++) positions.add(clamp(item.anchorY - labelHeight / 2 + offset * step, start, end - labelHeight))
  }
  const candidates = [...positions].sort((a, b) => a - b)
  if (!candidates.length) return null
  let previous = candidates.map(y => (y + labelHeight / 2 - items[0].anchorY) ** 2 * (items[0].id === selectedId ? 2 : 1))
  const parents = []
  for (let row = 1; row < items.length; row++) {
    const costs = Array(candidates.length).fill(Infinity), from = Array(candidates.length).fill(-1)
    let cursor = 0, best = Infinity, bestIndex = -1
    for (let index = 0; index < candidates.length; index++) {
      while (cursor < index && candidates[cursor] + step <= candidates[index] + 1e-6) { if (previous[cursor] < best) { best = previous[cursor]; bestIndex = cursor } cursor++ }
      if (bestIndex >= 0) { costs[index] = best + (candidates[index] + labelHeight / 2 - items[row].anchorY) ** 2 * (items[row].id === selectedId ? 2 : 1); from[index] = bestIndex }
    }
    parents[row] = from; previous = costs
  }
  let index = previous.reduce((best, cost, candidate) => cost < previous[best] ? candidate : best, 0)
  if (!Number.isFinite(previous[index])) return null
  const result = Array(items.length)
  for (let row = items.length - 1; row >= 0; row--) { result[row] = candidates[index]; if (row) index = parents[row][index] }
  return result
}

function leadersCross(a, b) {
  const turn = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const points = label => [[label.anchorX, label.anchorY], [label.railX, label.anchorY], [label.endX, label.endY]]
  const first = points(a), second = points(b)
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (turn(first[i], first[i + 1], second[j]) * turn(first[i], first[i + 1], second[j + 1]) < -1e-6 && turn(second[j], second[j + 1], first[i]) * turn(second[j], second[j + 1], first[i + 1]) < -1e-6) return true
  return false
}

export function layoutModelCallouts({ anchors = [], width, height, modelBounds = {}, top = 48, bottom = height - 90, labelWidth = 74, labelHeight = 34, padding = 12, gap = 8, selectedId = '' } = {}) {
  if (!finite(width) || !finite(height) || width < labelWidth + padding * 2 || height < labelHeight + padding * 2) return { labels: [], overflowIds: anchors.map(item => item.id) }
  const centerX = finite(modelBounds.centerX) ? modelBounds.centerX : finite(modelBounds.left) && finite(modelBounds.right) ? (modelBounds.left + modelBounds.right) / 2 : width / 2
  const leftEdge = finite(modelBounds.left) ? modelBounds.left : centerX, rightEdge = finite(modelBounds.right) ? modelBounds.right : centerX
  const safeTop = clamp(top, padding, height - padding - labelHeight), safeBottom = clamp(bottom, safeTop + labelHeight, height - padding)
  const visible = anchors.filter(item => finite(item.anchorX) && finite(item.anchorY) && item.anchorX >= 3 && item.anchorX <= width - 3 && item.anchorY >= 3 && item.anchorY <= height - 3)
  const groups = { left: [], right: [] }
  for (const item of visible) {
    const delta = item.anchorX - centerX
    const right = Math.abs(delta) > 1 ? delta > 0 : width - rightEdge > leftEdge ? true : width - rightEdge < leftEdge ? false : groups.right.length <= groups.left.length
    groups[right ? 'right' : 'left'].push({ ...item, right })
  }
  const labels = []
  for (const right of [false, true]) {
    const all = groups[right ? 'right' : 'left'].sort((a, b) => a.anchorY - b.anchorY || String(a.id).localeCompare(String(b.id)))
    const available = safeBottom - safeTop
    const sideGap = all.length > 1 ? Math.max(4, Math.min(gap, (available - all.length * labelHeight) / (all.length - 1))) : gap
    const capacity = Math.max(0, Math.floor((available + sideGap) / (labelHeight + sideGap)))
    let items = chooseVisible(all, capacity, selectedId)
    if (!items.length) continue
    const x = clamp(right ? Math.max(centerX + 8, rightEdge + 14) : Math.min(centerX - labelWidth - 8, leftEdge - labelWidth - 14), padding, width - padding - labelWidth)
    while (items.length) {
      const yPositions = placeVertically(items, openIntervals(safeTop, safeBottom, items, x, labelWidth), labelHeight, sideGap, selectedId)
      if (!yPositions) { const removable = items.findLast(item => item.id !== selectedId) || items.at(-1); items = items.filter(item => item !== removable); continue }
      const extreme = right ? Math.max(...items.map(item => item.anchorX)) : Math.min(...items.map(item => item.anchorX))
      const outerRoute = right ? extreme > x - 3 : extreme < x + labelWidth + 3
      const railX = outerRoute ? (right ? width - 3 : 3) : right ? Math.max(x - 9, extreme + 2) : Math.min(x + labelWidth + 9, extreme - 2)
      const endX = right ? (outerRoute ? x + labelWidth : x) : (outerRoute ? x : x + labelWidth)
      const placed = items.map((item, index) => {
        const y = yPositions[index], endY = y + labelHeight / 2
        return { ...item, x, y, width: labelWidth, height: labelHeight, railX, endX, endY, path: `M${item.anchorX.toFixed(1)},${item.anchorY.toFixed(1)} H${railX.toFixed(1)} L${endX.toFixed(1)},${endY.toFixed(1)}` }
      })
      let crossing = null
      for (let a = 0; a < placed.length && !crossing; a++) for (let b = a + 1; b < placed.length; b++) if (leadersCross(placed[a], placed[b])) { crossing = [placed[a], placed[b]]; break }
      if (crossing) { const removable = crossing.findLast(item => item.id !== selectedId) || crossing.at(-1); items = items.filter(item => item.id !== removable.id); continue }
      labels.push(...placed); break
    }
  }
  const shown = new Set(labels.map(label => label.id))
  return { labels, overflowIds: anchors.filter(item => !shown.has(item.id)).map(item => item.id) }
}

export function inventoryCountQuantity(value) {
  return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
}
export const inventoryCountItemId = item => String(item?.inventoryId ?? item?.partId ?? '').trim()
export const inventoryQuantitiesDiffer = (snapshot, actual) => Math.abs(Number(snapshot) - Number(actual)) > 1e-9

// Read only this order's frozen values. Current inventory may already reflect approval.
export function inventoryCountSummary(order) {
  const marked = Array.isArray(order?.abnormalList) ? order.abnormalList : []
  const all = Array.isArray(order?.inventoryAllList) && order.inventoryAllList.length ? order.inventoryAllList : marked
  const byId = new Map(marked.map(item => [inventoryCountItemId(item), item]))
  const rows = all.map(row => {
    const abnormal = byId.get(inventoryCountItemId(row))
    const snapshot = inventoryCountQuantity(row.snapshotStock ?? row.sysStockNum)
    const actual = abnormal ? inventoryCountQuantity(abnormal.actualStock) : row.actualStock === undefined ? snapshot : inventoryCountQuantity(row.actualStock)
    const status = snapshot === null || actual === null ? 'unverified' : inventoryQuantitiesDiffer(snapshot, actual) ? 'difference' : 'normal'
    return { row, snapshot, actual, status, unit: row.sysStockUnit || abnormal?.sysStockUnit || '' }
  })
  return { rows, differenceCount: rows.filter(row => row.status === 'difference').length, unverifiedCount: rows.filter(row => row.status === 'unverified').length }
}

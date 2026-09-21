export const INVENTORY_SCOPE_KEYS = ['workshopCode', 'warehouseAreaName', 'partType', 'searchKeyword', 'stockStatus', 'lowStock']
export function inventoryScope(source = {}) {
  return Object.fromEntries(INVENTORY_SCOPE_KEYS.map(key => [key, typeof source[key] === 'string' ? source[key] : '']))
}
export function inventoryRouteQuery(source = {}, extra = {}) {
  return { scope: '1', ...Object.fromEntries(Object.entries({ ...inventoryScope(source), ...extra }).filter(([, value]) => value !== '' && value != null)) }
}

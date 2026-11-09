export const INVENTORY_SCOPE_KEYS = ['workshopCode', 'warehouseAreaName', 'partType', 'searchKeyword', 'stockStatus', 'lowStock']
const WORKSHOPS = new Set(['raw_grain', 'qu_making', 'brewing'])
export function defaultInventoryWorkshop(user = {}) {
  return [user?.workshopCode, user?.staffWorkshopCode, user?.role].find(code => WORKSHOPS.has(code)) || ''
}
export function initialInventoryWorkshop(user, route = {}, saved = {}) {
  const fallback = defaultInventoryWorkshop(user)
  const explicitRoute = route.scope || Object.prototype.hasOwnProperty.call(route, 'workshopCode')
  const selected = explicitRoute ? (route.workshopCode ?? '') : saved?.workshopCode
  return selected === '' || WORKSHOPS.has(selected) ? selected : fallback
}
export function inventoryScope(source = {}) {
  return Object.fromEntries(INVENTORY_SCOPE_KEYS.map(key => [key, typeof source[key] === 'string' ? source[key] : '']))
}
export function inventoryRouteQuery(source = {}, extra = {}) {
  return { scope: '1', ...Object.fromEntries(Object.entries({ ...inventoryScope(source), ...extra }).filter(([, value]) => value !== '' && value != null)) }
}

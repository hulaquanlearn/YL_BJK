const SCHEMA = 1
const MAX_AGE = 8 * 60 * 60 * 1000
const primitive = value => typeof value === 'string' ? value.slice(0, 2000) : typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined
const stable = value => JSON.stringify(Object.fromEntries(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b))))

// Store navigation context only. Rows, stock snapshots, credentials and drafts never enter storage.
export function listViewFingerprint(user = {}) {
  return stable(Object.fromEntries(['id', '_id', 'username', 'role', 'workshopCode', 'staffWorkshopCode', 'staffPosition', 'team', 'position'].map(key => [key, primitive(user?.[key]) ?? ''])))
}
export function createListViewState({ view, user, scope = {}, queryKeys = [], storage, now = Date.now, maxAge = MAX_AGE }) {
  const key = `spare-parts:list-view:${view}:${listViewFingerprint(user)}:${stable(scope)}`
  const store = () => storage || globalThis.sessionStorage
  function clean(input = {}) {
    const query = Object.fromEntries(queryKeys.flatMap(key => primitive(input.query?.[key]) === undefined ? [] : [[key, primitive(input.query[key])]]))
    const selectedIds = [...new Set((Array.isArray(input.selectedIds) ? input.selectedIds : []).filter(id => (typeof id === 'string' && id.length > 0 && id.length <= 100) || (Number.isSafeInteger(id) && id > 0)).map(String))].slice(0, 2000)
    const scrollTop = Number.isFinite(input.scrollTop) ? Math.max(0, Math.min(input.scrollTop, 1000000)) : 0
    return { query, selectedIds, scrollTop }
  }
  return {
    key,
    read() { try { const value = JSON.parse(store().getItem(key) || 'null'); return value?.schema === SCHEMA && Number.isFinite(value.at) && now() - value.at >= 0 && now() - value.at <= maxAge ? clean(value) : null } catch { return null } },
    save(value) { try { store().setItem(key, JSON.stringify({ schema: SCHEMA, at: now(), ...clean(value) })) } catch {} },
    clear() { try { store().removeItem(key) } catch {} }
  }
}
export function selectedRowsFromIds(ids = [], rows = []) {
  const wanted = new Set(ids.map(String))
  return rows.filter(row => wanted.has(String(row._id ?? row.id)))
}
export function boundedPage(value, fallback = 1) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : fallback
}
export function validStockCount(value) {
  return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 99999999
}

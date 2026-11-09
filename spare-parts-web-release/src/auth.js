
const TOKEN_KEY = 'spare_parts_auth_token'
const USER_KEY = 'spare_parts_auth_user'

// localStorage is shared by tabs; the custom event used by mounted views is not.
// Coalesce token/user updates so views read the complete current session.
if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
  let storageTimer
  window.addEventListener('storage',event=>{
    if(event.storageArea&&event.storageArea!==localStorage)return
    if(event.key!==null&&event.key!==TOKEN_KEY&&event.key!==USER_KEY)return
    clearTimeout(storageTimer)
    storageTimer=setTimeout(()=>window.dispatchEvent(new Event('auth-changed')),0)
  })
}

export function getToken() { return localStorage.getItem(TOKEN_KEY) || '' }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
}
function discardFireDrafts(user) {
  const accountId = user?.id || user?._id || user?.username
  if (!accountId) return
  const prefix = `fire-inspection:draft:${encodeURIComponent(String(accountId))}:`
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch { /* Session cancellation must still finish if browser storage fails. */ }
}
export function setSession(token, user) {
  const previous = getUser()
  const accountId = value => String(value?.id || value?._id || value?.username || '')
  if (accountId(previous) !== accountId(user)) discardFireDrafts(previous)
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('auth-changed'))
}
export function clearSession() {
  discardFireDrafts(getUser())
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('auth-changed'))
}
export function isAdmin() { return getUser()?.role === 'admin' }
export function isViewer() { return getUser()?.role === 'viewer' }
export function showControl(_allowed) { const user=getUser(); if(typeof navigator!=='undefined'&&navigator.userAgent.includes('DigitalWorkbenchAndroid/')&&!_allowed)return false;return Boolean(user) && !(user.role==='viewer' && user.staffWorkshopCode==='raw_grain' && user.staffPosition!=='shift_leader') }
export const WORKSHOP_ROLES = Object.freeze({ raw_grain: 'raw_grain', qu_making: 'qu_making', brewing: 'brewing' })
export function userWorkshopCode() { return getUser()?.workshopCode || WORKSHOP_ROLES[getUser()?.role] || '' }
export function canEditWorkshop(workshopCode) {
  const user = getUser()
  return user?.role === 'admin' || (Boolean(WORKSHOP_ROLES[user?.role]) && WORKSHOP_ROLES[user.role] === workshopCode)
}
export function canEditAnyWorkshop() { return getUser()?.role === 'admin' || Boolean(WORKSHOP_ROLES[getUser()?.role]) }

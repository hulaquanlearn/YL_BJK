const TOKEN_KEY = 'spare_parts_auth_token'
const USER_KEY = 'spare_parts_auth_user'

export function getToken() { return localStorage.getItem(TOKEN_KEY) || '' }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('auth-changed'))
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('auth-changed'))
}
export function isAdmin() { return getUser()?.role === 'admin' }
export const WORKSHOP_ROLES = Object.freeze({ raw_grain: 'raw_grain', qu_making: 'qu_making', brewing: 'brewing' })
export function userWorkshopCode() { return getUser()?.workshopCode || WORKSHOP_ROLES[getUser()?.role] || '' }
export function canEditWorkshop(workshopCode) {
  const user = getUser()
  return user?.role === 'admin' || (userWorkshopCode() && userWorkshopCode() === workshopCode)
}
export function canEditAnyWorkshop() { return getUser()?.role === 'admin' || Boolean(userWorkshopCode()) }

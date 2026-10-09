export const PERMISSION_MESSAGE = '当前账号没有此操作权限；车间管理员仅能修改所属车间的数据。'
export function canSubmitInventoryRequest(method, url, workshopCode) {
  return String(method || '').toUpperCase() === 'POST'
    && String(url || '').split('?')[0] === '/inventory-orders'
    && Boolean(workshopCode)
}
export function isBusinessWrite(method, url) {
  if (['GET','HEAD','OPTIONS'].includes(String(method || 'GET').toUpperCase())) return false
  const pathname=String(url || '').split('?')[0]
  return !(['/auth/login','/auth/logout','/auth/change-password','/ai/chat'].includes(pathname)
    || /^\/plc\/projects\/\d+\/analyze$/.test(pathname))
}

// Keep controls discoverable while stopping mouse, keyboard-generated clicks,
// upload pickers and nested component handlers before they change the UI.
export function createWritePermissionDirective(isReadOnly, notify) {
  const listeners = new WeakMap()
  return {
    mounted(element, binding = {}) {
      element.__writeAllowed = binding.value
      const block = event => {
        if (!isReadOnly() && element.__writeAllowed !== false) return
        if (event.type === 'keydown' && !['Enter', ' ', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        event.stopImmediatePropagation()
        notify(PERMISSION_MESSAGE)
      }
      element.addEventListener('click', block, { capture: true })
      element.addEventListener('drop', block, { capture: true })
      element.addEventListener('keydown', block, { capture: true })
      element.addEventListener('beforeinput', block, { capture: true })
      element.setAttribute('data-write-action', '')
      listeners.set(element, block)
    },
    updated(element, binding = {}) { element.__writeAllowed = binding.value },
    unmounted(element) {
      element.removeEventListener('click', listeners.get(element), { capture: true })
      element.removeEventListener('drop', listeners.get(element), { capture: true })
      element.removeEventListener('keydown', listeners.get(element), { capture: true })
      element.removeEventListener('beforeinput', listeners.get(element), { capture: true })
      listeners.delete(element)
    }
  }
}

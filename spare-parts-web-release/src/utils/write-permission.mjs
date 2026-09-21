export const PERMISSION_MESSAGE = '权限不足：车间人员仅可查看，不能新增、修改、删除或提交业务数据。'
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
    mounted(element) {
      const block = event => {
        if (!isReadOnly()) return
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
    unmounted(element) {
      element.removeEventListener('click', listeners.get(element), { capture: true })
      element.removeEventListener('drop', listeners.get(element), { capture: true })
      element.removeEventListener('keydown', listeners.get(element), { capture: true })
      element.removeEventListener('beforeinput', listeners.get(element), { capture: true })
      listeners.delete(element)
    }
  }
}

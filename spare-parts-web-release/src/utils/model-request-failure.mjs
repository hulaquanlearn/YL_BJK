function safeText(value, limit = 220) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value)
    .replace(/\bBearer\s+[^\s,;"'<>}]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|authorization|password|secret)\s*[=:]\s*[^\s,;"'<>}]+/gi, '$1=[redacted]')
    .slice(0, limit)
}

// Log only a fixed diagnostic allowlist. Never serialize Axios config, headers,
// response bodies or a session token while investigating a failed list read.
export function modelRequestFailure(error, { scope, label, phase = 'request', logger = console.warn } = {}) {
  const response = error?.response
  const diagnostic = {
    scope: safeText(`${scope}:${phase}`, 70),
    name: safeText(error?.name, 60),
    code: safeText(error?.code, 60),
    message: safeText(error?.message),
    status: Number.isInteger(response?.status) ? response.status : null,
    dataType: response == null ? 'none' : response.data === null ? 'null' : Array.isArray(response.data) ? 'array' : typeof response.data
  }
  logger('[model-library-read]', diagnostic)
  const serverMessage = safeText(response?.data?.msg)
  if (serverMessage) return serverMessage
  if (phase === 'data') return `${label}返回数据处理失败，请重新加载`
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return `${label}读取超时，请检查网络后重新加载`
  if (error?.code === 'ERR_NETWORK' || error?.name === 'NetworkError') return `${label}网络连接失败，请检查网络后重新加载`
  if (response?.status === 401) return '登录已失效，请重新登录'
  if (response?.status === 403) return `${label}读取权限不足，请联系管理员`
  return `${label}读取失败，请重新加载`
}

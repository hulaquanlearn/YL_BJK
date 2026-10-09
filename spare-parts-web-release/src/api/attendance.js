import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getToken, clearSession } from '../auth'

export const office = axios.create({ baseURL: '/api', timeout: 180000 })
office.interceptors.request.use(config => { config.headers.Authorization = `Bearer ${getToken()}`; return config })
office.interceptors.response.use(response => response.data, async error => {
  if (error.response?.data instanceof Blob) { try { error.response.data = JSON.parse(await error.response.data.text()) } catch {} }
  if (error.response?.status === 401) { clearSession(); location.assign('/login') }
  // Import validation errors are shown with row/column details in the page.
  if (!error.config?.validationRequest) ElMessage.error(error.response?.data?.msg || '操作失败，请稍后重试')
  return Promise.reject(error)
})

export async function downloadAttendanceSource(reportId, kind, name) {
  const blob = await office.get(`/attendance/reports/${reportId}/sources/${kind}/download`, { responseType: 'blob' })
  saveBlob(blob, name)
}
export function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = href; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

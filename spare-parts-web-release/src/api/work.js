import axios from 'axios'
import { getToken, clearSession } from '../auth'
import { ElMessage } from 'element-plus'
// This workflow has its own owner/manager policy; inventory's write guard remains intact.
export const work = axios.create({ baseURL: '/api/work', timeout: 60000 })
work.interceptors.request.use(c => { c.headers.Authorization = `Bearer ${getToken()}`; return c })
work.interceptors.response.use(r => r.data, async e => {
  if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()) } catch {} }
  ElMessage.error(e.response?.data?.msg || '操作失败，请检查网络后重试')
  if (e.response?.status === 401) { clearSession(); location.assign('/login') }
  return Promise.reject(e)
})

import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getToken, clearSession } from '../auth'
import { clientPlatform } from '../utils/client-platform.mjs'
// Independent business policy: ordinary staff may fill their own weekly duties.
export const rawDuty = axios.create({ baseURL: '/api/raw-duties', timeout: 120000, headers: {'X-Client-Platform':clientPlatform()} })
rawDuty.interceptors.request.use(c => { c.headers.Authorization = `Bearer ${getToken()}`; c.headers['X-Client-Platform'] = clientPlatform(); return c })
rawDuty.interceptors.response.use(r => r.data, async e => {
  if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()) } catch {} }
  ElMessage.error(e.response?.data?.msg || e.message || '操作失败，请重试')
  if (e.response?.status === 401) { clearSession(); location.assign('/login') }
  return Promise.reject(e)
})

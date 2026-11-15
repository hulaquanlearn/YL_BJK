import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getToken, clearSession } from '../auth'
import { clientPlatform } from '../utils/client-platform.mjs'
// Independent business policy: ordinary staff may fill their own weekly duties.
export const rawDuty = axios.create({ baseURL: '/api/raw-duties', timeout: 120000, headers: {'X-Client-Platform':clientPlatform()} })
const currentRequestSession=config=>!config||!Object.prototype.hasOwnProperty.call(config,'_sessionToken')||config._sessionToken===getToken()
const staleSessionError=config=>new axios.CanceledError('请求所属登录会话已结束',config)
rawDuty.interceptors.request.use(c => { c._sessionToken=getToken(); c.headers.Authorization = `Bearer ${c._sessionToken}`; c.headers['X-Client-Platform'] = clientPlatform(); return c })
rawDuty.interceptors.response.use(r => {if(!currentRequestSession(r.config))throw staleSessionError(r.config);return r.data}, async e => {
  if(axios.isCancel(e))return Promise.reject(e)
  if(!currentRequestSession(e.config))return Promise.reject(staleSessionError(e.config))
  if (typeof Blob!=='undefined' && e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()) } catch {} }
  if(!currentRequestSession(e.config))return Promise.reject(staleSessionError(e.config))
  ElMessage.error(e.response?.data?.msg || e.message || '操作失败，请重试')
  if (e.response?.status === 401) { clearSession(); location.assign('/login') }
  return Promise.reject(e)
})

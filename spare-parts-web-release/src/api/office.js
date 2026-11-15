import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getToken, clearSession } from '../auth'

export const office = axios.create({ baseURL: '/api', timeout: 180000 })
const currentRequestSession=config=>!config||!Object.prototype.hasOwnProperty.call(config,'_sessionToken')||config._sessionToken===getToken()
const staleSessionError=config=>new axios.CanceledError('请求所属登录会话已结束',config)
office.interceptors.request.use(config => { config._sessionToken=getToken(); config.headers.Authorization = `Bearer ${config._sessionToken}`; return config })
office.interceptors.response.use(response => {if(!currentRequestSession(response.config))throw staleSessionError(response.config);return response.data}, async error => {
  if(axios.isCancel(error))return Promise.reject(error)
  if(!currentRequestSession(error.config))return Promise.reject(staleSessionError(error.config))
  if (typeof Blob!=='undefined' && error.response?.data instanceof Blob) { try { error.response.data = JSON.parse(await error.response.data.text()) } catch {} }
  if(!currentRequestSession(error.config))return Promise.reject(staleSessionError(error.config))
  if (error.response?.status === 401) { clearSession(); location.assign('/login') }
  // Import validation errors are shown with row/column details in the page.
  if (!error.config?.validationRequest) ElMessage.error(error.response?.data?.msg || '操作失败，请稍后重试')
  return Promise.reject(error)
})

export function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = href; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

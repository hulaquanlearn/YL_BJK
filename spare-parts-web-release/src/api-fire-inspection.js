import axios from 'axios'
import { clearSession, getToken } from './auth'
import { clientPlatform } from './utils/client-platform.mjs'

const client = axios.create({ baseURL: '/api/fire-inspection', timeout: 60000 })
client.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Client-Platform'] = clientPlatform()
  if(config.url==='/photo-recognitions')config.headers['X-AI-Channel']='deepseek'
  return config
})
client.interceptors.response.use(response => {
  if (response.config.responseType === 'blob') return response.data
  if (response.data?.success !== true) throw new Error(response.data?.msg || '消防服务返回异常，请重试')
  return response.data.data
}, async error => {
  let data = error.response?.data
  if (data instanceof Blob) { try { data = JSON.parse(await data.text()) } catch { /* Keep the original error. */ } }
  if (error.response?.status === 401) {
    clearSession()
    if (window.location.pathname !== '/login') window.location.assign('/login')
  }
  const result = new Error(data?.msg || error.message || '请求失败，请重试')
  result.status = error.response?.status
  throw result
})

export const fireApi = {
  bootstrap: () => client.get('/bootstrap'),
  dashboard: params => client.get('/dashboard', {params}),
  records: params => client.get('/records', {params}),
  issues: params => client.get('/issues', {params}),
  points: params => client.get('/points', { params }),
  point: (id, cycleId, assetId) => client.get(`/points/${encodeURIComponent(id)}`, { params: { cycleId, assetId:assetId||undefined } }),
  recognize: (photo, data) => { const body=new FormData(); for(const view of Array.isArray(photo)?photo:[photo])body.append('photo',view); for(const [key,value] of Object.entries(data||{}))if(value!==undefined&&value!==null&&value!=='')body.append(key,String(value)); return client.post('/photo-recognitions',body,{timeout:180000}) },
  area: data => client.post('/areas', data),
  savePoint: (id, data) => id ? client.put(`/points/${encodeURIComponent(id)}`, data) : client.post('/points', data),
  member: (id, data) => client.put(`/members/${encodeURIComponent(id)}`, data),
  issue: (id, data) => client.put(`/issues/${encodeURIComponent(id)}`, data),
  export: params => client.get('/records/export', { params, responseType: 'blob' }),
  preview: file => { const body = new FormData(); body.append('file', file); return client.post('/import/preview', body, { timeout: 180000 }) },
  importPreview: id => client.get(`/import/${encodeURIComponent(id)}`),
  commit: data => client.post('/import/commit', data, { timeout: 180000 }),
  photo: (pointId, file, assetId) => { const body = new FormData(); body.append('pointId', pointId); if(assetId)body.append('assetId',assetId); body.append('file', file); return client.post('/photos', body, { timeout: 120000 }) },
  discardPhoto: id => client.post(`/photos/${encodeURIComponent(id)}/discard`),
  photoBlob: url => {
    const target = new URL(url, window.location.origin)
    if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/fire-inspection/photos/')) return Promise.reject(new Error('照片地址无效'))
    return client.get(target.pathname.replace('/api/fire-inspection', '') + target.search, { responseType: 'blob' })
  }
}

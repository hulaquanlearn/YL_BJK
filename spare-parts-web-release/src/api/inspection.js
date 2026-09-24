import axios from 'axios'
import { getToken, clearSession } from '../auth'
import { ElMessage } from 'element-plus'

export const inspection = axios.create({ baseURL:'/api/inspection-notices',timeout:210000 })
inspection.interceptors.request.use(config=>{config.headers.Authorization=`Bearer ${getToken()}`;return config})
inspection.interceptors.response.use(response=>response.config.responseType==='blob'?response:response.data,async error=>{
  if(error.response?.data instanceof Blob){try{error.response.data=JSON.parse(await error.response.data.text())}catch{}}
  ElMessage.error(error.response?.data?.msg||'请求失败，请检查网络后重试')
  if(error.response?.status===401){clearSession();location.assign('/login')}
  return Promise.reject(error)
})

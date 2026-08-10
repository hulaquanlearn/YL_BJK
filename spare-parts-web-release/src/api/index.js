import axios from 'axios'
import { ElMessage } from 'element-plus'
import { clearSession, getToken } from '../auth'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

http.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  response => response.data,
  error => {
    const message = error.response?.data?.msg || error.message || '请求失败，请稍后重试'
    ElMessage.error(message)
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      clearSession()
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    return Promise.reject(error)
  }
)

export const getHealth = () => http.get('/health')
export const login = data => http.post('/auth/login', data)
export const getMe = () => http.get('/auth/me')
export const logout = () => http.post('/auth/logout')
export const changePassword = data => http.post('/auth/change-password', data)
export const getUsers = () => http.get('/users')
export const createUser = data => http.post('/users', data)
export const updateUser = (id, data) => http.patch(`/users/${id}`, data)
export const resetUserPassword = (id, password) => http.post(`/users/${id}/reset-password`, { password })
export const getParts = params => http.get('/parts', { params })
export const getPart = id => http.get(`/parts/${id}`)
export const getFilters = () => http.get('/filters')
export const getDashboard = () => http.get('/dashboard')
export const getStats = params => http.get('/stats', { params })
export const updateStock = (id, data) => http.post(`/parts/${id}/stock`, data)
export const getPartMovements = (id, params) => http.get(`/parts/${id}/movements`, { params })
export const getStockMovements = params => http.get('/stock-movements', { params })
export const getReplenishment = params => http.get('/replenishment', { params })
export const getDataQuality = params => http.get('/data-quality', { params })
export const updatePartConfig = (id, data) => http.patch(`/parts/${id}/config`, data)
export const getMovementReasons = () => http.get('/movement-reasons')
export const batchUpdateStock = data => http.post('/stock-movements/batch', data)
export const getSuppliers = () => http.get('/suppliers')
export const createSupplier = data => http.post('/suppliers', data)
export const getProcurementOrders = params => http.get('/procurement-orders', { params })
export const getProcurementOrder = id => http.get(`/procurement-orders/${id}`)
export const createProcurementOrder = data => http.post('/procurement-orders', data)
export const receiveProcurementOrder = (id, data) => http.post(`/procurement-orders/${id}/receive`, data)
export const updateProcurementOrderStatus = (id, data) => http.patch(`/procurement-orders/${id}/status`, data)
export const getEquipment = () => http.get('/equipment')
export const getEquipmentDetail = id => http.get(`/equipment/${id}`)
export const createEquipment = data => http.post('/equipment', data)
export const linkEquipmentPart = (id, data) => http.post(`/equipment/${id}/parts`, data)
export const createMaintenanceWorkOrder = (id, data) => http.post(`/equipment/${id}/work-orders`, data)
export const updateMaintenanceWorkOrderStatus = (id, data) => http.patch(`/work-orders/${id}/status`, data)
export const getWarehouseLayout = () => http.get('/warehouse-layout')
export const updateWarehouseShelf = (id, data) => http.put(`/warehouse-layout/shelves/${id}`, data)

export const getInventoryOrders = params => http.get('/inventory-orders', { params })
export const getInventoryOrder = id => http.get(`/inventory-orders/${id}`)
export const createInventoryOrder = data => http.post('/inventory-orders', data)
export const approveInventoryOrder = (id, data) => http.post(`/inventory-orders/${id}/approve`, data)

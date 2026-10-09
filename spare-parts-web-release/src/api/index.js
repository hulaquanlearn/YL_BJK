import axios from 'axios'
import { ElMessage } from 'element-plus'
import { clearSession, getToken, isViewer, userWorkshopCode } from '../auth'
import { canSubmitInventoryRequest, isBusinessWrite, PERMISSION_MESSAGE } from '../utils/write-permission.mjs'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
})

http.interceptors.request.use(config => {
  if (isViewer() && isBusinessWrite(config.method, config.url)
    && !canSubmitInventoryRequest(config.method, config.url, userWorkshopCode())) {
    const error = new Error(PERMISSION_MESSAGE)
    error.response = { status:403, data:{ msg:PERMISSION_MESSAGE } }
    return Promise.reject(error)
  }
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // 浏览器必须自行生成 multipart boundary。手动保留 application/json 或
  // multipart/form-data 都可能让 Multer 收不到文件，最终 req.files 为空。
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers?.delete?.('Content-Type')
    config.headers?.delete?.('content-type')
    delete config.headers['Content-Type']
    delete config.headers['content-type']
  }
  return config
})

http.interceptors.response.use(
  response => response.config.returnResponse ? { blob: response.data, headers: response.headers } : response.data,
  async error => {
    if (typeof Blob !== 'undefined' && error.response?.data instanceof Blob) {
      try { error.response.data = JSON.parse(await error.response.data.text()) } catch { /* not a JSON error */ }
    }
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
export const getParts = params => http.get('/parts', { params })
export const exportParts = params => http.get('/parts/export', { params, responseType: 'blob' })
export const getPart = id => http.get(`/parts/${id}`)
export const createPart = data => http.post('/parts', data)
export const updatePart = (id, data) => http.patch(`/parts/${id}`, data)
export const deletePart = id => http.delete(`/parts/${id}`)
export const batchDeleteParts = (ids, dryRun = false) => http.post('/parts/batch-delete', { ids, dryRun })
export const importParts = (data, onUploadProgress) => http.post('/parts/import', data, { timeout: 180000, onUploadProgress })
export const previewPartsImport = data => http.post('/parts/import-preview', data, { timeout: 180000 })
export const downloadPartsImportTemplate = workshopCode => http.get('/parts/import-template', { params: { workshopCode }, responseType: 'blob' })
export const downloadPartsImportErrorReport = data => http.post('/parts/import-error-report', data, { timeout: 180000, responseType: 'blob' })
export const getFilters = params => http.get('/filters', { params })
export const getWarehouseAreas = workshopCode => http.get('/warehouse-areas', { params: { workshopCode } })
export const createWarehouseArea = data => http.post('/warehouse-areas', data)
export const getDashboard = params => http.get('/dashboard', { params })
export const getStats = params => http.get('/stats', { params })
export const updateStock = (id, data) => http.post(`/parts/${id}/stock`, data)
export const getPartMovements = (id, params) => http.get(`/parts/${id}/movements`, { params })
export const getStockMovements = params => http.get('/stock-movements', { params })
export const getReplenishment = params => http.get('/replenishment', { params })
export const getDataQuality = params => http.get('/data-quality', { params })
export const updatePartConfig = (id, data) => http.patch(`/parts/${id}/config`, data)
export const getMovementReasons = () => http.get('/movement-reasons')
export const batchUpdateStock = data => http.post('/stock-movements/batch', data)
export const getEquipment = params => http.get('/equipment', { params })
export const getEquipmentDetail = id => http.get(`/equipment/${id}`)
export const createEquipment = data => http.post('/equipment', data)
export const updateEquipment = (id, data) => http.patch(`/equipment/${id}`, data)
export const updateEquipmentPart = (id, relationId, data) => http.patch(`/equipment/${id}/parts/${relationId}`, data)
export const previewEquipmentImport = data => http.post('/equipment/import-preview', data, { timeout: 180000 })
export const importEquipment = data => http.post('/equipment/import', data, { timeout: 180000 })
export const downloadEquipmentImportTemplate = () => http.get('/equipment/import-template', { responseType: 'blob' })
export const downloadEquipmentImportErrorReport = data => http.post('/equipment/import-error-report', data, { timeout: 180000, responseType: 'blob' })
export const linkEquipmentPart = (id, data) => http.post(`/equipment/${id}/parts`, data)
export const unlinkEquipmentPart = (id, relationId) => http.delete(`/equipment/${id}/parts/${relationId}`)
export const getWarehouseLayout = params => http.get('/warehouse-layout', { params })
export const createWarehouseShelf = data => http.post('/warehouse-layout/shelves', data)
export const updateWarehouseShelf = (id, data) => http.put(`/warehouse-layout/shelves/${id}`, data)
export const updateShelfPosition = (id, data) => http.put(`/warehouse-layout/shelves/${id}/position`, data)
export const resetShelfPosition = id => http.put(`/warehouse-layout/shelves/${id}/reset-position`)
export const updateShelfDimensions = (id, data) => http.patch(`/warehouse-layout/shelves/${id}/dimensions`, data)
export const deleteWarehouseShelf = id => http.delete(`/warehouse-layout/shelves/${id}`)
export const getKnowledgeStats = params => http.get('/knowledge/stats', { params })
export const getKnowledgeEntries = params => http.get('/knowledge', { params })
export const getKnowledgeEntry = id => http.get(`/knowledge/${id}`)
export const createKnowledgeEntry = (data, onUploadProgress) => http.post('/knowledge', data, { timeout: 1800000, onUploadProgress })
export const downloadKnowledgeFile = id => http.get(`/knowledge/${id}/download`, { responseType: 'blob', timeout: 1800000 })
export const previewKnowledgeFile = id => http.get(`/knowledge/${id}/preview`, { responseType: 'blob', timeout: 1800000 })
export const previewKnowledgeFileResponse = id => http.get(`/knowledge/${id}/preview`, { responseType: 'blob', timeout: 1800000, returnResponse: true })
export const updateKnowledgeEntry = (id, data) => http.put(`/knowledge/${id}`, data, { timeout: 1800000 })
export const getKnowledgeRevisions = id => http.get(`/knowledge/${id}/revisions`)
export const getKnowledgeRevision = (id, revisionNo) => http.get(`/knowledge/${id}/revisions/${revisionNo}`)
export const restoreKnowledgeRevision = (id, revisionNo) => http.post(`/knowledge/${id}/revisions/${revisionNo}/restore`)
export const reindexKnowledgeEntry = id => http.post(`/knowledge/${id}/reindex`, {}, { timeout: 300000 })
export const deleteKnowledgeEntry = id => http.delete(`/knowledge/${id}`)
export const chatKnowledgeAssistant = messages => http.post('/ai/chat', { messages }, { timeout: 180000 })
export const getKnowledgeProcessStages = (includeDisabled, workshopCode) => http.get('/knowledge/process-stages', { params: { includeDisabled: includeDisabled ? 1 : 0, workshopCode } })
export const createKnowledgeProcessStage = data => http.post('/knowledge/process-stages', data)
export const updateKnowledgeProcessStage = (id, data) => http.patch(`/knowledge/process-stages/${id}`, data)
export const deleteKnowledgeProcessStage = id => http.delete(`/knowledge/process-stages/${id}`)
export const saveKnowledgeProcessStages = data => http.put('/knowledge/process-stages', data)
export const getKnowledgeTags = (includeDisabled, workshopCode) => http.get('/knowledge/tags', { params: { includeDisabled: includeDisabled ? 1 : 0, workshopCode } })
export const createKnowledgeTag = data => http.post('/knowledge/tags', data)
export const deleteKnowledgeTag = id => http.delete(`/knowledge/tags/${id}`)
export const getPlcStats = () => http.get('/plc/stats')
export const getPlcProjects = params => http.get('/plc/projects', { params })
export const getPlcProject = id => http.get(`/plc/projects/${id}`)
export const createPlcProject = data => http.post('/plc/projects', data, { timeout: 180000 })
export const getPlcItems = (id, params) => http.get(`/plc/projects/${id}/items`, { params })
export const getPlcItem = (id, itemId) => http.get(`/plc/projects/${id}/items/${itemId}`)
export const getPlcGraph = id => http.get(`/plc/projects/${id}/graph`)
export const getPlcReferences = (id, params) => http.get(`/plc/projects/${id}/references`, { params })
export const analyzePlcProject = (id, data) => http.post(`/plc/projects/${id}/analyze`, data, { timeout: 180000 })
export const deletePlcProject = id => http.delete(`/plc/projects/${id}`)

export const getInventoryOrders = params => http.get('/inventory-orders', { params })
export const getInventoryOrder = id => http.get(`/inventory-orders/${id}`)
export const createInventoryOrder = data => http.post('/inventory-orders', data)
export const approveInventoryOrder = (id, data) => http.post(`/inventory-orders/${id}/approve`, data)

export const getPartModelLibrary = params => http.get('/part-model-library', { params })
export const uploadPartImage = (partId, formData) => http.post(`/parts/${partId}/image`, formData, { timeout: 60000 })
export const deletePartImage = partId => http.delete(`/parts/${partId}/image`)
export const batchUpdatePartImages = updates => http.post('/parts/batch-images', { updates })
export const batchAssignPartCategoryModel = data => http.post('/parts/batch-model', { partIds: data.partIds, modelId: data.categoryModelId })
export const previewPartCategoryMatches = partIds => http.post('/part-category-model-matches/preview', { partIds })
export const applyPartCategoryMatches = items => http.post('/part-category-model-matches/apply', { items })
export const getPartCategoryModels = params => http.get('/part-models', { params })
export const createPartCategoryModel = formData => http.post('/part-models', formData, { timeout: 180000 })
export const updatePartCategoryModel = (id, formData) => http.put(`/part-models/${id}`, formData, { timeout: 180000 })
export const deletePartCategoryModel = id => http.delete(`/part-models/${id}`)
export const previewModelBindings = data => http.post('/parts/model-bindings/preview', data, { timeout: 120000 })
export const importModelBindings = data => http.post('/parts/model-bindings/import', data, { timeout: 120000 })
export const getStagingPoints = params => http.get('/staging-points', { params })
export const createStagingPoint = data => http.post('/staging-points', data)
export const updateStagingPoint = (id, data) => http.put(`/staging-points/${id}`, data)
export const deleteStagingPoint = id => http.delete(`/staging-points/${id}`)

export const downloadModelBindingsTemplate = () => http.get('/parts/model-bindings/template', { responseType: 'blob' })

const config = require('../config.js');
const auth = require('./auth.js');

function buildQuery(params = {}) {
  const query = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `?${query}` : '';
}

function request(path, options = {}) {
  const method = options.method || 'GET';
  const endpoint = path.split('?')[0];
  if (auth.isRawEmployee() && !endpoint.startsWith('/auth/') && endpoint !== '/health'
    && !(['GET','HEAD'].includes(method.toUpperCase()) && /^(?:\/parts(?:\/\d+)?|\/filters|\/dashboard|\/warehouse-areas|\/warehouse-layout|\/staging-points|\/part-models|\/part-model-library)$/.test(endpoint))) {
    return Promise.reject(Object.assign(new Error('原粮车间员工仅可查看备件'), {statusCode:403}));
  }
  if (auth.isViewer() && !['GET','HEAD','OPTIONS'].includes(method.toUpperCase())
    && !['/auth/login','/auth/logout','/auth/change-password','/auth/profile','/ai/chat',
      ...(auth.canSubmitInventory() ? ['/inventory-orders'] : [])].includes(path.split('?')[0])) {
    const error=new Error('权限不足：车间人员可提交所属车间盘点单，但不能修改备件或审批');
    error.statusCode=403;
    return Promise.reject(error);
  }
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), 'X-Client-Platform':'miniprogram' };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!options.public && !token) {
    auth.goLogin();
    return Promise.reject(new Error('请先登录'));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method,
      data: options.data,
      header: headers,
      timeout: options.timeout || config.requestTimeout,
      success(res) {
        const body = res.data;
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          reject(new Error('服务器返回格式异常，请稍后重试'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body.success !== false) {
          resolve(body);
          return;
        }
        const error = new Error(body.msg || `请求失败（${res.statusCode}）`);
        error.statusCode = res.statusCode;
        error.details = body.details;
        if (res.statusCode === 401 && !options.public) auth.goLogin();
        reject(error);
      },
      fail(error) {
        const message = error?.errMsg?.includes('timeout')
          ? '服务器响应超时'
          : '无法连接备件服务器';
        reject(new Error(message));
      }
    });
  });
}

module.exports = {
  health: () => request('/health', { public: true }),
  login: data => request('/auth/login', { method: 'POST', data, public: true }),
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: data => request('/auth/change-password', { method: 'POST', data }),
  getUsers: () => request('/users'),
  createUser: data => request('/users', { method: 'POST', data }),
  updateUser: (id, data) => request(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', data }),
  resetUserPassword: (id, password) => request(`/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', data: { password } }),
  getDashboard: () => request('/dashboard'),
  getStats: () => request('/stats'),
  getFilters: params => request(`/filters${buildQuery(params)}`),
  getParts: params => request(`/parts${buildQuery(params)}`),
  getPart: id => request(`/parts/${encodeURIComponent(id)}`),
  addPart: data => request('/parts', { method: 'POST', data }),
  getPartModels: () => request('/part-models'),
  bindPartModel: (partId, modelId) => request('/parts/batch-model', { method: 'POST', data: { partIds: [partId], modelId } }),
  deletePart: id => request(`/parts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  updateStock: (id, data) => request(`/parts/${encodeURIComponent(id)}/stock`, { method: 'POST', data }),
  getInventoryOrders: params => request(`/inventory-orders${buildQuery(params)}`),
  getInventoryOrder: id => request(`/inventory-orders/${encodeURIComponent(id)}`),
  createInventoryOrder: data => request('/inventory-orders', { method: 'POST', data }),
  approveInventoryOrder: (id, data) => request(`/inventory-orders/${encodeURIComponent(id)}/approve`, { method: 'POST', data }),
  chat: messages => request('/ai/chat', {
    method: 'POST',
    data: { messages },
    timeout: config.aiRequestTimeout
  })
};

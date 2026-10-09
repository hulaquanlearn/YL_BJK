const { ApiError } = require('./utils');

const WORKSHOPS = Object.freeze([
  { code: 'raw_grain', name: '原粮车间', role: 'raw_grain' },
  { code: 'qu_making', name: '制曲车间', role: 'qu_making' },
  { code: 'brewing', name: '酿酒车间', role: 'brewing' }
]);

const WORKSHOP_CODES = new Set(WORKSHOPS.map(item => item.code));
const EDIT_ROLES = new Set(['admin', 'raw_grain', 'qu_making', 'brewing']);
const ROLE_LABELS = Object.freeze({admin:'系统管理员',raw_grain:'原粮车间管理员',qu_making:'制曲车间管理员',brewing:'酿酒车间管理员',viewer:'车间人员（班长 / 组长，备件只读）'});

function enforceReadOnly(req, _res, next) {
  if (['GET','HEAD','OPTIONS'].includes(req.method) || EDIT_ROLES.has(req.user?.role)) return next();
  if (req.method === 'POST' && req.path === '/inventory-orders' && req.user?.role === 'viewer'
    && WORKSHOP_CODES.has(req.user.workshopCode)) return next();
  // Questions produce answers and internal usage records, not business changes.
  if (req.method === 'POST' && (req.path === '/ai/chat' || /^\/plc\/projects\/\d+\/analyze$/.test(req.path))) return next();
  next(new ApiError(403, '权限不足：车间人员可提交所属车间盘点单，但不能修改备件或审批'));
}

function inventoryOrderScope(user, requestedWorkshopCode = '') {
  if (user?.role === 'admin') return requestedWorkshopCode ? normalizeWorkshopCode(requestedWorkshopCode) : '';
  const assigned = workshopForRole(user?.role)
    || (user?.role === 'viewer' ? normalizeWorkshopCode(user.workshopCode) : '');
  if (!assigned) throw new ApiError(403, '当前账号未分配车间，无法查看或提交盘点单');
  if (requestedWorkshopCode && normalizeWorkshopCode(requestedWorkshopCode) !== assigned) {
    throw new ApiError(403, '只能查看所属车间的盘点单');
  }
  return assigned;
}

function assertInventoryOrderSubmit(user, workshopCode) {
  const assigned = inventoryOrderScope(user);
  if (assigned && assigned !== normalizeWorkshopCode(workshopCode)) {
    throw new ApiError(403, '只能提交所属车间的盘点单');
  }
}

function normalizeWorkshopCode(value, fallback = '') {
  const code = String(value || '').trim().toLowerCase();
  if (!code) return fallback;
  if (!WORKSHOP_CODES.has(code)) throw new ApiError(400, '车间范围无效');
  return code;
}

function workshopForRole(role) {
  const item = WORKSHOPS.find(entry => entry.role === role);
  return item?.code || null;
}

function canWriteWorkshop(user, workshopCode) {
  if (!user || !EDIT_ROLES.has(user.role)) return false;
  if (user.role === 'admin') return true;
  return workshopForRole(user.role) === normalizeWorkshopCode(workshopCode);
}

function assertWorkshopWrite(user, workshopCode) {
  if (!canWriteWorkshop(user, workshopCode)) {
    throw new ApiError(403, '当前账号只能修改所属车间的数据');
  }
}

function requireAnyWorkshopEditor(req, _res, next) {
  if (!req.user || !EDIT_ROLES.has(req.user.role)) {
    next(new ApiError(403, '当前账号没有数据修改权限'));
    return;
  }
  next();
}

module.exports = {
  WORKSHOPS,
  normalizeWorkshopCode,
  workshopForRole,
  canWriteWorkshop,
  assertWorkshopWrite,
  requireAnyWorkshopEditor,
  inventoryOrderScope,
  assertInventoryOrderSubmit,
  ROLE_LABELS,
  enforceReadOnly
};

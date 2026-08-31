const { ApiError } = require('./utils');

const WORKSHOPS = Object.freeze([
  { code: 'raw_grain', name: '原粮车间', role: 'raw_grain' },
  { code: 'qu_making', name: '制曲车间', role: 'qu_making' },
  { code: 'brewing', name: '酿酒车间', role: 'brewing' }
]);

const WORKSHOP_CODES = new Set(WORKSHOPS.map(item => item.code));
const EDIT_ROLES = new Set(['admin', 'raw_grain', 'qu_making', 'brewing']);

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
  requireAnyWorkshopEditor
};

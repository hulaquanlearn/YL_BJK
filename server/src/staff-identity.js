const { ApiError } = require('./utils');
const { normalizeWorkshopCode } = require('./workshop-scope');

const STAFF_POSITIONS = Object.freeze({
  group_leader: '组长',
  shift_leader: '班长'
});

function normalizeStaffPosition(value) {
  const position = String(value || '').trim();
  if (position && !Object.prototype.hasOwnProperty.call(STAFF_POSITIONS, position)) {
    throw new ApiError(400, '岗位只能选择组长或班长');
  }
  return position || null;
}

function normalizeStaffIdentity(role, workshopCode, position, { required = false } = {}) {
  if (role !== 'viewer') return { staffWorkshopCode: null, staffPosition: null };
  const staffPosition = normalizeStaffPosition(position);
  const staffWorkshopCode = normalizeWorkshopCode(workshopCode, '');
  if (required && (!staffWorkshopCode || !staffPosition)) throw new ApiError(400, '车间人员账号须明确所属车间和班长或组长岗位');
  if (staffPosition && !staffWorkshopCode) throw new ApiError(400, '请选择组长或班长所属车间');
  return { staffWorkshopCode: staffWorkshopCode || null, staffPosition };
}

module.exports = { STAFF_POSITIONS, normalizeStaffIdentity };

const { ApiError } = require('./utils');
const { normalizeWorkshopCode } = require('./workshop-scope');

const STAFF_POSITIONS = Object.freeze({
  group_leader: '组长',
  shift_leader: '班长',
  employee: '员工'
});

function normalizeStaffPosition(value) {
  const position = String(value || '').trim();
  if (position && !Object.prototype.hasOwnProperty.call(STAFF_POSITIONS, position)) {
    throw new ApiError(400, '岗位无效');
  }
  return position || null;
}

function normalizeStaffIdentity(role, workshopCode, position, { required = false } = {}) {
  if (role !== 'viewer') return { staffWorkshopCode: null, staffPosition: null };
  let staffPosition = normalizeStaffPosition(position);
  const staffWorkshopCode = normalizeWorkshopCode(workshopCode, '');
  if (staffWorkshopCode === 'raw_grain' && staffPosition === 'group_leader') staffPosition = 'employee';
  if (staffWorkshopCode !== 'raw_grain' && staffPosition === 'employee') throw new ApiError(400, '员工岗位当前仅适用于原粮车间');
  if (required && (!staffWorkshopCode || !staffPosition)) throw new ApiError(400, '车间人员账号须明确所属车间和岗位');
  if (staffPosition && !staffWorkshopCode) throw new ApiError(400, '请选择岗位所属车间');
  return { staffWorkshopCode: staffWorkshopCode || null, staffPosition };
}

module.exports = { STAFF_POSITIONS, normalizeStaffIdentity };

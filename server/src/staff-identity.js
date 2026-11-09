const { ApiError } = require('./utils');
const { normalizeWorkshopCode } = require('./workshop-scope');

const STAFF_POSITIONS = Object.freeze({
  group_leader: '线长 / 组长',
  shift_leader: '班长 / 工段长',
  employee: '员工',
  maintenance:'维修人员（车间）',
  manufacturer_maintenance:'维修人员（厂家）'
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
  if (required && (!staffWorkshopCode || !staffPosition)) throw new ApiError(400, '车间人员账号须明确所属车间和岗位');
  if (staffPosition && !staffWorkshopCode) throw new ApiError(400, '请选择岗位所属车间');
  return { staffWorkshopCode: staffWorkshopCode || null, staffPosition };
}

module.exports = { STAFF_POSITIONS, normalizeStaffIdentity };

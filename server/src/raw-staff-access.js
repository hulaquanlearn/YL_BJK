const { ApiError } = require('./utils');

// 原粮保留 shift_leader 标识，与其他车间班长对等；旧组长按员工收紧权限。
function isRawEmployee(user) {
  return user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain'
    && user.staffPosition !== 'shift_leader';
}

function enforceRawEmployeeAccess(req, _res, next) {
  if (!isRawEmployee(req.user)) return next();
  const readable = /^(?:\/parts(?:\/\d+)?|\/filters|\/dashboard|\/warehouse-areas|\/warehouse-layout|\/staging-points|\/part-models|\/part-model-library)$/;
  if (['GET', 'HEAD'].includes(req.method) && readable.test(req.path)) return next();
  return next(new ApiError(403, '原粮车间员工仅可查看备件'));
}

module.exports = { isRawEmployee, enforceRawEmployeeAccess };

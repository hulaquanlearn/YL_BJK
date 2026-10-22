const { ApiError } = require('./utils');
const { validateDisplayName } = require('./password-policy');
function profileName(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'displayName') || typeof body.displayName !== 'string') {
    throw new ApiError(400, '个人资料仅支持修改本人姓名');
  }
  return validateDisplayName(body.displayName);
}
module.exports = { profileName };

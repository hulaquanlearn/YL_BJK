const { ApiError } = require('./utils');

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    throw new ApiError(400, '用户名须为3至32位大小写字母、数字或下划线，区分大小写');
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, '密码须同时包含大写字母、小写字母和数字');
  }
  return password;
}

function validateDisplayName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 50) throw new ApiError(400, '姓名须为1至50个字符');
  return name;
}

module.exports = { validateUsername, validatePassword, validateDisplayName };

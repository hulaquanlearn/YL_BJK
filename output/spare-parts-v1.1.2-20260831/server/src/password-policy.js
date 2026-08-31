const { ApiError } = require('./utils');

function validateUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    throw new ApiError(400, '用户名须为3至32位小写字母、数字或下划线');
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 10 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, '密码须为10至72位，并同时包含字母和数字');
  }
  return password;
}

function validateDisplayName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 50) throw new ApiError(400, '姓名须为1至50个字符');
  return name;
}

module.exports = { validateUsername, validatePassword, validateDisplayName };

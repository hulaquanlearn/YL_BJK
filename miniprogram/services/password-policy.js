function getPasswordError(value) {
  const password = String(value || '');
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return '密码须同时包含大写字母、小写字母和数字';
  }
  return '';
}

module.exports = { getPasswordError };

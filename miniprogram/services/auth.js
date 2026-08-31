const TOKEN_KEY = 'spare_parts_auth_token';
const USER_KEY = 'spare_parts_auth_user';
const WORKSHOP_ROLES = Object.freeze({ raw_grain: 'raw_grain', qu_making: 'qu_making', brewing: 'brewing' });
let redirecting = false;

function getToken() { return wx.getStorageSync(TOKEN_KEY) || ''; }
function getUser() { return wx.getStorageSync(USER_KEY) || null; }
function setSession(token, user) {
  wx.setStorageSync(TOKEN_KEY, token);
  wx.setStorageSync(USER_KEY, user);
  redirecting = false;
}
function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}
function isAdmin() { return getUser()?.role === 'admin'; }
function userWorkshopCode() {
  const user = getUser();
  return user?.workshopCode || WORKSHOP_ROLES[user?.role] || '';
}
function canEditAnyWorkshop() { return isAdmin() || Boolean(userWorkshopCode()); }
function canEditWorkshop(workshopCode) {
  return isAdmin() || (Boolean(userWorkshopCode()) && userWorkshopCode() === String(workshopCode || ''));
}

function goLogin() {
  if (redirecting) return;
  redirecting = true;
  clearSession();
  wx.reLaunch({ url: '/pages/login/login', complete: () => { setTimeout(() => { redirecting = false; }, 500); } });
}

function requireLogin(options = {}) {
  if (!getToken() || !getUser()) {
    goLogin();
    return false;
  }
  if (options.admin && !isAdmin()) {
    wx.showModal({
      title: '无权限',
      content: '此功能仅管理员可以使用',
      showCancel: false,
      complete: () => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) })
    });
    return false;
  }
  if (options.editor && !canEditAnyWorkshop()) {
    wx.showModal({
      title: '无权限',
      content: '当前账号没有备件修改权限',
      showCancel: false,
      complete: () => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) })
    });
    return false;
  }
  return true;
}

module.exports = {
  getToken,
  getUser,
  setSession,
  clearSession,
  isAdmin,
  userWorkshopCode,
  canEditAnyWorkshop,
  canEditWorkshop,
  goLogin,
  requireLogin
};

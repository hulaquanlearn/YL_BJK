const TOKEN_KEY = 'spare_parts_auth_token';
const USER_KEY = 'spare_parts_auth_user';
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
  return true;
}

module.exports = { getToken, getUser, setSession, clearSession, isAdmin, goLogin, requireLogin };

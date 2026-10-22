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
function isViewer() { return getUser()?.role === 'viewer'; }
function requireWrite(allowed = canEditAnyWorkshop()) {
  if (allowed) return true;
  wx.showModal({ title:'权限不足', content:'当前账号不能修改备件或审批盘点单；盘点提交请到盘点页。', showCancel:false });
  return false;
}
function userWorkshopCode() {
  const user = getUser();
  return user?.workshopCode || WORKSHOP_ROLES[user?.role] || '';
}
function canEditAnyWorkshop() { return isAdmin() || Boolean(WORKSHOP_ROLES[getUser()?.role]); }
function canEditWorkshop(workshopCode) {
  return isAdmin() || (Boolean(WORKSHOP_ROLES[getUser()?.role]) && WORKSHOP_ROLES[getUser().role] === String(workshopCode || ''));
}
function isRawEmployee(user = getUser()) { return user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain' && user.staffPosition !== 'shift_leader'; }
function staffPositionLabel(user) { return user?.staffWorkshopCode === 'raw_grain' ? (user.staffPosition === 'shift_leader' ? '工段长' : '员工') : ({group_leader:'组长',shift_leader:'班长'})[user?.staffPosition] || '人员'; }
function canSubmitInventory() {
  if (isRawEmployee()) return false;
  return canEditAnyWorkshop() || (isViewer() && Boolean(userWorkshopCode()));
}
function canApproveInventory() { return canEditAnyWorkshop(); }
function requireInventorySubmit() {
  if (canSubmitInventory()) return true;
  wx.showModal({ title:'权限不足', content:'请先由管理员分配所属车间，才能提交盘点单。', showCancel:false });
  return false;
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
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const route = pages[pages.length - 1]?.route;
  if (isRawEmployee() && route && !['pages/login/login','pages/portal/portal','pages/home/home','pages/index/index','pages/detail/detail','pages/locationGuide/locationGuide','pages/webview/webview','pages/account/account'].includes(route)) {
    wx.reLaunch({url:'/pages/home/home'});
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
  isRawEmployee,
  staffPositionLabel,
  getToken,
  getUser,
  setSession,
  clearSession,
  isAdmin,
  isViewer,
  requireWrite,
  userWorkshopCode,
  canEditAnyWorkshop,
  canEditWorkshop,
  canSubmitInventory,
  canApproveInventory,
  requireInventorySubmit,
  goLogin,
  requireLogin
};

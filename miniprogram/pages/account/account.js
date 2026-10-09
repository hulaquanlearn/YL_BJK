const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const { getPasswordError } = require('../../services/password-policy.js');
const roleLabels={"admin":"系统管理员","raw_grain":"原粮车间管理员","qu_making":"制曲车间管理员","brewing":"酿酒车间管理员","viewer":"车间人员（岗位待分配）"};
const workshopLabels={raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'};
const positionLabels={group_leader:'组长',shift_leader:'班长'};
function accountRoleLabel(user) {
  if (user?.role === 'viewer' && user.staffPosition && user.staffWorkshopCode) {
    return `${workshopLabels[user.staffWorkshopCode] || '车间'}${positionLabels[user.staffPosition] || '人员'}`;
  }
  return roleLabels[user?.role] || '车间人员';
}

Page({
  data: { user: null, userInitial: '用', isAdmin: false, isViewer: false, oldPassword: '', newPassword: '', confirmPassword: '', submitting: false },

  onShow() {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    this.setData({ user, roleLabel:accountRoleLabel(user), userInitial: user?.displayName?.slice(0, 1) || '用', isAdmin: user?.role === 'admin', isViewer: auth.isViewer() });
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
  gotoUsers() { if (!auth.requireWrite(auth.canEditAnyWorkshop())) return; wx.navigateTo({ url: '/pages/users/users' }); },

  async changePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data;
    if (!oldPassword || !newPassword) return wx.showToast({ title: '请填写完整', icon: 'none' });
    const passwordError = getPasswordError(newPassword);
    if (passwordError) return wx.showToast({ title: passwordError, icon: 'none' });
    if (newPassword !== confirmPassword) return wx.showToast({ title: '两次新密码不一致', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await api.changePassword({ oldPassword, newPassword });
      auth.clearSession();
      wx.showToast({ title: '修改成功', icon: 'success' });
      setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 800);
    } catch (err) {
      wx.showToast({ title: err.message || '修改失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  },

  logout() {
    wx.showModal({ title: '退出登录', content: '确定退出当前账号吗？', success: res => {
      if (!res.confirm) return;
      api.logout().catch(() => {}).finally(() => {
        auth.clearSession();
        getApp().globalData.user = null;
        wx.reLaunch({ url: '/pages/login/login' });
      });
    } });
  }
});

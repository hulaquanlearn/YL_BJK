const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: { user: null, userInitial: '用', isAdmin: false, oldPassword: '', newPassword: '', confirmPassword: '', submitting: false },

  onShow() {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    this.setData({ user, userInitial: user?.displayName?.slice(0, 1) || '用', isAdmin: user?.role === 'admin' });
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
  gotoUsers() { wx.navigateTo({ url: '/pages/users/users' }); },

  async changePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data;
    if (!oldPassword || !newPassword) return wx.showToast({ title: '请填写完整', icon: 'none' });
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

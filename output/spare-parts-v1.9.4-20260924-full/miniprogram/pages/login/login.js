const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: { username: '', password: '', showPassword: false, loading: false, formError: '' },

  onLoad() {
    if (auth.getToken() && auth.getUser()) this.verifySession();
  },

  async verifySession() {
    try {
      const res = await api.getMe();
      auth.setSession(auth.getToken(), res.data.user);
      getApp().globalData.user = res.data.user;
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (_) {
      auth.clearSession();
    }
  },

  onUsernameInput(e) { this.setData({ username: e.detail.value.trim().toLowerCase(), formError: '' }); },
  onPasswordInput(e) { this.setData({ password: e.detail.value, formError: '' }); },
  togglePassword() { this.setData({ showPassword: !this.data.showPassword }); },

  async submitLogin() {
    if (this.data.loading) return;
    if (!this.data.username || !this.data.password) {
      this.setData({ formError: '请输入用户名和密码后再登录' });
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.login({ username: this.data.username, password: this.data.password });
      auth.setSession(res.data.token, res.data.user);
      getApp().globalData.user = res.data.user;
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (err) {
      this.setData({ formError: err.message || '登录失败，请检查账号信息' });
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});

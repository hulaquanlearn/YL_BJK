const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: { username: '', password: '', showPassword: false, loading: false, formError: '', retrySession: false },

  onLoad() {
    this._disposed = false;
    if (auth.getToken() && auth.getUser()) this.verifySession();
  },

  onUnload() { this._disposed = true; },

  async verifySession() {
    if (this.data.loading || this._disposed) return;
    const token = auth.getToken();
    if (!token) return;
    this.setData({ loading: true, formError: '', retrySession: false });
    try {
      const res = await api.getMe();
      if (this._disposed || auth.getToken() !== token) return;
      auth.setSession(token, res.data.user);
      getApp().globalData.user = res.data.user;
      wx.reLaunch({ url: '/pages/portal/portal' });
    } catch (error) {
      if (this._disposed || auth.getToken() !== token) return;
      const expired = [401,403].includes(error.statusCode);
      if (expired) auth.clearSession();
      this.setData({ retrySession: !expired, formError: expired ? '登录已失效，请重新登录' : (error.message || '连接失败，请重试') });
    } finally {
      if (!this._disposed) this.setData({ loading: false });
    }
  },

  onUsernameInput(e) { this.setData({ username: e.detail.value.trim(), formError: '' }); },
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
      if (this._disposed) return;
      auth.setSession(res.data.token, res.data.user);
      getApp().globalData.user = res.data.user;
      wx.reLaunch({ url: '/pages/portal/portal' });
    } catch (err) {
      if (this._disposed) return;
      this.setData({ formError: err.message || '登录失败，请检查账号信息' });
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
    } finally {
      if (!this._disposed) this.setData({ loading: false });
    }
  }
});

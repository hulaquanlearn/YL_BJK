const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
    users: [], loading: true, showCreate: false, showReset: false, resetUser: null, resetPassword: '',
    roles: ['普通用户', '管理员'], roleValues: ['user', 'admin'],
    newUser: { username: '', displayName: '', password: '', role: 'user' }, submitting: false
  },

  onLoad() { if (auth.requireLogin({ admin: true })) this.loadUsers(); },
  noop() {},
  onPullDownRefresh() { this.loadUsers().finally(() => wx.stopPullDownRefresh()); },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const res = await api.getUsers();
      this.setData({ users: (res.data || []).map(user => ({ ...user, initial: user.displayName?.slice(0, 1) || '用' })) });
    } catch (err) { wx.showToast({ title: err.message || '加载失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },

  openCreate() { this.setData({ showCreate: true, newUser: { username: '', displayName: '', password: '', role: 'user' } }); },
  closeCreate() { if (!this.data.submitting) this.setData({ showCreate: false }); },
  onNewInput(e) { this.setData({ [`newUser.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  onNewRole(e) { this.setData({ 'newUser.role': this.data.roleValues[Number(e.detail.value)] }); },

  async createUser() {
    const user = { ...this.data.newUser, username: this.data.newUser.username.trim().toLowerCase(), displayName: this.data.newUser.displayName.trim() };
    if (!user.username || !user.displayName || !user.password) return wx.showToast({ title: '请填写完整', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await api.createUser(user);
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showCreate: false });
      await this.loadUsers();
    } catch (err) { wx.showToast({ title: err.message || '创建失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  },

  async toggleEnabled(e) {
    try {
      await api.updateUser(e.currentTarget.dataset.id, { enabled: e.detail.value });
      wx.showToast({ title: e.detail.value ? '已启用' : '已停用', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '操作失败', icon: 'none' }); await this.loadUsers(); }
  },

  async changeRole(e) {
    const role = this.data.roleValues[Number(e.detail.value)];
    try {
      await api.updateUser(e.currentTarget.dataset.id, { role });
      wx.showToast({ title: '角色已更新', icon: 'success' });
      await this.loadUsers();
    } catch (err) { wx.showToast({ title: err.message || '更新失败', icon: 'none' }); }
  },

  openReset(e) {
    const user = this.data.users.find(item => item.id === e.currentTarget.dataset.id);
    this.setData({ showReset: true, resetUser: user, resetPassword: '' });
  },
  closeReset() { if (!this.data.submitting) this.setData({ showReset: false }); },
  onResetInput(e) { this.setData({ resetPassword: e.detail.value }); },
  async confirmReset() {
    if (!this.data.resetPassword) return wx.showToast({ title: '请输入新密码', icon: 'none' });
    this.setData({ submitting: true });
    try {
      await api.resetUserPassword(this.data.resetUser.id, this.data.resetPassword);
      wx.showToast({ title: '密码已重置', icon: 'success' });
      this.setData({ showReset: false });
    } catch (err) { wx.showToast({ title: err.message || '重置失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  }
});

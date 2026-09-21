const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const { getPasswordError } = require('../../services/password-policy.js');
const roleLabels={"admin":"系统管理员","raw_grain":"原粮车间管理员","qu_making":"制曲车间管理员","brewing":"酿酒车间管理员","viewer":"车间人员（只读）"};

Page({
  data: {
    users: [], loading: true, isViewer: false, showCreate: false, showReset: false, resetUser: null, resetPassword: '',
    roles: Object.values(roleLabels), roleValues: Object.keys(roleLabels), newRoleIndex: 4,
    newUser: { username: '', displayName: '', password: '', role: 'viewer' }, submitting: false
  },

  onLoad() { if (auth.requireLogin()) { this.setData({isViewer:auth.isViewer()}); this.loadUsers(); } },
  denyWrite() { auth.requireWrite(false); },
  noop() {},
  onPullDownRefresh() { this.loadUsers().finally(() => wx.stopPullDownRefresh()); },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const res = await api.getUsers();
      this.setData({ users: (res.data || []).map(user => ({ ...user, roleLabel:roleLabels[user.role] || '车间人员（只读）', roleIndex:Object.keys(roleLabels).indexOf(user.role), initial: user.displayName?.slice(0, 1) || '用' })) });
    } catch (err) { wx.showToast({ title: err.message || '加载失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },

  openCreate() {
    if (!auth.requireWrite(auth.isAdmin())) return; this.setData({ showCreate: true, newRoleIndex:4, newUser: { username: '', displayName: '', password: '', role: 'viewer' } }); },
  closeCreate() { if (!this.data.submitting) this.setData({ showCreate: false }); },
  onNewInput(e) { this.setData({ [`newUser.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  onNewRole(e) { this.setData({ newRoleIndex:Number(e.detail.value), 'newUser.role': this.data.roleValues[Number(e.detail.value)] }); },

  async createUser() {
    if (!auth.requireWrite(auth.isAdmin())) return;
    const user = { ...this.data.newUser, username: this.data.newUser.username.trim().toLowerCase(), displayName: this.data.newUser.displayName.trim() };
    if (!user.username || !user.displayName || !user.password) return wx.showToast({ title: '请填写完整', icon: 'none' });
    const passwordError = getPasswordError(user.password);
    if (passwordError) return wx.showToast({ title: passwordError, icon: 'none' });
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
    if (!auth.requireWrite(auth.isAdmin())) { await this.loadUsers(); return; }
    try {
      await api.updateUser(e.currentTarget.dataset.id, { enabled: e.detail.value });
      wx.showToast({ title: e.detail.value ? '已启用' : '已停用', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '操作失败', icon: 'none' }); await this.loadUsers(); }
  },

  async changeRole(e) {
    if (!auth.requireWrite(auth.isAdmin())) { await this.loadUsers(); return; }
    const role = this.data.roleValues[Number(e.detail.value)];
    try {
      await api.updateUser(e.currentTarget.dataset.id, { role });
      wx.showToast({ title: '角色已更新', icon: 'success' });
      await this.loadUsers();
    } catch (err) { wx.showToast({ title: err.message || '更新失败', icon: 'none' }); }
  },

  openReset(e) {
    if (!auth.requireWrite(auth.isAdmin())) return;
    const user = this.data.users.find(item => item.id === e.currentTarget.dataset.id);
    this.setData({ showReset: true, resetUser: user, resetPassword: '' });
  },
  closeReset() { if (!this.data.submitting) this.setData({ showReset: false }); },
  onResetInput(e) { this.setData({ resetPassword: e.detail.value }); },
  async confirmReset() {
    if (!auth.requireWrite(auth.isAdmin())) return;
    if (!this.data.resetPassword) return wx.showToast({ title: '请输入新密码', icon: 'none' });
    const passwordError = getPasswordError(this.data.resetPassword);
    if (passwordError) return wx.showToast({ title: passwordError, icon: 'none' });
    this.setData({ submitting: true });
    try {
      await api.resetUserPassword(this.data.resetUser.id, this.data.resetPassword);
      wx.showToast({ title: '密码已重置', icon: 'success' });
      this.setData({ showReset: false });
    } catch (err) { wx.showToast({ title: err.message || '重置失败', icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  }
});

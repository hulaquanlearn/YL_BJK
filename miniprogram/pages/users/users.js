const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const { getPasswordError } = require('../../services/password-policy.js');
const roleLabels={"admin":"系统管理员","raw_grain":"原粮车间管理员","qu_making":"制曲车间管理员","brewing":"酿酒车间管理员","viewer":"车间人员（按车间分配岗位）"};
const workshops=[{value:'',name:'未分配'},{value:'raw_grain',name:'原粮车间'},{value:'qu_making',name:'制曲车间'},{value:'brewing',name:'酿酒车间'}];
const positions=[{value:'',name:'待分配'},{value:'group_leader',name:'组长'},{value:'shift_leader',name:'班长'}];
function positionsFor(workshop) { return workshop === 'raw_grain' ? [{value:'',name:'待分配'},{value:'employee',name:'员工'},{value:'shift_leader',name:'工段长'}] : positions; }
function identityLabel(user) {
  if (user.role !== 'viewer') return roleLabels[user.role] || '车间人员';
  const workshop=workshops.find(item=>item.value===user.staffWorkshopCode)?.name || '未分配车间';
  const position=auth.staffPositionLabel(user);
  return user.staffWorkshopCode && user.staffPosition ? `${workshop}${position}（备件只读）` : '车间人员（岗位待分配，备件只读）';
}

Page({
  data: {
    users: [], loading: true, isViewer: false, showCreate: false, showReset: false, showIdentity: false,
    identityUser: null, pendingRole: '', editWorkshopIndex: 0, editPositionIndex: 0, resetUser: null, resetPassword: '',
    roles: Object.values(roleLabels), roleValues: Object.keys(roleLabels), newRoleIndex: 4,
    workshopNames: workshops.map(item=>item.name), positionNames: positionsFor('raw_grain').map(item=>item.name),
    createPositionNames: positionsFor('raw_grain').slice(1).map(item=>item.name),
    newWorkshopIndex: 1, newPositionIndex: 0,
    newUser: { username: '', displayName: '', password: '', role: 'viewer', staffWorkshopCode: 'raw_grain', staffPosition: 'employee' }, submitting: false
  },

  onLoad() { if (auth.requireLogin({editor:true})) { this.setData({isViewer:false,isSystemAdmin:auth.isAdmin()}); this.loadUsers(); } },
  denyWrite() { auth.requireWrite(false); },
  noop() {},
  onPullDownRefresh() { this.loadUsers().finally(() => wx.stopPullDownRefresh()); },

  async loadUsers() {
    this.setData({ loading: true });
    try {
      const res = await api.getUsers();
      this.setData({ users: (res.data || []).map(user => ({ ...user, roleLabel:roleLabels[user.role] || '车间人员（只读）', identityLabel:identityLabel(user), roleIndex:Object.keys(roleLabels).indexOf(user.role), initial: user.displayName?.slice(0, 1) || '用' })) });
    } catch (err) { wx.showToast({ title: err.message || '加载失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },

  openCreate() {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) return; this.setData({ showCreate: true, newRoleIndex:4, newWorkshopIndex:Math.max(1,workshops.findIndex(w=>w.value===auth.userWorkshopCode())), createPositionNames:positionsFor(auth.userWorkshopCode()||'raw_grain').slice(1).map(p=>p.name),newPositionIndex:0, newUser: { username: '', displayName: '', password: '', role: 'viewer', staffWorkshopCode:auth.userWorkshopCode()||'raw_grain', staffPosition:positionsFor(auth.userWorkshopCode()||'raw_grain')[1].value } }); },
  closeCreate() { if (!this.data.submitting) this.setData({ showCreate: false }); },
  onNewInput(e) { this.setData({ [`newUser.${e.currentTarget.dataset.field}`]: e.detail.value }); },
  onNewRole(e) { this.setData({ newRoleIndex:Number(e.detail.value), 'newUser.role': this.data.roleValues[Number(e.detail.value)] }); },
  onNewWorkshop(e) { const index=Number(e.detail.value); this.setData({newWorkshopIndex:index,'newUser.staffWorkshopCode':workshops[index].value,createPositionNames:positionsFor(workshops[index].value).slice(1).map(p=>p.name),newPositionIndex:0,'newUser.staffPosition':positionsFor(workshops[index].value)[1].value}); },
  onNewPosition(e) { const index=Number(e.detail.value); this.setData({newPositionIndex:index,'newUser.staffPosition':positionsFor(this.data.newUser.staffWorkshopCode)[index+1].value}); },

  async createUser() {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) return;
    const user = { ...this.data.newUser, username: this.data.newUser.username.trim(), displayName: this.data.newUser.displayName.trim() };
    if (!user.username || !user.displayName || !user.password) return wx.showToast({ title: '请填写完整', icon: 'none' });
    if (user.role === 'viewer' && (!user.staffWorkshopCode || !user.staffPosition)) return wx.showToast({title:'请选择车间和岗位',icon:'none'});
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
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) { await this.loadUsers(); return; }
    try {
      await api.updateUser(e.currentTarget.dataset.id, { enabled: e.detail.value });
      wx.showToast({ title: e.detail.value ? '已启用' : '已停用', icon: 'success' });
    } catch (err) { wx.showToast({ title: err.message || '操作失败', icon: 'none' }); await this.loadUsers(); }
  },

  async changeRole(e) {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) { await this.loadUsers(); return; }
    const role = this.data.roleValues[Number(e.detail.value)];
    const user=this.data.users.find(item=>item.id===e.currentTarget.dataset.id);
    if (role==='viewer' && user?.role!=='viewer') {
      this.setData({showIdentity:true,identityUser:user,pendingRole:'viewer',editWorkshopIndex:1,editPositionIndex:1,positionNames:positionsFor('raw_grain').map(p=>p.name)});
      return;
    }
    try {
      await api.updateUser(e.currentTarget.dataset.id, { role });
      wx.showToast({ title: '角色已更新', icon: 'success' });
      await this.loadUsers();
    } catch (err) { wx.showToast({ title: err.message || '更新失败', icon: 'none' }); }
  },

  openIdentity(e) {
    const user=this.data.users.find(item=>item.id===e.currentTarget.dataset.id);
    if (!user) return;
    if (user.role!=='viewer') return wx.showToast({title:'此账号为管理员岗位',icon:'none'});
    this.setData({
      showIdentity:true,identityUser:user,pendingRole:'',
      editWorkshopIndex:Math.max(0,workshops.findIndex(item=>item.value===user.staffWorkshopCode)),
      positionNames:positionsFor(user.staffWorkshopCode).map(p=>p.name),
      editPositionIndex:Math.max(0,positionsFor(user.staffWorkshopCode).findIndex(item=>item.value===(user.staffWorkshopCode==='raw_grain'&&user.staffPosition==='group_leader'?'employee':user.staffPosition)))
    });
  },
  closeIdentity() { if (!this.data.submitting) this.setData({showIdentity:false,pendingRole:''}); },
  onEditWorkshop(e) { const index=Number(e.detail.value);this.setData({editWorkshopIndex:index,editPositionIndex:1,positionNames:positionsFor(workshops[index].value).map(p=>p.name)}); },
  onEditPosition(e) { this.setData({editPositionIndex:Number(e.detail.value)}); },
  async saveIdentity() {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) return;
    const staffWorkshopCode=workshops[this.data.editWorkshopIndex].value;
    const staffPosition=positionsFor(staffWorkshopCode)[this.data.editPositionIndex].value;
    if (staffPosition && !staffWorkshopCode) return wx.showToast({title:'请选择所属车间',icon:'none'});
    this.setData({submitting:true});
    try {
      await api.updateUser(this.data.identityUser.id,{staffWorkshopCode,staffPosition,...(this.data.pendingRole?{role:this.data.pendingRole}:{})});
      this.setData({showIdentity:false,pendingRole:''});
      wx.showToast({title:'岗位已更新',icon:'success'});
      await this.loadUsers();
    } catch(err) { wx.showToast({title:err.message||'更新失败',icon:'none'}); }
    finally { this.setData({submitting:false}); }
  },

  openReset(e) {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) return;
    const user = this.data.users.find(item => item.id === e.currentTarget.dataset.id);
    this.setData({ showReset: true, resetUser: user, resetPassword: '' });
  },
  closeReset() { if (!this.data.submitting) this.setData({ showReset: false }); },
  onResetInput(e) { this.setData({ resetPassword: e.detail.value }); },
  async confirmReset() {
    if (!auth.requireWrite(auth.canEditAnyWorkshop())) return;
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

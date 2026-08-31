const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
    greeting: '你好',
    dateText: '',
    dashboardLoading: true,
    dashboardError: false,
    lastUpdated: '',
    dashboard: {
      partTypes: 0,
      inventoryRecords: 0,
      totalStock: 0,
      lowStock: 0,
      pendingApproval: 0
    },
    lowStockParts: [],
    user: null,
    userInitial: '仓',
    isAdmin: false,
    canEditParts: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.setUserContext();
  },

  onShow() {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    this.setData({
      user,
      userInitial: user?.displayName?.slice(0, 1) || '仓',
      isAdmin: user?.role === 'admin',
      canEditParts: auth.canEditAnyWorkshop()
    });
    this.setUserContext();
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },

  setUserContext() {
    const now = new Date();
    const hour = now.getHours();
    let greeting = '晚上好';
    if (hour < 6) greeting = '夜深了';
    else if (hour < 11) greeting = '早上好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    this.setData({
      greeting,
      dateText: `${now.getMonth() + 1}月${now.getDate()}日 ${weekNames[now.getDay()]}`
    });
  },

  async loadDashboard() {
    this.setData({ dashboardLoading: true, dashboardError: false });
    try {
      const res = await api.getDashboard();
      const now = new Date();
      this.setData({
        dashboardLoading: false,
        dashboardError: false,
        lastUpdated: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        dashboard: res.data?.dashboard || this.data.dashboard,
        lowStockParts: res.data?.lowStockParts || []
      });
    } catch (err) {
      console.error('首页数据加载失败：', err);
      this.setData({ dashboardLoading: false, dashboardError: true });
    }
  },

  retryDashboard() { this.loadDashboard(); },
  gotoPartList() { wx.navigateTo({ url: '/pages/index/index' }); },
  gotoPartStats() { wx.navigateTo({ url: '/pages/stats/stats' }); },
  gotoAddPart() { wx.navigateTo({ url: '/pages/addPart/addPart' }); },
  gotoFilter() { wx.navigateTo({ url: '/pages/filter/filter' }); },
  gotoApprove() { wx.navigateTo({ url: '/pages/approve/approve' }); },
  gotoaiAgent() { wx.navigateTo({ url: '/pages/aiAgent/aiAgent' }); },
  gotoLocationGuide() { wx.navigateTo({ url: '/pages/locationGuide/locationGuide' }); },
  gotoAccount() { wx.navigateTo({ url: '/pages/account/account' }); },

  gotoPartDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  }
});

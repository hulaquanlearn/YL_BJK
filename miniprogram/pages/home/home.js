const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
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
    isAdmin: false,
    canEditParts: false, isViewer: false,
    canSubmitInventory: false, canApproveInventory: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;
  },

  onShow() {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    this.setData({
      isRawEmployee: auth.isRawEmployee(),
      isAdmin: user?.role === 'admin',
      canEditParts: auth.canEditAnyWorkshop(), isViewer: auth.isViewer(),
      canSubmitInventory: auth.canSubmitInventory(), canApproveInventory: auth.canApproveInventory()
    });
    this.loadDashboard();
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
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
        lowStockParts: (res.data?.lowStockParts || []).slice(0,3)
      });
    } catch (err) {
      console.error('首页数据加载失败：', err);
      this.setData({ dashboardLoading: false, dashboardError: true });
    }
  },

  retryDashboard() { this.loadDashboard(); },
  gotoPartList() { wx.navigateTo({ url: '/pages/index/index' }); },
  gotoLowStock() { wx.navigateTo({ url: '/pages/index/index?lowStock=1' }); },
  gotoPartStats() { wx.navigateTo({ url: '/pages/stats/stats' }); },
  gotoAddPart() { if (!auth.requireWrite()) return; wx.navigateTo({ url: '/pages/addPart/addPart' }); },
  gotoFilter() { wx.navigateTo({ url: '/pages/filter/filter' }); },
  gotoApprove() { wx.navigateTo({ url: '/pages/approve/approve' }); },
  gotoaiAgent() { wx.navigateTo({ url: '/pages/aiAgent/aiAgent' }); },
  gotoLocationGuide() { wx.navigateTo({ url: '/pages/locationGuide/locationGuide' }); },
  gotoWarehouse3D() { wx.navigateTo({ url: '/pages/webview/webview?feature=warehouse3d' }); },

  gotoPartDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  }
});

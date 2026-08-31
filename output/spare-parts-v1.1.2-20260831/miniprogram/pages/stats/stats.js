const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
    summary: { materialCategoryCount: 0, inventoryRecords: 0, lowStock: 0 },
    unitTotals: [],
    areaStats: [],
    lowStockParts: [],
    isLoading: true,
    hasLoaded: false,
    expandedAreas: {},
    expandedShelf: {}
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.getFullStats();
  },

  onPullDownRefresh() {
    this.getFullStats().finally(() => wx.stopPullDownRefresh());
  },

  async getFullStats() {
    this.setData({ isLoading: true });
    try {
      const res = await api.getStats();
      const lowStockParts = (res.data?.lowStockParts || []).map(item => {
        const maxStock = item.maxStock === null || item.maxStock === undefined ? null : Number(item.maxStock);
        const suggestedQuantity = maxStock === null ? null : Math.max(maxStock - (Number(item.totalStock) || 0), 0);
        return { ...item, suggestedQuantity };
      });
      this.setData({
        summary: res.data?.summary || this.data.summary,
        unitTotals: res.data?.unitTotals || [],
        areaStats: res.data?.areaStats || [],
        lowStockParts,
        isLoading: false,
        hasLoaded: true
      });
    } catch (err) {
      console.error('统计数据加载失败：', err);
      this.setData({ isLoading: false, hasLoaded: false });
      wx.showToast({ title: err.message || '统计加载失败，请重试', icon: 'none' });
    }
  },

  toggleAreaExpand(e) {
    const area = e.currentTarget.dataset.area;
    this.setData({ [`expandedAreas.${area}`]: !this.data.expandedAreas[area] });
  },

  toggleShelfExpand(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`expandedShelf.${key}`]: !this.data.expandedShelf[key] });
  },

  async exportStats() {
    if (!this.data.hasLoaded) {
      wx.showToast({ title: '请先加载统计数据', icon: 'none' });
      return;
    }
    const reportTime = new Date().toLocaleString();
    const unitText = this.data.unitTotals.length
      ? this.data.unitTotals.map(item => `${item.total}${item.unit}`).join('、')
      : '暂无数量';
    let reportContent = `=== 备件库存统计报表 ===\n生成时间：${reportTime}\n\n`;
    reportContent += `备件品类：${this.data.summary.materialCategoryCount}\n`;
    reportContent += `库存记录：${this.data.summary.inventoryRecords}\n`;
    reportContent += `低库存记录：${this.data.summary.lowStock}\n`;
    reportContent += `按单位库存：${unitText}\n\n各货区分布：\n`;
    this.data.areaStats.forEach(area => {
      reportContent += `【${area.area}】${area.count}条；${area.unitSummary}\n`;
      area.shelves.forEach(shelf => {
        reportContent += `  - ${shelf.shelfNo === '未指定' ? '未指定货架' : shelf.shelfNo + '号货架'}：${shelf.count}条；${shelf.unitSummary}\n`;
      });
    });
    try {
      await wx.setClipboardData({ data: reportContent });
      wx.showModal({ title: '报表已复制', content: '统计数量已按单位分开，可直接粘贴使用。', showCancel: false });
    } catch (err) {
      wx.showToast({ title: '导出失败，请重试', icon: 'none' });
    }
  },

  goToLowStockParts() {
    wx.navigateTo({ url: '/pages/index/index?lowStock=1' });
  }
});

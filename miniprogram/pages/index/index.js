const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

function decodeOption(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_) {
    return String(value || '');
  }
}

function stockState(item) {
  const stock = Number(item.totalStock) || 0;
  const hasReorderPoint = item.reorderPoint !== null && item.reorderPoint !== undefined;
  if (stock <= 0) return { stockStatus: 'zero', stockStatusText: '无库存' };
  if (hasReorderPoint && stock <= Number(item.reorderPoint)) {
    return { stockStatus: 'low', stockStatusText: '低库存' };
  }
  return { stockStatus: 'normal', stockStatusText: '库存正常' };
}

function locationText(item) {
  if (item.locationType === 'free_text') {
    return [item.warehouseAreaName, item.locationNote].filter(Boolean).join(' · ') || '位置未登记';
  }
  const sideMap = { 1: '东侧', 2: '西侧' };
  const side = sideMap[item.position] || (item.position ? String(item.position) : '');
  const parts = [
    item.warehouseAreaName || '未分区',
    item.shelf === 0 || item.shelf ? `${item.shelf}号货架` : '货架未登记',
    side,
    item.layer === 0 || item.layer ? `${item.layer}层` : '层数未登记',
    item.location === 0 || item.location ? `${item.location}货位` : ''
  ];
  return parts.filter(Boolean).join(' · ');
}

Page({
  data: {
    searchKeyword: '',
    areas: [{ id: 1, name: '全部' }],
    selectedArea: '全部',
    shelfNoList: ['全部'],
    selectedShelfNo: '全部',
    layerList: ['全部'],
    selectedLayer: '全部',
    appliedArea: '全部',
    appliedShelfNo: '全部',
    appliedLayer: '全部',
    sortTypes: ['名称顺序', '库存从少到多', '库存从多到少', '编码升序', '编码降序'],
    sortIndex: 0,
    filteredParts: [],
    totalCount: 0,
    isLoading: false,
    loadError: false,
    failedPage: 1,
    isLoadingMore: false,
    hasMoreData: true,
    pageSize: 20,
    currentPage: 1,
    shelfMap: {},
    layerMap: {},
    isAdmin: false,
    lowStockOnly: false,
    isFilterExpanded: false,
    activeFilterCount: 0,
    filterSummary: '全部货区',
    skeletonRows: [1, 2, 3]
  },

  onLoad(options = {}) {
    if (!auth.requireLogin()) return;
    this._hasShown = false;
    this.setData({
      isAdmin: auth.isAdmin(),
      lowStockOnly: options.lowStock === '1',
      searchKeyword: decodeOption(options.keyword)
    });
    this.loadFilters();
    this.loadParts({ page: 1 });
  },

  onShow() {
    if (!this._hasShown) {
      this._hasShown = true;
      return;
    }
    this.refreshParts();
  },

  async onPullDownRefresh() {
    try {
      await this.loadParts({ page: 1 });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  refreshParts() {
    this.setData({ currentPage: 1, hasMoreData: true });
    return this.loadParts({ page: 1 });
  },

  async loadFilters() {
    try {
      const res = await api.getFilters();
      if (!res.success) throw new Error(res.msg || '筛选数据加载失败');
      const { areas, shelfMap, layerMap } = res.data || {};
      const validAreas = (areas || []).filter(Boolean);
      this.setData({
        areas: [{ id: 1, name: '全部' }, ...validAreas.map((name, index) => ({
          id: index + 2,
          name
        }))],
        shelfMap: shelfMap || {},
        layerMap: layerMap || {}
      });
    } catch (err) {
      console.error('加载筛选数据失败：', err);
      wx.showToast({ title: err.message || '筛选数据加载失败', icon: 'none' });
    }
  },

  refreshFilterMeta() {
    const selected = [];
    if (this.data.appliedArea !== '全部') selected.push(this.data.appliedArea);
    if (this.data.appliedShelfNo !== '全部') selected.push(`${this.data.appliedShelfNo}货架`);
    if (this.data.appliedLayer !== '全部') selected.push(this.data.appliedLayer);
    this.setData({
      activeFilterCount: selected.length,
      filterSummary: selected.length ? selected.join(' · ') : '全部货区'
    });
  },

  toggleFilters() {
    if (this.data.isFilterExpanded) {
      this.setData({
        selectedArea: this.data.appliedArea,
        selectedShelfNo: this.data.appliedShelfNo,
        selectedLayer: this.data.appliedLayer,
        shelfNoList: ['全部', ...(this.data.shelfMap[this.data.appliedArea] || [])],
        layerList: ['全部', ...(this.data.layerMap[this.data.appliedArea]?.[this.data.appliedShelfNo] || [])],
        isFilterExpanded: false
      });
      return;
    }
    this.setData({ isFilterExpanded: true });
  },

  chooseArea(e) {
    const areaName = e.currentTarget.dataset.name;
    this.setData({
      selectedArea: areaName,
      selectedShelfNo: '全部',
      shelfNoList: ['全部', ...(this.data.shelfMap[areaName] || [])],
      selectedLayer: '全部',
      layerList: ['全部'],
    });
  },

  chooseShelfNo(e) {
    const shelfNo = e.currentTarget.dataset.shelf;
    const layers = this.data.layerMap[this.data.selectedArea]?.[shelfNo] || [];
    this.setData({
      selectedShelfNo: shelfNo,
      selectedLayer: '全部',
      layerList: ['全部', ...layers],
    });
  },

  chooseLayer(e) {
    this.setData({
      selectedLayer: e.currentTarget.dataset.layer
    });
  },

  onSortChange(e) {
    this.setData({
      sortIndex: Number(e.detail.value) || 0,
      currentPage: 1,
      hasMoreData: true
    }, () => this.loadParts({ page: 1 }));
  },

  syncSearchKeyword(e) {
    this.setData({ searchKeyword: e.detail.value || '' });
  },

  onSearch() {
    this.setData({ currentPage: 1, hasMoreData: true });
    this.loadParts({ page: 1 });
  },

  clearSearch() {
    this.setData({ searchKeyword: '', currentPage: 1, hasMoreData: true });
    this.loadParts({ page: 1 });
  },

  resetFilters() {
    this.setData({
      selectedArea: '全部',
      selectedShelfNo: '全部',
      shelfNoList: ['全部'],
      selectedLayer: '全部',
      layerList: ['全部']
    });
  },

  applyFilters() {
    this.setData({
      appliedArea: this.data.selectedArea,
      appliedShelfNo: this.data.selectedShelfNo,
      appliedLayer: this.data.selectedLayer,
      isFilterExpanded: false,
      currentPage: 1,
      hasMoreData: true
    }, () => {
      this.refreshFilterMeta();
      this.loadParts({ page: 1 });
    });
  },

  resetAll() {
    this.setData({
      searchKeyword: '',
      selectedArea: '全部',
      selectedShelfNo: '全部',
      shelfNoList: ['全部'],
      selectedLayer: '全部',
      appliedArea: '全部',
      appliedShelfNo: '全部',
      appliedLayer: '全部',
      layerList: ['全部'],
      currentPage: 1,
      hasMoreData: true
    }, () => {
      this.refreshFilterMeta();
      this.loadParts({ page: 1 });
    });
  },

  buildParams(page) {
    const sortMap = ['name', 'stockAsc', 'stockDesc', 'codeAsc', 'codeDesc'];
    const params = {
      page,
      pageSize: this.data.pageSize,
      sort: sortMap[this.data.sortIndex] || 'name',
      searchKeyword: this.data.searchKeyword.trim()
    };
    if (this.data.lowStockOnly) params.lowStock = '1';
    if (this.data.appliedArea !== '全部') params.warehouseAreaName = this.data.appliedArea;
    if (this.data.appliedShelfNo !== '全部') {
      params.shelf = this.data.appliedShelfNo === '未指定'
        ? '__EMPTY__'
        : String(this.data.appliedShelfNo).replace('号', '');
    }
    if (this.data.appliedLayer !== '全部') {
      params.layer = this.data.appliedLayer === '未指定'
        ? '__EMPTY__'
        : String(this.data.appliedLayer).replace('层', '');
    }
    return params;
  },

  formatPart(item) {
    return {
      ...item,
      ...stockState(item),
      specDisplay: item.spec || '未登记',
      brandDisplay: item.brand || '',
      locationDisplay: locationText(item)
    };
  },

  async loadParts(options = {}) {
    const targetPage = Number(options.page) || 1;
    const append = options.append === true && targetPage > 1;
    const requestId = (this._partsRequestId || 0) + 1;
    this._partsRequestId = requestId;
    this.setData(append ? { isLoadingMore: true, loadError: false } : { isLoading: true, loadError: false });

    try {
      const res = await api.getParts(this.buildParams(targetPage));
      if (requestId !== this._partsRequestId) return;
      if (res.success === false) throw new Error(res.msg || '加载失败，请重试');
      const pageData = (res.data || []).map(item => this.formatPart(item));
      const filteredParts = append ? this.data.filteredParts.concat(pageData) : pageData;
      const totalCount = Number(res.total) || 0;
      this.setData({
        filteredParts,
        totalCount,
        currentPage: targetPage,
        hasMoreData: filteredParts.length < totalCount
      });
    } catch (err) {
      if (requestId !== this._partsRequestId) return;
      this.setData({ loadError: true, failedPage: targetPage });
      console.error('加载备件失败：', err);
      wx.showToast({ title: err.message || '加载失败，请重试', icon: 'none' });
    } finally {
      if (requestId === this._partsRequestId) {
        this.setData({ isLoading: false, isLoadingMore: false });
      }
    }
  },

  retryParts() { const page = this.data.failedPage; return this.loadParts({ page, append: page > 1 }); },

  loadMore() {
    if (this.data.loadError || this.data.isLoading || this.data.isLoadingMore || !this.data.hasMoreData) return;
    this.loadParts({ page: this.data.currentPage + 1, append: true });
  },

  onReachBottom() {
    this.loadMore();
  },

  goToDetail(e) {
    const partId = e?.currentTarget?.dataset?.id;
    if (!partId) {
      wx.showToast({ title: '备件信息异常', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/detail/detail?id=${partId}`,
      fail: () => wx.showToast({ title: '详情打开失败，请重试', icon: 'none' })
    });
  }
});

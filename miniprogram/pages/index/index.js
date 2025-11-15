Page({
  data: {
    // 工段数据（每个工段对应独立货架号）
    workshops: [
      { id: 1, name: '全部' },
      { id: 2, name: '破曲工段' },
      { id: 3, name: '五粮工段' },
      { id: 4, name: '蒸糠工段' },
      { id: 5, name: '输送工段' },
    ],
    selectedWorkshopId: 1, // 默认选中“全部”

    // 工段→专属货架号（独立无重复）
    shelvesByWorkshop: {
      '全部': ['1号货架', '2号货架', '3号货架', '4号货架', '5号货架', '6号货架'],
      '破曲工段': ['1号货架', '2号货架'],
      '五粮工段': ['3号货架', '4号货架'],
      '蒸糠工段': ['5号货架'],
      '输送工段': ['6号货架']
    },
    shelfNoList: [], // 当前工段的货架号
    selectedShelfNo: '全部',

    // 货架号→对应层数（独立定义）
    layersByShelf: {
      '全部': ['1层', '2层', '3层', '4层'],
      '1号货架': ['1层', '2层', '3层'],
      '2号货架': ['1层', '2层'],
      '3号货架': ['1层', '2层'],
      '4号货架': ['1层', '2层', '3层', '4层'],
      '5号货架': ['1层', '2层', '3层'],
      '6号货架': ['1层', '2层']
    },
    layerList: [], // 当前货架号的层数
    selectedLayer: '全部',

    // 排序配置（默认按名称A-Z）
    sortTypes: ['默认', '库存从高到低', '库存从低到高'],
    sortIndex: 0,
    isShowSort: false,

    // 数据与状态
    parts: [], // 筛选后显示的列表
    originParts: [], // 原始数据备份
    isLoading: false,
    page: 1,
    pageSize: 10,
    hasMore: true,
    searchKeyword: ''
  },

  /**
   * 页面加载初始化
   */
  onLoad() {
    this.db = wx.cloud.database().collection('parts');
    // 初始化货架号和层数（默认“全部”工段）
    const defaultWorkshop = this.data.workshops[0].name;
    this.setData({
      shelfNoList: this.data.shelvesByWorkshop[defaultWorkshop],
      layerList: this.data.layersByShelf['全部']
    });
    this.getPartsList(); // 加载配件数据
  },

  /**
   * 页面显示时刷新数据（从详情页返回）
   */
  onShow() {
    this.setData({ page: 1, hasMore: true }, () => {
      this.getPartsList();
    });
  },

  /**
   * 从云数据库加载配件数据（带分页）
   */
  getPartsList() {
    const { page, pageSize } = this.data;
    this.setData({ isLoading: true });

    this.db
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
      .then(res => {
        const newParts = res.data || [];
        const originParts = page === 1 ? newParts : [...this.data.originParts, ...newParts];
        this.setData({
          originParts,
          isLoading: false,
          hasMore: newParts.length === pageSize
        }, () => {
          this.filterParts(); // 加载后立即筛选
        });
      })
      .catch(err => {
        console.error('加载配件失败：', err);
        wx.showToast({ title: '数据加载失败', icon: 'none' });
        this.setData({ isLoading: false });
      });
  },

  /**
   * 搜索功能（关键词筛选）
   */
  onSearch(e) {
    const keyword = e.detail.value.trim();
    this.setData({ searchKeyword: keyword }, () => {
      this.filterParts();
    });
  },

  /**
   * 选择工段：联动更新货架号
   */
  chooseWorkshop(e) {
    const workshopId = e.currentTarget.dataset.id;
    const workshop = this.data.workshops.find(ws => ws.id === workshopId);
    this.setData({
      selectedWorkshopId: workshopId,
      shelfNoList: this.data.shelvesByWorkshop[workshop.name], // 加载当前工段专属货架
      selectedShelfNo: '全部', // 重置货架号
      layerList: this.data.layersByShelf['全部'], // 重置层数
      selectedLayer: '全部'
    }, () => {
      this.filterParts();
    });
    wx.showToast({ title: `已选：${workshop.name}`, icon: 'none' });
  },

  /**
   * 选择货架号：联动更新层数
   */
  chooseShelfNo(e) {
    const shelfNo = e.currentTarget.dataset.shelf;
    this.setData({
      selectedShelfNo: shelfNo,
      layerList: this.data.layersByShelf[shelfNo], // 加载当前货架专属层数
      selectedLayer: '全部' // 重置层数
    }, () => {
      this.filterParts();
    });
    wx.showToast({ title: `已选：${shelfNo}`, icon: 'none' });
  },

  /**
   * 选择层数：筛选对应配件
   */
  chooseLayer(e) {
    const layer = e.currentTarget.dataset.layer;
    this.setData({ selectedLayer: layer }, () => {
      this.filterParts();
    });
    wx.showToast({ title: `已选：${layer}`, icon: 'none' });
  },

  /**
   * 多条件筛选（工段+货架号+层数+搜索）
   */
  filterParts() {
    const {
      originParts,
      selectedWorkshopId,
      workshops,
      selectedShelfNo,
      selectedLayer,
      searchKeyword
    } = this.data;

    // 1. 工段筛选
    const workshop = workshops.find(ws => ws.id === selectedWorkshopId);
    const workshopName = workshop?.name || '全部';
    let filtered = [...originParts];
    if (workshopName !== '全部') {
      filtered = filtered.filter(part => part.workshop === workshopName);
    }

    // 2. 货架号筛选
    if (selectedShelfNo !== '全部') {
      filtered = filtered.filter(part => part.shelfNo === selectedShelfNo);
    }

    // 3. 层数筛选
    if (selectedLayer !== '全部') {
      filtered = filtered.filter(part => part.shelfLayer === selectedLayer);
    }

    // 4. 搜索筛选
    if (searchKeyword) {
      filtered = filtered.filter(part =>
        (part.name || '').includes(searchKeyword) ||
        (part.model || '').includes(searchKeyword) ||
        (part.device || '').includes(searchKeyword)
      );
    }

    // 筛选后应用排序
    this.setData({ parts: filtered }, () => {
      this.changeSort(this.data.sortIndex);
    });
  },

  /**
   * 排序相关方法
   */
  showSortPicker() {
    this.setData({ isShowSort: true });
  },
  hideSortPicker() {
    this.setData({ isShowSort: false });
  },
  chooseSort(e) {
    const sortIndex = e.currentTarget.dataset.index;
    this.setData({ sortIndex, isShowSort: false }, () => {
      this.changeSort(sortIndex);
    });
  },
  changeSort(sortIndex) {
    let sorted = [...this.data.parts];
    switch (sortIndex) {
      case 1: // 库存从高到低
        sorted.sort((a, b) => (b.stock || 0) - (a.stock || 0));
        break;
      case 2: // 库存从低到高
        sorted.sort((a, b) => (a.stock || 0) - (b.stock || 0));
        break;
      default: // 默认按名称A-Z
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    this.setData({ parts: sorted });
  },

  /**
   * 加载更多数据（分页）
   */
  loadMore() {
    if (this.data.isLoading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 }, () => {
      this.getPartsList();
    });
  },

  /**
   * 跳转到配件详情页
   */
  goToDetail(e) {
    const partId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${partId}` });
  },

  /**
   * 下拉刷新：重置所有筛选条件
   */
  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      selectedWorkshopId: 1,
      selectedShelfNo: '全部',
      selectedLayer: '全部',
      searchKeyword: '',
      sortIndex: 0
    }, () => {
      const defaultWorkshop = this.data.workshops[0].name;
      this.setData({
        shelfNoList: this.data.shelvesByWorkshop[defaultWorkshop],
        layerList: this.data.layersByShelf['全部']
      }, () => {
        this.getPartsList().then(() => wx.stopPullDownRefresh());
      });
    });
  },

  /**
   * 上拉触底：加载更多
   */
  onReachBottom() {
    this.loadMore();
  }
});
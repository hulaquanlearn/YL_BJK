const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

Page({
  data: {
    // 基础数据
    workshops: ['全部'],
    shelfMap: {},       // {工段: [货架列表]}
    layerMap: {},       // {工段: {货架: [层数列表]}}
    
    // 选中值
    selectedWorkshop: '全部',
    selectedShelfNo: '全部',
    selectedLayer: '全部',
    selectedStatus: '未盘点',
    
    // 动态选项列表
    shelfNoList: ['全部'],
    layerList: ['全部'],
    statusOptions: ['未盘点', '已盘点', '全部'],
    
    // 自定义筛选弹窗控制
    showCustomModal: false,
    modalTitle: "",
    modalOptions: [],
    modalType: "", // workshop/shelf/layer/status
    modalSelectedValue: "",
    
    // 自定义确认筛选弹窗控制
    showConfirmModal: false,
    
    // 加载状态
    isLoading: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.loadFilterOptions();
  },

  // 从服务器 API 加载筛选数据
  loadFilterOptions() {
    this.setData({ isLoading: true });
    api.getFilters().then(res => {
      if (res.success) {
        let { areas, shelfMap, layerMap } = res.data;
        
        // 处理层数映射
        const adaptedLayerMap = {};
        for (const [area, shelfLayerObj] of Object.entries(layerMap)) {
          adaptedLayerMap[area] = {};
          for (const [shelf, layerList] of Object.entries(shelfLayerObj)) {
            const adaptedLayerList = layerList.filter(item => item != null && item !== '');
            adaptedLayerMap[area][shelf] = adaptedLayerList;
          }
        }

        this.setData({
          workshops: ['全部', ...(areas || []).filter(item => item != null && item !== '')],
          shelfMap: shelfMap || {},
          layerMap: adaptedLayerMap, // 适配后的层数映射
          isLoading: false
        });
      } else {
        wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
        this.setData({ isLoading: false });
      }
    }).catch(err => {
      console.error('加载失败：', err);
      wx.showToast({ title: '网络异常', icon: 'none' });
      this.setData({ isLoading: false });
    });
  },

  // ========== 自定义筛选弹窗通用逻辑 ==========
  selectModalItem(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      modalSelectedValue: value
    });
  },

  closeCustomModal() {
    this.setData({
      showCustomModal: false
    });
  },

  confirmCustomModal() {
    const { modalType, modalSelectedValue } = this.data;
    switch (modalType) {
      case "workshop":
        this.handleWorkshopSelect(modalSelectedValue);
        break;
      case "shelf":
        this.handleShelfSelect(modalSelectedValue);
        break;
      case "layer":
        this.setData({ selectedLayer: modalSelectedValue });
        break;
      case "status":
        this.setData({ selectedStatus: modalSelectedValue });
        break;
    }
    this.closeCustomModal();
  },

  // ========== 工段筛选逻辑 ==========
  openWorkshopModal() {
    this.setData({
      showCustomModal: true,
      modalTitle: "选择工段",
      modalOptions: this.data.workshops,
      modalType: "workshop",
      modalSelectedValue: this.data.selectedWorkshop
    });
  },

  handleWorkshopSelect(selectedWorkshop) {
    // 工段选择“全部”时，重置货架/层数
    if (selectedWorkshop === '全部') {
      this.setData({ 
        selectedWorkshop,
        selectedShelfNo: '全部',
        selectedLayer: '全部',
        shelfNoList: ['全部'],
        layerList: ['全部']
      });
    } else {
      this.setData({ 
        selectedWorkshop,
        selectedShelfNo: '全部',
        selectedLayer: '全部'
      });
      // 加载对应工段的货架列表
      const shelfList = this.data.shelfMap[selectedWorkshop] || [];
      this.setData({ shelfNoList: ['全部', ...shelfList.filter(item => item != null && item !== '')] });
    }
  },

  // ========== 货架筛选逻辑 ==========
  openShelfModal() {
    if (this.data.selectedWorkshop === '全部') {
      wx.showToast({ title: '请先选择工段', icon: 'none' });
      return;
    }
    this.setData({
      showCustomModal: true,
      modalTitle: "选择货架",
      modalOptions: this.data.shelfNoList,
      modalType: "shelf",
      modalSelectedValue: this.data.selectedShelfNo
    });
  },

  handleShelfSelect(selectedShelfNo) {
    this.setData({ selectedShelfNo });
    // 货架选择“全部”时，重置层数
    if (selectedShelfNo === '全部') {
      this.setData({ selectedLayer: '全部', layerList: ['全部'] });
    } else {
      // 直接复用 API 返回的层数列表
      const layerList = this.data.layerMap[this.data.selectedWorkshop]?.[selectedShelfNo] || [];
      this.setData({ layerList: ['全部', ...layerList.filter(item => item != null && item !== '')] });
    }
  },

  // ========== 层数筛选逻辑 ==========
  openLayerModal() {
    const { selectedWorkshop, selectedShelfNo } = this.data;
    if (selectedWorkshop === '全部' || selectedShelfNo === '全部') {
      wx.showToast({ title: '请先选择工段和货架', icon: 'none' });
      return;
    }
    // 补充缺失的弹窗配置参数，确保弹窗正常打开
    this.setData({
      showCustomModal: true,
      modalTitle: "选择层数",
      modalOptions: this.data.layerList,
      modalType: "layer",
      modalSelectedValue: this.data.selectedLayer
    });
  },

  // ========== 状态筛选逻辑 ==========
  openStatusModal() {
    this.setData({
      showCustomModal: true,
      modalTitle: "选择盘点状态",
      modalOptions: this.data.statusOptions,
      modalType: "status",
      modalSelectedValue: this.data.selectedStatus
    });
  },

  // ========== 确认筛选逻辑（增加必选校验） ==========
  confirmFilter() {
    const { selectedWorkshop, selectedShelfNo } = this.data;
    
    // 必选校验：工段不能是“全部”，货架不能是“全部”
    if (selectedWorkshop === '全部') {
      wx.showToast({ title: '请选择工段', icon: 'none' });
      return;
    }
    if (selectedShelfNo === '全部') {
      wx.showToast({ title: '请选择货架', icon: 'none' });
      return;
    }
    
    // 校验通过，打开确认弹窗
    this.setData({
      showConfirmModal: true
    });
  },

  // 关闭自定义确认弹窗
  closeConfirmModal() {
    this.setData({
      showConfirmModal: false
    });
  },

  // 确认最终筛选（跳转页面：优化URL拼接，确保参数传递准确，兼容旧字段）
  confirmFinalFilter() {
    const { selectedWorkshop, selectedShelfNo, selectedLayer, selectedStatus } = this.data;
    const params = {
      workshop: encodeURIComponent(selectedWorkshop || '全部'),
      shelf: encodeURIComponent(selectedShelfNo || '全部'),
      layer: encodeURIComponent(selectedLayer || '全部'),
      status: encodeURIComponent(selectedStatus || '全部')
    };
    
    // 优化URL拼接：避免map方法潜在的兼容性问题，手动拼接更稳定
    const urlParams = [];
    for (const [key, value] of Object.entries(params)) {
      urlParams.push(`${key}=${value}`);
    }
    const targetUrl = `/pages/inventory/inventory?${urlParams.join('&')}`;
    
    // 跳转库存页面：使用navigateTo，确保库存页面onLoad正常触发
    wx.navigateTo({
      url: targetUrl,
      fail: (err) => {
        console.error('跳转盘点页面失败：', err);
        wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
      }
    });
    
    this.closeConfirmModal();
  }
});

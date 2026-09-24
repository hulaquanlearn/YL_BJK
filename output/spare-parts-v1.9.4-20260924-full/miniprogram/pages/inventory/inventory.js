const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const { formatDigitInput, isEmptyValue } = require('../../services/utils.js');

const STATUS = {
  COMPLETED: '已盘点',
  PENDING: '待审批',
  UNCHECKED: '未核对',
  NORMAL: '正常',
  ABNORMAL: '异常'
};

Page({
  data: {
    inventoryList: [],
    isLoading: true,
    isSubmitting: false,
    filterParams: {},
    todayPendingPartIds: [],
    todayCompletedPartIds: [],
    isReadOnly: false, isViewer: false,
    canSubmitCount: 0,
    editableCount: 0,
    checkedCount: 0,
    uncheckedCount: 0,
    abnormalCount: 0,
    showInventoryModal: false,
    inventoryRemark: '',
    abnormalList: [],
    isSubmitDisabled: true,
    inventoryUser: ''
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    const currentUser = auth.getUser();
    this.setData({ inventoryUser: currentUser?.displayName || currentUser?.username || '', isViewer: auth.isViewer() });
    const filterParams = {
      workshop: decodeURIComponent(options.workshop || '全部'),
      shelf: decodeURIComponent(options.shelf || '全部'),
      layer: decodeURIComponent(options.layer || '全部'),
      status: decodeURIComponent(options.status || '未盘点')
    };
    this.setData({
      filterParams,
      isReadOnly: filterParams.status === '已盘点'
    }, async () => {
      await this.getTodayInventoryData();
      await this.loadInventoryData();
    });
  },

  formatDateToYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  async getTodayInventoryData() {
    const today = this.formatDateToYMD(new Date());
    try {
      const res = await api.getInventoryOrders({ date: today, limit: 200 });
      const pendingIds = new Set();
      const completedIds = new Set();
      (res.data || []).forEach(order => {
        if (order.approveStatus === '已驳回') return;
        const target = order.approveStatus === '待审批' ? pendingIds : completedIds;
        const source = Array.isArray(order.inventoryAllList) && order.inventoryAllList.length
          ? order.inventoryAllList
          : (order.abnormalList || []);
        source.forEach(item => {
          if (item.partId !== undefined && item.partId !== null) target.add(String(item.partId));
        });
      });
      this.setData({
        todayPendingPartIds: [...pendingIds],
        todayCompletedPartIds: [...completedIds]
      });
    } catch (err) {
      console.error('查询当日盘点单失败：', err);
      wx.showToast({ title: err.message || '获取盘点记录失败', icon: 'none' });
    }
  },

  buildQueryParams(page) {
    const { workshop, shelf, layer, status } = this.data.filterParams;
    const params = { page, pageSize: 200, sort: 'codeAsc' };
    if (workshop !== '全部') params.warehouseAreaName = workshop;
    if (shelf !== '全部') params.shelf = shelf === '未指定' ? '__EMPTY__' : shelf.replace('号', '');
    if (layer !== '全部') params.layer = layer === '未指定' ? '__EMPTY__' : layer.replace('层', '');
    if (status === '已盘点') params.inventoryStatus = 'completed';
    if (status === '未盘点') {
      params.inventoryStatus = 'uncompleted';
      if (this.data.todayPendingPartIds.length) params.excludeIds = this.data.todayPendingPartIds.join(',');
    }
    return params;
  },

  async loadInventoryData() {
    this.setData({ isLoading: true });
    try {
      let page = 1;
      let total = 0;
      let rows = [];
      do {
        const res = await api.getParts(this.buildQueryParams(page));
        const pageRows = res.data || [];
        total = Number(res.total) || 0;
        rows = rows.concat(pageRows);
        page += 1;
        if (!pageRows.length) break;
      } while (rows.length < total && page <= 100);

      const uniqueRows = [];
      const seenIds = new Set();
      rows.forEach(item => {
        const id = String(item._id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          uniqueRows.push(item);
        }
      });

      const pendingIds = new Set(this.data.todayPendingPartIds.map(String));
      const completedIds = new Set(this.data.todayCompletedPartIds.map(String));
      const inventoryList = uniqueRows.map(item => {
        const id = String(item._id);
        const isPending = item.inventoryStatus === '待审批' || pendingIds.has(id);
        const isCompleted = item.inventoryStatus === '已完成' || item.inventoryStatus === '已盘点' || completedIds.has(id);
        const checkStatus = isPending ? STATUS.PENDING : (isCompleted ? STATUS.COMPLETED : STATUS.UNCHECKED);
        return {
          ...item,
          checkStatus,
          actualStock: '',
          sysStockNum: Number(item.totalStock) || 0,
          sysStockUnit: item.unit || '个'
        };
      });
      const progress = this.calculateProgress(inventoryList);
      this.setData({
        inventoryList,
        ...progress,
        isLoading: false
      });
    } catch (err) {
      console.error('加载盘点备件失败：', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: err.message || '加载数据失败', icon: 'none' });
    }
  },

  calculateProgress(inventoryList) {
    const editableList = inventoryList.filter(item =>
      [STATUS.UNCHECKED, STATUS.NORMAL, STATUS.ABNORMAL].includes(item.checkStatus)
    );
    const checkedCount = editableList.filter(item => [STATUS.NORMAL, STATUS.ABNORMAL].includes(item.checkStatus)).length;
    return {
      editableCount: editableList.length,
      checkedCount,
      canSubmitCount: checkedCount,
      uncheckedCount: editableList.filter(item => item.checkStatus === STATUS.UNCHECKED).length,
      abnormalCount: editableList.filter(item => item.checkStatus === STATUS.ABNORMAL).length
    };
  },

  setCheckStatus(e) {
    if (!auth.requireWrite()) return;
    const index = Number(e.currentTarget.dataset.index);
    const status = e.currentTarget.dataset.status;
    const inventoryList = [...this.data.inventoryList];
    const item = inventoryList[index];
    if (!item || ![STATUS.UNCHECKED, STATUS.NORMAL, STATUS.ABNORMAL].includes(item.checkStatus)) return;
    if (![STATUS.NORMAL, STATUS.ABNORMAL].includes(status)) return;
    item.checkStatus = status;
    this.setData({ inventoryList, ...this.calculateProgress(inventoryList) });
  },

  markAllNormal() {
    if (!auth.requireWrite()) return;
    if (!this.data.uncheckedCount) return;
    wx.showModal({
      title: '确认批量核对',
      content: `确定将剩余 ${this.data.uncheckedCount} 条未核对备件标记为正常吗？请确认已完成现场核对。`,
      confirmText: '确认正常',
      success: res => {
        if (!res.confirm) return;
        const inventoryList = this.data.inventoryList.map(item => ({
          ...item,
          checkStatus: item.checkStatus === STATUS.UNCHECKED ? STATUS.NORMAL : item.checkStatus
        }));
        this.setData({ inventoryList, ...this.calculateProgress(inventoryList) });
      }
    });
  },

  completeInventory() {
    if (!auth.requireWrite()) return;
    if (this.data.isLoading || this.data.isSubmitting) return;
    if (this.data.uncheckedCount > 0) {
      wx.showToast({ title: `还有${this.data.uncheckedCount}条未核对`, icon: 'none' });
      return;
    }
    const scopeList = this.data.inventoryList.filter(item =>
      item.checkStatus === STATUS.NORMAL || item.checkStatus === STATUS.ABNORMAL
    );
    if (!scopeList.length) {
      wx.showToast({ title: '当前范围没有可盘点的备件', icon: 'none' });
      return;
    }
    const abnormalList = scopeList.filter(item => item.checkStatus === STATUS.ABNORMAL);
    const isSubmitDisabled = !this.data.inventoryUser.trim() ||
      abnormalList.some(item => isEmptyValue(item.actualStock));
    this.setData({
      showInventoryModal: true,
      abnormalList,
      inventoryRemark: '',
      isSubmitDisabled
    });
  },

  inputAbnormalStock(e) {
    const index = Number(e.currentTarget.dataset.index);
    const abnormalList = [...this.data.abnormalList];
    if (!abnormalList[index]) return;
    abnormalList[index].actualStock = formatDigitInput(e.detail.value);
    this.setData({
      abnormalList,
      isSubmitDisabled: !this.data.inventoryUser.trim() ||
        abnormalList.some(item => isEmptyValue(item.actualStock))
    });
  },

  inputInventoryUser(e) {
    const inventoryUser = e.detail.value || '';
    this.setData({
      inventoryUser,
      isSubmitDisabled: !inventoryUser.trim() ||
        this.data.abnormalList.some(item => isEmptyValue(item.actualStock))
    });
  },

  inputInventoryRemark(e) {
    this.setData({ inventoryRemark: e.detail.value || '' });
  },

  closeInventoryModal() {
    if (this.data.isSubmitting) return;
    this.setData({
      showInventoryModal: false,
      inventoryRemark: '',
      abnormalList: [],
      isSubmitDisabled: true
    });
  },

  async submitInventoryToApprove() {
    if (!auth.requireWrite()) return;
    if (this.data.isSubmitting) return;
    const inventoryUser = this.data.inventoryUser.trim();
    if (!inventoryUser) {
      wx.showToast({ title: '请填写盘点人', icon: 'none' });
      return;
    }
    if (this.data.abnormalList.some(item => isEmptyValue(item.actualStock))) {
      wx.showToast({ title: '请填写所有异常备件的实际数量', icon: 'none' });
      return;
    }

    const scopeList = this.data.inventoryList.filter(item =>
      item.checkStatus === STATUS.NORMAL || item.checkStatus === STATUS.ABNORMAL
    );
    if (!scopeList.length) {
      wx.showToast({ title: '没有可提交的盘点记录', icon: 'none' });
      return;
    }

    const inventoryAllList = scopeList.map(item => ({
      partId: item._id,
      partName: item.materialDesc,
      materialCode: item.materialCode,
      checkStatus: item.checkStatus,
      sysStock: `${item.sysStockNum}${item.sysStockUnit}`,
      sysStockNum: item.sysStockNum,
      snapshotStock: item.sysStockNum,
      sysStockUnit: item.sysStockUnit,
      shelf: item.shelf,
      layer: item.layer
    }));
    const formattedAbnormalList = this.data.abnormalList.map(item => ({
      partId: item._id,
      partName: item.materialDesc,
      materialCode: item.materialCode,
      sysStock: `${item.sysStockNum}${item.sysStockUnit}`,
      sysStockNum: item.sysStockNum,
      snapshotStock: item.sysStockNum,
      sysStockUnit: item.sysStockUnit,
      actualStock: Number(item.actualStock),
      actualStockWithUnit: `${item.actualStock}${item.sysStockUnit}`,
      checkStatus: item.checkStatus,
      shelf: item.shelf,
      layer: item.layer
    }));
    const today = this.formatDateToYMD(new Date());
    const inventoryData = {
      inventoryNo: `INV-${Date.now()}`,
      inventoryDate: today,
      filterParams: this.data.filterParams,
      inventoryAllList,
      abnormalList: formattedAbnormalList,
      inventoryUser,
      inventoryRemark: this.data.inventoryRemark || '无说明'
    };

    this.setData({ isSubmitting: true, isSubmitDisabled: true });
    wx.showLoading({ title: '提交盘点单...', mask: true });
    try {
      await api.createInventoryOrder(inventoryData);
      this.setData({ showInventoryModal: false });
      wx.showToast({ title: '盘点单提交成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
          fail: () => wx.redirectTo({ url: '/pages/filter/filter' })
        });
      }, 1200);
    } catch (err) {
      console.error('提交盘点单失败：', err);
      this.setData({
        isSubmitting: false,
        isSubmitDisabled: false
      });
      wx.showToast({ title: err.message || '提交失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  stopPropagation() {}
});

const api = require('../../services/api.js');
const auth = require('../../services/auth.js');
const { formatDigitInput } = require('../../services/utils.js');

function checkQuantityValid(quantity) {
  const num = Number(quantity);
  if (isNaN(num) || num <= 0) {
    wx.showToast({ title: '请输入正数（支持小数）', icon: 'none', duration: 2000 });
    return false;
  }
  return true;
}

Page({
  data: {
    part: null,      
    stockIn: '',     
    stockOut: '',    
    stockReason: '',
    isStockOperating: false,
    isAdmin: false,
    canEditPart: false, isViewer: false,
    canBindModel: false, modelChoices: [], modelLabels: [], modelChoiceIndex: 0, modelBindingBusy: false
  },

  onLoad(options) {
    if (!auth.requireLogin()) return;
    this.setData({ isRawEmployee: auth.isRawEmployee(), isAdmin: auth.isAdmin(), isViewer: auth.isViewer() });
    if (options.id) {
      this.partId = options.id;
      this.fetchPartByID(options.id);
    } else {
      wx.showToast({ title: '未获取到备件ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  fetchPartByID(id) {
    return api.getPart(id).then(res => {
      if (res.data) {
        const part = {
          ...res.data,
          remark: res.data.remark || '无备注',
          shelfText: res.data.shelf === 0 || res.data.shelf ? res.data.shelf : '-',
          layerText: res.data.layer === 0 || res.data.layer ? res.data.layer : '-',
          locationDisplay: res.data.locationType === 'free_text'
            ? [res.data.warehouseAreaName, res.data.locationNote].filter(Boolean).join(' · ')
            : `${res.data.warehouseAreaName || '未分区'}-${res.data.shelf === 0 || res.data.shelf ? res.data.shelf : '-'}号架-第${res.data.layer === 0 || res.data.layer ? res.data.layer : '-'}层`,
          priceText: res.data.price === null || res.data.price === undefined ? '未填写' : `${res.data.price} 元`,
          maxStockText: res.data.maxStock === null || res.data.maxStock === undefined ? '未设置' : `${res.data.maxStock}${res.data.unit || ''}`,
          reorderPointText: res.data.reorderPoint === null || res.data.reorderPoint === undefined ? '未设置' : `${res.data.reorderPoint}${res.data.unit || ''}`
        };
        const scopes = String(part.assetWorkshopCodes || part.workshopCode || '').split(',').filter(Boolean);
        this.setData({ part, canEditPart: auth.canEditWorkshop(part.workshopCode), canBindModel: scopes.length > 0 && scopes.every(code => auth.canEditWorkshop(code)) });
        if (this.data.canBindModel) this.loadModelChoices();
      } else {
        wx.showToast({ title: '未找到该备件', icon: 'none' });
        wx.navigateBack();
      }
    }).catch(err => {
      console.error('获取详情失败：', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      wx.navigateBack();
    });
  },

  async loadModelChoices() {
    try {
      const result = await api.getPartModels();
      const models = (result.data || []).filter(model => !model.workshopCode || model.workshopCode === this.data.part.workshopCode).sort((a,b) => Number(a.id)-Number(b.id));
      const choices = [{ id: null, name: '解除绑定' }, ...models];
      this.setData({ modelChoices: choices, modelLabels: choices.map(model => model.id ? `${model.id} · ${model.name}${model.modelUrl ? '' : '（待生成）'}` : model.name), modelChoiceIndex: Math.max(0, choices.findIndex(model => Number(model.id) === Number(this.data.part.categoryModelId))) });
    } catch (_) { wx.showToast({ title: '模型目录加载失败', icon: 'none' }); }
  },

  async changeBoundModel(event) {
    if (!auth.requireWrite(this.data.canBindModel) || this.data.modelBindingBusy) return;
    const model = this.data.modelChoices[Number(event.detail.value)];
    if (!model) return;
    this.setData({ modelBindingBusy: true });
    try {
      await api.bindPartModel(this.data.part.partId, model.id === null ? null : Number(model.id));
      await this.fetchPartByID(this.partId);
      wx.showToast({ title: '模型绑定已保存' });
    } catch (error) { wx.showToast({ title: error.message || '绑定失败', icon: 'none' }); }
    finally { this.setData({ modelBindingBusy: false }); }
  },

  checkPartLoaded() {
    if (!this.data.part) {
      wx.showToast({ title: '备件数据未加载', icon: 'none' });
      return false;
    }
    return true;
  },

  bindStockIn(e) {
    const inputValue = e.detail.value;
    const formattedValue = formatDigitInput(inputValue);
    this.setData({ stockIn: formattedValue });
  },

  bindStockOut(e) {
    const inputValue = e.detail.value;
    const formattedValue = formatDigitInput(inputValue);
    this.setData({ stockOut: formattedValue });
  },

  bindStockReason(e) {
    this.setData({ stockReason: e.detail.value || '' });
  },

  confirmStockOperation(type) {
    if (!auth.requireWrite(auth.canEditWorkshop(this.data.part?.workshopCode))) return;
    if (this.data.isStockOperating) return;
    if (this.data.part?.inventoryStatus === '待审批') { wx.showToast({ title: '盘点审批期间库存已冻结', icon: 'none' }); return; }
    const { stockIn, stockOut, stockReason, part } = this.data;
    const quantityStr = type === 'in' ? stockIn : stockOut;

    if (!checkQuantityValid(quantityStr) || !this.checkPartLoaded()) {
      return;
    }

    const quantity = Number(quantityStr);
    if (!stockReason.trim()) {
      wx.showToast({ title: '请填写出入库原因', icon: 'none' });
      return;
    }

    if (type === 'out') {
      const currentStock = Number(part.totalStock);
      if (quantity > currentStock) {
        wx.showToast({ title: `出库数量不能超过库存（${currentStock}）`, icon: 'none' });
        return;
      }
    }

    const actionText = type === 'in' ? '入库' : '出库';
    wx.showModal({
      title: `确认${actionText}`,
      content: `确定要${actionText} ${quantity}${part.unit || ''} 吗？`,
      confirmText: '确认',
      success: res => {
        if (res.confirm) this.executeStockOperation(type, quantity);
      }
    });
  },

  async executeStockOperation(type, quantity) {
    if (!auth.requireWrite(auth.canEditWorkshop(this.data.part?.workshopCode))) return;
    if (this.data.isStockOperating) return;
    const loadingTitle = type === 'in' ? '入库中...' : '出库中...';
    const successTitle = type === 'in' ? '入库成功' : '出库成功';
    const emptyTitle = type === 'in' ? 'stockIn' : 'stockOut';
    this.setData({ isStockOperating: true });
    wx.showLoading({ title: loadingTitle, mask: true });

    try {
      const res = await api.updateStock(this.data.part._id, { type, quantity, reason: this.data.stockReason.trim() });

      if (res.success) {
        await this.fetchPartByID(this.partId);
        this.setData({ [emptyTitle]: '', stockReason: '' });
        wx.showToast({ title: successTitle, icon: 'success' });
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error(`${type === 'in' ? '入库' : '出库'}失败：`, err);
      wx.showToast({ title: err.message || `${type === 'in' ? '入库' : '出库'}失败`, icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isStockOperating: false });
    }
  },

  confirmStockIn() {
    this.confirmStockOperation('in');
  },

  confirmStockOut() {
    this.confirmStockOperation('out');
  },

  archivePart() {
    if (!auth.requireWrite(auth.canEditWorkshop(this.data.part?.workshopCode))) return;
    if (!this.data.part) return;
    if (Number(this.data.part.totalStock) !== 0) {
      wx.showToast({ title: '库存为0后才能停用', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '停用备件记录',
      content: '停用后将不再显示，但历史库存记录仍会保留。确定继续吗？',
      confirmText: '确认停用',
      confirmColor: '#c6000b',
      success: async res => {
        if (!res.confirm) return;
        try {
          await api.deletePart(this.partId);
          wx.showToast({ title: '已停用', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (err) {
          wx.showToast({ title: err.message || '停用失败', icon: 'none' });
        }
      }
    });
  }
});

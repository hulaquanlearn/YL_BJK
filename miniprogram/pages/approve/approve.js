const api = require('../../services/api.js');
const auth = require('../../services/auth.js');

function formatDateTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '未知时间';

  let normalizedTime = timeStr
    .replace('下午', ' ')
    .replace('上午', ' ')
    .trim();

  normalizedTime = normalizedTime.replace(/\//g, '-');

  const dateMatch = normalizedTime.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dateMatch) {
    const year = dateMatch[1];
    const month = dateMatch[2].padStart(2, '0');
    const day = dateMatch[3].padStart(2, '0');
    normalizedTime = normalizedTime.replace(dateMatch[0], `${year}-${month}-${day}`);
  }

  const timeMatch = normalizedTime.match(/(\d{1,2}):(\d{1,2}):?(\d{0,2})?/);
  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, '0');
    const minute = timeMatch[2].padStart(2, '0');
    const second = timeMatch[3] ? timeMatch[3].padStart(2, '0') : '00';
    normalizedTime = normalizedTime.replace(timeMatch[0], `${hour}:${minute}:${second}`);
  }

  const fullMatch = normalizedTime.match(/(\d{4})-(\d{2})-(\d{2})[\sT]?(\d{2}):(\d{2}):(\d{2})?/);
  if (fullMatch) {
    const isoStr = `${fullMatch[1]}/${fullMatch[2]}/${fullMatch[3]} ${fullMatch[4]}:${fullMatch[5]}:${fullMatch[6] || '00'}`;
    const date = new Date(isoStr);
    if (!isNaN(date.getTime())) {
      const padZero = (num) => num.toString().padStart(2, '0');
      return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
    }
  }

  const date = new Date(normalizedTime);
  if (isNaN(date.getTime())) return '格式异常';

  const padZero = (num) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
}

Page({
  data: {
    approveList: [],
    isLoading: true,
    processingOrderId: '',
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false
  },

  onLoad() {
    if (!auth.requireLogin()) return;
    this.loadApproveList();
  },

  loadApproveList(append = false) {
    if(append && this.data.isLoading) return;
    const page=append?this.data.page+1:1;
    this.setData({ isLoading: true });
    return api.getInventoryOrders({ status: '待审批', page, pageSize: this.data.pageSize })
      .then(res => {
        const handleApproveList = (res.data || []).map(order => {
          const formatCreateTime = formatDateTime(order.createTime);
          const abnormalList = order.abnormalList || [];
          const formattedAbnormalList = abnormalList.map(part => ({
            ...part,
            partName: part.partName || '未知备件',
            materialCode: part.materialCode || '无编码',
            sysStock: part.sysStock || '0',
            actualStock: part.actualStock || '0',
            sysStockUnit: part.sysStockUnit || '',
            actualStockWithUnit: `${part.actualStock || 0}${part.sysStockUnit || ''}`
          }));

          return {
            ...order,
            inventoryNo: order.inventoryNo || '无单号',
            inventoryUser: order.inventoryUser || '未知盘点人',
            inventoryRemark: order.inventoryRemark || '',
            filterParams: order.filterParams || { area: '全部', shelf: '全部', layer: '全部' },
            createTime: formatCreateTime,
            abnormalList: formattedAbnormalList
          };
        });

        this.setData({
          approveList: append ? [...this.data.approveList,...handleApproveList] : handleApproveList,
          page,
          total: Number(res.total)||0,
          hasMore: page*this.data.pageSize<Number(res.total),
          isLoading: false
        });
      })
      .catch(err => {
        console.error('加载待审批列表失败：', err);
        wx.showToast({ title: err.message || '加载失败，请检查服务器', icon: 'none' });
        this.setData({ isLoading: false });
      });
  },

  loadMore(){if(this.data.hasMore&&!this.data.isLoading)this.loadApproveList(true);},

  handleApprove(orderId, status) {
    if (!auth.requireWrite(auth.isAdmin())) return;
    if (!orderId || !status) {
      wx.showToast({ title: '盘点单ID无效', icon: 'none' });
      return;
    }

    wx.showModal({
      title: status === '已通过' ? '确认通过' : '确认驳回',
      content: status === '已通过' ? '是否确认通过该盘点单？通过后将同步更新备件库存' : '是否确认驳回该盘点单？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          this.updateApproveStatus(orderId, status);
        }
      }
    });
  },

  rejectOrder(e) {
    this.handleApprove(e.currentTarget.dataset.id, '已驳回');
  },

  passOrder(e) {
    this.handleApprove(e.currentTarget.dataset.id, '已通过');
  },

  async updateApproveStatus(orderId, status) {
    if (!auth.requireWrite(auth.isAdmin())) return;
    try {
      if (!orderId) {
        throw new Error('盘点单ID无效');
      }
      this.setData({ processingOrderId: String(orderId) });
      await api.approveInventoryOrder(orderId, { status });

      wx.hideLoading();
      this.setData({ processingOrderId: '' });
      wx.showToast({ title: `已${status === '已通过' ? '通过' : '驳回'}`, icon: 'success' });
      this.loadApproveList();
    } catch (err) {
      wx.hideLoading();
      this.setData({ processingOrderId: '' });
      console.error('更新审批状态失败：', err);
      wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' });
    }
  }
});

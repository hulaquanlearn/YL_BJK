Page({
  /**
   * 页面的初始数据
   */
  data: {
    part: {}, // 配件详情数据
    inStockNum: 0, // 入库数量
    outStockNum: 0, // 出库数量
    isLoading: true, // 加载状态
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const partId = options.id; // 从URL参数获取配件ID
    this.getPartDetail(partId); // 加载配件详情
  },

  /**
   * 从云数据库获取配件详情
   * @param {string} partId 配件的_id（云数据库默认主键）
   */
  getPartDetail(partId) {
    this.setData({ isLoading: true });

    wx.cloud.database().collection('parts')
      .doc(partId) // 用云数据库的_id查询
      .get()
      .then(res => {
        if (res.data) {
          this.setData({ part: res.data });
        } else {
          wx.showToast({ title: '未找到配件数据', icon: 'none' });
        }
        this.setData({ isLoading: false });
      })
      .catch(err => {
        console.error('获取配件详情失败：', err);
        wx.showToast({ title: '详情加载失败', icon: 'none' });
        this.setData({ isLoading: false });
      });
  },

  /**
   * 处理入库数量输入
   */
  onInStockInput(e) {
    const num = parseInt(e.detail.value) || 1; // 确保是数字，默认1
    this.setData({ inStockNum: num > 0 ? num : 1 }); // 禁止负数
  },

  /**
   * 处理出库数量输入
   */
  onOutStockInput(e) {
    const num = parseInt(e.detail.value) || 1;
    const maxNum = this.data.part.stock || 0; // 最大出库数量为当前库存
    this.setData({ outStockNum: num > 0 && num <= maxNum ? num : 1 });
  },

  /**
   * 确认入库操作
   */
  confirmInStock() {
    const { part, inStockNum } = this.data;
    // 验证数量有效性
    if (inStockNum <= 0) {
      wx.showToast({ title: '请输入有效的入库数量', icon: 'none' });
      return;
    }
    // 验证配件是否存在
    if (!part._id) {
      wx.showToast({ title: '配件数据异常', icon: 'none' });
      return;
    }

    // 调用云函数更新库存
    wx.cloud.callFunction({
      name: 'updateStock', // 云函数名称（需已部署）
      data: {
        id: part._id, // 配件的_id
        type: 'in', // 操作类型：入库
        num: inStockNum, // 入库数量
        lastUpdate: new Date().toLocaleString() // 更新时间（包含时分）
      }
    }).then(res => {
      if (res.result.success) {
        // 入库成功：更新页面显示
        this.setData({
          'part.stock': (part.stock || 0) + inStockNum,
          'part.lastUpdate': new Date().toLocaleString(),
          inStockNum: 1 // 重置输入框
        });
        wx.showToast({ title: '入库成功' });
      } else {
        // 云函数返回失败信息
        wx.showToast({ title: res.result.errMsg || '入库失败', icon: 'none' });
      }
    }).catch(err => {
      // 调用云函数出错
      console.error('入库操作失败：', err);
      wx.showToast({ title: '网络错误，入库失败', icon: 'none' });
    });
  },

  /**
   * 确认出库操作
   */
  confirmOutStock() {
    const { part, outStockNum } = this.data;
    const currentStock = part.stock || 0;
    // 验证数量有效性
    if (outStockNum <= 0 || outStockNum > currentStock) {
      wx.showToast({ title: '出库数量超出库存范围', icon: 'none' });
      return;
    }
    // 验证配件是否存在
    if (!part._id) {
      wx.showToast({ title: '配件数据异常', icon: 'none' });
      return;
    }

    // 调用云函数更新库存
    wx.cloud.callFunction({
      name: 'updateStock',
      data: {
        id: part._id,
        type: 'out', // 操作类型：出库
        num: outStockNum,
        lastUpdate: new Date().toLocaleString()
      }
    }).then(res => {
      if (res.result.success) {
        // 出库成功：更新页面显示
        this.setData({
          'part.stock': currentStock - outStockNum,
          'part.lastUpdate': new Date().toLocaleString(),
          outStockNum: 1 // 重置输入框
        });
        wx.showToast({ title: '出库成功' });
      } else {
        wx.showToast({ title: res.result.errMsg || '出库失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('出库操作失败：', err);
      wx.showToast({ title: '网络错误，出库失败', icon: 'none' });
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {},

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {}
});
const auth = require('../../services/auth.js');

Page({
  data: {
    showPreview: false,
    currentIndex: 0,
    currentTitle: '货架位置图'
  },

  onLoad(options) {
    auth.requireLogin();
  },

  onShow() {
    auth.requireLogin();
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    const titles = ['货架位置图', '物料信息说明书'];
    this.setData({
      showPreview: true,
      currentIndex: index,
      currentTitle: titles[index]
    });
  },

  onSwiperChange(e) {
    const index = e.detail.current;
    const titles = ['货架位置图', '物料信息说明书'];
    this.setData({
      currentIndex: index,
      currentTitle: titles[index]
    });
  },

  closePreview() {
    this.setData({
      showPreview: false
    });
  },

  doNothing() {}
});

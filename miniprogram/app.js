const auth = require('./services/auth.js');

App({
  globalData: { user: null },
  onLaunch() {
    this.globalData.user = auth.getUser();
  }
});

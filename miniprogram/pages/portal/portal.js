const auth=require('../../services/auth'),work=require('../../services/work-features');
Page({
 data:{groups:[]},
 onShow(){if(!auth.requireLogin())return;const user=auth.getUser(),groups=[];for(const item of work.features(user)){let g=groups.find(g=>g.title===item.group);if(!g){g={title:item.group,items:[]};groups.push(g)}g.items.push(item)}this.setData({groups})},
 openFeature(e){const f=work.feature(auth.getUser(),e.currentTarget.dataset.id);if(!f)return;wx.navigateTo({url:f.url||'/pages/webview/webview?feature='+f.id})},
 openAccount(){wx.navigateTo({url:'/pages/account/account'})}
});

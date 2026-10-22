const auth=require('../../services/auth'),work=require('../../services/work-features'),config=require('../../config');
Page({
 data:{src:'',error:'',errorDetail:'',domainBlocked:false},
 onLoad(options){if(!auth.requireLogin())return;const f=work.feature(auth.getUser(),options.feature);if(!f?.path){this.setData({error:'当前账号无权访问此功能'});return}const origin=config.apiBaseUrl.replace(/\/api\/?$/,'');if(!/^https:\/\//.test(origin)){this.setData({error:'请配置正式HTTPS服务地址'});return}wx.setNavigationBarTitle({title:f.title});this.setData({src:origin+f.path+'?mini=1'})},
 onError(event){
  const detail=event?.detail||{};
  const message=typeof detail.errMsg==='string'?detail.errMsg.slice(0,300):'';
  const code=detail.errCode==null?'':String(detail.errCode).slice(0,30);
  const domainBlocked=/not in domain list/i.test(message);
  this.setData({domainBlocked,error:domainBlocked?'网页域名尚未放行':'网页加载失败',errorDetail:domainBlocked?'微信当前使用的业务域名列表未包含 czsdsg.cn。请确认配置属于当前小程序，并在开发者工具更新配置后重新编译。':[code&&('错误码：'+code),message].filter(Boolean).join('；')||'微信未返回具体错误，请复制下方地址检查网页是否可访问。'});
 },
 retry(){this.setData({error:'',errorDetail:'',domainBlocked:false})},
 copyLink(){if(this.data.src)wx.setClipboardData({data:this.data.src})}
});

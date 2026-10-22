const auth=require('../../../../services/auth'),api=require('../../services/raw-duties');
Page({
 data:{week:api.monday(),end:'',rows:[],context:null,loading:false,error:'',counts:{total:0,pending:0,submitted:0,returned:0},search:'',visibleRows:[],ownMember:false},
 onLoad(){auth.requireLogin()},onShow(){if(auth.requireLogin())this.load()},
 async load(){if(this.data.loading)return;this.setData({loading:true,error:''});try{const context=await api.request('/context'),data=await api.request('/reports?week='+this.data.week);this.setData({context,rows:data.items.map(r=>({...r,dailyOverview:(r.dailyOverview||[]).map(d=>({...d,shortLabel:d.label==='未到日期'?'未到':d.label})),statusLabel:api.labels[r.status],editable:r.userId===context.userId&&['empty','draft','returned'].includes(r.status)})),end:data.period.end,ownMember:context.members.some(m=>m.user_id===context.userId&&m.active),counts:{total:data.items.length,pending:data.items.filter(r=>['empty','draft'].includes(r.status)).length,submitted:data.items.filter(r=>['submitted','confirmed'].includes(r.status)).length,returned:data.items.filter(r=>r.status==='returned').length}});this.filter()}catch(e){this.setData({error:e.message})}finally{this.setData({loading:false})}},
 onWeek(e){this.setData({week:api.monday(e.detail.value)});this.load()},
 onSearch(e){this.setData({search:e.detail.value});this.filter()},
 filter(){this.setData({visibleRows:this.data.rows.filter(r=>[r.name,r.position,r.team].join(' ').includes(this.data.search.trim()))})},
 fillOwn(){wx.navigateTo({url:'/packages/work/pages/detail/detail?week='+this.data.week})},
 openReport(e){const row=this.data.rows.find(r=>r.userId===Number(e.currentTarget.dataset.user));if(!row)return;if(!row.canRead&&!row.editable){wx.showToast({title:'草稿仅本人查看',icon:'none'});return}if(!row.reportId&&!row.editable&&!this.data.context.canViewDrafts){wx.showToast({title:'该人员尚未开始填报',icon:'none'});return}const extra='&date='+(e.currentTarget.dataset.date||'')+'&frequency='+encodeURIComponent(e.currentTarget.dataset.frequency||'每班');wx.navigateTo({url:(row.reportId?'/packages/work/pages/detail/detail?id='+row.reportId:'/packages/work/pages/detail/detail?week='+this.data.week+'&user='+row.userId)+extra})},
 async exportOne(e){wx.showLoading({title:'正在生成周表'});try{await api.exportReport(e.currentTarget.dataset.id)}catch(error){wx.showToast({title:error.message,icon:'none'})}finally{wx.hideLoading()}},
 onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh())}
});

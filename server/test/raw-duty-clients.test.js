const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function service(user){const requests=[],wx={request(options){requests.push(options);options.success({statusCode:200,data:{success:true,data:{ok:true}}})},uploadFile(options){requests.push(options);options.success({statusCode:200,data:JSON.stringify({success:true,data:{id:5,revision:2}})})},downloadFile(options){requests.push(options);options.success({statusCode:200,tempFilePath:'owned-preview-file'})},openDocument(options){requests.push(options);options.success()}},auth={getToken:()=>user?'test-token':'',getUser:()=>user,goLogin(){}};const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/packages/work/services/raw-duties.js'),'utf8'),{module,require:n=>n==='../../../config'?{apiBaseUrl:'https://example.invalid/api'}:auth,wx,Date,Promise,Error});return {api:module.exports,requests};}
test('小程序普通原粮人员独立使用履职请求、鉴权上传和Excel下载',async()=>{
 const {api,requests}=service({role:'viewer',staffWorkshopCode:'raw_grain'});assert.equal(api.canAccess(),true);
 await api.request('/reports/1','PUT',{revision:1});await api.upload(1,2,'selected-image');await api.exportReport(1);
 assert.equal(requests[0].method,'PUT');assert.equal(requests[0].header.Authorization,'Bearer test-token');assert.equal(requests[0].url,'https://example.invalid/api/raw-duties/reports/1');
 assert.equal(requests[1].formData.revision,2);assert.equal(requests[1].name,'file');assert.equal(requests[1].header.Authorization,'Bearer test-token');assert.equal(requests[2].header.Authorization,'Bearer test-token');assert.equal(requests[3].fileType,'xlsx');assert.equal(requests[3].showMenu,true);
});
test('小程序拒绝其他车间与未登录人员，不向网络发送越权履职请求',async()=>{
 for(const user of [{role:'viewer',staffWorkshopCode:'qu_making'},{role:'brewing'},null]){const {api,requests}=service(user);assert.equal(api.canAccess(),false);await assert.rejects(api.request('/reports','POST',{}));await assert.rejects(api.upload(1,1,'photo'));await assert.rejects(api.download('/photos/1'));assert.equal(requests.length,0)}
});
test('SQL存储在事务失败时回滚并释放连接，版本冲突不伪报成功',async()=>{
 const events=[],connection={beginTransaction:async()=>events.push('begin'),rollback:async()=>events.push('rollback'),commit:async()=>events.push('commit'),release:()=>events.push('release'),query:async()=>[{affectedRows:0}]};
 const store=require('../src/raw-duty-store').createStore({getConnection:async()=>connection});
 await assert.rejects(store.transaction(async db=>db.updateReport({id:1,checks:[],summary:'',status:'draft',feedback:''},1)),/已被更新/);assert.deepEqual(events,['begin','rollback','release']);
});
function mobilePage(failLink=false,cadence=false){
 let definition,puts=0;const clone=v=>JSON.parse(JSON.stringify(v));
 let report={id:1,user_id:11,week_start:'2026-10-12',status:'draft',revision:1,identity:{name:'示例'},template:{entries:[{id:'a',title:'检查设备',category:'设备',frequency:'每班'},{id:'b',title:'检查工具',category:'工具',frequency:'每周'}]},checks:[{dutyId:'a',result:'已完成',note:'之前已填写的情况',action:'',recordDate:'',photoIds:[]}],summary:'原有总结',feedback:'',photos:[]};
 if(cadence){report.cadence={version:2,calendar:{'2026-10-12':'work'}};report.checks=[{dutyId:'a',dailyRecords:[{date:'2026-10-12',result:'已完成',note:'周一检查已执行',recordDate:'2026-10-12',photoIds:[]}]}]}
 const requests=[],api={labels:{draft:'填写中'},request:async(url,method,body)=>{requests.push(clone(body));puts++;if(failLink&&puts===2)throw new Error('关联保存失败');report={...report,checks:clone(body.checks),cadence:body.calendar?{version:2,calendar:clone(body.calendar)}:report.cadence,summary:body.summary,revision:report.revision+1};return clone(report)},upload:async()=>{report={...report,revision:report.revision+1,photos:[{id:9}]};return clone(report)},download:async()=>'/owned-test-photo'};
 const wx={chooseMedia:o=>o.success({tempFiles:[{size:100,tempFilePath:'/selected-test-image'}]}),showLoading(){},hideLoading(){},showToast(){},enableAlertBeforeUnload(){},disableAlertBeforeUnload(){}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/packages/work/pages/detail/detail.js'),'utf8'),{require:n=>n.includes('raw-duty-week-table')?require('../src/raw-duty-week-table'):n.includes('raw-duty-cadence-summary')?require('../src/raw-duty-cadence-summary'):n.includes('raw-duty-progress')?require('../src/raw-duty-progress'):n.includes('raw-duties')?api:{requireLogin:()=>true},Page:p=>definition=p,wx,console,Date,Promise,Set,Object});
 const page={...definition,options:cadence?{date:'2026-10-12'}:{},data:clone(definition.data),context:{userId:11,members:[{user_id:11,active:true}],results:['已完成','异常']}};
 page.setData=function(patch){for(const [key,value]of Object.entries(patch)){const keys=key.replace(/\[(\d+)\]/g,'.$1').split('.');let obj=this.data;for(const k of keys.slice(0,-1))obj=obj[k];obj[keys.at(-1)]=value}};
 return {page,requests,report:clone(report)};
}
test('手机逐项上传自动关联，保留其他文字、周总结和展开位置',async()=>{
 const {page,requests,report}=mobilePage();await page.accept(report);assert.equal(page.data.expandedId,'');assert.equal(page.data.filledCount,1);page.toggleItem({currentTarget:{dataset:{id:'b'}}});
 page.data.items[0].note='本次修改尚未保存';page.data.dirty=true;
 await page.uploadPhoto({currentTarget:{dataset:{duty:'b'}}});
 assert.equal(requests.length,2);assert.equal(requests[0].checks[0].note,'本次修改尚未保存');assert.deepEqual(requests[1].checks[1].photoIds,[9]);assert.equal(page.data.summary,'原有总结');assert.equal(page.data.expandedId,'b');assert.equal(page.data.dirty,false);
});
test('手机上传后的关联保存失败时保留图片和待保存关联，可再次保存',async()=>{
 const {page,report}=mobilePage(true);await page.accept(report);page.data.dirty=true;
 await page.uploadPhoto({currentTarget:{dataset:{duty:'b'}}});assert.equal(page.data.photos[0].id,9);assert.equal(page.data.items[1].photoIds[0],9);assert.equal(page.data.dirty,true);assert.equal(page.data.busy,false);
});
test('手机筛选待填后选择结果仍保留当前编辑行，收起后按新状态归类',async()=>{
 const {page,report}=mobilePage();await page.accept(report);
 page.filterDuties({currentTarget:{dataset:{key:'missing'}}});
 assert.equal(page.data.items[0].visible,false);assert.equal(page.data.items[1].visible,true);
 page.toggleItem({currentTarget:{dataset:{id:'b'}}});
 page.onResult({currentTarget:{dataset:{index:1}},detail:{value:1}});
 assert.equal(page.data.items[1].visible,true);assert.equal(page.data.progress.evidence,0);assert.equal(page.data.progress.ready,2);
 page.onField({currentTarget:{dataset:{index:1,field:'note'}},detail:{value:'本周已检查'}});
 assert.equal(page.data.progress.ready,2);assert.equal(page.data.items[1].visible,true);
 page.toggleItem({currentTarget:{dataset:{id:'b'}}});assert.equal(page.data.items[1].visible,false);
});
test('手机切换日期保留每日独立填写，上班选择随草稿保存',async()=>{
 const {page,report,requests}=mobilePage(false,true);await page.accept(report);
 assert.equal(page.data.items[0].note,'周一检查已执行');
 page.selectDay({currentTarget:{dataset:{date:'2026-10-13'}}});assert.equal(page.data.items[0].note,'');
 page.selectDayState({currentTarget:{dataset:{state:'work'}}});assert.equal(page.data.items[0].canEdit,true);
 page.onResult({currentTarget:{dataset:{index:0}},detail:{value:1}});
 page.onField({currentTarget:{dataset:{index:0,field:'note'}},detail:{value:'周二检查执行情况'}});
 page.selectDay({currentTarget:{dataset:{date:'2026-10-12'}}});assert.equal(page.data.items[0].note,'周一检查已执行');
 await page.persist();const saved=requests[0];assert.equal(saved.calendar['2026-10-13'],'work');
 assert.equal(saved.checks[0].dailyRecords.find(c=>c.date==='2026-10-13').note,'周二检查执行情况');
 page.selectDay({currentTarget:{dataset:{date:'2026-10-13'}}});assert.equal(page.data.items[0].note,'周二检查执行情况');
});

test('手机单项保存可直接返回周表或进入下一项，无需手动向上滚动',async()=>{
 const {page,report,requests}=mobilePage();await page.accept(report);page.toggleItem({currentTarget:{dataset:{id:'a'}}});
 page.onField({currentTarget:{dataset:{index:0,field:'note'}},detail:{value:'单项填写保存'}});assert.equal(page.data.nextItemId,'b');
 await page.saveItem({currentTarget:{dataset:{next:true}}});assert.equal(requests[0].checks[0].note,'单项填写保存');assert.equal(page.data.expandedId,'b');assert.equal(page.data.dirty,false);
 page.onResult({currentTarget:{dataset:{index:1}},detail:{value:1}});page.onField({currentTarget:{dataset:{index:1,field:'note'}},detail:{value:'下一项已完成'}});
 await page.saveItem();assert.equal(page.data.expandedId,'');assert.equal(requests.at(-1).checks[1].note,'下一项已完成');
});

test('手机选择异常自动展开处理进展，补充原因后与已完成分别统计',async()=>{
 const {page,report}=mobilePage();await page.accept(report);
 page.onResult({currentTarget:{dataset:{index:1}},detail:{value:2}});
 assert.equal(page.data.items[1].result,'异常');assert.equal(page.data.items[1].extraOpen,true);assert.equal(page.data.progress.evidence,1);
 page.onField({currentTarget:{dataset:{index:1,field:'note'}},detail:{value:'工具破损'}});
 assert.equal(page.data.progress.abnormal,1);assert.equal(page.data.progress.done,1);assert.equal(page.data.progress.ready,2);
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const work=require('../../miniprogram/services/work-features');
test('小程序功能入口与网页权限一致，首页整卡进入对应功能',async()=>{
 const {canReadFeature}=await import('../../spare-parts-web-release/src/utils/feature-access.mjs');
 for(const user of [{role:'admin'},{role:'raw_grain'},{role:'qu_making'},{role:'brewing'},{role:'viewer',staffWorkshopCode:'raw_grain'},{role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'group_leader'},{role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'group_leader'},{role:'viewer'},null])for(const [id,path]of [['raw','/raw-duties'],['attendance','/attendance']])assert.equal(work.allowed(user,id),canReadFeature(user,path));
 let page;const urls=[],auth={requireLogin:()=>true,getUser:()=>({role:'admin',displayName:'模拟管理员'})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/portal/portal.js'),'utf8'),{require:n=>n.endsWith('auth')?auth:work,Page:p=>page=p,wx:{navigateTo:o=>urls.push(o.url)}});
 page.setData=p=>page.data={...page.data,...p};page.onShow();assert.equal(page.data.groups.length,2);assert.equal(work.features({role:'admin'}).some(f=>f.id==='qu'),false);
 page.openFeature({currentTarget:{dataset:{id:'raw'}}});page.openFeature({currentTarget:{dataset:{id:'attendance'}}});assert.deepEqual(urls,['/packages/work/pages/home/home','/pages/webview/webview?feature=attendance']);
 const source=fs.readFileSync(require.resolve('../../miniprogram/pages/portal/portal.wxml'),'utf8');assert.match(source,/<view[^>]*class="business-row[^>]*bindtap="openFeature"/);
});
test('内嵌页仅允许固定的已授权HTTPS路径，不把登录令牌写入URL',()=>{
 const app=JSON.parse(fs.readFileSync(require.resolve('../../miniprogram/app.json'),'utf8'));
 assert.ok(app.pages.includes('pages/webview/webview'));
 assert.equal(app.subPackages.some(p=>p.pages.includes('pages/web/web')),false);
 let page;vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/webview/webview.js'),'utf8'),{require:n=>n.endsWith('auth')?{requireLogin:()=>true,getUser:()=>({role:'admin'})}:n.endsWith('work-features')?work:{apiBaseUrl:'https://czsdsg.cn/api'},Page:p=>page=p,wx:{setNavigationBarTitle(){}}});page.setData=p=>page.data={...page.data,...p};page.onLoad({feature:'attendance'});assert.equal(page.data.src,'https://czsdsg.cn/attendance?mini=1');page.onLoad({feature:'https://other.invalid'});assert.match(page.data.error,/无权/);
});

test('库位帮助整行进入3D网页，备件只读账号同样可查看且不增加首页业务卡',()=>{
 for(const user of [{role:'admin'},{role:'raw_grain'},{role:'viewer'}]){
  assert.equal(work.feature(user,'warehouse3d').path,'/warehouse-3d');
  assert.equal(work.features(user).some(f=>f.id==='warehouse3d'),false);
 }
 assert.equal(work.feature(null,'warehouse3d'),undefined);
 let page;const urls=[];
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/home/home.js'),'utf8'),{require:()=>({}),Page:p=>page=p,wx:{navigateTo:o=>urls.push(o.url)}});
 page.gotoWarehouse3D();assert.deepEqual(urls,['/pages/webview/webview?feature=warehouse3d']);
 assert.match(fs.readFileSync(require.resolve('../../miniprogram/pages/home/home.wxml'),'utf8'),/<view[^>]*class="tool-item"[^>]*bindtap="gotoWarehouse3D"/);
 vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/pages/webview/webview.js'),'utf8'),{require:n=>n.endsWith('auth')?{requireLogin:()=>true,getUser:()=>({role:'viewer'})}:n.endsWith('work-features')?work:{apiBaseUrl:'https://czsdsg.cn/api'},Page:p=>page=p,wx:{setNavigationBarTitle(){}}});
 page.setData=p=>page.data={...page.data,...p};page.onLoad({feature:'warehouse3d'});
 assert.equal(page.data.src,'https://czsdsg.cn/warehouse-3d?mini=1');
 page.onError({detail:{errMsg:'net::ERR_CERT_DATE_INVALID',errCode:123}});assert.equal(page.data.error,'网页加载失败');assert.match(page.data.errorDetail,/ERR_CERT_DATE_INVALID/);assert.match(page.data.errorDetail,/123/);page.retry();assert.equal(page.data.error,'');assert.equal(page.data.errorDetail,'');
 page.onError();assert.match(page.data.errorDetail,/未返回具体错误/);
 page.onError({detail:{errMsg:'web-view load failed due to not in domain list'}});assert.equal(page.data.domainBlocked,true);assert.equal(page.data.error,'网页域名尚未放行');assert.match(page.data.errorDetail,/业务域名列表/);page.retry();assert.equal(page.data.domainBlocked,false);
});

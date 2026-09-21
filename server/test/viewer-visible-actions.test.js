const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {once}=require('node:events');
const path=require('node:path');
const {pool}=require('../src/db');
const {enforceReadOnly}=require('../src/workshop-scope');

test('viewer reads account roles and basic list, while all account and business writes fail before database access',async()=>{
  const saved=pool.query;let queries=0;
  pool.query=async()=>{queries++;return [[{id:1,username:'test',displayName:'测试账号',role:'admin',enabled:1,lastLoginAt:'private-metadata',createdAt:'private-metadata'}]]};
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:9,role:'viewer'};next()});
  app.use(enforceReadOnly);app.use('/users',require('../src/routes/users'));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({msg:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/users');assert.equal(response.status,200);
    assert.deepEqual((await response.json()).data,[{id:'1',username:'test',displayName:'测试账号',role:'admin',enabled:true}]);
    assert.equal((await fetch(base+'/users/roles')).status,200);
    const before=queries;
    for(const [method,url] of [['POST','/users'],['PATCH','/users/1'],['POST','/users/1/reset-password'],['POST','/parts'],['PATCH','/parts/1'],['DELETE','/parts/1'],['POST','/inventory-orders/1/approve'],['PUT','/knowledge/1'],['POST','/plc/projects'],['POST','/part-category-model-matches/apply']]){
      const result=await fetch(base+url,{method});assert.equal(result.status,403,url);assert.match((await result.json()).msg,/权限不足/);
    }
    assert.equal(queries,before);
  }finally{pool.query=saved;await new Promise(resolve=>server.close(resolve))}
});

test('mini-program viewer sees role context, visits read pages and gets permission feedback before write handlers or requests',async()=>{
  const requests=[],modals=[],navigations=[];
  global.wx={getStorageSync:key=>key.endsWith('token')?'synthetic-token':{id:9,role:'viewer',displayName:'只读测试'},showModal:options=>modals.push(options),showToast(){},showLoading(){},hideLoading(){},stopPullDownRefresh(){},navigateTo:options=>navigations.push(options.url),request:options=>{requests.push(options);options.success({statusCode:200,data:{success:true,data:[]}})}};
  const miniRoot=path.resolve(__dirname,'../../miniprogram');
  function page(name){let definition;global.Page=value=>definition=value;const file=path.join(miniRoot,'pages',name,name+'.js');delete require.cache[require.resolve(file)];require(file);const instance={...definition,data:structuredClone(definition.data),setData(values){Object.assign(this.data,values)}};return instance}
  try{
    const home=page('home');home.onShow();assert.equal(home.data.isViewer,true);home.gotoApprove();assert.match(navigations[0],/approve/);
    const beforeNavigation=navigations.length;home.gotoAddPart();assert.equal(navigations.length,beforeNavigation);assert.equal(modals.at(-1).title,'权限不足');
    const users=page('users');users.onLoad();await new Promise(resolve=>setImmediate(resolve));assert.equal(users.data.isViewer,true);assert.ok(requests.some(r=>r.url.endsWith('/users')));
    const detail=page('detail');detail.data.part={_id:1,workshopCode:'raw_grain',totalStock:0};
    const inventory=page('inventory'),approve=page('approve'),add=page('addPart');
    approve.onLoad();await new Promise(resolve=>setImmediate(resolve));assert.ok(requests.some(r=>r.url.includes('/inventory-orders')));
    const before=requests.length;
    for(const action of [()=>detail.confirmStockIn(),()=>detail.confirmStockOut(),()=>detail.archivePart(),()=>inventory.markAllNormal(),()=>inventory.completeInventory(),()=>inventory.submitInventoryToApprove(),()=>approve.passOrder({currentTarget:{dataset:{id:1}}}),()=>users.openCreate(),()=>users.openReset({currentTarget:{dataset:{id:1}}}),()=>add.submitAdd()]){
      const count=modals.length;await action();assert.equal(modals.length,count+1);assert.equal(modals.at(-1).title,'权限不足');
    }
    assert.equal(requests.length,before);assert.equal(users.data.showCreate,false);assert.equal(users.data.showReset,false);
    const api=require(path.join(miniRoot,'services/api.js'));
    for(const request of [()=>api.addPart({}),()=>api.updateStock(1,{}),()=>api.deletePart(1),()=>api.createUser({}),()=>api.updateUser(1,{}),()=>api.resetUserPassword(1,'Test12')])await assert.rejects(request(),{statusCode:403});
    assert.equal(requests.length,before);
    await api.getParts();await api.chat([{role:'user',content:'测试查询'}]);assert.equal(requests.length,before+2);
  }finally{delete global.wx;delete global.Page}
});

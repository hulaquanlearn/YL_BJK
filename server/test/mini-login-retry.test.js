const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
function fixture(){
 let page,token='valid-session',user={id:1},cleared=0,launched=0;
 const api={},auth={getToken:()=>token,getUser:()=>user,setSession:(t,u)=>{token=t;user=u},clearSession:()=>{token='';user=null;cleared++}};
 const context=vm.createContext({Page:p=>page=p,require:p=>p.includes('/api')?api:auth,getApp:()=>({globalData:{}}),wx:{reLaunch(){launched++},showToast(){}},console});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/login/login.js'),'utf8'),context);
 page.data={...page.data};page.setData=patch=>Object.assign(page.data,patch);
 return {page,api,auth,state:()=>({token,user,cleared,launched})};
}
test('mini startup keeps a valid session through a network failure and retries without a password',async()=>{
 const f=fixture();f.api.getMe=async()=>{throw Error('服务器响应超时')};await f.page.verifySession();assert.equal(f.state().token,'valid-session');assert.equal(f.state().cleared,0);assert.equal(f.page.data.retrySession,true);assert.equal(f.page.data.loading,false);
 f.api.getMe=async()=>({data:{user:{id:1,name:'restored'}}});await f.page.verifySession();assert.equal(f.state().launched,1);assert.equal(f.state().user.name,'restored');assert.equal(f.page.data.retrySession,false);
});
test('mini startup expires an explicit authorization failure and ignores a response after leaving',async()=>{
 const f=fixture();f.api.getMe=async()=>{throw Object.assign(Error('失效'),{statusCode:401})};await f.page.verifySession();assert.equal(f.state().cleared,1);assert.equal(f.page.data.retrySession,false);
 const g=fixture();let finish;g.api.getMe=()=>new Promise(resolve=>finish=resolve);const pending=g.page.verifySession();g.page.onUnload();finish({data:{user:{id:999}}});await pending;assert.equal(g.state().user.id,1);assert.equal(g.state().launched,0);
});
test('mini session verification prevents duplicate authentication requests while pending',async()=>{
 const f=fixture();let calls=0,finish;f.api.getMe=()=>{calls++;return new Promise(resolve=>finish=resolve)};const pending=f.page.verifySession();await f.page.verifySession();assert.equal(calls,1);finish({data:{user:{id:1}}});await pending;
});

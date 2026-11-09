import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import realAxios from 'axios'
import {ref,computed} from 'vue'
const pending=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function transport({viewer=false}={}){
 let token='session-A',http;const requests=[],effects=[]
 const axios={...realAxios,create(options){http=realAxios.create({...options,adapter:config=>{const p=pending();requests.push({...p,config});return p.promise}});return http}}
 const code=fs.readFileSync(new URL('../src/api/index.js',import.meta.url),'utf8').split('export const getHealth')[0].replace(/^import .+$/gm,'')
 vm.runInContext(code,vm.createContext({axios,Blob,FormData,ElMessage:{error:message=>effects.push({toast:message})},clearSession:()=>{effects.push({logout:true});token=''},getToken:()=>token,isViewer:()=>viewer,userWorkshopCode:()=>'',clientPlatform:()=> 'web',canSubmitInventoryRequest:()=>!viewer,isBusinessWrite:()=>true,PERMISSION_MESSAGE:'denied',window:{location:{pathname:'/inventory',search:'?q=bolt',hash:'#details',assign:path=>effects.push({path})}}}))
 return {http,requests,effects,switch:()=>{token='session-B'},token:()=>token}
}
test('late authenticated success is cancelled after account change instead of entering the new account view',async()=>{
 const s=transport(),result=s.http.get('/fire-inspection');await tick();s.switch();s.requests[0].resolve({data:{data:'account-A-private'},status:200,headers:{},config:s.requests[0].config});await assert.rejects(result,e=>realAxios.isCancel(e));assert.equal(s.token(),'session-B');assert.deepEqual(s.effects,[])
})
test('late 401 cannot log out or redirect a newer session',async()=>{
 const s=transport(),result=s.http.get('/inventory');await tick();s.switch();const config=s.requests[0].config;s.requests[0].reject({config,response:{status:401,data:{msg:'expired old session'}}});await assert.rejects(result);assert.equal(s.token(),'session-B');assert.deepEqual(s.effects,[])
})
test('session is rechecked after asynchronous blob-error parsing',async()=>{
 const s=transport(),body=pending(),blob=new Blob(['{}'],{type:'application/json'});blob.text=()=>body.promise;const result=s.http.get('/knowledge/20/preview');await tick();s.requests[0].reject({config:s.requests[0].config,response:{status:401,data:blob}});await tick();s.switch();body.resolve('{"msg":"old request"}');await assert.rejects(result);assert.equal(s.token(),'session-B');assert.deepEqual(s.effects,[])
})
test('a 401 belonging to the current session still clears it and returns to login',async()=>{
 const s=transport(),result=s.http.get('/inventory');await tick();s.requests[0].reject({config:s.requests[0].config,response:{status:401,data:{msg:'expired'}}});await assert.rejects(result);assert.equal(s.token(),'');assert.ok(s.effects.some(x=>x.logout));assert.ok(s.effects.some(x=>x.path==='/login?redirect=%2Finventory%3Fq%3Dbolt%23details'))
})
function routeSubject(){let token='A',user={id:1,role:'admin'},guard;const read=pending(),changes=[];const source=fs.readFileSync(new URL('../src/router/index.js',import.meta.url),'utf8').replace(/^import .+$/gm,'').replace('export default router','');vm.runInContext(source,vm.createContext({getToken:()=>token,getUser:()=>user,setSession:(t,u)=>{changes.push({token:t,user:u});token=t;user=u},getMe:()=>read.promise,createWebHistory(){},createRouter:()=>({beforeEach:fn=>{guard=fn}}),canReadFeature:()=>true,isAppSurface:()=>false,appPathAllowed:()=>true,isMobileNavigationAllowed:()=>true,navigator:{userAgent:'Browser'},window:{addEventListener(){}}}));return {read,changes,guard:()=>guard({path:'/inventory',fullPath:'/inventory',meta:{}}),switch(next='B'){token=next;user=next?{id:2,role:'viewer'}:null},token:()=>token}}
for(const next of ['B',''])test('pending route verification cannot restore a previous account after '+(next?'switch':'logout'),async()=>{const s=routeSubject(),p=s.guard();s.switch(next);s.read.resolve({data:{user:{id:1,role:'admin'}}});assert.equal(await p,false);assert.equal(s.token(),next);assert.equal(s.changes.length,0)})
function accountSubject(){
 let token='A',user={id:1,role:'admin',username:'account-A',displayName:'Alice'},unmount;const profile=pending(),password=pending(),effects=[],events=new Map()
 const source=fs.readFileSync(new URL('../src/views/Account.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({ref,computed,watch(){},isAppSurface:()=>false,useRoute:()=>({query:{}}),useRouter:()=>({replace:path=>effects.push({path})}),ElMessage:{success:msg=>effects.push({msg}),warning(){}},getToken:()=>token,getUser:()=>user,setSession:(t,u)=>{effects.push({set:true});token=t;user=u},clearSession:()=>{effects.push({logout:true});token=''},updateMyProfile:()=>profile.promise,changePassword:()=>password.promise,getMe:async()=>({data:{user}}),onMounted:fn=>{},onBeforeUnmount:fn=>{unmount=fn},onBeforeRouteLeave(){},onBeforeRouteUpdate(){},staffPositionLabel:()=>'',window:{addEventListener:(n,fn)=>events.set(n,fn),removeEventListener(){}}})
 vm.runInContext(source+'\nthis.state={saveProfile,savePassword,sessionChanged,user,displayName,passwords,saving,changingPassword};',context)
 return {s:context.state,profile,password,effects,switch(){token='B';user={id:2,role:'viewer',username:'account-B',displayName:'Bob'};context.state.sessionChanged()},token:()=>token,unmount:()=>unmount()}
}
test('profile completion from a previous account cannot replace current profile or persist mixed identity',async()=>{const {s,...f}=accountSubject();s.displayName.value='Alice edited';const p=s.saveProfile();f.switch();f.profile.resolve({data:{user:{id:1,role:'admin',displayName:'Alice edited'}}});await p;assert.equal(s.user.value.id,2);assert.equal(s.displayName.value,'Bob');assert.deepEqual(f.effects,[]);assert.equal(f.token(),'B')})
test('password fields clear on account switch and old completion cannot log out the new account',async()=>{const {s,...f}=accountSubject();s.passwords.value={oldPassword:'Old1',newPassword:'New2',confirm:'New2'};const p=s.savePassword();f.switch();assert.ok(Object.values(s.passwords.value).every(v=>v===''));f.password.resolve({data:{success:true}});await p;assert.equal(f.token(),'B');assert.deepEqual(f.effects,[])})
test('leaving the account page prevents a late profile save from committing local session state',async()=>{const {s,...f}=accountSubject();s.displayName.value='New name';const p=s.saveProfile();f.unmount();f.profile.resolve({data:{user:{id:1,role:'admin',displayName:'New name'}}});await p;assert.deepEqual(f.effects,[])})
function loginSubject({storageError=false}={}){const p=pending(),effects=[];let leave,calls=0;const source=fs.readFileSync(new URL('../src/views/Login.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'');const c=vm.createContext({ref,reactive:x=>x,useRoute:()=>({query:{}}),useRouter:()=>({replace:path=>effects.push({path})}),ElMessage:{warning(){}},login:()=>{calls++;return p.promise},setSession:(token,user)=>{if(storageError)throw Error('本机存储不可用');effects.push({token,user})},onBeforeUnmount:fn=>{leave=fn}});vm.runInContext(source+'\nform.username="fixture";form.password="Fixture1";this.s={form,submit,loading,formError};',c);return {s:c.s,p,effects,leave:()=>leave(),calls:()=>calls}}
test('leaving login while the request is pending does not start a session or force navigation afterward',async()=>{const f=loginSubject(),r=f.s.submit();f.leave();f.p.resolve({data:{token:'fixture-A',user:{id:1}}});await r;assert.deepEqual(f.effects,[])})
test('failed login is handled and unlocks the form for retry; rapid repeated submit only sends once',async()=>{const f=loginSubject(),r=f.s.submit();await f.s.submit();assert.equal(f.calls(),1);f.p.reject(Error('network failure already reported'));await assert.doesNotReject(r);assert.equal(f.s.loading.value,false)})


test('request permission rejection reaches the shared Axios error boundary without sending a request',async()=>{
 const f=transport({viewer:true});await assert.rejects(f.http.post('/parts',{}),/denied/);assert.equal(f.requests.length,0);assert.deepEqual(f.effects,[{toast:'denied'}]);
});
test('a local session storage error is visible on login and leaves the form retryable',async()=>{
 const f=loginSubject({storageError:true}),result=f.s.submit();f.p.resolve({data:{token:'fixture-token',user:{id:1}}});await result;assert.match(f.s.formError.value,/本机存储不可用/);assert.equal(f.s.loading.value,false);assert.deepEqual(f.effects,[]);
});

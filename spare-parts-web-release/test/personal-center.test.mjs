import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {canReadFeature} from '../src/utils/feature-access.mjs'
import {isBusinessWrite} from '../src/utils/write-permission.mjs'
function account(role='viewer',tab='usage'){
 const calls=[],watchers=[],route={query:{tab}},source=fs.readFileSync(new URL('../src/views/Account.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const ctx=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},watch:(get,callback)=>watchers.push({get,callback}),useRoute:()=>route,useRouter:()=>({replace:value=>calls.push(['navigate',value])}),getUser:()=>({id:'2',username:'worker',role,displayName:'原姓名'}),getToken:()=> 'token',setSession:(token,user)=>calls.push(['session',token,user]),clearSession:()=>calls.push(['clear']),ElMessage:{success:text=>calls.push(['success',text]),warning:text=>calls.push(['warning',text])},updateMyProfile:async body=>{calls.push(['profile',body]);return {data:{user:{id:'2',role,displayName:body.displayName}}}},changePassword:async body=>{calls.push(['password',body]);return {success:true}},staffPositionLabel:()=> '员工'})
 vm.runInContext(source+'\nthis.subject={tab,displayName,user,saveProfile,passwords,savePassword};',ctx);return {state:ctx.subject,calls,navigateTab(value){route.query.tab=value;for(const w of watchers)w.callback(w.get())}}
}
test('every authenticated role can maintain its own profile; usage query parameters do not grant access',()=>{
 for(const role of ['admin','raw_grain','qu_making','brewing','viewer']){assert.equal(canReadFeature({role,staffWorkshopCode:'raw_grain',staffPosition:'employee'},'/account'),true);assert.equal(account(role).state.tab.value,role==='admin'?'usage':'profile')}
 assert.equal(isBusinessWrite('PATCH','/auth/profile'),false);assert.equal(isBusinessWrite('PATCH','/users/1'),true)
})

test('storage and users stay inside the administrator personal center, including query navigation and browser history',()=>{
 for(const role of ['admin','raw_grain','qu_making','brewing','viewer']){
  const p=account(role,'storage');assert.equal(p.state.tab.value,role==='admin'?'storage':'profile')
  p.navigateTab('profile');assert.equal(p.state.tab.value,'profile')
  p.navigateTab('storage');assert.equal(p.state.tab.value,role==='admin'?'storage':'profile')
  p.navigateTab('users');assert.equal(p.state.tab.value,role==='admin'?'users':'profile')
  p.navigateTab('unknown');assert.equal(p.state.tab.value,'profile')
 }
})
test('profile save sends only own display name and updates local session identity',async()=>{
 const {state:s,calls}=account();s.displayName.value=' 新姓名 ';await s.saveProfile();const body=calls.find(c=>c[0]==='profile')[1];assert.deepEqual(Object.keys(body),['displayName']);assert.equal(body.displayName,'新姓名');assert.equal(calls.find(c=>c[0]==='session')[2].displayName,'新姓名')
})
test('password mismatch makes no API call; success clears secrets and session before returning to login',async()=>{
 const {state:s,calls}=account();s.passwords.value={oldPassword:'old',newPassword:'New123',confirm:'different'};await s.savePassword();assert.equal(calls.filter(c=>c[0]==='password').length,0);s.passwords.value.confirm='New123';await s.savePassword();assert.equal(calls.filter(c=>c[0]==='password').length,1);assert.ok(calls.find(c=>c[0]==='clear'));assert.equal(calls.find(c=>c[0]==='navigate')[1],'/login');assert.equal(s.passwords.value.newPassword,'');assert.equal(s.passwords.value.oldPassword,'')
})

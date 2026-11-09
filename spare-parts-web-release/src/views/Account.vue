<template>
 <div class="personal-center">
  <label v-if="!nativeAndroid" class="business-mobile-only mobile-account-switcher">个人中心<select :value="tab" aria-label="选择个人中心内容" @change="requestTab($event)"><template v-if="isAdmin"><option value="usage">平台用量与模型</option><option value="storage">数据管理</option><option value="users">账号管理</option></template><option value="profile">个人资料与账号安全</option></select></label>
  <el-tabs v-model="tab" class="personal-tabs" @tab-change="changeTab">

   <el-tab-pane v-if="isAdmin" label="平台用量与模型" name="usage"><PersonalUsage v-if="tab==='usage' && isAdmin" /></el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="数据管理" name="storage"><WorkStorage v-if="tab==='storage' && isAdmin" /></el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="账号管理" name="users"><AccountUsers v-if="tab==='users' && isAdmin" /></el-tab-pane>
   <el-tab-pane label="个人资料" name="profile">
    <div class="profile-grid">
     <section class="personal-panel"><h3>基本资料</h3>
      <el-form label-position="top" @submit.prevent="saveProfile">
       <el-form-item label="登录账号"><el-input :model-value="user.username" disabled /></el-form-item>
       <el-form-item label="姓名"><el-input v-model="displayName" maxlength="50" show-word-limit autocomplete="name" aria-label="姓名" /></el-form-item>
       <div class="identity-grid"><div><small>账号角色</small><strong>{{roleName}}</strong></div><div><small>所属车间</small><strong>{{workshopName||'未分配'}}</strong></div><div><small>岗位</small><strong>{{user.staffPosition?staffPositionLabel(user):'未分配'}}</strong></div></div>
       <el-button native-type="submit" type="primary" :loading="saving" :disabled="!displayName.trim()||displayName.trim()===user.displayName">保存资料</el-button>
      </el-form>
     </section>
     <details class="personal-panel account-security" :open="!nativeAndroid"><summary>账号安全<span v-if="nativeAndroid">修改密码<el-icon><ArrowRight/></el-icon></span></summary><p class="muted">修改密码后，当前账号的所有登录会话将退出。</p>
      <el-form label-position="top" @submit.prevent="savePassword">
       <el-form-item label="原密码"><el-input v-model="passwords.oldPassword" type="password" show-password autocomplete="current-password" aria-label="原密码" /></el-form-item>
       <el-form-item label="新密码"><el-input v-model="passwords.newPassword" type="password" show-password autocomplete="new-password" aria-label="新密码" /><small class="password-help">须同时包含大写字母、小写字母和数字</small></el-form-item>
       <el-form-item label="确认新密码"><el-input v-model="passwords.confirm" type="password" show-password autocomplete="new-password" aria-label="确认新密码" /></el-form-item>
       <el-button native-type="submit" :loading="changingPassword">修改密码</el-button>
      </el-form>
     </details>
    </div>
   </el-tab-pane>
  </el-tabs>
 </div>
</template>
<script setup>
import {isAppSurface} from '../app/surface.mjs'
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {getMe,updateMyProfile,changePassword} from '../api'
import {getUser,getToken,setSession,clearSession} from '../auth'
import {staffPositionLabel} from '../utils/feature-access.mjs'
import PersonalUsage from '../components/PersonalUsage.vue'
import WorkStorage from './WorkStorage.vue'
import AccountUsers from '../components/AccountUsers.vue'
const route=useRoute(),router=useRouter(),user=ref(getUser()||{}),displayName=ref(user.value.displayName||''),saving=ref(false),changingPassword=ref(false)
const nativeAndroid=isAppSurface()
const isAdmin=computed(()=>!nativeAndroid&&user.value.role==='admin')
const allowedTab=value=>isAdmin.value&&value==='records'?'usage':value==='profile'||isAdmin.value&&['usage','storage','users'].includes(value)?value:'profile'
const tab=ref(allowedTab(route.query.tab||'profile'))
let alive=true
const accountIdentity=()=>JSON.stringify([getUser()?.id??getUser()?._id,getUser()?.role,getUser()?.staffWorkshopCode,getUser()?.staffPosition])
const roleName=computed(()=>({admin:'系统管理员',raw_grain:'原粮车间管理员',qu_making:'制曲车间管理员',brewing:'酿酒车间管理员',viewer:'车间人员'})[user.value.role]||'车间人员')
const workshopName=computed(()=>({raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'})[user.value.workshopCode||user.value.staffWorkshopCode||user.value.role]||'')
const passwords=ref({oldPassword:'',newPassword:'',confirm:''})
let profileRequest=0,passwordRequest=0,knownToken=getToken(),knownIdentity=accountIdentity()
const ownsRequest=(token,owner)=>alive&&token===getToken()&&owner===accountIdentity()
function changeTab(value){router.replace({path:'/account',query:value==='profile'?{}:{tab:value}})}
function requestTab(event){const next=allowedTab(event.target.value);tab.value=next;changeTab(next);event.target.value=tab.value}
function sessionChanged(){const token=getToken(),identity=accountIdentity();if(token!==knownToken||identity!==knownIdentity){profileRequest++;passwordRequest++;saving.value=false;changingPassword.value=false;passwords.value={oldPassword:'',newPassword:'',confirm:''}}knownToken=token;knownIdentity=identity;user.value=getUser()||{};displayName.value=user.value.displayName||'';tab.value=allowedTab(tab.value)}
watch(()=>route.query.tab,value=>{tab.value=allowedTab(value||'profile')})
async function saveProfile(){if(!alive)return;if(knownToken!==getToken()||knownIdentity!==accountIdentity()){sessionChanged();return}if(saving.value)return;const token=getToken(),owner=accountIdentity(),request=++profileRequest;saving.value=true;try{const result=await updateMyProfile({displayName:displayName.value.trim()});if(!ownsRequest(token,owner)||request!==profileRequest)return;user.value=result.data.user;displayName.value=user.value.displayName;setSession(token,user.value);ElMessage.success('个人资料已更新')}catch{}finally{if(ownsRequest(token,owner)&&request===profileRequest)saving.value=false}}
async function savePassword(){
 if(!alive)return
 if(knownToken!==getToken()||knownIdentity!==accountIdentity()){sessionChanged();return}
 if(changingPassword.value)return
 if(!passwords.value.oldPassword)return ElMessage.warning('请输入原密码')
 if(!/[A-Z]/.test(passwords.value.newPassword)||!/[a-z]/.test(passwords.value.newPassword)||!/[0-9]/.test(passwords.value.newPassword))return ElMessage.warning('新密码须包含大写字母、小写字母和数字')
 if(passwords.value.newPassword!==passwords.value.confirm)return ElMessage.warning('两次输入的新密码不一致')
 const token=getToken(),owner=accountIdentity(),request=++passwordRequest
 changingPassword.value=true
 try{await changePassword({oldPassword:passwords.value.oldPassword,newPassword:passwords.value.newPassword});if(!ownsRequest(token,owner)||request!==passwordRequest)return;passwords.value={oldPassword:'',newPassword:'',confirm:''};clearSession();ElMessage.success('密码已修改，请重新登录');router.replace('/login')}catch{}finally{if(ownsRequest(token,owner)&&request===passwordRequest)changingPassword.value=false}
}
onMounted(async()=>{window.addEventListener('auth-changed',sessionChanged);const owner=accountIdentity(),token=getToken();try{const result=await getMe();if(!ownsRequest(token,owner))return;user.value=result.data.user;displayName.value=user.value.displayName;setSession(token,user.value);tab.value=allowedTab(tab.value);if(tab.value!==route.query.tab&&route.query.tab)changeTab(tab.value)}catch{}})
onBeforeUnmount(()=>{alive=false;profileRequest++;passwordRequest++;window.removeEventListener('auth-changed',sessionChanged)})
</script>
<style scoped>
.personal-center{width:100%;min-width:0;margin:0;color:#243b50}.personal-tabs :deep(.el-tabs__item){height:48px;font-size:15px}.personal-tabs :deep(.el-tabs__content){padding-top:20px;overflow:visible}.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:1100px}.personal-panel{background:white;border:1px solid #e2e8ef;border-radius:14px;padding:28px}.personal-panel h3{font-size:18px;margin:0 0 10px}.muted,.password-help{color:#7c8998;font-size:13px;line-height:1.8}.muted{margin:0 0 26px}.personal-panel :deep(.el-input__wrapper){min-height:38px}.identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:26px 0}.identity-grid small,.identity-grid strong{display:block}.identity-grid small{font-size:12px;color:#8491a0;margin-bottom:7px}.identity-grid strong{font-size:14px;font-weight:500}.password-help{display:block;margin-top:6px}.personal-panel .el-button{min-height:40px}@media(max-width:800px){.profile-grid{grid-template-columns:1fr;gap:16px}.personal-panel{padding:20px}.personal-tabs :deep(.el-tabs__item){font-size:14px;padding:0 14px}.personal-panel :deep(.el-input__wrapper),.personal-panel .el-button{min-height:44px}}
</style>

<style scoped>
.account-security>summary{font-size:18px;font-weight:600;color:#243b50;list-style:none;cursor:pointer;margin-bottom:16px}.account-security>summary::-webkit-details-marker{display:none}.account-security>summary>span{float:right;display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:400;color:#748297}.account-security:not([open])>summary{margin:0}.account-security[open]>summary>span>.el-icon{transform:rotate(90deg)}
</style>

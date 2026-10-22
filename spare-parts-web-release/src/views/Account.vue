<template>
 <div class="personal-center">
  <el-tabs v-model="tab" class="personal-tabs" @tab-change="changeTab">
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
     <section class="personal-panel"><h3>账号安全</h3><p class="muted">修改密码后，当前账号的所有登录会话将退出。</p>
      <el-form label-position="top" @submit.prevent="savePassword">
       <el-form-item label="原密码"><el-input v-model="passwords.oldPassword" type="password" show-password autocomplete="current-password" aria-label="原密码" /></el-form-item>
       <el-form-item label="新密码"><el-input v-model="passwords.newPassword" type="password" show-password autocomplete="new-password" aria-label="新密码" /><small class="password-help">须同时包含大写字母、小写字母和数字</small></el-form-item>
       <el-form-item label="确认新密码"><el-input v-model="passwords.confirm" type="password" show-password autocomplete="new-password" aria-label="确认新密码" /></el-form-item>
       <el-button native-type="submit" :loading="changingPassword">修改密码</el-button>
      </el-form>
     </section>
    </div>
   </el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="API 与 Codex 用量" name="usage"><PersonalUsage v-if="tab==='usage' && isAdmin" /></el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="调用记录" name="records"><AiCallLogs v-if="tab==='records' && isAdmin" /></el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="数据管理" name="storage"><WorkStorage v-if="tab==='storage' && isAdmin" /></el-tab-pane>
   <el-tab-pane v-if="isAdmin" label="账号管理" name="users"><AccountUsers v-if="tab==='users' && isAdmin" /></el-tab-pane>
  </el-tabs>
 </div>
</template>
<script setup>
import {ref,computed,onMounted,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {getMe,updateMyProfile,changePassword} from '../api'
import {getUser,getToken,setSession,clearSession} from '../auth'
import {staffPositionLabel} from '../utils/feature-access.mjs'
import PersonalUsage from '../components/PersonalUsage.vue'
import AiCallLogs from './AiCallLogs.vue'
import WorkStorage from './WorkStorage.vue'
import AccountUsers from '../components/AccountUsers.vue'
const route=useRoute(),router=useRouter(),user=ref(getUser()||{}),displayName=ref(user.value.displayName||''),saving=ref(false),changingPassword=ref(false)
const isAdmin=computed(()=>user.value.role==='admin')
const allowedTab=value=>value==='profile'||isAdmin.value&&['usage','records','storage','users'].includes(value)?value:'profile'
const tab=ref(allowedTab(route.query.tab||'profile'))
const roleName=computed(()=>({admin:'系统管理员',raw_grain:'原粮车间管理员',qu_making:'制曲车间管理员',brewing:'酿酒车间管理员',viewer:'车间人员'})[user.value.role]||'车间人员')
const workshopName=computed(()=>({raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'})[user.value.workshopCode||user.value.staffWorkshopCode||user.value.role]||'')
const passwords=ref({oldPassword:'',newPassword:'',confirm:''})
function changeTab(value){router.replace({path:'/account',query:value==='profile'?{}:{tab:value}})}
watch(()=>route.query.tab,value=>{tab.value=allowedTab(value||'profile')})
async function saveProfile(){if(saving.value)return;saving.value=true;try{const result=await updateMyProfile({displayName:displayName.value.trim()});user.value=result.data.user;displayName.value=user.value.displayName;setSession(getToken(),user.value);ElMessage.success('个人资料已更新')}catch{}finally{saving.value=false}}
async function savePassword(){
 if(changingPassword.value)return
 if(!passwords.value.oldPassword)return ElMessage.warning('请输入原密码')
 if(!/[A-Z]/.test(passwords.value.newPassword)||!/[a-z]/.test(passwords.value.newPassword)||!/[0-9]/.test(passwords.value.newPassword))return ElMessage.warning('新密码须包含大写字母、小写字母和数字')
 if(passwords.value.newPassword!==passwords.value.confirm)return ElMessage.warning('两次输入的新密码不一致')
 changingPassword.value=true
 try{await changePassword({oldPassword:passwords.value.oldPassword,newPassword:passwords.value.newPassword});passwords.value={oldPassword:'',newPassword:'',confirm:''};clearSession();ElMessage.success('密码已修改，请重新登录');router.replace('/login')}catch{}finally{changingPassword.value=false}
}
onMounted(async()=>{try{user.value=(await getMe()).data.user;displayName.value=user.value.displayName;setSession(getToken(),user.value);tab.value=allowedTab(tab.value);if(tab.value!==route.query.tab&&route.query.tab)changeTab(tab.value)}catch{}})
</script>
<style scoped>
.personal-center{max-width:1480px;margin:auto;color:#243b50}.personal-tabs :deep(.el-tabs__item){height:48px;font-size:15px}.personal-tabs :deep(.el-tabs__content){padding-top:20px;overflow:visible}.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:1100px}.personal-panel{background:white;border:1px solid #e2e8ef;border-radius:14px;padding:28px}.personal-panel h3{font-size:18px;margin:0 0 10px}.muted,.password-help{color:#7c8998;font-size:13px;line-height:1.8}.muted{margin:0 0 26px}.personal-panel :deep(.el-input__wrapper){min-height:38px}.identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:26px 0}.identity-grid small,.identity-grid strong{display:block}.identity-grid small{font-size:12px;color:#8491a0;margin-bottom:7px}.identity-grid strong{font-size:14px;font-weight:500}.password-help{display:block;margin-top:6px}.personal-panel .el-button{min-height:40px}@media(max-width:800px){.profile-grid{grid-template-columns:1fr;gap:16px}.personal-panel{padding:20px}.personal-tabs :deep(.el-tabs__item){font-size:14px;padding:0 14px}.personal-panel :deep(.el-input__wrapper),.personal-panel .el-button{min-height:44px}}
</style>

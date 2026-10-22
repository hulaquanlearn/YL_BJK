<template>
 <section class="account-users" v-loading="loading">
  <div class="users-toolbar">
   <el-input v-model="keyword" placeholder="账号或姓名" clearable aria-label="查找账号" />
   <span class="users-count">{{filtered.length}} 个账号</span>
   <el-button :icon="Refresh" circle aria-label="刷新账号" :disabled="busy" @click="load" />
   <el-button type="primary" :disabled="busy" @click="openEditor()">新增账号</el-button>
  </div>
  <p v-if="error" role="alert" class="users-error">{{error}}</p>
  <div class="user-list">
   <article v-for="person in filtered" :key="person.id" class="user-row">
    <div class="user-identity"><strong>{{person.displayName}}</strong><small>{{person.username}}{{String(person.id)===String(self.id)?' · 本人':''}}</small></div>
    <div class="user-role">{{identity(person)}}</div>
    <span :class="['user-status',person.enabled?'enabled':'']">{{person.enabled?'已启用':'已停用'}}</span>
    <div class="user-actions"><el-button text :disabled="busy" @click="openEditor(person)">编辑</el-button><ActionMenu :items="actions(person)" :disabled="busy" :aria-label="person.displayName+'的账号操作'" @select="command($event,person)" /></div>
   </article>
   <el-empty v-if="!filtered.length&&!loading" description="暂无账号" :image-size="64" />
  </div>
  <el-dialog v-model="editorOpen" :title="editing?'编辑账号':'新增账号'" width="min(480px, calc(100vw - 28px))" :close-on-click-modal="!busy" :show-close="!busy" :close-on-press-escape="!busy" @closed="clearForm">
   <el-form label-position="top" @submit.prevent="save">
    <el-form-item label="登录账号"><el-input v-model="form.username" :disabled="!!editing" maxlength="32" autocomplete="off" /></el-form-item>
    <el-form-item label="姓名"><el-input v-model="form.displayName" maxlength="50" /></el-form-item>
    <el-form-item label="角色"><el-select v-model="form.role" :disabled="String(editing?.id)===String(self.id)" @change="normalizePosition"><el-option v-for="(label,key) in roles" :key="key" :label="label" :value="key" /></el-select></el-form-item>
    <div v-if="form.role==='viewer'" class="user-staff-fields">
     <el-form-item label="所属车间"><el-select v-model="form.staffWorkshopCode" @change="normalizePosition"><el-option v-for="(label,key) in workshops" :key="key" :label="label" :value="key" /></el-select></el-form-item>
     <el-form-item label="岗位"><el-select v-model="form.staffPosition"><el-option v-for="p in positions" :key="p.value" :value="p.value" :label="p.label" /></el-select></el-form-item>
    </div>
    <el-form-item v-if="!editing" label="初始密码"><el-input v-model="form.password" type="password" show-password autocomplete="new-password" /><small class="user-password-help">须包含大写字母、小写字母和数字</small></el-form-item>
   </el-form>
   <template #footer><el-button :disabled="busy" @click="editorOpen=false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="resetOpen" title="重置密码" width="min(440px, calc(100vw - 28px))" :close-on-click-modal="!busy" :show-close="!busy" :close-on-press-escape="!busy" @closed="resetPassword=''">
   <p>{{resetPerson?.displayName}} · {{resetPerson?.username}}</p><el-input v-model="resetPassword" type="password" show-password autocomplete="new-password" aria-label="重置后的新密码" /><small class="user-password-help">须包含大写字母、小写字母和数字；重置后该账号的登录会话将退出。</small>
   <template #footer><el-button :disabled="busy" @click="resetOpen=false">取消</el-button><el-button type="primary" :loading="busy" @click="saveReset">确认重置</el-button></template>
  </el-dialog>
 </section>
</template>
<script setup>
import {ref,computed,onMounted} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {Refresh} from '@element-plus/icons-vue'
import {getUsers,createUser,updateUser,resetUserPassword} from '../api'
import {getUser} from '../auth'
import ActionMenu from './ActionMenu.vue'
const self=getUser()||{},users=ref([]),keyword=ref(''),loading=ref(false),busy=ref(false),error=ref(''),editorOpen=ref(false),editing=ref(null),resetOpen=ref(false),resetPerson=ref(null),resetPassword=ref('')
const roles={admin:'系统管理员',raw_grain:'原粮车间管理员',qu_making:'制曲车间管理员',brewing:'酿酒车间管理员',viewer:'车间人员'}
const workshops={raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'}
const fresh=()=>({username:'',displayName:'',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'employee',password:''})
const form=ref(fresh())
const positions=computed(()=>form.value.staffWorkshopCode==='raw_grain'?[{value:'employee',label:'员工'},{value:'shift_leader',label:'工段长'}]:[{value:'group_leader',label:'组长'},{value:'shift_leader',label:'班长'}])
const filtered=computed(()=>users.value.filter(p=>(p.username+' '+p.displayName).toLowerCase().includes(keyword.value.trim().toLowerCase())))
function identity(p){if(p.role!=='viewer')return roles[p.role]||p.role;const position=p.staffWorkshopCode==='raw_grain'?{employee:'员工',group_leader:'员工',shift_leader:'工段长'}:{group_leader:'组长',shift_leader:'班长'};return [workshops[p.staffWorkshopCode],position[p.staffPosition]].filter(Boolean).join(' · ')||'岗位待分配'}
function normalizePosition(){if(!positions.value.some(p=>p.value===form.value.staffPosition))form.value.staffPosition=positions.value[0].value}
async function load(){if(loading.value)return;loading.value=true;error.value='';try{users.value=(await getUsers()).data}catch{error.value='账号读取失败，请重试'}finally{loading.value=false}}
function clearForm(){form.value=fresh();editing.value=null}
function openEditor(person){if(busy.value)return;editing.value=person||null;form.value=person?{...fresh(),...person,password:'',staffWorkshopCode:person.staffWorkshopCode||'raw_grain',staffPosition:person.staffWorkshopCode==='raw_grain'&&person.staffPosition==='group_leader'?'employee':person.staffPosition||'employee'}:fresh();normalizePosition();editorOpen.value=true}
const validPassword=value=>/[A-Z]/.test(value)&&/[a-z]/.test(value)&&/\d/.test(value)
async function save(){
 if(busy.value)return
 const f=form.value
 if(!f.displayName.trim())return ElMessage.warning('请输入姓名')
 if(!editing.value&&!/^[A-Za-z0-9_]{3,32}$/.test(f.username.trim()))return ElMessage.warning('账号须为3至32位字母、数字或下划线')
 if(!editing.value&&!validPassword(f.password))return ElMessage.warning('密码须包含大写字母、小写字母和数字')
 busy.value=true
 try{const data={displayName:f.displayName.trim(),role:f.role,...(f.role==='viewer'?{staffWorkshopCode:f.staffWorkshopCode,staffPosition:f.staffPosition}:{})};if(editing.value)await updateUser(editing.value.id,data);else await createUser({...data,username:f.username.trim(),password:f.password});editorOpen.value=false;f.password='';ElMessage.success('账号已保存');await load()}catch{}finally{busy.value=false}
}
function actions(p){return [{key:'reset',label:'重置密码',disabled:String(p.id)===String(self.id)},{key:'toggle',label:p.enabled?'停用账号':'启用账号',disabled:String(p.id)===String(self.id)}]}
async function command(action,p){
 if(busy.value||String(p.id)===String(self.id))return
 if(action==='reset'){resetPerson.value=p;resetPassword.value='';resetOpen.value=true;return}
 if(action!=='toggle')return
 try{await ElMessageBox.confirm(`${p.enabled?'停用':'启用'}“${p.displayName}”（${p.username}）？${p.enabled?'停用后将退出该账号的登录会话。':''}`,'账号状态',{type:'warning',confirmButtonText:'确认',cancelButtonText:'取消'})}catch{return}
 busy.value=true;try{await updateUser(p.id,{enabled:!p.enabled});await load();ElMessage.success('账号状态已更新')}catch{}finally{busy.value=false}
}
async function saveReset(){if(busy.value||!resetPerson.value||String(resetPerson.value.id)===String(self.id))return;if(!validPassword(resetPassword.value))return ElMessage.warning('密码须包含大写字母、小写字母和数字');busy.value=true;try{await resetUserPassword(resetPerson.value.id,resetPassword.value);resetPassword.value='';resetOpen.value=false;ElMessage.success('密码已重置')}catch{}finally{busy.value=false}}
onMounted(load)
</script>
<style scoped>
.account-users{padding:20px;background:white;border:1px solid #dfe6ed;border-radius:12px;color:#243b50}.users-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:12px}.users-toolbar .el-input{max-width:250px}.users-count{flex:1;font-size:13px;color:#8290a0}.users-toolbar .el-button+.el-button{margin-left:0}.user-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(140px,1.3fr) 70px 140px;align-items:center;gap:18px;padding:20px 4px;border-bottom:1px solid #edf1f5}.user-row:last-child{border:0}.user-identity strong,.user-identity small{display:block;overflow-wrap:anywhere}.user-identity strong{font-size:14px}.user-identity small{margin-top:5px;font-size:12px;color:#8492a1}.user-role{font-size:13px;color:#607487}.user-status{font-size:12px;color:#97a0ad}.user-status.enabled{color:#278361}.user-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px}.user-password-help{display:block;font-size:12px;color:#8492a1;line-height:1.7;margin-top:6px}.user-staff-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.account-users :deep(.el-select){width:100%}.users-error{color:#bd2438;font-size:13px}
@media(max-width:650px){.account-users{padding:16px}.users-toolbar{flex-wrap:wrap}.users-toolbar .el-input{width:100%;max-width:none}.user-row{grid-template-columns:1fr auto;gap:12px}.user-identity{grid-column:1}.user-role{grid-column:1;grid-row:2}.user-status{grid-column:2;grid-row:1;text-align:right}.user-actions{grid-column:2;grid-row:2}.user-staff-fields{grid-template-columns:1fr}.user-actions :deep(.el-button){min-height:40px}}
</style>

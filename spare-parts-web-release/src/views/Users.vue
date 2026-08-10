<template>
  <div>
    <div class="page-head"><div><h2>系统账号</h2><p>创建账号、分配角色、停用账号和重置密码。</p></div><el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增账号</el-button></div>
    <section class="panel table-panel">
      <el-table :data="users" v-loading="loading" row-key="id">
        <el-table-column label="账号" min-width="210"><template #default="{row}"><div class="material-cell"><strong>{{ row.displayName }}</strong><span>{{ row.username }}</span></div></template></el-table-column>
        <el-table-column label="角色" width="150"><template #default="{row}"><el-select :model-value="row.role" :disabled="row.id===currentUser.id" @change="role=>changeRole(row,role)"><el-option label="普通用户" value="user"/><el-option label="管理员" value="admin"/></el-select></template></el-table-column>
        <el-table-column label="状态" width="120" align="center"><template #default="{row}"><el-switch :model-value="row.enabled" :disabled="row.id===currentUser.id" active-text="启用" @change="enabled=>toggleUser(row,enabled)"/></template></el-table-column>
        <el-table-column prop="lastLoginAt" label="最近登录" min-width="160"><template #default="{row}">{{ formatTime(row.lastLoginAt) }}</template></el-table-column>
        <el-table-column label="操作" width="120" align="right"><template #default="{row}"><el-button link type="danger" @click="resetPassword(row)">重置密码</el-button></template></el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="createVisible" title="新增账号" width="min(480px,94vw)" destroy-on-close>
      <el-form label-position="top"><el-form-item label="用户名" required><el-input v-model="form.username" placeholder="3-32位小写字母、数字或下划线"/></el-form-item><el-form-item label="姓名" required><el-input v-model="form.displayName"/></el-form-item><el-form-item label="初始密码" required><el-input v-model="form.password" type="password" show-password placeholder="至少10位，含字母和数字"/></el-form-item><el-form-item label="角色"><el-select v-model="form.role" style="width:100%"><el-option label="普通用户" value="user"/><el-option label="管理员" value="admin"/></el-select></el-form-item></el-form>
      <template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" :loading="submitting" @click="createAccount">创建</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'; import { ElMessage, ElMessageBox } from 'element-plus'; import { createUser, getUsers, resetUserPassword, updateUser } from '../api'; import { getUser } from '../auth'
const users=ref([]),loading=ref(false),submitting=ref(false),createVisible=ref(false),currentUser=getUser();const form=reactive({username:'',displayName:'',password:'',role:'user'})
function formatTime(v){return v?String(v).replace('T',' ').slice(0,16):'从未登录'}
async function load(){loading.value=true;try{users.value=(await getUsers()).data||[]}finally{loading.value=false}}
function openCreate(){Object.assign(form,{username:'',displayName:'',password:'',role:'user'});createVisible.value=true}
async function createAccount(){if(!form.username.trim()||!form.displayName.trim()||!form.password)return ElMessage.warning('请填写完整');submitting.value=true;try{await createUser({...form,username:form.username.trim().toLowerCase(),displayName:form.displayName.trim()});ElMessage.success('账号创建成功');createVisible.value=false;await load()}finally{submitting.value=false}}
async function changeRole(row,role){await updateUser(row.id,{role});ElMessage.success('角色已更新');await load()}
async function toggleUser(row,enabled){try{await ElMessageBox.confirm(`确定${enabled?'启用':'停用'}账号“${row.displayName}”吗？`,'账号状态')}catch{return}await updateUser(row.id,{enabled});ElMessage.success(enabled?'账号已启用':'账号已停用');await load()}
async function resetPassword(row){let value;try{({value}=await ElMessageBox.prompt('新密码至少10位，并同时包含字母和数字。','重置密码',{inputType:'password',inputPlaceholder:'输入新密码'}))}catch{return}await resetUserPassword(row.id,value);ElMessage.success('密码已重置，该账号需重新登录')}
onMounted(load)
</script>

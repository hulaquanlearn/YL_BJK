<template>
  <div>
    <div class="page-head"><div><h2>账号设置</h2><p>查看当前权限、修改密码或安全退出。</p></div><el-button type="danger" plain @click="signOut">退出登录</el-button></div>
    <section class="panel" style="padding:22px;margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:15px"><span class="account-avatar" style="width:50px;height:50px;font-size:18px">{{ user?.displayName?.slice(0,1) }}</span><div><h3 style="margin:0">{{ user?.displayName }}</h3><p style="margin:6px 0 0;color:#697386">{{ user?.username }} · {{ user?.role === 'admin' ? '管理员' : '普通用户' }}</p></div></div>
    </section>
    <section class="panel" style="max-width:620px;padding:24px">
      <h3 style="margin:0 0 6px">修改密码</h3><p style="margin:0 0 20px;color:#697386;font-size:13px">新密码至少10位，并同时包含字母和数字。</p>
      <el-form label-position="top"><el-form-item label="原密码"><el-input v-model="form.oldPassword" type="password" show-password /></el-form-item><el-form-item label="新密码"><el-input v-model="form.newPassword" type="password" show-password /></el-form-item><el-form-item label="确认新密码"><el-input v-model="form.confirmPassword" type="password" show-password /></el-form-item><el-button type="primary" :loading="submitting" @click="submit">确认修改</el-button></el-form>
    </section>
  </div>
</template>
<script setup>
import { reactive, ref } from 'vue'; import { useRouter } from 'vue-router'; import { ElMessage, ElMessageBox } from 'element-plus'; import { changePassword, logout } from '../api'; import { clearSession, getUser } from '../auth'
const router=useRouter(), user=ref(getUser()), submitting=ref(false); const form=reactive({oldPassword:'',newPassword:'',confirmPassword:''})
async function submit(){if(!form.oldPassword||!form.newPassword)return ElMessage.warning('请填写完整');if(form.newPassword!==form.confirmPassword)return ElMessage.warning('两次新密码不一致');submitting.value=true;try{await changePassword({oldPassword:form.oldPassword,newPassword:form.newPassword});clearSession();ElMessage.success('密码已修改，请重新登录');router.replace('/login')}finally{submitting.value=false}}
async function signOut(){try{await ElMessageBox.confirm('确定退出当前账号吗？','退出登录')}catch{return}try{await logout()}catch{}clearSession();router.replace('/login')}
</script>

<template>
  <main class="web-login">
    <section class="login-panel">
      <div class="login-brand"><span><el-icon><Grid /></el-icon></span><div><h1>数字工作台</h1><p>备件 · 工程 · 现场协同</p></div></div>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名"><el-input v-model="form.username" size="large" maxlength="32" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" autofocus @keyup.enter="submit" /></el-form-item>
      <el-form-item label="密码"><el-input v-model="form.password" size="large" type="password" name="password" autocomplete="current-password" show-password @keyup.enter="submit" /></el-form-item>
        <el-button type="primary" size="large" :loading="loading" style="width:100%" @click="submit">登录</el-button>
      </el-form>
      <p v-if="formError" class="login-error" role="alert">{{formError}}</p>
      <p class="login-help">账号由管理员创建。如忘记密码，请联系管理员重置。</p>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '../api'
import { setSession } from '../auth'
const route = useRoute(); const router = useRouter(); const loading = ref(false)
const form = reactive({ username: '', password: '' })
const formError=ref('')
let active=true
onBeforeUnmount(()=>{active=false})
async function submit() {
  if (loading.value||!active) return
  if (!form.username.trim() || !form.password) return ElMessage.warning('请输入用户名和密码')
  loading.value = true;formError.value=''
  try {
    const result = await login({ username: form.username.trim(), password: form.password })
    if(!active)return
    setSession(result.data.token, result.data.user)
    const next=route.query.redirect
    router.replace(typeof next==='string'&&next.startsWith('/')&&!next.startsWith('//')&&!/^\/login(?:[?#]|$)/.test(next)?next:'/portal')
  } catch(error) { if(active)formError.value=error.response?.data?.msg||error.message||'登录暂未完成，请重试' }
  finally { if(active)loading.value = false }
}
</script>

<style scoped>
.web-login{min-height:0;flex:1 0 auto;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#8f1119 0,#c6000b 42%,#f5f6f8 42.2%)}
.login-error{color:#a33346;font-size:13px;line-height:1.6}
.login-panel{width:min(430px,100%);padding:36px;border-radius:22px;background:#fff;box-shadow:0 24px 70px rgba(42,10,13,.22)}
.login-brand{display:flex;align-items:center;gap:14px;margin-bottom:30px}.login-brand>span{width:50px;height:50px;display:grid;place-items:center;border-radius:15px;color:#fff;background:#c6000b;font-size:24px}.login-brand h1{margin:0;font-size:21px}.login-brand p{margin:6px 0 0;color:#7b8493;font-size:13px}.login-help{margin:20px 0 0;color:#8a93a4;font-size:12px;text-align:center}
</style>

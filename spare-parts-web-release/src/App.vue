<template>
  <div v-if="route.meta.public" class="public-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else-if="route.meta.portal" class="portal-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else class="app-shell" :class="{ 'is-knowledge': isKnowledge }">
    <main class="main-shell">
      <header class="topbar">
        <div class="module-identity">
          <span class="module-mark"><el-icon><Reading v-if="isKnowledge" /><Tools v-else /></el-icon></span>
          <div><strong>{{ moduleName }}</strong><small>数字工作台</small></div>
        </div>
        <div class="page-title"><h1>{{ route.meta.title }}</h1><p>{{ route.meta.description }}</p></div>
        <div class="topbar-actions">
          <el-dropdown trigger="click" @command="switchWorkspace">
            <button class="workspace-switch" type="button"><el-icon><Grid /></el-icon>切换业务<el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="/portal"><el-icon><Grid /></el-icon>数字工作台</el-dropdown-item>
                <el-dropdown-item command="/inventory"><el-icon><Box /></el-icon>备件管理中心</el-dropdown-item>
                <el-dropdown-item command="/knowledge"><el-icon><Reading /></el-icon>智能工程中心</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <div class="system-state" :class="healthState"><span class="state-dot"></span>{{ healthText }}</div>
          <el-dropdown trigger="click" @command="handleAccountCommand">
            <button class="account-chip" type="button" aria-label="账号菜单">
              <span class="account-avatar">{{ userInitial }}</span>
              <span><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></span>
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>

      <nav class="section-nav" aria-label="功能导航">
        <template v-if="isKnowledge">
          <router-link to="/knowledge"><el-icon><Collection /></el-icon>工程知识</router-link>
          <router-link to="/plc-analysis"><el-icon><Cpu /></el-icon>程序智能分析</router-link>
        </template>
        <template v-else>
          <router-link to="/inventory"><el-icon><Box /></el-icon>库存总览</router-link>
          <router-link to="/replenishment"><el-icon><ShoppingCartFull /></el-icon>补货清单</router-link>
          <router-link to="/movements"><el-icon><Switch /></el-icon>库存流水</router-link>
          <router-link to="/warehouse-3d"><el-icon><OfficeBuilding /></el-icon>3D 库位</router-link>
          <router-link to="/model-library"><el-icon><Picture /></el-icon>备件模型库</router-link>
          <router-link to="/equipment"><el-icon><SetUp /></el-icon>设备与备件</router-link>
          <router-link to="/data-quality"><el-icon><CircleCheck /></el-icon>数据质量</router-link>
          <router-link to="/check"><el-icon><DocumentChecked /></el-icon>盘点管理</router-link>
          <router-link to="/statistics"><el-icon><DataAnalysis /></el-icon>备件统计</router-link>
        </template>
      </nav>

      <section class="page-content"><router-view /></section>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getHealth, logout } from './api'
import { clearSession, getUser } from './auth'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()
const router = useRouter()
const health = ref('checking')
const user = ref(getUser())
const isAdmin = computed(() => user.value?.role === 'admin')
const roleLabel = computed(() => ({
  admin: '总管理员',
  raw_grain: '原粮车间管理员',
  qu_making: '制曲车间管理员',
  brewing: '酿酒车间管理员',
  viewer: '车间人员（只读）'
}[user.value?.role] || '车间人员（只读）'))
const isKnowledge = computed(() => route.meta.module === 'knowledge')
const moduleName = computed(() => isKnowledge.value ? '智能工程中心' : '备件管理中心')
const userInitial = computed(() => user.value?.displayName?.slice(0, 1) || '用')
const healthState = computed(() => `is-${health.value}`)
const healthText = computed(() => ({ checking: '正在连接', online: '服务正常', offline: '服务异常' }[health.value]))

function switchWorkspace(path) { if (path && path !== route.path) router.push(path) }
async function handleAccountCommand(command) {
  if (command !== 'logout') return
  try {
    await ElMessageBox.confirm('确定退出当前账号吗？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  try { await logout() } catch {}
  clearSession()
  router.replace('/login')
}

watch(() => route.fullPath, () => { user.value = getUser() })
onMounted(async () => {
  try {
    const result = await getHealth()
    health.value = result.success && result.database === 'connected' ? 'online' : 'offline'
  } catch { health.value = 'offline' }
})
</script>

<template>
  <div v-if="route.meta.public" class="public-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else class="app-shell" :class="{ 'is-sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><el-icon><Tools /></el-icon></div>
        <div class="brand-copy"><strong>备件管理中心</strong><span>原粮车间</span></div>
      </div>
      <nav class="side-nav" aria-label="主导航">
        <router-link to="/inventory" title="库存总览"><el-icon><Box /></el-icon><span>库存总览</span></router-link>
        <router-link to="/replenishment" title="补货清单"><el-icon><ShoppingCartFull /></el-icon><span>补货清单</span></router-link>
        <router-link to="/procurement" title="采购跟踪"><el-icon><Van /></el-icon><span>采购跟踪</span></router-link>
        <router-link to="/movements" title="库存流水"><el-icon><Switch /></el-icon><span>库存流水</span></router-link>
        <router-link to="/warehouse-3d" title="3D 库位"><el-icon><OfficeBuilding /></el-icon><span>3D 库位</span></router-link>
        <router-link to="/equipment" title="设备与备件"><el-icon><SetUp /></el-icon><span>设备与备件</span></router-link>
        <router-link to="/data-quality" title="数据质量"><el-icon><CircleCheck /></el-icon><span>数据质量</span></router-link>
        <router-link to="/check" title="盘点管理"><el-icon><DocumentChecked /></el-icon><span>盘点管理</span></router-link>
        <router-link to="/statistics" title="备件统计"><el-icon><DataAnalysis /></el-icon><span>备件统计</span></router-link>
        <router-link v-if="isAdmin" to="/users" title="账号管理"><el-icon><UserFilled /></el-icon><span>账号管理</span></router-link>
        <router-link to="/account" title="账号设置"><el-icon><Setting /></el-icon><span>账号设置</span></router-link>
      </nav>
      <div class="sidebar-bottom">
        <button class="sidebar-collapse-button" type="button" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" @click="toggleSidebar">
          <el-icon><Expand v-if="sidebarCollapsed" /><Fold v-else /></el-icon>
          <span>{{ sidebarCollapsed ? '展开侧栏' : '收起侧栏' }}</span>
        </button>
      </div>
    </aside>

    <main class="main-shell">
      <header class="topbar">
        <div><h1>{{ route.meta.title }}</h1><p>{{ route.meta.description }}</p></div>
        <div class="topbar-actions">
          <div class="system-state" :class="healthState"><span class="state-dot"></span>{{ healthText }}</div>
          <router-link class="account-chip" to="/account">
            <span class="account-avatar">{{ userInitial }}</span>
            <span><strong>{{ user?.displayName }}</strong><small>{{ isAdmin ? '管理员' : '普通用户' }}</small></span>
          </router-link>
        </div>
      </header>

      <div class="mobile-nav">
        <router-link to="/inventory"><el-icon><Box /></el-icon>库存</router-link>
        <router-link to="/warehouse-3d"><el-icon><OfficeBuilding /></el-icon>3D库位</router-link>
        <router-link to="/procurement"><el-icon><Van /></el-icon>采购</router-link>
        <router-link to="/statistics"><el-icon><DataAnalysis /></el-icon>统计</router-link>
        <router-link to="/account"><el-icon><Setting /></el-icon>账号</router-link>
      </div>
      <section class="page-content"><router-view /></section>
      <SiteFooter />
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getHealth } from './api'
import { getUser } from './auth'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()
const health = ref('checking')
const user = ref(getUser())
const sidebarCollapsed = ref(window.localStorage.getItem('spare-parts-sidebar-collapsed') === '1')
const isAdmin = computed(() => user.value?.role === 'admin')
const userInitial = computed(() => user.value?.displayName?.slice(0, 1) || '用')
const healthState = computed(() => `is-${health.value}`)
const healthText = computed(() => ({ checking: '正在连接', online: '服务正常', offline: '服务异常' }[health.value]))

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  window.localStorage.setItem('spare-parts-sidebar-collapsed', sidebarCollapsed.value ? '1' : '0')
}

watch(() => route.fullPath, () => { user.value = getUser() })
onMounted(async () => {
  try {
    const result = await getHealth()
    health.value = result.success && result.database === 'connected' ? 'online' : 'offline'
  } catch { health.value = 'offline' }
})
</script>

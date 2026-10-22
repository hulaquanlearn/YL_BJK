<template>
  <div v-if="route.meta.public" class="public-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else-if="route.meta.portal" class="portal-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else class="app-shell" :class="{ 'is-knowledge': isKnowledge, 'is-work': isWork, 'mini-embedded': embeddedWork }">
    <main class="main-shell">
      <header v-if="!embeddedWork" class="topbar">
        <router-link class="module-identity" to="/portal" aria-label="返回数字工作台">
          <span class="module-mark"><el-icon><Reading v-if="isKnowledge" /><Tools v-else /></el-icon></span>
          <div><strong>{{ moduleName }}</strong><small v-if="!isPersonal">{{ route.meta.title }}</small></div>
        </router-link>
        <div class="page-title"><h1>{{ route.meta.title }}</h1><p>{{ route.meta.description }}</p></div>
        <div class="topbar-actions">
          <div class="system-state" :class="healthState"><span class="state-dot"></span>{{ healthText }}</div>
          <el-dropdown ref="workspaceDropdown" trigger="click" popper-class="workspace-menu" @command="switchWorkspace">
            <button class="workspace-switch" type="button" aria-label="切换业务中心"><el-icon><Grid /></el-icon>切换业务<el-icon><ArrowDown /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="/portal"><router-link class="workspace-entry" to="/portal" @click.stop="workspaceDropdown?.handleClose()"><el-icon><Grid /></el-icon>数字工作台</router-link></el-dropdown-item>
                <el-dropdown-item command="/inventory"><router-link class="workspace-entry" to="/inventory" @click.stop="workspaceDropdown?.handleClose()"><el-icon><Box /></el-icon>备件管理中心</router-link></el-dropdown-item>
                <el-dropdown-item v-if="canReadFeature(user,'/knowledge')" command="/knowledge"><router-link class="workspace-entry" to="/knowledge" @click.stop="workspaceDropdown?.handleClose()"><el-icon><Reading /></el-icon>智能工程中心</router-link></el-dropdown-item>
                <el-dropdown-item v-if="canReadFeature(user,preferredWorkPath(user))" :command="preferredWorkPath(user)"><router-link class="workspace-entry" :to="preferredWorkPath(user)" @click.stop="workspaceDropdown?.handleClose()"><el-icon><DocumentChecked /></el-icon>工作管理中心</router-link></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="handleAccountCommand">
            <button class="account-chip" type="button" aria-label="账号菜单">
              <span class="account-avatar">{{ userInitial }}</span>
              <span><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></span>
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>

      <nav v-if="!embeddedWork && !isPersonal" class="section-nav" aria-label="功能导航">
        <template v-if="isWork"><router-link v-if="canReadFeature(user,'/raw-duties')" to="/raw-duties"><el-icon><DocumentChecked /></el-icon>工段长履职考评</router-link><router-link v-if="canReadFeature(user,'/attendance')" to="/attendance"><el-icon><Calendar /></el-icon>考勤核查</router-link></template>
        <template v-else-if="isKnowledge">
          <router-link to="/robot-program"><el-icon><DocumentChecked /></el-icon>机器人程序智能分析</router-link>
          <router-link to="/knowledge"><el-icon><Collection /></el-icon>工程知识</router-link>
        </template>
        <template v-else>
          <router-link to="/inventory"><el-icon><Box /></el-icon>库存总览</router-link>
          <router-link v-if="canReadFeature(user,'/replenishment')" to="/replenishment"><el-icon><ShoppingCartFull /></el-icon>补货清单</router-link>
          <router-link v-if="canReadFeature(user,'/movements')" to="/movements"><el-icon><Switch /></el-icon>库存流水</router-link>
          <router-link to="/warehouse-3d"><el-icon><OfficeBuilding /></el-icon>3D 库位</router-link>
          <router-link v-if="canReadFeature(user,'/check')" to="/check"><el-icon><DocumentChecked /></el-icon>盘点管理</router-link>
          <router-link v-if="canReadFeature(user,'/statistics')" to="/statistics"><el-icon><DataAnalysis /></el-icon>备件统计</router-link>
          <el-dropdown v-if="canReadFeature(user,'/model-library')" class="maintenance-nav" popper-class="maintenance-menu" trigger="click" @command="switchWorkspace"><button class="maintenance-switch" :class="{ selected: ['/model-library', '/equipment', '/data-quality'].includes(route.path) }" type="button"><el-icon><Tools /></el-icon><span>基础维护</span><el-icon class="maintenance-arrow"><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="/model-library"><el-icon><Box /></el-icon>备件模型</el-dropdown-item><el-dropdown-item command="/equipment"><el-icon><OfficeBuilding /></el-icon>设备型号与备件</el-dropdown-item><el-dropdown-item command="/data-quality"><el-icon><Warning /></el-icon>数据检查</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        </template>
      </nav>

      <section class="page-content" :aria-label="route.meta.title" :data-page="route.path"><router-view v-if="canReadFeature(user, route.path)" :key="route.path" /><div v-else class="panel feature-access-note"><h2>{{ route.meta.title }}</h2><p>当前账号尚未分配此功能的数据访问权限，请联系所属车间管理员。</p></div></section>
      <SiteFooter v-if="!embeddedWork" />
    </main>
  </div>
</template>

<style>
.workspace-menu .el-dropdown-menu__item{padding:0}.workspace-menu .workspace-entry{display:flex;align-items:center;gap:6px;min-height:40px;width:100%;box-sizing:border-box;padding:7px 16px;color:inherit;text-decoration:none}.workspace-menu .workspace-entry:focus-visible{outline:2px solid #5b5cab;outline-offset:-2px}
#app .app-shell.is-work .section-nav>a.router-link-active{border-bottom-color:#5b5cab;color:#5b5cab;background:#f0f0fa}
#app .app-shell.mini-embedded .page-content{padding:12px;min-height:100dvh}#app .app-shell.mini-embedded .main-shell{width:100%;margin:0}
</style>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getHealth, logout } from './api'
import { clearSession, getUser } from './auth'
import SiteFooter from './components/SiteFooter.vue'
import { canReadFeature, preferredWorkPath, staffPositionLabel } from './utils/feature-access.mjs'

const route = useRoute()
const embeddedWork=computed(()=>route.query.mini==='1'&&['/attendance','/warehouse-3d'].includes(route.path))
const router = useRouter()
const health = ref('checking')
const user = ref(getUser())
const workspaceDropdown = ref(null)
const roleLabel = computed(() => user.value?.role === 'viewer' && user.value?.staffPosition && user.value?.staffWorkshopCode
  ? `${({ raw_grain: '原粮车间', qu_making: '制曲车间', brewing: '酿酒车间' })[user.value.staffWorkshopCode] || '车间'}${staffPositionLabel(user.value)}`
  : ({
  admin: '总管理员',
  raw_grain: '原粮车间管理员',
  qu_making: '制曲车间管理员',
  brewing: '酿酒车间管理员',
  viewer: '车间人员'
}[user.value?.role] || '车间人员'))
const isKnowledge = computed(() => route.meta.module === 'knowledge')
const isPersonal = computed(() => route.meta.module === 'account')
const isWork = computed(() => route.meta.module === 'work')
const moduleName = computed(() => isPersonal.value ? '个人中心' : isWork.value ? '工作管理中心' : isKnowledge.value ? '智能工程中心' : '备件管理中心')
watch(()=>route.meta.title,title=>{document.title='数字工作台'},{immediate:true})
const userInitial = computed(() => user.value?.displayName?.slice(0, 1) || '用')
const healthState = computed(() => `is-${health.value}`)
const healthText = computed(() => ({ checking: '正在连接', online: '服务正常', offline: '服务异常', preview: '本地预览' }[health.value]))

function switchWorkspace(path) { if (path && path !== route.path) router.push(path) }
async function handleAccountCommand(command) {
  if (command === 'profile') { router.push('/account'); return }
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
const refreshUser = () => { user.value = getUser() }
onBeforeUnmount(() => window.removeEventListener('auth-changed', refreshUser))
onMounted(async () => {
  window.addEventListener('auth-changed', refreshUser)
  try {
    const result = await getHealth()
    health.value = result.database === 'preview-only' ? 'preview' : result.success && result.database === 'connected' ? 'online' : 'offline'
  } catch { health.value = 'offline' }
})
</script>

<style scoped>
.maintenance-nav{flex:0 0 auto}
.maintenance-switch{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;white-space:nowrap;font:inherit;font-weight:700;border:0;background:transparent;color:#637083;cursor:pointer;padding:9px 13px;min-height:36px;border-radius:7px;transition:.2s ease}
.maintenance-switch:hover,.maintenance-switch.selected{color:var(--brand);background:var(--brand-soft)}
.maintenance-arrow{font-size:11px}
</style>

<style>
:root .section-nav{display:flex;align-items:center;gap:8px}:root .section-nav>a,:root .section-nav .maintenance-switch{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;box-sizing:border-box;font-size:15px;line-height:20px;border-radius:6px;white-space:nowrap}:root .section-nav>a .el-icon,:root .section-nav .maintenance-switch>.el-icon{width:18px;height:18px;font-size:18px;flex:none}:root .section-nav>a.router-link-active{border-bottom:3px solid #be203b;color:#be203b;background:#fff7f9}:root .section-nav .maintenance-nav{margin-left:auto;padding-left:24px;border-left:1px solid #e4e9ef}.maintenance-menu .el-dropdown-menu__item{display:flex;align-items:center;gap:10px;min-height:42px;padding:8px 18px;font-size:14px}.maintenance-menu .el-icon{width:18px;height:18px;font-size:18px;flex:none}@media(max-width:1100px){:root .section-nav .maintenance-nav{margin-left:12px;padding-left:12px}}@media(max-width:600px){:root .section-nav>a,:root .section-nav .maintenance-switch{font-size:14px;height:40px}}
</style>

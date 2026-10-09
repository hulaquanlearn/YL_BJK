<template>
  <div v-if="route.meta.public" class="public-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else-if="route.meta.portal" class="portal-page-shell">
    <router-view />
    <SiteFooter />
  </div>
  <div v-else class="app-shell" :class="{ 'is-knowledge': isKnowledge, 'is-work': isWork }">
    <main class="main-shell">
      <header class="topbar">
        <router-link class="module-identity" to="/portal" aria-label="返回数字工作台">
          <span class="module-mark"><el-icon><Reading v-if="isKnowledge" /><Tools v-else /></el-icon></span>
          <div><strong>{{ moduleName }}</strong><small>{{ route.meta.title }}</small></div>
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
                <el-dropdown-item command="/knowledge"><router-link class="workspace-entry" to="/knowledge" @click.stop="workspaceDropdown?.handleClose()"><el-icon><Reading /></el-icon>智能工程中心</router-link></el-dropdown-item>
                <el-dropdown-item :command="preferredWorkPath(user)"><router-link class="workspace-entry" :to="preferredWorkPath(user)" @click.stop="workspaceDropdown?.handleClose()"><el-icon><DocumentChecked /></el-icon>工作管理中心</router-link></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <template v-if="isWork"><router-link to="/work"><el-icon><DocumentChecked /></el-icon>制曲 · 组长履职考评</router-link><router-link to="/inspection-notices"><el-icon><Document /></el-icon>原粮 · 检查通报</router-link></template>
        <template v-else-if="isKnowledge">
          <router-link to="/knowledge"><el-icon><Collection /></el-icon>工程知识</router-link>
        </template>
        <template v-else>
          <router-link to="/inventory"><el-icon><Box /></el-icon>库存总览</router-link>
          <router-link to="/replenishment"><el-icon><ShoppingCartFull /></el-icon>补货清单</router-link>
          <router-link to="/movements"><el-icon><Switch /></el-icon>库存流水</router-link>
          <router-link to="/warehouse-3d"><el-icon><OfficeBuilding /></el-icon>3D 库位</router-link>
          <router-link to="/check"><el-icon><DocumentChecked /></el-icon>盘点管理</router-link>
          <router-link to="/statistics"><el-icon><DataAnalysis /></el-icon>备件统计</router-link>
          <el-dropdown class="maintenance-nav" trigger="click" @command="switchWorkspace"><button class="maintenance-switch" :class="{ selected: ['/model-library', '/equipment', '/data-quality'].includes(route.path) }" type="button"><el-icon><Tools /></el-icon><span>基础维护</span><el-icon class="maintenance-arrow"><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="/model-library">备件模型库</el-dropdown-item><el-dropdown-item command="/equipment">设备与备件</el-dropdown-item><el-dropdown-item command="/data-quality">数据质量</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
        </template>
      </nav>

      <section class="page-content" :aria-label="route.meta.title" :data-page="route.path"><router-view v-if="canReadFeature(user, route.path)" :key="route.path" /><div v-else class="panel feature-access-note"><h2>{{ route.meta.title }}</h2><p>当前账号尚未分配此功能的数据访问权限，请联系所属车间管理员。</p><p>{{ route.path==='/work' ? '此功能用于工作填报、记录查询、任务管理和履职考评。' : '此功能用于整理、查看和导出原粮车间检查通报。' }}</p></div></section>
      <SiteFooter />
    </main>
  </div>
</template>

<style>
.workspace-menu .el-dropdown-menu__item{padding:0}.workspace-menu .workspace-entry{display:flex;align-items:center;gap:6px;min-height:40px;width:100%;box-sizing:border-box;padding:7px 16px;color:inherit;text-decoration:none}.workspace-menu .workspace-entry:focus-visible{outline:2px solid #5b5cab;outline-offset:-2px}
</style>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { getHealth, logout } from './api'
import { clearSession, getUser } from './auth'
import SiteFooter from './components/SiteFooter.vue'
import { canReadFeature, preferredWorkPath } from './utils/feature-access.mjs'
import { work } from './api/work'

const route = useRoute()
const router = useRouter()
const health = ref('checking')
const user = ref(getUser())
const workspaceDropdown = ref(null)
const isAdmin = computed(() => user.value?.role === 'admin')
const workRole=ref('')
const canViewNotice=computed(()=>['admin','raw_grain','qu_making','brewing'].includes(user.value?.role)||(user.value?.role==='viewer'&&user.value?.staffWorkshopCode==='raw_grain'))
const canUseWork=computed(()=>['admin','raw_grain','qu_making','brewing'].includes(user.value?.role)||(user.value?.role==='viewer'&&user.value?.staffWorkshopCode==='qu_making'&&user.value?.staffPosition==='shift_leader')||Boolean(workRole.value))
const roleLabel = computed(() => user.value?.role === 'viewer' && user.value?.staffPosition && user.value?.staffWorkshopCode
  ? `${({ raw_grain: '原粮车间', qu_making: '制曲车间', brewing: '酿酒车间' })[user.value.staffWorkshopCode] || '车间'}${({ group_leader: '组长', shift_leader: '班长' })[user.value.staffPosition] || '人员'}`
  : ({
  admin: '总管理员',
  raw_grain: '原粮车间管理员',
  qu_making: '制曲车间管理员',
  brewing: '酿酒车间管理员',
  viewer: workRole.value==='shift_leader'?'制曲车间班长':workRole.value==='group_leader'?'制曲车间组长':'车间人员'
}[user.value?.role] || '车间人员'))
const isKnowledge = computed(() => route.meta.module === 'knowledge')
const isWork = computed(() => route.meta.module === 'work')
const moduleName = computed(() => isWork.value ? '工作管理中心' : isKnowledge.value ? '智能工程中心' : '备件管理中心')
watch(()=>route.meta.title,title=>{document.title=title?`${title} · 数字工作台`:'数字工作台'},{immediate:true})
const userInitial = computed(() => user.value?.displayName?.slice(0, 1) || '用')
const healthState = computed(() => `is-${health.value}`)
const healthText = computed(() => ({ checking: '正在连接', online: '服务正常', offline: '服务异常', preview: '本地预览' }[health.value]))

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

watch(() => route.fullPath, async () => { user.value = getUser();if(user.value?.role==='viewer'&&user.value.staffWorkshopCode==='qu_making'&&['group_leader','shift_leader'].includes(user.value.staffPosition)){try{const r=await work.get('/context');workRole.value=r.data.workRole||''}catch{workRole.value=''}}else workRole.value='' })
onMounted(async () => {
  if(user.value?.role==='viewer'&&user.value.staffWorkshopCode==='qu_making'&&['group_leader','shift_leader'].includes(user.value.staffPosition)){try{const r=await work.get('/context');workRole.value=r.data.workRole||''}catch{workRole.value=''}}
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

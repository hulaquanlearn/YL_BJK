<template>
  <AppShell :enabled="mobileMode && !route.meta.public" :user="user" :modules="mobileGroups" :role="roleLabel" :health="health" @logout="handleAccountCommand('logout')" :class="standalone ? (route.meta.public ? 'public-page-shell' : 'portal-page-shell') : ['app-shell', { 'is-knowledge': isKnowledge, 'is-work': isWork, 'mini-embedded': embeddedWork }]">
    <main :class="standalone ? 'standalone-main' : 'main-shell'">
      <AppUpdateNotice v-if="nativeAndroid && !route.meta.public" />
      <header v-if="!mobileMode && !standalone && !embeddedWork" class="topbar">
        <router-link class="module-identity" to="/portal" aria-label="返回数字工作台">
          <span class="module-mark"><el-icon><Reading v-if="isKnowledge" /><Tools v-else /></el-icon></span>
          <div><strong>{{ moduleName }}</strong><small v-if="!isPersonal">{{ route.meta.title }}</small></div>
        </router-link>
        <div class="page-title"><h1>{{ route.meta.title }}</h1><p>{{ route.meta.description }}</p></div>
        <div class="topbar-actions">
          <ServiceStatus :status="health" />
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
          <div class="account-group"><el-dropdown trigger="click" @command="handleAccountCommand">
            <button class="account-chip" type="button" aria-label="账号菜单">
              <span class="account-avatar">{{ userInitial }}</span>
              <span><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></span>
              <el-icon><ArrowDown /></el-icon>
            </button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown></div>
        </div>
      </header>

      <nav v-if="!mobileMode && !standalone && !embeddedWork && !isPersonal" class="section-nav" aria-label="功能导航">
        <template v-if="isWork"><router-link v-if="canReadFeature(user,'/raw-duties')" to="/raw-duties"><el-icon><DocumentChecked /></el-icon>工段长履职考评</router-link><router-link v-if="canReadFeature(user,'/fire-inspection')" to="/fire-inspection"><el-icon><CircleCheck /></el-icon>消防点检</router-link><router-link to="/agv-vehicles"><el-icon><View /></el-icon>设备模型展示</router-link><router-link v-if="canReadFeature(user,'/control-passwords')" to="/control-passwords"><el-icon><Lock /></el-icon>中控密码管理</router-link><span v-else class="section-password-locked" aria-disabled="true"><el-icon><Lock /></el-icon>中控密码管理</span></template>
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

      <section :class="standalone ? 'standalone-route' : 'page-content'" :aria-label="route.meta.title" :data-page="route.path"><router-view v-slot="{ Component }"><KeepAlive :key="cacheEpoch" include="Warehouse3D" :max="1"><component :is="Component" v-if="standalone || canReadFeature(user, route.path)" :key="route.path" /></KeepAlive></router-view><div v-if="!standalone && !canReadFeature(user, route.path)" class="panel feature-access-note"><h2>{{ route.meta.title }}</h2><p>当前账号尚未分配此功能的数据访问权限，请联系所属车间管理员。</p></div></section>
      <SiteFooter v-if="!mobileMode && (standalone || !embeddedWork)" />
    </main>
  </AppShell>
</template>

<style>
.section-password-locked{display:inline-flex;align-items:center;gap:6px;padding:12px 16px;color:#94a1ae;white-space:nowrap}

.workspace-menu .el-dropdown-menu__item{padding:0}.workspace-menu .workspace-entry{display:flex;align-items:center;gap:6px;min-height:40px;width:100%;box-sizing:border-box;padding:7px 16px;color:inherit;text-decoration:none}.workspace-menu .workspace-entry:focus-visible{outline:2px solid #5b5cab;outline-offset:-2px}
#app .app-shell.is-work .section-nav>a.router-link-active{border-bottom-color:#5b5cab;color:#5b5cab;background:#f0f0fa}
#app .app-shell.mini-embedded .page-content{padding:12px;min-height:100dvh}#app .app-shell.mini-embedded .main-shell{width:100%;margin:0}
</style>
<script setup>
import { computed, onMounted, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppUpdateNotice from './components/AppUpdateNotice.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getHealth, logout } from './api'
import { clearSession, getUser, getToken } from './auth'
import SiteFooter from './components/SiteFooter.vue'
import AppShell from './app/AppShell.vue'
import ServiceStatus from './components/ServiceStatus.vue'
import { canReadFeature, preferredWorkPath, staffPositionLabel } from './utils/feature-access.mjs'
import { inventoryDetailBack, mobileModules, mobileSnapshot, navigateMobile, mobileWorkspaceEnabled } from './utils/mobile-workspace.mjs'
import { closeMobileOverlay } from './utils/mobile-overlay.mjs'

const route = useRoute()
const embeddedWork=computed(()=>route.query.mini==='1'&&['/warehouse-3d'].includes(route.path))
const router = useRouter()
const health = ref('checking');

provide('workbench-service-health', health)
const user = ref(getUser())
const standalone = computed(()=>Boolean(route.meta.public || route.meta.portal))
const nativeAndroid=/DigitalWorkbenchAndroid\//.test(navigator.userAgent)
const mobileQuery=window.matchMedia('(max-width: 760px)')
const pointerQuery=window.matchMedia('(pointer: coarse)')
const narrowScreen=ref(mobileQuery.matches)
const coarsePointer=ref(pointerQuery.matches)
const mobileMode=computed(()=>mobileWorkspaceEnabled({userAgent:navigator.userAgent,narrow:narrowScreen.value,coarse:coarsePointer.value,embedded:route.query.mini==='1',standalone:window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}))
const mobileGroups=computed(()=>mobileModules(user.value,{nativeAndroid}))
function screenChanged(){narrowScreen.value=mobileQuery.matches;coarsePointer.value=pointerQuery.matches}
function publishAppShell(){
  document.body.classList.toggle('workbench-mobile',mobileMode.value)
  document.body.classList.toggle('workbench-android',mobileMode.value&&nativeAndroid)
  window.__WORKBENCH_MOBILE__={...mobileSnapshot(getToken()?user.value:null,route.path,{nativeAndroid}),pageTitle:route.meta.title||'数字工作台'}
}
watch([()=>route.fullPath,user,mobileMode],publishAppShell,{immediate:true,flush:'post'})
// Destroy cached warehouse resources when the login or permissions change.
const cacheEpoch=ref(0)
let cacheIdentity=JSON.stringify([getToken(),getUser()])
function refreshUser(){const next=getUser(),identity=JSON.stringify([getToken(),next]);if(identity!==cacheIdentity){cacheIdentity=identity;cacheEpoch.value++}user.value=next}
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

function switchWorkspace(path) { if (path && path !== route.path) router.push(path) }
async function handleAccountCommand(command) {
  if (command === 'profile') { router.push('/account'); return }
  if (command !== 'logout') return
  const token=getToken()
  try {
    await ElMessageBox.confirm('确定退出当前账号吗？', '退出登录', { confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  if(getToken()!==token)return
  try { await logout() } catch {}
  if(getToken()!==token)return
  clearSession()
  router.replace('/login')
}

watch(() => route.fullPath, refreshUser)
onBeforeUnmount(() => {
  window.removeEventListener('auth-changed', refreshUser)
  mobileQuery.removeEventListener('change',screenChanged)
  pointerQuery.removeEventListener('change',screenChanged)
  document.body.classList.remove('workbench-mobile','workbench-android')
  delete window.__WORKBENCH_MOBILE__
  delete window.__WORKBENCH_NAVIGATE__
  delete window.__WORKBENCH_BACK__
})
onMounted(async () => {
  window.addEventListener('auth-changed', refreshUser)
  mobileQuery.addEventListener('change',screenChanged)
  pointerQuery.addEventListener('change',screenChanged)
  window.__WORKBENCH_NAVIGATE__=path=>navigateMobile(router,getToken()?getUser():null,path,{nativeAndroid})
  window.__WORKBENCH_BACK__=()=>{
    if(closeMobileOverlay())return true
    if(!inventoryDetailBack(router.currentRoute.value,router.options.history.state))return false
    router.back()
    return true
  }
  try {
    const result = await getHealth()
    health.value = result.database === 'preview-only' ? 'preview' : result.success && result.database === 'connected' ? 'online' : 'offline'
  } catch { health.value = 'offline' }
})
</script>

<style scoped>
.standalone-main,.standalone-route{display:contents}
.account-group{display:flex;align-items:center;flex:none}
.maintenance-nav{flex:0 0 auto}
.maintenance-switch{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;white-space:nowrap;font:inherit;font-weight:700;border:0;background:transparent;color:#637083;cursor:pointer;padding:9px 13px;min-height:36px;border-radius:7px;transition:.2s ease}
.maintenance-switch:hover,.maintenance-switch.selected{color:var(--brand);background:var(--brand-soft)}
.maintenance-arrow{font-size:11px}
</style>

<style>
:root .section-nav{display:flex;align-items:center;gap:8px}:root .section-nav>a,:root .section-nav .maintenance-switch{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;box-sizing:border-box;font-size:15px;line-height:20px;border-radius:6px;white-space:nowrap}:root .section-nav>a .el-icon,:root .section-nav .maintenance-switch>.el-icon{width:18px;height:18px;font-size:18px;flex:none}:root .section-nav>a.router-link-active{border-bottom:3px solid #be203b;color:#be203b;background:#fff7f9}:root .section-nav .maintenance-nav{margin-left:auto;padding-left:24px;border-left:1px solid #e4e9ef}.maintenance-menu .el-dropdown-menu__item{display:flex;align-items:center;gap:10px;min-height:42px;padding:8px 18px;font-size:14px}.maintenance-menu .el-icon{width:18px;height:18px;font-size:18px;flex:none}@media(max-width:1100px){:root .section-nav .maintenance-nav{margin-left:12px;padding-left:12px}}@media(max-width:600px){:root .section-nav>a,:root .section-nav .maintenance-switch{font-size:14px;height:40px}}
</style>

<template>
  <main class="workbench tech-workbench">
    <header class="portal-header">
      <div class="portal-brand"><span><el-icon><Grid /></el-icon></span><div><strong>数字工作台</strong></div></div>
      <div class="portal-account-actions"><ServiceStatus :status="health" /><el-dropdown trigger="click" @command="handleAccountCommand">
        <button class="portal-account" type="button"><span>{{ initial }}</span><div><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></div><el-icon><ArrowDown /></el-icon></button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="profile"><el-icon><User /></el-icon>个人中心</el-dropdown-item><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown></div>
    </header>

    <section class="portal-intro" aria-label="工作台概览"><div><span class="portal-eyebrow">DIGITAL WORKBENCH</span><h1>连接现场 · 协同管理</h1><p>从库存、工程知识到现场工作，快速进入你的业务。</p></div><div class="portal-orbit" aria-hidden="true"><i></i><i></i><i></i><span><el-icon><Grid /></el-icon></span></div></section>
    <section class="module-grid" aria-label="业务中心">
      <article class="module-card spare-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><Box /></el-icon></span><span class="module-status">库存与现场</span></div>
        <div class="module-copy"><h2>备件管理中心</h2><p>查库存、找备件，掌握现场库位与补货需求。</p></div>

        <router-link class="module-enter" to="/inventory">进入备件管理 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="备件常用功能">
          <router-link to="/warehouse-3d"><el-icon><Location /></el-icon><span>3D 库位</span><el-icon><ArrowRight /></el-icon></router-link>
          <router-link v-if="canReadFeature(user,'/replenishment')" to="/replenishment"><el-icon><ShoppingCartFull /></el-icon><span>补货清单</span><el-icon><ArrowRight /></el-icon></router-link>
          <router-link v-if="canReadFeature(user,'/check')" to="/check"><el-icon><DocumentChecked /></el-icon><span>盘点管理</span><el-icon><ArrowRight /></el-icon></router-link>
        </nav>
      </article>

      <article v-if="canReadFeature(user,'/knowledge')" class="module-card knowledge-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><Reading /></el-icon></span><span class="module-status">资料与经验</span></div>
        <div class="module-copy"><h2>智能工程中心</h2><p>分析机器人程序，查阅工程资料与故障经验。</p></div>

        <router-link class="module-enter" to="/robot-program">进入智能工程 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="工程常用功能">
          <router-link v-if="canReadFeature(user,'/robot-program')" to="/robot-program"><el-icon><DocumentChecked /></el-icon><span>机器人程序智能分析</span><el-icon><ArrowRight /></el-icon></router-link>
          <router-link to="/knowledge"><el-icon><Reading /></el-icon><span>工程知识库</span><el-icon><ArrowRight /></el-icon></router-link>
        </nav>
      </article>
      <article v-if="canReadFeature(user,preferredWorkPath(user))" class="module-card work-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><DocumentChecked /></el-icon></span><span class="module-status">填报与考评</span></div>
        <div class="module-copy"><h2>工作管理中心</h2><p>履职填报、消防点检与设备模型展示。</p></div>
        <router-link class="module-enter" :to="preferredWorkPath(user)">进入工作管理 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="工作管理常用功能"><router-link v-if="canReadFeature(user,'/raw-duties')" to="/raw-duties"><el-icon><DocumentChecked /></el-icon><span>工段长履职考评</span><el-icon><ArrowRight /></el-icon></router-link><router-link v-if="canReadFeature(user,'/fire-inspection')" to="/fire-inspection"><el-icon><CircleCheck /></el-icon><span>消防点检</span><el-icon><ArrowRight /></el-icon></router-link><router-link to="/agv-vehicles"><el-icon><View /></el-icon><span>设备模型展示</span><el-icon><ArrowRight /></el-icon></router-link><router-link v-if="canReadFeature(user,'/control-passwords')" to="/control-passwords"><el-icon><Lock /></el-icon><span>中控密码管理</span><el-icon><ArrowRight /></el-icon></router-link><span v-else class="password-entry-locked" aria-disabled="true" title="仅系统管理员和制曲人员可以查看"><el-icon><Lock /></el-icon><span>中控密码管理</span><el-icon><ArrowRight /></el-icon></span></nav>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { logout } from '../api'
import { clearSession, getUser } from '../auth'
import { preferredWorkPath, canReadFeature, staffPositionLabel } from '../utils/feature-access.mjs'
import ServiceStatus from '../components/ServiceStatus.vue'

const router = useRouter()
const user = getUser()
const health = inject('workbench-service-health', 'checking')
const initial = computed(() => user?.displayName?.slice(0, 1) || '用')
const roleLabel = computed(() => ({
  admin: '总管理员',
  raw_grain: '原粮车间管理员',
  qu_making: '制曲车间管理员',
  brewing: '酿酒车间管理员',
  viewer: user?.staffWorkshopCode && user?.staffPosition
    ? `${({raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'})[user.staffWorkshopCode]||'车间'}${staffPositionLabel(user)}`
    : '车间人员（岗位待分配）'
}[user?.role] || '只读用户'))

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
</script>

<style src="../portal-tech.css"></style>

<style scoped>
.password-entry-locked{display:flex;align-items:center;gap:11px;min-height:44px;padding:9px 10px;border-radius:8px;color:#879aaf;font-size:13px;box-sizing:border-box;opacity:.65}.password-entry-locked>span{flex:1;min-width:0}.password-entry-locked>.el-icon{flex:none}.password-entry-locked>.el-icon:last-child{font-size:12px}
</style>

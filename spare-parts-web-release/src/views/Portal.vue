<template>
  <main class="workbench">
    <header class="portal-header">
      <div class="portal-brand"><span><el-icon><Grid /></el-icon></span><div><strong>数字工作台</strong></div></div>
      <el-dropdown trigger="click" @command="handleAccountCommand">
        <button class="portal-account" type="button"><span>{{ initial }}</span><div><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></div><el-icon><ArrowDown /></el-icon></button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </header>

    <section class="module-grid">
      <article class="module-card spare-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><Box /></el-icon></span><span class="module-status">库存与现场</span></div>
        <div><h2>备件管理中心</h2><p>查库存、找备件，掌握现场库位与补货需求。</p></div>
        
        <router-link class="module-enter" to="/inventory">进入备件管理 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="备件常用功能">
          <router-link to="/warehouse-3d"><el-icon><Location /></el-icon><span>3D 库位</span><el-icon><ArrowRight /></el-icon></router-link>
          <router-link to="/replenishment"><el-icon><ShoppingCartFull /></el-icon><span>补货清单</span><el-icon><ArrowRight /></el-icon></router-link>
          <router-link to="/check"><el-icon><DocumentChecked /></el-icon><span>盘点管理</span><el-icon><ArrowRight /></el-icon></router-link>
        </nav>
      </article>

      <article class="module-card knowledge-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><Reading /></el-icon></span><span class="module-status">资料与经验</span></div>
        <div><h2>智能工程中心</h2><p>查阅工程资料与故障经验。</p></div>
        
        <router-link class="module-enter" to="/knowledge">进入工程知识 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="工程常用功能">
          <router-link to="/knowledge"><el-icon><Reading /></el-icon><span>工程知识库</span><el-icon><ArrowRight /></el-icon></router-link>

        </nav>
      </article>
      <article class="module-card work-card">
        <div class="module-card-top"><span class="module-icon"><el-icon><DocumentChecked /></el-icon></span><span class="module-status">填报与考评</span></div>
        <div><h2>工作管理中心</h2><p>制曲考评 · 原粮通报与考勤核查。</p></div>
        <router-link class="module-enter" :to="preferredWorkPath(user)">进入工作管理 <el-icon><Right /></el-icon></router-link>
        <nav class="workspace-links" aria-label="工作管理常用功能"><router-link to="/work"><el-icon><DocumentChecked /></el-icon><span>制曲 · 组长履职考评{{ workRole==='shift_leader'?'（班长复核）':'' }}</span><el-icon><ArrowRight /></el-icon></router-link><router-link to="/inspection-notices"><el-icon><DocumentChecked /></el-icon><span>原粮 · 检查通报{{ canEditNotice?'整理':'查看' }}</span><el-icon><ArrowRight /></el-icon></router-link><router-link v-if="canReadFeature(user,'/attendance')" to="/attendance"><el-icon><Calendar /></el-icon><span>原粮 · 考勤核查</span><el-icon><ArrowRight /></el-icon></router-link><router-link v-if="user?.role==='admin'" to="/work-storage"><el-icon><FolderOpened /></el-icon><span>工作资料管理</span><el-icon><ArrowRight /></el-icon></router-link></nav>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { logout } from '../api'
import { clearSession, getUser } from '../auth'
import { work } from '../api/work'
import { preferredWorkPath, canReadFeature } from '../utils/feature-access.mjs'

const router = useRouter()
const user = getUser()
const canEditNotice = ['admin', 'raw_grain'].includes(user?.role)
const canViewNotice = ['admin','raw_grain','qu_making','brewing'].includes(user?.role) || (user?.role==='viewer' && user?.staffWorkshopCode==='raw_grain')
const workRole=ref('')
const canUseWork = computed(() => ['admin','raw_grain','qu_making','brewing'].includes(user?.role) || (user?.role==='viewer' && user?.staffWorkshopCode==='qu_making' && user?.staffPosition==='shift_leader') || Boolean(workRole.value))
onMounted(async()=>{if(user?.role!=='viewer'||user.staffWorkshopCode!=='qu_making'||!['group_leader','shift_leader'].includes(user.staffPosition))return;try{const response=await work.get('/context');workRole.value=response.data.workRole||''}catch{workRole.value=''}})
const initial = computed(() => user?.displayName?.slice(0, 1) || '用')
const roleLabel = computed(() => ({
  admin: '总管理员',
  raw_grain: '原粮车间管理员',
  qu_making: '制曲车间管理员',
  brewing: '酿酒车间管理员',
  viewer: user?.staffWorkshopCode && user?.staffPosition
    ? `${({raw_grain:'原粮车间',qu_making:'制曲车间',brewing:'酿酒车间'})[user.staffWorkshopCode]||'车间'}${({group_leader:'组长',shift_leader:'班长'})[user.staffPosition]||'人员'}`
    : workRole.value==='shift_leader'?'制曲车间班长':workRole.value==='group_leader'?'制曲车间组长':'车间人员（岗位待分配）'
}[user?.role] || '只读用户'))

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
</script>

<style scoped>
.module-portal{min-height:calc(100vh - 72px);padding:28px clamp(24px,5vw,80px) 64px;color:#eef4ff;background:radial-gradient(circle at 15% 12%,rgba(41,121,255,.22),transparent 30%),radial-gradient(circle at 88% 18%,rgba(16,185,129,.16),transparent 28%),linear-gradient(145deg,#071224 0%,#0d1d34 56%,#10283c 100%)}
.portal-header{display:flex;align-items:center;justify-content:space-between;gap:20px}.portal-brand{display:flex;align-items:center;gap:12px}.portal-brand>span{width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:rgba(255,255,255,.08);font-size:22px}.portal-brand strong,.portal-brand small{display:block}.portal-brand strong{font-size:16px}.portal-brand small{margin-top:4px;color:#7f95b3;font-size:10px;letter-spacing:.16em}.portal-account{display:flex;align-items:center;gap:10px;padding:7px 12px 7px 7px;border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#eaf2ff;background:rgba(255,255,255,.06);cursor:pointer}.portal-account>span{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#c91f2c;font-weight:800}.portal-account strong,.portal-account small{display:block;font-size:12px}.portal-account small{margin-top:2px;color:#8fa2bc;font-size:10px}
.portal-hero{max-width:760px;margin:72px auto 38px;text-align:center}.portal-kicker{color:#5eead4;font-size:11px;font-weight:800;letter-spacing:.22em}.portal-hero h1{margin:16px 0 12px;font-size:clamp(32px,4.4vw,56px);letter-spacing:-.04em}.portal-hero p{margin:0;color:#9bacc3;font-size:15px;line-height:1.8}
.module-grid{width:min(1120px,100%);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;margin:0 auto}.module-card{position:relative;overflow:hidden;min-height:390px;display:flex;flex-direction:column;padding:32px;border:1px solid rgba(255,255,255,.13);border-radius:28px;color:#f6f9ff;background:rgba(255,255,255,.065);box-shadow:0 28px 70px rgba(0,0,0,.2);text-decoration:none;transition:.28s ease}.module-card:before{content:"";position:absolute;inset:auto -70px -90px auto;width:240px;height:240px;border-radius:50%;background:var(--glow);filter:blur(4px);opacity:.18}.module-card:hover{transform:translateY(-7px);border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.095)}.spare-card{--accent:#fb7185;--glow:#e11d48}.knowledge-card{--accent:#5eead4;--glow:#14b8a6}.module-card-top{display:flex;align-items:center;justify-content:space-between}.module-icon{width:58px;height:58px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:18px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);font-size:28px}.module-status{display:flex;align-items:center;gap:7px;color:#a9b8cc;font-size:11px}.module-status i{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.13)}.module-card>div:nth-child(2){margin-top:32px}.module-card small{color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.18em}.module-card h2{margin:10px 0 12px;font-size:26px}.module-card p{min-height:54px;margin:0;color:#9bacc3;font-size:14px;line-height:1.8}.module-card ul{display:grid;gap:11px;margin:24px 0 30px;padding:0;list-style:none;color:#c3cfdf;font-size:13px}.module-card li:before{content:"✓";margin-right:10px;color:var(--accent);font-weight:900}.module-enter{display:flex;align-items:center;gap:8px;margin-top:auto;color:var(--accent);font-size:14px;font-weight:800}
@media(max-width:760px){.module-portal{padding:20px 16px 40px}.portal-account div{display:none}.portal-hero{margin:52px auto 30px}.module-grid{grid-template-columns:1fr}.module-card{min-height:350px;padding:24px}.module-card>div:nth-child(2){margin-top:28px}}
.workbench{flex:1;min-height:calc(100dvh - 60px);padding:0 0 56px;background:#f3f5f8;color:#1d2939}
.workbench .portal-header{padding:20px clamp(20px,5vw,80px);background:#fff;border-bottom:1px solid #e5e9ef}
.workbench .portal-brand>span{background:#253b53;color:#fff;border:0;border-radius:12px}
.workbench .portal-account{background:#fff;border-color:#e5e9ef;color:#344054}.workbench .portal-account>span{background:#f4e7e9;color:#b71929}.workbench .portal-account small{color:#667085}
.workbench .portal-hero{max-width:1104px;margin:48px auto 28px;padding:0 28px;text-align:left}.workbench .portal-hero p{color:#667085;font-size:13px}.workbench .portal-hero h1{margin:8px 0 0;font-size:30px;letter-spacing:.02em}
.workbench .module-grid{width:min(1160px,100%);padding:0 28px;box-sizing:border-box;gap:24px}
.workbench .module-card{--accent:#bd182a;--soft:#fff2f3;min-height:0;padding:28px;border:1px solid #e1e6ec;border-top:4px solid var(--accent);border-radius:16px;background:#fff;color:#1d2939;box-shadow:0 6px 20px #1d293906;transition:none}
.workbench .knowledge-card{--accent:#087f7b;--soft:#edf9f7}.workbench .module-card:before{display:none}.workbench .module-card:hover{transform:none;background:#fff;border-color:#e1e6ec;border-top-color:var(--accent)}
.workbench .work-card{--accent:#535aa2;--soft:#f0f1fb}
.workbench .module-card-top{justify-content:flex-start;gap:12px}.workbench .module-icon{width:48px;height:48px;background:var(--soft);border:0;border-radius:14px;font-size:25px}.workbench .module-status{color:#667085;font-size:13px}
.workbench .module-card>div:nth-child(2){margin-top:22px}.workbench .module-card h2{margin:0 0 10px;font-size:25px}.workbench .module-card p{min-height:0;color:#667085;font-size:14px;line-height:1.8}
.workbench .module-enter{justify-content:space-between;margin-top:26px;padding:13px 16px;border-radius:9px;background:var(--accent);color:#fff;text-decoration:none}.workbench .module-enter:hover{filter:brightness(.94)}
.workspace-links{display:grid;margin-top:22px;border-top:1px solid #edf0f3;padding-top:10px}.workspace-links a{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 10px;border-radius:8px;color:#475467;text-decoration:none;font-size:14px}.workspace-links a span{flex:1}.workspace-links a:hover{background:var(--soft);color:var(--accent)}.workspace-links a>.el-icon:last-child{font-size:12px;color:#98a2b3}.workbench a:focus-visible,.workbench button:focus-visible{outline:3px solid #4b83bd;outline-offset:3px}
@media(max-width:760px){.workbench{padding-bottom:28px}.workbench .portal-header{padding:16px}.workbench .portal-hero{margin:28px auto 20px;padding:0 16px}.workbench .portal-hero h1{font-size:24px}.workbench .module-grid{padding:0 16px;gap:18px}.workbench .module-card{padding:22px}.workbench .module-card h2{font-size:23px}.workbench .module-enter{margin-top:20px}.workspace-links{margin-top:16px}}
.workbench .module-grid{grid-template-columns:repeat(3,minmax(0,1fr));max-width:1360px}@media(max-width:980px){.workbench .module-grid{grid-template-columns:1fr}}
.workbench .module-grid{padding-top:44px}
.module-unavailable{margin-top:26px!important;color:#667085!important}
</style>

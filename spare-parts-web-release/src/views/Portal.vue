<template>
  <main class="module-portal">
    <header class="portal-header">
      <div class="portal-brand"><span><el-icon><Grid /></el-icon></span><div><strong>数字工作台</strong><small>RAW GRAIN WORKSHOP</small></div></div>
      <el-dropdown trigger="click" @command="handleAccountCommand">
        <button class="portal-account" type="button"><span>{{ initial }}</span><div><strong>{{ user?.displayName }}</strong><small>{{ roleLabel }}</small></div><el-icon><ArrowDown /></el-icon></button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </header>

    <section class="portal-hero">
      <span class="portal-kicker">WORKSPACE SELECTOR</span>
      <h1>选择今天要处理的业务</h1>
      <p>一次登录，在备件管理与智能工程之间快速切换。</p>
    </section>

    <section class="module-grid">
      <router-link class="module-card spare-card" to="/inventory">
        <div class="module-card-top"><span class="module-icon"><el-icon><Box /></el-icon></span><span class="module-status"><i></i>在线</span></div>
        <div><small>SPARE PARTS OPERATIONS</small><h2>备件管理中心</h2><p>库存、库位、盘点、统计与 3D 定位一体化管理。</p></div>
        <ul><li>实时库存与补货预警</li><li>多车间盘点与权限闭环</li><li>3D 库房精准定位</li></ul>
        <span class="module-enter">进入备件管理 <el-icon><Right /></el-icon></span>
      </router-link>

      <router-link class="module-card knowledge-card" to="/knowledge">
        <div class="module-card-top"><span class="module-icon"><el-icon><Reading /></el-icon></span><span class="module-status"><i></i>可用</span></div>
        <div><small>ENGINEERING INTELLIGENCE</small><h2>智能工程中心</h2><p>集中沉淀工程资料，并解析 Siemens TIA 与 ABB RAPID 程序逻辑。</p></div>
        <ul><li>工程资料分类上传与下载</li><li>PLC 与机器人程序统一归档</li><li>逻辑关系、程序含义与证据式分析</li></ul>
        <span class="module-enter">进入智能工程中心 <el-icon><Right /></el-icon></span>
      </router-link>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { logout } from '../api'
import { clearSession, getUser } from '../auth'

const router = useRouter()
const user = getUser()
const initial = computed(() => user?.displayName?.slice(0, 1) || '用')
const roleLabel = computed(() => ({
  admin: '总管理员',
  raw_grain: '原粮车间',
  qu_making: '制曲车间',
  brewing: '酿酒车间',
  viewer: '只读用户'
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
</style>

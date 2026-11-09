<template>
 <div class="personal-usage" :aria-busy="loading">
  <div class="usage-actions"><el-button :loading="loading" @click="load" aria-label="刷新平台账户用量"><el-icon><Refresh/></el-icon>刷新</el-button></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
  <p v-if="!data && loading" class="usage-notice" role="status">正在读取平台账户…</p>
  <template v-if="data">
   <p v-if="incompleteSources" class="usage-notice" role="status">{{incompleteSources}}。已读取的配置和平台数据仍可查看。</p>
   <div class="provider-grid">
    <article class="provider-card">
     <header><img src="/provider-logos/deepseek.ico" alt=""/><h3>DeepSeek</h3><span>{{status(data.deepseek)}}</span></header>
     <template v-if="data.deepseek?.status==='ok'"><div v-for="balance in data.deepseek.balances" :key="balance.currency" class="balance"><small>可用余额 · {{balance.currency}}</small><strong>{{balance.currency==='CNY'?'¥':'$'}}{{balance.total}}</strong><p>充值 {{balance.toppedUp??'未提供'}} · 赠送 {{balance.granted??'未提供'}}</p></div><p v-if="!data.deepseek.available" class="usage-notice">平台返回账户当前不可调用。</p></template>
     <p v-else class="usage-notice">{{data.deepseek?.message||'余额尚未接入'}}</p>
     <div v-if="data.rawGrainBjk?.status==='ok'" class="account-balance"><span>原粮 bjk · 可用余额</span><strong v-for="balance in data.rawGrainBjk.balances" :key="balance.currency">{{balance.currency==='CNY'?'¥':'$'}}{{balance.total}}</strong></div>
     <p v-else-if="data.rawGrainBjk?.status==='unavailable'" class="usage-notice">{{data.rawGrainBjk.message}}</p>
     <ProviderApplications provider="deepseek" :inventory="data.applications" :usage="data"/>
     <footer><span>{{updated(data.deepseek?.checkedAt)}}</span><a href="https://platform.deepseek.com/usage" target="_blank" rel="noopener noreferrer">平台账单 ↗</a></footer>
    </article>
    <article class="provider-card">
     <header><img src="/provider-logos/glm.png" alt=""/><h3>智谱 GLM</h3><span>{{status(data.glm)}}</span></header>
     <div v-if="data.glm?.status==='ok'" class="balance"><small>可用余额 · CNY</small><strong>¥{{data.glm.balance}}</strong><p>累计消费 {{data.glm.totalSpent==null?'未提供':'¥'+data.glm.totalSpent}}<br/>今日消费 {{data.glm.todaySpent==null?'未提供':'¥'+data.glm.todaySpent}}</p></div>
     <p v-else class="usage-notice">{{data.glm?.message||'余额尚未接入'}}</p>
     <ProviderApplications provider="glm" :inventory="data.applications" :usage="data"/>
     <footer><span>{{updated(data.glm?.checkedAt)}}</span><a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer">智谱控制台 ↗</a></footer>
    </article>
    <article class="provider-card">
     <header><img src="/provider-logos/hunyuan.svg" alt=""/><h3>腾讯混元</h3><span>{{status(data.hunyuan)}}</span></header>
     <template v-if="data.hunyuan?.status==='ok'"><div v-for="(plan,index) in data.hunyuan.plans" :key="index" class="plan-usage"><div class="balance"><small>{{plan.name}} · 剩余积分</small><strong>{{credits(plan.remaining)}}</strong><p>已用 {{credits(plan.used)}} / {{credits(plan.capacity)}} 积分</p></div><el-progress v-if="plan.usedPercent!==null" :percentage="clamp(plan.usedPercent)" :show-text="false" :stroke-width="6" color="#427cba"/><small>到期 {{plan.expiresAt?time(plan.expiresAt):'未提供'}}</small></div></template>
     <p v-else class="usage-notice">{{data.hunyuan?.message||'套餐用量尚未接入'}}</p>
     <ProviderApplications provider="hunyuan" :inventory="data.applications" :usage="data"/>
     <footer><span>{{updated(data.hunyuan?.checkedAt)}}</span><a href="https://console.cloud.tencent.com/hunyuan" target="_blank" rel="noopener noreferrer">混元控制台 ↗</a></footer>
    </article>
   </div>
   <div class="account-quotas">
    <section class="provider-card codex"><header><img src="/provider-logos/openai.svg" alt=""/><h3>Codex 账户</h3><span>{{status(data.codex)}}</span></header>
     <template v-if="['ok','snapshot'].includes(data.codex?.status)"><div v-for="(window,index) in data.codex.windows" :key="index" class="quota-window"><div><span>{{windowLabel(window)}}</span><strong>{{percent(window.usedPercent)}} 已用</strong></div><el-progress v-if="window.usedPercent!==null" :percentage="clamp(window.usedPercent)" :show-text="false" :stroke-width="6" color="#3d6657"/><small>重置 {{window.resetsAt?time(window.resetsAt*1000):'平台未提供'}}</small></div><p class="codex-total">平台累计 Token <strong>{{format(data.codex.summary?.lifetimeTokens)}}</strong></p><p v-if="data.codex.status==='snapshot'" class="source-caption">{{snapshotNotice(data.codex.checkedAt)}}</p></template>
     <p v-else class="usage-notice">{{data.codex?.message||'账户额度暂不可用'}}</p>
     <footer><span>{{updated(data.codex?.checkedAt)}}</span></footer>
    </section>
    <OpenaiPlatformUsage/>
   </div>
  </template>
 </div>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {getPersonalUsage} from '../api'
import {getToken,getUser} from '../auth'
import OpenaiPlatformUsage from './OpenaiPlatformUsage.vue'
import ProviderApplications from './ProviderApplications.vue'
const data=ref(null),loading=ref(false),error=ref('')
const time=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未采集'}
const snapshotNotice=value=>{const age=Date.now()-Date.parse(value);return !Number.isFinite(age)||age>36*3600000?'快照已超过36小时，请检查本机同步。':'每日09:00由本机同步，电脑需开机。'}
const updated=value=>value?time(value):'尚未采集'
const status=value=>({ok:'平台数据',snapshot:'同步快照',unconfigured:'未接入',unavailable:'暂不可用',empty:'无套餐'})[value?.status]||'未取得'
const credits=value=>value!=null&&Number.isFinite(Number(value))?Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2}):'未提供'
const format=value=>typeof value==='number'?value.toLocaleString('zh-CN'):'未提供'
const percent=value=>typeof value==='number'?value+'%':'未知'
const clamp=value=>Math.max(0,Math.min(100,value))
const windowLabel=value=>value.windowDurationMins===10080?'每周额度':value.windowDurationMins===300?'5 小时额度':value.windowDurationMins?value.windowDurationMins+' 分钟额度':'账户额度'
const incompleteSources=computed(()=>{const labels={couple:'情侣配置',workshop:'工坊配置',openclaw:'工坊转发配置'};return(data.value?.applications?.sources||[]).filter(s=>s.status!=='ok').map(s=>labels[s.id]+'未读取').join('、')||(data.value?.applications?.status==='unavailable'?'模型配置读取失败':'')})
let alive=true,sequence=0
const identity=()=>JSON.stringify([getToken(),getUser()?.id??getUser()?._id,getUser()?.role])
async function load(){if(loading.value||!alive)return;const id=++sequence,owner=identity();loading.value=true;error.value='';try{const next=(await getPersonalUsage()).data;if(alive&&id===sequence&&owner===identity())data.value=next}catch{if(alive&&id===sequence&&owner===identity())error.value='平台账户读取失败，请稍后重试。'}finally{if(alive&&id===sequence)loading.value=false}}
onMounted(load);onBeforeUnmount(()=>{alive=false;sequence++})
</script>
<style scoped>
.personal-usage{display:grid;gap:18px;color:#263d50;min-width:0}.provider-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}.provider-card{background:#fff;border:1px solid #e0e8ef;border-radius:12px;padding:20px;min-width:0}.provider-card>header{display:flex;gap:10px;align-items:center;margin-bottom:22px}.provider-card>header img{width:30px;height:30px;object-fit:contain;flex:none}.provider-card h3{font-size:16px;margin:0}.provider-card>header>span{font-size:11px;color:#7e909d;margin-left:auto}.balance{display:grid;gap:7px;min-width:0}.balance>small,.plan-usage>small{font-size:11px;line-height:1.6;color:#7c8d9c}.balance>strong{font-size:30px;font-weight:650;line-height:1.3;color:#25485c;overflow-wrap:anywhere}.balance p{margin:0;font-size:12px;line-height:1.8;color:#7a8c9b;min-height:40px}.provider-card footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:9px;font-size:10px;color:#8194a2;border-top:1px solid #edf1f4;margin-top:18px;padding-top:14px}.provider-card a{color:#087f83;text-decoration:none;font-size:12px}.plan-usage{display:grid;gap:10px}.plan-usage+.plan-usage{margin-top:20px}.source-caption{margin:0;font-size:11px;color:#7f909d;line-height:1.8}.account-quotas{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:16px;align-items:start}.quota-window{display:grid;gap:10px;margin-bottom:16px}.quota-window>div:first-child{display:flex;justify-content:space-between;gap:12px;font-size:12px}.quota-window small{font-size:11px;color:#82939f}.codex-total{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#778997}.codex-total strong{font-size:17px;color:#2e5368;overflow-wrap:anywhere}.usage-notice{margin:0;padding:10px 12px;border-radius:7px;background:#f7f4ec;color:#8b723e;font-size:12px;line-height:1.8}@media(max-width:1000px){.provider-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.account-quotas{grid-template-columns:1fr}}@media(max-width:620px){.provider-grid{grid-template-columns:minmax(0,1fr)}.provider-card{padding:18px}.balance>strong{font-size:28px}}
.usage-actions{display:flex;justify-content:flex-end;margin-bottom:-4px}.account-balance{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;padding:12px 0 0;color:#587383;font-size:12px}.account-balance>strong{color:#25485c}
</style>

<template><section class="platform-usage" aria-label="GPT平台用量" :aria-busy="loading">
 <header><div><h3>GPT API · 平台用量</h3><p>目标密钥的跨应用用量 · 本机同步后更新</p></div><el-button :loading="loading" @click="load">刷新快照</el-button></header>
 <p v-if="error" class="usage-warning" role="alert">{{error}}</p>
 <template v-if="data"><p class="usage-period">{{data.from}} 至 {{data.to}} · UTC <span>{{data.source}}</span></p>
 <p v-if="data.stale" class="usage-warning">采集已超过36小时，请在本机重新同步。当前展示历史快照。</p>
 <div v-if="data.totals || data.costUsd!==null && data.costUsd!==undefined" class="usage-values">
 <article><span>GPT调用次数</span><strong>{{number(data.totals?.modelCalls)}}</strong></article>
 <article><span>输入 / 输出 Token</span><strong>{{number(data.totals?.inputTokens)}} / {{number(data.totals?.outputTokens)}}</strong></article>
 <article><span>累计 Token</span><strong>{{number(data.totals?.totalTokens)}}</strong><small>缓存命中 {{number(data.totals?.cachedTokens)}}</small></article>
 <article><span>平台费用 · USD</span><strong>{{data.costPending?'待出账':data.costUsd===null || data.costUsd===undefined?'未取得':'$'+money(data.costUsd)}}</strong></article>
 </div><p class="usage-message" :class="{'usage-warning':!['ok','partial'].includes(data.status)}">{{data.message}}</p>
 <footer><span>采集于 {{new Date(data.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}}</span><a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer">打开平台用量 ↗</a></footer></template>
</section></template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {getOpenaiPlatformUsage} from '../api'
const data=ref(null),loading=ref(false),error=ref('')
const number=n=>Number.isSafeInteger(n)?n.toLocaleString('zh-CN'):'未取得'
const money=value=>String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1')
let request=0,disposed=false
async function load(){const id=++request;loading.value=true;error.value='';try{const next=(await getOpenaiPlatformUsage()).data;if(id===request&&!disposed)data.value=next}catch{if(id===request&&!disposed)error.value='平台统计暂时读取失败，已有结果仅供历史参考。'}finally{if(id===request&&!disposed)loading.value=false}}
onMounted(load);onBeforeUnmount(()=>{disposed=true;request++})
</script>
<style scoped>.platform-usage{padding:24px;border:1px solid #dfe7ee;border-radius:14px;background:white}.platform-usage header{display:flex;align-items:center;justify-content:space-between;gap:16px}.platform-usage h3{font-size:18px;margin:0;color:#263d50}.platform-usage p{font-size:12px;line-height:1.8;color:#7d8d9c;margin:8px 0}.usage-period{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.usage-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.usage-values article{display:grid;gap:12px;padding:16px;background:#f5f9fa;border-radius:10px;min-width:0}.usage-values span,.usage-values small{font-size:11px;color:#7c909e}.usage-values strong{font-size:20px;color:#204958;overflow-wrap:anywhere}.platform-usage .usage-warning{color:#9c7135}.platform-usage footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;font-size:11px;color:#8d9ba8;margin-top:20px}.platform-usage a{color:#168491;text-decoration:none}@media(max-width:1000px){.usage-values{grid-template-columns:1fr 1fr}}@media(max-width:500px){.platform-usage{padding:18px}.usage-values{grid-template-columns:1fr}.platform-usage header{align-items:flex-start}}</style>

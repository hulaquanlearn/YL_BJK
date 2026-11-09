<template><aside v-if="latest" class="legacy-update-notice" role="status">发现新版 {{ latest }}<strong>请到「我的 → 检查更新」下载并安装</strong></aside></template>
<script setup>
import { ref,onMounted,onBeforeUnmount } from 'vue'
const latest=ref(''),installed=Number(navigator.userAgent.match(/DigitalWorkbenchAndroid\/[^\s]*android\.(\d+)/)?.[1]||0)
let timer,controller,disposed=false
async function check(){controller?.abort();controller=new AbortController();try{const response=await fetch('/app-updates/android/latest.json',{cache:'no-store',signal:controller.signal});if(!response.ok)return;const data=await response.json();if(!disposed&&data.packageName==='cn.digitalworkbench.mobile'&&data.versionCode>installed)latest.value=data.versionName}catch{}}
onMounted(()=>{if(installed>0&&installed<18){check();timer=setInterval(check,300000)}})
onBeforeUnmount(()=>{disposed=true;clearInterval(timer);controller?.abort()})
</script>
<style>.legacy-update-notice{padding:10px 14px;background:#fff0f2;color:#962139;font-size:13px;border-bottom:1px solid #f2cbd3}.legacy-update-notice strong{display:block;margin-top:4px;font-weight:600}</style>

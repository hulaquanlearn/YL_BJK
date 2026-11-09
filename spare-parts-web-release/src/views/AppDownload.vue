<template>
  <section class="app-download">
    <h1>数字记录工具</h1><p>选择你的设备，使用同一套账号和业务数据。</p>
    <img v-if="qr" :src="qr" alt="安卓与苹果系统下载页二维码" />
    <div class="download-platforms" role="tablist" aria-label="选择手机系统">
      <button id="android-tab" type="button" role="tab" :aria-selected="platform==='android'" aria-controls="android-download" :tabindex="platform==='android'?0:-1" @click="platform='android'" @keydown.right.prevent="choose('ios')" @keydown.left.prevent="choose('ios')">安卓 Android<small>下载正式安装包</small></button>
      <button id="ios-tab" type="button" role="tab" :aria-selected="platform==='ios'" aria-controls="ios-download" :tabindex="platform==='ios'?0:-1" @click="platform='ios'" @keydown.right.prevent="choose('android')" @keydown.left.prevent="choose('android')">苹果 iPhone / iPad<small>打开系统 · 添加到主屏幕</small></button>
    </div>
    <div v-show="platform==='android'" id="android-download" role="tabpanel" aria-labelledby="android-tab" class="download-panel">
      <p v-if="loading" role="status">正在读取安卓最新版本…</p>
      <template v-if="release"><strong>{{ release.versionName }}</strong><p>{{ release.notes }}</p><a class="download-primary" :href="release.url">下载安卓 App</a><small>安装包 {{ (release.size/1048576).toFixed(2) }} MB · Android 8及以上</small></template>
      <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
    </div>
    <div v-show="platform==='ios'" id="ios-download" role="tabpanel" aria-labelledby="ios-tab" class="download-panel">
      <strong>苹果主屏幕版</strong><p>直接打开使用，也可添加到主屏幕，像 App 一样打开。业务操作需要联网。</p>
      <p v-if="inWeChat" class="download-browser-tip">请点微信右上角「…」，选择在 Safari 浏览器中打开。</p>
      <a class="download-primary" href="/portal">打开苹果系统</a>
      <button class="download-copy" type="button" @click="copyApple">复制苹果入口</button><p v-if="copyStatus" role="status">{{ copyStatus }}</p>
      <ol class="ios-install-steps"><li>用 Safari 打开苹果系统，使用现有账号登录。</li><li>点 Safari 的分享按钮，选择「添加到主屏幕」。</li><li>如果看到「作为网页 App 打开」，保持开启，再点「添加」。</li><li>以后从主屏幕的「数字记录工具」图标进入。</li></ol>
      <small>当前为网页 App，无需安装 IPA。原生 iOS 安装版待开发者签名后提供。</small>
    </div>
    <p class="download-footnote">此二维码长期有效，始终提供安卓和苹果入口，无需登录即可查看。</p>
  </section>
</template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';import QRCode from 'qrcode'
const ua=navigator.userAgent,platform=ref(/iPhone|iPad|iPod/.test(ua)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?'ios':'android'),inWeChat=/MicroMessenger/i.test(ua),copyStatus=ref('')
function choose(value){platform.value=value;document.getElementById(value+'-tab')?.focus()}
async function copyApple(){try{await navigator.clipboard.writeText('https://czsdsg.cn/portal');copyStatus.value='苹果入口已复制，可粘贴到 Safari 打开。'}catch{copyStatus.value='请在 Safari 输入 czsdsg.cn/portal 打开。'}}
const release=ref(null),qr=ref(''),loading=ref(true),error=ref('');let controller,disposed=false
async function load(){loading.value=true;error.value='';controller?.abort();controller=new AbortController();try{const response=await fetch('/app-updates/android/latest.json',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json(),url=new URL(data.url);if(data.packageName!=='cn.digitalworkbench.mobile'||url.protocol!=='https:'||url.origin!==location.origin||!/^\/app-updates\/android\/[a-zA-Z0-9._-]+\.apk$/.test(url.pathname)||url.search||url.hash||url.username)throw Error();if(!disposed)release.value=data}catch{if(!disposed)error.value='暂时无法读取安卓版本，请稍后重试。'}finally{if(!disposed)loading.value=false}}
onMounted(()=>{QRCode.toDataURL('https://czsdsg.cn/app-download',{width:240,margin:2}).then(value=>{if(!disposed)qr.value=value}).catch(()=>{});load()});onBeforeUnmount(()=>{disposed=true;controller?.abort()})
</script>
<style>
.app-download{max-width:500px;box-sizing:border-box;margin:24px auto;padding:24px;background:white;border-radius:16px;text-align:center;color:#203044}.app-download h1{font-size:24px}.app-download>img{width:164px;max-width:90%;display:block;margin:16px auto}.app-download p{font-size:14px;line-height:1.8;color:#657387;white-space:pre-line}.app-download small{display:block;font-size:12px;line-height:1.7;color:#758297}.download-platforms{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:22px 0}.download-platforms>button{min-width:0;min-height:76px;padding:12px 6px;border:1px solid #dce3eb;border-radius:12px;background:#fff;color:#203044;font:inherit;font-size:14px;cursor:pointer}.download-platforms>button[aria-selected=true]{border-color:#ad2941;background:#fcf0f3;color:#ad2941;box-shadow:0 0 0 1px #ad2941}.download-platforms small{font-size:11px;margin-top:6px}.download-primary{display:block;margin:20px 0 12px;padding:14px;background:#ad2941;color:white;border-radius:10px;font-size:17px;text-decoration:none}.download-copy{min-height:44px;padding:8px 16px;border:1px solid #dce3eb;border-radius:9px;background:#fff;color:#52667b;cursor:pointer}.ios-install-steps{text-align:left;padding-left:22px;font-size:14px;line-height:1.9;color:#52667b;margin:20px 0}.ios-install-steps>li{padding:5px 0}.app-download .download-browser-tip{padding:12px;background:#fff6e9;color:#80561e;border-radius:9px}.download-panel{padding:4px 0}.app-download .download-footnote{border-top:1px solid #edf0f4;padding-top:18px;margin-top:24px;font-size:12px}.download-platforms>button:focus-visible,.download-copy:focus-visible,.download-primary:focus-visible{outline:2px solid #ad2941;outline-offset:3px}@media(max-width:540px){.app-download{margin:12px;padding:20px 16px}}
</style>

<template>
  <main ref="showroom" class="agv-showroom" :style="{'--agv-viewer-height':viewerHeight}">
    <header ref="toolbar" class="showroom-hero" :class="{'app-showroom-hero':appSurface}">
      <div class="showroom-heading">
        <div v-if="!appSurface" class="showroom-title">
          <h1>{{family==='abb'?robotTitle:family==='crane'?'智能行车':modelTitle(family,variant)}}</h1>
          <p v-if="family==='abb'" class="showroom-sub">6 轴 · 150 kg · 工作半径 3.20 m</p>
        </div>
        <div v-if="family==='abb'" class="showroom-actions" aria-label="机器人资料">
          <button type="button" :aria-pressed="robotGuide==='technical'" @click="robotGuide=robotGuide==='technical'?'':'technical'">技术资料</button>
          <button type="button" :aria-pressed="robotGuide==='pendant'" @click="robotGuide=robotGuide==='pendant'?'':'pendant'">示教器</button>
        </div>
        <div v-else-if="family==='crane'" class="showroom-actions" aria-label="智能行车资料"><button type="button" :aria-pressed="craneGuide" @click="craneGuide=!craneGuide">技术资料</button></div>
        <div v-else class="showroom-switches">
          <nav v-if="family==='latent'" class="vehicle-variants" aria-label="潜伏车车型"><button type="button" :aria-pressed="variant==='old'" @click="variant='old'">老车</button><button type="button" :aria-pressed="variant==='new'" @click="variant='new'">新车</button></nav>
          <nav class="showroom-tabs" aria-label="AGV展示内容"><button type="button" :aria-pressed="tab==='structure'" @click="tab='structure'">整车结构</button><button type="button" :aria-pressed="tab==='electrical'" @click="tab='electrical'">电路结构</button></nav>
        </div>
      </div>
      <el-select v-if="appSurface" v-model="family" class="app-vehicle-select workbench-picker" aria-label="选择设备类型" popper-class="workbench-picker-menu" fit-input-width :show-arrow="false" :offset="6">
        <el-option v-for="item in families" :key="item.id" :label="item.label" :value="item.id">
          <span class="workbench-picker-option"><span>{{item.label}}</span><el-icon v-if="family===item.id" aria-hidden="true"><Check /></el-icon></span>
        </el-option>
      </el-select>
      <nav v-else class="vehicle-types" aria-label="选择设备类型">
        <button v-for="item in families" :key="item.id" type="button" :aria-pressed="family===item.id" @click="family=item.id">{{item.label}}</button>
      </nav>
    </header>
    <section class="showroom-stage" :class="{'is-abb':family==='abb'}">
      <AbbRobotViewer v-if="family==='abb'" v-model:guide="robotGuide"/>
      <CraneShowroom v-else-if="family==='crane'" v-model:guide="craneGuide"/>
      <AgvModelViewer v-else-if="tab==='structure'" :key="family+variant" :family="family" :variant="variant"/>
      <AgvElectrical v-else :key="family+variant" :family="family" :variant="variant"/>
    </section>
  </main>
</template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount,defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {isAppSurface} from '../app/surface.mjs'
const route=useRoute(),appSurface=isAppSurface()
import AgvModelViewer from '../components/agv/AgvModelViewer.vue'
import AgvElectrical from '../components/agv/AgvElectrical.vue'
import {modelTitle} from '../utils/agv-model-catalog.mjs'
import {robotTitle} from '../utils/abb-robot.mjs'
const AbbRobotViewer=defineAsyncComponent(()=>import('../components/agv/AbbRobotViewer.vue'))
const CraneShowroom=defineAsyncComponent(()=>import('../components/agv/CraneShowroom.vue'))
const tab=ref('structure'),family=ref(['latent','counterweight','flipping','abb','crane'].includes(route.query.family)?route.query.family:'latent'),variant=ref('old'),craneGuide=ref(false)
const robotGuide=ref(family.value==='abb'&&route.query.guide==='pendant'?'pendant':'')
watch(family,()=>{robotGuide.value='';craneGuide.value=false})
const showroom=ref(),toolbar=ref(),viewerHeight=ref('calc(100dvh - 220px)')
const families=[{id:'latent',label:'潜伏车'},{id:'counterweight',label:'平衡重'},{id:'flipping',label:'翻曲车'},{id:'abb',label:'ABB机器人'},{id:'crane',label:'智能行车'}]
let observer,frame=0
function measure(){
  cancelAnimationFrame(frame)
  frame=requestAnimationFrame(()=>{
    if(!toolbar.value||!showroom.value)return
    const viewport=window.visualViewport
    const stageTop=toolbar.value.getBoundingClientRect().bottom+window.scrollY+12
    const viewportHeight=viewport?.height||window.innerHeight
    viewerHeight.value=Math.max(600,Math.floor(viewportHeight-stageTop-8))+'px'
  })
}
onMounted(()=>{observer=new ResizeObserver(measure);observer.observe(toolbar.value);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure()})
onBeforeUnmount(()=>{observer?.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)})
</script>
<style scoped>
:global(#app .page-content[data-page="/agv-vehicles"]){max-width:none;padding:10px 12px 16px}
.agv-showroom{--show-ink:#22384b;--show-muted:#74899a;--show-line:#dfe9f0;--show-accent:var(--mobile-accent,#0f7383);--show-soft:#eef6f8;width:100%;min-width:0;display:flex;flex-direction:column;gap:12px;color:var(--show-ink)}
.showroom-hero{display:flex;flex-direction:column;gap:12px;padding:16px 16px 14px;border:1px solid var(--show-line);border-radius:20px;background:linear-gradient(158deg,#ffffff 0%,#f5fafc 58%,#eef6f9 100%);box-shadow:0 10px 30px #1b34400f}
.showroom-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.showroom-title{min-width:0;flex:1 1 200px}
.showroom-title h1{margin:0;color:var(--show-ink);font-size:20px;font-weight:760;line-height:1.3;letter-spacing:-.2px;overflow-wrap:anywhere}
.showroom-sub{margin:4px 0 0;color:var(--show-muted);font-size:12px;line-height:1.6}
.showroom-actions{display:flex;gap:8px;flex:none}
.showroom-actions button{min-height:40px;padding:0 14px;border:1px solid var(--show-line);border-radius:12px;background:#fff;color:#4b6579;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px #1b34400a}
.showroom-actions button[aria-pressed=true]{border-color:color-mix(in srgb,var(--show-accent) 42%,#ffffff);background:var(--show-soft);color:var(--show-accent)}
.vehicle-types{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:4px;border:1px solid var(--show-line);border-radius:14px;background:#edf4f8}
.vehicle-types button{min-height:40px;border:0;border-radius:10px;background:transparent;color:#5a7387;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .16s ease,color .16s ease,box-shadow .16s ease}
.vehicle-types button[aria-pressed=true]{background:#fff;color:var(--show-accent);box-shadow:0 3px 10px #1b344014}
.vehicle-types button:active{transform:scale(.98)}
.showroom-switches{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin-left:auto;max-width:100%}
.vehicle-variants,.showroom-tabs{display:flex;gap:6px;padding:3px;border-radius:11px;background:#e9f1f6}
.vehicle-variants button,.showroom-tabs button{min-height:34px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:#5d778b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.vehicle-variants button[aria-pressed=true],.showroom-tabs button[aria-pressed=true]{background:#fff;color:var(--show-accent);box-shadow:0 2px 7px #1b344012}
.showroom-stage{position:relative;min-width:0;display:flex;flex-direction:column;gap:8px;padding:8px;border:1px solid var(--show-line);border-radius:20px;background:#fff;box-shadow:0 12px 34px #1b344010}
@media(min-width:1100px){
  .showroom-hero{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(360px,1.2fr) auto;align-items:center;gap:12px;padding:12px}
  .showroom-heading{display:contents}
  .showroom-title{grid-column:1;grid-row:1}
  .vehicle-types{grid-column:2;grid-row:1}
  .showroom-actions,.showroom-switches{grid-column:3;grid-row:1}
}
.agv-showroom button:focus-visible{outline:2px solid var(--show-accent);outline-offset:2px}
/* Viewer chrome: compact on desktop, re-flowed on phones. The viewer keeps its
   own behaviour; these rules only adjust its surrounding layout and touch targets. */
.showroom-stage :deep(.robot-viewer){height:var(--agv-viewer-height,680px);min-height:440px;width:100%;min-width:0;gap:8px;overflow:hidden}
.showroom-stage :deep(.robot-toolbar){min-height:0}
.showroom-stage :deep(.robot-metrics){color:var(--show-muted);font-size:11.5px}
.showroom-stage :deep(.robot-toolbar button){min-height:38px;border:1px solid var(--show-line);border-radius:10px;background:#fff;color:#42647a;font-size:12.5px;font-weight:600;box-shadow:0 2px 8px #1b34400a}
.showroom-stage :deep(.robot-toolbar button[aria-pressed=true]),.showroom-stage :deep(.robot-toolbar .robot-menu-trigger[aria-expanded=true]){border-color:color-mix(in srgb,var(--show-accent) 40%,#ffffff);background:var(--show-soft);color:var(--show-accent)}
.showroom-stage :deep(.robot-tool-select){min-width:116px}
.showroom-stage :deep(.robot-tool-select .el-select__wrapper){min-height:44px;border-radius:10px;background:#fff}
.showroom-stage :deep(.robot-tool-menu-body){border-radius:12px;box-shadow:0 14px 36px #1b344022}
.showroom-stage :deep(.robot-tool-menu-body button){min-height:38px}
.showroom-stage :deep(.abb-model-workspace){min-height:0;border-color:var(--show-line);border-radius:14px;background:radial-gradient(ellipse at 54% 38%,#ffffff 0%,#eef5f9 55%,#e2ecf2 100%)}
.showroom-stage :deep(.robot-controls){padding:10px;border:1px solid var(--show-line);border-radius:14px;background:#fbfdfe;min-width:0}
.showroom-stage :deep(.robot-controls label){color:#48677d;font-size:12.5px}
.showroom-stage :deep(.robot-controls input[type=range]){accent-color:var(--show-accent)}
.showroom-stage :deep(.robot-action-group){gap:8px;min-width:0}
.showroom-stage :deep(.robot-action-group button){min-height:38px;border-radius:10px;padding:0 10px}
.showroom-stage :deep(.robot-controls .robot-primary){border-color:var(--show-accent);background:var(--show-accent);color:#fff}
.showroom-stage :deep(.robot-disassembly-status),.showroom-stage :deep(.robot-hint){color:var(--show-muted);font-size:11.5px}
.showroom-stage :deep(.robot-info){border-radius:14px}
@media(max-width:700px){
  .vehicle-types{grid-template-columns:repeat(3,minmax(0,1fr))}
  .showroom-stage :deep(.robot-viewer){height:auto!important;min-height:0!important}
  .showroom-stage :deep(.robot-toolbar){display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;justify-content:flex-start!important;gap:9px!important;width:100%!important;min-width:0!important}
  .showroom-stage :deep(.robot-toolbar > div){display:grid!important;margin-left:0!important;width:100%!important;min-width:0!important}
  .showroom-stage :deep(.robot-toolbar-right){display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;justify-content:stretch!important;align-items:stretch!important;flex-wrap:nowrap!important}
  .showroom-stage :deep(.robot-toolbar-right > *){width:100%!important;min-width:0!important;max-width:100%!important}
  .showroom-stage :deep(.robot-tool-select){width:100%!important;min-width:0!important;min-height:42px!important}
  .showroom-stage :deep(.robot-tool-select .el-select__wrapper){min-height:42px}
  .showroom-stage :deep(.robot-toolbar-right){position:relative}
  .showroom-stage :deep(.robot-tool-menu){position:static}
  .showroom-stage :deep(.robot-tool-menu-body){left:0;right:0;top:calc(100% + 6px);min-width:0;max-height:min(280px,42dvh);overflow:auto}
  .showroom-stage :deep(.robot-tool-menu-body button){flex:none}
  .showroom-stage :deep(.robot-metrics){display:none}
  .showroom-stage :deep(.robot-toolbar button){min-width:0!important;min-height:42px!important;padding:0 6px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .showroom-stage :deep(.abb-model-workspace){flex:none!important;height:320px!important;min-height:0!important;border-radius:16px}
  .showroom-stage :deep(.robot-controls){display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;justify-content:flex-start!important;gap:9px!important;width:100%!important;min-width:0!important;overflow:hidden;padding:9px;border-radius:14px}
  .showroom-stage :deep(.robot-controls label){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:100%!important;min-width:0!important;min-height:34px}
  .showroom-stage :deep(.robot-controls input[type=range]){width:100%}
  .showroom-stage :deep(.robot-disassembly-status){align-self:flex-end}
  .showroom-stage :deep(.robot-action-group){display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;width:100%!important;min-width:0!important;justify-content:stretch!important;margin:0!important}
  .showroom-stage :deep(.robot-action-group button){width:100%!important;min-width:0!important;min-height:42px!important;padding:0 4px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .showroom-stage :deep(.robot-hint){display:none}
  .showroom-stage :deep(.robot-label),.showroom-stage :deep(.robot-leaders){display:none}
  .showroom-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
  .showroom-actions button{width:100%;min-height:42px}
  .showroom-stage :deep(.robot-toolbar-right > button:last-child){grid-column:1/-1}
  .showroom-stage :deep(.robot-tool-menu > button){width:100%!important;min-height:42px!important}
  .showroom-stage :deep(.robot-action-group .robot-primary){grid-column:span 2}
}
@media(max-width:380px){.showroom-stage :deep(.robot-action-group){grid-template-columns:repeat(2,minmax(0,1fr))!important}}

.app-showroom-hero{display:flex;gap:8px;padding:10px 12px;border-radius:14px}
.app-vehicle-select{order:-1;width:100%}
.app-showroom-hero .showroom-heading{display:flex}
.app-showroom-hero .showroom-switches{flex-wrap:nowrap;justify-content:flex-start;gap:6px;margin:0;max-width:100%}
.app-showroom-hero .vehicle-variants,.app-showroom-hero .showroom-tabs{gap:3px;padding:2px}
.app-showroom-hero .showroom-switches button{min-height:40px;padding:0 clamp(5px,1.5vw,10px);white-space:nowrap}
</style>

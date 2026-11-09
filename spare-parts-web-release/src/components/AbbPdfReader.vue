<template>
  <section class="abb-pdf-reader" aria-label="站内PDF连续阅读器">
    <div class="abb-pdf-toolbar" role="toolbar" aria-label="PDF阅读工具">
      <div class="abb-pdf-page-nav">
        <button type="button" :disabled="currentPage<=1||!pageCount" aria-label="上一页" @click="goPage(currentPage-1)">‹</button>
        <label>第 <input ref="pageInput" :value="currentPage" type="number" min="1" :max="pageCount||1" aria-label="PDF页码" @change="goPage(Number($event.target.value))" @keydown.enter.prevent="goPage(Number($event.target.value))"/> / {{pageCount||'…'}} 页</label>
        <button type="button" :disabled="!pageCount" @click="goPage(Number(pageInput.value))">跳转</button>
        <button type="button" :disabled="currentPage>=pageCount||!pageCount" aria-label="下一页" @click="goPage(currentPage+1)">›</button>
      </div>
      <div class="abb-pdf-zoom" aria-label="缩放">
        <button type="button" :disabled="zoom<=.5" aria-label="缩小" @click="setZoom(zoom-.15)">−</button>
        <span>{{Math.round(zoom*100)}}%</span>
        <button type="button" :disabled="zoom>=3" aria-label="放大" @click="setZoom(zoom+.15)">＋</button>
        <button type="button" class="abb-pdf-fit" :aria-pressed="zoom===1" @click="fitWidth">适应宽度</button>
      </div>
      <div class="abb-pdf-layout" role="group" aria-label="阅读布局">
        <button type="button" :aria-pressed="layout==='continuous'" @click="setLayout('continuous')">连续</button>
        <button type="button" :aria-pressed="layout==='spread'" @click="setLayout('spread')">并排</button>
      </div>
      <slot name="actions"/>
    </div>
    <p v-if="error" role="alert" class="abb-pdf-error">{{error}}<button type="button" @click="open">重试</button></p>
    <p v-else-if="loading" role="status" class="abb-pdf-status">正在打开完整手册…</p>
    <div v-else ref="surface" class="abb-pdf-surface" @scroll.passive="scrollChanged">
      <div class="abb-pdf-pages" :class="layout==='spread'?'is-spread':'is-continuous'" :style="{'--page-ratio':pageRatio,'--pdf-zoom':zoom}">
        <div v-for="page in pageList" :key="page" :ref="el=>setPageEl(page,el)" class="abb-pdf-page-shell" :class="{'is-ready':pageReady.has(page)}" :data-page="page">
          <canvas v-if="visiblePages.has(page)" :ref="el=>setCanvas(page,el)" class="abb-pdf-canvas" :aria-label="'PDF第'+page+'页'" :tabindex="page===currentPage?0:-1"/>
          <div v-if="!pageReady.has(page)" class="abb-pdf-page-placeholder"><span v-if="visiblePages.has(page)">正在加载第 {{page}} 页…</span><span v-else>第 {{page}} 页</span></div>
        </div>
      </div>
    </div>
  </section>
</template>
<script setup>
import {ref,computed,reactive,watch,nextTick,onMounted,onBeforeUnmount} from 'vue'
import PdfWorker from '../workers/pdf.worker.mjs?worker'
import {readPdfData} from '../utils/pdf-document.mjs'
import {ensurePdfCompatibility} from '../utils/pdf-compat.mjs'

const props=defineProps({file:{type:Blob,required:true},initialPage:{type:Number,default:1}})
const emit=defineEmits(['page-change'])
const surface=ref(),pageInput=ref(),loading=ref(true),error=ref(''),pageCount=ref(0),currentPage=ref(1),zoom=ref(1),layout=ref((typeof window!=='undefined'?window.innerWidth:1200)>=1100?'spread':'continuous'),pageRatio=ref(1.414)
const visiblePages=reactive(new Set()),pageReady=reactive(new Set()),pageList=computed(()=>Array.from({length:pageCount.value},(_,index)=>index+1))
const pageEls=new Map(),canvasRefs=new Map(),renderTasks=new Map(),pageTokens=new Map()
let pdf=null,workerEngine=null,workerPort=null,task=null,requestGeneration=0,renderVersion=0,observer=null,resizeObserver=null,scrollFrame=0,resizeFrame=0,disposed=false

function clampPage(value){const number=Math.trunc(Number(value)||1);return Math.min(Math.max(1,number),pageCount.value||1)}
function setPageEl(page,element){if(element)pageEls.set(page,element);else pageEls.delete(page)}
function setCanvas(page,element){if(element)canvasRefs.set(page,element);else canvasRefs.delete(page)}
function emitPage(){if(pageCount.value)emit('page-change',currentPage.value)}
function goPage(value){if(!pageCount.value)return;currentPage.value=clampPage(value);emitPage();const shell=pageEls.get(currentPage.value);if(shell&&surface.value)surface.value.scrollTop+=shell.getBoundingClientRect().top-surface.value.getBoundingClientRect().top;}
function updateCurrentPage(){if(!surface.value)return;const top=surface.value.getBoundingClientRect().top;let nearest=currentPage.value,distance=Infinity;for(const [page,shell] of pageEls){const delta=Math.abs(shell.getBoundingClientRect().top-top);if(delta<distance){distance=delta;nearest=page}}if(nearest!==currentPage.value){currentPage.value=nearest;emitPage()}}
function scrollChanged(){if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateCurrentPage()})}
function setLayout(value){if(layout.value===value)return;const page=currentPage.value;layout.value=value;resetRenderedPages();nextTick(()=>goPage(page))}
function setZoom(value){const next=Math.max(.5,Math.min(3,Math.round((Number(value)||1)*100)/100));if(next===zoom.value)return;const page=currentPage.value;zoom.value=next;resetRenderedPages();nextTick(()=>goPage(page))}
function fitWidth(){setZoom(1)}
function resetRenderedPages(){renderVersion++;for(const item of renderTasks.values())item.cancel?.();renderTasks.clear();pageReady.clear();nextTick(()=>{for(const page of visiblePages)renderPage(page)})}

async function renderPage(page){
 if(!pdf||disposed||pageReady.has(page))return
 const previous=renderTasks.get(page);previous?.cancel?.();if(previous)await previous.promise.catch(()=>{});
 const token=(pageTokens.get(page)||0)+1;pageTokens.set(page,token);const version=renderVersion,canvas=canvasRefs.get(page),shell=pageEls.get(page);if(!canvas||!shell)return
 let activeRender=null
 try{
  const document=pdf;const item=await document.getPage(page);if(disposed||!pdf||version!==renderVersion||token!==pageTokens.get(page)||!visiblePages.has(page))return
  const base=item.getViewport({scale:1}),width=Math.max(120,(shell.clientWidth||surface.value?.clientWidth||900)-2),scaleWidth=width/base.width,pixel=Math.min(devicePixelRatio||1,2,Math.sqrt(8000000/(base.width*base.height*scaleWidth*scaleWidth)))
  const viewport=item.getViewport({scale:scaleWidth});canvas.width=Math.ceil(viewport.width*pixel);canvas.height=Math.ceil(viewport.height*pixel);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px'
  activeRender=item.render({canvasContext:canvas.getContext('2d'),viewport,transform:pixel===1?null:[pixel,0,0,pixel,0,0]});renderTasks.set(page,activeRender)
  await activeRender.promise
  if(disposed||version!==renderVersion||token!==pageTokens.get(page)||!visiblePages.has(page))return
  pageReady.add(page);pageRatio.value=Math.max(.2,viewport.height/viewport.width)
 }catch(e){if(e.name!=='RenderingCancelledException'&&!disposed)error.value='本页暂时无法显示，请重试。'}finally{if(activeRender&&renderTasks.get(page)===activeRender)renderTasks.delete(page)}
}
async function renderVisible(){for(const page of visiblePages)await renderPage(page)}
function observePages(){
 observer?.disconnect()
 if(!surface.value)return
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const page=Number(entry.target.dataset.page);if(entry.isIntersecting){visiblePages.add(page);nextTick(()=>renderPage(page))}else{visiblePages.delete(page);pageReady.delete(page);pageTokens.set(page,(pageTokens.get(page)||0)+1);renderTasks.get(page)?.cancel?.()}}
 },{root:surface.value,rootMargin:'700px 0px'})
 nextTick(()=>{for(const element of pageEls.values())observer.observe(element)})
}
async function open(){
 const generation=++requestGeneration,previous=task,oldEngine=workerEngine,oldPort=workerPort;observer?.disconnect();resizeObserver?.disconnect();for(const item of renderTasks.values())item.cancel?.();renderTasks.clear();pdf=null;task=null;workerEngine=null;workerPort=null
 disposed=false;loading.value=true;error.value='';pageCount.value=0;pageReady.clear();visiblePages.clear();canvasRefs.clear();pageEls.clear();pageTokens.clear();renderVersion++;pageRatio.value=1.414
 try{
  await previous?.destroy().catch(()=>{});try{oldEngine?.destroy()}catch{}try{oldPort?.terminate()}catch{}
  await ensurePdfCompatibility();const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');const data=await readPdfData(props.file);if(disposed||generation!==requestGeneration)return
  workerPort=new PdfWorker();workerEngine=new lib.PDFWorker({port:workerPort});task=lib.getDocument({data,worker:workerEngine,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',useSystemFonts:true,isEvalSupported:false})
  const opened=await task.promise;if(disposed||generation!==requestGeneration){await task.destroy().catch(()=>{});return}
  pdf=opened;const first=await opened.getPage(1);const size=first.getViewport({scale:1});pageRatio.value=size.height/size.width;pageCount.value=pdf.numPages;currentPage.value=clampPage(props.initialPage);loading.value=false;await nextTick();observePages();await nextTick();goPage(currentPage.value);let lastWidth=surface.value.clientWidth;resizeObserver=new ResizeObserver(()=>{const width=surface.value?.clientWidth;if(!width||Math.abs(width-lastWidth)<2)return;lastWidth=width;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resetRenderedPages)});resizeObserver.observe(surface.value)
 }catch(e){if(!disposed&&generation===requestGeneration)error.value='PDF暂时无法读取，请重试。'}finally{if(!disposed&&generation===requestGeneration)loading.value=false}
}
watch(()=>props.file,()=>{if(!disposed)open()})
watch(()=>props.initialPage,value=>{if(pageCount.value)goPage(value)})
onMounted(open)
onBeforeUnmount(()=>{disposed=true;requestGeneration++;renderVersion++;observer?.disconnect();observer=null;resizeObserver?.disconnect();cancelAnimationFrame(scrollFrame);cancelAnimationFrame(resizeFrame);for(const item of renderTasks.values())item.cancel?.();renderTasks.clear();task?.destroy().catch(()=>{});try{workerEngine?.destroy()}catch{}try{workerPort?.terminate()}catch{}pdf=null})
</script>
<style scoped>
.abb-pdf-reader{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;background:#eef3f7;border-radius:10px;overflow:hidden;color:#28485d}.abb-pdf-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap;padding:8px 10px;background:#fff;border-bottom:1px solid #dbe6ed;flex:none;font-size:12px}.abb-pdf-page-nav,.abb-pdf-zoom,.abb-pdf-layout{display:flex;align-items:center;gap:5px}.abb-pdf-toolbar label{display:flex;align-items:center;gap:4px;color:#5f798b;white-space:nowrap}.abb-pdf-toolbar input{width:46px;border:1px solid #d4e1e9;border-radius:5px;padding:5px 3px;text-align:center;color:#294c62;background:#f8fbfd}.abb-pdf-toolbar button{border:1px solid #d3e1e9;background:#fff;border-radius:6px;color:#315d74;min-height:28px;padding:0 8px;cursor:pointer;font:inherit;font-size:12px}.abb-pdf-toolbar button:hover{background:#f0f7fa}.abb-pdf-toolbar button[aria-pressed=true]{background:#e3f2f5;border-color:#bcdde5;color:#0d7083;font-weight:600}.abb-pdf-toolbar button:disabled{opacity:.4;cursor:default}.abb-pdf-zoom span{min-width:38px;text-align:center;color:#6a8394;font-variant-numeric:tabular-nums}.abb-pdf-fit{padding:0 8px!important}.abb-pdf-surface{flex:1;min-height:0;overflow:auto;padding:12px;scroll-behavior:auto}.abb-pdf-pages{display:grid;gap:12px;align-items:start;width:calc(100%*var(--pdf-zoom,1));max-width:none;margin:0 auto}.abb-pdf-pages.is-continuous{grid-template-columns:minmax(0,1fr)}.abb-pdf-pages.is-spread{grid-template-columns:repeat(2,minmax(0,1fr))}.abb-pdf-page-shell{position:relative;min-width:0;width:100%;aspect-ratio:1 / var(--page-ratio);background:#fff;border:1px solid #d5e1e9;border-radius:4px;box-shadow:0 2px 10px #1f3b5020;overflow:hidden;content-visibility:auto;contain-intrinsic-size:auto 900px}.abb-pdf-page-shell.is-ready{background:#fff}.abb-pdf-canvas{display:block;width:100%!important;height:100%!important;object-fit:contain;background:#fff}.abb-pdf-page-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#93a7b4;font-size:12px;background:repeating-linear-gradient(135deg,#fbfdff,#fbfdff 12px,#f4f8fb 12px,#f4f8fb 24px)}.abb-pdf-page-placeholder span{padding:5px 8px;border-radius:4px;background:#ffffffd9}.abb-pdf-error,.abb-pdf-status{margin:0;padding:14px;color:#8b4a58;font-size:13px}.abb-pdf-status{color:#5e7b8b}.abb-pdf-error button{min-height:28px;border:1px solid #d7e2e9;border-radius:5px;background:#fff;color:#42677d;margin-left:8px;cursor:pointer}.abb-pdf-hint{margin:0;padding:7px 12px;color:#6c8494;font-size:11px;text-align:center;background:#f7fafc;border-top:1px solid #e2eaf0}.abb-pdf-surface:focus-visible,.abb-pdf-canvas:focus-visible{outline:2px solid #168598;outline-offset:2px}@media(max-width:900px){.abb-pdf-pages.is-spread{grid-template-columns:minmax(0,1fr)}.abb-pdf-surface{padding:8px}.abb-pdf-toolbar{gap:6px 10px;padding:7px 8px}}@media(max-width:520px){.abb-pdf-toolbar{justify-content:center}.abb-pdf-hint{display:none}.abb-pdf-zoom span{display:none}}
</style>

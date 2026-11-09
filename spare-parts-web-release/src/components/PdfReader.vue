<template><section class="pdf-reader" aria-label="站内PDF阅读器"><div class="pdf-toolbar"><el-button size="small" :disabled="page<=1||busy" @click="page--">上一页</el-button><label>第 <input v-model.number="page" type="number" :min="1" :max="count||1" aria-label="PDF页码"/> / {{count||'…'}} 页</label><el-button size="small" :disabled="page>=count||busy" @click="page++">下一页</el-button><button type="button" class="pdf-fit-button" @click="fitPage">适应页面</button></div><p v-if="error" role="alert" class="pdf-error">{{error}}<el-button text @click="open">重试</el-button></p><p v-else-if="busy" role="status" class="pdf-loading">正在加载第 {{page}} 页…</p><div ref="surface" class="pdf-surface" @wheel.prevent="wheelZoom" @pointerdown="pointerStart" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd"><canvas ref="canvas" aria-label="PDF页面，可滚轮或双指缩放" :tabindex="busy||error?-1:0" role="button" @keydown.enter.prevent="previewPage" @keydown.space.prevent="previewPage"/></div><p v-if="!error&&count" class="pdf-hint">{{previewBusy?'正在打开大图…':'滚轮或双指缩放 · 拖动查看 · 适应页面恢复'}}</p><el-image-viewer v-if="pagePreview" :url-list="[pagePreview]" :infinite="false" teleported @close="pagePreview=''" /></section></template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount} from 'vue'
import PdfWorker from '../workers/pdf.worker.mjs?worker'
import {pdfFitScale} from '../utils/pdf-fit.mjs'
import {readPdfData} from '../utils/pdf-document.mjs'
import {ensurePdfCompatibility} from '../utils/pdf-compat.mjs'
const props=defineProps({file:{type:Blob,required:true},initialPage:{type:Number,default:1}}),page=ref(props.initialPage),count=ref(0),scale=ref(1),busy=ref(false),error=ref(''),canvas=ref(),surface=ref(),pagePreview=ref(''),previewBusy=ref(false)
let workerEngine,workerPort,dialogElement,ownsDialogClass=false,zoomTimer,baseSize=null;
function releaseWorker(engine,port){try{engine?.destroy()}catch{}try{port?.terminate()}catch{}}
let pdf,task,renderTask,request=0,disposed=false,observer,timer,previewTask
async function open(){
 const id=++request;renderRequest++;baseSize=null;scale.value=1;busy.value=true;error.value="";count.value=0;pagePreview.value="";previewBusy.value=false;previewTask?.cancel();renderTask?.cancel();const previous=task,oldEngine=workerEngine,oldPort=workerPort;task=null;pdf=null;workerEngine=null;workerPort=null
 let stage="component",opening
 try{
  await previous?.destroy().catch(()=>{});releaseWorker(oldEngine,oldPort)
  await ensurePdfCompatibility()
  const lib=await import('pdfjs-dist/legacy/build/pdf.mjs')
  stage="file";const data=await readPdfData(props.file)
  if(disposed||id!==request)return
  stage="document";workerPort=new PdfWorker();workerEngine=new lib.PDFWorker({port:workerPort})
  opening=lib.getDocument({data,worker:workerEngine,cMapUrl:"/pdfjs/cmaps/",cMapPacked:true,standardFontDataUrl:"/pdfjs/standard_fonts/",useSystemFonts:true,isEvalSupported:false});task=opening
  const loaded=await opening.promise
  if(disposed||id!==request){await opening.destroy().catch(()=>{});return}
  pdf=loaded;count.value=pdf.numPages;page.value=Math.min(Math.max(1,Math.trunc(Number(props.initialPage))||1),count.value);await render()
 }catch(e){if(!disposed&&id===request)error.value=stage==="component"?"阅读组件未能加载，请刷新页面后重试。":stage==="file"?"文件暂时未能读取，请重新打开。":"PDF暂时无法读取，请重试。"}
 finally{if(!disposed&&id===request)busy.value=false}
}
let renderRequest=0
async function render(){
 if(!pdf||!canvas.value)return
 const id=++renderRequest,document=pdf,opening=request;renderTask?.cancel();busy.value=true
 try{
  const number=Math.min(Math.max(1,Math.trunc(Number(page.value)||1)),document.numPages)
  if(page.value!==number)page.value=number
  const current=await document.getPage(number)
  if(id!==renderRequest||disposed||document!==pdf||opening!==request)return
  const base=current.getViewport({scale:1}),style=getComputedStyle(surface.value),space={width:Math.max(1,surface.value.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2),height:Math.max(1,surface.value.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-2)},viewport=current.getViewport({scale:pdfFitScale(base,space,'page')*scale.value}),pixel=Math.min(window.devicePixelRatio||1,2,Math.sqrt(12000000/(viewport.width*viewport.height)))
  baseSize={width:viewport.width/scale.value,height:viewport.height/scale.value};
  canvas.value.width=Math.ceil(viewport.width*pixel);canvas.value.height=Math.ceil(viewport.height*pixel);canvas.value.style.width=viewport.width+'px';canvas.value.style.height=viewport.height+'px'
  renderTask=current.render({canvasContext:canvas.value.getContext('2d'),viewport,transform:pixel===1?null:[pixel,0,0,pixel,0,0]})
  await renderTask.promise
  if(id===renderRequest&&!disposed&&document===pdf&&opening===request)error.value=''
 }catch(e){if(e.name!=='RenderingCancelledException'&&id===renderRequest&&!disposed&&document===pdf&&opening===request)error.value='本页暂时无法显示，请重试。'}
 finally{if(id===renderRequest&&!disposed&&document===pdf&&opening===request)busy.value=false}
}

async function previewPage(){
 if(busy.value||error.value||previewBusy.value||!pdf)return
 const documentAtClick=pdf,number=page.value,opening=request;previewBusy.value=true
 let image
 try{
  const current=await documentAtClick.getPage(number)
  if(disposed||documentAtClick!==pdf||opening!==request)return
  const base=current.getViewport({scale:1}),viewport=current.getViewport({scale:Math.min(3,2800/Math.max(base.width,base.height))})
  image=document.createElement("canvas");image.width=Math.ceil(viewport.width);image.height=Math.ceil(viewport.height)
  previewTask=current.render({canvasContext:image.getContext("2d"),viewport});await previewTask.promise
  if(!disposed&&documentAtClick===pdf&&opening===request&&number===page.value)pagePreview.value=image.toDataURL("image/png")
 }catch(e){if(e.name!=="RenderingCancelledException"&&!disposed&&documentAtClick===pdf&&opening===request)error.value="大图暂时未能加载，请重试。"}
 finally{if(image){image.width=0;image.height=0}if(opening===request)previewBusy.value=false}
}
// Reflow the existing page immediately; redraw sharply after the gesture settles.
const pointers=new Map()
function zoomAt(value,x,y){
 if(!baseSize||!surface.value||!canvas.value)return
 const next=Math.min(8,Math.max(.5,value)),previous=scale.value;if(Math.abs(next-previous)<.0001)return
 const area=surface.value,el=canvas.value,before=el.getBoundingClientRect(),rx=(x-before.left)/Math.max(1,before.width),ry=(y-before.top)/Math.max(1,before.height)
 scale.value=next;el.style.width=baseSize.width*next+'px';el.style.height=baseSize.height*next+'px';const after=el.getBoundingClientRect();area.scrollLeft+=after.left+rx*after.width-x;area.scrollTop+=after.top+ry*after.height-y
 clearTimeout(zoomTimer);zoomTimer=setTimeout(render,100)
}
function fitPage(){clearTimeout(zoomTimer);scale.value=1;surface.value?.scrollTo?.(0,0);render()}
function wheelZoom(event){zoomAt(scale.value*Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.003),event.clientX,event.clientY)}
function pointerStart(event){if(event.pointerType==='mouse'&&event.button!==0)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});surface.value?.setPointerCapture?.(event.pointerId)}
function pointerMove(event){
 const before=pointers.get(event.pointerId);if(!before)return;const pair=[...pointers.values()],oldDistance=pair.length===2?Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y):0;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY})
 if(pointers.size===2){const now=[...pointers.values()],distance=Math.hypot(now[0].x-now[1].x,now[0].y-now[1].y);if(oldDistance>1)zoomAt(scale.value*distance/oldDistance,(now[0].x+now[1].x)/2,(now[0].y+now[1].y)/2)}
 else if(pointers.size===1&&surface.value){surface.value.scrollLeft+=before.x-event.clientX;surface.value.scrollTop+=before.y-event.clientY}
}
function pointerEnd(event){pointers.delete(event.pointerId)}
watch(()=>props.file,()=>{if(canvas.value)open()});watch(()=>props.initialPage,v=>{page.value=v});watch(page,()=>{scale.value=1;surface.value?.scrollTo?.(0,0);render()})
onMounted(()=>{dialogElement=surface.value?.closest('.el-dialog');ownsDialogClass=!!dialogElement&&!dialogElement.classList.contains('abb-model-dialog');if(ownsDialogClass)dialogElement.classList.add('pdf-document-dialog');open();observer=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(render,120)});observer.observe(surface.value)})
onBeforeUnmount(()=>{disposed=true;clearTimeout(zoomTimer);pointers.clear();request++;renderRequest++;clearTimeout(timer);observer?.disconnect();pagePreview.value='';previewTask?.cancel();renderTask?.cancel();task?.destroy().catch(()=>{});releaseWorker(workerEngine,workerPort);if(ownsDialogClass)dialogElement?.classList.remove('pdf-document-dialog')})
</script>
<style scoped>.pdf-reader{position:relative;width:100%;min-width:0;min-height:0;display:flex;flex-direction:column;align-self:stretch;background:#edf1f5;border-radius:8px;overflow:hidden}.pdf-toolbar{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:10px;background:white;border-bottom:1px solid #e1e7ed;font-size:12px;color:#63768a}.pdf-toolbar label{display:flex;align-items:center;gap:5px}.pdf-toolbar input{width:48px;border:1px solid #dfe5ed;padding:6px;border-radius:5px;color:#314b60}.pdf-toolbar>.el-select{width:120px}.pdf-surface{touch-action:none;overscroll-behavior:contain;cursor:grab;user-select:none;flex:1;min-height:0;overflow:auto;padding:12px;text-align:center}.pdf-surface canvas{display:block;margin:auto;background:white;box-shadow:0 2px 12px #15253615;max-width:none}.pdf-loading,.pdf-error{padding:10px;margin:0;font-size:12px;color:#718399}.pdf-loading{position:absolute;top:58px;left:12px;right:12px;z-index:1;background:#ffffffea;pointer-events:none}.pdf-error{color:#a33346}.pdf-hint{margin:0;padding:8px 12px;font-size:12px;color:#64758a;text-align:center}.pdf-surface canvas{cursor:grab}.pdf-surface:active,.pdf-surface:active canvas{cursor:grabbing}.pdf-fit-button{border:1px solid #d7e2e9;border-radius:6px;background:#fff;color:#42677d;min-height:30px;padding:0 10px;cursor:pointer}.pdf-surface canvas:focus-visible{outline:2px solid #168598;outline-offset:3px}@media(max-width:480px){.pdf-toolbar{gap:6px;padding:8px}.pdf-toolbar>.el-select{width:105px}.pdf-toolbar .el-button{margin:0;padding:7px}.pdf-surface{padding:8px}}</style>

<style>
.el-dialog.pdf-document-dialog{display:flex;flex-direction:column;height:min(90vh,1000px);height:min(90dvh,1000px);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);margin:12px auto!important}
.el-dialog.pdf-document-dialog>.el-dialog__body{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden!important;padding-bottom:0}
.pdf-document-dialog .pdf-reader{flex:1;height:100%;min-height:0}
.pdf-document-dialog .pdf-toolbar,.pdf-document-dialog .pdf-hint,.pdf-document-dialog .pdf-loading,.pdf-document-dialog .pdf-error{flex:none}
</style>

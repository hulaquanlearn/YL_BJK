<template>
 <div class="robot-code-reader" :class="{wrap,dark}">
  <div class="code-toolbar"><span><el-icon><Document /></el-icon><strong class="code-filename">{{file.name}}</strong><small>只读</small></span><div class="code-quick-actions"><slot name="quick-actions"/><button class="reader-tools-toggle" type="button" :aria-expanded="toolsOpen" @click="toolsOpen=!toolsOpen"><el-icon><Setting/></el-icon>阅读设置</button></div><div class="code-reading-options" :class="{'is-open':toolsOpen}"><el-checkbox v-model="wrap">自动换行</el-checkbox><el-checkbox v-if="notesAt.size" v-model="showNotes">显示AI注释</el-checkbox><button class="theme-toggle" type="button" :aria-label="dark?'切换到浅色':'切换到深色'" @click="toggleTheme">{{dark?'浅色':'深色'}}</button><slot name="actions"/></div></div>
  <div ref="viewport" class="code-viewport source-scroll" tabindex="0" :aria-label="file.name+' 源码，只读'">
   <div class="code-lines"><div v-for="line in visible" :id="'robot-line-'+line.number" :key="line.number" class="code-row source-line" :class="{highlighted:highlight && line.number>=highlight.startLine && line.number<=highlight.endLine}">
    <div class="source-gutter"><span class="line-number">{{line.number}}</span></div>
    <div class="code-content"><code class="code-text"><span v-for="(token,i) in line.tokens" :key="i" :class="'rapid-'+token.kind">{{token.text}}</span><span v-if="!line.text"> </span></code><div v-for="(note,i) in shownNotes.get(line.number)||[]" :key="i" class="line-annotation"><small>AI 注释 · 待核对</small><b v-for="warning in explanationReview(note)" :key="warning" class="review-warning">{{warning}}</b>{{note}}</div></div>
   </div></div>
  </div>
 </div>
</template>
<script setup>
import {computed,ref,watch,nextTick} from 'vue'
import {rapidDocument} from '../utils/rapid-reader.mjs'
import {explanationReview} from '../utils/robot-program.mjs'
const props=defineProps({file:{type:Object,required:true},notes:{type:Array,default:()=>[]},onlyNotes:Boolean,highlight:Object})
const toolsOpen=ref(false)
const wrap=ref(false),showNotes=ref(true),viewport=ref(null)
function savedTheme(){try{return localStorage.getItem('robot-code-theme')!=='light'}catch{return true}}
const dark=ref(savedTheme())
function toggleTheme(){dark.value=!dark.value;try{localStorage.setItem('robot-code-theme',dark.value?'dark':'light')}catch{}}
const document=computed(()=>rapidDocument(props.file.text||''))
const notesAt=computed(()=>{const map=new Map();for(const note of props.notes)if(note.fileId===props.file.id){if(!map.has(note.line))map.set(note.line,[]);map.get(note.line).push(note.text)}return map})
const shownNotes=computed(()=>showNotes.value?notesAt.value:new Map())
const visible=computed(()=>document.value.lines.filter(line=>!props.onlyNotes||notesAt.value.has(line.number)))
async function reveal(range){await nextTick();const element=viewport.value?.querySelector('#robot-line-'+Number(range.startLine));if(element){const scroller=viewport.value,top=scroller.scrollTop+element.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientHeight/2;scroller.scrollTo({top:Math.max(0,top),behavior:'smooth'})}}
function captureScroll(){
 const scroller=viewport.value;if(!scroller)return null
 const position={top:scroller.scrollTop,left:scroller.scrollLeft},rows=scroller.querySelectorAll?.('.code-row')
 if(rows?.length){const edge=scroller.getBoundingClientRect().top;let low=0,high=rows.length-1;while(low<high){const middle=Math.floor((low+high)/2);if(rows[middle].getBoundingClientRect().bottom<=edge)low=middle+1;else high=middle}const row=rows[low];position.line=Number(row.id.replace('robot-line-',''));position.lineOffset=row.getBoundingClientRect().top-edge}
 return position
}
function restoreScroll(position){
 const scroller=viewport.value;if(!position||!scroller)return
 const row=position.line&&scroller.querySelector?.('#robot-line-'+position.line)
 scroller.scrollTop=row?scroller.scrollTop+row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-position.lineOffset:position.top
 scroller.scrollLeft=position.left
}
function focusScroller(){viewport.value?.focus({preventScroll:true})}
watch(()=>props.highlight,range=>{if(range)reveal(range)})
defineExpose({reveal,captureScroll,restoreScroll,focusScroller})
</script>
<style scoped>
.robot-code-reader{--code-size:13px;border:1px solid #dce4ef;border-radius:8px;overflow:hidden;background:#fff;color:#202d40}.code-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:#f3f6fb;border-bottom:1px solid #dce4ef}.code-toolbar>span,.code-toolbar>div{display:flex;align-items:center;gap:10px;font-size:12px}.code-toolbar small{color:#7b8798;font-size:10px}.code-toolbar .el-button{margin:0}.code-toolbar :deep(.el-checkbox__label){font-size:12px}.code-viewport{max-height:70dvh;overflow:auto;overscroll-behavior:contain;tab-size:4}.code-lines{width:max-content;min-width:100%;padding:8px 0}.code-row{display:grid;grid-template-columns:54px minmax(0,1fr);line-height:22px;scroll-margin:35px}.source-gutter{position:sticky;left:0;z-index:2;background:#f8fafc;display:flex;align-items:flex-start;border-right:1px solid #e4ebf2;padding-right:4px;box-sizing:border-box;user-select:none}.line-number{width:40px;flex:none;padding-right:6px;box-sizing:border-box;color:#397e9e;text-align:right;font:12px/22px Consolas,'Courier New',monospace}.code-content{padding-left:12px;min-width:0}.code-text{font:var(--code-size)/22px Consolas,'Cascadia Mono','Courier New',monospace;display:block;white-space:pre;min-height:22px;padding-right:24px}.rapid-keyword{color:#0000dc}.rapid-type{color:#267f99}.rapid-instruction{color:#745615}.rapid-comment{color:#008000}.rapid-string{color:#a31515}.rapid-number{color:#263548}.highlighted,.highlighted .source-gutter{background:#fff2ca}.line-annotation{max-width:min(74vw,680px);font:12px/1.8 system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 16px 7px 0;padding:7px 10px;border-left:2px solid #8abbad;background:#f1f8f5;color:#286b59}.line-annotation small{display:block;color:#718d83;font-size:10px}.review-warning{display:block;background:#fff2d9;color:#87571b;padding:6px;font-size:12px}.wrap .code-lines{width:100%}.wrap .code-text{white-space:pre-wrap;overflow-wrap:anywhere}.code-viewport:focus-visible{outline:2px solid #397b9e;outline-offset:-2px}@media(max-width:760px){.code-toolbar{padding:8px}.code-toolbar>div{flex-wrap:wrap;gap:6px}.code-toolbar .el-button{min-height:36px}.code-viewport{max-height:62dvh}.code-row{grid-template-columns:46px minmax(0,1fr)}.line-number{width:32px}.code-content{padding-left:9px}.line-annotation{max-width:calc(100vw - 135px)}}
.code-toolbar>span{flex:1 1 140px;min-width:0}.code-toolbar>span>.el-icon,.code-toolbar small{flex:none}.code-filename{min-width:0;font-weight:400;overflow-wrap:anywhere;line-height:1.5}.code-toolbar>div{flex:0 1 auto;min-width:0;max-width:100%;flex-wrap:wrap;justify-content:flex-end}
.theme-toggle{padding:6px 9px;border:1px solid #d7e0eb;border-radius:6px;background:#fff;color:#536e86;font-size:11px;cursor:pointer}
.robot-code-reader.dark{background:#1c2430;color:#d9e2ef;border-color:#334152;color-scheme:dark}.dark .code-toolbar{background:#222e3d;border-bottom-color:#344152;color:#c5d2e0}.dark .code-toolbar small{color:#93a6b9}.dark .source-gutter{background:#18212c;border-right-color:#303d4c}.dark .line-number{color:#8c9db1}.dark .rapid-keyword{color:#91b6ff}.dark .rapid-type{color:#77d3d2}.dark .rapid-instruction{color:#e3c58e}.dark .rapid-comment{color:#91c5a1}.dark .rapid-string{color:#e4b19b}.dark .rapid-number{color:#d2b1ee}.dark .line-annotation{background:#21362f;color:#c0decf;border-left-color:#6b9e87}.dark .line-annotation small{color:#93b9a6}.dark .highlighted,.dark .highlighted .source-gutter{background:#454027}.dark .theme-toggle,.dark :deep(.code-toolbar .el-button){background:#2a394b;color:#cedae8;border-color:#45566c}.dark :deep(.el-checkbox__label){color:#bdccdc}.dark :deep(.el-checkbox__inner){background:#29384a;border-color:#607388}.dark :deep(.el-checkbox__input.is-checked .el-checkbox__inner){background:#16877f;border-color:#16877f}
</style>

<style>
.reader-tools-toggle{display:none}.code-quick-actions:empty{display:none}@media(max-width:760px){body.workbench-mobile .robot-code-reader .reader-tools-toggle{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:8px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}body.workbench-mobile .robot-code-reader .code-toolbar>.code-reading-options{display:none}body.workbench-mobile .robot-code-reader .code-toolbar>.code-reading-options.is-open{display:flex;flex-basis:100%;justify-content:flex-start;padding-top:6px;border-top:1px solid #ffffff16}body.workbench-mobile .robot-code-reader .code-toolbar>span{flex:1 1 100px}body.workbench-mobile .robot-code-reader .code-toolbar>.code-quick-actions{flex:none}body.workbench-mobile .robot-code-reader .code-toolbar{gap:4px;padding:4px 8px}}
</style>

<template>
  <section class="abb-document-reader" :aria-label="document.title+'全文'">
    <p v-if="error" role="alert" class="abb-reader-status">{{error}} <button type="button" @click="load">重试</button></p>
    <p v-else-if="loading" role="status" class="abb-reader-status">正在打开完整手册…</p>
    <template v-else-if="document.type==='html'">
      <div class="abb-chapter-tools">
        <label>章节<select v-model="chapterUrl" aria-label="手册章节"><option v-for="(chapter,i) in chapters" :key="chapter.url" :value="chapter.url">{{i+1}} · {{chapter.title}}</option></select></label>
        <span>{{chapters.length}} 章</span>
        <a class="abb-new-window" :href="newWindowUrl" target="_blank" rel="noopener">新窗口打开 ↗</a>
      </div>
      <iframe :src="chapterUrl" sandbox="allow-same-origin" title="ABB IRC5 中文操作员手册正文"/>
    </template>
    <AbbPdfReader v-else-if="file" :file="file" :initial-page="document.initialPage||1"><template #actions><a class="abb-new-window" :href="newWindowUrl" target="_blank" rel="noopener">新窗口打开 ↗</a></template></AbbPdfReader>
  </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue'
import AbbPdfReader from '../AbbPdfReader.vue'
const props=defineProps({document:{type:Object,required:true}})
defineEmits(['back'])
const loading=ref(true),error=ref(''),file=ref(null),chapters=ref([]),chapterUrl=ref('')
let request,generation=0
const newWindowUrl=computed(()=>props.document.type==='pdf'?props.document.url:(chapterUrl.value||chapters.value[0]?.url||'/documents/abb/irc5-flexpendant/doc1.html'))
async function load(){const id=++generation;request?.abort();request=new AbortController();loading.value=true;error.value='';file.value=null;try{const response=await fetch(props.document.type==='html'?props.document.chapters:props.document.url,{signal:request.signal});if(!response.ok)throw Error('读取手册失败');if(props.document.type==='html'){const value=await response.json();if(id!==generation)return;chapters.value=value;chapterUrl.value=value[0]?.url||''}else{const blob=await response.blob();if(id!==generation)return;file.value=blob}}catch(e){if(e.name!=='AbortError'&&id===generation)error.value='完整手册暂时未能打开，请重试。'}finally{if(id===generation)loading.value=false}}
watch(()=>props.document,load,{immediate:true})
onBeforeUnmount(()=>{++generation;request?.abort()})
</script>
<style scoped>
.abb-document-reader{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;padding:0;gap:0;background:#eef3f7}.abb-reader-bar{display:flex;align-items:center;gap:8px;min-height:38px;padding:5px 10px;background:#fff;border-bottom:1px solid #dbe6ed;flex:none}.abb-reader-bar button,.abb-reader-bar a{border:1px solid #d3e1e9;border-radius:6px;background:#fff;color:#315d74;min-height:28px;padding:0 9px;font:inherit;font-size:12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.abb-reader-bar button:hover,.abb-reader-bar a:hover{background:#f0f7fa}.abb-reader-bar .abb-back{border-color:#c7dde6;background:#f4fafc}.abb-reader-id{margin-left:3px;color:#8196a4;font-size:11px;font-variant-numeric:tabular-nums;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.abb-reader-bar .abb-new-window{margin-left:auto;color:#147a91}.abb-reader-status{margin:0;padding:13px 14px;color:#6a8394;font-size:12px}.abb-reader-status button{min-height:26px;border:1px solid #d3e1e9;border-radius:5px;background:#fff;color:#315d74;font:inherit;font-size:12px;margin-left:5px;cursor:pointer}.abb-chapter-tools{display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fff;border-bottom:1px solid #dbe6ed;flex:none;font-size:12px;color:#607c8d}.abb-chapter-tools label{display:flex;align-items:center;gap:6px;flex:1;min-width:0}.abb-chapter-tools select{min-width:0;max-width:100%;padding:5px 7px;border:1px solid #d1e0e8;border-radius:6px;color:#43697d;background:#f8fbfd;font:inherit;font-size:12px}.abb-chapter-tools span{white-space:nowrap;color:#8a9daa}.abb-document-reader iframe{border:0;background:#fff;border-radius:0;flex:1;min-height:250px;width:100%}.abb-document-reader :deep(.abb-pdf-reader){flex:1;min-height:0;height:100%;border-radius:0}@media(max-width:700px){.abb-reader-bar{flex-wrap:wrap;padding:6px 8px}.abb-reader-id{order:3;flex-basis:100%;margin:0}.abb-chapter-tools{padding:6px 8px}.abb-chapter-tools select{font-size:11px}}
.abb-new-window{white-space:nowrap;font-size:12px;color:#147a91;text-decoration:none;min-height:28px;display:inline-flex;align-items:center;padding:0 8px;border:1px solid #d3e1e9;border-radius:6px;background:#fff}</style>

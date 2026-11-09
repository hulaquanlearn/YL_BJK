<template>
  <div class="reference-image">
    <button v-if="currentSource && zoomable" type="button" class="reference-image-zoom" :aria-label="`放大${alt}`" @click.stop="openPreview"><img :key="currentSource" :src="currentSource" :alt="alt" loading="lazy" @error="failed" /></button>
    <img v-else-if="currentSource" :key="currentSource" :src="currentSource" :alt="alt" loading="lazy" @error="failed" />
    <slot v-if="currentSource" :source="currentSource" />
    <div v-else class="reference-image-empty"><el-icon><Picture /></el-icon><span>{{ sources.length ? '参考图暂不可用' : '暂无参考图' }}</span></div>
    <el-image-viewer v-if="previewVisible && currentSource" :url-list="[currentSource]" :infinite="false" teleported @close="previewVisible=false" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import { referenceImageForModel } from '../utils/category-catalog.mjs'
const props = defineProps({ src:{type:String,default:''}, fallbackSrc:{type:String,default:''}, modelUrl:{type:String,default:''}, alt:{type:String,default:'类别参考图'}, zoomable:Boolean })
const failedSources = ref([])
const previewVisible = ref(false)
const sources = computed(() => [...new Set([props.src, props.fallbackSrc, referenceImageForModel(props.modelUrl)].filter(Boolean))])
const currentSource = computed(() => sources.value.find(source=>!failedSources.value.includes(source)) || '')
function failed(event) { const source=event.target.getAttribute('src');if(source&&!failedSources.value.includes(source))failedSources.value.push(source) }
function openPreview() { if(props.zoomable && currentSource.value)previewVisible.value=true }
watch(() => [props.src,props.fallbackSrc,props.modelUrl], () => { failedSources.value = [] })
watch([currentSource,()=>props.zoomable],()=>{previewVisible.value=false})
</script>

<style scoped>
.reference-image{position:relative;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;display:grid;place-items:center;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
.reference-image img{position:absolute;inset:0;display:block;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;max-height:100%;object-fit:contain;object-position:center;box-sizing:border-box}
.reference-image-zoom{position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:zoom-in}
.reference-image-zoom:focus-visible{outline:2px solid #336581;outline-offset:-3px;border-radius:4px}
.reference-image-empty{display:grid;place-items:center;gap:8px;padding:14px;color:#8a96a5;font-size:12px;text-align:center}
.reference-image-empty .el-icon{font-size:30px}
</style>

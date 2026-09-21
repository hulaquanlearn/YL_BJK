<template>
  <section v-if="model" class="part-model-detail">
    <div class="model-heading"><strong>备件模型</strong><span>{{ model.quality }}</span>
      <el-button text @click="expanded=!expanded">{{ expanded ? '收起模型' : '查看3D模型' }}</el-button></div>
    <template v-if="expanded">
      <ModelPreview :model-url="model.detailUrl" :initial-angle="0.55" height="300px" />
      <p>{{ model.note }} <a :href="model.sourceUrl" target="_blank" rel="noopener noreferrer">厂家尺寸图</a></p>
    </template>
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { resolveEvidenceModel } from '../utils/evidence-models.mjs'
const ModelPreview=defineAsyncComponent(()=>import('./ModelPreview.vue'))
const props=defineProps({part:Object})
const model=computed(()=>resolveEvidenceModel(props.part))
const expanded=ref(false)
watch(()=>props.part,()=>{expanded.value=false})
</script>
<style scoped>
.part-model-detail{margin:16px 0;padding:14px;border:1px solid #e3e8ef;border-radius:12px}.model-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.model-heading span{color:#64748b;font-size:12px}.model-heading .el-button{margin-left:auto}p{font-size:12px;color:#64748b;line-height:1.7}a{color:#087f8c}
</style>

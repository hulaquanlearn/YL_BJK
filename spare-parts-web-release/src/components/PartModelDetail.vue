<template>
<section class="part-model-detail">
  <p class="bound-model"><strong>绑定模型：</strong>{{ part?.categoryModelName || '未绑定' }}<small v-if="part?.categoryModelId">（ID {{ part.categoryModelId }}）</small></p>
  <div class="visual-grid">
    <section><h3>单件3D模型 <small>{{part?.modelQuality || '外观示意'}}</small></h3>
      <ModelPreview v-if="modelUrl" :key="modelUrl" :model-url="modelUrl" :initial-angle="0.55" height="300px" />
      <div v-else class="visual-empty">{{ part?.categoryModelName ? '绑定模型待生成' : '此备件尚未绑定模型' }}</div>
      
      <p v-if="modelUrl">{{ part?.modelQuality || '外观示意' }}；未核实厂家尺寸的模型不用于安装校核。</p>
    </section>
    <section><h3>实物照片</h3><el-image v-if="photoUrl" :src="photoUrl" :preview-src-list="[photoUrl]" fit="contain" preview-teleported class="part-photo"><template #error><div class="visual-empty">实物照片暂不可用</div></template></el-image><div v-else class="visual-empty">尚未上传实物照片</div><p v-if="photoUrl">点击照片放大查看</p></section>
  </div>
</section>
</template>
<script setup>
import {computed,defineAsyncComponent} from 'vue'
import {warehouseModelUrl} from '../utils/evidence-models.mjs'
const ModelPreview=defineAsyncComponent(()=>import('./ModelPreview.vue'))
const props=defineProps({part:Object})
const modelUrl=computed(()=>warehouseModelUrl(props.part))
const photoUrl=computed(()=>props.part?.partImageUrl || (props.part?.imageSource==='part'?props.part.imageUrl:'') || '')
</script>
<style scoped>
.part-model-detail{margin:16px 0}.visual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.visual-grid section{min-width:0;padding:16px;border:1px solid #e3e8ef;border-radius:12px;background:#fff}h3{font-size:15px;margin:0 0 12px;display:flex;align-items:center;justify-content:space-between}small{font-weight:400;color:#64748b;font-size:12px}.part-photo{width:100%;height:300px;background:#f7f9fc}.visual-empty{height:300px;display:grid;place-items:center;color:#8290a3;background:#f7f9fc;border-radius:8px}p{font-size:12px;color:#64748b;line-height:1.7}a{color:#087f8c}@media(max-width:600px){.visual-grid{grid-template-columns:1fr}}
</style>

<template>
  <div ref="host" class="model-thumbnail" :aria-busy="loading">
    <img v-if="image" :src="image" :alt="alt" />
    <span v-else role="status">{{ error ? '缩略图加载失败，点击查看模型' : '正在加载模型…' }}</span>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { modelThumbnail } from '../utils/model-thumbnail.mjs'
const props = defineProps({ modelUrl: String, frontRotationY: Number, alt: String })
const host = ref(null), image = ref(''), loading = ref(false), error = ref(false)
let observer, visible = false, generation = 0
async function load() {
  const current = ++generation
  image.value = ''; error.value = false
  if (!visible || !props.modelUrl) return
  loading.value = true
  try {
    const result = await modelThumbnail(props.modelUrl, props.frontRotationY)
    if (current === generation) image.value = result
  } catch { if (current === generation) error.value = true }
  finally { if (current === generation) loading.value = false }
}
watch(() => [props.modelUrl, props.frontRotationY], load)
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      visible = true; observer.disconnect(); load()
    }
  }, { rootMargin: '100px' })
  observer.observe(host.value)
})
onBeforeUnmount(() => { generation++; observer?.disconnect() })
</script>
<style scoped>
.model-thumbnail{width:100%;height:100%;display:grid;place-items:center;color:#738196;font-size:12px;text-align:center}.model-thumbnail img{width:100%;height:100%;object-fit:contain}.model-thumbnail span{padding:12px}
</style>

<template><a v-if="url" :href="url" target="_blank" rel="noopener"><img :src="url" alt="填报现场照片" loading="lazy"></a><span v-else>{{ failed ? '照片加载失败' : '加载照片…' }}</span></template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { work } from '../api/work'
const props = defineProps({ id: [Number, String] })
const url = ref(''), failed = ref(false)
let disposed = false
onMounted(async () => { try { const b = await work.get(`/photos/${props.id}`, { responseType: 'blob' }); if (!disposed) url.value = URL.createObjectURL(b) } catch { failed.value = true } })
onBeforeUnmount(() => { disposed = true; if (url.value) URL.revokeObjectURL(url.value) })
</script>
<style scoped>img{width:100%;height:130px;object-fit:contain;border-radius:8px;background:#f5f6f8}a{display:block;min-width:0}</style>

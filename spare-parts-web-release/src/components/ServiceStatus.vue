<template>
  <span class="service-status" :class="`is-${state}`" role="status" aria-live="polite" :title="`服务连接状态：${label}`"><i class="service-status-dot" aria-hidden="true"></i>{{ label }}</span>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ status: { type: String, default: 'checking' } })
const labels = { checking: '正在连接', online: '服务正常', offline: '服务异常', preview: '本地预览' }
const state = computed(() => Object.hasOwn(labels, props.status) ? props.status : 'checking')
const label = computed(() => labels[state.value])
</script>
<style scoped>
.service-status{display:inline-flex;align-items:center;gap:6px;flex:none;white-space:nowrap;font-size:12px;font-weight:500;line-height:20px;color:#6a788b}.service-status-dot{width:7px;height:7px;border-radius:50%;background:#94a3b8;flex:none}.is-online .service-status-dot{background:#1aa374}.is-offline{color:#b44249}.is-offline .service-status-dot{background:#d74d59}.is-preview .service-status-dot{background:#4d91c1}@media(max-width:600px){.service-status{font-size:11px;gap:5px}}
</style>

<template>
  <p v-if="!appSurface">{{ description }}</p>
  <div v-else class="app-part-description">
    <p>{{ summary }}</p>
    <details v-if="summary!==description" :key="description">
      <summary>查看详细说明</summary>
      <p>{{ description }}</p>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { isAppSurface } from '../../app/surface.mjs'

const props = defineProps({ description: { type: String, default: '' } })
const appSurface = isAppSurface()
const summary = computed(() => {
  const text = props.description
  const firstSentence = text.split(/(?<=[。！？])/)[0]
  return firstSentence.length > 42 ? firstSentence.slice(0, 42) + '…' : firstSentence
})
</script>

<style scoped>
.app-part-description p{margin:0;overflow-wrap:anywhere}
.app-part-description summary{padding:6px 0;color:#0c6e76;font-size:13px;cursor:pointer}
.app-part-description details[open] p{max-height:24dvh;overflow:auto}
</style>

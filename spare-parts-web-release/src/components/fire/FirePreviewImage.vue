<template>
  <el-image :src="src" :preview-src-list="previewList" :initial-index="initialIndex" preview-teleported>
    <template v-if="$slots.error" #error><slot name="error" /></template>
    <template v-if="fire.executionMode" #toolbar><span class="fire-photo-minimal-toolbar" hidden></span></template>
  </el-image>
</template>

<script setup>
import { computed, inject } from 'vue'

const props = defineProps({ src: String, previewSrcList: { type: Array, default: () => [] } })
const fire = inject('fireInspection')
const previewList = computed(() => fire.executionMode && props.src ? [props.src] : props.previewSrcList)
const initialIndex = computed(() => Math.max(0, previewList.value.indexOf(props.src)))
</script>

<style>
.el-image-viewer__actions:has(.fire-photo-minimal-toolbar){display:none}
</style>

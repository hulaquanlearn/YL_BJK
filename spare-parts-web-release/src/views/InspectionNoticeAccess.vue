<template>
  <InspectionNotices v-if="canEdit" />
  <InspectionNoticeViewer v-else />
</template>

<script setup>
import { computed } from 'vue'
import { getUser } from '../auth'
import InspectionNotices from './InspectionNotices.vue'
import InspectionNoticeViewer from './InspectionNoticeViewer.vue'

const canEdit = computed(() => ['admin', 'raw_grain'].includes(getUser()?.role))
</script>

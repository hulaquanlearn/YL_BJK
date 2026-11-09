<template>
  <el-select v-model="f.query.sectionName" clearable placeholder="全部工段" aria-label="消防工段" :disabled="f.recognitionBusy" @change="f.sectionChanged">
    <el-option v-for="section in f.sections" :key="section" :label="section" :value="section" />
  </el-select>
</template>
<script setup>
import { inject } from 'vue'
const f=inject('fireInspection')
</script>

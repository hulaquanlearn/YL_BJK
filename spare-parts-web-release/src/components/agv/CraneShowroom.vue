<template>
 <CraneModelViewer :build-model="buildCraneModel" :apply-pose="applyCranePose" :systems="craneSystems" />
 <el-dialog v-model="opened" title="智能行车技术资料" width="min(1180px,96vw)" top="4vh" append-to-body destroy-on-close><CraneTechnicalGuide /></el-dialog>
</template>
<script setup>
import {computed,defineAsyncComponent} from 'vue'
import CraneModelViewer from './CraneModelViewer.vue'
import {buildCraneModel,applyCranePose} from '../../utils/crane-model.mjs'
import {craneSystems} from '../../utils/crane-parts.mjs'
const CraneTechnicalGuide=defineAsyncComponent(()=>import('./CraneTechnicalGuide.vue'))
const props=defineProps({guide:{type:Boolean,default:false}}),emit=defineEmits(['update:guide'])
const opened=computed({get:()=>props.guide,set:value=>emit('update:guide',value)})
</script>

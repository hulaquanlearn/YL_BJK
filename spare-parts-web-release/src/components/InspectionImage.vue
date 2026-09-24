<template><img v-if="url" :src="url" :alt="alt" loading="lazy"><span v-else class="image-loading">{{failed?'图片暂时无法读取':'正在载入图片…'}}</span></template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue'
import {inspection} from '../api/inspection'
const props=defineProps({noticeId:{type:[String,Number],required:true},sourceId:{type:[String,Number],required:true},rect:{type:Object,default:null},alt:{type:String,default:'检查截图'}})
const url=ref(''),failed=ref(false);let serial=0
function clear(){if(url.value)URL.revokeObjectURL(url.value);url.value=''}
watch(()=>[props.noticeId,props.sourceId,JSON.stringify(props.rect)],async()=>{const current=++serial;clear();failed.value=false;try{const path=`/reports/${props.noticeId}/sources/${props.sourceId}/${props.rect?'crop':'image'}`;const response=await inspection.get(path,{params:props.rect||undefined,responseType:'blob'});if(current!==serial)return;url.value=URL.createObjectURL(response.data)}catch{if(current===serial)failed.value=true}},{immediate:true})
onBeforeUnmount(()=>{serial++;clear()})
</script>

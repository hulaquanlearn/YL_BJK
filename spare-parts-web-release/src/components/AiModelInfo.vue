<template><p class="ai-model-info" aria-label="当前AI模型">{{label || 'DeepSeek'}}<span v-if="model"> · {{model}}</span><small v-if="error" role="status">{{error}}</small></p></template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue'
import {getAiChannels} from '../api'
const props=defineProps({feature:{type:String,required:true}})
const label=ref(''),model=ref(''),error=ref('')
let request=0,disposed=false
async function load(){const id=++request;label.value='';model.value='';error.value='';try{const data=(await getAiChannels(props.feature)).data;if(disposed||id!==request)return;const choice=data.choices.find(c=>c.id==='deepseek');label.value=choice?.label||'DeepSeek';model.value=choice?.model||''}catch{if(!disposed&&id===request)error.value='模型信息暂不可用'}}
watch(()=>props.feature,load,{immediate:true})
window.addEventListener('auth-changed',load)
onBeforeUnmount(()=>{disposed=true;request++;window.removeEventListener('auth-changed',load)})
</script>
<style scoped>.ai-model-info{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0;padding:8px 0;color:#738294;font-size:12px;line-height:1.6}.ai-model-info small{margin-left:8px;color:#936d37}</style>

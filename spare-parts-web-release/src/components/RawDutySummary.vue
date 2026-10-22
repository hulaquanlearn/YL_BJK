<template>
 <section class="weekly-summary panel">
  <header><h3>本周总结</h3><div class="summary-tools"><el-button v-if="editable && modelValue.trim()" :disabled="busy" @click="editing=!editing">{{editing?'完成修改':'修改'}}</el-button><el-button v-if="editable" type="primary" :disabled="busy || quota && !quota.unlimited && quota.remaining<=0" :loading="generating" @click="$emit('generate')">{{modelValue.trim()?'AI 重新生成':'AI 生成周总结'}}</el-button></div></header>
  <p v-if="editable && quota" class="summary-quota">{{quota.unlimited?'系统管理员不限次数':'今日剩余 '+quota.remaining+' / '+quota.limit+' 次 · 每日最多3次，北京时间零点重置'}}</p>
  <p class="summary-help">根据已保存的实际填报生成，核对后随周材料保存、提交。</p>
  <el-alert v-if="error" :title="error" type="warning" :closable="false" />
  <el-input v-if="editable && editing" :model-value="modelValue" type="textarea" :autosize="{minRows:8,maxRows:20}" maxlength="4000" :disabled="busy" placeholder="核对并修改周总结" @update:model-value="$emit('update:modelValue',$event)" />
  <div v-else-if="modelValue.trim()" class="summary-content">{{modelValue}}</div>
  <div v-else class="summary-empty">{{editable?'点击“AI 生成周总结”，根据本周实际填报整理工作结果和待跟进事项。':'尚未生成周总结'}}</div>
 </section>
</template>
<script setup>
import {ref,watch} from 'vue'
const props=defineProps({modelValue:{type:String,default:''},editable:Boolean,busy:Boolean,generating:Boolean,error:String,quota:Object})
defineEmits(['generate','update:modelValue'])
const editing=ref(false)
watch(()=>props.generating,(now,before)=>{if(before&&!now)editing.value=false})
</script>
<style scoped>
.weekly-summary{min-width:0;scroll-margin-top:16px}.weekly-summary header{display:flex;align-items:center;justify-content:space-between;gap:16px}.weekly-summary h3{font-size:16px;margin:0;color:#34465e}.summary-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.summary-tools .el-button{margin:0;min-height:40px}.summary-tools .el-button--primary{color:#fff!important;background:#6263a8!important;border-color:#6263a8!important}.summary-tools .el-button--primary:hover{background:#55569a!important}.summary-help{font-size:12px;color:#7b8799;line-height:1.7;margin:12px 0}.summary-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.95;font-size:14px;color:#34465e;padding:16px 18px;background:#f7f9fc;border:1px solid #e5eaf1;border-radius:10px}.summary-empty{padding:20px 16px;color:#8290a4;line-height:1.8;font-size:13px;border:1px dashed #dce3ed;border-radius:8px}
@media(max-width:760px){.weekly-summary header{flex-wrap:wrap;gap:10px}.summary-tools{width:100%;justify-content:flex-end}.summary-tools .el-button{min-height:44px}.summary-content{padding:12px;font-size:14px;line-height:1.9}}
</style>
<style scoped>.summary-quota{font-size:12px;line-height:1.7;margin:10px 0;color:#596b81}</style>

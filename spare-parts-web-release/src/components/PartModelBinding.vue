<template>
  <div class="binding-picker">
    <el-select :model-value="modelValue" filterable clearable :disabled="disabled" :loading="loading" placeholder="选择绑定模型；留空表示未绑定" @update:model-value="$emit('update:modelValue',$event || null)">
      <el-option v-for="model in available" :key="model.id" :value="Number(model.id)" :label="`${model.id} · ${model.name}`">
        <span>{{ model.id }} · {{ model.name }}</span><small v-if="!model.modelUrl">模型待生成</small>
      </el-option>
    </el-select>
    <el-button v-if="selected?.modelUrl" @click="preview=true">预览</el-button>
    <span v-else-if="selected" class="pending">模型待生成</span>
    <el-dialog v-model="preview" :title="selected?.name || '模型预览'" width="min(720px,94vw)" append-to-body destroy-on-close>
      <ModelPreview v-if="preview" :model-url="selected?.modelUrl" :front-rotation-y="selected?.frontRotationY || 0" />
      <p>{{ selected?.description || '外观示意模型' }}</p>
    </el-dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, defineAsyncComponent } from 'vue'
import { getPartCategoryModels } from '../api'
const ModelPreview=defineAsyncComponent(()=>import('./ModelPreview.vue'))
const props=defineProps({modelValue:[Number,String],workshopCode:String,disabled:Boolean})
defineEmits(['update:modelValue'])
const models=ref([]), loading=ref(false), preview=ref(false)
const available=computed(()=>models.value.filter(model=>!model.workshopCode || !props.workshopCode || model.workshopCode===props.workshopCode).sort((a,b)=>Number(a.id)-Number(b.id)))
const selected=computed(()=>models.value.find(model=>Number(model.id)===Number(props.modelValue)))
onMounted(async()=>{loading.value=true;try{const result=await getPartCategoryModels();models.value=result.data||[]}finally{loading.value=false}})
</script>
<style scoped>
.binding-picker{display:flex;align-items:center;gap:8px;width:100%;min-width:0}.el-select{flex:1;min-width:0}.pending,small{font-size:12px;color:#64748b}small{float:right;margin-left:12px}p{color:#64748b;line-height:1.6}
</style>

<template>
  <div class="binding-picker">
    <el-select :model-value="modelValue" filterable clearable :disabled="disabled" :loading="loading" placeholder="选择绑定模型；留空表示未绑定" @update:model-value="$emit('update:modelValue',$event || null)">
      <el-option v-for="model in available" :key="model.id" :value="Number(model.id)" :label="`${model.id} · ${model.name} · ${modelDisplayStatus(model).label}`">
        <span>{{ model.id }} · {{ model.name }}</span><small :class="modelDisplayStatus(model).key">{{ modelDisplayStatus(model).label }}</small>
      </el-option>
    </el-select>
    <el-button v-if="selected?.modelUrl" @click="preview=true">{{ selectedStatus.key==='pending' ? '核对旧模型' : '预览' }}</el-button>
    <p v-if="selected" class="binding-outcome" role="status"><strong :class="selectedStatus.key">{{ selectedStatus.label }}</strong>{{ selectedStatus.description }}</p>
    <p v-if="loadError" class="binding-outcome" role="alert">{{ loadError }}<el-button link @click="loadModels">重试</el-button></p>
    <el-dialog v-model="preview" :title="selected?.name || '模型预览'" width="min(720px,94vw)" append-to-body destroy-on-close>
      <p v-if="selectedStatus.key==='pending'" class="pending">当前仅供核对旧外形；预览不代表已通过核对。</p>
      <ModelPreview v-if="preview" :model-url="selected?.modelUrl" :front-rotation-y="Number(selected?.frontRotationY) || 0" :initial-angle="0.55" :allow-unreviewed="selectedStatus.key==='pending' || modelReviewConfirmed(selected)" object-only height="400px" />
      <p>拖动可查看底面，滚轮或双指缩放。</p>
      <p>{{ selected?.description || '外观示意模型' }}</p>
    </el-dialog>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, defineAsyncComponent } from 'vue'
import { getPartCategoryModels } from '../api'
import { modelDisplayStatus } from '../utils/model-display-status.mjs'
import { modelReviewConfirmed } from '../utils/model-review.mjs'
const ModelPreview=defineAsyncComponent(()=>import('./ModelPreview.vue'))
const props=defineProps({modelValue:[Number,String],workshopCode:String,disabled:Boolean})
defineEmits(['update:modelValue'])
const models=ref([]), loading=ref(false), preview=ref(false),loadError=ref('')
let loadToken=0
const available=computed(()=>models.value.filter(model=>!model.workshopCode || !props.workshopCode || model.workshopCode===props.workshopCode).sort((a,b)=>Number(a.id)-Number(b.id)))
const selected=computed(()=>models.value.find(model=>Number(model.id)===Number(props.modelValue)))
const selectedStatus=computed(()=>modelDisplayStatus(selected.value))
async function loadModels(){const token=++loadToken;loading.value=true;loadError.value='';try{const result=await getPartCategoryModels();if(token===loadToken)models.value=result.data||[]}catch{if(token===loadToken){models.value=[];loadError.value='模型列表读取失败'}}finally{if(token===loadToken)loading.value=false}}
onMounted(loadModels)
onBeforeUnmount(()=>loadToken++)
</script>
<style scoped>
.binding-picker{display:flex;align-items:center;flex-wrap:wrap;gap:8px;width:100%;min-width:0}.el-select{flex:1;min-width:0}.pending,small{font-size:12px;color:#986516}small{float:right;margin-left:12px}.ready{color:#24745c}.missing{color:#64748b}p{color:#64748b;line-height:1.6}.binding-outcome{flex-basis:100%;margin:0;font-size:12px}.binding-outcome strong{margin-right:8px}
</style>

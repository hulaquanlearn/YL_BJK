<template>
  <div class="warehouse-area-picker">
    <el-select :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" filterable :loading="loading" :disabled="!workshopCode || loading" placeholder="请选择存放货区" no-data-text="暂无货区，请点击新增货区">
      <el-option v-for="area in options" :key="area.name" :label="area.name" :value="area.name" />
    </el-select>
    <el-button v-write class="add-area-button" :disabled="!workshopCode" @click="open">+ 新增货区</el-button>
  </div>
  <el-dialog v-model="visible" title="新增货区" width="min(480px, 94vw)" class="ledger-entry-dialog warehouse-area-dialog" append-to-body>
    <p class="area-workshop">所属车间：{{ workshopName }}</p>
    <el-form label-position="top" @submit.prevent="save"><el-form-item label="货区名称" required><el-input v-model="name" maxlength="100" show-word-limit placeholder="例如：五粮工段备件库" @keyup.enter="save" /></el-form-item></el-form>
    <p class="area-help">创建后自动选中此货区，同一车间的已有名称会直接复用。</p>
    <template #footer><el-button :disabled="saving" @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!name.trim()" @click="save">创建并选中</el-button></template>
  </el-dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getWarehouseAreas, createWarehouseArea } from '../api'
const props = defineProps({ modelValue:String, workshopCode:String, workshopName:String })
const emit = defineEmits(['update:modelValue'])
const options=ref([]), loading=ref(false), visible=ref(false), saving=ref(false), name=ref('')
let request=0
watch(() => props.workshopCode, async code => {
  const token=++request
  options.value=[]; visible.value=false
  if (!code) { loading.value=false; return }
  loading.value=true
  try {
    const result=await getWarehouseAreas(code)
    if(token===request) options.value=result.data || []
  } catch { /* API interceptor reports the error. */ }
  finally { if(token===request) loading.value=false }
}, { immediate:true })
function open(){ name.value=''; visible.value=true }
async function save(){
  if(saving.value || !name.value.trim()) return
  const workshopCode=props.workshopCode
  saving.value=true
  try {
    const result=await createWarehouseArea({workshopCode,name:name.value.trim()})
    if(workshopCode!==props.workshopCode) return
    const area=result.data
    if(!options.value.some(item=>item.name===area.name)) options.value.push(area)
    emit('update:modelValue',area.name)
    visible.value=false
    ElMessage.success('货区已选中')
  } catch { /* API interceptor reports the error. */ }
  finally { saving.value=false }
}
</script>
<style scoped>
.warehouse-area-picker{display:flex;align-items:center;gap:8px;width:100%;min-width:0}.warehouse-area-picker .el-select{flex:1;min-width:0}.add-area-button{height:46px;padding:0 10px;color:#bd2035;border-color:#e6b7c0;font-size:14px}.area-workshop{margin:0 0 20px;color:#53657a}.area-help{margin:0;color:#78879a;font-size:14px;line-height:1.7}
</style>

<template>
  <section class="part-location-entry span-2">
    <h3>存放位置</h3>
    <div class="location-entry-grid">
      <el-form-item v-if="usesArea" label="位置类型"><el-select :model-value="modelValue.locationType" @update:model-value="set('locationType',$event)"><el-option label="标准货架库位" value="shelf" /><el-option label="其他存放位置" value="free_text" /></el-select></el-form-item>
      <el-form-item v-if="usesArea" label="货区 / 仓库" required><WarehouseAreaPicker :model-value="area" @update:model-value="$emit('update:area',$event)" :workshop-code="workshopCode" :workshop-name="workshopName" /></el-form-item>
      <template v-if="usesArea && modelValue.locationType==='shelf'">
        <el-form-item label="货架" required><div class="choice-with-add"><el-select :model-value="modelValue.shelf" :disabled="!area || loading" :loading="loading" filterable placeholder="请选择货架" @update:model-value="chooseShelf"><el-option v-for="shelf in shelves" :key="shelf" :label="`${shelf}号货架`" :value="shelf" /></el-select><el-button v-write :disabled="!area || loading" @click="openAdd('shelf')">+ 新增</el-button></div></el-form-item>
        <el-form-item label="层数" required><div class="choice-with-add"><el-select :model-value="modelValue.layer" :disabled="!modelValue.shelf || loading" placeholder="请选择层数" @update:model-value="set('layer',$event)"><el-option v-for="layer in layers" :key="layer" :label="`第${layer}层`" :value="layer" /></el-select><el-button v-write :disabled="!modelValue.shelf || loading" @click="openAdd('layer')">+ 新增</el-button></div></el-form-item>
        <el-form-item label="方位"><el-select :model-value="modelValue.position" clearable placeholder="选填" @update:model-value="set('position',$event)"><el-option label="东侧（1）" :value="1" /><el-option label="西侧（2）" :value="2" /></el-select></el-form-item>
        <el-form-item label="货位"><el-input-number :model-value="modelValue.location" :min="1" :max="99" :controls="false" placeholder="选填，1至99" @update:model-value="set('location',$event)" /></el-form-item>
        <div class="location-code-hint span-2"><span>六位库位码</span><strong>{{ generatedCode || '待填写方位和货位后自动生成' }}</strong><small>货架 01–99 · 方位 1/2 · 层数 1–4 · 货位 01–99</small></div>
      </template>
      <el-form-item v-else label="具体位置" :required="usesArea" class="span-2"><el-input :model-value="modelValue.locationNote" @update:model-value="set('locationNote',$event)" maxlength="200" placeholder="例如：备件库东侧A柜、二楼地面" /></el-form-item>
    </div>
    <el-alert v-if="loadFailed" title="货架信息加载失败，请重试" type="error" :closable="false"><el-button link @click="loadOptions">重新加载</el-button></el-alert>
    <el-dialog v-model="addVisible" :title="addType==='shelf'?'新增货架':'新增层数'" class="ledger-entry-dialog" width="min(460px,94vw)" append-to-body>
      <p>{{ area }}{{ addType==='layer'?` · ${modelValue.shelf}号货架`:'' }}</p>
      <el-form-item :label="addType==='shelf'?'货架号':'层数'" required><el-input-number v-model="addNumber" :min="1" :max="addType==='shelf'?99:4" :precision="0" /></el-form-item>
      <p class="add-location-help">加入本次录入，保存备件后可在同一货区继续选择。{{ addType==='layer'?'当前货架模型支持1至4层。':'' }}</p>
      <template #footer><el-button @click="addVisible=false">取消</el-button><el-button type="primary" @click="confirmAdd">加入并选中</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import WarehouseAreaPicker from './WarehouseAreaPicker.vue'
import { getFilters } from '../api'
import { emptyPartLocation, locationEntryPayload } from '../utils/part-location-entry.mjs'
const props=defineProps({modelValue:Object,area:String,workshopCode:String,workshopName:String})
const emit=defineEmits(['update:modelValue','update:area'])
const usesArea=computed(()=>props.workshopCode!=='qu_making')
const shelfMap=ref({}), layerMap=ref({}), additions=ref({}), loading=ref(false),loadFailed=ref(false)
const addVisible=ref(false),addType=ref('shelf'),addNumber=ref(1)
let request=0
function values(items,max){return [...new Set((items||[]).map(item=>Number(String(item).replace(/[^0-9]/g,''))).filter(n=>Number.isInteger(n)&&n>=1&&n<=max))].sort((a,b)=>a-b)}
const shelves=computed(()=>values([...(shelfMap.value[props.area]||[]),...Object.keys(additions.value[props.area]||{})],99))
const layers=computed(()=>values([...(layerMap.value[props.area]?.[`${props.modelValue.shelf}号`]||[]),...(additions.value[props.area]?.[props.modelValue.shelf]||[])],4))
const generatedCode=computed(()=>{try{return locationEntryPayload(props.modelValue,props.workshopCode).locationCode}catch{return null}})
function set(field,value){emit('update:modelValue',{...props.modelValue,[field]:value??null})}
function chooseShelf(shelf){emit('update:modelValue',{...props.modelValue,shelf,layer:null,position:null,location:null})}
async function loadOptions(){
  const code=props.workshopCode, token=++request
  shelfMap.value={};layerMap.value={};loadFailed.value=false
  if(!code || code==='qu_making'){loading.value=false;return}
  loading.value=true
  try{const result=await getFilters({workshopCode:code});if(token===request){shelfMap.value=result.data.shelfMap||{};layerMap.value=result.data.layerMap||{}}}
  catch{if(token===request)loadFailed.value=true}
  finally{if(token===request)loading.value=false}
}
watch(()=>props.workshopCode,()=>{additions.value={};addVisible.value=false;emit('update:modelValue',emptyPartLocation());loadOptions()},{immediate:true})
watch(()=>props.area,()=>{addVisible.value=false;emit('update:modelValue',{...props.modelValue,shelf:null,layer:null,position:null,location:null})})
watch(()=>props.modelValue.locationType,()=>{emit('update:modelValue',{...emptyPartLocation(),locationType:props.modelValue.locationType})})
function openAdd(type){addType.value=type;addNumber.value=1;addVisible.value=true}
function confirmAdd(){
  const n=Number(addNumber.value), max=addType.value==='shelf'?99:4
  if(!Number.isInteger(n)||n<1||n>max)return ElMessage.warning(`请输入1至${max}的整数`)
  const area=props.area
  additions.value[area] ||= {}
  if(addType.value==='shelf'){additions.value[area][n] ||= [];chooseShelf(n)}
  else{additions.value[area][props.modelValue.shelf] ||= [];if(!additions.value[area][props.modelValue.shelf].includes(n)) additions.value[area][props.modelValue.shelf].push(n);set('layer',n)}
  addVisible.value=false
}
</script>
<style scoped>
.part-location-entry{border-top:1px solid #e6ebf2;padding-top:20px;margin-top:6px}.part-location-entry h3{font-size:24px;margin:0 0 16px;color:#152943}.location-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}.choice-with-add{display:flex;gap:8px;width:100%;min-width:0}.choice-with-add .el-select{flex:1;min-width:0}.choice-with-add .el-button{height:46px;color:#bd2035;border-color:#e6b7c0;padding:0 12px}.location-code-hint{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:12px 16px;background:#f5f7fa;border-radius:8px;font-size:14px;color:#64748b}.location-code-hint strong{color:#23364f;font-size:16px}.location-code-hint small{flex-basis:100%}.add-location-help{color:#78879a;font-size:14px;line-height:1.7}@media(max-width:600px){.location-entry-grid{grid-template-columns:1fr}.span-2{grid-column:auto}}
.span-2{grid-column:1/-1}@media(max-width:600px){.span-2{grid-column:auto}}
</style>

<template>
  <el-dialog :model-value="modelValue" title="按关键词匹配模型" width="min(1080px,96vw)" top="5vh" :close-on-click-modal="false" :close-on-press-escape="!applying" :show-close="!applying" @update:model-value="$emit('update:modelValue',$event)">
    <p class="match-intro">核对当前搜索结果中的未关联物料。已有关联保持不变；多个候选或形状有差异的物料需手动选择。</p>
    <div class="match-tabs">
      <button v-for="tab in tabs" :key="tab.key" :class="{active:activeTab===tab.key}" @click="activeTab=tab.key">{{ tab.label }} <b>{{ rows.filter(row=>row.status===tab.key).length }}</b></button>
      <span>已关联保留 {{ rows.filter(row=>row.status==='linked').length }} · 无修改权限 {{ rows.filter(row=>row.status==='readonly').length }}</span>
    </div>
    <div v-loading="loading" class="match-table-wrap">
      <el-table :data="visibleRows" max-height="420" empty-text="当前分组没有物料">
        <el-table-column width="48"><template #header><el-checkbox aria-label="选择本组可关联物料" :model-value="allSelected" :indeterminate="someSelected&&!allSelected" :disabled="!eligibleRows.length||applying" @change="toggleAll" /></template><template #default="{row}"><el-checkbox :aria-label="`选择${row.name}`" :model-value="selected.has(row.partId)" :disabled="!choices[row.partId]||applying" @change="value=>toggle(row,value)" /></template></el-table-column>
        <el-table-column label="物料" min-width="230"><template #default="{row}"><strong class="match-part-name">{{ row.name }}</strong><code>{{ row.code }}</code></template></el-table-column>
        <el-table-column label="匹配依据" min-width="190"><template #default="{row}"><span class="match-reason">{{ row.reason }}</span><small v-if="row.candidates.length">{{ [...new Set(row.candidates.flatMap(item=>item.matched))].join('、') }}</small></template></el-table-column>
        <el-table-column label="类别模型" min-width="250"><template #default="{row}"><div v-if="['ready','review'].includes(row.status)" class="match-choice"><el-select v-model="choices[row.partId]" filterable clearable placeholder="核对后选择模型" :disabled="applying" @change="value=>toggle(row,Boolean(value))"><el-option v-for="candidate in row.candidates" :key="candidate.id" :label="candidate.name" :value="candidate.id" :disabled="!candidate.available" /></el-select><el-button link type="primary" :disabled="!choices[row.partId]" @click="showPreview(row)">查看3D</el-button></div><span v-else>{{ row.status==='unavailable'?'请先补齐模型文件':'需要补充匹配词或模型' }}</span></template></el-table-column>
      </el-table>
    </div>
    <template #footer><div class="match-footer"><span>已选 {{ selected.size }} 种物料</span><el-button :disabled="loading||applying" @click="loadPreview">重新匹配</el-button><el-button :disabled="applying" @click="$emit('update:modelValue',false)">取消</el-button><el-button type="primary" :loading="applying" :disabled="loading||!selected.size" @click="applySelected">关联所选 {{ selected.size }} 项</el-button></div></template>
  </el-dialog>
  <el-dialog v-model="preview.visible" :title="preview.name" width="min(700px,94vw)" append-to-body destroy-on-close><ModelPreview :model-url="preview.url" /></el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { previewPartCategoryMatches, applyPartCategoryMatches } from '../api'
import ModelPreview from './ModelPreview.vue'
const props = defineProps({ modelValue:Boolean, parts:{type:Array,default:()=>[]} })
const emit = defineEmits(['update:modelValue','applied'])
const rows = ref([]), loading = ref(false), applying = ref(false), activeTab = ref('ready')
const selected = reactive(new Set()), choices = reactive({}), preview = reactive({visible:false,name:'',url:''})
const tabs = [{key:'ready',label:'可直接关联'},{key:'review',label:'需要核对'},{key:'unmatched',label:'未匹配'},{key:'unavailable',label:'资源缺失'}]
const visibleRows = computed(()=>rows.value.filter(row=>row.status===activeTab.value))
const eligibleRows = computed(()=>visibleRows.value.filter(row=>choices[row.partId]))
const allSelected = computed(()=>eligibleRows.value.length>0&&eligibleRows.value.every(row=>selected.has(row.partId)))
const someSelected = computed(()=>eligibleRows.value.some(row=>selected.has(row.partId)))
let previewRequest = 0
function toggle(row,value) { if (value&&choices[row.partId]) selected.add(row.partId); else selected.delete(row.partId) }
function toggleAll(value) { for (const row of eligibleRows.value) toggle(row,value) }
function showPreview(row) { const model=row.candidates.find(item=>item.id===choices[row.partId]); if(model)Object.assign(preview,{visible:true,name:model.name,url:model.modelUrl}) }
async function loadPreview() {
  const request = ++previewRequest
  loading.value=true; rows.value=[]; selected.clear(); for(const id of Object.keys(choices))delete choices[id]
  try {
    const ids=[...new Set(props.parts.map(part=>Number(part.id)))], result=[]
    for(let offset=0;offset<ids.length;offset+=500) {
      const response=await previewPartCategoryMatches(ids.slice(offset,offset+500))
      if(request!==previewRequest)return
      result.push(...response.data)
    }
    rows.value=result
    for(const row of result)if(row.status==='ready'){choices[row.partId]=row.candidates[0].id;selected.add(row.partId)}
    activeTab.value=tabs.find(tab=>result.some(row=>row.status===tab.key))?.key||'ready'
  } catch { if(request===previewRequest)rows.value=[] } finally { if(request===previewRequest)loading.value=false }
}
async function applySelected() {
  const items=rows.value.filter(row=>selected.has(row.partId)).map(row=>({partId:row.partId,categoryModelId:choices[row.partId],fingerprint:row.fingerprint}))
  if(!items.length)return
  applying.value=true;let completed=0
  try {
    for(let offset=0;offset<items.length;offset+=500){
      const batch=items.slice(offset,offset+500),response=await applyPartCategoryMatches(batch)
      completed+=response.data.affected
      for(const item of batch){const row=rows.value.find(row=>row.partId===item.partId);row.status='linked';selected.delete(item.partId);delete choices[item.partId]}
    }
    ElMessage.success(`已为 ${completed} 种物料关联类别模型`);emit('update:modelValue',false)
  }catch(error){ElMessage.error(`已完成 ${completed}/${items.length} 项：${error?.response?.data?.msg||'请刷新后重新匹配'}`)}
  finally{applying.value=false;if(completed)emit('applied')}
}
watch(()=>props.modelValue,value=>{if(value)loadPreview();else{previewRequest++;preview.visible=false}})
</script>

<style scoped>
.match-intro{margin:0 0 16px;color:#667085;line-height:1.6}.match-tabs{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:12px}.match-tabs button{border:1px solid #e2e7ee;background:#fff;padding:7px 10px;border-radius:8px;color:#667085;cursor:pointer}.match-tabs button.active{color:#a61a27;border-color:#f0bdc3;background:#fff4f5}.match-tabs span{margin-left:auto;color:#8893a3;font-size:12px}.match-part-name{display:block;font-size:13px;line-height:1.5;word-break:break-word}.match-table-wrap code{font-size:12px;color:#697586}.match-table-wrap small{display:block;color:#8a95a5;font-size:11px;margin-top:4px;overflow-wrap:anywhere}.match-reason{line-height:1.5}.match-choice{display:flex;gap:8px;align-items:center}.match-choice .el-select{min-width:0;flex:1}.match-choice .el-button{margin:0}.match-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px}.match-footer span{margin-right:auto;font-size:13px;color:#667085}.match-footer .el-button{margin:0}@media(max-width:680px){.match-footer{flex-wrap:wrap}.match-footer span{width:100%;text-align:left}.match-tabs span{width:100%;margin:3px 0 0}.match-table-wrap{min-width:0}}
</style>

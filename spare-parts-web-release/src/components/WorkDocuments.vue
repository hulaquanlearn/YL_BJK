<template>
  <section class="documents card">
    <header><h2>工作内容与在线文档</h2><button :disabled="loading||busy" @click="refresh">刷新</button></header>
    <p>选择工作内容，设置对应文档。保存后新填报立即使用新链接，已提交记录保留原链接。</p>
    <p v-if="error" role="alert">{{error}}</p>
    <p v-if="loading" role="status">正在加载文档绑定…</p>
    <template v-else>
      <label>对应工作内容<select :value="selectedId" :disabled="busy" @change="selectDuty($event.target.value,$event.target)"><option value="">请选择工作内容</option><optgroup v-for="group in groups" :key="group.name" :label="group.name"><option v-for="d in group.items" :key="d.id" :value="d.id">{{d.title}}</option></optgroup></select></label>
      <p v-if="selectedId&&!selected">请先保存新增工作内容，再从工作目录进入此处绑定文档。</p>
      <fieldset v-if="selected" :disabled="readOnly||!canEdit||busy">
        <label>在线文档名称<input v-model="title" maxlength="100" placeholder="例如：2026年曲坯分析记录"></label>
        <label>在线文档链接<input v-model="url" type="url" maxlength="1000" placeholder="粘贴完整的 https://… 链接"></label>
        <p>{{selected.reportMode==='document'?'组长打开文档填写后，返回填报页上传工作截图再提交。':'文档会显示在对应填报中；原有结果选择和照片要求保持。'}}</p>
        <footer><button class="primary" :disabled="!changed||loading||Boolean(problem)" @click="save">{{busy?'正在保存…':'保存绑定'}}</button><button :disabled="!selected.documentUrl" @click="unbind">解除绑定</button></footer>
      </fieldset>
      <p v-if="problem" class="error" role="status">{{problem}}</p>
      <p v-if="readOnly||!canEdit">当前仅可查看，链接由系统管理员统一维护。</p>
      <div class="binding-list"><h3>已绑定文档 · {{bound.length}} 项</h3><article v-for="d in bound" :key="d.id"><div><small>{{d.category}}</small><b>{{d.title}}</b><a :href="d.documentUrl" target="_blank" rel="noopener noreferrer">{{d.documentTitle||'在线文档'}} ↗</a></div><button :disabled="busy" @click="selectDuty(d.id)">{{canEdit&&!readOnly?'更换链接':'查看绑定'}}</button></article><p v-if="!bound.length">暂无绑定，请先选择工作内容。</p></div>
    </template>
  </section>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {work} from '../api/work'
const props=defineProps({readOnly:Boolean,dutyId:{type:String,default:''},week:{type:String,default:''}})
const emit=defineEmits(['change'])
const entries=ref([]),selectedId=ref(props.dutyId),title=ref(''),url=ref(''),loading=ref(false),busy=ref(false),error=ref(''),canEdit=ref(false),catalogWeek=ref('')
const selected=computed(()=>entries.value.find(d=>d.id===selectedId.value))
const bound=computed(()=>entries.value.filter(d=>d.documentUrl))
const groups=computed(()=>{const result=new Map();for(const d of entries.value){if(!result.has(d.category))result.set(d.category,[]);result.get(d.category).push(d)}return [...result].map(([name,items])=>({name,items}))})
const changed=computed(()=>Boolean(selected.value)&&(title.value.trim()!==(selected.value.documentTitle||'')||url.value.trim()!==(selected.value.documentUrl||'')))
defineExpose({changed})
async function discardChanges(){if(!changed.value)return true;try{await ElMessageBox.confirm('在线文档修改尚未保存，确定放弃修改吗？','未保存的修改',{confirmButtonText:'放弃修改',cancelButtonText:'继续编辑'});return true}catch{return false}}
async function selectDuty(id,element){if(id===selectedId.value)return;if(element)element.value=selectedId.value;if(busy.value||!await discardChanges())return;selectedId.value=id}
async function refresh(){if(await discardChanges())return load()}
const problem=computed(()=>{if(!url.value.trim())return '';if(!title.value.trim())return '请填写文档名称';try{const link=new URL(url.value.trim());if(!['http:','https:'].includes(link.protocol)||link.username||link.password)throw 0;return ''}catch{return '请填写有效的 http/https 文档链接'}})
watch(selected,()=>{title.value=selected.value?.documentTitle||'';url.value=selected.value?.documentUrl||''})
watch(()=>props.dutyId,id=>{if(id)selectedId.value=id})
async function load(){loading.value=true;error.value='';try{const r=await work.get('/documents',{params:props.week?{week:props.week}:{}});entries.value=r.data.entries;canEdit.value=r.data.canEdit;catalogWeek.value=r.data.week;if(!selectedId.value&&bound.value.length)selectedId.value=bound.value[0].id}catch{error.value='文档绑定加载失败，请刷新重试。'}finally{loading.value=false}}
async function persist(documentTitle,documentUrl){if(busy.value||!selected.value||props.readOnly||!canEdit.value)return;busy.value=true;try{await work.post('/documents',{dutyId:selectedId.value,documentTitle,documentUrl,week:catalogWeek.value,revision:Number(selected.value.documentRevision||0)});ElMessage.success(documentUrl?'文档绑定已保存，相关事项新填报使用此链接':'文档绑定已解除');await load();emit('change')}catch{}finally{busy.value=false}}
function save(){if(changed.value&&!problem.value)return persist(title.value.trim(),url.value.trim())}
function unbind(){return persist('','')}
onMounted(load)
</script>
<style scoped>
.documents{display:grid;gap:16px;min-width:0}.documents header,.documents footer{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.documents h2,.documents h3,.documents p{margin:0}.documents p{font-size:14px;color:#536176;line-height:1.7}.documents label{display:grid;gap:8px}.documents input,.documents select{width:100%;box-sizing:border-box;font:inherit;padding:11px;border:1px solid #cbd3df;border-radius:8px;min-width:0}.documents fieldset{border:0;padding:0;margin:0;display:grid;gap:16px;min-width:0}.documents button{padding:9px 14px;border:1px solid #dce2ea;background:white;border-radius:8px;min-height:40px;cursor:pointer}.documents .primary{background:#5b57ac;color:white}.documents footer{justify-content:flex-start}.binding-list{display:grid;gap:12px;border-top:1px solid #e1e6ed;padding-top:18px}.binding-list article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px;background:#f4f6fa;border-radius:9px}.binding-list article>div{display:grid;gap:6px;min-width:0}.binding-list b,.binding-list a{overflow-wrap:anywhere}.binding-list small{color:#536176}.binding-list a{color:#484c95}.binding-list button{flex-shrink:0}.documents .error{color:#b42336}.documents button:disabled{cursor:default;opacity:.6}@media(max-width:700px){.binding-list article{align-items:flex-start;flex-direction:column}.documents footer button{flex:1}}
</style>

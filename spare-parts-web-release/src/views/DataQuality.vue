<template>
  <div class="quality-page">
    <section class="quality-hero">
      <div><span>DATA QUALITY CENTER</span><h2>让库存数据真正可用于决策</h2><p>统一检查订购点、最高储备、单价、单位、库位与盘点时效。</p></div>
      <el-button class="light-button" :loading="loading" @click="load"><el-icon><Refresh /></el-icon>重新检查</el-button>
    </section>

    <section class="quality-metrics">
      <article><span>质量得分</span><strong>{{ summary.qualityRate }}%</strong><small>无异常库存记录占比</small></article>
      <article class="is-good"><span>完整记录</span><strong>{{ summary.healthy }}</strong><small>可直接用于统计与补货</small></article>
      <article class="is-alert"><span>受影响记录</span><strong>{{ summary.affected }}</strong><small>一条记录可能有多个问题</small></article>
      <article class="is-total"><span>检查总量</span><strong>{{ summary.total }}</strong><small>当前有效库存记录</small></article>
    </section>

    <section class="panel issue-overview">
      <header><div><strong>问题分布</strong><span>点击分类可筛选，百分比以全部库存记录为分母</span></div><button type="button" :class="{active:!query.issueType}" @click="selectIssue('')">全部问题</button></header>
      <div class="issue-grid">
        <button v-for="item in summary.issueGroups" :key="item.key" type="button" :class="[`is-${item.severity}`,{active:query.issueType===item.key}]" @click="selectIssue(item.key)">
          <span>{{ item.label }}</span><strong>{{ item.count }}</strong><small>{{ item.rate }}%</small>
        </button>
      </div>
    </section>

    <section class="panel quality-filter">
      <div class="filter-field"><label>搜索备件</label><el-input v-model="query.searchKeyword" clearable placeholder="编码、名称、规格或库位" @keyup.enter="search" @clear="search"><template #prefix><el-icon><Search /></el-icon></template></el-input></div>
      <div class="filter-field"><label>所属车间</label><el-select v-model="query.workshopCode" clearable placeholder="全部车间" style="width:100%" @change="search"><el-option v-for="item in workshops" :key="item.code" :label="item.name" :value="item.code" /></el-select></div>
      <div class="filter-field"><label>问题类型</label><el-select v-model="query.issueType" clearable placeholder="全部问题" style="width:100%" @change="search"><el-option v-for="item in summary.issueGroups" :key="item.key" :label="item.label" :value="item.key" /></el-select></div>
      <div class="filter-actions"><el-button @click="reset">重置</el-button><el-button type="primary" :loading="loading" @click="search">查询</el-button></div>
    </section>

    <section class="panel table-panel">
      <div class="table-toolbar"><div><strong>{{ activeIssueLabel }}</strong><span class="result-count">共 {{ total }} 条</span></div><span class="quality-note">修复后重新检查即可更新得分</span></div>
      <el-table :data="list" v-loading="loading" row-key="_id" empty-text="当前筛选下没有数据质量问题">
        <el-table-column label="物料" min-width="260"><template #default="{row}"><div class="material-cell"><strong>{{ row.materialDesc }}</strong><span>{{ row.materialCode }} · {{ row.spec || '未填写规格' }}</span></div></template></el-table-column>
        <el-table-column label="问题" min-width="260"><template #default="{row}"><div class="issue-tags"><el-tag v-for="issue in row.issueDetails" :key="issue.key" :type="issue.severity==='critical'?'danger':issue.severity==='high'?'warning':'info'" effect="light" round>{{ issue.label }}</el-tag></div></template></el-table-column>
        <el-table-column label="库存 / 配置" min-width="175"><template #default="{row}"><div class="config-copy"><strong>{{ row.totalStock }} {{ row.unit || '未标单位' }}</strong><span>订购点 {{ row.reorderPoint ?? '-' }} · 最高 {{ row.maxStock ?? '-' }}</span></div></template></el-table-column>
        <el-table-column label="库位" min-width="160"><template #default="{row}">{{ row.locationCode || [row.shelf&&`${row.shelf}号架`,row.layer&&`${row.layer}层`].filter(Boolean).join(' · ') || '未设置' }}</template></el-table-column>
        <el-table-column label="最近盘点" width="125"><template #default="{row}">{{ row.lastInventoryDate || '从未盘点' }}</template></el-table-column>
        <el-table-column label="操作" width="90" align="right"><template #default="{row}"><el-button v-if="canEditWorkshop(row.workshopCode)" link type="primary" @click="openFix(row)">修复</el-button><span v-else class="quality-note">只读</span></template></el-table-column>
      </el-table>
      <div class="pagination-bar"><span>第 {{ query.page }} 页，每页 {{ query.pageSize }} 条</span><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[20,50,100]" layout="sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
    </section>

    <el-dialog v-model="fixVisible" title="修复备件配置" width="min(720px, 94vw)" destroy-on-close>
      <template v-if="fixPart">
        <div class="fix-head"><strong>{{ fixPart.materialDesc }}</strong><span>{{ fixPart.materialCode }}</span></div>
        <el-form label-position="top">
          <div class="form-grid">
            <el-form-item label="单位"><el-input v-model="fixForm.unit" placeholder="例如：个、套、米" /></el-form-item>
            <el-form-item label="不含税单价（元）"><el-input-number v-model="fixForm.price" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
            <el-form-item label="订购点"><el-input-number v-model="fixForm.reorderPoint" :min="0" controls-position="right" style="width:100%" /></el-form-item>
            <el-form-item label="最高储备"><el-input-number v-model="fixForm.maxStock" :min="0" controls-position="right" style="width:100%" /></el-form-item>
          </div>
          <el-divider content-position="left">库位配置</el-divider>
          <el-segmented v-model="fixForm.locationType" :options="[{label:'标准货架',value:'shelf'},{label:'文字位置',value:'free_text'}]" block />
          <div v-if="fixForm.locationType==='shelf'" class="form-grid location-grid">
            <el-form-item label="货架号"><el-input-number v-model="fixForm.shelf" :min="1" :max="99" style="width:100%" /></el-form-item>
            <el-form-item label="方位"><el-select v-model="fixForm.position" style="width:100%"><el-option label="东侧" :value="1" /><el-option label="西侧" :value="2" /></el-select></el-form-item>
            <el-form-item label="层数"><el-input-number v-model="fixForm.layer" :min="1" :max="4" style="width:100%" /></el-form-item>
            <el-form-item label="货位"><el-input-number v-model="fixForm.location" :min="1" :max="99" style="width:100%" /></el-form-item>
            <el-form-item label="六位库位码" class="span-two"><el-input v-model="fixForm.locationCode" maxlength="6" placeholder="例如：011101" /></el-form-item>
          </div>
          <el-form-item v-else label="位置说明" style="margin-top:16px"><el-input v-model="fixForm.locationNote" type="textarea" :rows="3" placeholder="例如：库房北墙厂家备件区" /></el-form-item>
        </el-form>
      </template>
      <template #footer><el-button @click="fixVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveFix">保存并重新检查</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { getDataQuality, updatePartConfig } from '../api'
import { canEditWorkshop } from '../auth'

const route=useRoute()
const loading=ref(false), saving=ref(false), list=ref([]), total=ref(0), fixVisible=ref(false), fixPart=ref(null)
const summary=ref({qualityRate:100,healthy:0,affected:0,total:0,issueGroups:[]})
const workshops=[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}]
const query=reactive({page:1,pageSize:30,searchKeyword:'',workshopCode:typeof route.query.workshopCode==='string'?route.query.workshopCode:'',issueType:typeof route.query.issue==='string'?route.query.issue:''})
const fixForm=reactive({unit:'',price:null,reorderPoint:null,maxStock:null,locationType:'shelf',locationNote:'',locationCode:'',shelf:null,position:null,layer:null,location:null})
const activeIssueLabel=computed(()=>summary.value.issueGroups.find(item=>item.key===query.issueType)?.label||'全部数据问题')

async function load(){loading.value=true;try{const result=await getDataQuality({...query});list.value=result.data||[];total.value=Number(result.total)||0;summary.value=result.summary||summary.value}finally{loading.value=false}}
function search(){query.page=1;load()}
function reset(){Object.assign(query,{page:1,searchKeyword:'',workshopCode:'',issueType:''});load()}
function selectIssue(key){query.issueType=key;search()}
function openFix(row){fixPart.value=row;Object.assign(fixForm,{unit:row.unit||'',price:row.price==null?null:Number(row.price),reorderPoint:row.reorderPoint==null?null:Number(row.reorderPoint),maxStock:row.maxStock==null?null:Number(row.maxStock),locationType:row.locationType||'shelf',locationNote:row.locationNote||'',locationCode:row.locationCode||'',shelf:row.shelf==null?null:Number(row.shelf),position:row.position==null?null:Number(row.position),layer:row.layer==null?null:Number(row.layer),location:row.location==null?null:Number(row.location)});fixVisible.value=true}
async function saveFix(){if(!fixPart.value)return;saving.value=true;try{await updatePartConfig(fixPart.value._id,{...fixForm});ElMessage.success('配置已保存');fixVisible.value=false;await load()}finally{saving.value=false}}
onMounted(load)
</script>

<style scoped>
.quality-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:16px;padding:25px 28px;border-radius:20px;color:#fff;background:linear-gradient(125deg,#172033,#263b59 62%,#315d62);box-shadow:0 18px 40px rgba(23,32,51,.16)}.quality-hero span{color:#a8d9d4;font-size:12px;font-weight:900;letter-spacing:.12em}.quality-hero h2{margin:7px 0 0;font-size:28px}.quality-hero p{margin:7px 0 0;color:#cbd5e1;font-size:13px}.light-button{color:#fff!important;border-color:#ffffff45!important;background:#ffffff14!important}.quality-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:16px}.quality-metrics article{padding:18px 20px;border:1px solid #e3e7ed;border-left:4px solid #315d62;border-radius:16px;background:#fff;box-shadow:0 8px 22px #1720330a}.quality-metrics .is-good{border-left-color:#169873}.quality-metrics .is-alert{border-left-color:#d28b19}.quality-metrics .is-total{border-left-color:#7c65b7}.quality-metrics span,.quality-metrics strong,.quality-metrics small{display:block}.quality-metrics span{color:#657084;font-size:12px;font-weight:800}.quality-metrics strong{margin-top:7px;font-size:27px}.quality-metrics small{margin-top:5px;color:#8c96a7;font-size:12px}.issue-overview{margin-bottom:16px;padding:18px}.issue-overview header{display:flex;align-items:center;justify-content:space-between;gap:16px}.issue-overview header strong,.issue-overview header span{display:block}.issue-overview header span{margin-top:4px;color:#7b8595;font-size:12px}.issue-overview header button{padding:7px 12px;border:1px solid #dfe3e9;border-radius:9px;background:#fff;cursor:pointer}.issue-overview header button.active{color:#fff;border-color:#263b59;background:#263b59}.issue-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:15px}.issue-grid button{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:12px;border:1px solid #e4e7ec;border-radius:11px;color:#424c5d;background:#fafbfc;cursor:pointer;text-align:left}.issue-grid button strong{font-size:18px}.issue-grid button small{grid-column:1/-1;color:#8b94a3}.issue-grid button.active{border-color:#c91f2c;box-shadow:0 0 0 2px #c91f2c14}.issue-grid .is-critical strong,.issue-grid .is-high strong{color:#bd1f2b}.issue-grid .is-medium strong{color:#b26b0c}.quality-filter{display:grid;grid-template-columns:minmax(280px,1.3fr) minmax(200px,.7fr) auto;gap:12px;align-items:end;margin-bottom:16px;padding:18px}.quality-note{color:#7b8595;font-size:12px}.issue-tags{display:flex;gap:5px;flex-wrap:wrap}.config-copy strong,.config-copy span{display:block}.config-copy span{margin-top:4px;color:#7c8798;font-size:12px}.fix-head{padding:14px 16px;margin-bottom:18px;border-radius:12px;background:#f6f8fa}.fix-head strong,.fix-head span{display:block}.fix-head span{margin-top:4px;color:#718096;font-size:12px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.location-grid{margin-top:16px}.span-two{grid-column:1/-1}@media(max-width:1050px){.quality-metrics,.issue-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.quality-hero{align-items:stretch;flex-direction:column;padding:21px}.quality-hero h2{font-size:23px}.quality-metrics,.issue-grid,.quality-filter,.form-grid{grid-template-columns:1fr}}
.quality-filter{grid-template-columns:minmax(260px,1.2fr) minmax(150px,.5fr) minmax(190px,.65fr) auto}
</style>

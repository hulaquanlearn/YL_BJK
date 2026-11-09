<template>
  <section v-if="models.length" class="catalog-showroom" aria-label="模型展示台">
    <aside class="catalog-selector" aria-label="选择目录模型">
      <div class="review-filter"><button type="button" :aria-pressed="reviewScope==='ready'" @click="reviewScope='ready';page=1">可观察 {{ readyCount }}</button><button type="button" :aria-pressed="reviewScope==='pending'" @click="reviewScope='pending';page=1">待核对 {{ pendingCount }}</button><button type="button" :aria-pressed="reviewScope==='missing'" @click="reviewScope='missing';page=1">缺文件 {{ models.length-readyCount-pendingCount }}</button></div>
      <div class="catalog-count">{{ scopedModels.length }} 个模型 · {{ page }} / {{ Math.max(1,Math.ceil(scopedModels.length/pageSize)) }} 页</div>
      <div class="catalog-choices">
        <button v-for="model in pageModels" :key="model.id" type="button" :class="{active:Number(selectedId)===Number(model.id)}" :aria-pressed="Number(selectedId)===Number(model.id)" :title="model.name" @click="choose(model.id)">
          <ModelThumbnail v-if="model.modelUrl && modelDisplayStatus(model).key==='ready'" class="catalog-thumb" :model-url="model.modelUrl" :front-rotation-y="Number(model.frontRotationY)||0" :alt="model.name" />
          <el-icon v-else><Box /></el-icon><span>{{ model.name }}</span>
        </button>
      </div>
      <el-pagination v-if="scopedModels.length>pageSize" v-model:current-page="page" :page-size="pageSize" :total="scopedModels.length" layout="prev, next" small aria-label="模型选择分页" />
    </aside>
    <div class="catalog-stage">
      <ModelPreview v-if="current?.modelUrl && (displayStatus.key==='ready' || inspectLegacy)" :key="current.id" :model-url="current.modelUrl" :title="current.name" :front-rotation-y="Number(current.frontRotationY)||0" :initial-angle=".55" height="clamp(400px,48vw,600px)" :show-observation-details="false" :allow-unreviewed="inspectLegacy || modelReviewConfirmed(current)" @observe="observation=$event" />
      <div v-else-if="current && displayStatus.key==='pending'" class="catalog-pending"><strong>{{ displayStatus.label }}</strong><p>{{ current.reviewDecision?.note || review?.note || displayStatus.description }}</p><el-button type="primary" @click="openReview">{{ canMaintain(current) ? '开始核对模型' : '查看核对资料' }}</el-button><el-button text @click="inspectLegacy=true">仅预览当前外形</el-button></div>
      <div v-else class="catalog-pending">{{ current ? '此模型尚未上传三维文件' : '当前分类没有模型，请切换左侧分类' }}</div>
    </div>
    <aside v-if="current" class="catalog-information" aria-label="目录模型信息">
      <span class="model-quality">{{ modelReviewConfirmed(current) ? '人工核对通过' : displayStatus.key==='ready' ? current.quality || '外观示意' : displayStatus.label }}</span>
      <h2>{{ current.name }}</h2>
      <dl><div><dt>关联备件</dt><dd>{{ current.associatedParts || 0 }} 种</dd></div></dl>
      <p v-if="current.reviewDecision || review?.note || current.description" class="model-description">{{ current.reviewDecision ? displayStatus.description : review?.note || current.description }}</p>
      <div v-if="observation" class="catalog-observation" role="status"><strong>{{ observation.name }}</strong><p>{{ observation.description || '当前选中整体外观' }}</p></div>
      <details v-if="associated.length" class="associated-parts"><summary>关联备件与规格</summary><ul><li v-for="part in associated" :key="part.id"><span>{{ part.name }}</span><small>{{ part.code }}<template v-if="part.spec"> · {{ part.spec }}</template></small></li></ul></details>
      <p v-if="current.reviewDecision" class="review-last-result">{{ modelReviewLabel(current.reviewDecision) }}<span v-if="current.reviewDecision.actorName"> · {{ current.reviewDecision.actorName }}</span></p>
      <div class="catalog-actions"><el-button v-if="displayStatus.key!=='pending' || inspectLegacy" type="primary" @click="openReview">{{ canMaintain(current) ? '核对模型 / 查看记录' : '查看核对记录' }}</el-button><el-button v-if="canMaintain(current)" @click="$emit('edit',current)">编辑 / 替换模型</el-button><el-button v-if="Number(current.associatedParts)>0" @click="$emit('bindings',current)">查看关联绑定</el-button><el-button v-if="canRemove && canMaintain(current)" type="danger" plain @click="$emit('remove',current)">删除模型</el-button></div>
    </aside>
    <ModelReviewDialog v-model="reviewVisible" :model-id="reviewModelId" :can-review="Boolean(reviewTarget && canMaintain(reviewTarget))" @saved="reviewSaved" />
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue'
import {Box} from '@element-plus/icons-vue'
import ModelThumbnail from './ModelThumbnail.vue'
import ModelPreview from './ModelPreview.vue'
import ModelReviewDialog from './ModelReviewDialog.vue'
import {modelReview} from '../utils/model-observation.mjs'
import {modelDisplayStatus} from '../utils/model-display-status.mjs'
import {modelReviewConfirmed,modelReviewInputKey,modelReviewLabel,withModelReviewDecision} from '../utils/model-review.mjs'
const props=defineProps({models:{type:Array,default:()=>[]},parts:{type:Array,default:()=>[]},canMaintain:{type:Function,default:()=>false},canRemove:Boolean})
const emit=defineEmits(['edit','bindings','remove','reviewed'])
const page=ref(1),pageSize=12,selectedId=ref(null),observation=ref(null)
const reviewScope=ref('ready'),inspectLegacy=ref(false)
const decisions=ref({}),reviewVisible=ref(false),reviewModelId=ref(null)
const effectiveModels=computed(()=>props.models.map(model=>withModelReviewDecision(model,decisions.value)))
const reviewTarget=computed(()=>effectiveModels.value.find(model=>Number(model.id)===Number(reviewModelId.value)))
const readyCount=computed(()=>effectiveModels.value.filter(m=>modelDisplayStatus(m).key==='ready').length)
const pendingCount=computed(()=>effectiveModels.value.filter(m=>modelDisplayStatus(m).key==='pending').length)
const scopedModels=computed(()=>effectiveModels.value.filter(m=>modelDisplayStatus(m).key===reviewScope.value))
const pageModels=computed(()=>scopedModels.value.slice((page.value-1)*pageSize,page.value*pageSize))
const current=computed(()=>effectiveModels.value.find(m=>Number(m.id)===Number(selectedId.value)))
const review=computed(()=>modelReview(current.value?.modelUrl))
const displayStatus=computed(()=>modelDisplayStatus(current.value))
const associated=computed(()=>props.parts.filter(p=>Number(p.categoryModelId)===Number(current.value?.id)))
function choose(id){selectedId.value=id;observation.value=null;inspectLegacy.value=false}
function openReview(){if(!current.value)return;reviewModelId.value=current.value.id;reviewVisible.value=true}
function reviewSaved(result){const model=props.models.find(item=>Number(item.id)===Number(result.modelId));if(!model)return;decisions.value={...decisions.value,[String(model.id)]:{inputKey:modelReviewInputKey(model),review:result.reviewDecision}};reviewScope.value=result.reviewDecision?.valid&&result.reviewDecision.status==='approved'?'ready':'pending';const index=scopedModels.value.findIndex(item=>Number(item.id)===Number(model.id));page.value=Math.max(1,Math.floor(Math.max(0,index)/pageSize)+1);selectedId.value=model.id;emit('reviewed',result)}
watch(scopedModels,()=>{page.value=Math.min(page.value,Math.max(1,Math.ceil(scopedModels.value.length/pageSize)))},{immediate:true})
watch(pageModels,rows=>{if(!rows.some(m=>Number(m.id)===Number(selectedId.value)))choose(rows[0]?.id??null)},{immediate:true})
watch(()=>current.value?.modelUrl,()=>{observation.value=null})
</script>
<style scoped>
.catalog-showroom{display:grid;grid-template-columns:210px minmax(0,1fr) 270px;align-items:start;overflow:hidden;border:1px solid #ccd7e1;border-radius:16px;background:#f8fafc;color:#2c4358}
.catalog-selector{padding:16px 10px;min-width:0}
.catalog-count{padding:0 10px 12px;color:#52697d;font-size:12px}
.catalog-choices{display:grid;gap:5px;max-height:542px;overflow:auto}
.catalog-choices button{display:flex;align-items:center;gap:10px;min-width:0;min-height:60px;padding:9px 10px;text-align:left;cursor:pointer;color:#36566f;border:1px solid transparent;border-radius:8px;background:transparent;font:inherit;font-size:12px;line-height:1.5}
.catalog-choices button span{overflow-wrap:anywhere}
.catalog-choices button:hover{background:#edf2f6}
.catalog-choices button.active{border-color:#7f9fb6;background:#e3edf4;color:#244c68}
.catalog-choices button:focus-visible,.review-filter button:focus-visible{outline:2px solid #336581;outline-offset:-3px}
.catalog-thumb{width:45px;height:46px;flex:none;border-radius:5px;overflow:hidden}
.catalog-selector :deep(.el-pagination){justify-content:center;margin-top:12px;--el-pagination-bg-color:#edf2f6;--el-pagination-button-color:#36566f;--el-text-color-placeholder:#768899}
.catalog-stage{min-width:0;background:#f3f6f9}
.catalog-stage :deep(.model-preview){border:0;border-radius:0}
.catalog-information{padding:24px 20px;min-width:0}
.model-quality{color:#336581;font-size:12px}
.catalog-information h2{font-size:19px;line-height:1.5;margin:12px 0 18px;overflow-wrap:anywhere}
.catalog-information dl{display:flex;gap:26px;padding-bottom:16px;border-bottom:1px solid #d9e2e9}
.catalog-information dt{font-size:12px;color:#52697d;margin-bottom:7px}
.catalog-information dd{margin:0;font-size:15px}
.model-description{color:#52697d;font-size:12px;line-height:1.8;overflow-wrap:anywhere}
.catalog-observation{border:1px solid #b8cbd9;border-radius:8px;background:#eef4f8;padding:12px;margin-top:16px;font-size:13px;color:#2c5069}
.catalog-observation p{font-size:12px;line-height:1.7;margin-bottom:0}
.catalog-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.catalog-actions :deep(.el-button){margin:0;font-size:12px}
.associated-parts{margin-top:18px;font-size:12px;color:#36566f}
.associated-parts summary{cursor:pointer}
.associated-parts ul{padding-left:16px;max-height:220px;overflow:auto}
.associated-parts li{margin-bottom:10px;line-height:1.6;overflow-wrap:anywhere}
.associated-parts small{display:block;color:#52697d}
.catalog-pending{height:460px;display:grid;place-items:center;color:#52697d}@media(max-width:1250px){.catalog-showroom{grid-template-columns:185px minmax(0,1fr)}
.catalog-information{grid-column:1/-1;display:block;border-top:1px solid #d9e2e9}
.catalog-information dl{display:inline-flex;margin:0;min-width:220px}
.catalog-information h2{margin-top:6px}
.model-description{max-width:850px}
.catalog-choices{max-height:540px}}@media(max-width:650px){.catalog-showroom{grid-template-columns:1fr}
.catalog-selector{padding:12px}
.catalog-count{padding-bottom:8px}
.catalog-choices{grid-template-columns:repeat(2,minmax(0,1fr));max-height:185px}
.catalog-choices button{min-height:54px;padding:7px;font-size:11px}
.catalog-thumb{width:34px;height:38px}
.catalog-information{padding:18px}
.catalog-selector :deep(.el-pagination){margin-top:6px}}
</style>

<style scoped>
.review-filter{display:flex;gap:5px;padding:0 3px 12px}
.review-filter button{flex:1;border:1px solid #c7d4df;background:#ffffff;color:#52697d;font:inherit;font-size:11px;padding:7px 4px;border-radius:6px;cursor:pointer}
.review-filter button[aria-pressed=true]{background:#e3edf4;border-color:#7f9fb6;color:#244c68}
.catalog-pending{display:flex;align-items:center;justify-content:center;flex-direction:column;padding:24px;gap:14px;box-sizing:border-box;text-align:center}
.catalog-pending p{max-width:340px;font-size:13px;line-height:1.8;margin:0}
</style>

<style scoped>
.catalog-thumb{position:relative}
.catalog-thumb :deep(span){padding:0;font-size:0}
.catalog-thumb[aria-busy=true]::after{content:'';width:14px;height:14px;border:2px solid #c7d4df;border-top-color:#336581;border-radius:50%;animation:thumbnail-spin 1s linear infinite}
.catalog-thumb:not([aria-busy=true]):has(span)::after{content:'◇';color:#52697d;font-size:20px}@keyframes thumbnail-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.catalog-thumb[aria-busy=true]::after{animation:none}}
</style>

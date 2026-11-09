<template>
<section class="part-model-detail">
  <router-link v-if="canReadDocuments" class="part-document-link" :to="documentsRoute">查找备件资料 <span>说明书 · 尺寸图 · 接线图</span></router-link>
  <component :is="collapsible ? 'details' : 'div'" :class="{'part-visual-details':collapsible}" @toggle="visualOpen=$event.target.open">
  <summary v-if="collapsible">模型与照片</summary>
  <template v-if="!collapsible || visualOpen">
  <label v-if="variants.length" class="part-variant-choice">规格参考<select v-model="variantId" @change="referencePreview=Boolean(variantId)"><option value="">当前绑定模型</option><option v-for="item in variants" :key="item.id" :value="item.id">{{item.model}} · {{item.quality}}</option></select></label>
  <div class="visual-grid">
    <section class="model-pane">
      <ModelPreview v-if="modelUrl && (!partModelNeedsReview(part) || referencePreview)" :model-url="modelUrl" :title="part?.categoryModelName || ''" :front-rotation-y="Number(part?.categoryFrontRotationY) || 0" :initial-angle="0.55" :height="compact ? '240px' : '430px'" :object-only="compact" :allow-unreviewed="partModelReviewed(part) || referencePreview" />
      <div v-else class="visual-empty"><template v-if="modelUrl && partModelNeedsReview(part)"><span>{{ partModelStatus(part).label }}</span><button class="reference-preview-button" type="button" @click="referencePreview=true">查看三维参考</button></template><template v-else>{{ part?.categoryModelName ? '绑定模型待生成' : '此备件尚未绑定模型' }}</template></div>
      <details v-if="modelUrl && referencePreview" class="reference-evidence"><summary>参考模型 · 查看资料范围</summary><template v-if="selectedVariant"><p>{{selectedVariant.model}} · {{selectedVariant.quality}}</p><p>{{selectedVariant.confirmedDimensionsMm}}</p><p>{{selectedVariant.evidenceNote}}</p><p v-if="selectedVariant.unknown?.length">未核实：{{selectedVariant.unknown.join('、')}}</p></template><p v-else>{{ partModelStatus(part).description }}</p><p>仅供了解结构；查看不会改变模型核对记录或备件绑定。</p></details>
      
      <p v-if="modelUrl && !compact">{{ part?.modelQuality || '外观示意' }}；未核实厂家尺寸的模型不用于安装校核。</p>
    </section>
    <section v-if="photoUrl" class="photo-pane"><h3>实物照片</h3><el-image :src="photoUrl" :preview-src-list="[photoUrl]" fit="contain" preview-teleported class="part-photo"><template #error><div class="visual-empty">实物照片暂不可用</div></template></el-image></section>
  </div>
  </template>
  </component>
</section>
</template>
<script setup>
import {computed,defineAsyncComponent,ref,watch} from 'vue'
import {displayedPartModel,partPhotoUrl,partModelReviewed,partModelNeedsReview,partModelStatus} from '../utils/bound-part-model.mjs'
import {spareDocumentQuery} from '../utils/spare-documents.mjs'
import {partModelVariants} from '../utils/part-model-variants.mjs'
import {canReadFeature} from '../utils/feature-access.mjs'
import {getUser} from '../auth'
const canReadDocuments=canReadFeature(getUser(),'/knowledge')
const ModelPreview=defineAsyncComponent(()=>import('./ModelPreview.vue'))
const props=defineProps({part:Object,compact:Boolean,collapsible:Boolean,inventoryReturn:String})
const visualOpen=ref(false)
const documentsRoute=computed(()=>{
 const target=spareDocumentQuery(props.part)
 return props.inventoryReturn ? {...target,state:{inventoryDetailBack:props.inventoryReturn}} : target
})
const variants=computed(()=>partModelVariants(props.part))
const variantId=ref('')
const selectedVariant=computed(()=>variants.value.find(item=>item.id===variantId.value))
const modelUrl=computed(()=>selectedVariant.value?.url || displayedPartModel(props.part))
const photoUrl=computed(()=>partPhotoUrl(props.part))
const referencePreview=ref(false)
watch(()=>[props.part?.id,displayedPartModel(props.part),props.part?.categoryModelReviewDecision?.versionHash],()=>{referencePreview.value=false;variantId.value=''})
</script>
<style scoped>
.part-visual-details{margin-top:8px}
.part-visual-details>summary{cursor:pointer;padding:10px 12px;border:1px solid #dfe7ee;border-radius:10px;color:#38566c;font-weight:600}
.part-variant-choice{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:13px;color:#476575;flex-wrap:wrap}.part-variant-choice select{flex:1;min-width:0;max-width:100%;min-height:44px;padding:8px;border:1px solid #c7dbe3;border-radius:8px;background:#fff;color:#294d60;font:inherit}
.part-document-link{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:44px;margin-bottom:12px;padding:8px 12px;background:#f3f8fa;border:1px solid #dce9ed;border-radius:8px;color:#236176;text-decoration:none;font-size:14px}.part-document-link span{font-size:12px;color:#64748b}
.part-model-detail{margin:16px 0}.visual-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}.visual-grid section{min-width:0}.photo-pane{padding:14px;border:1px solid #e3e8ef;border-radius:12px;background:#fff}h3{font-size:14px;margin:0 0 12px}.part-photo{width:100%;height:240px;background:#f7f9fc}.visual-empty{height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#64748b;background:#f7f9fc;border-radius:8px}.reference-preview-button{min-height:44px;padding:8px 18px;border:1px solid #8db7c5;border-radius:8px;background:#fff;color:#236176;font:inherit;cursor:pointer}.reference-preview-button:focus-visible{outline:2px solid #236176;outline-offset:3px}.reference-evidence{margin-top:10px;padding:10px 12px;background:#f3f8fa;border-radius:8px;color:#476575;font-size:12px;overflow-wrap:anywhere}.reference-evidence summary{cursor:pointer;min-height:24px;line-height:24px}p{font-size:12px;color:#64748b;line-height:1.7;margin:8px 0 0}
</style>

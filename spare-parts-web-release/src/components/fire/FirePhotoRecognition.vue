<template>
  <section class="photo-recognition" :class="{'is-compact':compact}" aria-label="拍照点检">
    <button v-if="!activePreview" type="button" class="fire-camera-launch" :disabled="!available || f.recognitionBusy" @click="camera?.open()"><el-icon><Camera /></el-icon><strong>{{ f.recognitionBusy?'正在处理…':compact?'拍摄检查卡':'拍照点检' }}</strong></button>
    <el-alert v-if="!f.photoRecognition.enabled" :title="f.photoRecognition.reason || '拍照识别暂不可用，请稍后重试。'" type="warning" :closable="false" />
    <el-alert v-else-if="!currentPeriod" title="请返回本月拍照点检。" type="info" :closable="false" />
    <FireCamera ref="camera" :disabled="!available || f.recognitionBusy" @capture="choose" />
    <FireCamera ref="sideCamera" :disabled="!available || f.recognitionBusy" @capture="chooseSide" />
    <template v-if="matchesContext">
      <div v-if="activePreview" class="photo-evidence-strip">
        <div class="evidence-thumbnails"><FirePreviewImage :src="f.recognitionPreview" :preview-src-list="previewUrls" fit="cover" alt="本次现场照片" /><FirePreviewImage v-for="(view,index) in f.recognitionViews" :key="view.url" :src="view.url" :preview-src-list="previewUrls" fit="cover" :alt="'补拍照片'+(index+1)" /></div>
        <span class="evidence-caption">{{ f.recognitionBusy?'正在处理…':'照片 '+previewUrls.length+' 张' }}</span>
        <div class="evidence-actions"><el-button text :disabled="!available || f.recognitionBusy" @click="camera?.open()">重拍</el-button><el-button v-if="(f.recognitionViews?.length||0)<2" text :disabled="!available || f.recognitionBusy" title="补拍同一张检查卡的另一侧" @click="sideCamera?.open()">补拍</el-button></div>
      </div>
      <el-alert v-if="f.recognitionError" :title="f.recognitionError" type="error" :closable="false" />
      <section v-if="f.recognitionResponse?.status==='awaiting_confirmation'" class="recognition-confirm" aria-label="核对本月点检">
        <el-form label-position="top" @submit.prevent="f.confirmRecognition">
          <div v-if="!assetId" class="recognition-identity">
            <el-form-item v-if="!f.recognitionDraft.assetId || f.recognitionChoosingAsset" label="对应器材"><el-select v-model="f.recognitionDraft.assetId" aria-label="选择点检器材" filterable clearable :disabled="f.recognitionBusy" placeholder="按编号、区域或位置搜索器材" @change="f.recognitionAssetChanged"><el-option v-for="candidate in f.recognitionCandidates" :key="candidate.assetId" :value="candidate.assetId" :label="candidate.deviceCode+' · '+candidate.areaName+' · '+candidate.location" /></el-select></el-form-item>
            <p v-if="!f.recognitionDraft.assetId" class="identity-hint">{{ f.recognitionResponse.recognition?.deviceCode ? '识别编号 '+f.recognitionResponse.recognition.deviceCode+'，请选择对应器材。' : '未识别到编号，请选择对应器材。' }}</p>
            <div v-else-if="!f.recognitionChoosingAsset" class="matched-identity"><strong>{{ f.recognitionDraft.deviceCode }}</strong><span>{{ f.recognitionDraft.location }}</span><el-button text :disabled="f.recognitionBusy" @click="f.recognitionChoosingAsset=true">更换</el-button></div>
          </div>
          <div class="inspection-checklist" aria-label="检查项目结果">
            <div v-for="check in f.recognitionResponse.recognition?.checks||[]" :key="check.key" class="inspection-check-row" :class="{'needs-manual':check.requiresConfirmation || check.result==='unclear'}">
              <div class="check-copy"><div class="check-name">{{ check.name }}<small v-if="check.requiresConfirmation || check.result==='unclear'">{{ f.recognitionDraft.manualChecks?.[check.key]?'已补充':'待确认' }}</small></div><p v-if="check.standard">{{ check.standard }}</p></div>
              <el-radio-group v-if="check.requiresConfirmation || check.result==='unclear'" v-model="f.recognitionDraft.manualChecks[check.key]" class="manual-check-choice" :aria-label="check.name+'人工确认'" size="small" :disabled="f.recognitionBusy"><el-radio-button value="normal">√ 正常</el-radio-button><el-radio-button value="abnormal">× 异常</el-radio-button></el-radio-group>
              <span v-else class="recognized-check-result" :class="check.result==='abnormal'?'is-abnormal':'is-normal'">{{ check.result==='abnormal'?'× 异常':'√ 正常' }}</span>
            </div>
          </div>
          <div v-if="!hideSaveActions" class="recognition-save"><el-button text :disabled="f.recognitionBusy" @click="f.clearRecognition">取消</el-button><span v-if="f.recognitionMissingChecks?.length">待确认 {{ f.recognitionMissingChecks.length }} 项</span><el-button type="primary" native-type="submit" :loading="f.recognitionBusy" :disabled="!available || !f.recognitionDraft.assetId || f.recognitionMissingChecks?.length>0">确认保存</el-button></div>
        </el-form>
      </section>
      <div v-if="f.recognitionResponse?.status==='needs_review'" class="recognition-review"><strong>需要补拍</strong><p>{{ f.recognitionResponse.message || f.recognitionResponse.recognition?.reasons?.join('；') || '本月检查行尚无法确认。' }}</p></div>
      <div v-if="f.recognitionResponse?.status==='completed'" class="recognition-completed" role="status"><el-icon><CircleCheckFilled/></el-icon><div><strong>{{ f.recognitionResponse.recognition?.deviceCode }} · 已完成点检</strong><span>{{ f.resultName(f.recognitionResponse.recognition?.result || f.recognitionResponse.record?.result) }}<template v-if="f.recognitionResponse.recognition?.result==='abnormal'"> · 待整改</template></span></div><el-button text @click="f.openPoint(f.recognitionResponse.pointId,'history',f.recognitionResponse.assetId)">查看记录<el-icon><ArrowRight/></el-icon></el-button></div>
      <div v-if="f.recognitionFile && !f.recognitionBusy && f.recognitionError" class="heading-actions"><el-button :disabled="!available" @click="f.recognizePhoto()">重新识别</el-button><el-button v-if="f.recognitionResponse?.status!=='awaiting_confirmation'" text @click="f.clearRecognition">取消本张</el-button></div>
    </template>
  </section>
</template>
<script setup>
import FirePreviewImage from './FirePreviewImage.vue'
import { computed, inject, ref } from 'vue'
import FireCamera from './FireCamera.vue'
const props=defineProps({compact:Boolean,hideSaveActions:Boolean,pointId:{type:[String,Number],default:''},assetId:{type:[String,Number],default:''}}),f=inject('fireInspection'),camera=ref(null),sideCamera=ref(null)
const matchesContext=computed(()=>props.pointId ? String(f.recognitionContext?.pointId||f.recognitionResponse?.pointId||'')===String(props.pointId)&&(!props.assetId||String(f.recognitionContext?.assetId||f.recognitionResponse?.assetId||'')===String(props.assetId)) : !f.recognitionContext?.pointId)
const activePreview=computed(()=>matchesContext.value && f.recognitionPreview && f.recognitionResponse?.status!=='completed')
const previewUrls=computed(()=>[f.recognitionPreview,...(f.recognitionViews||[]).map(view=>view.url)].filter(Boolean))
const currentPeriod=computed(()=>!f.selectedCycle?.inspectionMonth||f.selectedCycle.inspectionMonth===f.photoRecognition.periodMonth)
const available=computed(()=>f.selectedCycle?.status!=='closed' && currentPeriod.value)
function choose(event){f.chooseRecognition(event,props.pointId,props.assetId)}
function chooseSide(event){f.chooseRecognition(event,props.pointId,props.assetId,true)}
</script>
<style scoped>
.photo-recognition{padding:0;border:0;background:transparent;border-radius:0}.fire-camera-launch{display:flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:10px 14px;border-radius:10px}.photo-evidence-strip{display:flex;align-items:center;gap:9px;min-height:62px;padding:8px 10px;background:#f5f7f9;border:1px solid #e9edf1;border-radius:10px;margin:0 0 4px}.evidence-thumbnails{display:flex;gap:4px;flex:none}.evidence-thumbnails>.el-image{width:38px;height:46px;border-radius:5px;background:#e8edf1}.evidence-caption{font-size:12px;color:#7a8997;white-space:nowrap;flex:1;min-width:0}.evidence-actions{display:flex;gap:0;flex:none}.evidence-actions .el-button{padding:8px 5px;margin:0;font-size:12px;min-height:36px;color:#a73148}.recognition-confirm{padding:0;margin:0;border:0;border-radius:0;background:transparent}.recognition-confirm .el-form-item{margin:10px 0}.recognition-confirm .el-select{width:100%}.recognition-identity{padding:6px 0;border-bottom:1px solid #e9edf1}.identity-hint{margin:4px 0 8px;font-size:12px;color:#7a8997;line-height:1.5}.matched-identity{display:flex;align-items:center;gap:10px;font-size:13px;min-height:38px}.matched-identity strong{color:#233b4d}.matched-identity>span{flex:1;color:#7a8997;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.matched-identity .el-button{margin:0;padding:5px;font-size:12px}.inspection-checklist{margin:0}.inspection-check-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 1px;border-bottom:1px solid #edf0f3;min-height:52px;box-sizing:border-box}.inspection-check-row:last-child{border-bottom:0}.check-copy{min-width:0}.check-name{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:600;line-height:1.5;color:#2b4254}.check-name small{font-size:10px;font-weight:400;color:#b36a28;background:#fff5e9;padding:1px 4px;border-radius:3px;white-space:nowrap}.check-copy>p{margin:3px 0 0;font-size:11px;line-height:1.5;color:#84919d;overflow-wrap:anywhere}.recognized-check-result{font-size:13px;font-weight:500;white-space:nowrap;min-width:110px;text-align:right;padding-right:2px}.is-normal{color:#17835c}.is-abnormal{color:#b33148}.manual-check-choice{flex-wrap:nowrap}.manual-check-choice :deep(.el-radio-button__inner){padding:8px 9px;min-height:34px;font-size:12px;box-shadow:none;box-sizing:border-box}.manual-check-choice :deep(.el-radio-button__original-radio:not(:checked)+.el-radio-button__inner){background:#fff;color:#718291;border-color:#dce3e9}.recognition-save{display:flex;align-items:center;gap:10px;padding:12px 0 0;border-top:1px solid #edf0f3;margin:2px 0 0}.recognition-save>span{flex:1;text-align:right;font-size:12px;color:#a36b2b}.recognition-save>.el-button{min-height:42px;margin:0}.recognition-save>.el-button:last-child{margin-left:auto;min-width:120px;border-radius:8px}.recognition-review{margin:10px 0 0;padding:10px 12px;font-size:12px}.recognition-review>p{margin-top:5px;line-height:1.6}.recognition-completed{margin:8px 0 0}.is-compact .photo-evidence-strip{margin-bottom:2px}
</style>

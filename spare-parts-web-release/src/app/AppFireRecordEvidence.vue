<template>
 <article class="app-fire-record">
  <header v-if="showResult || showDevice"><strong v-if="showDevice">{{ recognition?.deviceCode || record.items?.[0]?.assetSnapshot?.code || '器材记录' }}</strong><strong v-if="showResult" :class="record.result==='normal'?'checked-text':'danger'">{{ record.result==='normal'?'检查正常':'发现异常' }}</strong></header>
  <dl class="app-fire-record-meta"><div><dt>点检人</dt><dd>{{ record.actorName || '—' }}</dd></div><div><dt>{{ recognition?'登记时间':'点检时间' }}</dt><dd>{{ f.time(record.actualCheckedAt || record.submittedAt) }}</dd></div></dl>
  <p v-if="record.backfillReason" class="app-fire-record-note">补录：{{ record.backfillReason }}</p>
  <p v-if="recordNote" class="app-fire-record-note">{{ recordNote }}</p>
  <div v-if="recognition" class="app-fire-record-checks" aria-label="检查项目结果"><div v-for="(check,index) in recognition.checks || []" :key="index"><span>{{ check.name }}</span><span><strong :class="check.result==='normal'?'checked-text':'danger'">{{ check.mark || f.resultName(check.result) }}</strong><small v-if="check.source==='manual_confirmation'" style="display:block;font-size:11px">人工确认</small></span></div></div>
  <div v-else class="app-fire-record-items"><div v-for="item in record.items || []" :key="item.assetId"><strong>{{ item.assetSnapshot?.code || item.assetSnapshot?.name || '器材' }}</strong><span :class="item.result==='normal'?'checked-text':'danger'">{{ f.resultName(item.result) }}</span><p v-if="item.remark">{{ item.remark }}</p></div></div>
  <div v-if="record.photos?.length" class="app-fire-record-photos"><span>现场照片 <small>{{ record.photos.length }}</small></span><div class="fire-photo-grid"><FirePreviewImage v-for="photo in record.photos" :key="photo.id" class="history-photo" :src="f.photoUrls[photo.id]" :preview-src-list="record.photos.map(p=>f.photoUrls[p.id]).filter(Boolean)" fit="cover"><template #error><button class="photo-retry" type="button" @click="f.loadPhoto(photo)">重新加载</button></template></FirePreviewImage></div></div>
  <details v-if="recognitionMeta.length" class="app-fire-recognition-details"><summary>识别记录</summary><dl class="app-fire-record-meta"><div v-for="row in recognitionMeta" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl></details>
 </article>
</template>
<script setup>
import FirePreviewImage from '../components/fire/FirePreviewImage.vue'
import {computed,inject} from 'vue'
const props=defineProps({record:{type:Object,required:true},showResult:{type:Boolean,default:undefined},showDevice:{type:Boolean,default:undefined}}),f=inject('fireInspection')
const showResult=computed(()=>props.showResult??(f.visibleRecords?.length!==1))
const showDevice=computed(()=>props.showDevice??(f.activeAssetId!==undefined&&!f.activeAssetId))
const recognition=computed(()=>props.record.pointSnapshot?.recognition || props.record.recognition)
const recordNote=computed(()=>{const text=String(props.record.remark||'').trim();return recognition.value&&/^(?:AI识别|拍照点检)\s*\d{4}(?:-\d{1,2}|年\d{1,2}月)检查卡/.test(text)?'':text})
const recognitionMeta=computed(()=>{
 const value=recognition.value;if(!value)return []
 const rows=[],confirmation=value.confirmation
 if(value.recognizedAt&&f.time(value.recognizedAt)!==f.time(props.record.actualCheckedAt||props.record.submittedAt))rows.push({label:'识别时间',value:f.time(value.recognizedAt)})
 const registeredMonth=String(props.record.actualCheckedAt||props.record.submittedAt||'').replaceAll('/','-').slice(0,7)
 if(value.inspectionMonth&&value.inspectionMonth!==registeredMonth)rows.push({label:'任务月份',value:value.inspectionMonth})
 if(confirmation&&Object.hasOwn(confirmation,'originalDeviceCode')&&confirmation.originalDeviceCode!==value.deviceCode)rows.push({label:'原识别编号',value:confirmation.originalDeviceCode||'未识别'})
 if(confirmation?.ledgerLocation&&confirmation.ledgerLocation!==value.location)rows.push({label:'点检位置',value:value.location||'未填写'})
 return rows
})
</script>
<style scoped>
.app-fire-record{border:1px solid #e4e9ee;border-radius:12px;padding:14px;margin:0 0 12px;color:#263c4f}.app-fire-record>header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.app-fire-record>header strong{font-size:15px;font-weight:650}.app-fire-record-meta{margin:0;display:grid;gap:7px}.app-fire-record-meta>div{display:grid;grid-template-columns:66px minmax(0,1fr);gap:8px;align-items:baseline;font-size:13px;line-height:1.5}.app-fire-record-meta dt{color:#8593a0}.app-fire-record-meta dd{margin:0;overflow-wrap:anywhere;color:#3b5266}.app-fire-record-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 20px;padding:12px 0 2px;margin-top:10px;border-top:1px solid #edf0f3}.app-fire-record-checks>div{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:#65798b;min-width:0}.app-fire-record-checks strong{font-size:16px;flex:none}.app-fire-record .app-fire-record-note{font-size:13px;line-height:1.6;margin:10px 0;color:#65798b}.app-fire-record-items>div{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;padding-top:12px}.app-fire-record-items p{flex-basis:100%;margin:0}.app-fire-record-photos{margin-top:12px}.app-fire-record-photos>span{font-size:12px;color:#8493a0}.app-fire-record-photos small{margin-left:4px}.app-fire-record-photos :deep(.history-photo){width:96px;height:78px;border-radius:8px}.app-fire-record-photos :deep(.fire-photo-grid){margin:8px 0 0;gap:8px}.app-fire-recognition-details{border-top:1px solid #edf0f3;margin-top:12px}.app-fire-recognition-details>summary{cursor:pointer;color:#718496;font-size:12px;min-height:40px;display:flex;align-items:center;justify-content:space-between;list-style:none}.app-fire-recognition-details>summary:after{content:'⌄';font-size:16px}.app-fire-recognition-details[open]>summary:after{transform:rotate(180deg)}.app-fire-recognition-details>summary::-webkit-details-marker{display:none}.app-fire-recognition-details .app-fire-record-meta{padding:0 0 6px}.app-fire-recognition-details .app-fire-record-meta>div{font-size:12px}
</style>

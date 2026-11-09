<template>
    <el-dialog v-model="detailVisible" :title="activeAssetId ? (targetAsset ? assetTitle(targetAsset)+' · 点检' : '器材点检') : (detail?.point?.name || '消防点位')" width="min(1000px,96vw)" class="fire-dialog fire-point-dialog" :class="{'fire-app-point-dialog':executionMode}" align-center :close-on-click-modal="false" :show-close="!executionMode && !busy" :close-on-press-escape="!busy" :before-close="closeDetail" @closed="detailClosed">
      <template #header><span class="fire-detail-wide-title">{{ activeAssetId ? (targetAsset ? assetTitle(targetAsset)+' · 点检' : '器材点检') : (detail?.point?.name || '消防点位') }}</span></template>
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false"><el-button text @click="openPoint(activePointId,undefined,activeAssetId)">重试</el-button></el-alert>
      <div v-loading="detailLoading" class="detail-content">
        <template v-if="detail">
          <section class="fire-detail-phone-intro"><header><strong>{{ targetAsset ? (targetAsset.type==='hydrant'?'消防栓':'灭火器')+' '+targetAsset.code : detail.point.name }}</strong><span class="point-state" :class="appResultTone">{{ appResultLabel }}</span><button v-if="executionMode" type="button" class="fire-point-close" aria-label="关闭此对话框" :disabled="busy || recognitionBusy" @click="requestClose"><el-icon><Close /></el-icon></button></header><p class="fire-detail-location"><el-icon><Location /></el-icon><span>{{ [detail.point.areaName,location(detail.point) || detail.point.name].filter(Boolean).join(' · ') }}</span></p></section>
          
          <template v-if="executionMode">
            <template v-if="detailTab==='issues'"><AppFireIssue v-for="issue in detail.issues || []" :key="issue.id" :issue="issue" /><el-empty v-if="!detail.issues?.length" description="暂无异常记录" /></template>
            <template v-else-if="showCompletedRecords"><article v-for="record in visibleRecords" :key="record.id" class="fire-history"><AppFireRecordEvidence :record="record" /></article><el-button v-if="filteredRecords.length>historyLimit" text @click="historyLimit+=10">更多记录</el-button><el-empty v-if="!filteredRecords.length" description="暂无点检记录" /></template>
            <FirePhotoRecognition v-else-if="canRecord(detail.point)" :point-id="activePointId" :asset-id="activeAssetId" compact hide-save-actions />
            <el-alert v-else title="当前器材本月不可重复点检。" type="info" :closable="false" />
          </template>
          <template v-else>
          <div class="fire-detail-summary"><div><strong>{{ detail.point.code }}</strong><p>{{ detail.point.sectionName || '未分工段' }} · {{ detail.point.areaName }} · {{ location(detail.point) || detail.point.name }}</p></div><div class="summary-flags"><span v-if="activeAssetId && targetAsset" class="point-state" :class="assetState(targetAsset).tone">{{ assetState(targetAsset).label }}</span><span v-else class="point-state" :class="state(detail.point).tone">{{ state(detail.point).label }}</span><span>点位已检 {{ detail.point.checkedAssetCount || 0 }} / {{ detail.point.assetCount || detail.assets?.length || 0 }} 件</span><el-tag v-if="detail.point.hasIssue" type="danger">异常待关注</el-tag></div></div>
          <div v-if="activeAssetId" class="asset-order-caption"><strong>本件器材</strong><span v-if="detail.workOrder">月份：{{ detail.workOrder.cycleName || selectedCycle?.name }}</span><span>点检人和提交时间由系统记录</span><el-button text :disabled="busy" @click="openPoint(activePointId)">查看同点位全部器材</el-button></div><el-tabs v-model="detailTab">
            <el-tab-pane :label="'点检记录（'+filteredRecords.length+'）'" name="history">
              <article v-for="record in visibleRecords" :key="record.id" class="fire-history"><AppFireRecordEvidence v-if="executionMode" :record="record" /><FireRecordEvidence v-else :record="record" /></article><el-button v-if="filteredRecords.length>historyLimit" @click="historyLimit+=10">加载更多点检记录</el-button><el-empty v-if="!filteredRecords.length" description="暂无点检记录" />
            </el-tab-pane>
            <el-tab-pane :label="'异常处理（'+(detail.issues?.filter(i=>i.status!=='closed').length||0)+'）'" name="issues">
              <AppFireIssue v-if="executionMode" v-for="issue in detail.issues || []" :key="issue.id" :issue="issue" /><template v-else><article v-for="issue in detail.issues || []" :key="issue.id" class="fire-history"><header><strong>{{ issue.remark || '消防器材异常' }}</strong><el-tag :type="issue.status==='closed'?'success':issue.status==='resolved'?'warning':'danger'">{{ issueStatus(issue.status) }}</el-tag></header><p>发现时间：{{ time(issue.createdAt) }}</p><div v-for="event in issue.events || []" :key="event.id" class="issue-event"><strong>{{ event.actorName }} · {{ issueAction(event.action) }}</strong><small>{{ time(event.createdAt) }}</small><p>{{ event.remark }}</p><div class="fire-photo-grid"><FirePreviewImage v-for="photo in event.photos || []" :key="photo.id" class="history-photo" :src="photoUrls[photo.id]" :preview-src-list="[photoUrls[photo.id]].filter(Boolean)" fit="cover" /></div></div><div v-if="issue.photos?.length && !(issue.events||[]).some(event=>event.photos?.length)" class="fire-photo-grid"><FirePreviewImage v-for="photo in issue.photos" :key="photo.id" class="history-photo" :src="photoUrls[photo.id]" :preview-src-list="issue.photos.map(p=>photoUrls[p.id]).filter(Boolean)" fit="cover" /></div><div v-if="canInspect(detail.point)" class="heading-actions"><el-button v-if="issue.status==='open'" size="small" @click="openIssue(issue,'resolve')">登记整改</el-button><el-button v-if="permissions.canManage && issue.status==='resolved'" size="small" type="success" @click="openIssue(issue,'close')">复核关闭</el-button><el-button v-if="permissions.canManage && issue.status!=='open'" size="small" @click="openIssue(issue,'reopen')">重新打开</el-button></div></article></template><el-empty v-if="!detail.issues?.length" description="暂无异常记录" />
            </el-tab-pane>
<el-tab-pane label="器材信息" name="assets"><el-button v-if="executionMode&&activeAssetId" class="fire-same-location" text :disabled="busy" @click="openPoint(activePointId)">查看同位置器材</el-button><div v-for="asset in displayedAssets" :key="asset.id" class="fire-check-item"><div class="check-item-heading"><strong>{{ assetTitle(asset) }}</strong><el-button v-if="physicalAsset(asset)" text type="primary" @click="showQr(detail.point,asset)">查看二维码</el-button></div><p>{{ [asset.spec,asset.manufacturer,asset.manufacturedDate && '出厂 '+asset.manufacturedDate,assetStatus(asset.status),asset.notes].filter(Boolean).join(' · ') }}</p><span class="point-state" :class="assetState(asset).tone">{{ assetState(asset).label }}</span></div></el-tab-pane>
          </el-tabs>
          </template>
        </template>
      </div>
      <template v-if="showRecognitionFooter" #footer><div class="fire-photo-save-footer"><div><span>{{ recognitionMissingChecks.length ? '待确认 '+recognitionMissingChecks.length+' 项' : '结果已确认' }}</span><el-button text :disabled="recognitionBusy" @click="clearRecognition">取消本张</el-button></div><el-button type="primary" :loading="recognitionBusy" :disabled="!recognitionDraft.assetId || recognitionMissingChecks.length>0" @click="confirmRecognition">确认保存</el-button></div></template>
    </el-dialog>


</template>

<script setup>
import FirePreviewImage from './FirePreviewImage.vue'
import { computed, inject, toRefs } from 'vue'
import FirePhotoRecognition from './FirePhotoRecognition.vue'
import FireRecordEvidence from './FireRecordEvidence.vue'
import AppFireRecordEvidence from '../../app/AppFireRecordEvidence.vue'
import AppFireIssue from '../../app/AppFireIssue.vue'
const { recognitionResponse, recognitionContext, recognitionMissingChecks, recognitionDraft, recognitionBusy, confirmRecognition, clearRecognition, permissions, query, loading, selectedCycle, detailVisible, detail, detailLoading, detailError, activePointId, detailTab, busy, photoUrls, activeAssetId, targetAsset, displayedAssets, areaName, historyLimit, filteredRecords, visibleRecords, state, canInspect, canRecord, assetState, physicalAsset, assetTitle, assetStatus, issueStatus, issueAction, location, time, openPoint, detailClosed, showQr, openIssue, closeDetail, executionMode } = toRefs(inject('fireInspection'))
const showCompletedRecords=computed(()=>detailTab.value==='history' || targetAsset.value?.inspectionStatus==='checked' || (!activeAssetId.value && detail.value?.point && state.value(detail.value.point).checked))
const latestDeviceRecord=computed(()=>[...(filteredRecords.value||[])].sort((a,b)=>Number(b.id)-Number(a.id))[0])
const appResultLabel=computed(()=>detailTab.value==='issues'?'异常':showCompletedRecords.value?(latestDeviceRecord.value?latestDeviceRecord.value.result==='normal'?'正常':'异常':'已点检'):'未检')
const appResultTone=computed(()=>appResultLabel.value==='异常'?'fire-result-abnormal':appResultLabel.value==='正常'||appResultLabel.value==='已点检'?'checked':'pending')
async function requestClose(){await closeDetail.value(()=>{detailVisible.value=false})}
const showRecognitionFooter=computed(()=>executionMode.value && detailTab.value==='inspect' && recognitionResponse.value?.status==='awaiting_confirmation' && String(recognitionContext.value?.pointId||'')===String(activePointId.value) && (!activeAssetId.value || String(recognitionContext.value?.assetId||'')===String(activeAssetId.value)))
</script>
<style src="./fire-clarity.css"></style>

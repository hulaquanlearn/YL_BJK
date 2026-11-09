<template>
    <el-dialog v-model="qrVisible" :title="qrAsset?'一物一码 · 器材标签':'消防点位位置码'" class="fire-dialog" width="min(420px,94vw)" align-center><div class="fire-qr"><img v-if="qrData" :src="qrData" alt="消防二维码" /><strong>{{ qrAsset ? assetTitle(qrAsset) : qrPoint?.name }}</strong><span>{{ qrPoint?.areaName }} · {{ qrPoint ? location(qrPoint) || qrPoint.name : '' }}</span><p>{{ qrAsset ? '每件器材独立编码，扫码直接打开本件本期点检工单；已完成显示记录。' : '此码定位到点位，可查看同点位全部器材；器材实物请使用一物一码标签。' }}</p></div><template #footer><el-button @click="copyQrLink">复制链接</el-button><el-button type="primary" @click="downloadQr">下载二维码</el-button></template></el-dialog>
    <el-dialog v-model="issueVisible" :title="issueAction(issueForm.action)" class="fire-dialog fire-issue-action-dialog" width="min(640px,94vw)" align-center :close-on-click-modal="false" :close-on-press-escape="!issueBusy" :show-close="!issueBusy" :before-close="closeIssue"><el-input v-model="issueForm.remark" type="textarea" :rows="4" maxlength="2000" placeholder="请填写处理情况或复核意见" :disabled="issueBusy" /><div v-if="issueForm.action==='resolve'" class="issue-photo-form"><p>整改照片（至少 1 张）</p><el-button :disabled="issueBusy" @click="issueCamera?.open()">拍摄整改照片</el-button><FireCamera ref="issueCamera" :disabled="issueBusy" @capture="chooseIssuePhoto" /><div class="fire-photo-grid"><FirePreviewImage v-for="photo in issueForm.photos" :key="photo.id" class="history-photo" :src="photoUrls[photo.id]" :preview-src-list="[photoUrls[photo.id]].filter(Boolean)" fit="cover" /></div><p v-if="issuePendingFile" class="danger">{{ issuePendingFile.name }} 上传未成功，填写仍保留。<el-button :disabled="issueBusy" size="small" @click="uploadIssuePhoto">重试上传</el-button></p></div><el-alert v-if="issueError" :title="issueError" type="error" :closable="false" /><template #footer><el-button :disabled="issueBusy" @click="closeIssue()">取消</el-button><el-button type="primary" :loading="issueBusy" @click="saveIssue">保存处理记录</el-button></template></el-dialog>

</template>

<script setup>
import FirePreviewImage from './FirePreviewImage.vue'
import { inject, toRefs, ref } from 'vue'
import FireCamera from './FireCamera.vue'
const issueCamera=ref(null)

const { loading, photoUrls, areaName, qrVisible, qrData, qrPoint, qrAsset, issueVisible, issueBusy, issueError, issuePendingFile, issueForm, assetTitle, issueAction, location, copyQrLink, downloadQr, chooseIssuePhoto, uploadIssuePhoto, saveIssue, closeIssue } = toRefs(inject('fireInspection'))
</script>

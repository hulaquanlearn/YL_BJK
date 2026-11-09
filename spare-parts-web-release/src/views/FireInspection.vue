<template>
  <div class="fire-page" :class="{ 'fire-execution': executionMode }">
    <AppFireInspection v-if="executionMode" />
    <template v-else>
      <div class="fire-toolbar">
        <nav class="fire-view-nav" aria-label="消防功能"><button v-for="tab in webTabs" :key="tab.key" type="button" :aria-current="fire.webTab===tab.key?'page':undefined" :class="{active:fire.webTab===tab.key}" @click="fire.changeWebTab(tab.key)">{{ tab.label }}</button></nav>
        <div class="fire-period"><el-select v-model="fire.query.cycleId" aria-label="点检月份" placeholder="正在读取月份" :disabled="!fire.cycles.length" @change="fire.cycleChanged"><el-option v-for="cycle in fire.cycles" :key="cycle.id" :label="cycle.name" :value="cycle.id" /></el-select><el-button :loading="fire.loading || fire.dashboardLoading" @click="fire.reload">刷新</el-button></div>
      </div>
      <el-alert v-if="fire.pageError" :title="fire.pageError" type="error" :closable="false" show-icon />
      <FireOverview v-if="fire.webTab==='overview'" />
      <FireRecords v-else-if="fire.webTab==='records'" />
      <FireIssues v-else-if="fire.webTab==='issues'" />
      <FireLedger v-else-if="fire.webTab==='ledger'" />
      <FireParkModel v-else-if="fire.webTab==='park'" />
      <FireManagementDialogs v-if="fire.permissions.canManage" />
    </template>
    <FirePointDetail />
    <FireCommonDialogs />
    <el-dialog v-model="fire.recordVisible" title="点检记录" width="min(840px,96vw)" class="fire-dialog" align-center><FireRecordEvidence v-if="fire.recordPreview" :record="fire.recordPreview" /></el-dialog>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, provide, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { mobileWorkspaceEnabled } from '../utils/mobile-workspace.mjs'
import { useFireInspection } from '../utils/fire-inspection-controller.mjs'
import AppFireInspection from '../app/AppFireInspection.vue'
import FireOverview from '../components/fire/FireOverview.vue'
import FireRecords from '../components/fire/FireRecords.vue'
import FireIssues from '../components/fire/FireIssues.vue'
import FireLedger from '../components/fire/FireLedger.vue'
import FirePointDetail from '../components/fire/FirePointDetail.vue'
import FireManagementDialogs from '../components/fire/FireManagementDialogs.vue'
import FireCommonDialogs from '../components/fire/FireCommonDialogs.vue'
import FireRecordEvidence from '../components/fire/FireRecordEvidence.vue'
const FireParkModel=defineAsyncComponent(()=>import('../components/fire/FireParkModel.vue'))
const route=useRoute(),narrowMedia=window.matchMedia('(max-width: 760px)'),coarseMedia=window.matchMedia('(pointer: coarse)')
const narrow=ref(narrowMedia.matches),coarse=ref(coarseMedia.matches)
function resize(){narrow.value=narrowMedia.matches;coarse.value=coarseMedia.matches}
narrowMedia.addEventListener('change',resize);coarseMedia.addEventListener('change',resize)
onBeforeUnmount(()=>{narrowMedia.removeEventListener('change',resize);coarseMedia.removeEventListener('change',resize)})
const executionMode=computed(()=>mobileWorkspaceEnabled({userAgent:navigator.userAgent,narrow:narrow.value,coarse:coarse.value,embedded:route.query.mini==='1'}))
const fire=reactive(useFireInspection(executionMode))
provide('fireInspection',fire)
const webTabs=computed(()=>[{key:'overview',label:'本月点检'},{key:'ledger',label:'器材台账'},{key:'records',label:'点检记录'},{key:'issues',label:'异常整改'},{key:'park',label:'园区模型'}])
</script>
<style src="../components/fire/fire-inspection.css"></style>

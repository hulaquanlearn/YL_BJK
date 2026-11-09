<template>
  <div class="fire-mobile">
    <el-alert v-if="f.dashboardError" :title="'进度待刷新：'+f.dashboardError" type="warning" :closable="false"><el-button text @click="f.loadDashboard">刷新进度</el-button></el-alert>
    <el-alert v-if="f.pageError || listError" :title="f.pageError || listError" type="error" :closable="false" />
    <FirePhotoRecognition />
    <div class="mobile-list-heading"><h3 :title="f.selectedCycle?.name">{{ inspectionTitle }}</h3><el-button text :loading="f.loading" aria-label="刷新点检进度" @click="f.reload"><el-icon><Refresh /></el-icon>刷新</el-button></div>
    <div class="mobile-section-filter"><FireSectionFilter /></div>
    <template v-if="f.query.cycleId">
      <div class="mobile-status-tabs" role="group" aria-label="点检设备状态"><button type="button" :class="{active:f.query.status==='pending'}" @click="f.setStatus('pending')">未点检 <span class="pending-text">{{ pendingCount }}</span></button><button type="button" :class="{active:f.query.status==='checked'}" @click="f.setStatus('checked')">已点检 <span class="checked-text">{{ checkedCount }}</span></button><button type="button" :class="{active:f.query.status==='abnormal'}" @click="f.setStatus('abnormal')">异常整改 <span>{{ f.issuesError || f.issuesLoading ? '—' : (f.issueTotal ?? '—') }}</span></button></div>
      <form v-if="f.query.status!=='abnormal'" class="mobile-search" @submit.prevent="f.loadPoints"><el-input v-model="f.query.q" placeholder="搜索器材编码或位置" aria-label="查找点检设备" clearable /><el-button native-type="submit">查询</el-button></form>
      <div v-loading="f.query.status==='abnormal'?f.issuesLoading:f.loading" class="mobile-asset-list">
        <template v-if="f.query.status==='abnormal'"><AppFireIssueCard v-for="issue in f.issueRows" :key="issue.id" :issue="issue" @open="assetId=>f.openPoint(issue.pointId,'issues',assetId)" /><el-empty v-if="!f.issuesLoading&&!listError&&!f.pageError&&!f.issueRows.length" description="暂无异常记录" /></template>
        <template v-else><button v-for="entry in pageEntries" :key="entry.asset.id" type="button" :aria-label="(entry.asset.code||entry.asset.name)+' · '+f.typeName(entry.asset.type)+' · '+(entry.asset.inspectionStatus==='checked'?'已点检':'未点检')" class="app-fire-asset" @click="f.openPoint(entry.point.id,undefined,entry.asset.id)"><div><header><strong>{{entry.asset.code || entry.asset.name || '未编业务号'}}</strong><span class="point-state" :class="entry.asset.inspectionStatus==='checked'?'checked':'pending'">{{entry.asset.inspectionStatus==='checked'?'已点检':'未点检'}}</span></header><span>{{f.typeName(entry.asset.type)}}<template v-if="entry.asset.lastCheckedAt && f.query.status==='checked'"> · {{f.time(entry.asset.lastCheckedAt)}}</template></span><p>{{entry.point.sectionName || '未分工段'}} · {{entry.point.areaName}} · {{f.location(entry.point)||entry.point.name}}</p></div><el-icon><ArrowRight/></el-icon></button><el-empty v-if="!f.loading&&!listError&&!f.pageError&&!entries.length" :description="f.query.status==='checked'?'暂无已点检记录':'当前没有未点检设备'" /></template>
      </div>
      <div class="pagination-bar"><el-pagination v-if="entries.length>24 && f.query.status!=='abnormal'" v-model:current-page="page" :page-size="24" :total="entries.length" layout="prev, pager, next" :pager-count="5" /><el-pagination v-if="f.query.status==='abnormal'&&f.issueTotal>f.issueQuery.pageSize" v-model:current-page="f.issueQuery.page" :page-size="f.issueQuery.pageSize" :total="f.issueTotal" layout="prev, pager, next" :pager-count="5" @current-change="f.loadIssues()" /></div>
    </template>
  </div>
</template>
<script setup>
import { computed, inject, ref, watch } from 'vue'
import { fireMobileAssets, firePage } from '../utils/fire-inspection.mjs'
import FireSectionFilter from '../components/fire/FireSectionFilter.vue'
import FirePhotoRecognition from '../components/fire/FirePhotoRecognition.vue'
import AppFireIssueCard from './AppFireIssueCard.vue'
const f=inject('fireInspection'),page=ref(1)
const listError=computed(()=>f.query.status==='abnormal'?f.issuesError:f.listError)
const inspectionTitle=computed(()=>!f.selectedCycle?.inspectionMonth||f.selectedCycle.inspectionMonth===f.photoRecognition.periodMonth?`${f.photoRecognition.periodMonth?.slice(0,4)||''}年${Number(f.photoRecognition.periodMonth?.slice(5))||''}月点检`:`${f.selectedCycle.name||f.selectedCycle.inspectionMonth}设备`)
const entries=computed(()=>fireMobileAssets(f.points,f.query.status)),pageEntries=computed(()=>firePage(entries.value,page.value,24))
const pendingCount=computed(()=>fireMobileAssets(f.points,'pending').length),checkedCount=computed(()=>fireMobileAssets(f.points,'checked').length)
watch(()=>[f.query.status,f.query.sectionName,f.points],()=>{page.value=1})
</script>

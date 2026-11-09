<template>
  <section class="panel fire-section" v-loading="f.dashboardLoading || f.loading">
    <el-alert v-if="f.dashboardError || f.listError" :title="f.dashboardError || f.listError" type="error" :closable="false" />
    <div class="fire-filter-row fire-overview-toolbar"><FireSectionFilter /><el-select v-model="area" clearable placeholder="全部区域" aria-label="点检区域"><el-option v-for="a in f.areas" :key="a.id" :value="a.id" :label="a.name" /></el-select><el-select v-model="status" clearable placeholder="全部状态" aria-label="点检状态"><el-option value="pending" label="未点检" /><el-option value="checked" label="已点检" /></el-select><el-input v-model="keyword" clearable placeholder="器材编码或位置" aria-label="搜索点检器材" /><div class="fire-month-counts" v-if="f.dashboard?.overall"><span>本月 {{ f.dashboard.overall.totalAssets }} 件</span><strong class="checked-text">已点检 {{ f.dashboard.overall.checkedAssets }}</strong><strong class="pending-text">未点检 {{ f.dashboard.overall.pendingAssets }}</strong><el-button v-if="f.dashboard.overall.openIssues" text @click="f.changeWebTab('issues')">异常 {{ f.dashboard.overall.openIssues }}</el-button></div></div>
    <div v-if="!f.loading && !f.dashboardLoading && !f.dashboard?.overall?.totalAssets && !f.dashboardError" class="fire-empty-ledger"><h3>{{ f.query.sectionName ? '该工段暂无可点检器材' : '暂无可点检器材' }}</h3><p>录入器材编码和位置，确认实物后即可在App拍照点检。</p><el-button v-if="f.permissions.canManage" type="primary" @click="f.changeWebTab('ledger')">录入器材</el-button></div>
    <template v-else>
      <el-table :data="visible" class="fire-overview-table" empty-text="没有符合条件的器材">
        <el-table-column label="器材" width="88"><template #default="{row}">{{ f.typeName(row.asset.type) }}</template></el-table-column>
        <el-table-column label="编码" width="100"><template #default="{row}"><strong>{{ row.asset.code || '未编业务号' }}</strong></template></el-table-column>
        <el-table-column label="工段" width="125"><template #default="{row}">{{ row.point.sectionName || '未分工段' }}</template></el-table-column><el-table-column label="位置" min-width="280" class-name="fire-location-column"><template #default="{row}">{{ row.point.areaName }} · {{ f.location(row.point) || row.point.name }}</template></el-table-column>
        <el-table-column label="点检状态" width="96"><template #default="{row}"><span class="point-state" :class="row.asset.inspectionStatus==='checked'?'checked':'pending'">{{ row.asset.inspectionStatus==='checked'?'已点检':'未点检' }}</span></template></el-table-column>
        <el-table-column label="点检人" width="160"><template #default="{row}">{{ row.asset.lastCheckedBy || '—' }}</template></el-table-column>
        <el-table-column label="点检时间" width="180"><template #default="{row}">{{ row.asset.lastCheckedAt?f.time(row.asset.lastCheckedAt):'—' }}</template></el-table-column>
        <el-table-column label="记录" width="110" fixed="right"><template #default="{row}"><el-button link type="primary" @click="f.openPoint(row.point.id,row.asset.inspectionStatus==='checked'?'history':'assets',row.asset.id)">{{ row.asset.inspectionStatus==='checked'?'查看照片':'查看器材' }}</el-button></template></el-table-column>
      </el-table>
      <div class="pagination-bar"><span class="fire-note">{{ rows.length }} 件</span><el-pagination v-if="rows.length>30" v-model:current-page="page" :page-size="30" :total="rows.length" layout="prev, pager, next" /></div>
    </template>
  </section>
</template>
<script setup>
import FireSectionFilter from './FireSectionFilter.vue'
import { computed, inject, ref, watch } from 'vue'
import { fireSearchEntries } from '../../utils/fire-inspection.mjs'
const f=inject('fireInspection'),area=ref(''),status=ref(''),keyword=ref(''),page=ref(1)
const rows=computed(()=>fireSearchEntries(f.points.filter(point=>!area.value||String(point.areaId)===String(area.value)),keyword.value).filter(row=>!status.value||row.asset.inspectionStatus===status.value))
const visible=computed(()=>rows.value.slice((page.value-1)*30,page.value*30))
watch(()=>[area.value,status.value,keyword.value,f.query.sectionName],()=>{page.value=1})
</script>

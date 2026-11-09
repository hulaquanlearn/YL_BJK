<template>
  <section class="panel fire-section" v-loading="f.issuesLoading">
    <form class="fire-filter-row" @submit.prevent="f.loadIssues(true)"><FireSectionFilter /><el-select v-model="f.issueQuery.areaId" clearable placeholder="全部区域" aria-label="异常区域"><el-option v-for="a in f.areas" :key="a.id" :label="a.name" :value="a.id" /></el-select><el-select v-model="f.issueQuery.status" aria-label="整改状态"><el-option label="未关闭（跨周期）" value="pending" /><el-option label="全部状态" value="all" /><el-option label="待整改" value="open" /><el-option label="待复核" value="resolved" /><el-option label="已关闭" value="closed" /></el-select><el-input v-model="f.issueQuery.q" placeholder="搜索器材编码或异常内容" aria-label="搜索异常" clearable /><el-button native-type="submit">查询</el-button></form>
    <el-alert v-if="f.issuesError" :title="f.issuesError" type="error" :closable="false" />
    <el-table :data="f.issueRows" empty-text="当前条件暂无异常记录"><el-table-column label="器材 / 位置" min-width="220"><template #default="{row}"><strong>{{ row.assets?.map(a=>a.code || a.name).filter(Boolean).join('、') || row.pointSnapshot?.code }}</strong><small class="table-secondary">{{ row.pointSnapshot?.sectionName || '未分工段' }} · {{ row.pointSnapshot?.areaName }} · {{ row.pointSnapshot?.location || row.pointSnapshot?.name }}</small></template></el-table-column><el-table-column prop="remark" label="异常情况" min-width="240" /><el-table-column label="状态" width="110"><template #default="{row}"><el-tag :type="row.status==='closed'?'success':row.status==='resolved'?'warning':'danger'">{{ f.issueStatus(row.status) }}</el-tag></template></el-table-column><el-table-column label="发现时间" min-width="185"><template #default="{row}">{{ f.time(row.createdAt) }}</template></el-table-column><el-table-column label="处理" width="120" fixed="right"><template #default="{row}"><el-button link type="primary" @click="f.openPoint(row.pointId,'issues')">查看与处理</el-button></template></el-table-column></el-table>
    <div v-if="f.issueTotal>f.issueQuery.pageSize" class="pagination-bar"><el-pagination v-model:current-page="f.issueQuery.page" :page-size="f.issueQuery.pageSize" :total="f.issueTotal" layout="total, prev, pager, next" @current-change="f.loadIssues()" /></div>
  </section>
</template>
<script setup>
import FireSectionFilter from './FireSectionFilter.vue'
import { inject } from 'vue'
const f=inject('fireInspection')
</script>

<template><table class="production-table"><caption>生产异常跟踪表</caption><tbody>
<tr><th>开机时间</th><td>{{report.startTime||'—'}}</td><th>结束时间</th><td>{{report.endTime||'—'}}</td></tr>
<tr><th>AGV 数量</th><td>{{report.agvCount||'—'}}</td><th>下线车号</th><td>{{report.vehicleNo||'—'}}</td></tr>
<tr><th>维修进度</th><td colspan="3">{{report.repairProgress||'—'}}</td></tr>
<tr class="analysis-heading"><th colspan="4">问题分析(设备/人员/其他)</th></tr>
<template v-for="(issue,i) in report.issues" :key="i"><tr><th>{{issue.category}}</th><td colspan="3">{{issue.description}}</td></tr><tr><th>耽误总时长</th><td colspan="3">{{issue.delay||'—'}}</td></tr></template>
<tr><th colspan="4">改进措施</th></tr><tr><td colspan="4"><ol><li v-for="(measure,i) in report.measures" :key="i">{{measure}}</li></ol></td></tr>
</tbody></table></template>
<script setup>defineProps({report:{type:Object,required:true}})</script>
<style scoped>.production-table{border-collapse:collapse;width:100%;font-size:14px;background:white;table-layout:fixed}.production-table caption{font-weight:700;padding:12px;border:1px solid #cbd3df;border-bottom:0}.production-table th,.production-table td{border:1px solid #cbd3df;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left}.production-table th{background:#f7f8fa;font-weight:500}.production-table ol{margin:0;padding-left:20px}.production-table li+li{margin-top:8px}</style>

<style scoped>.production-table th[colspan="4"],.production-table .analysis-heading th{text-align:center;font-weight:600}</style>

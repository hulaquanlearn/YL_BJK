<template>
  <div v-if="audit?.pendingCalendar" class="deduction-audit">请先确认本周休息日，再核对漏报扣分。</div>
  <details v-else-if="audit?.events?.length" class="deduction-audit" open>
    <summary>扣分依据 · 本项基础分最多 {{audit.scoreLimit}} 分</summary>
    <p>漏报、异常或未完成一次即扣完本项基础分，不影响其他事项。闭环加分仍单独确认。</p>
    <ol>
      <li v-for="(event,index) in audit.events" :key="`${event.date}-${event.type}-${index}`">
        <b>{{event.date}}</b> · {{event.label}}<span v-if="event.recordIds?.length"> · 记录 {{event.recordIds.join('、')}}</span>
      </li>
    </ol>
    <small>本项累计扣 {{audit.deduction}} 分，基础分最低 0 分。</small>
  </details>
</template>
<script setup>
defineProps({audit:Object})
</script>
<style scoped>
.deduction-audit{margin:12px 0;padding:12px 14px;border:1px solid #f0c9cd;border-radius:8px;background:#fff4f4;color:#87333f;font-size:14px;line-height:1.7;overflow-wrap:anywhere}
summary{cursor:pointer;font-weight:600}p{margin:8px 0}ol{margin:8px 0;padding-left:22px}small{font-size:13px;color:#87333f}
</style>

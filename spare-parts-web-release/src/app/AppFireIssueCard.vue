<template>
 <button type="button" class="app-fire-issue-card" :aria-label="identity+' · '+f.issueStatus(issue.status)+' · '+problem+' · 上报人：'+reporter" @click="$emit('open',issue.assets?.length===1?issue.assets[0].id:'')">
  <header><strong>{{ identity }}</strong><span :class="issue.status">{{ f.issueStatus(issue.status) }}</span></header>
  <p class="app-fire-issue-problem"><span>异常</span><strong>{{ problem }}</strong></p>
  <p class="app-fire-issue-location"><el-icon><Location /></el-icon><span>{{ location }}</span></p>
  <img v-if="cover && f.photoUrls[cover.id]" class="app-fire-issue-photo" :src="f.photoUrls[cover.id]" :alt="photoLabel" />
  <small v-else>{{ cover ? photoLabel+' · 点击查看详情' : '暂无'+photoLabel }}</small>
  <footer><span>上报人 {{ reporter }}</span><time>{{ f.time(issue.createdAt) }}</time></footer>
 </button>
</template>
<script setup>
import {computed,inject,watch} from 'vue'
import {fireIssueOriginalPhotos,fireIssueProblem} from '../utils/fire-issue-problem.mjs'
const props=defineProps({issue:{type:Object,required:true}}),f=inject('fireInspection')
defineEmits(['open'])
const identity=computed(()=>props.issue.assets?.length?props.issue.assets.map(a=>[f.typeName(a.type),a.code||'编号未记录'].filter(Boolean).join(' ')).join('、'):'异常器材')
const reporter=computed(()=>props.issue.actorName || props.issue.events?.[0]?.actorName || '未记录')
const problem=computed(()=>fireIssueProblem(props.issue.remark))
const photoLabel=computed(()=>props.issue.source==='ai_photo'?'消防检查卡':'异常现场照片')
const cover=computed(()=>fireIssueOriginalPhotos(props.issue)[0])
watch(cover,photo=>f.loadPhoto(photo,true),{immediate:true})
const location=computed(()=>{
 const point=props.issue.pointSnapshot
 return [...new Set([point?.sectionName,point?.areaName,point?.location || point?.name].filter(Boolean))].join(' · ') || '位置未记录'
})
</script>
<style scoped>
.app-fire-issue-card{display:grid;gap:8px;width:100%;min-width:0;box-sizing:border-box;text-align:left;font:inherit;color:#334b5e;background:#fff;border:1px solid #e0e7ee;border-radius:12px;padding:12px 14px;cursor:pointer}
.app-fire-issue-card>header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.app-fire-issue-card>header>strong{font-size:15px;line-height:1.4;font-weight:700;color:#244156;overflow-wrap:anywhere}
.app-fire-issue-card>header>span{font-size:11px;white-space:nowrap;padding:3px 6px;border-radius:5px;color:#a26d22;background:#fff4e2;line-height:1.5;flex:none}
.app-fire-issue-card>header>span.resolved{color:#557e9d;background:#edf5fb}
.app-fire-issue-card>header>span.closed{color:#3d805c;background:#e9f5ed}
.app-fire-issue-card .app-fire-issue-problem{display:flex;align-items:baseline;gap:8px;margin:0;font-size:13px;line-height:1.5;color:#344f63}
.app-fire-issue-problem>span{flex:none;color:#a33148;font-size:12px}
.app-fire-issue-problem>strong{font-weight:600;overflow-wrap:anywhere}
.app-fire-issue-card .app-fire-issue-location{display:flex;align-items:flex-start;gap:5px;margin:0;font-size:12px;line-height:1.5;color:#607687;overflow-wrap:anywhere}
.app-fire-issue-location>.el-icon{flex:none;margin-top:2px}
.app-fire-issue-photo{width:96px;height:72px;object-fit:cover;border-radius:6px}
.app-fire-issue-card>footer{display:flex;align-items:center;gap:4px 8px;flex-wrap:wrap;padding-top:7px;border-top:1px solid #edf1f5;font-size:11px;color:#607687;line-height:1.5}
.app-fire-issue-card>footer time{margin-left:auto;font-variant-numeric:tabular-nums}
.app-fire-issue-card:focus-visible{outline:2px solid #ac314a;outline-offset:2px}
</style>

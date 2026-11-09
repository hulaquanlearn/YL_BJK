<template>
 <article class="app-fire-issue">
  <header><div class="app-issue-problem"><span>异常项</span><strong>{{ problem }}</strong></div><span class="app-issue-status" :class="issue.status">{{ f.issueStatus(issue.status) }}</span></header>
  <dl><div v-if="reporter"><dt>发现人</dt><dd>{{ reporter }}</dd></div><div><dt>发现时间</dt><dd>{{ f.time(issue.createdAt) }}</dd></div></dl>
  <div v-if="originalPhotos.length" class="fire-photo-grid"><FirePreviewImage v-for="photo in originalPhotos" :key="photo.id" :src="f.photoUrls[photo.id]" :preview-src-list="originalPhotos.map(p=>f.photoUrls[p.id]).filter(Boolean)" fit="cover" /></div>
  <ol v-if="events.length" class="app-issue-timeline"><li v-for="event in events" :key="event.id"><div><strong>{{ f.issueAction(event.action) }}</strong><span>{{ event.actorName }}</span></div><time>{{ f.time(event.createdAt) }}</time><p v-if="event.remark">{{ event.remark }}</p><div v-if="event.photos?.length" class="fire-photo-grid"><FirePreviewImage v-for="photo in event.photos" :key="photo.id" :src="f.photoUrls[photo.id]" :preview-src-list="event.photos.map(p=>f.photoUrls[p.id]).filter(Boolean)" fit="cover" /></div></li></ol>
  <footer v-if="f.canInspect(f.detail?.point)"><el-button v-if="issue.status==='open'" type="primary" :disabled="f.issueBusy" @click="f.openIssue(issue,'resolve')">登记整改</el-button><template v-if="f.permissions.canManage"><el-button v-if="issue.status==='resolved'" type="success" :disabled="f.issueBusy" @click="f.openIssue(issue,'close')">复核关闭</el-button><el-button v-if="issue.status!=='open'" plain :disabled="f.issueBusy" @click="f.openIssue(issue,'reopen')">重新打开</el-button></template></footer>
 </article>
</template>
<script setup>
import FirePreviewImage from '../components/fire/FirePreviewImage.vue'
import {computed,inject} from 'vue'
import {fireIssueProblem} from '../utils/fire-issue-problem.mjs'
const props=defineProps({issue:{type:Object,required:true}}),f=inject('fireInspection')
const problem=computed(()=>fireIssueProblem(props.issue.remark))
const reporter=computed(()=>props.issue.events?.[0]?.actorName || props.issue.actorName || '')
const events=computed(()=>(props.issue.events||[]).filter((event,index)=>index!==0||!['created','opened'].includes(event.action)||event.remark&&event.remark!==props.issue.remark))
const originalPhotos=computed(()=>{const ids=new Set(events.value.flatMap(event=>(event.photos||[]).map(p=>p.id)));return (props.issue.photos||[]).filter(p=>!ids.has(p.id))})
</script>
<style scoped>
.app-fire-issue{border:1px solid #e3e9ef;border-radius:12px;padding:14px;margin:0 0 12px;color:#2e4558}.app-fire-issue>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.app-issue-problem{display:grid;gap:3px;min-width:0}.app-issue-problem>span{font-size:12px;color:#8b99a5}.app-issue-problem>strong{font-size:15px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.app-issue-status{flex:none;font-size:11px;padding:4px 7px;line-height:1.5;border-radius:5px;white-space:nowrap;background:#fff3df;color:#a36b20}.app-issue-status.resolved{background:#eaf3fb;color:#42719b}.app-issue-status.closed{background:#e9f5ed;color:#3d805c}.app-fire-issue dl{display:grid;gap:8px;margin:14px 0 0;font-size:12px;line-height:1.6}.app-fire-issue dl>div{display:grid;grid-template-columns:62px minmax(0,1fr);gap:6px}.app-fire-issue dt{color:#8b99a5}.app-fire-issue dd{margin:0;overflow-wrap:anywhere;color:#63798b}.app-fire-issue :deep(.fire-photo-grid){gap:8px;margin-top:12px}.app-fire-issue :deep(.el-image){width:88px;height:72px;border-radius:8px}.app-issue-timeline{list-style:none;margin:16px 0 0;padding:0 0 0 12px;border-left:2px solid #e6ecf1}.app-issue-timeline>li{padding:0 0 12px 4px}.app-issue-timeline>li:last-child{padding-bottom:0}.app-issue-timeline>li>div:first-child{display:flex;align-items:center;gap:9px;font-size:12px}.app-issue-timeline strong{font-weight:600;color:#3f596d}.app-issue-timeline span,.app-issue-timeline time{color:#8a99a5;font-size:11px}.app-issue-timeline time{display:block;margin:5px 0}.app-fire-issue .app-issue-timeline p{font-size:13px;line-height:1.6;margin:6px 0;color:#60778a}.app-fire-issue>footer{display:flex;gap:8px;border-top:1px solid #edf0f4;padding-top:12px;margin-top:14px}.app-fire-issue>footer>.el-button{margin:0;min-height:42px;flex:1;font-size:13px;border-radius:8px}
</style>

<template>
 <div class="robot-program">
  <section v-if="canManage && (!agentStatus.enabled || connectionResult?.ready===false)" class="panel connection-status"><div><strong>{{ connectionResult?.ready?'模型通道已连接':agentStatus.enabled?'模型通道已配置':'机器人分析未连接' }}</strong><p role="status">{{connectionResult?.message || agentStatus.message || '正在读取连接状态…'}}</p><ul v-if="agentStatus.issues?.length"><li v-for="issue in agentStatus.issues" :key="issue.code">{{issue.message}}<code>{{issue.setting}}</code></li></ul><small v-if="!agentStatus.enabled">由服务器管理员配置DeepSeek 通道并重启 API 后，点击重新检查连接。</small></div><el-button :loading="checkingConnection" :disabled="busy && !checkingConnection" @click="refreshConnection">重新检查连接</el-button></section>
  <AppRobotToolbar v-if="appSurface" :project-id="projectId" :library="library" :busy="busy" :can-manage="canManage" :has-analysis="Boolean(analysis)" @select="openProject" @refresh="refreshLibrary" @import="backupInput?.click()" @rename="renameBackup(currentBackup)" @export="download"/>
  <section v-if="!appSurface" class="panel backup-library">

   <div class="backup-library-left"><div class="backup-cards"><article v-for="item in library" :key="item.id" :class="{selected:projectId===item.id}"><button class="backup-select" type="button" :aria-pressed="projectId===item.id" @click="openProject(item.id)"><strong>{{item.displayName || item.filename}}</strong><span>{{item.annotationCount}} 处注释</span><small>{{new Date(item.updatedAt).toLocaleString()}}</small></button><el-button v-if="canManage" class="backup-edit" link size="small" :aria-label="`重命名备份 ${item.displayName || item.filename}`" @click="renameBackup(item)">重命名</el-button></article></div></div>
   <div class="backup-library-actions"><RouterLink v-if="projectId" class="robot-model-preview" :to="{path:'/agv-vehicles',query:{family:'abb',backup:projectId,program:'1',routine:route.query.routine||previewRoutine}}">模型预演</RouterLink><el-button text aria-label="刷新备份" title="刷新备份" @click="refreshLibrary"><el-icon><Refresh /></el-icon></el-button><input v-if="canManage" ref="backupInput" class="backup-input" type="file" accept=".zip" aria-label="选择 ABB 备份 ZIP" @change="importBackup"/><el-button v-if="canManage" type="primary" :loading="reading" @click="backupInput?.click()">导入备份</el-button><el-button :disabled="busy || !analysis" :loading="exporting" @click="download">导出注释</el-button></div>
   <p v-if="!library.length">{{canManage?'导入 ABB 备份 ZIP 开始分析。':'尚无备份，请联系系统管理员导入。'}}</p>
  </section>
  <input v-if="appSurface&&canManage" ref="backupInput" class="backup-input" type="file" accept=".zip" aria-label="选择 ABB 备份 ZIP" @change="importBackup"/>
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
  <p v-if="localNotice" class="local-notice" role="status">{{localNotice}}</p>
  <template v-if="report">
   <nav class="business-mobile-only mobile-reader-switch" aria-label="程序工作区"><button type="button" :aria-pressed="mobilePane==='source'" @click="showMobilePane('source')">读程序<span>{{selectedFile?.name}}</span></button><button type="button" :aria-pressed="mobilePane==='assistant'" @click="showMobilePane('assistant')">逻辑助手<span>{{busy?'正在处理':'总览 · 解读 · 问答'}}</span></button></nav>
   <div class="robot-workspace" :data-mobile-pane="mobilePane" :class="{'assistant-hidden':assistantHidden}">
    <aside v-if="fileTreeVisible" class="panel file-list"><h3>程序与配置</h3><div v-for="group in fileGroups" :key="group.name"><h4>{{ group.name }}</h4><button v-for="file in group.files" :key="file.id" :class="{selected:file.id===selectedId}" @click="selectSource(file.id)"><span>{{ file.name }}</span><small>{{ file.readable ? file.routines.length+' 个例程' : '不可读' }}</small></button></div></aside>
    <Teleport to="body" :disabled="!sourceExpanded">
    <section ref="sourcePanel" class="panel source-panel" :class="{'robot-reader-fullscreen':sourceExpanded}" :role="sourceExpanded?'dialog':undefined" :aria-modal="sourceExpanded?'true':undefined" :aria-label="sourceExpanded?'程序源码展开阅读':undefined" :tabindex="sourceExpanded?-1:undefined">
     <div class="reader-controls"><nav class="reader-tabs" aria-label="程序查看方式"><button v-for="t in readerTabs" :key="t.key" :class="{active:readerTab===t.key}" @click="readerTab=t.key">{{t.label}}</button><button v-if="!sourceExpanded" class="assistant-toggle" @click="assistantHidden=!assistantHidden">{{assistantHidden?'展开智能体':'收起智能体'}}</button></nav><el-select v-if="showCompactFilePicker" v-model="selectedId" class="compact-file-picker" size="small" aria-label="选择程序或配置文件" @change="focusRange=null"><el-option v-for="file in orderedFiles" :key="file.id" :label="(file.task || '配置')+' / '+file.name+(file.readable?'':'（不可读）')" :value="file.id" /></el-select><el-button v-if="sourceExpanded" class="reader-focus-action" size="small" @click="setReaderFocus('')">收起 <span class="reader-escape">Esc</span></el-button><el-button v-else-if="!selectedFile?.readable || readerTab==='routines'" class="reader-focus-action" size="small" @click="setReaderFocus('source')">展开阅读</el-button></div>
     <div v-if="!selectedFile?.readable && readerTab!=='routines'" class="empty-source"><h3>此模块不能作为文本读取</h3><p>{{ selectedFile?.reason }}</p><p>其他模块可继续分析。导出包中保留此模块的原始字节。</p></div>
     <RobotSourceReader v-else-if="readerTab==='code'||readerTab==='original'" ref="sourceReader" :file="selectedFile" :notes="readerTab==='code'?(analysis?.annotations||[]):[]" :only-notes="readerTab==='code' && onlyNotes" :highlight="focusRange"><template #quick-actions><el-button v-if="appSurface&&!sourceExpanded" size="small" @click="setReaderFocus('source')">全屏</el-button></template><template #actions><template v-if="readerTab==='code' && coverage.lines>0"><label class="source-annotation-filter" title="仅显示带AI注释的代码行"><input v-model="onlyNotes" type="checkbox"/> 只看注释行</label><el-button class="source-annotation-action" size="small" @click="nextNote">下一条注释</el-button><el-button v-if="canManage && coverage.routines<coverage.totalRoutines" class="source-annotation-action" size="small" title="补充尚无注释的例程" @click="generateBatches(missingRoutineBatches(selectedFile,analysis?.annotations))">补充注释</el-button></template><el-button v-if="!sourceExpanded&&!appSurface" size="small" icon="FullScreen" :aria-expanded="false" @click="setReaderFocus('source')">展开</el-button></template></RobotSourceReader>
     <div v-else ref="callTreeViewport" class="source-scroll call-tree-scroll"><RobotCallTree :files="report.files" :selected-file-id="selectedId" :annotations="analysis?.annotations||[]" :overview="programOverview" :analysis="analysis" :reports="batchReports" :source-hash="report.sha256" @locate="jump" /></div>
    </section>
    </Teleport>
    <Teleport to="body" :disabled="!assistantExpanded">
    <section v-show="!assistantHidden" ref="assistantPanel" class="panel assistant-panel" :class="{'robot-reader-fullscreen':assistantExpanded}" :aria-busy="busy" :role="assistantExpanded?'dialog':undefined" :aria-modal="assistantExpanded?'true':undefined" :aria-label="assistantExpanded?'程序逻辑助手展开阅读':undefined" :tabindex="assistantExpanded?-1:undefined">
     <AiModelInfo feature="robot"/><header class="agent-heading"><div class="agent-identity"><el-icon class="agent-emblem"><Cpu /></el-icon><div><h3>程序逻辑助手</h3><p>先看整体，再读代码，最后追问</p></div></div><div class="agent-heading-actions"><span class="agent-state" :class="{running:busy}">{{busy?'处理中':agentStatus.enabled?'已就绪':'未连接'}}</span><el-button size="small" :aria-expanded="assistantExpanded" @click="setReaderFocus(assistantExpanded?'':'assistant')">{{assistantExpanded?'收起':'展开阅读'}}<span v-if="assistantExpanded" class="reader-escape">Esc</span></el-button></div></header>
     <nav class="assistant-tabs" aria-label="智能体查看方式"><button :class="{active:assistantTab==='overview'}" @click="assistantTab='overview'">整套程序</button><button :class="{active:assistantTab==='code'}" @click="assistantTab='code'">当前代码</button><button :class="{active:assistantTab==='chat'}" @click="assistantTab='chat'">问AI</button></nav>
     <section v-show="!assistantExpanded" class="batch-progress"><div class="task-heading"><h4>中文注释 <small>{{completedCount}} / {{batches.length}} 批 · {{analysis?.annotations.length||0}} 处</small></h4><span>{{batchPercent}}%</span></div><el-progress :percentage="batchPercent" :show-text="false" :stroke-width="4" color="#0f8c91"/><p class="task-current" role="status">{{batchRunning?batchLabel:failedCount?failedCount+' 批失败，可在明细查看原因':completedCount===batches.length?'可读程序注释已生成':'逐行注释与整套程序逻辑分开保存'}}</p><div v-if="canManage && (completedCount<batches.length || batchRunning)" class="agent-actions"><el-button v-if="!batchRunning" type="primary" @click="generateBatches">{{completedCount?'继续生成':'生成中文注释'}}</el-button><el-button v-else @click="stopBatch=true">{{stopBatch?'本批完成后暂停中':'本批完成后暂停'}}</el-button></div><details class="task-details"><summary>批次明细</summary><div class="module-progress-list"><details v-for="file in orderedFiles.filter(f=>f.kind==='program')" :key="file.id" class="batch-module"><summary><b>{{file.name}}</b><small>{{file.readable?coverageFor(file).lines+' 处注释':'不可读'}}</small></summary><p v-for="batch in batches.filter(b=>b.fileId===file.id)" :key="batch.key" class="batch-item" :class="batchState[batch.key]?.status||'pending'"><span>{{batch.startLine}}–{{batch.endLine}} 行</span><span>{{batchState[batch.key]?.status==='done'?'已生成':batchState[batch.key]?.status==='failed'?'失败，可重试':'待生成'}}</span><small v-if="batchState[batch.key]?.error">{{batchState[batch.key].error}}</small></p></details></div></details></section>
     <div ref="assistantBody" class="assistant-body" tabindex="0" aria-label="程序逻辑助手内容">
      <section v-if="assistantTab==='overview'" class="overview-pane"><div class="pane-heading"><div><h3>整套程序逻辑</h3><p>用途 → 主流程 → 功能实现 → 模块配合</p></div><el-button size="small" :disabled="busy || !canInteract" :loading="overviewRunning" @click="generateOverview">{{programOverview?'更新总览':'生成总览'}}</el-button></div><RobotAnalysisView v-if="programOverview" :result="programOverview" overview :file-name="sourceName" @reference="jump"/><template v-else><p class="overview-intro">逐行注释不等于整套程序说明。点击“生成总览”，结合各模块入口、调用和实际源码，按执行顺序解释功能如何实现。</p><div class="structure-metrics"><span><b>{{report.statistics?.readableModules||orderedFiles.filter(f=>f.readable&&f.kind==='program').length}}</b>可读模块</span><span><b>{{report.statistics?.routines||0}}</b>程序例程</span><span><b>{{report.statistics?.signals||0}}</b>I/O信号</span></div><h4>已识别的主入口</h4><p v-if="!entryPoints.length" class="connection-note">未识别main入口，需结合系统事件配置和调用关系核对。</p><button v-for="entry in entryPoints" :key="entry.fileId+':'+entry.line" class="entry-link" @click="jump({fileId:entry.fileId,startLine:entry.line,endLine:entry.line})"><span>{{sourceName(entry.fileId)}}</span><b>{{entry.name}}()</b><small>第 {{entry.line}} 行 · {{entry.calls}} 处调用</small></button></template><p v-if="programOverview?.coverage" class="coverage-note">总览依据 {{programOverview.coverage.providedLines}} / {{programOverview.coverage.totalReadableLines}} 行源码正文和模块结构索引；未提供的实现仍需核对。</p></section>
      <section v-else-if="assistantTab==='code'" class="code-review-pane"><div class="pane-heading"><div><h3>{{selectedFile?.name}}</h3><p>{{coverage.lines}} 条行内注释 · {{coverage.routines}} / {{coverage.totalRoutines}} 个例程含注释</p></div></div><p v-if="currentCodeReview?.target" class="range-label">批次解读 · {{currentCodeReview.target.startLine}}–{{currentCodeReview.target.endLine}} 行</p><RobotAnalysisView v-if="currentCodeReview" :result="currentCodeReview" :file-name="sourceName" @reference="jump"/><p v-else class="overview-intro">当前文件尚无独立批次解读。已生成的注释可在左侧源码中逐行查看；整套功能请看“整套程序”。</p></section>
      <section v-else class="chat-pane"><div class="pane-heading"><div><h3>结合程序继续问</h3><p>当前备份的独立对话，保留追问上下文</p></div><el-button size="small" :disabled="busy || !canInteract || newConversation" @click="startNewConversation">新对话</el-button></div><label class="question-label" for="robot-question">你的问题或修改要求</label><el-input id="robot-question" v-model="question" type="textarea" :autosize="{minRows:3,maxRows:6}" maxlength="4000" placeholder="例如：从启动到完成一次循环，程序经过哪些步骤？" :disabled="busy || !canInteract"/><div class="agent-actions conversation-actions"><el-button type="primary" :loading="analyzing && !overviewRunning" :disabled="busy || !canInteract || !question.trim()" @click="ask()">发送</el-button></div><p v-if="newConversation" class="connection-note" role="status">已开始新对话，下次发送不带之前的聊天记录。</p><div v-if="submittedQuestion || turns.length && !newConversation" class="robot-user-question"><b>你的问题</b><p>{{submittedQuestion||turns[turns.length-1].question}}</p></div><RobotAnalysisView v-if="dialogueResult" v-model:confirmed-changes="confirmedChanges" :result="dialogueResult" :file-name="sourceName" :can-interact="canInteract" @reference="jump"/><details v-if="turns.length>1 && !newConversation" class="conversation-history"><summary>之前的对话（{{turns.length-1}}轮）</summary><article v-for="(turn,i) in turns.slice(0,-1)" :key="i"><b>{{turn.question}}</b><p>{{turn.answer}}</p></article></details></section>
      <p v-if="annotationNotice" class="connection-note">{{annotationNotice}}</p>
     </div>
    </section>
    </Teleport>
   </div>
  </template>
 </div>
</template>
<script setup>
import AppRobotToolbar from '../app/AppRobotToolbar.vue'
import {isAppSurface} from '../app/surface.mjs'
const appSurface=isAppSurface()
import {computed,nextTick,onMounted,onBeforeUnmount,ref} from 'vue'
import {useRoute} from 'vue-router'
const route=useRoute()
import {ElMessageBox} from 'element-plus'

import AiModelInfo from '../components/AiModelInfo.vue'
import RobotSourceReader from '../components/RobotSourceReader.vue'
import RobotAnalysisView from '../components/RobotAnalysisView.vue'
import RobotCallTree from '../components/RobotCallTree.vue'
import {annotationBatches,annotationCoverage,explanationReview,missingRoutineBatches} from '../utils/robot-program.mjs'
import {robotSession} from '../utils/robot-session.mjs'
import {getRobotAgentStatus,checkRobotAgentConnection,renameRobotBackup,listRobotBackups,getRobotBackup,saveRobotBackup,askRobotBackup,downloadRobotBackup} from '../api'
const report=ref(null),analysis=ref(null),pendingFile=ref(null),selectedId=ref(''),readerTab=ref('code'),focusRange=ref(null),question=ref(''),history=ref([]),confirmedChanges=ref(false)
const submittedQuestion=ref(''),newConversation=ref(false)
const assistantTab=ref('overview'),programOverview=ref(null),batchReports=ref({}),dialogueAnalysis=ref(null),overviewRunning=ref(false)
function startNewConversation(){if(busy.value)return;newConversation.value=true;dialogueAnalysis.value=null;confirmedChanges.value=false;submittedQuestion.value='';question.value='';error.value=''}
const agentStatus=ref({enabled:false,canInteract:false,transport:'deepseek'}),reading=ref(false),analyzing=ref(false),exporting=ref(false),error=ref(''),annotationNotice=ref('')
const library=ref([]),projectId=ref(''),revision=ref(0)
const checkingConnection=ref(false),connectionResult=ref(null),autoAnalyze=ref(true)
const localNotice=ref(''),batchState=ref({}),batchRunning=ref(false),stopBatch=ref(false),batchLabel=ref(''),assistantHidden=ref(false),onlyNotes=ref(false)
const backupInput=ref(null)
const sourceReader=ref(null),sourcePanel=ref(null),assistantPanel=ref(null),assistantBody=ref(null),callTreeViewport=ref(null)
const readerFocus=ref(''),sourceExpanded=computed(()=>readerFocus.value==='source'),assistantExpanded=computed(()=>readerFocus.value==='assistant')
const directoryMedia=globalThis.window?.matchMedia?.('(min-width: 1251px)')
const directoryAvailable=()=>Boolean((directoryMedia?.matches ?? true)&&!/DigitalWorkbenchAndroid\//.test(globalThis.navigator?.userAgent||'')&&!globalThis.document?.body?.classList?.contains('workbench-mobile'))
const fileTreeVisible=ref(directoryAvailable())
const showCompactFilePicker=computed(()=>!fileTreeVisible.value&&!sourceExpanded.value)
function directoryChanged(){fileTreeVisible.value=directoryAvailable()}
directoryMedia?.addEventListener('change',directoryChanged)
let readerTransition=0,readerReturnFocus=null,readerBodyLock=null
function unlockReaderBody(){if(!readerBodyLock)return;const body=globalThis.document?.body;if(body){body.style.overflow=readerBodyLock.overflow;body.style.paddingRight=readerBodyLock.paddingRight}readerBodyLock=null}
async function setReaderFocus(mode=''){
 if(!['','source','assistant'].includes(mode)||readerFocus.value===mode)return
 const transition=++readerTransition,doc=globalThis.document,previous=readerFocus.value
 const codeScroll=sourceReader.value?.captureScroll?.(),callTreeScroll=callTreeViewport.value?{top:callTreeViewport.value.scrollTop,left:callTreeViewport.value.scrollLeft}:null,assistantScroll=assistantBody.value?{top:assistantBody.value.scrollTop,left:assistantBody.value.scrollLeft}:null
 if(!previous&&mode&&doc){readerReturnFocus=doc.activeElement;readerBodyLock={overflow:doc.body.style.overflow,paddingRight:doc.body.style.paddingRight};const gap=Math.max(0,(globalThis.window?.innerWidth||0)-doc.documentElement.clientWidth);if(gap)doc.body.style.paddingRight=(Number.parseFloat(globalThis.window?.getComputedStyle(doc.body).paddingRight)||0)+gap+'px';doc.body.style.overflow='hidden';doc.addEventListener('keydown',readerKeydown)}
 readerFocus.value=mode
 await nextTick();if(transition!==readerTransition)return
 sourceReader.value?.restoreScroll?.(codeScroll)
 if(callTreeScroll&&callTreeViewport.value){callTreeViewport.value.scrollTop=callTreeScroll.top;callTreeViewport.value.scrollLeft=callTreeScroll.left}
 if(assistantScroll&&assistantBody.value){assistantBody.value.scrollTop=assistantScroll.top;assistantBody.value.scrollLeft=assistantScroll.left}
 if(mode==='source'){if(sourceReader.value)sourceReader.value.focusScroller?.();else sourcePanel.value?.focus({preventScroll:true})}
 else if(mode==='assistant')assistantBody.value?.focus({preventScroll:true})
 else{doc?.removeEventListener('keydown',readerKeydown);unlockReaderBody();if(readerReturnFocus?.isConnected&&readerReturnFocus.getClientRects().length)readerReturnFocus.focus({preventScroll:true});readerReturnFocus=null}
}
function readerKeydown(event){
 const panel=readerFocus.value==='source'?sourcePanel.value:assistantPanel.value
 if(!panel||event.defaultPrevented||!panel.contains(event.target))return
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();return setReaderFocus('')}
 if(event.key!=='Tab')return
 const controls=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length&&el.getAttribute('aria-hidden')!=='true')
 if(!controls.length){event.preventDefault();panel.focus({preventScroll:true});return}
 const first=controls[0],last=controls[controls.length-1],active=globalThis.document.activeElement
 if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus()}else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus()}
}
const mobilePane=ref('source')
const currentBackup=computed(()=>library.value.find(item=>item.id===projectId.value))
function showMobilePane(pane){mobilePane.value=pane;if(readerFocus.value)setReaderFocus('');if(pane==='assistant')assistantHidden.value=false}
async function importBackup(event){selectFile(event);await readBackup();event.target.value=''}
const currentDisplayName=computed(()=>library.value.find(p=>p.id===projectId.value)?.displayName||report.value?.filename||'')
const canInteract=computed(()=>agentStatus.value.canInteract===true)
const canManage=computed(()=>agentStatus.value.canManage===true)
const busy=computed(()=>reading.value||analyzing.value||exporting.value||batchRunning.value||checkingConnection.value)
const turns=computed(()=>history.value.filter(h=>h.role==='user').map((h,i)=>({question:h.content,answer:history.value.filter(h=>h.role==='assistant')[i]?.content||''})))
const readerTabs=[{key:'code',label:'源码与注释'},{key:'original',label:'原始程序'},{key:'routines',label:'程序调用'}]
const fileById=id=>report.value?.files.find(f=>f.id===id)
const selectedFile=computed(()=>fileById(selectedId.value))
const previewRoutine=computed(()=>{const file=selectedFile.value,line=focusRange.value?.startLine;const routine=file?.routines?.find(r=>line>=r.startLine&&line<=r.endLine);return routine?file.id+':'+routine.name:undefined})
const orderedFiles=computed(()=>{const files=report.value?.files||[];return [...files.filter(f=>f.readable),...files.filter(f=>!f.readable)]})
const fileGroups=computed(()=>{const groups=[];for(const file of orderedFiles.value.filter(f=>f.readable)){const name=file.task||'系统配置';let group=groups.find(g=>g.name===name);if(!group)groups.push(group={name,files:[]});group.files.push(file)}const unreadable=orderedFiles.value.filter(f=>!f.readable);if(unreadable.length)groups.push({name:'不可读文件',files:unreadable});return groups})
const batches=computed(()=>report.value?annotationBatches(report.value):[])
const completedCount=computed(()=>batches.value.filter(b=>batchState.value[b.key]?.status==='done').length)
const failedCount=computed(()=>batches.value.filter(b=>batchState.value[b.key]?.status==='failed').length)
const batchPercent=computed(()=>batches.value.length?Math.round(completedCount.value/batches.value.length*100):0)
const coverageFor=file=>annotationCoverage(file,analysis.value?.annotations)
const coverage=computed(()=>selectedFile.value?coverageFor(selectedFile.value):{lines:0,routines:0,totalRoutines:0})
const sourceName=id=>fileById(id)?.name||id
const entryPoints=computed(()=>orderedFiles.value.flatMap(file=>file.routines.filter(r=>/^main$/i.test(r.name)).map(r=>({fileId:file.id,name:r.name,line:r.startLine,calls:r.calls?.length||0}))))
const currentCodeReview=computed(()=>Object.values(batchReports.value).filter(item=>item.target?.fileId===selectedId.value).sort((a,b)=>(b.generatedAt||'').localeCompare(a.generatedAt||'')).at(0)||null)
const dialogueResult=computed(()=>newConversation.value?null:dialogueAnalysis.value||(turns.value.length?{summary:turns.value.at(-1).answer,sections:[],changes:[],questions:[]}:null))
async function generateOverview(){if(!allowAI()||busy.value||!report.value||!await ensureConnection())return;overviewRunning.value=true;analyzing.value=true;error.value='';try{acceptProject((await askRobotBackup(projectId.value,{revision:revision.value,mode:'analyze',scope:'overview'})).data,{keepSource:true});assistantTab.value='overview'}catch(e){error.value=e.response?.data?.msg||e.message}finally{overviewRunning.value=false;analyzing.value=false;await refreshAgentStatus()}}
onBeforeUnmount(()=>{stopBatch.value=true;readerTransition++;globalThis.document?.removeEventListener('keydown',readerKeydown);directoryMedia?.removeEventListener('change',directoryChanged);unlockReaderBody()})
let noteCursor=0
function allowAI(){if(canInteract.value)return true;ElMessageBox.alert('系统管理员可以生成注释；系统管理员和车间管理员可以向AI提问或提出修改建议。当前账号可以切换备份，查看已有源码、注释和分析。','权限提示',{confirmButtonText:'知道了'}).catch(()=>{});return false}
async function nextNote(){const lines=[...new Set((analysis.value?.annotations||[]).filter(note=>note.fileId===selectedId.value).map(note=>note.line))].sort((a,b)=>a-b);if(!lines.length)return;const line=lines[noteCursor++%lines.length];await jump({fileId:selectedId.value,startLine:line,endLine:line})}
function acceptProject(saved,{keepSource=false}={}){if(saved.quota)agentStatus.value={...agentStatus.value,quota:saved.quota};if(saved.analysis&&saved.analysis.sourceHash!==saved.report.sha256)throw new Error('分析结果与备份不一致');const current=selectedId.value;report.value=saved.report;projectId.value=saved.id;revision.value=saved.revision;analysis.value=saved.analysis;programOverview.value=saved.overview||null;batchReports.value=saved.batchReports||{};dialogueAnalysis.value=saved.dialogueAnalysis||null;history.value=saved.history||[];newConversation.value=false;submittedQuestion.value='';batchState.value=saved.batchState||{};confirmedChanges.value=false;annotationNotice.value=(saved.warnings||[]).join('；');selectedId.value=keepSource&&fileById(current)?current:report.value.files.find(f=>/MainModule/i.test(f.name)&&f.readable)?.id||orderedFiles.value[0].id;localNotice.value='';try{localStorage.setItem('robot-library-last-'+agentStatus.value.accountId,saved.id)}catch{};const item={id:saved.id,revision:saved.revision,filename:saved.filename,displayName:saved.displayName||saved.filename,updatedAt:saved.updatedAt,annotationCount:saved.analysis?.annotations.length||0};const at=library.value.findIndex(p=>p.id===saved.id);if(at<0)library.value.unshift(item);else library.value[at]={...library.value[at],...item}}
async function openProject(id){if(busy.value)return;reading.value=true;error.value='';try{acceptProject((await getRobotBackup(id)).data);readerTab.value='code';onlyNotes.value=false;focusRange.value=null;question.value=''}catch(e){error.value=e.response?.data?.msg||e.message}finally{reading.value=false}}
async function renameBackup(item){
 if(!canManage.value||busy.value||!item?.id)return
 let value;try{({value}=await ElMessageBox.prompt('修改备份显示名称，原始文件和已生成注释会保留。','重命名备份',{inputValue:item.displayName||item.filename,confirmButtonText:'保存',cancelButtonText:'取消',inputValidator:v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=80&&!/[\x00-\x1f\x7f\\/:*?"<>|]/.test(v)&&!['.','..'].includes(v.trim())||'请输入1至80个字符，不含换行或文件路径符号'}))}catch{return}
 reading.value=true;error.value=''
 try{const saved=(await renameRobotBackup(item.id,{name:value.trim(),revision:item.id===projectId.value?revision.value:item.revision})).data;if(item.id===projectId.value)acceptProject(saved,{keepSource:true});await refreshLibrary()}catch(e){error.value=e.response?.data?.msg||e.message}finally{reading.value=false}
}
async function refreshLibrary(){try{library.value=(await listRobotBackups()).data}catch(e){error.value=e.response?.data?.msg||e.message}}
async function readBackup(){
 if(!canManage.value||busy.value||!pendingFile.value)return
 if(!/\.zip$/i.test(pendingFile.value.name)||pendingFile.value.size>20*1024*1024){error.value='请选择20MB以内的ABB备份ZIP';return}
 reading.value=true;error.value='';let saved=null
 try{const body=new FormData();body.append('file',pendingFile.value);saved=(await saveRobotBackup(body)).data;acceptProject(saved);readerTab.value='code';onlyNotes.value=false;focusRange.value=null;await refreshLibrary();agentStatus.value=(await getRobotAgentStatus()).data}
 catch(e){error.value=e.response?.data?.msg||e.message}finally{reading.value=false}
 if(saved&&autoAnalyze.value&&!saved.analysis){if(agentStatus.value.enabled)await generateBatches();else localNotice.value='备份已保存并完成源码读取；中文注释尚未生成。'+(agentStatus.value.message||'请重新检查模型连接。')}
}
function selectSource(id){selectedId.value=id;focusRange.value=null;readerTab.value='code';noteCursor=0}
async function jump(reference){mobilePane.value='source';selectedId.value=reference.fileId;readerTab.value='code';focusRange.value=reference;onlyNotes.value=false;if(assistantExpanded.value)await setReaderFocus('source');await nextTick();await sourceReader.value?.reveal(reference)}
async function ask(nextMode='auto'){if(!allowAI()||busy.value||!report.value||!await ensureConnection())return;if(agentStatus.value.quota?.remaining===0&&!agentStatus.value.quota.unlimited){error.value='今日机器人分析已达3次上限，请北京时间零点后再试';return}const prompt=question.value.trim();if(!prompt){error.value='请输入具体问题；完整注释请使用“分批生成中文注释”。';return}submittedQuestion.value=prompt;analyzing.value=true;error.value='';try{acceptProject((await askRobotBackup(projectId.value,{question:prompt,mode:nextMode,revision:revision.value,newConversation:newConversation.value})).data,{keepSource:true});question.value='';submittedQuestion.value='';newConversation.value=false}catch(e){error.value=e.response?.data?.msg||e.message}finally{analyzing.value=false;await refreshAgentStatus()}}
async function generateBatches(custom=null){
 if(!canManage.value){error.value='仅系统管理员可以生成、继续或补充程序注释';return}if(!allowAI()||busy.value||!report.value||!await ensureConnection())return
 batchRunning.value=true;stopBatch.value=false;error.value='';localNotice.value='';readerTab.value='code';onlyNotes.value=false
 const restore=saved=>{const failures=Object.fromEntries(Object.entries(batchState.value).filter(([,state])=>state.status==='failed'));acceptProject(saved,{keepSource:true});batchState.value={...failures,...saved.batchState}}
 try{
 const plan=Array.isArray(custom)?custom:batches.value
 for(const batch of plan){if(stopBatch.value)break;if(!Array.isArray(custom)&&batchState.value[batch.key]?.status==='done')continue
 const file=fileById(batch.fileId);batchLabel.value=`正在生成 ${file.name} · ${batch.startLine}–${batch.endLine} 行`;selectedId.value=file.id
 try{const target={fileId:batch.fileId,startLine:batch.startLine,endLine:batch.endLine};const saved=(await askRobotBackup(projectId.value,{mode:'analyze',revision:revision.value,target,question:'结合完整程序与信号配置，只解释本批次行范围：关键变量、例程目的、调用、等待、I/O与异常路径。本范围内每个例程至少给出一条目的与条件说明；最多80条简洁中文注释，区分源码事实、名称推测、现场待确认，不根据点位名称或轴配置断言工具朝向。'})).data;restore(saved)}
 catch(e){const status=e.response?.status,message=e.response?.data?.msg||e.message
 if(status===409||!e.response){try{restore((await getRobotBackup(projectId.value)).data);if(batchState.value[batch.key]?.status==='done')continue}catch(syncError){error.value='无法同步备份最新进度，已停止；已保存内容保留，请恢复连接后继续。';break}}
 batchState.value[batch.key]={status:'failed',error:message}
 if([401,403,404].includes(status)){error.value=`任务已停止：${message}。已完成内容保留。`;break}
 localNotice.value=`${file.name} ${batch.startLine}–${batch.endLine} 行失败，已跳过，继续后续批次。`
 }
 }
 if(!error.value){if(failedCount.value)error.value=`${stopBatch.value?'任务已暂停':'本轮已处理完毕'}，${failedCount.value} 批失败，已跳过并保留原因；成功注释均已保存，可点击继续生成重试失败批次。`;else localNotice.value=stopBatch.value?'已按要求暂停，已完成内容保留。': '本轮注释生成完成，所有结果已保存。'}
 }catch(e){error.value=e.response?.data?.msg||e.message}finally{batchRunning.value=false;await refreshAgentStatus();batchLabel.value='';if(!error.value)selectedId.value=report.value.files.find(f=>/MainModule/i.test(f.name)&&f.readable)?.id||selectedId.value}
}
async function refreshConnection(){
 if(!canManage.value||checkingConnection.value||reading.value||analyzing.value||batchRunning.value)return
 checkingConnection.value=true;error.value=''
 try{agentStatus.value=(await getRobotAgentStatus()).data;connectionResult.value=(await checkRobotAgentConnection()).data;if(!connectionResult.value.ready)error.value=connectionResult.value.message}
 catch(e){error.value=e.response?.data?.msg||e.message;connectionResult.value={ready:false,message:error.value}}finally{checkingConnection.value=false}
}
async function refreshAgentStatus(){try{agentStatus.value=(await getRobotAgentStatus()).data}catch{}}
async function ensureConnection(){await refreshAgentStatus();if(agentStatus.value.enabled&&connectionResult.value?.ready!==false)return true;if(canManage.value)await refreshConnection();else{await refreshAgentStatus();if(!agentStatus.value.enabled)error.value=agentStatus.value.message||'请联系系统管理员配置模型连接'}return agentStatus.value.enabled&&(canManage.value?connectionResult.value?.ready===true:true)}
async function download(){if(busy.value||!analysis.value)return;exporting.value=true;error.value='';try{const blob=await downloadRobotBackup(projectId.value,canInteract.value&&confirmedChanges.value),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=currentDisplayName.value.replace(/\.zip$/i,'')+'-中文注释阅读包.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){error.value=e.response?.data?.msg||e.message}finally{exporting.value=false}}
onMounted(async()=>{reading.value=true;try{agentStatus.value=(await getRobotAgentStatus()).data;await refreshLibrary();if(canManage.value){let saved;try{saved=await robotSession(agentStatus.value.accountId,'get')}catch{};if(saved?.schema===1&&saved.file&&!library.value.some(p=>p.id===saved.hash)){const body=new FormData();body.append('file',saved.file);body.append('origin','legacy-cache');if(saved.analysis){body.append('analysis',JSON.stringify(saved.analysis));body.append('progress',JSON.stringify(saved.batchState||{}))}try{const migrated=(await saveRobotBackup(body)).data;acceptProject(migrated);await refreshLibrary()}catch(e){if(e.response?.status!==410)throw e}await robotSession(agentStatus.value.accountId,'delete').catch(()=>{})}}
 let last='';try{last=localStorage.getItem('robot-library-last-'+agentStatus.value.accountId)||''}catch{};const id=library.value.find(p=>p.id===route.query.backup)?.id||library.value.find(p=>p.id===last)?.id||library.value[0]?.id;if(id){acceptProject((await getRobotBackup(id)).data);const file=fileById(String(route.query.file||'')),line=Number(route.query.line);if(file&&Number.isInteger(line)&&line>0&&line<=file.text?.split(/\r?\n/).length)await jump({fileId:file.id,startLine:line,endLine:line})}
 }catch(e){error.value=e.response?.data?.msg||e.message}finally{reading.value=false}})

</script>
<style scoped>
.robot-model-preview{font-size:13px;color:#0b7d90;text-decoration:none;white-space:nowrap;padding:8px 10px;border:1px solid #cfe1e9;border-radius:6px;background:#fff}
.robot-program{max-width:1800px;margin:auto;display:flex;flex-direction:column;gap:16px;color:#283b50;min-width:0}
.robot-program .panel{background:#fff;border:1px solid #e0e6ee;border-radius:12px;padding:18px;min-width:0}
.robot-program h3{font-size:16px;margin:0 0 12px}.robot-program h4{font-size:13px;margin:12px 0 8px}.robot-program p{line-height:1.8;margin:6px 0}
.backup-input{display:none}
.robot-program .backup-library{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 18px}
.backup-library-left{display:flex;align-items:center;gap:16px;flex:1;min-width:0}
.backup-cards{display:flex;flex:1;min-width:0;gap:8px;overflow-x:auto}
.backup-cards>article{position:relative;flex:0 0 200px;min-width:0;border:1px solid #dce4ec;border-radius:8px;background:#fff}
.backup-cards>article.selected{background:#eff8f4;border-color:#6dafa0}
.backup-select{width:100%;height:100%;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:9px 48px 9px 12px;border:0;border-radius:8px;background:transparent;color:#41586c;cursor:pointer;text-align:left}
.backup-select strong{max-width:100%;font-size:13px;overflow-wrap:anywhere;line-height:1.5}.backup-select span{font-size:11px;color:#667f8d}.backup-select small{display:none}
.backup-edit{position:absolute;right:6px;top:6px}.backup-edit>.el-button{min-height:32px;padding:4px;font-size:11px}.backup-menu-delete{color:var(--el-color-danger)}
.backup-library-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex:none;margin-left:auto}.backup-library-actions>.el-button{margin:0}.backup-library>p{flex-basis:100%;font-size:13px;color:#778796}
.connection-status{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.connection-status p,.connection-status li,.connection-status small{font-size:12px;color:#64748b;line-height:1.8}.connection-status ul{padding-left:20px}.connection-status code{display:inline-block;margin-left:8px;overflow-wrap:anywhere}
.local-notice{font-size:12px;color:#52697a}
.robot-workspace{display:grid;gap:16px}
.file-list{overflow-y:auto;overscroll-behavior:contain}.file-list h3{font-size:14px}.file-list h4{font-size:11px;color:#788a9b}
.file-list button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;margin:4px 0;padding:10px;border:1px solid transparent;border-radius:8px;background:#fff;color:#43576b;text-align:left;cursor:pointer}
.file-list button.selected{background:#eef2fa;border-color:#cdd7ee;color:#35559c}
.file-list button>span{display:block;max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.5;font-size:13px}.file-list small{font-size:11px;color:#7e8c9c}
.robot-program .source-panel{padding:16px}
.reader-tabs{display:flex;flex-wrap:wrap;gap:4px;min-width:0;margin:0}
.reader-tabs button{border:0;border-bottom:2px solid transparent;background:#fff;color:#728296;padding:10px 7px;font:inherit;font-size:12px;cursor:pointer}.reader-tabs button.active{color:#3f5da1;border-bottom-color:#3f5da1}.reader-tabs .assistant-toggle{margin-left:auto;color:#49677e}
.source-scroll{max-height:70dvh;overflow:auto;overscroll-behavior:contain}
.empty-source{font-size:13px;line-height:1.8;color:#7b8a9d;padding:24px 0}
.robot-program .assistant-panel{overflow:hidden;border-color:#dce6ed}
.agent-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#152c40;color:#fff}
.agent-identity{display:flex;align-items:center;gap:12px;min-width:0}.agent-emblem{color:#62d6cd;flex:none}.agent-identity small{font-size:9px;letter-spacing:1.5px;color:#82b4c4}.agent-identity h3{font-size:17px;margin:5px 0}.agent-identity p{font-size:10px;color:#a0b8c8;margin:0}
.agent-state{display:flex;align-items:center;flex:none;gap:4px;padding:5px 6px;border:1px solid #325365;border-radius:6px;font-size:10px;color:#83ded1}.agent-state.unavailable{color:#f4c57c}.agent-state.running .el-icon{animation:agent-spin 1.2s linear infinite}
.batch-progress{padding:14px;border:1px solid #dce9e9;border-radius:10px;background:#f6fafb}.task-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.task-heading>span{color:#0e8085;font-weight:650}.robot-program .task-current{color:#6f8694;overflow-wrap:anywhere}
.agent-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.agent-actions .el-button{margin:0;min-height:38px}
.task-details{border-top:1px solid #dce8ea}.task-details>summary{font-size:11px;color:#5d7789;cursor:pointer}.module-progress-list{overflow:auto;margin-top:8px;overscroll-behavior:contain}.batch-module{border-top:1px solid #e2eaec;padding:8px 0}.batch-module>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;cursor:pointer}.batch-module small{font-size:10px;color:#7e939f;font-weight:400}.batch-module p{font-size:10px;color:#7c8c99}.batch-item{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding:4px 0}.batch-item small{flex-basis:100%;color:#a74949}.batch-item.done span:last-of-type{color:#238776}.batch-item.failed span:last-of-type{color:#b34d4d}
.question-label{display:block;color:#39556c;font-size:12px;font-weight:600;margin:18px 0 8px}.assistant-panel :deep(.el-textarea__inner){border-radius:9px;font-size:13px;line-height:1.8}.conversation-actions .el-button{font-size:12px}.conversation-actions .el-button:first-child{flex:1}.conversation-actions .el-button:last-child{min-width:88px}
.connection-note{font-size:11px;color:#7e8c9c;line-height:1.7}.robot-user-question{padding:12px;border:1px solid #dfe8f3;border-radius:9px;background:#f0f5fb;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.analysis-section{border-bottom:1px solid #edf0f5;padding:8px 0 16px}.references{display:flex;flex-wrap:wrap;gap:6px}.references button{padding:5px 7px;border:1px solid #dce4ef;border-radius:5px;background:#f5f8fd;color:#4264a4;font-size:11px;cursor:pointer}.conversation-history{margin-top:18px;font-size:12px;color:#6d7c90}.conversation-history article{border-bottom:1px solid #edf0f5;padding:12px 0}.conversation-history summary{color:#526f86;cursor:pointer}.conversation-history p{white-space:pre-wrap}.conversation-history b{color:#435b74}
button:focus-visible{outline:2px solid #496aaf;outline-offset:2px}
@keyframes agent-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.agent-state.running .el-icon{animation:none}}
@media(max-width:1250px){.robot-workspace{grid-template-columns:minmax(0,1fr) 360px}.robot-workspace.assistant-hidden{grid-template-columns:minmax(0,1fr)}}
@media(max-width:960px){.robot-workspace{grid-template-columns:minmax(0,1fr)}.module-progress-list{max-height:220px}.backup-library-left{flex-wrap:wrap;gap:10px}.backup-cards{flex-basis:100%}}
@media(max-width:760px){.robot-program .panel{padding:14px}.robot-program .backup-library{gap:10px;padding:12px}.backup-library-left{flex-basis:100%}.backup-cards>article{flex-basis:calc((100% - 8px)/2)}.backup-library-actions{flex-wrap:wrap;gap:8px}.reader-tabs button{min-height:40px;padding-inline:5px;font-size:11px}.reader-tabs .assistant-toggle{font-size:10px}.connection-status{flex-direction:column}.robot-program .assistant-panel{padding:16px}.agent-heading{margin:-16px -16px 0;padding:18px 16px;flex-wrap:wrap}.agent-state{margin-left:auto}.agent-actions .el-button{min-height:42px}.assistant-panel :deep(.el-textarea__inner){font-size:16px}.references button{min-height:36px}}
/* Three aligned work areas; each desktop pane owns one scroll region. */
.robot-workspace{height:calc(100dvh - 250px);min-height:560px;align-items:stretch;grid-template-columns:220px minmax(0,1fr) 450px}
.robot-workspace.assistant-hidden{grid-template-columns:220px minmax(0,1fr)}
.file-list{height:100%;max-height:none;box-sizing:border-box}
.robot-program .source-panel{display:flex;flex-direction:column;height:100%;box-sizing:border-box;min-height:0}
.reader-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:none;border-bottom:1px solid #e5eaf1;margin:0 0 8px}
.reader-controls .reader-tabs{flex:1 1 auto}
.compact-file-picker{flex:0 1 160px;min-width:90px;max-width:100%;margin:2px 0 6px}
.reader-focus-action{flex:none;margin:2px 0 6px}
.source-annotation-filter{display:inline-flex;align-items:center;gap:4px;min-height:24px;white-space:nowrap;font-size:11px}
.source-annotation-filter input{margin:0}
.source-annotation-action{margin:0;font-size:11px}
.source-panel :deep(.robot-code-reader){display:flex;flex-direction:column;flex:1;min-height:0}
.source-panel :deep(.code-toolbar){flex:none}
.source-panel :deep(.code-viewport){flex:1;min-height:0;max-height:none}
.call-tree-scroll{flex:1;min-height:0;max-height:none}
.robot-program .assistant-panel{display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;padding:0}
.agent-heading{margin:0;padding:16px 18px;flex:none;border-radius:11px 11px 0 0}.agent-heading h3{font-size:16px}.agent-heading p{font-size:11px}.agent-emblem{font-size:24px}
.assistant-tabs{display:flex;gap:4px;padding:10px 14px 0;border-bottom:1px solid #e6edf1;flex:none}.assistant-tabs button{flex:1;padding:10px 8px;border:0;border-bottom:2px solid transparent;background:#fff;color:#74889a;font-size:13px;cursor:pointer}.assistant-tabs button.active{border-bottom-color:#098c87;color:#087d79;font-weight:600}
.assistant-panel>.batch-progress{margin:12px 14px;padding:11px 12px;flex:none}.task-heading h4{margin:0 0 7px;font-size:11px}.task-heading h4 small{font-size:10px;color:#8396a3;margin-left:6px;font-weight:400}.task-heading>span{margin-bottom:7px;font-size:11px}.robot-program .task-current{font-size:10px;margin:6px 0;line-height:1.6}.batch-progress .agent-actions{margin:7px 0}.batch-progress .el-button{min-height:30px;font-size:11px}.task-details{padding-top:7px}.module-progress-list{max-height:160px}
.assistant-body{flex:1;min-height:0;overflow:auto;padding:4px 16px 18px;overscroll-behavior:contain}.pane-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 14px}.pane-heading>div{min-width:0}.pane-heading h3{font-size:15px;margin:0;overflow-wrap:anywhere}.pane-heading p{font-size:11px;color:#8b9aa6;margin:4px 0}.pane-heading>.el-button{flex:none}.overview-intro{padding:15px;border:1px solid #dcebe8;border-radius:9px;background:#f4faf8;color:#52726f;font-size:13px;line-height:1.9}.structure-metrics{display:grid;grid-template-columns:repeat(3,1fr);margin:20px 0;gap:10px}.structure-metrics span{padding:12px 8px;border-radius:8px;background:#f5f8fb;font-size:10px;color:#8295a5;text-align:center}.structure-metrics b{display:block;font-size:23px;color:#314e67;line-height:1.5}.entry-link{display:flex;flex-direction:column;gap:4px;width:100%;padding:12px;margin:8px 0;border:1px solid #e0e8ef;border-radius:7px;background:#fff;text-align:left;cursor:pointer}.entry-link span{font-size:11px;color:#7b8f9f}.entry-link b{font-size:13px;color:#335774}.entry-link small,.coverage-note{font-size:10px;color:#8494a2;line-height:1.7;overflow-wrap:anywhere}.range-label{padding:7px 10px;border-radius:6px;background:#eef4fb;color:#597b9b;font-size:11px}.chat-pane .question-label{margin-top:12px}.chat-pane .robot-user-question{margin:14px 0}.code-review-pane h3{font-size:14px}
@media(max-width:1450px){.robot-workspace{grid-template-columns:210px minmax(0,1fr) 400px}.robot-workspace.assistant-hidden{grid-template-columns:210px minmax(0,1fr)}}
@media(max-width:1250px){.robot-workspace{grid-template-columns:minmax(0,1fr) 400px}.robot-workspace.assistant-hidden{grid-template-columns:minmax(0,1fr)}}
@media(max-width:960px){.robot-workspace,.robot-workspace.assistant-hidden{height:auto;min-height:0;grid-template-columns:minmax(0,1fr)}.robot-program .source-panel,.robot-program .assistant-panel{height:auto}.source-panel :deep(.code-viewport){flex:none;max-height:62dvh}.assistant-body{overflow:visible;max-height:none}.assistant-panel>.batch-progress{margin:12px}.assistant-body{padding:4px 14px 16px}.agent-heading{margin:0;padding:16px}.module-progress-list{max-height:220px}}
.agent-heading-actions{display:flex;align-items:center;gap:10px;flex:none}.agent-heading-actions .el-button{margin:0;background:#203d54;border-color:#456175;color:#e1edf5}.reader-escape{margin-left:7px;font-size:10px;opacity:.65}
/* The existing pane moves into the viewport; no duplicate metadata header. */
.source-panel.robot-reader-fullscreen,.assistant-panel.robot-reader-fullscreen{position:fixed;inset:0;z-index:1900;display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100vh;height:100dvh;min-width:0;min-height:0;max-height:none;padding:12px 18px;border:0;border-radius:0;overflow:hidden;background:var(--card,#fff);color:var(--text,#283b50);padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(12px,env(safe-area-inset-bottom));padding-left:max(18px,env(safe-area-inset-left));padding-right:max(18px,env(safe-area-inset-right))}
.source-panel.robot-reader-fullscreen .reader-controls{margin:0 0 6px}
.source-panel.robot-reader-fullscreen :deep(.robot-code-reader){display:flex;flex-direction:column;flex:1 1 0;min-height:0;overflow:hidden}
.source-panel.robot-reader-fullscreen :deep(.code-toolbar){flex:none}
.source-panel.robot-reader-fullscreen :deep(.code-viewport){flex:1 1 0;min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain}
.source-panel.robot-reader-fullscreen .call-tree-scroll,.source-panel.robot-reader-fullscreen .empty-source{flex:1;min-height:0;max-height:none;overflow:auto}
.assistant-panel.robot-reader-fullscreen{padding:0}.assistant-panel.robot-reader-fullscreen .agent-heading{flex:none;border-radius:0;margin:0;padding:12px 18px;padding-top:max(12px,env(safe-area-inset-top))}.assistant-panel.robot-reader-fullscreen .assistant-tabs{flex:none;padding:4px 18px 0}.assistant-panel.robot-reader-fullscreen .assistant-body{flex:1 1 0;min-height:0;max-height:none;overflow:auto;padding:6px max(20px,calc((100vw - 1040px)/2)) 22px;overscroll-behavior:contain}.assistant-panel.robot-reader-fullscreen .assistant-body:focus-visible{outline:2px solid #496aaf;outline-offset:-2px}.assistant-panel.robot-reader-fullscreen :deep(.analysis-document){font-size:14px}.assistant-panel.robot-reader-fullscreen .agent-state{margin:0}
@media(max-width:760px){
 .reader-controls{gap:4px}.compact-file-picker{flex-basis:100px;min-width:80px}.reader-focus-action{min-height:30px}.source-annotation-action{padding-inline:7px}.source-annotation-filter{font-size:11px}
 .agent-heading-actions{gap:6px}.agent-heading-actions .el-button{font-size:11px}
 .source-panel.robot-reader-fullscreen{padding:10px;padding-top:max(10px,env(safe-area-inset-top));padding-bottom:max(10px,env(safe-area-inset-bottom))}
 .source-panel.robot-reader-fullscreen .reader-tabs{gap:0}.source-panel.robot-reader-fullscreen .reader-tabs button{font-size:11px;min-height:36px;padding:8px 3px}
 .assistant-panel.robot-reader-fullscreen .agent-heading{padding:12px;gap:6px}.assistant-panel.robot-reader-fullscreen .agent-identity{gap:7px}.assistant-panel.robot-reader-fullscreen .agent-emblem{display:none}.assistant-panel.robot-reader-fullscreen .agent-identity h3{font-size:15px}.assistant-panel.robot-reader-fullscreen .agent-identity p{display:none}.assistant-panel.robot-reader-fullscreen .assistant-tabs{padding:0 8px}.assistant-panel.robot-reader-fullscreen .assistant-tabs button{min-height:42px;font-size:12px}.assistant-panel.robot-reader-fullscreen .assistant-body{padding:4px 12px max(18px,env(safe-area-inset-bottom))}.assistant-panel.robot-reader-fullscreen .pane-heading{align-items:flex-start}
}
</style>


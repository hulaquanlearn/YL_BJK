<template>
 <section class="abb-program-control" aria-label="机器人程序联动">
  <header class="program-panel-head"><RouterLink class="program-title" :to="{path:'/robot-program',query:{backup:backupId,file:current?.fileId,line:current?.line,routine:routineId}}">程序分析 ↗</RouterLink><button class="program-mode-exit" :disabled="busy" :title="busy?'请先停止程序，再退出程序模式':'退出程序模式'" @click="$emit('exit-mode')">退出程序模式</button><button class="program-panel-close" aria-label="收起程序面板" title="收起程序面板" @click="$emit('close-panel')">×</button></header>

  <div class="program-section program-selection"><div class="program-pickers"><label>备份<select v-model="backupId" :disabled="busy || loading" @change="loadBackup"><option value="">请选择备份</option><option v-for="item in library" :key="item.id" :value="item.id">{{item.displayName||item.filename}}</option></select></label><label>例程<select v-model="routineId" :disabled="busy || loading || !index" @change="loadRoutine"><option value="">请选择例程</option><option v-for="item in routines" :key="item.id" :value="item.id">{{item.name}}（{{item.motion}} 条直接运动）</option></select></label></div></div>
  <p v-if="legacyNote" class="program-compatibility-note" role="note">{{legacyNote}}</p>
  <Teleport :to="actionsTarget || 'body'" :disabled="!actionsTarget"><div :class="actionsTarget?'abb-program-control program-docked-actions':null"><div class="program-run-actions"><button v-if="index?.automation" :disabled="busy || loading" class="program-primary" @click="runAll">{{runMode==='full'&&cell&&!cell.complete?'继续全流程':'全流程运行'}}</button><button :disabled="busy || loading || !plan" @click="start">运行所选例程</button><button :disabled="!busy" class="program-danger" @click="stop">停止</button><button :disabled="busy || !plan" @click="restart">重新开始</button></div></div></Teleport>
  <div v-if="index?.automation" class="program-section program-fill">
   <div class="program-section-head"><h3 class="program-section-title">装填参数</h3><span class="program-badge">{{barrel==='right'?'右甑':'左甑'}}</span></div>
   <div class="program-metrics">
    <label class="program-metric is-accent"><span class="program-metric-label">预设装填高度</span><div class="program-parameter-value"><input v-model.number="targetHeight" aria-label="预设装填高度" type="number" min="40" max="900" step="10" :disabled="busy"/><span class="program-metric-unit">mm</span></div></label>
    <label class="program-metric"><span class="program-metric-label">估算斗容</span><div class="program-parameter-value"><input v-model.number="capacityLitres" aria-label="估算斗容" type="number" min="10" max="250" step="5" :disabled="busy"/><span class="program-metric-unit">L</span></div></label>
    <div class="program-metric"><span class="program-metric-label">累计入甑</span><strong class="program-metric-value">{{((cell?.depositedVolume||0)*1000).toFixed(1)}} <span class="program-metric-unit">L</span></strong></div>
    <label class="program-metric"><span class="program-metric-label">目标甑</span><select v-model="barrel" :disabled="busy"><option value="left">左甑</option><option value="right">右甑</option></select></label>
   </div>
  </div>
  <Teleport :to="speedTarget || 'body'" :disabled="!speedTarget"><div :class="speedTarget?'abb-program-control program-docked-speed':null"><div class="program-section program-speed-section"><div class="program-section-head"><h3 class="program-section-title">运行速度</h3><span class="program-badge">{{overridePercent}}%</span></div><div class="program-speed"><label><span>速度</span><input :value="overridePercent" type="range" min="1" max="100" aria-label="程序运行速度" @input="$emit('update:overridePercent',Number($event.target.value))"/></label><div class="program-rate"><span class="program-rate-label">演示倍速</span><div class="program-rate-options" role="group" aria-label="演示倍速"><button v-for="n in [1,5,10]" :key="n" type="button" class="program-rate-option" :aria-pressed="playbackRate===n" @click="$emit('update:playbackRate',n)">{{n}}×</button></div></div></div></div></div></Teleport>

  <p v-if="!library.length && !loading" class="program-note">备份库暂无程序，可在智能中心导入 ABB 备份 ZIP 后选择。</p>
  <p v-if="error" class="program-error" role="alert">{{error}}</p>
  <div v-if="cell" class="program-progress"><div class="program-progress-head"><span>{{cell.stage}} · {{cell.height.toFixed(0)}} / {{cell.targetHeight}} mm</span><strong>{{fillPercent.toFixed(1)}}%</strong></div><div class="program-progress-track" role="progressbar" aria-label="甑内装填进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="fillPercent"><span class="program-progress-fill" :style="{width:fillPercent+'%'}"></span></div><small>斗内 {{(cell.bucketVolume||0)<.001?'约 0':((cell.bucketVolume||0)*1000).toFixed(1)}} L · 接料 {{cell.fillCount}} 次<span v-if="cell.infrared"> · 红外{{cell.infrared.status}}</span></small></div>
  <div class="program-diagnostics">
  <details v-if="current?.line" class="program-details program-source-details"><summary>执行源码</summary><div class="program-details-body"><pre class="program-source">{{current.excerpt?.map(row=>row.line+'  '+row.text).join('\n')||current.code}}</pre></div></details>
  <div v-if="needs.length" class="program-inputs"><strong>当前需要模拟的数据</strong><label v-for="item in needs" :key="item.name">{{item.name}}<select v-if="item.kind==='signal' && /^(?:DI|DO)$/i.test(item.type||'DI')" v-model.number="inputs[item.name]"><option :value="undefined">未给值</option><option :value="0">0</option><option :value="1">1</option></select><input v-else v-model="inputs[item.name]" :aria-label="'模拟值 '+item.name" placeholder="输入数值或 JSON"/><small>{{item.reason}}</small></label><button :disabled="busy" @click="resume">{{needs.some(item=>item.kind==='input'||item.kind==='parameter')?'应用输入并重新开始':'应用模拟值并继续'}}</button></div>
  <details v-if="signalChoices.length" class="program-signals"><summary>模拟信号（{{signalChoices.length}}）</summary><input v-model="signalSearch" aria-label="筛选模拟信号" placeholder="搜索信号名称"/><label v-for="item in filteredSignals" :key="item.name">{{item.name}}<select v-if="/^(?:DI|DO)$/i.test(item.type)" v-model.number="inputs[item.name]"><option :value="undefined">使用当前值</option><option :value="0">0</option><option :value="1">1</option></select><input v-else v-model="inputs[item.name]" :aria-label="'模拟值 '+item.name" placeholder="数值"/><small>{{item.label}}</small></label><p v-if="filteredSignals.length===30" class="program-note">最多显示30项，输入名称缩小范围。</p><button :disabled="busy" @click="resume">应用模拟信号并继续</button></details>
  <details v-if="recentEvents.length" class="program-details program-event-details"><summary>执行日志</summary><div class="program-events"><span v-for="(event,i) in recentEvents" :key="i">{{event.type==='provenance'?event.message:event.type==='substitution'?'模拟替代：'+(event.message||event.routine):event.type==='simulated-input'?'模拟反馈 '+event.signal+' = '+event.value:event.type==='cell'?'工位：'+event.stage:event.type==='io'?event.signal+' = '+event.value:event.type==='call'?'调用 '+event.routine:event.type==='trigger'?'触发 '+event.name:event.instruction+' · 第 '+event.line+' 行'}}</span></div></details>
  <details v-if="plan?.actions?.length"><summary>运动指令（{{plan.actions.length}}）</summary><ol class="program-actions"><li v-for="action in plan.actions" :key="action.seq" :class="{current:current?.line===action.line}"><span>{{action.line}} · {{action.instruction}} {{action.target.ref}}</span><button :disabled="busy" @click="locatePoint(action)">单点定位</button></li></ol></details>
  <details v-if="cell?.infrared" class="program-details program-infrared-details"><summary>相机盒 · 模拟</summary><div class="program-details-body"><p>{{cell.infrared.position===1?'左甑':cell.infrared.position===2?'右甑':'中间退避位'}} · {{cell.infrared.status}}</p><p>AT20 红外区域采集 {{cell.infrared.scanCount}} 次</p><p v-if="cell.infrared.scanCount">补料区域 {{cell.infrared.area}} · 起角 {{cell.infrared.startAngle}}° · 终角 {{cell.infrared.endAngle}}°</p><p v-if="cell.sensors?.height">DS77pro 模拟测高 {{cell.sensors.height.count}} 次<span v-if="Number.isFinite(cell.sensors.height.valueMm)"> · {{cell.sensors.height.valueMm.toFixed(1)}} mm</span></p><p v-if="cell.sensors?.temperature">AT20 模拟测温握手 {{cell.sensors.temperature.count}} 次 · 未接入实际温度值</p><p>两镜头同盒同杆，测高、红外与测温握手独立；高度和区域来自离线料面，无真实热像或点云。</p></div></details>
  <details v-if="index?.automation" class="program-details"><summary>设备模拟</summary><label class="program-check"><input v-model="automaticSignals" type="checkbox" :disabled="busy"/>自动模拟设备信号</label><p>设备信号与测高反馈为离线模拟；配方补偿默认 0。布料高度随局部料面调整，保留源斗口间距；边中高差 40 mm 为展示参数。体积按散料近似守恒，不代表现场计量值。</p><p v-for="binding in index.automation.bindings" :key="binding.name">{{binding.name}} · {{binding.label}}</p><p v-for="text in index.automation.substitutions" :key="text">{{text}}</p></details>
  </div>
 </section>
</template>
<script setup>
import {ref,shallowRef,computed,watch,onMounted,onBeforeUnmount,reactive,inject,toRefs} from 'vue'
import {useRoute} from 'vue-router'
import {listRobotBackups,getRobotBackup,getRobotMotion,simulateRobotProgram} from '../../api'
import programWorkerUrl from 'virtual:abb-program-worker-url'
import {createLocalProgram} from '../../utils/abb-local-program.mjs'
import {prepareProgramMotion} from '../../utils/abb-program-motion.mjs'
import {AbbProgramSession} from '../../utils/abb-program-session.mjs'
const props=defineProps({actionsTarget:{default:null},speedTarget:{default:null},resetPose:{type:Function,default:null},joints:{type:Array,required:true},motionAllowed:{type:Boolean,default:true},interlockReason:{type:String,default:''},speedPercent:{type:Number,default:100},prepareCell:{type:Function,default:null},toolType:{type:String,default:'tool-640'},overridePercent:{type:Number,default:100},playbackRate:{type:Number,default:1}}),emit=defineEmits(['exit-mode','close-panel','move','stop','status','location','context','cell','reset-pot','tool-signals','running','update:overridePercent','update:playbackRate'])
const route=useRoute(),selection=inject('abb-program-selection',reactive({backupId:String(route.query.backup||''),routineId:String(route.query.routine||'')})),{backupId,routineId}=toRefs(selection),library=ref([]),index=ref(null),plan=ref(null),source=ref(null),loading=ref(false),busy=ref(false),error=ref(''),status=ref('请选择备份与例程'),current=shallowRef(null),stopInfo=ref(null),inputs=ref({}),recentEvents=ref([]),signalSearch=ref('')
const runMode=ref('routine'),automaticSignals=ref(true),targetHeight=ref(800),barrel=ref('left'),cell=shallowRef(null),capacityLitres=ref(props.toolType==='tool-700'?100:90)
const legacyNote=computed(()=>source.value?.simulationCompatibility?'过渡按 2025-09-29 可读源码执行；与 2026 版是否一致待确认。':'')
const displayFiles=computed(()=>[...(source.value?.files||[]),...(source.value?.simulationCompatibility?.file?[source.value.simulationCompatibility.file]:[])])
const fillPercent=computed(()=>cell.value?Math.min(100,100*(cell.value.depositedVolume||0)/cell.value.targetVolume):0)
watch(()=>props.toolType,type=>{if(!busy.value)capacityLitres.value=type==='tool-700'?100:90})
const routines=computed(()=>index.value?.routines?.filter(item=>item.kind==='PROC')||[])
const signalChoices=computed(()=>index.value?.simulationInputs?.filter(item=>item.kind==='signal')||[])
const filteredSignals=computed(()=>signalChoices.value.filter(item=>(item.name+' '+(item.label||'')).toLowerCase().includes(signalSearch.value.toLowerCase())).slice(0,30))
const needs=computed(()=>{
 const stop=stopInfo.value
 if(stop?.type==='wait'&&stop.signal)return [{kind:'signal',name:stop.signal,type:signalChoices.value.find(i=>i.name.toLowerCase()===stop.signal.toLowerCase())?.type||'DI',reason:'当前 '+stop.current+'，等待 '+stop.expected}]
 const requested=stop?.needs||[]
 return requested.length?requested:(!session.state?(plan.value?.simulationInputs||[]).filter(i=>i.kind==='parameter'):[])
})
let disposed=false,generation=0
function report(text){status.value=text;emit('status',text)}
function annotate(item){
 if(!item)return null
 const stack=session.state?.stack,routine=index.value?.routines?.find(r=>r.name===item.routine)||index.value?.routines?.find(r=>r.id===stack?.at(-1)?.routineId)||plan.value?.routine
 const file=displayFiles.value.find(f=>f.id===(item.fileId||routine?.fileId)),line=item.line
 const lines=file?.text?.split(/\r?\n/)||[],start=Math.max(0,(line||1)-4)
 return {...item,fileId:file?.id||routine?.fileId,file:file?.name||item.file||routine?.file,code:item.code||(line?lines[line-1]?.trim()||item.instruction||item.message:item.message),excerpt:lines.slice(start,start+9).map((text,i)=>({line:start+i+1,text}))}
}
function animate(motion){return new Promise((resolve,reject)=>{if(!props.motionAllowed||props.speedPercent<=0){reject(Error(props.interlockReason||'运动许可已撤销'));return}emit('move',{...motion,speed:()=>props.speedPercent/100,done:ok=>ok===false?reject(Error('动作已停止，程序位置保留')):resolve()})})}
const localProgram=createLocalProgram({createWorker:()=>new Worker(programWorkerUrl,{type:'module'}),fallback:async(body,options)=>(await simulateRobotProgram(backupId.value,body,options)).data})
const session=new AbbProgramSession({request:(body,options)=>localProgram.request(body,options),getJoints:()=>props.joints,move:animate,stopMotion:()=>emit('stop'),frames:()=>plan.value?.frames||{},speed:()=>props.speedPercent/100,update:patch=>{
 if(disposed)return
 if('toolSignals' in patch)emit('tool-signals',patch.toolSignals)
 if('cell' in patch){cell.value=patch.cell;emit('cell',patch.cell)}
 if('busy' in patch){busy.value=patch.busy;emit('running',patch.busy)}
 if('error' in patch){error.value=patch.error;if(patch.error)report('已停止：'+patch.error)}
 if('stop' in patch)stopInfo.value=patch.stop
 if('current' in patch){current.value=annotate(patch.current);emit('location',current.value)}
 if(patch.status)report(patch.stop?.type==='end'&&runMode.value==='full'?(cell.value?.complete?'全流程完成：已装填至 '+cell.value.targetHeight+' mm，收尾完成':'主程序已退出，目标装填尚未完成'):patch.status)
 if(patch.events?.length)recentEvents.value=[...recentEvents.value,...patch.events].slice(-8)
}})
function stop(){++generation;session.stop();busy.value=false;emit('running',false);report('已停止，保留当前程序位置')}
function clear(){session.clear();busy.value=false;emit('running',false);stopInfo.value=null;recentEvents.value=[];current.value=null;emit('location',null);inputs.value={};error.value='';cell.value=null;emit('cell',null);emit('tool-signals',null)}
async function loadBackup(){
 const id=++generation;clear();plan.value=null;index.value=null;source.value=null;loading.value=true
 try{
  if(!backupId.value)return
  const [motion,backup]=await Promise.all([getRobotMotion(backupId.value),getRobotBackup(backupId.value)])
  if(disposed||id!==generation)return
  localProgram.load(backup.data.report)
  index.value=motion.data;source.value=backup.data.report
  if(!routines.value.some(r=>r.id===routineId.value))routineId.value=routines.value.find(r=>r.name==='main_Pose_teach')?.id||routines.value.find(r=>r.name==='main')?.id||routines.value[0]?.id||''
  await fetchRoutine(id)
 }catch(e){if(id===generation)error.value=e.response?.data?.msg||e.message}finally{if(id===generation)loading.value=false}
}
function initialSource(){if(!plan.value)return;current.value=annotate({routine:plan.value.routine.name,fileId:plan.value.routine.fileId,line:plan.value.routine.startLine});emit('location',current.value)}
async function fetchRoutine(id){if(!backupId.value||!routineId.value)return;const result=(await getRobotMotion(backupId.value,routineId.value)).data;if(disposed||id!==generation)return;plan.value=result;initialSource();report('已选择 '+result.routine.name+'，等待启动')}
async function loadRoutine(){const id=++generation;clear();plan.value=null;loading.value=true;try{await fetchRoutine(id)}catch(e){if(id===generation)error.value=e.response?.data?.msg||e.message}finally{if(id===generation)loading.value=false}}
async function locatePoint(action){if(!props.motionAllowed){error.value=props.interlockReason||'手动运动未使能';return}if(busy.value||loading.value)return;clear();current.value=annotate(action);busy.value=true;const id=generation;try{await animate(prepareProgramMotion(action,props.joints,plan.value.frames));if(id===generation)report('已定位 '+action.target.ref+'；启动程序时从所选例程开始')}catch(e){if(id===generation)error.value=e.message}finally{if(id===generation)busy.value=false}}
function values(){const result={};for(const [name,value] of Object.entries(inputs.value)){if(value===undefined||value==='')continue;try{result[name]=typeof value==='string'?JSON.parse(value):value}catch{throw Error(name+' 需要有效数值或 JSON')}}return result}
async function execute(single=false){
 if(!props.motionAllowed){error.value=props.interlockReason||'手动运动未使能';return}
 if(busy.value||loading.value)return
 if(!plan.value){report('请先选择备份与例程');return}
 const executionGeneration=generation;busy.value=true;emit('running',true);
 try{const supplied=values(),signals={},parameters={},data={};for(const [name,value] of Object.entries(supplied)){if(signalChoices.value.some(s=>s.name===name)||needs.value.some(s=>s.kind==='signal'&&s.name===name))signals[name]=value;else if(plan.value.simulationInputs?.some(s=>s.kind==='parameter'&&s.name===name))parameters[name]=value;else data[name]=value}const automation=index.value.automation&&automaticSignals.value?{profile:index.value.automation.id,targetHeight:targetHeight.value,barrel:barrel.value,capacityLitres:capacityLitres.value}:null;if(!session.state&&automation){const plant=await props.prepareCell?.({barrel:barrel.value});if(plant)Object.assign(automation,plant)}if(disposed||executionGeneration!==generation)return;await session.run({single,routine:runMode.value==='full'?index.value.automation.entry:routineId.value,signals,inputs:data,parameters,automation,toolType:props.toolType})}catch(e){if(executionGeneration===generation)error.value=e.message}finally{if(executionGeneration===generation&&!session.running){busy.value=false;emit('running',false)}}
}
function start(){if(runMode.value==='full')clear();runMode.value='routine';return execute(false)}
async function runAll(){if(runMode.value!=='full'||!session.state||session.ended)clear();runMode.value='full';automaticSignals.value=true;return execute(false)}
function step(){return execute(true)}
function resume(){if(session.state&&needs.value.some(item=>item.kind==='input'||item.kind==='parameter')){const supplied=inputs.value;session.clear();inputs.value=supplied;report('应用缺失输入后，从当前例程开头重新执行')}return execute(false)}
async function restart(){const id=++generation;clear();emit('reset-pot',barrel.value);runMode.value='routine';busy.value=true;emit('running',true);try{await props.resetPose?.({automation:!!index.value?.automation});if(disposed||id!==generation)return;initialSource();report('已回到起始位，程序与装填进度已重置')}catch(e){if(id===generation)error.value=e.message}finally{if(id===generation){busy.value=false;emit('running',false)}}}
function back(){return session.back()}
function poseChanged(){session.markManualPoseChange();busy.value=false;if(session.manualPoseChanged)report('姿态已手动改变，重新开始后再运行程序')}
function selectRoutine(id){if(busy.value)return;routineId.value=id;return loadRoutine()}
function selectBackup(id){if(busy.value)return;backupId.value=id;return loadBackup()}
function setSignal(name,value){if(busy.value)return;inputs.value={...inputs.value,[name]:value}}
defineExpose({start,runAll,step,stop,back,poseChanged,restart,selectRoutine,selectBackup,setSignal})
watch([plan,current,recentEvents,inputs,library],()=>emit('context',{routine:plan.value?.routine,routines:routines.value,library:library.value,backup:library.value.find(b=>b.id===backupId.value),files:displayFiles.value,frames:plan.value?.frames||{},signals:signalChoices.value.map(s=>({...s,value:inputs.value[s.name]??session.state?.signals?.[s.name.toLowerCase()]??0})),events:recentEvents.value,status:status.value}),{deep:true})
watch(error,value=>{if(value)emit('status','已停止：'+value)})
watch(()=>props.motionAllowed,allowed=>{if(!allowed&&session.running){stop();error.value=props.interlockReason||'手动运动许可已撤销'}})
onMounted(async()=>{loading.value=true;try{library.value=(await listRobotBackups()).data;if(disposed)return;if(!library.value.some(item=>item.id===backupId.value))backupId.value=library.value.find(item=>/酿酒/.test(item.displayName||item.filename))?.id||library.value.find(item=>/七车间/.test(item.displayName||item.filename))?.id||library.value[0]?.id||'';if(backupId.value)await loadBackup()}catch(e){if(!disposed)error.value=e.response?.data?.msg||e.message}finally{if(!disposed)loading.value=false}})
onBeforeUnmount(()=>{disposed=true;++generation;session.stop();localProgram.dispose();emit('running',false)})
</script>
<style scoped src="./AbbProgramControl.css"></style>


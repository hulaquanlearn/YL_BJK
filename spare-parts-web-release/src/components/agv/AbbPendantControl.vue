<template>
  <div class="abb-linked-pendant" :class="{'is-pendant-primary':primaryView==='pendant'}">
    <div class="pendant-model-pane">
      <FlexPendantModel ref="pendantModel" :title="screenTitle" :step="screen" :status="screenStatus" @inspect="inspectKey" @action="selectMenu" @hardware="explainHardware" @jog="jog" @control="hardwareControl"/>
    </div>
    <div ref="robotTarget" class="pendant-robot-target"></div>
    <div class="pendant-column">
      <div class="pendant-help" role="status"><strong>{{help.title}}</strong><p>{{help.text}}</p></div>
      <div v-if="programRunning || programCurrent" class="pendant-live-status" role="status"><strong>{{programRunning?'程序运行中':'程序状态'}}</strong><span>{{programStatus}}</span><small v-if="programCurrent?.line">{{programCurrent.file||programCurrent.fileId}} · 第 {{programCurrent.line}} 行</small><code v-if="programCurrent?.code" class="pendant-current-code">{{programCurrent.code}}</code></div>
    </div>
    <section class="pendant-robot-column" aria-label="示教器联动机器人">
      <div class="pendant-axis-row" aria-label="六轴实时角度"><output v-for="n in 6" :key="n" :aria-label="'J'+n+'当前角度'" :title="'范围：'+jointLimits[n-1][0]+'° ～ '+jointLimits[n-1][1]+'°'">J{{n}} <b>{{format(joints[n-1])}}°</b></output></div>
    </section>
  </div>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {Matrix4,Vector3} from 'three'
import {pendantKeys} from '../../utils/abb-pendant-controls.mjs'
import {robotFlangeMatrix} from '../../utils/abb-kinematics.mjs'
import {inverseRobotJoints} from '../../utils/abb-inverse-kinematics.mjs'
import FlexPendantModel from './FlexPendantModel.vue'
import {robotJointLimits} from '../../utils/abb-kinematics.mjs'
import {pendantHardware} from '../../utils/abb-guide.mjs'
const props=defineProps({primaryView:{type:String,default:'robot'},joints:{type:Array,required:true},jointLimits:{type:Array,default:()=>robotJointLimits},playing:Boolean,programRunning:Boolean,programStatus:{type:String,default:''},programCurrent:{type:Object,default:null},programContext:{type:Object,default:()=>({})},programSpeed:{type:Number,default:100}})
const emit=defineEmits(['target','jog','demo','home','move','stop','program-command'])
const route=useRoute()
const robotTarget=ref(),page=ref(props.programRunning?'production':route.query.backup?'program':'menu'),axis=ref(0),increment=ref(.02),mode=ref('joint')
const programStatus=computed(()=>props.programStatus||'请在主画面选择程序'),programCurrent=computed(()=>props.programCurrent),programContext=computed(()=>props.programContext||{})
// Physical keys address the one shared session; there is no pendant-owned runner.
const programControl={value:Object.fromEntries(['stop','start','step','poseChanged','restart','selectRoutine','selectBackup','setSignal'].map(action=>[action,(...args)=>emit('program-command',{action,args})]))}
const incrementEnabled=ref(false),pendantModel=ref(),listPage=ref(0),fileCurrent=ref(null)
const enableState=ref(0),emergency=ref(false),speedPercent=ref(props.programSpeed??100),motionAllowed=computed(()=>enableState.value===1&&!emergency.value&&speedPercent.value>0)
watch(()=>props.programSpeed,value=>{if(Number.isFinite(value))speedPercent.value=value})
function setSpeed(value){speedPercent.value=Math.max(0,Math.min(100,value));emit('program-command',{action:'setSpeed',args:[speedPercent.value]});if(speedPercent.value===0){programControl.value?.stop();emit('stop')}}
const interlockReason=computed(()=>emergency.value?'模拟急停已按下，请先复位急停':enableState.value!==1?'未使能：先点击使能按钮':speedPercent.value===0?'速度为0，请先在快速设置中调整速度':'')
const help=ref({title:'IRC5 / RobotWare 6.08',text:'硬按键位置按ABB手册；屏幕为离线功能子集。上方可编程键保持未配置，底部为程序控制键。'})
const format=value=>(Number(value)||0).toFixed(3)
const jogStep=computed(()=>!incrementEnabled.value?(mode.value==='linear'?10:1):mode.value==='linear'?({'0.005':.05,'0.02':1,'0.2':5}[increment.value]):increment.value)
const incrementName=computed(()=>incrementEnabled.value?({'0.005':'小','0.02':'中','0.2':'大'}[increment.value]):'无')
const screenTitle=computed(()=>page.value==='jog'?({joint:'关节点动',linear:'基坐标直线',orient:'法兰重定位'}[mode.value]):({program:'程序编辑器',production:'自动生产窗口',frames:'程序数据',io:'输入输出',control:'控制面板',logs:'事件日志',info:'系统信息',files:'FlexPendant 资源管理器',backup:'备份与恢复',calibrate:'校准',hotedit:'HotEdit',locked:'锁定屏幕','routine-picker':'选择例程','source-view':'程序源码'}[page.value]||'FlexPendant'))
const screenStatus=computed(()=>['program','production','hotedit'].includes(page.value)?programStatus.value:'J'+(axis.value+1)+' = '+format(props.joints[axis.value])+'° · '+incrementName.value+' '+jogStep.value+(mode.value==='linear'?'mm':'°'))
const screen=computed(()=>{
 const item=(id,label,rect)=>({id,label,rect})
 const pageName=page.value,ctx=programContext.value
 let choices=[]
 if(pageName==='menu'){
  const left=[['hotedit','HotEdit'],['io','输入输出'],['jog','手动操纵'],['program','程序编辑器'],['frames','程序数据'],['production','自动生产窗口'],['remote','遥控']],right=[['backup','备份与恢复'],['calibrate','校准'],['control','控制面板'],['files','FlexPendant 资源管理器'],['lock','锁定屏幕'],['info','系统信息'],['logs','事件日志']]
  choices=[...left.map(([id,label],i)=>item(id,label,[8,77+i*43,300,117+i*43])),...right.map(([id,label],i)=>item(id,label,[312,77+i*43,637,117+i*43]))]
 }
 else if(pageName==='jog')choices=[item('mechanical-unit','机械单元       ROB_1',[8,105,320,146]),item('motion-mode','动作模式       '+({joint:'轴 1–3 / 4–6',linear:'线性',orient:'重定位'}[mode.value]),[8,151,320,192]),item('frames','工具             tool0',[8,197,320,238]),item('frames','工件坐标         wobj0',[8,243,320,284]),item('increment-size','增量             '+incrementName.value,[8,289,320,330]),item('remote','遥控 · 方向箭头',[8,335,320,376])]
 else if(['program','production','hotedit','source-view'].includes(pageName))choices=[item('program-routine','任务与程序 ▾',[3,73,218,105]),item('program-module','模块 ▾',[219,73,430,105]),item('program-select-routine','例行程序 ▾',[431,73,642,105]),item('program-debug','调试 ▴',[220,395,420,438])]
 else if(pageName==='quickset')choices=[item('speed-minus-1','−1%',[325,190,425,240]),item('speed-plus-1','＋1%',[465,190,565,240]),item('speed-minus-5','−5%',[325,270,425,320]),item('speed-plus-5','＋5%',[465,270,565,320]),...[0,25,50,100].map((value,i)=>item('speed-set-'+value,value+'%',[304+i*72,350,369+i*72,413])),item('jog','操纵',[600,94,642,153]),item('remote','遥控',[600,160,642,219]),item('program','程序',[600,226,642,285])]
 else choices=[item('base-frame','基坐标系',[8,105,620,150]),item('tool-frame','工具坐标系',[8,160,620,205]),item('tcp','工具 TCP',[8,215,620,260]),item('menu','返回主菜单',[8,320,620,365])]
 const rows=[]
 if(pageName==='production')choices=choices.filter(c=>c.id!=='program-debug').concat(item('program-load','加载程序…',[3,395,215,438]),item('program-main','PP 移至 Main',[216,395,435,438]))
 const list=(values,prefix,label)=>{choices=values.slice(listPage.value*6,listPage.value*6+6).map((value,i)=>item(prefix+value.id,label(value),[10,94+i*45,625,135+i*45]));if(values.length>6)choices.push(item('list-prev','上一页',[10,385,180,430]),item('list-next','下一页',[440,385,625,430]))}
 if(pageName==='routine-picker')list(ctx.routines||[],'choose-routine:',r=>r.task+' · '+r.name)
 if(pageName==='backup')list(ctx.library||[],'choose-backup:',b=>b.displayName||b.filename)
 if(pageName==='files')list(ctx.files||[],'choose-file:',f=>f.name)
 if(pageName==='io'){const values=ctx.signals||[];choices=values.slice(listPage.value*6,listPage.value*6+6).map((s,i)=>item('signal:'+s.name,s.type+'  '+s.name+' = '+s.value,[10,94+i*45,625,135+i*45]));if(values.length>6)choices.push(item('list-prev','上一页',[10,385,180,430]),item('list-next','下一页',[440,385,625,430]))}
 if(pageName==='control')choices=[item('enable-toggle','使能：'+(enableState.value===1?'已使能':'未使能'),[10,100,625,145]),item('quickset','速度：'+speedPercent.value+'%',[10,155,625,200]),item('motion-mode','动作模式',[10,210,625,255]),item('axis-group','切换轴组',[10,265,625,310]),item('increment-size','增量：'+incrementName.value,[10,320,625,365])]
 if(pageName==='info'){choices=[];rows.push('ABB IRB 6700-150/3.20','IRC5 / RobotWare 6.08','机械单元 ROB_1',ctx.backup?.displayName||ctx.backup?.filename||'尚未选择备份','当前例程：'+(ctx.routine?.name||'未选择'),'当前状态：'+programStatus.value)}
 if(pageName==='logs'){choices=[];rows.push(...(ctx.events||[]).map(e=>e.type==='io'?e.signal+' = '+e.value:(e.instruction||e.type)+' · '+(e.line||'')));if(!rows.length)rows.push('当前会话暂无事件')}
 if(pageName==='calibrate'){choices=[];rows.push('当前备份坐标数据（只读）',...(ctx.frames?.tools||[]).map(t=>'工具 '+t.name+': TCP '+JSON.stringify(t.tcp)),...(ctx.frames?.wobjs||[]).map(w=>'工件 '+w.name));if(rows.length===1)rows.push('当前备份尚无已解析的坐标数据')}
 if(pageName==='locked')choices=[item('unlock','解除屏幕锁定',[170,220,475,285])]
 if(pageName==='hotedit'){choices=[item('program','查看当前程序',[10,260,625,305]),item('frames','查看工具与工件数据',[10,320,625,365])];rows.push('HotEdit 位置微调尚未仿真','当前只读查看备份数据，不改写 RAPID 点位')}
 return {page:pageName,choices,rows:rows.slice(0,10),current:pageName==='source-view'?fileCurrent.value:programCurrent.value,routine:ctx.routine,joints:props.joints,enableState:enableState.value,emergency:emergency.value,speedPercent:speedPercent.value,programRunning:props.programRunning,incrementEnabled:incrementEnabled.value}
})
function chooseAxis(index){axis.value=index;page.value='jog';help.value={title:'J'+(index+1)+' 关节点动',text:['底座回转，改变机器人面向的工位。','主臂前后摆动，与 3 轴配合改变末端位置。','肘关节摆动，完成伸臂和收臂。','前臂回转，调整腕部姿态。','腕部摆动，改变工具倾角。','工具法兰自转，调整工具朝向。'][index]+' 点击摇杆上半部为正向，下半部为负向；增量键可切换步距。'}}
function selectMenu(action){
 if(page.value==='locked'&&action!=='unlock')return
 if(action==='unlock'){page.value='menu';return}
 if(action==='list-next'){const ctx=programContext.value,count=(page.value==='io'?ctx.signals:page.value==='files'?ctx.files:page.value==='backup'?ctx.library:ctx.routines)?.length||0;listPage.value=Math.min(Math.max(0,Math.ceil(count/6)-1),listPage.value+1);return}if(action==='list-prev'){listPage.value=Math.max(0,listPage.value-1);return}
 if(action.startsWith('choose-routine:')){programControl.value?.selectRoutine(action.slice(15));page.value='production';return}
 if(action.startsWith('choose-backup:')){programControl.value?.selectBackup(action.slice(14));page.value='production';return}
 if(action.startsWith('choose-file:')){const file=programContext.value.files?.find(f=>f.id===action.slice(12));if(file){fileCurrent.value={file:file.name,fileId:file.id,line:1,excerpt:(file.text||'').split(/\r?\n/).slice(0,10).map((text,i)=>({line:i+1,text}))};page.value='source-view'}return}
 if(action.startsWith('signal:')){const name=action.slice(7),signal=programContext.value.signals?.find(s=>s.name===name);if(signal&&/^(DI|DO)$/.test(signal.type))programControl.value?.setSignal(name,Number(signal.value)?0:1);else help.value={title:'模拟信号',text:'数值信号请在程序面板输入实际模拟值。'};return}
 if(action==='enable-toggle'){toggleEnable();return}
 if(action==='session-logout'){programControl.value?.stop();setEnable(0);page.value='locked';return}
 if(action==='session-restart'){programControl.value?.restart();setEnable(0);mode.value='joint';setSpeed(100);page.value='menu';return}
 if(action==='program-load'){page.value='backup';listPage.value=0;return}
 if(action==='program-main'){const ctx=programContext.value,main=ctx.routines?.find(r=>r.name==='main'&&r.task===ctx.routine?.task);if(main)programControl.value?.selectRoutine(main.id);else programControl.value?.restart();page.value='production';return}
 if(action.startsWith('speed-')){const [,kind,amount]=action.split('-');setSpeed(kind==='set'?Number(amount):speedPercent.value+(kind==='plus'?1:-1)*Number(amount));return}
 if(/^(io|jog|program|frames|control|logs|info|remote)-\d+$/.test(action))action=action.replace(/-\d+$/,'')
 if(action==='remote'){pendantModel.value?.openJoystick();help.value={title:'摇杆方向',text:'点击黑色摇杆可展开蓝色方向键；斜向同时操作两个方向。运动受使能、轴组和动作模式控制。'};return}
 if(action.startsWith('remote-')){if(action==='remote-stop'){programControl.value?.stop();emit('stop');return}const direction={n:[0,1,0],ne:[1,1,0],e:[1,0,0],se:[1,-1,0],s:[0,-1,0],sw:[-1,-1,0],w:[-1,0,0],nw:[-1,1,0],'z-plus':[0,0,1],'z-minus':[0,0,-1]}[action.slice(7)];if(direction)jog({directions:direction,remote:true});return}
 if(action==='quickset'){page.value='quickset';return}
 if(action==='close'){page.value='menu';return}
 if(['mechanical-unit','motion-mode','axis-group'].includes(action)){const keepRemote=page.value==='remote';hardwareControl(action);if(keepRemote)page.value='remote';return}
 if(action==='increment-size'){increment.value=increment.value===.005 ? .02 : increment.value===.02 ? .2 : .005;incrementEnabled.value=true;return}
 if(action.startsWith('program-')){page.value='routine-picker';listPage.value=0;return}
 if(action.startsWith('axis-')){chooseAxis(Number(action.slice(5)));return}
 if(action==='jog'){chooseAxis(axis.value);return}
 if(action==='program'||action==='production'){page.value=action;return}
 if(['io','control','logs','info','backup','files','calibrate','hotedit','lock'].includes(action)){page.value=action==='lock'?'locked':action;listPage.value=0;return}
 if(action==='frames'){page.value='frames';help.value={title:'工具与坐标',text:'基坐标系固定在底座；法兰坐标系随腕部运动。程序联动使用备份内的 tooldata / wobjdata。'};return}
 if(action==='menu'){page.value='menu';return}
 if(action==='home'){home();return}
 if(action==='jog-positive'||action==='jog-negative'){jog(action==='jog-positive'?1:-1);return}
 if(['start','stop','forward'].includes(action)){hardwareControl(action);return}
 const text={'base-frame':'基坐标固定在机器人底座，X/Y 为水平面方向，Z 向上。直线模式的摇杆操作以该坐标为基准。','tool-frame':'法兰坐标系随末端转动；工具 TCP 由工具数据给出。重定位模式改变法兰方向。','tcp':'TCP 是程序用于定位的工具工作点；更换外形模型不会改写程序中的 TCP，程序联动按备份数据计算。','info':'ABB IRB 6700-150/3.20，IRC5 / RobotWare 6。运动学使用本机 ABB 原始 CAD 的 DH 参数和补偿矩阵。'}
 help.value={title:action==='info'?'系统信息':{'base-frame':'基坐标系','tool-frame':'工具坐标系','tcp':'工具 TCP'}[action]||action,text:text[action]||'选择屏幕功能或实体按键。'}
}
function inspectKey(id){const key=pendantKeys.find(k=>k.id===id);if(key)help.value={title:key.label,text:key.text};else if(id==='emergency')explainHardware(id);else if(id.startsWith('jog-'))explainHardware('joystick')}
let manualJogging=false
function jog(value){
 if(!motionAllowed.value){help.value={title:'手动运动未获许可',text:interlockReason.value};return}
 if(props.playing||props.programRunning){help.value={title:'程序运行中',text:'请先停止主画面程序，再进行手动点动。'};return}
 programControl.value?.poseChanged()
 manualJogging=true
 const step=jogStep.value
 const direction=typeof value==='number'?value:value.direction,channel=typeof value==='number'?axis.value%3:value.channel
 const directions=value?.directions||[0,1,2].map(i=>i===channel?direction:0),length=Math.hypot(...directions)||1,vector=new Vector3(...directions).multiplyScalar(step/length)
 if(!value?.remote)page.value='jog'
 if(value?.directions&&mode.value==='joint'){const group=Math.floor(axis.value/3)*3;emit('jog',{deltas:directions.map((d,i)=>({axis:group+i,delta:d*step/length})).filter(d=>d.delta),duration:incrementEnabled.value?.08:.25,speed:()=>speedPercent.value/100});help.value={title:'摇杆方向点动',text:'当前轴组 '+(group+1)+'–'+(group+3)+'，按所选箭头组合方向同步点动。'};return}
 if(mode.value==='joint'){const selected=typeof value==='number'?axis.value:Math.floor(axis.value/3)*3+channel;emit('jog',{axis:selected,delta:direction*step,duration:incrementEnabled.value?.08:.25,speed:()=>speedPercent.value/100});help.value={title:'J'+(selected+1)+' 点动',text:'按当前步距 '+(direction>0?'+':'−')+step+'° 点动，该轴及下游部件同步运动。'};return}
 const target=robotFlangeMatrix(props.joints,props.jointLimits)
 if(mode.value==='linear'){const baseDirection=new Vector3(-vector.y,vector.x,vector.z),p=new Vector3().setFromMatrixPosition(target).addScaledVector(baseDirection,.001);target.setPosition(p)}
 else target.multiply(new Matrix4().makeRotationAxis(vector.clone().normalize(),step*Math.PI/180))
 const result=inverseRobotJoints(target,props.joints,{attempts:1,positionTolerance:.000001,rotationTolerance:.000001,limits:props.jointLimits})
 if(!result.ok){help.value={title:'点动停止',text:result.reason};return}
 emit('move',{frames:[result.joints],duration:incrementEnabled.value?.08:.35,speed:()=>speedPercent.value/100,done:()=>{}})
 help.value={title:mode.value==='linear'?'基坐标直线点动':'法兰重定位',text:'沿所选方向点动 '+step+(mode.value==='linear'?'mm':'°')+'，按逆运动学更新六轴。'}
}
function explainHardware(id){const item=pendantHardware.find(h=>h.id===id);if(item)help.value={title:item.label,text:item.text}}
function hardwareControl(action){
 if(action==='jog-release'){if(manualJogging){manualJogging=false;emit('stop')}return}
 if(action==='enable'){toggleEnable();return}
 if(action==='reset-emergency'){resetEmergency();return}
 if(action==='emergency'){emergency.value=true;setEnable(0);help.value={title:'模拟急停',text:'程序和点动已停止。复位急停后仍需重新使能并主动启动。'};return}
 inspectKey(action)
 if(action.startsWith('preset-')){help.value={title:'可编程键未配置',text:'实机功能由控制面板 ProgKeys 决定，当前没有读取到现场按键配置。'};return}
 if(action==='mechanical-unit'){help.value={title:'机械单元 ROB_1',text:'当前只有一个机器人机械单元，选择保持 ROB_1。'};return}
 if(action==='axis-group'){mode.value='joint';chooseAxis(axis.value<3?3:0);return}
 if(action==='increment'){incrementEnabled.value=!incrementEnabled.value;help.value={title:'切换增量',text:incrementEnabled.value?'启用已选择的增量':'关闭增量；鼠标摇杆使用短点动'};return}
 if(action==='motion-mode'){mode.value=mode.value==='linear'?'orient':'linear';page.value='jog';return}
 if(action==='stop'){programControl.value?.stop();emit('stop');return}
 if(['start','forward','backward'].includes(action)){
  if(!motionAllowed.value){help.value={title:'程序运动未获许可',text:interlockReason.value};return}
  if(page.value!=='program')selectMenu('program')
  if(action==='start')programControl.value?.start();else if(action==='forward')programControl.value?.step();else help.value={title:'步退尚未实现',text:'IRC5步退按RAPID指令处理，不能用模型姿态历史代替；当前不执行步退。'}
 }
}
function setEnable(value){enableState.value=value;if(value!==1){programControl.value?.stop();emit('stop')}help.value={title:'背部三段使能',text:value===1?'保持在中间位置，允许手动点动和手动程序运行；使能本身不会启动运动。':value===2?'完全压下，运动许可撤销。先松开，再重新压到中间位置。':'已松开，手动运动停止。'}}
function toggleEnable(){setEnable(enableState.value===0?1:0)}
function resetEmergency(){emergency.value=false;setEnable(0)}
function home(){if(props.programRunning)return;programControl.value?.poseChanged();emit('home');help.value={title:'回参考位',text:'恢复到 J1=0°、J2=0°、J3=0°、J4=0°、J5=90°、J6=0°。'}}

onMounted(()=>emit('target',robotTarget.value))
onBeforeUnmount(()=>emit('target',null))
</script>
<style scoped>
.pendant-live-status{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding:12px 16px;background:#eaf5f0;border:1px solid #bcdccd;border-radius:10px;color:#256751;font-size:13px}.pendant-live-status small{color:#648777}
.abb-linked-pendant{display:grid;grid-template-columns:minmax(300px,.85fr) minmax(400px,1.4fr);gap:18px;padding:18px;min-height:0;overflow:auto;flex:1}.pendant-column,.pendant-robot-column{min-width:0}.pendant-help{padding:14px 16px;margin-top:12px;border:1px solid #d4e4ec;background:#edf7fa;border-radius:10px}.pendant-help strong{font-size:14px;color:#256679}.pendant-help p{font-size:13px;line-height:1.8;color:#5c7c90;margin:7px 0 0}.pendant-robot-column{display:flex;flex-direction:column}.pendant-robot-target{height:430px;flex:1;min-height:300px;position:relative;display:flex;background:radial-gradient(ellipse at 50% 35%,#fff,#dbe8f1);border:1px solid #d2e2ec;border-radius:12px;overflow:hidden}.pendant-robot-target :deep(.robot-stage){width:100%;height:100%}.pendant-axis-row{display:flex;gap:5px;margin-top:12px;flex-wrap:wrap}.pendant-axis-row output{flex:1;white-space:nowrap;font-size:12px;padding:7px;text-align:center;border:1px solid #d3e2ea;border-radius:7px;color:#618093;background:#fff}.pendant-axis-row b{display:block;font-size:11px;margin-top:3px}
@media(max-width:850px){.abb-linked-pendant{grid-template-columns:1fr;padding:12px}.pendant-robot-target{height:360px;flex:none}.pendant-column{max-width:600px;width:100%;justify-self:center}}
.abb-linked-pendant>.pendant-model-pane{grid-column:1;grid-row:1;min-width:0;display:flex}
.pendant-model-pane :deep(.flexpendant-model){width:100%;min-width:0}
.abb-linked-pendant>.pendant-robot-target{grid-column:2;grid-row:1;min-width:0}
.abb-linked-pendant.is-pendant-primary>.pendant-model-pane{grid-column:2}
.abb-linked-pendant.is-pendant-primary>.pendant-robot-target{grid-column:1}
.abb-linked-pendant>.pendant-column,.abb-linked-pendant.is-pendant-primary>.pendant-column{grid-column:1;grid-row:2}
.abb-linked-pendant>.pendant-robot-column,.abb-linked-pendant.is-pendant-primary>.pendant-robot-column{grid-column:2;grid-row:2;align-self:end}
.pendant-current-code{font:11px/1.6 Consolas,monospace;overflow-wrap:anywhere}
@media(min-width:851px){
 .abb-linked-pendant{grid-template-rows:minmax(300px,1fr) auto}
 .abb-linked-pendant>.pendant-robot-target{grid-row:1/3;height:auto;min-height:0;margin-bottom:72px;align-self:stretch}
 .abb-linked-pendant.is-pendant-primary>.pendant-robot-target{grid-row:1/3}
 .abb-linked-pendant.is-pendant-primary>.pendant-column{grid-column:2}
 .abb-linked-pendant.is-pendant-primary>.pendant-robot-column{grid-column:1}
}
@media(max-width:850px){.abb-linked-pendant>.pendant-model-pane,.abb-linked-pendant.is-pendant-primary>.pendant-model-pane,.abb-linked-pendant>.pendant-robot-target,.abb-linked-pendant.is-pendant-primary>.pendant-robot-target{grid-column:1}.abb-linked-pendant:not(.is-pendant-primary)>.pendant-model-pane{grid-row:2}.abb-linked-pendant:not(.is-pendant-primary)>.pendant-robot-target{grid-row:1;height:360px}.abb-linked-pendant.is-pendant-primary>.pendant-model-pane{grid-row:1}.abb-linked-pendant.is-pendant-primary>.pendant-robot-target{grid-row:2;height:240px}.abb-linked-pendant:not(.is-pendant-primary)>.pendant-model-pane :deep(.flexpendant-canvas){height:240px}.abb-linked-pendant.is-pendant-primary>.pendant-model-pane :deep(.flexpendant-canvas){height:360px}.abb-linked-pendant>.pendant-column,.abb-linked-pendant.is-pendant-primary>.pendant-column{grid-column:1;grid-row:3}.abb-linked-pendant>.pendant-robot-column,.abb-linked-pendant.is-pendant-primary>.pendant-robot-column{grid-column:1;grid-row:4}}
</style>



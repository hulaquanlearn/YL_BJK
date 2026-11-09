<template>
  <section ref="fullscreenHost" :class="{'model-fullscreen':fullscreen,'program-open':programOpen && !guide}" class="robot-viewer" aria-label="ABB机器人三维模型">
    <header class="robot-toolbar"><span class="robot-metrics">6轴 · 150kg · 工作半径3.20m</span><div class="robot-toolbar-right">
      <button :aria-pressed="drawer" @click="drawer=!drawer">系统与部件</button>
      <ElSelect ref="toolSelect" v-model="toolId" @change="closeToolSelect" aria-label="选择机器人工具" :disabled="!ready || programRunning" class="robot-tool-select workbench-picker" popper-class="workbench-picker-menu" fit-input-width :show-arrow="false" :offset="6"><ElOption value="none" label="不显示工具" @click="closeToolSelect"/><ElOption v-for="tool in robotTools" :key="tool.id" :value="tool.id" :label="tool.label" @click="closeToolSelect"/></ElSelect>
      <div class="robot-tool-menu"><button class="robot-menu-trigger" :aria-expanded="toolbarMenu==='scene'" @click="toolbarMenu=toolbarMenu==='scene'?'':'scene'">场景设置</button><div v-if="toolbarMenu==='scene'" class="robot-tool-menu-body"><button :aria-pressed="potEnabled" :disabled="!ready" @click="togglePot">甑锅模型</button><button :aria-pressed="plantEnabled" :disabled="!ready || plantLoading" @click="togglePlant">接料设备</button><button :aria-pressed="!hidden.has('infrared-camera')" :disabled="!ready" @click="toggleVisibility('infrared-camera')">红外相机</button><button :aria-pressed="framesEnabled" @click="toggleFrames">坐标系</button><button :aria-pressed="labelsEnabled" @click="labelsEnabled=!labelsEnabled">标签</button></div></div>
      <div class="robot-tool-menu"><button class="robot-menu-trigger" :aria-expanded="toolbarMenu==='equipment'" @click="toolbarMenu=toolbarMenu==='equipment'?'':'equipment'">设备动作</button><div v-if="toolbarMenu==='equipment'" class="robot-tool-menu-body"><button :disabled="!ready || receivingMotion || programRunning" @click="showReceivingPose">回归接料位</button><button :disabled="!potEnabled" :aria-pressed="lidTargets.left>0" @click="toggleLid('left')">左甑液压锅盖</button><button :disabled="!potEnabled" :aria-pressed="lidTargets.right>0" @click="toggleLid('right')">右甑液压锅盖</button><button :disabled="!toolEnabled || programRunning" :aria-pressed="guardTarget>0" @click="guardTarget=guardTarget?0:1">布料斗挡料护罩</button><button :disabled="!toolEnabled || programRunning" :aria-pressed="rotorRunning" @click="rotorRunning=!rotorRunning">布料斗打散轴</button><button :disabled="!toolEnabled || programRunning" :aria-pressed="manualBeltDirection===1" @click="manualBeltDirection=manualBeltDirection===1?0:1">布料斗皮带正转</button><button :disabled="!toolEnabled || programRunning" :aria-pressed="manualBeltDirection===-1" @click="manualBeltDirection=manualBeltDirection===-1?0:-1">布料斗皮带反转</button><button :disabled="!plantEnabled || programRunning" :aria-pressed="feedGateTarget>0" @click="feedGateTarget=feedGateTarget?0:1">暂存斗弧形挡料板</button><button :disabled="!plantEnabled || programRunning" :aria-pressed="manualChainRunning" @click="manualChainRunning=!manualChainRunning">暂存斗链板行走</button></div></div>
      <button :aria-pressed="programMode" :aria-expanded="programOpen" :disabled="!ready" @click="toggleProgram">程序运行</button>
    </div></header>
    <div v-if="toolLoading || toolFailure" class="robot-tool-status" :role="toolFailure?'alert':'status'">{{toolLoading?toolProgress:toolFailure}}<button v-if="toolFailure" @click="loadTool">重试</button></div>
    <div v-if="plantFailure" class="robot-tool-status" role="alert">{{plantFailure}}<button @click="loadPlant('feed-station')">重试</button></div>
    <div class="abb-model-workspace" :class="{'has-drawer':drawer}">
      <AbbRobotGuide v-if="guide" :mode="guide" :joints="joints" :joint-limits="activeLimits" :motion-playing="motionPlaying" :program-running="programRunning" :program-status="programStatus" :program-current="programCurrent" :program-context="programContext" :program-speed="programSpeed" @program-command="handleProgramCommand" @target="pendantTarget=$event" @jog="jogJoint" @demo="setMotionDemo" @home="homeRobot" @move="moveRobot" @stop="stopMotion" @close="guide=''"/>
      <aside v-if="drawer" class="robot-tree" aria-label="机器人系统与部件">
        <header><strong>系统与部件 <small>{{partInfo.length}}</small></strong><button aria-label="关闭机器人部件面板" @click="drawer=false">×</button></header>
        <div class="robot-tree-scroll"><section v-for="group in groups" :key="group.label"><h2>{{group.label}}</h2><div v-for="part in groupParts(group)" :key="part.id" class="robot-part" :class="{selected:selected===part.id}"><button :aria-pressed="selected===part.id" :disabled="!ready || part.id==='tool' && (toolLoading || !!toolFailure)" @click="selectPart(part.id)">{{part.label}}</button><button :aria-label="(hidden.has(part.id)?'显示':'隐藏')+part.label" :aria-pressed="!hidden.has(part.id)" :disabled="!ready || part.id==='tool' && (toolLoading || !!toolFailure)" @click="toggleVisibility(part.id)">{{hidden.has(part.id)?'○':'◉'}}</button><p v-if="selected===part.id" class="robot-part-description">{{part.description}}</p></div></section></div>
        <button class="robot-show-all" :disabled="!ready || !hidden.size" @click="showAll">显示全部部件</button>
      </aside>
      <aside v-if="programMounted" v-show="programOpen && !guide" class="robot-program-pane" aria-label="当前模型程序运行"><AbbProgramControl ref="programControl" @close-panel="programOpen=false" @exit-mode="exitProgramMode" :actions-target="programMode && !guide ? programActionTarget : null" :speed-target="programMode && !guide ? programSpeedTarget : null" :tool-type="toolId==='none'?lastToolId:toolId" v-model:override-percent="programSpeed" v-model:playback-rate="playbackRate" :joints="joints" :motion-allowed="ready && !receivingMotion" :speed-percent="programSpeed*playbackRate" :prepare-cell="prepareProgramCell" :reset-pose="resetProgramPose" @reset-pot="resetProgramPot" @cell="setProgramCell" @tool-signals="setProgramToolSignals" @running="setProgramRunning" @status="programStatus=$event" @location="programCurrent=$event" @context="programContext=$event" interlock-reason="请等待接料定位完成" @move="moveRobot" @stop="stopMotion"/></aside>
      <Teleport :to="pendantTarget || 'body'" :disabled="!pendantTarget"><div class="robot-stage"><div ref="host" :class="{'click-panning':clickPanning}" class="robot-canvas" @contextmenu.prevent @pointerdown="pointerDown" @pointerup="pick"/>
        <svg v-if="labelsEnabled" class="robot-leaders" aria-hidden="true"><g v-for="label in labels.filter(item=>!selected || item.id===selected)" :key="label.id"><path :d="label.path"/><circle :cx="label.anchorX" :cy="label.anchorY" r="3.5"/></g></svg><button v-for="label in labelsEnabled?labels:[]" :key="label.id" class="robot-label" :aria-pressed="selected===label.id" :style="{left:label.x+'px',top:label.y+'px',width:label.width+'px',height:label.height+'px'}" @click="selectPart(label.id)">{{label.text}}</button>
        <div v-if="loading" class="robot-status" role="status">正在加载 ABB 机器人模型…</div>
        <div v-else-if="failure" class="robot-status" role="alert"><p>{{failure}}</p><button @click="retry">重新加载</button></div>
        <div v-if="selectedInfo" class="robot-info" role="status"><header><strong>{{selectedInfo.label}}</strong><button aria-label="关闭机器人部件说明" @click="selectPart('')">×</button></header><ModelPartDescription :description="selectedInfo.description" /></div>
        <span v-if="lidMessage" class="robot-receiving-message" role="status">{{lidMessage}}</span><span class="robot-hint">{{clickPanning?'平移中：移动鼠标 · 再次右键或 Esc 退出':(freeView?'拖动360°翻转':'拖动旋转')+' · 右键单击后移动鼠标平移 · 滚轮或双指缩放'}}</span><span v-if="receivingMessage" class="robot-receiving-status" role="status">{{receivingMessage}}</span>
      </div></Teleport>
    </div>
    <footer class="robot-controls" :class="{'program-mode':programMode && !guide}"><div ref="programSpeedTarget" v-show="programMode && !guide" class="robot-program-speed-slot"></div><label v-if="!programMode || guide">结构展开 <input type="range" min="0" max="100" :disabled="!ready" :value="spread" aria-label="机器人结构展开程度" @input="setSpread($event.target.value)"><output>{{Math.round(spread)}}%</output></label><span v-if="programMode && !guide" class="robot-program-status" role="status"><span class="robot-status-heading"><strong>{{programDisplay.status || '请选择程序并启动'}}</strong><small v-if="programDisplay.current?.line">{{programDisplay.current.file||programDisplay.current.fileId}} · 第 {{programDisplay.current.line}} 行</small></span><span class="robot-source-line"><code v-if="programDisplay.current?.code" class="robot-current-code" :title="programDisplay.current.code">{{programDisplay.current.code}}</code></span></span><span v-else class="robot-disassembly-status" aria-live="polite">{{robotDisassemblyStatus(spread/100,spreadAnimation?.to===0)}}</span><div class="robot-action-group"><div ref="programActionTarget" v-show="programMode && !guide" class="robot-program-action-slot"></div><template v-if="!programMode || guide"><button class="robot-primary" :disabled="!ready" @click="expandRobot">拆开</button><button :disabled="!ready" @click="reset">复位</button><button :disabled="!ready" @click="setView('front')">正视</button><button :disabled="!ready" @click="setView('top')">俯视</button></template><template v-if="!programMode || guide"><button :aria-pressed="freeView" :disabled="!ready" @click="toggleFreeView">360°查看</button><button :aria-pressed="rotating" :disabled="!ready" @click="rotating=!rotating">旋转</button></template><button :aria-pressed="fullscreen" @click="toggleFullscreen">{{fullscreen?'退出全屏':'全屏'}}</button></div></footer>
  </section>
</template>
<script setup>
import ModelPartDescription from './ModelPartDescription.vue'
import {sampleJointPath} from '../../utils/abb-motion-sampling.mjs'
import {createMaterialSimulation} from '../../utils/abb-material-simulation.mjs'
import {ref,computed,watch,nextTick,onMounted,onBeforeUnmount,defineAsyncComponent,shallowRef,reactive,provide} from 'vue'
import * as THREE from 'three'
import {useRoute} from 'vue-router'
import {ElSelect,ElOption} from 'element-plus'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {FreeModelControls} from '../../utils/free-model-controls.mjs'
import {installModelClickPan} from '../../utils/model-click-pan.mjs'
import {useModelFullscreen} from '../../utils/model-fullscreen.mjs'
import {loadAbbModel,preloadAbbModel,modelLoadingText} from '../../utils/abb-model-loader.mjs'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {applyRobotJoints,clampRobotJoints,robotReferenceJoints,robotFlangeMatrix,robotJointLimits} from '../../utils/abb-kinematics.mjs'
import {layoutAgvLabels} from '../../utils/agv-presentation.mjs'
import {createModelAnchorTracker} from '../../utils/model-surface-anchor.mjs'
import {createModelAnimationClock} from '../../utils/model-animation-clock.mjs'
import {createPartMaterialPool} from '../../utils/model-part-materials.mjs'
import {toolDrive,toolGuardOpen} from '../../utils/abb-tool-drive.mjs'
import {createToolMechanics} from '../../utils/abb-tool-mechanics.mjs'
import {createRobotServicePanel,createRobotBatteryCompartment,robotServicePart,robotBatteryPart} from '../../utils/abb-service-panel.mjs'
import {robotParts,robotGroups,robotModelUrl,robotFrames,robotTools,robotEquipmentParts,robotEquipmentGroup,robotPlantEquipment,robotPotStations,robotReceivingJoints,stainlessEquipment} from '../../utils/abb-robot.mjs'
import {placeBrewingPot,brewingWorkcell} from '../../utils/abb-workcell-layout.mjs'
import {robotDisassemblyStatus} from '../../utils/abb-robot-disassembly.mjs'
import {createProgramDisplay} from '../../utils/abb-program-display.mjs'
import {createCleaningBrush} from '../../utils/abb-cleaning-brush.mjs'
const AbbRobotGuide=defineAsyncComponent(()=>import('./AbbRobotGuide.vue'))
const AbbProgramControl=defineAsyncComponent(()=>import('./AbbProgramControl.vue'))
const route=useRoute(),programSelection=reactive({backupId:String(route.query.backup||''),routineId:String(route.query.routine||'')})
provide('abb-program-selection',programSelection)
const freeView=ref(false),toolbarMenu=ref(''),clickPanning=ref(false);let clickPan=null
const lidTargets=reactive({left:1,right:1}),lidMessage=ref('');
const playbackRate=ref(1),programSpeed=ref(100),programStatus=ref(''),programRunning=ref(false);let materialSimulation=null,programCell=null,chainPhase=0
const programMounted=ref(route.query.program==='1'),programCurrent=shallowRef(null),programContext=shallowRef({})
const activeLimits=computed(()=>programContext.value?.frames?.jointLimits||robotJointLimits)
const programDisplay=shallowRef({status:'',current:null}),programPresenter=createProgramDisplay({publish:value=>{programDisplay.value=value}})
watch([programStatus,programCurrent,programRunning],([status,current,running])=>programPresenter.push({status,current,running}),{flush:'post'})
onBeforeUnmount(()=>programPresenter.dispose())
const programActionTarget=ref(),programSpeedTarget=ref()
const programMode=ref(route.query.program==='1'),programOpen=ref(route.query.program==='1'),programControl=ref(),receivingMotion=ref(false),receivingMessage=ref('')
const receivingFlange=robotFlangeMatrix(robotReceivingJoints)
const atReceiving=computed(()=>{const pose=robotFlangeMatrix(joints.value,activeLimits.value),position=new THREE.Vector3().setFromMatrixPosition(pose),target=new THREE.Vector3().setFromMatrixPosition(receivingFlange),rotation=new THREE.Quaternion().setFromRotationMatrix(pose),reference=new THREE.Quaternion().setFromRotationMatrix(receivingFlange);return position.distanceTo(target)<.015&&rotation.angleTo(reference)<THREE.MathUtils.degToRad(5)})

const fullscreenHost=ref(),{fullscreen,toggle:toggleFullscreen,close:closeFullscreen}=useModelFullscreen(fullscreenHost)
const pendantTarget=shallowRef(null),joints=shallowRef([...robotReferenceJoints]),motionPlaying=ref(false),labelsEnabled=ref(true),labels=shallowRef([])
const guardTarget=ref(0),rotorRunning=ref(false);const manualBeltDirection=ref(0),programToolSignals=ref(null);let beltDistance=0;let toolRig=null,guardAmount=0,rotorAngle=0
const manualChainRunning=ref(false),feedGateTarget=ref(0);let feedGateAmount=0
let demoFrames=[],demoElapsed=0,lastLabelTime=0,lastDemoFit=0,segmentDuration=1.5,motionContinuous=false,motionDone=null,motionRate=()=>1,spreadAnimation=null,sceneDirty=true,labelsDirty=true,labelViewKey=''
const anchorTracker=createModelAnchorTracker(),animationClock=createModelAnimationClock()
const plantLoading=ref(false),plantFailure=ref(''),plantEnabled=computed(()=>!hidden.value.has('feed-station'))
const toolSelect=ref()
function closeToolSelect(){toolSelect.value?.blur()}
const host=ref(),drawer=ref(false),rotating=ref(false),loading=ref(true),failure=ref(''),ready=ref(false)
const spread=ref(0),selected=ref(''),hidden=ref(new Set(['tool','pot-left','pot-right','feed-station','infrared-camera']))
const guide=defineModel('guide',{default:''})
const framesEnabled=ref(false),frameObjects=[]
const toolId=ref('none'),lastToolId=ref('tool-640'),toolLoading=ref(false),toolProgress=ref(''),toolFailure=ref(''),potEnabled=ref(false),toolEnabled=ref(false)
const partInfo=computed(()=>[...robotParts,robotServicePart,robotBatteryPart,...robotEquipmentParts.map(p=>p.id==='tool'?{...p,label:robotTools.find(t=>t.id===(toolId.value==='none'?lastToolId.value:toolId.value)).label}:p)])
const groups=[...robotGroups,{label:'制动与测量',ids:['service-panel','smb-battery']},robotEquipmentGroup]
const selectedInfo=computed(()=>partInfo.value.find(p=>p.id===selected.value))
const groupParts=group=>group.ids.map(id=>partInfo.value.find(p=>p.id===id))
let renderer,scene,camera,controls,model,observer,visibility,frame=0,disposed=false,visible=true,request,loadId=0,start,toolRequest,toolLoadId=0,toolModel,potModel,environmentTarget
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),meshes=[]
watch(labelsEnabled,()=>{labelsDirty=true})
watch(guide,mode=>{clickPan?.stop();if(mode){rotating.value=false;drawer.value=false;closeFullscreen().catch(()=>{})}if(mode==='pendant')programMounted.value=true;if(mode!=='pendant'){pendantTarget.value=null;if(!programRunning.value)stopMotion()}},{flush:'sync',immediate:true})
watch(pendantTarget,async()=>{await nextTick();if(disposed||!host.value)return;visibility?.unobserve(host.value);visibility?.observe(host.value);visible=true;resize()},{flush:'post'})
let pendantWarmup=null
function warmPendant(){
 if(pendantWarmup||disposed)return
 pendantWarmup=Promise.all([import('./AbbRobotGuide.vue'),preloadAbbModel('/models/abb-irb6700/flexpendant.glb',{signal:request.signal})]).catch(()=>{pendantWarmup=null})
}
function disposeModel(root){root?.traverse(o=>{if(o.isInstancedMesh)o.dispose();o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose()}})}
function toggleFrames(){sceneDirty=true;framesEnabled.value=!framesEnabled.value;for(const frame of frameObjects)frame.visible=framesEnabled.value}
function createFrames(){
  for(const frame of robotFrames){
    const group=new THREE.Group();group.name=frame.id+'-coordinates';group.position.fromArray(frame.position);group.visible=framesEnabled.value
    for(const [axis,color] of [['x','#d83f42'],['y','#218b50'],['z','#2872d1']]){
      const direction=new THREE.Vector3().fromArray(frame[axis]),arrow=new THREE.ArrowHelper(direction,new THREE.Vector3(),frame.length,color,frame.length*.18,frame.length*.10)
      for(const object of [arrow.line,arrow.cone]){object.material.depthTest=false;object.renderOrder=10}
      group.add(arrow)
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=80;const context=canvas.getContext('2d');context.font='bold 46px sans-serif';context.textAlign='center';context.textBaseline='middle';context.lineWidth=9;context.strokeStyle='#ffffff';const text=axis.toUpperCase()+(frame.id==='flange'?'f':'');context.strokeText(text,96,40);context.fillStyle=color;context.fillText(text,96,40)
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false,depthWrite:false}));sprite.scale.set(.24,.10,1);sprite.position.copy(direction).multiplyScalar(frame.length+.08);sprite.renderOrder=11;group.add(sprite)
    }
    model.getObjectByName(frame.parent).add(group);frameObjects.push(group)
  }
}
function selectPart(id){selected.value=id;if(id&&hidden.value.has(id))toggleVisibility(id);paint()}
function paint(){
 sceneDirty=true;labelsDirty=true
 for(const mesh of meshes){
  const active=selected.value===mesh.userData.partId;mesh.material.color.copy(mesh.userData.baseColor);mesh.material.emissive.set('#000000');mesh.material.emissiveIntensity=0
  if(active){mesh.material.color.set('#46c96b');mesh.material.emissive.set('#169c43');mesh.material.emissiveIntensity=.24}
 }
}
function toggleVisibility(id){
  if(id==='tool'){toolId.value=toolId.value==='none'?lastToolId.value:'none';return}
  const next=new Set(hidden.value);next.has(id)?next.delete(id):next.add(id);hidden.value=next
  if(id==='feed-station'&&!next.has(id)&&!programRunning.value)showReceivingPose()
  const node=model?.getObjectByName(id);if(node)node.visible=!next.has(id);else if(robotPlantEquipment.some(part=>part.id===id)&&!next.has(id))loadPlant(id)
  if(id.startsWith('pot-')){potEnabled.value=robotPotStations.some(s=>!next.has(s.id));if(potModel)potModel.visible=potEnabled.value}
  if(next.has(selected.value))selected.value='';paint()
}
const plantRequests=new Map()
async function loadPlant(id){
 const existing=model?.getObjectByName(id);if(existing){existing.visible=!hidden.value.has(id);return existing}
 if(plantRequests.has(id))return plantRequests.get(id)
 const asset=robotPlantEquipment.find(a=>a.id===id);if(!asset||!model)return
 const owner=model;plantLoading.value=true;plantFailure.value=''
 const task=Promise.resolve().then(()=>{try{const root=asset.create();if(disposed||model!==owner){disposeModel(root);return}const group=new THREE.Group();group.name=id;group.add(root);group.position.fromArray(asset.position);group.rotation.y=asset.rotationY||0;group.visible=!hidden.value.has(id);registerMeshes(group,id);for(const mesh of meshes)if(mesh.userData.partId===id)mesh.userData.baseColor=mesh.material.color.clone();model.add(group);paint();fit()}catch(error){plantFailure.value='上甑喂料机暂时无法显示，请重试。'}finally{plantRequests.delete(id);plantLoading.value=plantRequests.size>0}})
 plantRequests.set(id,task);return task
}
async function togglePlant(){const hide=plantEnabled.value,next=new Set(hidden.value),assets=robotPlantEquipment.filter(part=>part.id!=='infrared-camera');if(!hide&&!programRunning.value)showReceivingPose();for(const item of assets){if(hide)next.add(item.id);else next.delete(item.id)}hidden.value=next;for(const item of assets){const node=model?.getObjectByName(item.id);if(node)node.visible=!hide;else if(!hide)await loadPlant(item.id)}paint();fit()}
function togglePot(){const hide=potEnabled.value;for(const station of robotPotStations)if(hidden.value.has(station.id)===!hide)toggleVisibility(station.id);fit()}
async function prepareProgramCell({barrel='left'}={}){
 stopMotion();receivingMotion.value=false;receivingMessage.value='';rotating.value=false;spread.value=0;joints.value=[...brewingWorkcell.homeJoints];syncPose();
 if(toolId.value==='none'){toolId.value=lastToolId.value;await new Promise(resolve=>{const unwatch=watch(toolLoading,value=>{if(!value){unwatch();resolve()}},{flush:'post'});setTimeout(()=>{unwatch();resolve()},15000)})}
 if(toolFailure.value||toolLoading.value||!toolModel)throw Error(toolFailure.value||'工具尚未就绪，请稍后重试');
 const next=new Set(hidden.value);for(const id of ['feed-station','infrared-camera','pot-left','pot-right','tool'])next.delete(id);hidden.value=next;potEnabled.value=true;if(potModel){potModel.visible=true;for(const child of potModel.children)child.visible=true}
 await loadPlant('feed-station');await loadPlant('infrared-camera');lidTargets[barrel]=1;for(let i=0;i<100&&robotPotStations.filter(s=>s.id==='pot-'+barrel).some(s=>(potModel?.getObjectByName(s.id)?.userData.lid?.inspect().amount??1)<.999);i++)await new Promise(r=>setTimeout(r,50));if(robotPotStations.filter(s=>s.id==='pot-'+barrel).some(s=>(potModel?.getObjectByName(s.id)?.userData.lid?.inspect().amount??1)<.999))throw Error('请等待液压锅盖完全打开');const station=model?.getObjectByName('feed-station');if(station)station.visible=true;
 if(!materialSimulation){materialSimulation=createMaterialSimulation(robotPotStations);model.add(materialSimulation.root)}materialSimulation.setCell(null);fit();return materialSimulation.hopperSnapshot();
}
function setProgramRunning(value){if(value){manualChainRunning.value=false;manualBeltDirection.value=0;}programRunning.value=value;if(!value){rotorRunning.value=false;feedGateTarget.value=0}else if(programCell)setProgramCell(programCell)}
function setProgramToolSignals(value){programToolSignals.value=value;if(value)guardTarget.value=toolGuardOpen(programCell,value);if(programCell)materialSimulation?.setCell({...programCell,signals:value||programCell.signals});sceneDirty=true}
function resetProgramPot(barrel){materialSimulation?.resetPot(barrel);sceneDirty=true}
function setProgramCell(value){programCell=value;if(!value)lidMessage.value='';materialSimulation?.setCell(value);model?.getObjectByName('infrared-camera')?.children[0]?.userData.setCell?.(value);if(value){guardTarget.value=toolGuardOpen(value);feedGateTarget.value=Number(!!value.gateOpen);rotorRunning.value=!!value.signals.do22_boji_zz_dk}else{feedGateTarget.value=0;rotorRunning.value=false}sceneDirty=true}
function updateProgramMaterial(delta){
 const infrared=model?.getObjectByName('infrared-camera')?.children[0];if(infrared?.userData.update?.(delta,{running:programRunning.value,rate:programSpeed.value/100*playbackRate.value,programVisible:programMode.value&&potEnabled.value,visiblePots:Object.fromEntries(robotPotStations.map(s=>[s.id,!!potModel?.visible&&!hidden.value.has(s.id)]))}))sceneDirty=true;
 const running=programRunning.value&&!!programCell&&!programCell.complete;
 const feeder=model?.getObjectByName('feed-station')?.children[0];if((running&&materialSimulation?.chainActive||manualChainRunning.value&&!programRunning.value)&&feeder){chainPhase+=delta*(running?programSpeed.value/100*playbackRate.value:1);feeder.userData.setChainPhase?.(chainPhase);sceneDirty=true}
 const feederPoint=feeder?feeder.localToWorld(new THREE.Vector3(...feeder.userData.outlet.bottomCenter)):null;
 const toolPoint=toolModel&&toolRig?toolModel.localToWorld(toolRig.rotorCenter.clone()):null;
 materialSimulation?.attachEquipment({feeder,tool:toolModel,toolRig});
 if(materialSimulation?.update(delta,{running,feederPoint,toolPoint,gateAmount:feedGateAmount,guardAmount,beltDistance,atReceiving:atReceiving.value,rate:programSpeed.value/100*playbackRate.value,programVisible:programMode.value&&potEnabled.value,visiblePots:Object.fromEntries(robotPotStations.map(s=>[s.id,!!potModel?.visible&&!hidden.value.has(s.id)]))}))sceneDirty=true;if(running&&materialSimulation)feedGateTarget.value=materialSimulation.feedGateTarget;
}
const lidClearCache=new Map()
function lidClear(barrel,kind='robot'){
 const pot=potModel?.getObjectByName('pot-'+barrel);if(!pot)return false;
 const infrared=model?.getObjectByName('infrared-camera')?.children[0]?.userData.inspect?.();
 const cacheId=barrel+':'+kind,key=[joints.value.join(','),toolId.value,toolModel?.uuid,spread.value,[...hidden.value].sort().join(','),infrared?.yaw,infrared?.reach].join('|'),cached=lidClearCache.get(cacheId);if(cached?.owner===pot&&cached.key===key)return cached.clear;
 pot.updateWorldMatrix(true,true);const inverse=pot.getObjectByName('hydraulic-pot-lid').matrixWorld.clone().invert();
 const clear=!meshes.some(mesh=>{
  const part=mesh.userData.partId||'';if(kind==='camera'?part!=='infrared-camera':!/^(?:axis[1-6]|tool|cable|balance|base)/.test(part))return false;
  if(part==='tool'&&toolId.value==='none')return false;
  mesh.updateWorldMatrix(true,false);if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const localMatrix=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
  return pot.userData.lid.intersectsSweep(mesh.geometry.boundingBox.clone().applyMatrix4(localMatrix))
 });lidClearCache.set(cacheId,{owner:pot,key,clear});return clear
}
function lidBlockReason(barrel){
 const blocked=[];if(!lidClear(barrel))blocked.push('机器人或工具退出');if(!lidClear(barrel,'camera'))blocked.push('相机退避');
 return blocked.length?(barrel==='left'?'左甑':'右甑')+'锅盖保持打开：请先让'+blocked.join('、'):''
}
function toggleLid(barrel){
 if(lidTargets[barrel]){const reason=lidBlockReason(barrel);if(reason){lidMessage.value=reason;return}lidTargets[barrel]=0}else lidTargets[barrel]=1;lidMessage.value='';sceneDirty=true
}
function updateHydraulicLids(delta){
 if(programCell?.complete&&!programRunning.value&&!lidBlockReason(programCell.barrel))lidTargets[programCell.barrel]=0;
 for(const station of robotPotStations){const barrel=station.id==='pot-left'?'left':'right',lid=potModel?.getObjectByName(station.id)?.userData.lid;if(!lid)continue;
  if(!lidTargets[barrel]){const reason=lidBlockReason(barrel);if(reason){lidTargets[barrel]=1;lidMessage.value=reason}}
  lid.setTarget(lidTargets[barrel]);if(lid.update(delta)){sceneDirty=true;labelsDirty=true}
 }
}
function toggleProgram(){toolbarMenu.value='';programMounted.value=true;if(!programMode.value){rotating.value=false;programMode.value=true;programOpen.value=true}else programOpen.value=!programOpen.value}
function exitProgramMode(){if(programRunning.value)return;programOpen.value=false;programMode.value=false}
function handleProgramCommand({action,args=[]}){if(action==='setSpeed'){const value=Number(args[0]);if(Number.isFinite(value))programSpeed.value=Math.max(0,Math.min(100,value));return}if(['stop','start','step','poseChanged','restart','selectRoutine','selectBackup','setSignal'].includes(action))programControl.value?.[action]?.(...args)}
function stopOperation(){programControl.value?.stop();stopMotion()}
function showReceivingPose(){
 programControl.value?.poseChanged();stopMotion();rotating.value=false;spreadAnimation=null;spread.value=0
 if(toolId.value==='none')toolId.value=lastToolId.value
 if(atReceiving.value){receivingMessage.value='已在接料位';syncPose();fit();return}
 receivingMotion.value=true;receivingMessage.value='正在回归接料位…'
 moveRobot({frames:[[...robotReceivingJoints]],duration:1.8,done:ok=>{receivingMotion.value=false;receivingMessage.value=ok?'已回归接料位':'接料定位已停止'}})
}

function updateFeedGate(delta){if(Math.abs(feedGateAmount-feedGateTarget.value)<.0001)return;const root=model?.getObjectByName('feed-station')?.children[0];if(!root)return;feedGateAmount+=Math.sign(feedGateTarget.value-feedGateAmount)*Math.min(Math.abs(feedGateTarget.value-feedGateAmount),delta);root.userData.setGate(feedGateAmount);sceneDirty=true;labelsDirty=true}
function showAll(){showReceivingPose();for(const part of robotPlantEquipment)if(!model?.getObjectByName(part.id))loadPlant(part.id);hidden.value=new Set();potEnabled.value=true;if(potModel)potModel.visible=true;for(const part of partInfo.value){const node=model?.getObjectByName(part.id);if(node)node.visible=true}if(toolId.value==='none')toolId.value=lastToolId.value;else if(toolModel?.userData.toolType!==toolId.value)loadTool()}
function setSpread(value,animated=false){if(!animated)spreadAnimation=null;sceneDirty=true;spread.value=Math.max(0,Math.min(100,Number(value)||0));if(model){const direction=camera.position.clone().sub(controls.target);applyRobotJoints(model,joints.value,spread.value/100,activeLimits.value);fit(direction)}}
function fit(direction=new THREE.Vector3(-1.2,.65,2)){
  if(!model||!camera)return
  sceneDirty=true;labelsDirty=true
  model.updateMatrixWorld(true)
  const box=new THREE.Box3(),corners=[]
  for(const mesh of meshes){
    let shown=true;for(let node=mesh;node;node=node.parent)if(!node.visible){shown=false;break}
    if(!shown)continue
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox()
    const bounds=mesh.geometry.boundingBox
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const point=new THREE.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld);box.expandByPoint(point);corners.push(point)}
  }
  if(box.isEmpty())return
  const center=box.getCenter(new THREE.Vector3())
  direction.normalize()
  const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize()
  const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanX=tanY*camera.aspect
  let distance=0
  for(const point of corners){
    const delta=point.clone().sub(center),depth=delta.dot(direction)
    distance=Math.max(distance,Math.abs(delta.dot(up))/tanY+depth,Math.abs(delta.dot(right))/tanX+depth)
  }
  distance*=1.12
  controls.target.copy(center);camera.position.copy(center).addScaledVector(direction.normalize(),distance);camera.near=.01;camera.far=Math.max(100,distance*10);camera.updateProjectionMatrix();controls.update()
}
function installCameraControls(){const target=controls?.target.clone();clickPan?.dispose();controls?.dispose();if(!freeView.value)camera.up.set(0,1,0);controls=new (freeView.value?FreeModelControls:OrbitControls)(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=true;controls.noPan=false;controls.screenSpacePanning=true;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:null};controls.minDistance=.5;controls.maxDistance=20;controls.autoRotateSpeed=.7;if(!freeView.value)controls.maxPolarAngle=Math.PI*.49;if(target)controls.target.copy(target);controls.addEventListener('change',()=>{sceneDirty=true;labelsDirty=true});controls.update();controls.saveState();clickPan=installModelClickPan({element:renderer.domElement,camera,controls,onChange:active=>{clickPanning.value=active;start=null;if(active)rotating.value=false}})}
function toggleFreeView(){freeView.value=!freeView.value;installCameraControls();sceneDirty=true;labelsDirty=true}
function setView(mode){clickPan?.stop();rotating.value=false;camera.up.set(0,1,0);controls.clearMotion?.();fit(mode==='top'?new THREE.Vector3(0,1,.001):new THREE.Vector3(0,.08,1))}
function syncPose(){sceneDirty=true;labelsDirty=true;if(model)applyRobotJoints(model,joints.value,spread.value/100,activeLimits.value)}
function resetProgramPose({automation=false}={}){rotating.value=false;spread.value=0;selected.value='';paint();return new Promise((resolve,reject)=>moveRobot({frames:[[...(automation?brewingWorkcell.homeJoints:robotReferenceJoints)]],duration:1,speed:()=>Math.max(.1,programSpeed.value/100),done:ok=>ok?resolve():reject(Error('复位已停止'))}))}
function homeRobot(){stopMotion();joints.value=[...robotReferenceJoints];setSpread(0);fit()}
function jogJoint({axis,delta,deltas,duration=0,speed}){if(!model||motionPlaying.value)return;const next=[...joints.value];for(const move of deltas||[{axis,delta}])next[move.axis]+=move.delta;if(duration>0){moveRobot({frames:[clampRobotJoints(next,robotReferenceJoints,activeLimits.value)],duration,speed});return}joints.value=clampRobotJoints(next,robotReferenceJoints,activeLimits.value);spread.value=0;syncPose();selected.value=deltas?'':'axis'+(axis+1);paint();fit()}
function setMotionDemo(enabled){stopMotion();motionPlaying.value=!!enabled;if(!enabled)return;segmentDuration=1.5;motionContinuous=false;spread.value=0;demoElapsed=0;demoFrames=[[...joints.value],[25,15,-20,25,65,25],[-25,-12,20,-30,100,-25],[...robotReferenceJoints]]}
function stopMotion(){motionPlaying.value=false;const done=motionDone;motionDone=null;done?.(false)}
function updateToolMechanics(delta){
 if(!toolRig||!toolEnabled.value)return
 const rate=programRunning.value?programSpeed.value/100*playbackRate.value:1;delta*=rate
 let changed=false
 if(Math.abs(guardAmount-guardTarget.value)>.0001){guardAmount=THREE.MathUtils.clamp(guardAmount+Math.sign(guardTarget.value-guardAmount)*Math.min(Math.abs(guardTarget.value-guardAmount),delta),0,1);toolRig.setGuard(guardAmount);changed=true}
 const drive=programRunning.value?(!programCell?.complete?toolDrive({...programCell,signals:programToolSignals.value||programCell?.signals}):{belt:0,rotor:0,speed:0,rotorSpeed:0}):{belt:manualBeltDirection.value,rotor:rotorRunning.value?1:0,speed:1,rotorSpeed:1}
 if(drive.belt&&drive.speed&&rate){beltDistance+=delta*.18*drive.belt*drive.speed;toolRig.setBeltTravel(beltDistance);changed=true}
 if(drive.rotor&&drive.rotorSpeed&&rate){rotorAngle+=delta*2*drive.rotor*drive.rotorSpeed;toolRig.setRotor(rotorAngle);changed=true}
 if(changed)sceneDirty=true
}
function moveRobot({frames,duration=1,done,speed,continuous=false}){if(!receivingMotion.value)receivingMessage.value='';spreadAnimation=null;stopMotion();if(!ready.value||!frames?.length){done?.(false);return}motionDone=done;motionRate=typeof speed==='function'?speed:()=>1;spread.value=0;selected.value='';paint();demoElapsed=0;demoFrames=[[...joints.value],...frames.map(q=>q.slice())];segmentDuration=Math.max(.016,duration)/frames.length;motionContinuous=continuous;motionPlaying.value=true}
function updateMotion(delta,time){if(!motionPlaying.value||!model)return;demoElapsed+=delta*Math.max(0,Math.min(10,Number(motionRate())||0));const sampled=sampleJointPath(demoFrames,demoElapsed,segmentDuration*(demoFrames.length-1),{continuous:motionContinuous});if(sampled.complete){joints.value=[...demoFrames.at(-1)];motionPlaying.value=false;syncPose();if(!programRunning.value)fit(camera.position.clone().sub(controls.target));const done=motionDone;motionDone=null;done?.(true);return}joints.value=sampled.joints;syncPose();if(!programRunning.value&&time-lastDemoFit>120){fit(camera.position.clone().sub(controls.target));lastDemoFit=time}}
function updateLabels(){if(!labelsEnabled.value||!model||!host.value)return;model.updateMatrixWorld(true);const viewKey=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');if(viewKey!==labelViewKey){anchorTracker.clear();labelViewKey=viewKey}const {width,height}=host.value.getBoundingClientRect(),anchors=[];for(const part of partInfo.value){if(hidden.value.has(part.id))continue;const anchor=anchorTracker.get(part.id,meshes.filter(mesh=>mesh.userData.partId===part.id),camera);if(!anchor)continue;const point=anchor.project(camera);anchors.push({id:part.id,text:part.label,x:(point.x*.5+.5)*width,y:(-.5*point.y+.5)*height})}const card=host.value.parentElement?.querySelector?.('.robot-info');labels.value=layoutAgvLabels(anchors,width,height,{leftBottom:card?card.offsetHeight+30:0})}
function animateSpread(target){stopMotion();spreadAnimation={from:spread.value,to:target,elapsed:0,duration:Math.max(.4,Math.abs(target-spread.value)/100*8)}}
function updateSpread(delta){if(!spreadAnimation)return;const animation=spreadAnimation;animation.elapsed+=delta;const t=Math.min(1,animation.elapsed/animation.duration);setSpread(animation.from+(animation.to-animation.from)*t,true);if(t>=1){spreadAnimation=null;if(animation.to===0){joints.value=[...robotReferenceJoints];syncPose();fit()}}}
function expandRobot(){rotating.value=false;animateSpread(100)}
function reset(){clickPan?.stop();stopMotion();rotating.value=false;selectPart('');hidden.value=new Set([...hidden.value].filter(id=>['tool','pot-left','pot-right','feed-station'].includes(id)));for(const part of [...robotParts,robotServicePart,robotBatteryPart]){const node=model?.getObjectByName(part.id);if(node)node.visible=true}animateSpread(0);fit()}
function resize(){if(!renderer||!host.value)return;const {width,height}=host.value.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();controls?.handleResize?.();if(ready.value){const direction=camera.position.clone().sub(controls.target);fit(direction.lengthSq()>1e-10?direction:new THREE.Vector3(-1.2,.65,2));renderer.render(scene,camera)}}
function pointerDown(event){start=!clickPanning.value&&event.button===0?{x:event.clientX,y:event.clientY}:null}
function pick(event){
  if(clickPanning.value||event.button!==0||!ready.value||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return
  start=null;const rect=host.value.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera)
  const hit=raycaster.intersectObjects(meshes).find(h=>{let n=h.object;while(n){if(!n.visible)return false;n=n.parent}return true})
  if(hit)selectPart(hit.object.userData.partId)
}
function registerMeshes(root,partId){
  const originals=new Set(),copyMaterial=createPartMaterialPool()
  root.traverse(mesh=>{if(!mesh.isMesh)return;mesh.userData.partId=partId;mesh.castShadow=true;mesh.receiveShadow=true;originals.add(mesh.material);mesh.material=copyMaterial(mesh.material);mesh.userData.baseColor=mesh.material.color.clone();meshes.push(mesh)})
  for(const material of originals)material.dispose()
}
async function parseModel(url,signal,onProgress){return loadAbbModel(url,{signal,onProgress})}
function removeTool(){toolRig=null;manualBeltDirection.value=0;beltDistance=0;rotorRunning.value=false;guardTarget.value=0;guardAmount=0;rotorAngle=0;if(!toolModel)return;for(let i=meshes.length-1;i>=0;i--)if(meshes[i].userData.partId==='tool')meshes.splice(i,1);materialSimulation?.detachTool?.(toolModel);toolModel.removeFromParent();disposeModel(toolModel);toolModel=null}
async function loadTool(){
  if(!model||!toolEnabled.value||toolId.value==='none')return
  const id=++toolLoadId,owner=model,tool=robotTools.find(t=>t.id===toolId.value);toolRequest?.abort();toolRequest=new AbortController();toolLoading.value=true;toolFailure.value='';removeTool()
  try{
    toolProgress.value='正在连接布料头…'
    const root=await parseModel(tool.url,toolRequest.signal,progress=>{if(id===toolLoadId)toolProgress.value=modelLoadingText(progress,'布料头')})
    if(disposed||id!==toolLoadId||model!==owner){disposeModel(root);return}
    toolRig=createToolMechanics(root,tool.id);toolModel=new THREE.Group();toolModel.name='tool';toolModel.userData.toolType=tool.id;toolModel.add(root)
    // Both CAD assemblies have their ABB adapter at their local assembly origin.
    // Align that origin and basis with the original ABB wrist flange transform.
    const flange=robotFrames.find(f=>f.id==='flange')
    toolModel.position.fromArray(flange.position);toolModel.rotation.z=-Math.PI/2;toolModel.userData.mountPosition=toolModel.position.clone()
    registerMeshes(toolModel,'tool');stainlessEquipment(toolModel);
    const brush=createCleaningBrush(tool.id);toolModel.add(brush);registerMeshes(brush,'tool');
    for(const mesh of meshes)if(mesh.userData.partId==='tool')mesh.userData.baseColor=mesh.material.color.clone();owner.getObjectByName('axis6').add(toolModel);toolModel.visible=!hidden.value.has('tool');syncPose();paint();fit()
  }catch(error){if(disposed||id!==toolLoadId||error.name==='AbortError')return;toolFailure.value='工具加载失败，请重试。'}
  finally{if(!disposed&&id===toolLoadId)toolLoading.value=false}
}
watch(toolId,id=>{
  toolEnabled.value=id!=='none'
  const next=new Set(hidden.value)
  if(toolEnabled.value){lastToolId.value=id;next.delete('tool')}else next.add('tool')
  hidden.value=next
  if(toolModel)toolModel.visible=toolEnabled.value
  if(toolEnabled.value&&ready.value){if(toolModel?.userData.toolType===id){paint();fit()}else loadTool()}
  else if(!toolEnabled.value){++toolLoadId;toolRequest?.abort();toolLoading.value=false;toolFailure.value='';if(selected.value==='tool')selected.value='';paint();fit()}
})
async function load(){
  const id=++loadId;request?.abort();request=new AbortController();loading.value=true;failure.value='';ready.value=false
  try{
    const root=await parseModel(robotModelUrl,request.signal)
    if(disposed||id!==loadId){disposeModel(root);return}
    model=root
    // Clone all shared materials before disposing originals (some span several parts).
    const originals=new Set();model.traverse(mesh=>{if(mesh.isMesh)originals.add(mesh.material)})
    for(const part of robotParts){const node=model.getObjectByName(part.id);if(!node)throw Error('模型部件不完整');const copyMaterial=createPartMaterialPool();node.traverse(mesh=>{if(!mesh.isMesh)return;mesh.userData.partId=part.id;mesh.castShadow=true;mesh.receiveShadow=true;mesh.material=copyMaterial(mesh.material);mesh.userData.baseColor=mesh.material.color.clone();meshes.push(mesh)})}
    for(const material of originals)material.dispose()
    const service=createRobotServicePanel(model)
    if(service){
      for(const cap of service.children.filter(n=>n.userData.axis)){
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#171b1e';ctx.fillRect(0,0,64,64);ctx.fillStyle='#ffffff';ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(cap.userData.axis),32,34)
        const label=new THREE.Mesh(new THREE.CircleGeometry(.0058,24),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(canvas),roughness:1}));label.name=cap.name+'-number';label.rotation.x=-Math.PI/2;label.position.y=.00215;cap.add(label)
      }
      registerMeshes(service,'service-panel')
    }
    const battery=createRobotBatteryCompartment(model);if(battery)registerMeshes(battery,'smb-battery')
    applyRobotJoints(model,joints.value);createFrames();scene.add(model)
    const pot=await parseModel('/models/abb-irb6700/gujing-pot.glb',request.signal)
    if(disposed||id!==loadId){disposeModel(pot);return}
    potModel=new THREE.Group();potModel.name='pot'
    for(const station of robotPotStations){const root=placeBrewingPot(pot,station);root.visible=!hidden.value.has(station.id);registerMeshes(root,station.id);stainlessEquipment(root);potModel.add(root)}
    potModel.visible=potEnabled.value;for(const mesh of meshes)if(mesh.userData.partId.startsWith('pot-'))mesh.userData.baseColor=mesh.material.color.clone();model.add(potModel);disposeModel(pot)
    ready.value=true;resize();fit();if(toolEnabled.value)loadTool();warmPendant()
  }catch(error){if(disposed||id!==loadId||error.name==='AbortError')return;scene?.remove(model);disposeModel(model);model=null;meshes.length=0;frameObjects.length=0;failure.value='模型暂时无法显示，请重试。'}
  finally{if(!disposed&&id===loadId)loading.value=false}
}
function retry(){if(renderer)load();else{failure.value='当前浏览器无法创建三维画布，请重新打开页面。'}}
onMounted(()=>{
  try{
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.01,100)
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;host.value.appendChild(renderer.domElement)
    installCameraControls()
    const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environmentTarget=pmrem.fromScene(room,.04);scene.environment=environmentTarget.texture;scene.environmentIntensity=.55;room.dispose();pmrem.dispose()
    scene.add(new THREE.HemisphereLight(0xeef8ff,0x6a7e90,1.8))
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,6,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-4,right:4,top:4,bottom:-4});light.shadow.bias=-.0005;light.shadow.radius=3;scene.add(light)
    const fill=new THREE.DirectionalLight(0xb8dce9,1.5);fill.position.set(-4,2,-3);scene.add(fill)
    const grid=new THREE.GridHelper(12,48,0x9cb6c5,0xc4d4de);grid.material.transparent=true;grid.material.opacity=.28;grid.position.y=-.008;scene.add(grid)
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.16,depthWrite:false}));ground.rotation.x=-Math.PI/2;ground.position.y=-.006;ground.receiveShadow=true;scene.add(ground)
    observer=new ResizeObserver(resize);observer.observe(host.value);visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting});visibility.observe(host.value);resize()
    const animate=(time=0)=>{if(disposed)return;frame=requestAnimationFrame(animate);const active=visible&&!document.hidden,delta=animationClock(time,active);if(!active)return;updateSpread(delta);updateMotion(delta,time);updateToolMechanics(delta);updateFeedGate(delta*2.5*(programRunning.value?programSpeed.value/100*playbackRate.value:1));updateProgramMaterial(delta);updateHydraulicLids(delta);controls.autoRotate=rotating.value;const cameraMoved=controls.update(delta);if(labelsDirty&&labelsEnabled.value&&time-lastLabelTime>80){updateLabels();labelsDirty=false;lastLabelTime=time}if(sceneDirty||cameraMoved){renderer.render(scene,camera);sceneDirty=false}};animate();load()
  }catch(error){loading.value=false;failure.value='当前浏览器无法创建三维画布，请重新打开页面。'}
})
onBeforeUnmount(()=>{stopMotion();disposed=true;++loadId;++toolLoadId;request?.abort();toolRequest?.abort();cancelAnimationFrame(frame);observer?.disconnect();visibility?.disconnect();clickPan?.dispose();controls?.dispose();materialSimulation?.dispose();disposeModel(scene);environmentTarget?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove()})
</script>
<style scoped>
.robot-canvas.click-panning,.robot-canvas.click-panning :deep(canvas){cursor:move}
.robot-status-heading{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0}.robot-status-heading>small{flex:none;white-space:nowrap}.robot-source-line{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;max-width:100%}
.robot-source-line>small{flex:none;white-space:nowrap}
.robot-current-code{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#506d81;font:11px/1.5 Consolas,monospace}
.robot-controls.program-mode{display:grid;grid-template-columns:minmax(330px,auto) minmax(140px,1fr) auto;align-items:center;gap:12px}
.robot-controls.program-mode .robot-program-speed-slot{min-width:0;justify-content:flex-start;margin:0}
.robot-controls.program-mode .robot-action-group{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;min-width:0}
.robot-program-action-slot{min-width:0}
@media(max-width:1250px){.robot-controls.program-mode{grid-template-columns:minmax(0,1fr) minmax(120px,.7fr)}.robot-controls.program-mode .robot-action-group{grid-column:1/-1}}
@media(max-width:600px){.robot-controls.program-mode{grid-template-columns:minmax(0,1fr)}.robot-controls.program-mode .robot-program-status{grid-row:2}.robot-controls.program-mode .robot-action-group{justify-content:flex-start;margin:0}.robot-controls.program-mode .robot-program-speed-slot{width:100%;margin:0}}
.robot-program-status{display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px;text-align:center;font-size:12px;color:#246b7e;line-height:1.4;overflow:hidden}.robot-program-status strong{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.robot-program-status small{font-size:10px;color:#8297a5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.robot-toolbar .robot-menu-trigger{min-height:38px;padding:0 14px;border:1px solid #d3e1e9;border-radius:8px;background:#fff;color:#426c84}.robot-toolbar .robot-menu-trigger[aria-expanded=true]{background:#e4f2f4;border-color:#a8d5df;color:#0f7383}

.robot-viewer{height:var(--agv-viewer-height,680px);min-height:480px;display:flex;flex-direction:column;min-width:0;color:#315267;gap:8px}
.robot-equipment{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}.robot-equipment label{display:flex;align-items:center;gap:8px}.robot-equipment>span{font-size:12px;color:#859baa}
.robot-reference-actions{display:flex;justify-content:flex-end;gap:6px}.robot-toolbar-right{margin-left:auto;flex-wrap:wrap;justify-content:flex-end}.robot-model-actions{display:flex;gap:6px}.robot-tool-status{font-size:12px;color:#859baa}.robot-toolbar .robot-equipment{margin-right:8px;gap:6px}
.robot-toolbar,.robot-controls{display:flex;align-items:center;justify-content:space-between;gap:10px}.robot-toolbar{font-size:13px}.robot-toolbar>div,.robot-controls>div{display:flex;gap:6px}
.robot-viewer button{font:inherit;font-size:13px;min-height:36px;border:1px solid #cddce6;background:#fff;color:#42677e;border-radius:7px;padding:0 12px;cursor:pointer}.robot-viewer button[aria-pressed=true]{color:#08798c;background:#e7f4f7;border-color:#a8d5df}.robot-viewer button:disabled{opacity:.45;cursor:default}.robot-viewer button:focus-visible{outline:2px solid #14899b;outline-offset:2px}
.abb-model-workspace{position:relative;flex:1;min-height:0;display:flex;border:1px solid #d3e1e9;border-radius:14px;overflow:hidden;background:radial-gradient(ellipse at 54% 38%,#fff 0%,#e9f1f6 52%,#d8e5ee 100%)}.robot-stage{position:relative;min-width:0;flex:1;overflow:hidden}.robot-canvas{position:absolute;inset:0}.robot-canvas :deep(canvas){display:block;width:100%;height:100%;touch-action:none}
.robot-tree{order:1;width:260px;flex-shrink:0;background:#fffffff2;border-right:1px solid #d3e1e9;display:flex;flex-direction:column;z-index:2}.robot-tree>header{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 4px}.robot-tree small{margin-left:6px;font-size:12px;color:#8197a6}.robot-tree>header button{border:0;font-size:21px;padding:0 10px}.robot-tree-scroll{overflow:auto;flex:1;padding:0 10px 12px}.robot-tree h2{font-size:13px;color:#1e5774;margin:18px 0 8px;font-weight:750;line-height:1.5;background:#eaf2f7;border-left:3px solid #2f8b9e;border-radius:0 5px 5px 0;padding:7px 8px}.robot-part{display:flex;gap:2px;border-radius:7px;margin-top:3px}.robot-part button{border:0;background:transparent;text-align:left;min-height:36px}.robot-part button:first-child{flex:1;padding:0 8px}.robot-part button:last-child{padding:0 8px}.robot-part.selected{background:#e7f4f7}.robot-tree .robot-show-all{margin:8px 12px 12px}
.robot-part-description{display:none}
.robot-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#edf4f9de;z-index:3;font-size:14px}.robot-info{position:absolute;left:16px;bottom:38px;max-width:330px;right:16px;padding:14px;background:#fffffff0;border:1px solid #d5e4ed;border-radius:12px;box-shadow:0 6px 24px #31526712;z-index:3}.robot-info header{display:flex;align-items:center;justify-content:space-between}.robot-info button{border:0;min-height:28px;font-size:20px}.robot-info p{font-size:13px;line-height:1.7;margin:8px 0 0;color:#728b9f}.robot-hint{position:absolute;bottom:12px;left:16px;color:#6d889b;font-size:12px;pointer-events:none}.robot-controls{padding:2px 0}.robot-controls label{display:flex;align-items:center;gap:12px;font-size:13px;flex:1;max-width:520px}.robot-controls input{flex:1;min-width:60px;accent-color:#267f95}.robot-controls output{min-width:35px;font-size:12px;font-variant-numeric:tabular-nums}
@media(max-width:700px){.robot-viewer{gap:7px}.robot-toolbar{font-size:12px;flex-wrap:wrap}.robot-toolbar>div{margin-left:auto}.robot-viewer button{min-height:40px;padding:0 10px}.robot-tree{position:absolute;left:0;top:0;bottom:0;width:min(280px,85%);box-shadow:8px 0 28px #24475c15}.robot-controls{flex-wrap:wrap}.robot-controls label{max-width:none;flex-basis:100%}.robot-controls>div{margin-left:auto}.robot-info{left:10px;right:10px;bottom:38px;padding:10px}.robot-toolbar button{font-size:12px}}
@media(max-width:700px){.robot-part{flex-wrap:wrap}.robot-part-description{display:block;flex-basis:100%;font-size:12px;line-height:1.7;margin:0;padding:2px 8px 10px;color:#728b9f}.has-drawer .robot-info{display:none}}

.robot-reference-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.robot-metrics{font-size:12px;line-height:1.5;color:#718594;white-space:nowrap}.robot-toolbar button,.robot-reference-actions button{min-height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#4d687c;font-size:13px;white-space:nowrap}.robot-toolbar button:hover,.robot-reference-actions button:hover{background:#f0f5f9}.robot-toolbar button[aria-pressed=true],.robot-reference-actions button[aria-pressed=true]{background:#e4f2f4;border-color:#cfe6ea;color:#0f7383;font-weight:600}.robot-equipment{font-size:12px}.robot-tool-select{width:100px;max-width:100px;flex:none}.robot-tool-select :deep(.el-select__wrapper){min-height:34px;border-radius:8px;font-size:13px;box-shadow:0 0 0 1px #d3e1e9 inset}.robot-toolbar .robot-toolbar-right{gap:4px}.robot-toolbar .robot-equipment{margin-right:4px}.robot-toolbar .robot-model-actions,.robot-reference-actions{gap:3px}
@media(max-width:700px){.robot-toolbar button,.robot-reference-actions button{min-height:40px;font-size:12px;padding:0 8px}.robot-tool-select :deep(.el-select__wrapper){min-height:40px}.robot-toolbar-right{width:100%}.robot-toolbar .robot-equipment{margin-right:auto}.robot-reference-actions{margin-left:auto}}
.robot-controls .robot-primary{border-color:#2f7891;background:#2f7891;color:#fff;font-weight:600}
.robot-leaders{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}.robot-leaders circle{fill:#268bdf;stroke:#fff;stroke-width:1.4}.robot-leaders path{fill:none;stroke:#90aabb;stroke-width:1}.robot-stage .robot-label{position:absolute;z-index:1;min-height:0;font-size:12px;line-height:1.4;padding:4px 7px;background:#fffffff0;border:1px solid #cbdde8;box-shadow:0 2px 8px #2c526b10}.robot-stage .robot-label[aria-pressed=true]{background:#e6f8eb;border-color:#79c98d;color:#237941}
.robot-tool-mechanics{display:flex;gap:8px;flex-wrap:wrap}.robot-tool-mechanics button{font-size:12px;min-height:32px;padding:0 9px;border:1px solid #d3e1e9;border-radius:7px;background:#fff;color:#4d687c}
.main-program-speed{padding:8px 12px;font-size:12px;color:#456b81}.main-program-speed label{display:flex;align-items:center;gap:10px}.main-program-speed input{flex:1;min-width:60px}
.robot-tool-menu{position:relative}.robot-tool-menu-body{position:absolute;right:0;top:calc(100% + 6px);z-index:20;min-width:180px;display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid #d5e4ed;border-radius:10px;padding:9px;box-shadow:0 8px 24px #23465b20}.robot-tool-menu-body button{text-align:left;width:100%}.robot-toolbar{min-height:40px;position:relative;z-index:10}.robot-toolbar-right{align-items:center}.robot-controls>div{flex-wrap:wrap;justify-content:flex-end}
</style>







<style src="./ModelFullscreen.css"></style>

<style scoped>
.robot-stage{order:2}.robot-program-pane{order:3;width:340px;flex-shrink:0;overflow:auto;min-height:0;background:#f6f9fb;padding:10px}.robot-program-pane :deep(.abb-program-control){margin-top:0}.robot-receiving-status{position:absolute;bottom:12px;right:16px;background:#eef7faeb;border-radius:5px;padding:4px 8px;color:#26778e;font-size:12px;pointer-events:none}
@media(max-width:900px){
 .robot-viewer.program-open:not(.model-fullscreen){height:auto;min-height:0}
 .program-open .abb-model-workspace{flex-direction:column;flex:none}
 .program-open .robot-stage{flex:none;height:clamp(240px,42dvh,360px)}
 .robot-program-pane{width:100%;box-sizing:border-box;max-height:none;flex:none;overflow:visible}
 .model-fullscreen.program-open .abb-model-workspace{flex:1;overflow:auto}
 .model-fullscreen.program-open .robot-program-pane{max-height:46dvh;overflow:auto}
 .robot-receiving-status{bottom:32px}
}
</style>

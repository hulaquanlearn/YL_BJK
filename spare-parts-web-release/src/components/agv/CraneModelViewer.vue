<template>
 <section ref="fullscreenHost" class="crane-viewer" :class="{'model-fullscreen':fullscreen,'workshop-enabled':workshopMode}" aria-label="智能行车三维展示">
  <header><span class="crane-metrics">9 个机构 · 16 个伺服轴</span><div><button @click="drawer=!drawer" :aria-pressed="drawer">系统与部件</button><button @click="actions=!actions" :disabled="workshopMode" :aria-pressed="actions">设备动作</button><button @click="toggleWorkshop" :aria-pressed="workshopMode">{{workshopMode?'结构展示':'车间抓糟'}}</button><button @click="labelsEnabled=!labelsEnabled" :aria-pressed="labelsEnabled">标签</button></div></header>
  <div class="crane-workspace">
   <div ref="host" class="crane-canvas" />
   <svg v-if="labelsEnabled" class="crane-leaders" aria-hidden="true"><g v-for="label in labels.filter(item=>!selected || item.id===selected.name)" :key="label.id" :class="{selected:selected?.name===label.id}"><path :d="label.path"/><circle :cx="label.anchorX" :cy="label.anchorY" r="3.5"/></g></svg>
   <button v-for="label in labelsEnabled?labels:[]" :key="label.id" class="crane-label" :aria-label="'部件标签：'+label.text" :aria-pressed="selected?.name===label.id" :style="{left:label.x+'px',top:label.y+'px',width:label.width+'px',height:label.height+'px'}" @click="select(label.id)">{{label.text}}</button>
   <aside v-if="drawer" class="crane-parts-pane" aria-label="智能行车系统与部件">
    <div class="crane-pane-head"><strong>系统与部件 <small>{{componentItems.length}}</small></strong><button class="crane-pane-close" aria-label="关闭行车部件面板" @click="drawer=false">×</button></div>
    <div class="crane-pane-scroll"><details v-for="group in systems" :key="group.id" class="crane-part-group" open><summary>{{group.label}}<small>{{groupComponents(group).length}}</small></summary><button v-for="part in groupComponents(group)" :key="part.name" class="crane-part-row" :aria-pressed="selected?.name===part.name" @click="select(part.name)"><span>{{part.userData.label}}</span><span aria-hidden="true">›</span></button></details></div>
   </aside>
   <aside v-if="actions&&!workshopMode" class="crane-actions" aria-label="智能行车设备动作"><h3>设备动作</h3><p>直线动作按行程比例演示，两台小车保持间距；抓斗换向时先合斗。</p><button @click="hopperVisible=!hopperVisible" :aria-pressed="hopperVisible">{{hopperVisible?'隐藏周转斗':'显示周转斗'}}</button><label v-for="axis in craneAxes" :key="axis.id">{{axis.label}}<input :value="pose[axis.id]*100" type="range" :min="(axis.min??0)*100" max="100" :step="axis.id==='rotation'||axis.id==='scan'?100:1" :aria-label="axis.label" @input="setAxis(axis.id,$event.target.value)"/><output>{{axisValue(axis.id)}}</output></label><button @click="demo">{{running?'暂停演示':'动作演示'}}</button><p v-if="running" role="status">{{demoStages[stage%demoStages.length].label}}</p></aside>
   <aside v-if="workshopMode" class="crane-actions workshop-actions" aria-label="四列窖池抓糟操作">
    <div class="crane-pane-head"><strong>抓糟演示 <small>四列窖池</small></strong><button class="crane-pane-close" aria-label="收起抓糟面板" @click="toggleWorkshop">×</button></div>
    <div class="crane-pane-scroll workshop-body">
    <section class="workshop-card"><div class="workshop-section-head"><h3>作业设置</h3><span class="workshop-badge">{{currentPool.column}} 列 · {{currentPool.row}} 池</span></div>
    <label>作业窖池<select aria-label="作业窖池" :value="workshopState.selectedPoolId" :disabled="hasActiveGrab" @change="choosePool($event.target.value)"><option v-for="pool in Object.values(workshopState.pools)" :key="pool.id" :value="pool.id">第{{pool.column}}列 · 第{{pool.row}}池（{{Math.round(pool.material/workshopState.config.poolUnits*100)}}%）</option></select></label>
    <div class="workshop-cover"><span :class="{ready:currentPool.coverOpen}">{{currentPool.coverOpen?'窖帽已移开':'窖帽未移开'}}</span><button :disabled="hasActiveGrab" @click="changeCover">{{currentPool.coverOpen?'放回窖帽':'人工移帽'}}</button></div>
    <div class="workshop-material"><span>当前池余量</span><strong>{{currentPool.material}} <small>/ {{workshopState.config.poolUnits}} 斗</small></strong></div><progress :value="currentPool.material" :max="workshopState.config.poolUnits" aria-label="当前窖池剩余料量"/></section>
    <div class="workshop-counts"><span>抓斗携料<strong>{{workshopStats.grabLoad}}</strong></span><span>转运斗内<strong>{{workshopStats.hopperLoad}} / {{workshopStats.hopperCapacity}}</strong></span><span>池内总料<strong>{{workshopStats.remaining}}</strong></span></div>
    <section class="workshop-card"><div class="workshop-section-head"><h3>运行控制</h3><small>卸入随车转运斗</small></div><label class="workshop-speed">演示速度<select aria-label="演示速度" v-model.number="workSpeed"><option :value="1">1×</option><option :value="3">3×</option><option :value="5">5×</option></select></label>
    <label class="workshop-check"><input v-model="repeatGrab" type="checkbox"/>连续抓取当前池</label>
    <div class="workshop-run-buttons"><button class="crane-primary" @click="toggleGrab">{{playback?.running?'暂停抓取':hasActiveGrab?'继续抓取':'开始抓取'}}</button><button @click="resetMaterial">重置物料</button></div>
    <p class="workshop-status" role="status"><i aria-hidden="true"/>{{workMessage||grabStageLabel}}</p></section><p class="workshop-note">四列三排 · 共12口窖池<br/>暂停与切换视图保留物料</p>
    </div>
   </aside>
   <div v-if="failure" class="crane-failure" role="alert">{{failure}}</div>
   <article v-if="selected" class="crane-info" :class="{'beside-parts':drawer}"><button aria-label="关闭行车部件说明" @click="select('')">×</button><strong>{{selected.userData.label}}</strong><p v-if="selected.userData.mechanism" class="crane-info-mech">机构：{{selected.userData.mechanism}}<template v-if="selected.userData.controllerAxes?.length"> · 机构轴 {{selected.userData.controllerAxes.join('、')}}</template></p><ModelPartDescription :description="selected.userData.description" /></article>
  </div>
  <footer><label>结构展开<input :value="explosion" @input="setExplosion($event.target.value)" type="range" min="0" max="100" aria-label="智能行车结构展开"/><output>{{Math.round(explosion)}}%</output></label><span aria-live="polite">{{explosion||explosionAnimation?craneDisassemblyStatus(explosion/100,explosionAnimation?.to===0):workshopMode?'抓糟演示':'已组装'}}</span><div class="crane-control-buttons"><button class="crane-primary" @click="animateExplosion(100)">拆开</button><button @click="reset" :disabled="workshopMode&&hasActiveGrab">复位</button><button @click="front">正视</button><button @click="top">俯视</button><button @click="toggleFullscreen">{{fullscreen?'退出全屏':'全屏'}}</button></div></footer>
 </section>
</template>
<script setup>
import ModelPartDescription from './ModelPartDescription.vue'
import {ref,shallowRef,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {installModelClickPan} from '../../utils/model-click-pan.mjs'
import {useModelFullscreen} from '../../utils/model-fullscreen.mjs'
import {craneAxes,craneHomePose,cranePose,advanceCraneDemo} from '../../utils/crane-state.mjs'
import {createWorkshopState,applyWorkshopAction,workshopSummary} from '../../utils/crane-workshop.mjs'
import {buildWorkshopModel,applyWorkshopVisual} from '../../utils/crane-workshop-model.mjs'
import {beginGrabPlayback,advanceGrabPlayback} from '../../utils/crane-grab-playback.mjs'
import {craneDisassemblyOffset,craneDisassemblyStatus} from '../../utils/crane-disassembly.mjs'
import {createCraneComponents} from '../../utils/crane-components.mjs'
import {createModelAnchorTracker,objectVisible} from '../../utils/model-surface-anchor.mjs'
import {layoutAgvLabels} from '../../utils/agv-presentation.mjs'
// Geometry is provided by the separately reviewed model builder. This viewer
// owns rendering/resources; it never communicates with a field controller.
const props=defineProps({buildModel:{type:Function,required:true},applyPose:{type:Function,required:true},systems:{type:Array,default:()=>[]}})
const host=ref(),drawer=ref(false),actions=ref(false),explosion=ref(0),selected=shallowRef(null),pose=ref(craneHomePose()),running=ref(false),failure=ref('')
const explosionAnimation=shallowRef(null)
const labelsEnabled=ref(true),labels=shallowRef([]),componentItems=shallowRef([]),anchorTracker=createModelAnchorTracker()
const workshopMode=ref(false),workshopState=shallowRef(createWorkshopState()),playback=shallowRef(null),workSpeed=ref(3),repeatGrab=ref(false),workMessage=ref(''),hopperVisible=ref(true)
const hasActiveGrab=computed(()=>!!playback.value&&!playback.value.complete)
const workshopStats=computed(()=>workshopSummary(workshopState.value))
const currentPool=computed(()=>workshopState.value.pools[workshopState.value.selectedPoolId])
const grabStageLabel=computed(()=>playback.value?.complete?'本次抓取完成':playback.value?.steps[playback.value.index]?.label||'选择窖池后开始抓取')
const fullscreenHost=ref(),{fullscreen,toggle:toggleFullscreen}=useModelFullscreen(fullscreenHost)
let press=null,model,scene,camera,renderer,controls,pan,observer,frame=0,disposed=false,last=0,stage=0,fitBox,fitOnNext=false,lastBridgeX=0,workshopView,grid,componentRegistry,lastLabelTime=0,labelViewKey=''
const offsets=new Map(),ray=new THREE.Raycaster(),pointer=new THREE.Vector2()
watch(explosion,value=>{if(value){running.value=false;pauseGrab()}fitOnNext=true})
watch([workshopMode,actions,drawer],()=>{if(renderer)resize()})
watch(selected,part=>{componentRegistry?.select(part?.name||'')})
const workReasons={'cover-closed':'请先将选中池设为已人工移帽','pool-empty':'该池已无料，请选择其他窖池','grab-loaded':'抓斗仍有料，先完成当前卸料','invalid-phase':'请继续或重置当前作业','paused':'作业已暂停','transfer-proximity':'两台小车间距不足','height-out-of-range':'尚未到达作业高度','position-out-of-range':'尚未到达目标位置','hopper-full':'转运斗已满，已停止抓取并保留物料','transfer-not-lowered':'转运斗尚未降到接料高度','grab-not-raised':'抓斗尚未提升到安全高度'}
function workAction(action){const next=applyWorkshopAction(workshopState.value,action);if(!next.result.ok){workMessage.value=workReasons[next.result.reason]||next.result.reason;return false}workshopState.value=next.state;workMessage.value='';return true}
function choosePool(poolId){workAction({type:'select-pool',poolId})}
function changeCover(){workAction({type:'set-cover',poolId:currentPool.value.id,open:!currentPool.value.coverOpen,manual:true})}
function pauseGrab(){if(playback.value?.running){playback.value={...playback.value,running:false};workAction({type:'pause'})}}
function toggleWorkshop(){pauseGrab();running.value=false;explosionAnimation.value=null;workshopMode.value=!workshopMode.value;drawer.value=false;actions.value=false;explosion.value=0;selected.value=null;pose.value=workshopMode.value&&hasActiveGrab.value?{...playback.value.pose}:cranePose({...craneHomePose(),transfer:1,transferHoist:0});lastBridgeX=0;fitOnNext=true}
function toggleGrab(){
 setExplosion(0)
 if(playback.value?.running){pauseGrab();return}
 if(hasActiveGrab.value){if(workAction({type:'resume'}))playback.value={...playback.value,running:true,error:null};return}
 if(workshopState.value.paused)workAction({type:'resume'})
 const next=beginGrabPlayback(workshopState.value,pose.value)
 if(!next.result.ok){workMessage.value=workReasons[next.result.reason]||next.result.reason;return}
 workshopState.value=next.state;playback.value=next.playback;workMessage.value='';explosion.value=0;last=performance.now()
}
function resetMaterial(){workshopState.value=applyWorkshopAction(workshopState.value,{type:'reset-material'}).state;playback.value=null;workMessage.value='物料与窖帽已重置';reset({immediate:true});}
function groupComponents(group){return componentItems.value.filter(part=>group.parts.includes(part.partId))}
function select(id){selected.value=componentRegistry?.byId.get(id)||null}
function setAxis(id,value){running.value=false;setExplosion(0);pose.value=cranePose({...pose.value,...(id==='rotation'?{grip:0}:{}),[id]:Number(value)/100})}
function axisValue(id){return ['rotation','scan','flip'].includes(id)?`${Math.round(pose.value[id]*(id==='flip'?180:90))}°`:`${Math.round(pose.value[id]*100)}%`}
const demoStages=[
 {label:'伸缩小车横移',pose:{trolley:.32}},
 {label:'抱斗张开',pose:{trolley:.32,grip:1}},
 {label:'伸缩下降',pose:{trolley:.32,grip:1,hoist:.65}},
 {label:'抱斗闭合',pose:{trolley:.32,hoist:.65}},
 {label:'伸缩提升',pose:{trolley:.32}},
 {label:'闭合后90°换向',pose:{trolley:.32,rotation:1}},
 {label:'抓斗回正',pose:{trolley:.32}},
 {label:'周转剪叉下降',pose:{transferHoist:.5,scan:1}},
 {label:'内框翻转倒料',pose:{transferHoist:.5,flip:1,scan:1}},
 {label:'内框回水平',pose:{transferHoist:.5,scan:1}},
 {label:'周转提升、云台回零',pose:{}}
]
function homePose(){pose.value=cranePose({...craneHomePose(),...(workshopMode.value?{transfer:1,transferHoist:0}:{})});stage=0;fitOnNext=true}
function reset({immediate=false}={}){running.value=false;selected.value=null;if(immediate){setExplosion(0);homePose()}else if(explosion.value>0)animateExplosion(0);else{explosionAnimation.value=null;homePose()}}
function setExplosion(value){explosionAnimation.value=null;explosion.value=Math.max(0,Math.min(100,Number(value)||0))}
function animateExplosion(to){running.value=false;pauseGrab();explosionAnimation.value={from:explosion.value,to,elapsed:0,duration:Math.max(.4,Math.abs(to-explosion.value)/100*8)};last=performance.now()}
function updateExplosion(dt){const a=explosionAnimation.value;if(!a)return;a.elapsed+=dt;const t=Math.min(1,a.elapsed/a.duration);explosion.value=a.from+(a.to-a.from)*t;if(t>=1){explosionAnimation.value=null;if(a.to===0)homePose()}}
function demo(){running.value=!running.value;setExplosion(0);last=performance.now()}
function fit(current=false){
if(!model||!camera)return
const b=workshopMode.value?new THREE.Box3().setFromObject(workshopView.root).union(new THREE.Box3().setFromObject(model.root)):current?model.parts.filter(p=>p.name!=='runway'&&p.visible).reduce((box,p)=>box.union(new THREE.Box3().setFromObject(p)),new THREE.Box3()):fitBox||new THREE.Box3().setFromObject(model.root)
const c=b.getCenter(new THREE.Vector3()),direction=camera.position.clone().sub(controls.target)
if(direction.lengthSq()<.001)direction.set(.8,.65,1)
direction.normalize()
const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect*(camera.userData.fitWidthRatio||1)
let distance=1
const fitRoots=workshopMode.value?[model.root,workshopView.root]:model.parts.filter(p=>p.name!=='runway'&&p.visible)
for(const root of fitRoots)root.traverseVisible(object=>{if(!object.geometry)return;object.geometry.computeBoundingBox();const bounds=object.geometry.boundingBox;if(!bounds)return;object.updateWorldMatrix(true,false);for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld).sub(c);distance=Math.max(distance,v.dot(direction)+Math.max(Math.abs(v.dot(right))/tanH,Math.abs(v.dot(up))/tanV))}})
controls.target.copy(c);camera.position.copy(c).addScaledVector(direction,distance*1.08);camera.near=.05;camera.far=Math.max(300,distance*20);camera.updateProjectionMatrix();controls.update()
}
function front(){if(!camera)return;const c=controls.target,d=camera.position.distanceTo(c);camera.position.copy(c).add(new THREE.Vector3(d,d*.12,0));fit(true)}
function top(){if(!camera)return;const c=controls.target,d=camera.position.distanceTo(c);camera.position.copy(c).add(new THREE.Vector3(0,d,.001));fit(true)}
function beginPick(event){press=event.button===0&&!pan?.active?{x:event.clientX,y:event.clientY}:null}
function pick(event){if(!renderer||event.button!==0||!press||pan?.active||Math.hypot(event.clientX-press.x,event.clientY-press.y)>5)return;press=null;const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const objects=[...componentRegistry.meshes.filter(objectVisible),...(workshopMode.value&&workshopView.root.visible?[workshopView.root]:[])];for(const hit of ray.intersectObjects(objects,true)){if(!objectVisible(hit.object))continue;const part=componentRegistry.byMesh.get(hit.object);if(part){select(part.name);return}let n=hit.object;while(n&&!n.userData.poolId)n=n.parent;if(n){if(!hasActiveGrab.value)choosePool(n.userData.poolId);select('');return}}select('')}
function updateLabels(now){
 if(!labelsEnabled.value||!componentRegistry||now-lastLabelTime<120)return
 lastLabelTime=now;camera.updateMatrixWorld();model.root.updateMatrixWorld(true)
 const {width,height}=host.value.getBoundingClientRect(),key=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements,width,height,JSON.stringify(pose.value),explosion.value,selected.value?.name,drawer.value,actions.value,workshopMode.value,hopperVisible.value].join('|')
 if(key===labelViewKey)return;anchorTracker.clear();labelViewKey=key
 const desktop=window.matchMedia('(min-width:701px)').matches,left=desktop&&drawer.value?260:0,right=desktop&&(workshopMode.value||actions.value)?300:0,available=width-left-right,max=width<700?6:Math.min(20,Math.floor((height-100)/38)*2),eye=camera.getWorldPosition(new THREE.Vector3()),anchors=[]
 const candidates=componentItems.value.filter(p=>p.meshes.some(objectVisible)).map(part=>{const box=new THREE.Box3();for(const mesh of part.meshes)if(objectVisible(mesh))box.expandByObject(mesh);return {part,distance:box.getCenter(new THREE.Vector3()).distanceTo(eye)}}).sort((a,b)=>a.part.priority-b.part.priority||a.distance-b.distance)
 for(const {part} of candidates){
  if(anchors.length>=max)break
  const anchor=anchorTracker.get(part.name,part.meshes,camera);if(!anchor)continue;const point=anchor.clone().project(camera),x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;if(x<left||x>width-right||y<10||y>height-20)continue
  ray.set(eye,anchor.clone().sub(eye).normalize());const hit=ray.intersectObjects(componentRegistry.meshes.filter(objectVisible),false)[0];if(hit&&componentRegistry.byMesh.get(hit.object)!==part&&hit.distance<eye.distanceTo(anchor)-.04)continue
  anchors.push({id:part.name,text:part.userData.label,x:x-left,y})
 }
 const card=fullscreenHost.value?.querySelector('.crane-info'),placed=layoutAgvLabels(anchors,available,height,{leftBottom:card?card.offsetHeight+20:0})
 labels.value=placed.map(a=>({...a,x:a.x+left,anchorX:a.anchorX+left,path:'M'+(a.anchorX+left).toFixed(1)+','+a.anchorY.toFixed(1)+' L'+(a.x+left+(a.x<available/2?a.width:0)).toFixed(1)+','+(a.y+a.height/2).toFixed(1)}))
}
function resize(){if(!host.value||!renderer)return;const {width,height}=host.value.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;const desktop=window.matchMedia('(min-width:701px)').matches,right=desktop&&(workshopMode.value||actions.value)?300:0,left=desktop&&drawer.value?260:0;camera.userData.fitWidthRatio=Math.max(.3,(width-right-left)/width);camera.setViewOffset(width,height,(right-left)/2,0,width,height);camera.updateProjectionMatrix();if(fitBox)fit(true)}
function tick(now){if(disposed)return;frame=requestAnimationFrame(tick);const dt=last?Math.min(.1,(now-last)/1000):0;last=now
 updateExplosion(dt)
 if(running.value){const target=cranePose({...craneHomePose(),...demoStages[stage%demoStages.length].pose});pose.value=advanceCraneDemo(pose.value,target,dt);if(craneAxes.every(a=>Math.abs(pose.value[a.id]-target[a.id])<.0001))stage++}
 if(workshopMode.value&&playback.value?.running){
  const advanced=advanceGrabPlayback(playback.value,workshopState.value,dt,{speed:workSpeed.value});playback.value=advanced.playback;workshopState.value=advanced.state;pose.value=advanced.playback.pose
  if(advanced.playback.error)workMessage.value=workReasons[advanced.playback.error]||advanced.playback.error
  if(advanced.playback.complete&&repeatGrab.value&&currentPool.value.material>0)toggleGrab()
 }
 for(const part of model.parts){const old=offsets.get(part);if(old)part.position.sub(old)}
 props.applyPose(model,pose.value,{workshop:workshopMode.value})
 model.rig.hopper.visible=workshopMode.value||hopperVisible.value
 applyWorkshopVisual(workshopView,workshopState.value,{active:workshopMode.value&&!explosion.value,unloadProgress:playback.value?.unloadProgress||0,pose:pose.value});grid.visible=!workshopMode.value
 const bridge=model.parts.find(p=>p.name==='bridge-girder');if(bridge){const dx=bridge.position.x-lastBridgeX;if(!workshopMode.value){camera.position.x+=dx;controls.target.x+=dx}lastBridgeX=bridge.position.x}
 for(const part of model.parts){const offset=craneDisassemblyOffset(part,explosion.value/100);part.position.add(offset);offsets.set(part,offset)}
 if(fitOnNext){model.root.updateMatrixWorld(true);fit(true);fitOnNext=false}
 controls.update();updateLabels(now);renderer.render(scene,camera)
}
onMounted(()=>{try{model=props.buildModel();componentRegistry=createCraneComponents(model);componentItems.value=componentRegistry.components;scene=new THREE.Scene();scene.background=new THREE.Color('#eef5f8');camera=new THREE.PerspectiveCamera(40,1,.05,500);camera.position.set(22,15,12);renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.value.appendChild(renderer.domElement);scene.add(model.root);workshopView=buildWorkshopModel(workshopState.value.config.layout,workshopState.value.config);scene.add(workshopView.root);workshopView.root.visible=false;model.rig.grab.add(workshopView.grabGrain);model.rig.hopper.add(workshopView.hopperGrain);scene.add(new THREE.HemisphereLight(0xffffff,0x687c8e,2.4));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(8,15,10);scene.add(light);grid=new THREE.GridHelper(32,32,0xaec6d3,0xd8e5eb);grid.position.y=-.015;scene.add(grid);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;pan=installModelClickPan({element:renderer.domElement,camera,controls});observer=new ResizeObserver(resize);observer.observe(host.value);renderer.domElement.addEventListener('pointerdown',beginPick);renderer.domElement.addEventListener('click',pick);props.applyPose(model,pose.value);model.root.updateMatrixWorld(true);fitBox=new THREE.Box3();for(const part of model.parts)if(part.name!=='runway')fitBox.union(new THREE.Box3().setFromObject(part));resize();fit();frame=requestAnimationFrame(tick)}catch(e){failure.value='智能行车模型暂时无法显示：'+e.message}})
onBeforeUnmount(()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();pan?.dispose();controls?.dispose();renderer?.domElement.removeEventListener('pointerdown',beginPick);renderer?.domElement.removeEventListener('click',pick);componentRegistry?.dispose();const geometries=new Set(),materials=new Set();scene?.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m)materials.add(m)});geometries.forEach(g=>g.dispose());const textures=new Set();materials.forEach(m=>{Object.values(m).filter(t=>t?.isTexture).forEach(t=>textures.add(t));m.dispose()});textures.forEach(t=>t.dispose());renderer?.dispose();renderer?.domElement.remove()})
</script>
<style scoped>
.crane-viewer{color:#42677e;min-width:0;font-size:13px}.crane-viewer button{min-height:36px;padding:0 12px;border:1px solid #d3e1e9;border-radius:7px;background:#fff;color:inherit;font:inherit;cursor:pointer}.crane-viewer button:hover{background:#f0f6f9}.crane-viewer button:disabled{opacity:.45;cursor:default}.crane-viewer button:focus-visible,.crane-viewer summary:focus-visible{outline:2px solid #2f8b9e;outline-offset:2px}.crane-viewer button[aria-pressed=true]{background:#e7f4f7;color:#14768a}.crane-viewer button.crane-primary{border-color:#2f7891;background:#2f7891;color:#fff;font-weight:600}.crane-viewer button.crane-primary:hover{background:#276a81}
.crane-viewer>header,.crane-viewer>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:6px 0 10px}.crane-viewer>header>div,.crane-control-buttons{display:flex;gap:6px;flex-wrap:wrap}.crane-viewer>header button{min-height:34px;padding:0 10px;border-color:transparent;border-radius:8px;background:transparent;white-space:nowrap}.crane-viewer>header button[aria-pressed=true]{background:#e4f2f4;border-color:#cfe6ea;color:#0f7383;font-weight:600}.crane-metrics{font-size:12px;color:#8197a6;white-space:nowrap}
.crane-workspace{position:relative;height:calc(var(--agv-viewer-height,680px) - 96px);min-height:450px;max-height:900px;border:1px solid #dce8ee;border-radius:14px;overflow:hidden}.crane-canvas{position:absolute;inset:0}.crane-workspace aside{position:absolute;left:0;top:0;bottom:0;z-index:2;width:260px;box-sizing:border-box;background:#fffffff2;border-right:1px solid #d3e1e9;display:flex;flex-direction:column;overflow:hidden}.crane-workspace aside.crane-actions{left:auto;right:0;width:300px;border-right:0;border-left:1px solid #d3e1e9;padding:12px;overflow:auto}.crane-workspace aside.workshop-actions{padding:0;background:#f6fafc}
.crane-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:48px;padding:0 12px;border-bottom:1px solid #dce8ef;background:#fff;flex-shrink:0}.crane-pane-head strong{color:#245771;font-size:14px}.crane-pane-head small{font-size:11px;color:#8197a6;font-weight:400;margin-left:5px}.crane-viewer .crane-pane-close{border:0;background:transparent;font-size:22px;color:#8197a6;min-width:28px;padding:0}.crane-pane-scroll{flex:1;min-height:0;overflow:auto;padding:0 10px 12px;scrollbar-width:thin;scrollbar-color:#c9d7e0 transparent}.crane-part-group{margin-top:12px}.crane-part-group summary{display:flex;align-items:center;gap:6px;list-style:none;color:#1e5774;background:#eaf2f7;border-left:3px solid #2f8b9e;border-radius:0 5px 5px 0;padding:8px;font-weight:700;cursor:pointer}.crane-part-group summary::-webkit-details-marker{display:none}.crane-part-group summary:before{content:'›';font-weight:400;transform:rotate(0);transition:transform .15s}.crane-part-group[open] summary:before{transform:rotate(90deg)}.crane-part-group summary small{margin-left:auto;color:#8197a6;font-size:11px;font-weight:400}.crane-viewer .crane-part-row{display:flex;align-items:center;justify-content:space-between;width:100%;border:0;background:transparent;text-align:left;padding:7px 8px;margin-top:3px;font-size:13px;line-height:1.5}.crane-viewer .crane-part-row span:last-child{color:#a3b7c4}.crane-viewer .crane-part-row:hover,.crane-viewer .crane-part-row[aria-pressed=true]{background:#e7f4f7}
.workshop-body{padding:12px 10px}.workshop-card{padding:12px;background:#fff;border:1px solid #d7e6ef;border-radius:10px}.workshop-section-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:10px}.crane-workspace h3{font-size:13px;color:#245771;margin:0;line-height:1.5}.workshop-section-head small{font-size:11px;color:#8ba0af}.workshop-badge{padding:2px 7px;border:1px solid #d3e8f0;border-radius:10px;color:#3a7c96;background:#f2f9fc;font-size:11px}.crane-actions p{font-size:12px;line-height:1.7}.crane-actions label{display:grid;grid-template-columns:1fr auto;gap:7px;font-size:12px;margin:12px 0}.crane-actions input{grid-row:2;grid-column:1/-1;width:100%;accent-color:#2f7891}.workshop-actions select{grid-column:1/-1;width:100%;min-height:36px;padding:5px 9px;border:1px solid #cddfea;border-radius:7px;background:#fcfeff;color:#42677e;font:inherit}.workshop-cover{display:flex;justify-content:space-between;align-items:center;gap:5px;font-size:11px}.workshop-cover>span{color:#9a855f}.workshop-cover>span.ready{color:#438473}.crane-viewer .workshop-cover button{min-height:28px;border:0;color:#3a7c96;padding:0 5px;font-size:11px;background:transparent}.workshop-material{display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-top:10px;color:#8197a6}.workshop-material strong{color:#2e6581;font-size:13px}.workshop-material small{font-weight:400;color:#8197a6}.workshop-card progress{display:block;width:100%;height:5px;margin-top:6px;border:0;border-radius:3px;overflow:hidden;background:#e4eef3;accent-color:#3e90a7}.workshop-card progress::-webkit-progress-bar{background:#e4eef3}.workshop-card progress::-webkit-progress-value{background:#3e90a7;border-radius:3px}
.workshop-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}.workshop-counts span{font-size:11px;text-align:center;background:#fff;border:1px solid #d7e6ef;border-radius:9px;padding:10px 2px;color:#8197a6}.workshop-counts strong{display:block;color:#245771;font-size:18px;line-height:1.6;margin-top:2px;font-variant-numeric:tabular-nums}.crane-actions .workshop-speed{grid-template-columns:1fr 90px;align-items:center;margin:4px 0 12px}.workshop-speed select{grid-column:auto}.crane-actions .workshop-check{display:flex;align-items:center;gap:7px;margin:12px 0;color:#688294}.crane-actions .workshop-check input{width:14px;height:14px;grid-row:auto;grid-column:auto;margin:0}.workshop-run-buttons{display:flex;gap:7px}.workshop-run-buttons button{flex:1;padding:0 8px}.workshop-status{display:flex;align-items:flex-start;gap:6px;margin:12px 0 0;padding:9px 10px;background:#f0f7fa;border-radius:6px;color:#4e7c91}.workshop-status i{display:block;flex-shrink:0;width:5px;height:5px;border-radius:50%;background:#3e90a7;margin-top:7px}.workshop-note{margin:10px 2px 0;color:#91a3af;font-size:11px!important}
.crane-info{position:absolute;bottom:12px;left:12px;max-width:min(430px,90%);padding:14px;background:#fffffff2;border:1px solid #dbe8ef;border-radius:12px}.crane-info p{font-size:13px;line-height:1.6}.crane-info small{color:#6d8799}.crane-info>button{float:right;padding:0 6px;border:0}.crane-viewer>footer{padding-top:10px;font-size:13px}.crane-viewer>footer label{display:flex;align-items:center;gap:12px}.crane-viewer>footer input{width:min(30vw,350px);accent-color:#2f7891}.crane-viewer>footer>span{color:#8197a6;font-size:12px}.crane-control-buttons{justify-content:flex-end}.crane-failure{position:absolute;inset:40%;background:white;padding:14px;width:230px;height:max-content}
.crane-viewer.model-fullscreen{position:fixed;inset:0;z-index:2500;background:white;padding:12px;display:flex;flex-direction:column}.crane-viewer.model-fullscreen .crane-workspace{flex:1;height:auto;max-height:none;min-height:0}
@media(max-width:700px){.crane-workspace{height:420px;min-height:420px}.crane-viewer>header{align-items:flex-start}.crane-viewer>header button{font-size:12px}.crane-viewer button{min-height:40px;padding:0 10px}.crane-workspace aside.crane-parts-pane{width:min(260px,85%);box-shadow:8px 0 28px #24475c15}.crane-workspace aside.crane-actions{width:min(300px,90%)}.crane-viewer>footer>span{flex-basis:100%}.crane-viewer.workshop-enabled .crane-workspace{height:auto;max-height:none;min-height:0}.workshop-enabled .crane-canvas{position:relative;height:420px}.crane-viewer.workshop-enabled aside.workshop-actions{position:relative;inset:auto;width:auto;border:0;border-top:1px solid #dce8ef;max-height:none}.crane-viewer.workshop-enabled.model-fullscreen .crane-workspace{overflow:auto}}
.crane-info{z-index:3}.crane-info.beside-parts{left:272px}@media(max-width:700px){.crane-info.beside-parts{left:10px;right:10px;max-width:none}}
.crane-leaders{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}.crane-leaders path{fill:none;stroke:#90aabb;stroke-width:1}.crane-leaders circle{fill:#268bdf;stroke:#fff;stroke-width:1.4}.crane-viewer .crane-label{position:absolute;z-index:1;min-height:0;padding:4px 7px;font-size:12px;line-height:1.4;background:#fffffff0;border:1px solid #cbdde8;box-shadow:0 2px 8px #2c526b10}.crane-viewer .crane-label[aria-pressed=true],.crane-viewer .crane-part-row[aria-pressed=true]{background:#e6f8eb;border-color:#79c98d;color:#237941}.crane-info>strong{color:#237941}
.crane-leaders g.selected circle{fill:#46c96b}.crane-leaders g.selected path{stroke:#3e9956}
</style>

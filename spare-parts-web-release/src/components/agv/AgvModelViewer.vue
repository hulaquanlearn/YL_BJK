<template>
  <section ref="fullscreenHost" :class="{'model-fullscreen':fullscreen}" class="agv-model-viewer" aria-label="AGV三维结构部件矩阵">
    <header class="agv-topbar">
      <span class="agv-metrics">{{partInfo.length || '—'}} 部件 · {{systemRows.length || '—'}} 系统</span>
      <nav class="agv-actions" aria-label="模型工具"><button type="button" :aria-pressed="fullscreen" @click="toggleFullscreen">{{fullscreen?'退出全屏':'全屏'}}</button>
        <button type="button" :aria-pressed="!!drawer" @click="toggleDrawer('structure')">系统与部件</button>
        <button type="button" :aria-pressed="labelsEnabled" @click="toggleLabels">标签</button>
      </nav>
    </header>
    <div class="agv-stage">
      <div ref="host" class="agv-canvas"></div>
      <svg class="model-leaders" aria-hidden="true"><g v-for="label in labels.filter(item=>!selectionIds().length || selectionIds().includes(item.id))" :key="label.id"><path :d="label.path"/><circle :cx="label.anchorX" :cy="label.anchorY" r="3.5"/></g></svg>
      <button v-for="label in labels" :key="label.id" type="button" class="model-part-label" :aria-pressed="selectionIds().includes(label.id)" :style="{left:label.x+'px',top:label.y+'px',width:label.width+'px',height:label.height+'px'}" @click="inspect(label.id)">{{label.text}}</button>

      <aside v-if="drawer" class="agv-drawer" aria-label="系统与部件">
        <header class="agv-drawer-head"><strong>系统与部件</strong><button type="button" class="agv-drawer-close" aria-label="关闭面板" @click="toggleDrawer('structure')">×</button></header>
          <div class="matrix-tree">
            <section v-for="group in systemRows" :key="group.id" class="matrix-group" :style="{'--system-color':group.color}">
              <div class="matrix-group-summary">
                <button type="button" class="matrix-group-heading" :aria-expanded="!collapsedGroups.has(group.id)" :aria-controls="'agv-parts-'+group.id" @click="toggleGroup(group.id)"><span class="tree-chevron" :class="{closed:collapsedGroups.has(group.id)}" aria-hidden="true"></span><i class="system-dot" aria-hidden="true"></i><strong>{{group.label}}</strong><span>{{group.parts.length}} 件</span></button>
                <button type="button" class="matrix-group-action" :aria-pressed="selectedSystem===group.id" :aria-label="groupAction(group)+'整个'+group.label" :disabled="!groupCount(group)" @click="inspectSystem(group)">{{groupAction(group)}}整组</button>
              </div>
              <span class="system-progress" :aria-label="group.label+'拆解进度'"><i :style="{width:groupSplitPercent(group)+'%'}"></i></span>
              <p v-if="selectedSystem===group.id" class="matrix-description">{{group.description}}</p>
              <div v-show="!collapsedGroups.has(group.id)" :id="'agv-parts-'+group.id" class="matrix-group-parts">
                <div v-for="part in group.parts" :key="part.id" class="matrix-part-row" :class="{selected:selectedPart===part.id,hidden:hiddenParts.has(part.id),restored:restoredParts.has(part.id)}">
                  <button type="button" class="matrix-part-select" :aria-pressed="selectedPart===part.id" @click="inspect(part.id)"><span class="part-node" aria-hidden="true"></span><span class="matrix-part-name">{{part.label}}<small>{{part.id}}</small></span><span class="part-state">{{part.id==='chassis'?'基准':expanded && !restoredParts.has(part.id)?'拆开':'归位'}}</span></button>
                  <button type="button" class="part-visibility" :disabled="part.id==='chassis'" :aria-pressed="!hiddenParts.has(part.id)" :aria-label="part.id==='chassis'?'底架为安装基准，始终显示':(hiddenParts.has(part.id)?'显示':'隐藏')+part.label" :title="part.id==='chassis'?'底架始终显示':hiddenParts.has(part.id)?'显示部件':'隐藏部件'" @click="togglePartVisibility(part.id)"><span aria-hidden="true">{{hiddenParts.has(part.id)?'○':'◉'}}</span></button>
                  <p v-if="selectedPart===part.id" class="matrix-description">{{part.description}}</p>
                </div>
              </div>
            </section>
          </div>
          <div class="matrix-footer"><span><i class="status-dot" aria-hidden="true"></i>底架固定为安装基准</span><button type="button" :disabled="!hiddenParts.size" @click="showAllParts">显示全部</button></div>
          <section class="system-section"><div class="setting-heading"><label for="agv-section-toggle">模型剖切</label><button id="agv-section-toggle" type="button" class="setting-switch" :disabled="!!failure" role="switch" :aria-checked="sectionEnabled" aria-label="模型剖切" @click="toggleSection"><span></span></button></div><p class="section-hint">沿车长方向裁切，查看内部空间关系。</p><label class="section-position"><span>剖切位置</span><input type="range" min="0" max="100" :value="sectionPosition" :disabled="!sectionEnabled" aria-label="剖切位置" @input="setSectionPosition($event.target.value)"><small>{{sectionPosition}}%</small></label></section>
      </aside>

      <div v-if="!drawer && (selectedInfo || selectedGroup)" class="agv-selection" role="status">
        <header><strong>{{selectedInfo?.label || selectedGroup?.label}}</strong><span>{{selectionState}}</span><button type="button" aria-label="关闭部件说明" @click="clearSelection">×</button></header>
        <ModelPartDescription :description="selectedInfo?.description || groupDescription" />
      </div>
      <div v-if="failure" class="model-failure" role="alert">{{failure}}<small>仍可在部件矩阵查看功能说明。</small></div>

    </div>
      <fieldset class="agv-bottombar assembly-controls" aria-label="拆解演示控制" :disabled="!!failure">
        <div class="agv-explode">
          <label for="agv-spread">结构展开</label>
          <input id="agv-spread" type="range" min="0" max="100" step="1" :value="timelinePercent" :disabled="!partInfo.length" aria-label="拆解程度" :style="{'--range-progress':timelinePercent+'%'}" @input="scrubAssembly($event.target.value)"><output>{{timelinePercent}}%</output>
        </div>
        <div class="agv-controls">
          <div class="agv-main-actions">
            <button type="button" class="primary-action" :disabled="!partInfo.length" @click="expandAll">拆开</button>

          </div>
          <div class="agv-extra">
            <button type="button" @click="resetAssembly">复位</button>
            <button type="button" :disabled="!!failure" :aria-pressed="viewMode==='front'" @click="setView('front')">正视</button>
            <button type="button" :disabled="!!failure" :aria-pressed="viewMode==='top'" @click="setView('top')">俯视</button>
            <button type="button" :aria-pressed="freeView" @click="toggleFreeView">360°查看</button><button type="button" :aria-pressed="autoRotate" @click="toggleRotation">旋转</button>
          </div>
        </div>
      </fieldset>
  </section>
</template>
<script setup>
import ModelPartDescription from './ModelPartDescription.vue'
import {ref,computed,onMounted,onBeforeUnmount} from 'vue'
import * as THREE from 'three'
import {modelSurfaceAnchor} from '../../utils/model-surface-anchor.mjs'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {FreeModelControls} from '../../utils/free-model-controls.mjs'
import {useModelFullscreen} from '../../utils/model-fullscreen.mjs'
import {buildVehicleModel} from '../../utils/agv-model-catalog.mjs'
import {groupsFor,presentationOffset,latentDescriptions,toggleRestored,createPartHighlighter,layoutAgvLabels} from '../../utils/agv-presentation.mjs'
import {matrixGroups,clampUnit,advanceExplosion} from '../../utils/agv-workbench.mjs'

const props=defineProps({variant:{type:String,default:'old'},family:{type:String,default:'latent'}})
const groups=groupsFor(props.family)
const host=ref(),failure=ref(''),partInfo=ref([]),labels=ref([])
const expanded=ref(false),restoredParts=ref(new Set()),selectedSystem=ref(''),selectedPart=ref('')
const collapsedGroups=ref(new Set()),hiddenParts=ref(new Set())
const freeView=ref(false)
const fullscreenHost=ref(),{fullscreen,toggle:toggleFullscreen,close:closeFullscreen}=useModelFullscreen(fullscreenHost)
const labelsEnabled=ref(true),autoRotate=ref(false),viewMode=ref('free'),drawer=ref('')
const sectionEnabled=ref(false),sectionPosition=ref(60),playing=ref(false),explosionAmount=ref(0)
const selectedGroup=computed(()=>systemRows.value.find(g=>g.id===selectedSystem.value))
const selectedInfo=computed(()=>partInfo.value.find(p=>p.id===selectedPart.value))
const selectionIds=()=>selectedPart.value?[selectedPart.value]:selectedGroup.value?groupPartIds(selectedGroup.value):[]
const selectionState=computed(()=>{if(failure.value)return '三维不可用 · 仅查看说明';const ids=selectionIds().filter(id=>id!=='chassis'&&partInfo.value.some(p=>p.id===id));return ids.length?(expanded.value&&!ids.every(id=>restoredParts.value.has(id))?'拆开视图 · 再点可归位':'归位目标 · 再点可拆开'):selectedPart.value==='chassis'?'安装基准 · 始终显示':''})
const groupDescription=computed(()=>selectedGroup.value?.description||'')
const systemRows=computed(()=>matrixGroups(partInfo.value,groups))
const timelinePercent=computed(()=>Math.round(clampUnit(explosionAmount.value)*100))
let renderer,scene,camera,controls,model,parts=[],highlighter,resizeObserver,intersection,raf=0,progress=0,visible=true,disposed=false,lastTime=0,needsRender=true,pointerStart
let targetSpread=1,clipPlane,clipMin=0,clipMax=1,reducedMotion=false,frameRunning=false
const partProgress=new Map()

function groupPartIds(group){const complete=systemRows.value.find(row=>row.id===group.id)||group;return complete.parts.map(p=>typeof p==='string'?p:p.id)}
function groupIds(group){return groupPartIds(group).filter(id=>id!=='chassis'&&parts.some(p=>p.name===id))}
function groupCount(group){return groupPartIds(group).filter(id=>id!=='chassis'&&partInfo.value.some(p=>p.id===id)).length}
function groupAction(group){const ids=groupPartIds(group).filter(id=>id!=='chassis'&&partInfo.value.some(p=>p.id===id));return !expanded.value||ids.length&&ids.every(id=>restoredParts.value.has(id))?'拆开':'归位'}
function groupSplitPercent(group){const ids=groupIds(group);return expanded.value&&ids.length?100*ids.filter(id=>!restoredParts.value.has(id)).length/ids.length:0}
function toggleGroup(id){const next=new Set(collapsedGroups.value);next.has(id)?next.delete(id):next.add(id);collapsedGroups.value=next}
function toggleDrawer(name){drawer.value=drawer.value===name?'':name;if(camera&&controls)fitCamera(false,selectionIds());requestRender()}
function applyVisibility(){for(const part of parts)part.visible=part.name==='chassis'||!hiddenParts.value.has(part.name);requestRender()}
function showAllParts(){hiddenParts.value=new Set();applyVisibility()}
function revealParts(ids){if(!ids.some(id=>hiddenParts.value.has(id)))return;hiddenParts.value=new Set([...hiddenParts.value].filter(id=>!ids.includes(id)));applyVisibility()}
function togglePartVisibility(id){if(id==='chassis'||!parts.some(p=>p.name===id))return;const next=new Set(hiddenParts.value);next.has(id)?next.delete(id):next.add(id);hiddenParts.value=next;applyVisibility();labels.value=labels.value.filter(label=>!next.has(label.id));}
function applySection(){
  if(clipPlane)clipPlane.constant=clipMin+(clipMax-clipMin)*clampUnit(sectionPosition.value/100)
  for(const part of parts)part.traverse(mesh=>{if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const planes=sectionEnabled.value&&clipPlane?[clipPlane]:[];const changed=(material.clippingPlanes?.length||0)!==planes.length;material.clippingPlanes=planes;if(changed)material.needsUpdate=true}})
  requestRender()
}
function highlight(ids=[]){highlighter?.select(ids);applySection()}
function toggleSection(){sectionEnabled.value=!sectionEnabled.value;applySection()}
function setSectionPosition(value){sectionPosition.value=Math.round(clampUnit(Number(value)/100,.6)*100);applySection()}
function toggleLabels(){labelsEnabled.value=!labelsEnabled.value;if(!labelsEnabled.value)labels.value=[];requestRender()}
function installCameraControls(){const target=controls?.target.clone();controls?.dispose();if(!freeView.value)camera.up.set(0,1,0);controls=new (freeView.value?FreeModelControls:OrbitControls)(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.35;controls.maxDistance=12;controls.autoRotateSpeed=.6;if(!freeView.value)controls.maxPolarAngle=Math.PI*.49;if(target)controls.target.copy(target);controls.addEventListener('change',requestRender);controls.addEventListener('start',beginOrbit);controls.update();controls.saveState()}
function toggleFreeView(){freeView.value=!freeView.value;installCameraControls();requestRender()}
function toggleRotation(){autoRotate.value=!autoRotate.value;if(controls)controls.autoRotate=autoRotate.value;if(autoRotate.value)viewMode.value='free';needsRender=true;start()}
function beginOrbit(){viewMode.value='free'}
function resumeAnimation(){playing.value=true;needsRender=true;lastTime=0;start()}

function fitCamera(resetDirection=false,focusIds=[]){
  if(!camera||!controls||!parts.length)return
  model.updateMatrixWorld(true)
  const bounds=new THREE.Box3(),ids=focusIds.filter(id=>parts.some(p=>p.name===id))
  for(const part of parts.filter(p=>(!ids.length||ids.includes(p.name))&&p.visible)){
    const box=new THREE.Box3().setFromObject(part)
    box.translate(part.position.clone().negate())
    if(expanded.value&&!restoredParts.value.has(part.name)&&part.name!=='chassis')box.translate(new THREE.Vector3(...presentationOffset(part)).multiplyScalar(targetSpread*targetSpread*(3-2*targetSpread)))
    bounds.union(box)
  }
  if(bounds.isEmpty())return
  // The title and model tools are outside the canvas; only the bottom controls
  // and an open structure drawer reserve space inside the stage.
  const hostWidth=Math.max(host.value?.clientWidth||0,320),hostHeight=Math.max(host.value?.clientHeight||0,240)
  // Desktop: the drawer overlays the left edge, so the vehicle moves right.
  // Phone: the drawer is a bottom sheet, so the vehicle is fitted above it and
  // never covered or clipped.
  const compact=hostWidth<=760
  const drawerOpen=Boolean(drawer.value)&&!compact
  const sheetOpen=Boolean(drawer.value)&&compact
  const padTop=18,padSide=18
  const toolbar=compact?118:98
  const sheet=sheetOpen?Math.min(hostHeight*.42,320):0
  const padBottom=toolbar+sheet+(sheet?10:0)
  const padLeft=drawerOpen?Math.min(348,hostWidth*.36):padSide
  const availableWidth=Math.max(180,hostWidth-padLeft-padSide),availableHeight=Math.max(120,hostHeight-padTop-padBottom)
  const center=bounds.getCenter(new THREE.Vector3()),halfV=THREE.MathUtils.degToRad(camera.fov/2),halfH=Math.atan(Math.tan(halfV)*camera.aspect)
  if(resetDirection){camera.up.set(0,1,0);controls.clearMotion?.()}
  const direction=resetDirection?new THREE.Vector3(1.25,.62,1.25).normalize():camera.position.clone().sub(controls.target).normalize()
  if(!direction.lengthSq())direction.set(1,.7,1).normalize()
  const referenceUp=Math.abs(direction.dot(camera.up))>.98?new THREE.Vector3(0,0,-1):camera.up
  const right=new THREE.Vector3().crossVectors(referenceUp,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize()
  const tanH=Math.tan(halfH)*(availableWidth/hostWidth),tanV=Math.tan(halfV)*(availableHeight/hostHeight)
  let distance=.3
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center)
    distance=Math.max(distance,p.dot(direction)+Math.max(Math.abs(p.dot(right))/(tanH*1.02),Math.abs(p.dot(up))/(tanV*1.02)))
  }
  distance*=ids.length?1.12:1.08
  const verticalShift=(padTop-padBottom)/2/(hostHeight/2)*distance*Math.tan(halfV)
  const horizontalShift=-(padLeft-padSide)/2/(hostWidth/2)*distance*Math.tan(halfH)
  controls.target.copy(center).addScaledVector(right,horizontalShift).addScaledVector(up,verticalShift)
  controls.maxDistance=Math.max(8,distance*2);camera.far=Math.max(30,distance*4);camera.updateProjectionMatrix()
  camera.position.copy(controls.target).addScaledVector(direction,distance);controls.update();requestRender()
}
function setView(mode){
  camera?.up.set(0,1,0);controls?.clearMotion?.()
  if(!['top','front'].includes(mode))return
  viewMode.value=viewMode.value===mode?'free':mode
  if(!camera||!controls)return
  autoRotate.value=false;controls.autoRotate=false
  const direction=viewMode.value==='top'?new THREE.Vector3(0,1,.001):viewMode.value==='front'?new THREE.Vector3(0,.06,1):new THREE.Vector3(1.25,.62,1.25)
  camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(3));fitCamera(false,selectionIds())
}
function expandAll(){progress=0;targetSpread=1;expanded.value=true;restoredParts.value=new Set();selectedPart.value='';selectedSystem.value='';showAllParts();highlight();fitCamera();resumeAnimation()}
function resetAssembly(){progress=1;targetSpread=1;expanded.value=false;restoredParts.value=new Set();selectedPart.value='';selectedSystem.value='';labels.value=[];showAllParts();sectionEnabled.value=false;autoRotate.value=false;if(controls)controls.autoRotate=false;viewMode.value='free';highlight();fitCamera(true);resumeAnimation()}
function inspect(id){
  if(!parts.some(p=>p.name===id))return
  if(failure.value){selectedPart.value=id;selectedSystem.value='';return}
  if(!expanded.value)expandAll()
  if(id!=='chassis')restoredParts.value=toggleRestored(restoredParts.value,[id])
  selectedPart.value=id;selectedSystem.value='';revealParts([id]);highlight([id])
  
  fitCamera(false,[id]);resumeAnimation()
}
function inspectSystem(group){
  if(failure.value){selectedSystem.value=group.id;selectedPart.value='';return}
  const ids=groupIds(group)
  if(!expanded.value){
    progress=0;targetSpread=1;expanded.value=true
    restoredParts.value=new Set(parts.filter(p=>p.name!=='chassis'&&!ids.includes(p.name)).map(p=>p.name))
  }else restoredParts.value=toggleRestored(restoredParts.value,ids)
  selectedSystem.value=group.id;selectedPart.value='';revealParts(ids);highlight(ids)
  fitCamera(false,ids);resumeAnimation()
}
function clearSelection(){selectedPart.value='';selectedSystem.value='';highlight();fitCamera();needsRender=true}
function scrubAssembly(value){
  const amount=clampUnit(Number(value)/100),eased=amount*amount*(3-2*amount)
  targetSpread=amount;expanded.value=amount>0;restoredParts.value=new Set();playing.value=false;explosionAmount.value=amount
  for(const part of parts){const next=part.name==='chassis'?0:amount,offset=presentationOffset(part);partProgress.set(part.name,next);part.position.set(offset[0]*(part.name==='chassis'?0:eased),offset[1]*(part.name==='chassis'?0:eased),offset[2]*(part.name==='chassis'?0:eased))}
  fitCamera(false,selectionIds());needsRender=true
}
function initializeView(){
  if(!camera||!controls)return
  expanded.value=false;selectedPart.value='';selectedSystem.value='';labels.value=[];pointerStart=null;progress=0;targetSpread=1;explosionAmount.value=0;playing.value=false;restoredParts.value=new Set();partProgress.clear()
  parts.forEach(part=>part.position.set(0,0,0))
  const damping=controls.enableDamping;controls.enableDamping=false;controls.update();fitCamera(true);controls.saveState();controls.reset();controls.enableDamping=damping;needsRender=true;start()
}
function updateAssembly(dt){
  let moving=false,total=0,count=0
  for(const part of parts){
    const target=part.name!=='chassis'&&expanded.value&&!restoredParts.value.has(part.name)?targetSpread:0,current=partProgress.get(part.name)||0
    const next=reducedMotion?target:advanceExplosion(current,target,dt)
    if(Math.abs(next-current)>.00001)needsRender=true
    if(Math.abs(next-target)>.00001)moving=true
    partProgress.set(part.name,next)
    const eased=next*next*(3-2*next),offset=presentationOffset(part)
    part.position.set(offset[0]*eased,offset[1]*eased,offset[2]*eased)
    if(part.name!=='chassis'){total+=next;count++}
  }
  explosionAmount.value=count?total/count:0;playing.value=moving;progress+=dt

}
function updateLabels(){
  if(!host.value||!camera)return
  const width=host.value.clientWidth,height=host.value.clientHeight,ids=selectionIds()
  const projected=labelsEnabled.value&&expanded.value&&(width>=600||ids.length)?parts.filter(p=>p.visible).flatMap(p=>{
    p.updateWorldMatrix(true,true);const anchor=modelSurfaceAnchor([p],camera);if(!anchor)return []
    const v=anchor.project(camera)
    if(v.z<-1||v.z>1)return []
    return [{id:p.name,text:p.userData.label,x:THREE.MathUtils.clamp((v.x*.5+.5)*width,2,width-2),y:THREE.MathUtils.clamp((-.5*v.y+.5)*height,65,height-48)}]
  }):[]
  const card=host.value.parentElement?.querySelector?.('.agv-selection');labels.value=layoutAgvLabels(projected,width,height,{leftBottom:card?card.offsetHeight+22:0})
}
function frame(time){
  raf=0
  if(disposed||!visible||document.hidden||!renderer||!controls||failure.value)return
  frameRunning=true
  let changed=false
  try{
    const dt=lastTime?Math.min(.05,Math.max(0,(time-lastTime)/1000)):.016;lastTime=time
    updateAssembly(dt);changed=controls.update(dt)
    if(changed||needsRender){renderer.render(scene,camera);updateLabels();needsRender=false}
  }finally{frameRunning=false}
  if(playing.value||autoRotate.value||changed)start()
}
function start(){if(!frameRunning&&!raf&&!disposed&&visible&&!document.hidden&&renderer&&controls&&!failure.value)raf=requestAnimationFrame(frame)}
function requestRender(){needsRender=true;start()}
function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;lastTime=0}else{needsRender=true;lastTime=0;start()}}
function resize(){if(!host.value||!renderer)return;const width=host.value.clientWidth,height=host.value.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();controls?.handleResize?.();fitCamera(false,selectionIds());requestRender()}
function pointerDown(e){pointerStart=e.isPrimary===false||e.button>0?null:{x:e.clientX,y:e.clientY,pointerId:e.pointerId}}
function pointerUp(e){
  const initial=pointerStart;pointerStart=null
  if(!initial||e.pointerId!==initial.pointerId||e.button>0||Math.hypot(e.clientX-initial.x,e.clientY-initial.y)>6||e.isPrimary===false||!renderer)return
  const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster()
  if(!r.width||!r.height)return
  ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera)
  const hit=ray.intersectObjects(parts.filter(p=>p.visible),true).find(candidate=>!sectionEnabled.value||!clipPlane||clipPlane.distanceToPoint(candidate.point)>=0)
  if(!hit)return
  if(!expanded.value||parts.every(p=>p.name==='chassis'||restoredParts.value.has(p.name))){expandAll();return}
  let part=hit.object;while(part&&part.parent!==model)part=part.parent
  if(part)inspect(part.name)
}
function cancelPointer(){pointerStart=null}
onMounted(()=>{try{
  reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false
  scene=new THREE.Scene();scene.background=null
  scene.add(new THREE.HemisphereLight(0xffffff,0x8796a3,2.3))
  const key=new THREE.DirectionalLight(0xfffcf7,3.2);key.position.set(2,4,3);scene.add(key)
  const fill=new THREE.DirectionalLight(0xb9d4e8,1.6);fill.position.set(-2,2,-3);scene.add(fill)
  const built=buildVehicleModel({variant:props.variant,family:props.family});model=built.root;parts=built.parts;scene.add(model);highlighter=createPartHighlighter(parts)

  partInfo.value=parts.map(part=>({id:part.name,label:part.userData.label,description:props.family==='latent'?latentDescriptions[part.name]||part.userData.description:part.userData.description}))
  const bounds=new THREE.Box3().setFromObject(model),radius=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)*.85
  const clipBounds=bounds.clone()
  for(const part of parts){const box=new THREE.Box3().setFromObject(part);if(part.name!=='chassis')box.translate(new THREE.Vector3(...presentationOffset(part)));clipBounds.union(box)}
  clipMin=clipBounds.min.x-.05;clipMax=clipBounds.max.x+.05;clipPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),0)
  // A soft contact shadow grounds the vehicle without a solid circular plate.
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(radius*3.3,radius*2.5),new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vUv; void main(){float d=length((vUv-.5)*2.0);float a=exp(-d*d*6.0)*.23*(1.0-smoothstep(.72,1.0,d));gl_FragColor=vec4(.15,.23,.29,a);}' }));shadow.rotation.x=-Math.PI/2;shadow.position.set(bounds.getCenter(new THREE.Vector3()).x,bounds.min.y-.014,0);scene.add(shadow)
  const grid=new THREE.GridHelper(radius*4,32,0x9bb0c2,0xb1c3d2);grid.position.y=bounds.min.y-.016;grid.material.transparent=true;grid.material.opacity=.15;grid.material.depthWrite=false;scene.add(grid)
  camera=new THREE.PerspectiveCamera(42,1,.02,40)
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.localClippingEnabled=true;renderer.domElement.setAttribute('aria-label','可旋转、剖切并展开的AGV三维模型');host.value.appendChild(renderer.domElement)
  installCameraControls()
  initializeView();applySection()
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host.value)
  intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;if(visible){needsRender=true;lastTime=0;start()}else{cancelAnimationFrame(raf);raf=0;lastTime=0}});intersection.observe(host.value)
  document.addEventListener('visibilitychange',visibility);renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',cancelPointer);resize();start()
}catch{
  failure.value='当前设备暂时无法展示3D，请使用支持WebGL的浏览器。'
  if(raf)cancelAnimationFrame(raf);raf=0
}})
onBeforeUnmount(()=>{
  disposed=true;cancelAnimationFrame(raf);resizeObserver?.disconnect();intersection?.disconnect();document.removeEventListener('visibilitychange',visibility)
  if(renderer){renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointercancel',cancelPointer)}
  controls?.removeEventListener('change',requestRender);controls?.removeEventListener('start',beginOrbit);controls?.dispose();highlighter?.dispose()
  const geometries=new Set(),materials=new Set()
  scene?.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m))})
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove()
})
</script>
<style scoped src="./AgvModelViewer.css"></style>


<style src="./ModelFullscreen.css"></style>

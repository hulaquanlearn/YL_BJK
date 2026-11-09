<template>
  <div ref="host" class="model-preview" :class="{'object-only':objectOnly,'has-overflow':overflowParts.length>0}" :style="{height}" :aria-busy="loading">
    <div ref="surface" class="model-surface" />
    <span v-if="!objectOnly && title && modelUrl" class="model-caption">{{ title }}</span>
    <div v-if="loading || error || !modelUrl || needsReview" class="preview-message" :class="{'is-error':error}" role="status">
      <span>{{ loading ? '正在加载模型…' : error || (needsReview ? '已绑定模型，外形待核对' : '尚未绑定模型') }}</span><button v-if="error && rendererReady" type="button" @click="loadModel">重试</button>
    </div>
    <template v-if="ready && !objectOnly">
      <svg v-if="labelsVisible" class="model-callouts" :viewBox="`0 0 ${viewWidth} ${viewHeight}`" aria-hidden="true"><g v-for="label in callouts" :key="label.id" :class="{selected:selected===label.id}"><path :d="label.path"/><circle :cx="label.anchorX" :cy="label.anchorY" r="3"/></g></svg>
      <template v-if="labelsVisible"><button v-for="label in callouts" :key="label.id" type="button" class="model-label" :class="{selected:selected===label.id}" :style="{left:`${label.x}px`,top:`${label.y}px`}" :aria-pressed="selected===label.id" @click="selectPart(label.id)">{{ label.name }}</button></template>
      <el-dropdown v-if="labelsVisible && overflowParts.length" class="annotation-overflow" trigger="click" @command="selectPart"><button type="button" aria-label="更多模型标注">更多标注 <el-icon><ArrowDown /></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="part in overflowParts" :key="part.id" :command="part.id">{{ part.name }}</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      <span class="preview-gesture">拖动旋转 · 双指 / 滚轮缩放</span>
      <span class="selection-status" role="status">{{ selectionText }}</span>
      <div v-if="showObservationDetails && selectedPart" class="observation-description"><strong>{{ selectedPart.name }}</strong><p>{{ selectedPart.description }}</p></div>
    </template>
  </div>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch,shallowRef} from 'vue'
import * as THREE from 'three'
import {modelSurfaceAnchor} from '../utils/model-surface-anchor.mjs'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js'
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js'
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js'
import {createShowroom,createShowroomBackground,showroomPalette} from '../utils/showroom-stage.mjs'
import {modelObservationParts,normalizeShowroomModel,modelReview} from '../utils/model-observation.mjs'
import {layoutModelCallouts} from '../utils/model-callout-layout.mjs'
import {modelMeshInventory} from '../utils/model-mesh-inventory.mjs'
const props=defineProps({modelUrl:{type:String,default:''},title:{type:String,default:''},frontRotationY:{type:Number,default:0},initialAngle:{type:Number,default:0},height:{type:String,default:'380px'},showObservationDetails:{type:Boolean,default:true},objectOnly:Boolean,allowUnreviewed:Boolean,inspectMeshes:Boolean,selectedMeshId:{type:String,default:''}})
const needsReview=computed(()=>{const review=modelReview(props.modelUrl);return !props.allowUnreviewed && (review?.status==='reference' || Boolean(review?.requiresReview))})
const emit=defineEmits(['observe','mesh-inventory'])
const host=ref(null),surface=ref(null),loading=ref(false),error=ref(''),rendererReady=ref(false),ready=ref(false)
const parts=shallowRef([]),selected=ref(''),callouts=ref([]),overflowParts=ref([]),labelsVisible=ref(true),viewWidth=ref(1),viewHeight=ref(1)
const selectionText=computed(()=>selected.value?`已选中 · ${parts.value.find(p=>p.id===selected.value)?.name||'整体外观'}`:'')
const wholeObservation={id:'whole',name:'整体外观',description:'拖动旋转查看外观；选择已标注部位可查看结构说明。此模型为外观示意，尺寸以厂家资料为准。'}
const selectedPart=computed(()=>parts.value.find(p=>p.id===selected.value))
watch([selected,parts],()=>{const part=selectedPart.value;emit('observe',part?{id:part.id,name:part.name,description:part.description}:wholeObservation)})
const loader=new GLTFLoader(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()

let scene,camera,renderer,controls,resizeObserver,animationFrame=0,currentModel,modelRoot,composer,outline,environmentTarget,backgroundTexture,stage,loadToken=0,meshes=[],pointerStart,destroyed=false
function disposeObject(object){
  const geometries=new Set(),materials=new Set(),textures=new Set()
  object?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value)}})
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())
}
function clearModel(){
  ready.value=false;selected.value='';parts.value=[];callouts.value=[];overflowParts.value=[];meshes=[]
  emit('mesh-inventory',[])
  if(outline)outline.selectedObjects=[]
  if(currentModel){scene?.remove(currentModel);disposeObject(currentModel)}
  currentModel=null;modelRoot=null;requestRender()
}
function resetView(){
  if(!camera||!controls)return
  const angle=Number(props.initialAngle)||0
  const distance=props.objectOnly?6.4:8.8
  const center=currentModel?new THREE.Box3().setFromObject(currentModel).getCenter(new THREE.Vector3()).y:0
  camera.position.set(Math.sin(angle)*distance,props.objectOnly?1.7:2.7,Math.cos(angle)*distance);controls.target.set(0,props.objectOnly?.15:Math.min(-.65,center+.25),0);controls.update();requestRender()
}
function resize(){
  if(!surface.value||!renderer||!camera)return
  const width=Math.max(surface.value.clientWidth,1),height=Math.max(surface.value.clientHeight,1)
  viewWidth.value=width;viewHeight.value=height;renderer.setSize(width,height,false);composer?.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();requestRender()
}
async function loadModel(){
  const token=++loadToken;clearModel();error.value=''
  if(!props.modelUrl||needsReview.value||!rendererReady.value||destroyed){loading.value=false;return}
  loading.value=true;let loaded
  try{
    loaded=(await loader.loadAsync(new URL(props.modelUrl,window.location.origin).href)).scene
    if(token!==loadToken||destroyed){disposeObject(loaded);return}
    currentModel=normalizeShowroomModel(THREE,loaded,props.frontRotationY,props.objectOnly?null:-2.60);modelRoot=loaded
    currentModel.traverse(node=>{if(node.isMesh){node.castShadow=true;meshes.push(node)}})
    updateInspectionParts();scene.add(currentModel);ready.value=true;resetView();selectMesh(props.selectedMeshId)
  }catch(cause){
    if(token!==loadToken||destroyed)return
    if(loaded&&!currentModel)disposeObject(loaded)
    clearModel();error.value='模型加载失败，请检查文件或重新尝试';console.warn('模型查看失败',cause?.message)
  }finally{if(token===loadToken)loading.value=false;requestRender()}
}
function selectPart(id){
  selected.value=selected.value===id?'':id
  const part=parts.value.find(p=>p.id===selected.value)
  outline.selectedObjects=selected.value?part?.objects||meshes:[];requestRender()
}
function updateInspectionParts(){
  const inventory=modelMeshInventory(meshes)
  emit('mesh-inventory',inventory)
  parts.value=props.inspectMeshes?inventory.map((entry,index)=>({...entry,description:`文件中的原始网格，尚未核定实际部件名称；${entry.vertexCount}个顶点、${entry.triangleCount}个三角面。`,objects:[meshes[index]]})):modelObservationParts(props.modelUrl,meshes)

}
function selectMesh(id){
  if(!props.inspectMeshes||!outline)return
  const part=parts.value.find(part=>part.id===id)
  selected.value=part?.id||'';outline.selectedObjects=part?.objects||[];requestRender()
}
watch(()=>props.selectedMeshId,selectMesh)
watch(()=>props.inspectMeshes,()=>{if(currentModel){updateInspectionParts();selectMesh(props.selectedMeshId);requestRender()}})
function updateCallouts(){
  if(!currentModel||!labelsVisible.value){callouts.value=[];overflowParts.value=[];return}
  currentModel.updateMatrixWorld(true);camera.updateMatrixWorld(true)
  const width=viewWidth.value,height=viewHeight.value,whole={id:'whole',name:'整体外观',objects:meshes},inspected=parts.value.find(part=>part.id===selected.value)
  const definitions=props.inspectMeshes?(inspected?[inspected]:[whole]):parts.value.length?parts.value:[whole]
  const box=new THREE.Box3().setFromObject(currentModel),center=new THREE.Vector3(),ndc=new THREE.Vector3()
  box.getCenter(center);ndc.copy(center).project(camera)
  const modelBounds={left:Infinity,right:-Infinity,centerX:(ndc.x+1)*width/2}
  for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){ndc.set(x,y,z).project(camera);if(Number.isFinite(ndc.x)){const projectedX=(ndc.x+1)*width/2;modelBounds.left=Math.min(modelBounds.left,projectedX);modelBounds.right=Math.max(modelBounds.right,projectedX)}}
  const anchors=definitions.map(part=>{
    const point=modelSurfaceAnchor(part.objects,camera);if(!point)return null
    ndc.copy(point).project(camera)
    const anchorX=(ndc.x+1)*width/2,anchorY=(1-ndc.y)*height/2
    if(anchorX<3||anchorX>width-3||anchorY<3||anchorY>height-3)return null
    const best={id:part.id,name:part.name,anchorX,anchorY}
    return best
  }).filter(Boolean)
  const bounds=host.value?.getBoundingClientRect(),coarse=window.matchMedia('(pointer: coarse)').matches
  const relative=selector=>{const node=host.value?.querySelector(selector);if(!node||!bounds)return null;const rect=node.getBoundingClientRect();return rect.width&&rect.height?{top:rect.top-bounds.top,bottom:rect.bottom-bounds.top}:null}
  let top=44,bottom=height-42
  for(const selector of['.model-caption','.observation-description']){const rect=relative(selector);if(rect)top=Math.max(top,rect.bottom+10)}
  for(const selector of['.preview-gesture','.selection-status']){const rect=relative(selector);if(rect)bottom=Math.min(bottom,rect.top-10)}
  const existingLabels=[...(host.value?.querySelectorAll('.model-label')||[])],estimatedHeight=Math.max(coarse?42:34,...definitions.map(part=>Math.ceil([...part.name].reduce((length,char)=>length+(/[\x00-\xff]/.test(char)?6.5:12),0)/62)*18+10))
  const labelHeight=Math.max(estimatedHeight,...existingLabels.map(node=>node.getBoundingClientRect().height)),options={anchors,width,height,modelBounds,top,bottom,labelHeight,padding:width<430?10:14,selectedId:selected.value}
  let layout=layoutModelCallouts(options)
  const hidden=()=>definitions.filter(part=>!layout.labels.some(label=>label.id===part.id))
  if(hidden().length)layout=layoutModelCallouts({...options,top:Math.max(top,64)})
  callouts.value=layout.labels;overflowParts.value=hidden()
}
function render(){animationFrame=0;if(destroyed||document.hidden||!composer||!controls)return;controls.update();updateCallouts();composer.render()}
function requestRender(){if(!animationFrame&&composer&&controls&&!destroyed&&!document.hidden)animationFrame=requestAnimationFrame(render)}
function onPointerDown(event){pointerStart=[event.clientX,event.clientY]}
function onPointerUp(event){
  if(props.objectOnly)return
  if(!ready.value||!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>6)return
  pointerStart=null;const bounds=renderer.domElement.getBoundingClientRect()
  pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera)
  const hit=raycaster.intersectObjects(meshes,false)[0]
  if(hit)selectPart(parts.value.find(p=>p.objects.includes(hit.object))?.id||'whole')
  else{selected.value='';outline.selectedObjects=[];requestRender()}
}
onMounted(()=>{
  try{
    scene=new THREE.Scene()
    if(props.objectOnly)scene.background=null
    else{backgroundTexture=createShowroomBackground(THREE);scene.background=backgroundTexture;scene.fog=new THREE.FogExp2(showroomPalette.fog,.012)}
    camera=new THREE.PerspectiveCamera(36,1,.05,120);renderer=new THREE.WebGLRenderer({antialias:true,alpha:props.objectOnly})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.matchMedia('(max-width:700px)').matches?1.25:1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92
    renderer.shadowMap.enabled=!props.objectOnly;renderer.shadowMap.type=THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','可旋转缩放并点击选择的备件三维模型');surface.value.appendChild(renderer.domElement)
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer)
    environmentTarget=pmrem.fromScene(environment,.04);scene.environment=environmentTarget.texture;scene.environmentIntensity=.5;environment.dispose();pmrem.dispose()
    if(!props.objectOnly){stage=createShowroom(THREE);scene.add(stage)}
    scene.add(new THREE.HemisphereLight(0xffffff,0x4a5562,1.05))
    for(const[x,y,z,strength]of[[3,6,5,2.3],[-4,2,2,.75],[-3,3,-4,.85]]){const light=new THREE.DirectionalLight(0xffffff,strength);light.position.set(x,y,z);if(strength===2.3&&!props.objectOnly){light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:25});light.shadow.bias=-.0005}scene.add(light)}
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=props.objectOnly?4.8:6;controls.maxDistance=22;controls.maxPolarAngle=props.objectOnly?Math.PI:Math.PI*.49;controls.addEventListener('change',requestRender)
    composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));outline=new OutlinePass(new THREE.Vector2(1,1),scene,camera);outline.edgeStrength=4;outline.edgeGlow=.55;outline.edgeThickness=2;outline.visibleEdgeColor.set(showroomPalette.outline);outline.hiddenEdgeColor.set(showroomPalette.hiddenOutline);composer.addPass(outline);composer.addPass(new OutputPass())
    renderer.domElement.addEventListener('pointerdown',onPointerDown);renderer.domElement.addEventListener('pointerup',onPointerUp);document.addEventListener('visibilitychange',requestRender)
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(surface.value);rendererReady.value=true;resetView();resize();loadModel()
  }catch{error.value='此设备暂不支持三维显示，请使用支持 WebGL 的浏览器';loading.value=false}
})
watch(()=>props.modelUrl,loadModel)
watch(()=>props.allowUnreviewed,loadModel)
watch(()=>props.frontRotationY,()=>{
  if(!modelRoot||!currentModel)return
  currentModel.remove(modelRoot);scene.remove(currentModel);currentModel=normalizeShowroomModel(THREE,modelRoot,props.frontRotationY,props.objectOnly?null:-2.60);scene.add(currentModel);selected.value='';outline.selectedObjects=[];resetView()
})
onBeforeUnmount(()=>{
  destroyed=true;loadToken++;cancelAnimationFrame(animationFrame);resizeObserver?.disconnect();renderer?.domElement.removeEventListener('pointerdown',onPointerDown);renderer?.domElement.removeEventListener('pointerup',onPointerUp);document.removeEventListener('visibilitychange',requestRender)
  clearModel();controls?.dispose();disposeObject(stage);backgroundTexture?.dispose();environmentTarget?.dispose();composer?.passes.forEach(pass=>pass.dispose?.());composer?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove()
})
</script>
<style scoped>
.model-preview{position:relative;isolation:isolate;overflow:hidden;width:100%;min-height:300px;border:1px solid #ccd7e1;border-radius:14px;background:#f3f6f9;color:#2c4358}
.model-surface{position:absolute;inset:0}
.model-surface :deep(canvas){display:block;width:100%;height:100%;touch-action:none}
.model-caption{position:absolute;left:16px;top:14px;max-width:calc(100% - 40px);font-size:12px;line-height:1.5;color:#52697d;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.preview-message{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:24px;background:#f3f6f9f5;color:#52697d;font-size:13px}
.preview-message.is-error{color:#934320}
.preview-message button,.model-label{font:inherit;cursor:pointer;color:#36566f;border:1px solid #9db2c3;background:#fffffff0;border-radius:6px}
.preview-gesture{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:3px 8px;border-radius:4px;background:#ffffffdf;white-space:nowrap;font-size:11px;color:#52697d;pointer-events:none}
.model-callouts{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.model-callouts path{fill:none;stroke:#607f96;stroke-width:1;opacity:.85}
.model-callouts circle{fill:#527992;stroke:#f8fbfd;stroke-width:2}
.model-callouts .selected path{stroke:#336581;stroke-width:1.7}
.model-callouts .selected circle{fill:#336581}
.model-label{position:absolute;width:74px;min-height:34px;padding:4px 5px;line-height:1.5;text-align:center;font-size:12px}
.model-label.selected{color:#244c68;border-color:#537f9c;background:#e1edf6f5}
.selection-status{position:absolute;right:12px;bottom:42px;padding:3px 6px;border-radius:4px;background:#ffffffdf;color:#36566f;font-size:11px;pointer-events:none}
.model-label:focus-visible{outline:2px solid #336581;outline-offset:3px}
@media(pointer:coarse){
  .model-label{min-height:42px}
  .preview-gesture{bottom:14px}
  .selection-status{bottom:42px}
}
@media(max-width:430px){
  .model-caption{left:12px;top:12px}
  .selection-status{display:none}
}

</style>

<style scoped>
.observation-description{position:absolute;left:12px;right:12px;top:40px;max-width:340px;padding:10px 12px;border:1px solid #b8cbd9;border-radius:8px;background:#f7fafdf2;color:#2c5069;pointer-events:none;font-size:12px}
.observation-description p{margin:5px 0 0;font-size:11px;line-height:1.6;color:#52697d}

</style>

<style scoped>
.model-preview.object-only{min-height:140px;border:0;border-radius:10px;background:#f5f7fa}
.object-only .preview-message{background:#f5f7fa;color:#748397}
.object-only .preview-message button{color:#415e78;background:white;border-color:#bdcbd8}

.annotation-overflow{position:absolute;right:12px;top:12px;z-index:3}
.annotation-overflow button{font:inherit;font-size:12px;display:flex;align-items:center;gap:5px;min-height:34px;padding:5px 9px;color:#36566f;border:1px solid #9db2c3;background:#fffffff5;border-radius:6px;cursor:pointer}
.annotation-overflow button:focus-visible{outline:2px solid #336581;outline-offset:3px}
.has-overflow .model-caption{max-width:calc(100% - 145px)}
</style>


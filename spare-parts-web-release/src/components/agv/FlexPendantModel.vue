<template>
  <section class="flexpendant-model" aria-label="ABB原始FlexPendant三维示教器">
    <div ref="host" class="flexpendant-canvas" tabindex="0" role="application" aria-label="示教器屏幕和实体按键" @contextmenu.prevent @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pick" @pointercancel="releaseJoystick" @lostpointercapture="releaseJoystick" @keydown="keyboard" @keyup="releaseDirection" @blur="cancelJog"/>
    <button v-for="area in projected" :key="area.id" class="pendant-hotspot" :class="{active:activeKey===area.id}" :aria-label="area.label" :title="area.label" :style="{left:area.x+'px',top:area.y+'px',width:area.width+'px',height:area.height+'px',transform:'rotate('+(area.angle||0)+'rad)'}" @pointerenter="$emit('inspect',area.id)" @focus="$emit('inspect',area.id)" @click="activate(area.id)"/>
    <div v-if="joystickOpen" class="joystick-direction-pad" :style="{left:joystickPanel.x+'px',top:joystickPanel.y+'px'}" aria-label="摇杆蓝色方向键"><button v-for="direction in joystickDirections" :key="direction.id" :aria-label="'摇杆方向：'+direction.label" :title="step?.enableState===1?direction.label:'请先点击上方使能'" @pointerdown="pressDirection(direction,$event)" @pointerup="releaseDirection" @pointercancel="releaseDirection" @lostpointercapture="releaseDirection" @keydown.space.prevent="pressDirection(direction,$event)" @keydown.enter.prevent="pressDirection(direction,$event)" @keyup.space.prevent="releaseDirection" @keyup.enter.prevent="releaseDirection" @blur="releaseDirection">{{direction.arrow}}</button><span v-if="step?.enableState!==1" class="joystick-enable-hint">请先使能</span></div>
    <div v-if="loading || failure" class="flexpendant-status" :role="failure?'alert':'status'"><span>{{failure || loadingProgress}}</span><canvas v-if="loading" ref="loadingCanvas" width="645" height="483" aria-label="加载期间可操作的示教器屏幕" @click="expandedPick"/></div>
    <div class="flexpendant-view-tools"><span>ABB 3HAC031711-002</span><div><button @click="openScreen">放大屏幕</button><button class="pendant-enable-toggle" :class="{enabled:step?.enableState===1}" :aria-pressed="step?.enableState===1" :disabled="step?.emergency" @click="$emit('control','enable')">使能</button><button v-if="step?.emergency" @click="$emit('control','reset-emergency')">复位急停</button><button title="将示教器转回正面并完整显示，不改变机器人或程序" @click="resetView">恢复正面视图</button></div></div>
    <Teleport to="body"><div v-if="screenExpanded" class="pendant-screen-overlay" @keydown.esc.stop="screenExpanded=false"><section role="dialog" aria-modal="true" aria-label="放大的示教器屏幕"><canvas ref="expandedCanvas" width="1290" height="966" tabindex="0" aria-label="放大的可操作示教器屏幕" @click="expandedPick" @keydown="keyboard"/></section></div></Teleport>
  </section>
</template>
<script setup>
import {ref,watch,nextTick,onMounted,onBeforeUnmount} from 'vue'
import * as THREE from 'three'
import {loadAbbModel,modelLoadingText} from '../../utils/abb-model-loader.mjs'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {pendantKeys,pendantKeyAt,pendantSurfacePoint} from '../../utils/abb-pendant-controls.mjs'
import {drawPendantScreen} from '../../utils/abb-pendant-screen.mjs'
import {createPendantEnableKey} from '../../utils/abb-pendant-enable.mjs'
const props=defineProps({title:String,step:Object,stepNumber:Number,total:Number,complete:Boolean,status:String})
const emit=defineEmits(['action','hardware','restart','jog','control','inspect'])
const host=ref(),loading=ref(true),loadingProgress=ref('正在连接示教器…'),loadingCanvas=ref(),failure=ref(''),projected=ref([]),activeKey=ref('')
const screenExpanded=ref(false),expandedCanvas=ref();let joystickGesture=null,lastJoystickTime=0,heldDirection=null
const joystickOpen=ref(false),joystickPanel=ref({x:0,y:0}),joystickDirections=[{id:'nw',arrow:'↖',label:'左上',vector:[-1,1,0]},{id:'n',arrow:'↑',label:'上',vector:[0,1,0]},{id:'ne',arrow:'↗',label:'右上',vector:[1,1,0]},{id:'w',arrow:'←',label:'左',vector:[-1,0,0]},{id:'stop',arrow:'●',label:'回中停止'},{id:'e',arrow:'→',label:'右',vector:[1,0,0]},{id:'sw',arrow:'↙',label:'左下',vector:[-1,-1,0]},{id:'s',arrow:'↓',label:'下',vector:[0,-1,0]},{id:'se',arrow:'↘',label:'右下',vector:[1,-1,0]}]
function openJoystick(){releaseDirection();screenExpanded.value=false;joystickOpen.value=!joystickOpen.value;projectAnchors()}
function joystickDirection(direction){if(direction.vector)emit('jog',{directions:direction.vector,remote:true});else emit('control','stop')}
function pressDirection(direction,event){if(event.repeat)return;releaseDirection();if(event.pointerId!==undefined)event.currentTarget.setPointerCapture(event.pointerId);heldDirection={direction,start:performance.now(),last:performance.now()};joystickDirection(direction)}
function releaseDirection(){if(!heldDirection)return;const moving=!!heldDirection.direction.vector;heldDirection=null;if(moving)emit('control','jog-release')}
function cancelJog(){releaseDirection();releaseJoystick()}
defineExpose({openJoystick})
let anchors=[],lastProjection=0,needsRender=true
let renderer,scene,camera,controls,root,observer,animation=0,disposed=false,start,screenTexture,screenCanvas,screenMesh,enableKey
const request=new AbortController(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),meshes=[],hitAreas=[]
function drawScreen(){
 needsRender=true;if(!screenCanvas)return
 hitAreas.splice(0,hitAreas.length,...drawPendantScreen(screenCanvas,{title:props.title,step:props.step,status:props.status}))
 enableKey?.setEnabled(props.step?.enableState===1)
 if(screenTexture)screenTexture.needsUpdate=true;loadingCanvas.value?.getContext('2d').drawImage(screenCanvas,0,0,645,483);syncExpandedScreen();buildAnchors()
}
function syncExpandedScreen(){if(expandedCanvas.value&&screenCanvas)expandedCanvas.value.getContext('2d').drawImage(screenCanvas,0,0,1290,966)}
async function openScreen(){screenExpanded.value=true;await nextTick();syncExpandedScreen();expandedCanvas.value?.focus()}
function expandedPick(event){const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)*645/rect.width,y=(event.clientY-rect.top)*483/rect.height,area=hitAreas.find(a=>x>=a.left&&x<=a.right&&y>=a.top&&y<=a.bottom);if(area)activate('screen:'+area.id)}
function buildAnchors(){
 if(!root)return;root.updateMatrixWorld(true);anchors=[]
 const panel=meshes.find(m=>m.userData.cadMaterial===6)
 for(const key of pendantKeys){const u=key.x/150,v=1-key.y/419,p=pendantSurfacePoint(panel,u,v),edges=[[u-key.r/150,v],[u+key.r/150,v],[u,v-key.r/419],[u,v+key.r/419]].map(([x,y])=>pendantSurfacePoint(panel,x,y));if(p)anchors.push({id:key.id,label:key.label,p,radius:.006,edges:edges.every(Boolean)?edges:null})}
 for(const area of hitAreas){const p=pendantSurfacePoint(screenMesh,(area.left+area.right)/1290,(area.top+area.bottom)/966);if(p)anchors.push({id:'screen:'+area.id,label:'屏幕：'+area.label,p,radius:.005})}
 anchors.push({id:'emergency',label:'急停按钮',p:new THREE.Vector3(.104,.088,.014),radius:.009})
 projectAnchors()
}
function projectAnchors(){
 if(!camera||!host.value)return
 const rect=host.value.getBoundingClientRect(),front=camera.position.z>0
 const stick=new THREE.Vector3(.124,0,.047).project(camera);joystickPanel.value={x:Math.max(8,Math.min(rect.width-88,(stick.x*.5+.5)*rect.width-42)),y:Math.max(44,Math.min(rect.height-88,(-.5*stick.y+.5)*rect.height-42))}
 projected.value=front?anchors.map(a=>{const p=a.p.clone().project(camera),edge=a.p.clone().add(new THREE.Vector3(a.radius,0,0)).project(camera),size=Math.max(12,Math.abs(edge.x-p.x)*rect.width);let width=size,height=size,angle=0;if(a.edges){const e=a.edges.map(q=>q.clone().project(camera)),dx=(e[1].x-e[0].x)*rect.width/2,dy=-(e[1].y-e[0].y)*rect.height/2;width=Math.hypot(dx,dy);height=Math.hypot((e[3].x-e[2].x)*rect.width/2,(e[3].y-e[2].y)*rect.height/2);angle=Math.atan2(dy,dx)}return {...a,x:(p.x*.5+.5)*rect.width-width/2,y:(-.5*p.y+.5)*rect.height-height/2,width,height,angle}}):[]
}
function activate(id){releaseDirection();activeKey.value=id;if(id!=='screen:remote')joystickOpen.value=false;if(id==='screen:close'&&screenExpanded.value)screenExpanded.value=false;else if(id.startsWith('screen:'))emit('action',id.slice(7));else if(id==='jog-positive'||id==='jog-negative')emit('jog',id==='jog-positive'?1:-1);else if(id==='emergency'){emit('control','emergency');emit('hardware',id)}else emit('control',id)}
function keyboard(event){const vector={ArrowUp:[0,1,0],ArrowDown:[0,-1,0],ArrowLeft:[-1,0,0],ArrowRight:[1,0,0],PageUp:[0,0,1],PageDown:[0,0,-1]}[event.key];if(!vector)return;event.preventDefault();pressDirection({vector},event)}

watch(()=>[props.title,props.step,props.stepNumber,props.complete,props.status],drawScreen)
function resetView(){if(!root||!camera)return;const damping=controls.enableDamping;controls.enableDamping=false;controls.update();const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const distance=Math.max(size.y,size.x/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2))*1.22+size.z/2;camera.up.set(0,1,0);camera.position.copy(center).add(new THREE.Vector3(0,0,distance));controls.target.copy(center);controls.update();controls.enableDamping=damping;needsRender=true;projectAnchors()}
function resize(){needsRender=true;if(!renderer||!host.value)return;const rect=host.value.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();resetView()}
function hitAt(event){const rect=host.value.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(meshes)[0]}
function pointerDown(event){if(event.button!==0){start=null;return}start={x:event.clientX,y:event.clientY};const hit=hitAt(event);if(hit?.object.userData.cadMaterial!==1)joystickOpen.value=false;if(hit?.object.userData.cadMaterial===1&&root.worldToLocal(hit.point.clone()).z>0){joystickGesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0};controls.enabled=false;host.value.setPointerCapture(event.pointerId)}}
function pointerMove(event){if(joystickGesture){joystickGesture.dx=event.clientX-joystickGesture.x;joystickGesture.dy=event.clientY-joystickGesture.y}}
function releaseJoystick(){if(joystickGesture&&host.value?.hasPointerCapture(joystickGesture.pointerId))host.value.releasePointerCapture(joystickGesture.pointerId);const moved=joystickGesture&&Math.hypot(joystickGesture.dx,joystickGesture.dy)>4;joystickGesture=null;if(moved)emit('control','jog-release');if(controls)controls.enabled=true}
function updateJoystick(time){if(!joystickGesture||time-lastJoystickTime<120)return;const {dx,dy}=joystickGesture;if(Math.hypot(dx,dy)<4)return;lastJoystickTime=time;emit('jog',{channel:Math.abs(dx)>Math.abs(dy)?0:1,direction:Math.abs(dx)>Math.abs(dy)?Math.sign(dx):-Math.sign(dy)})}
function repeatDirection(time){if(!heldDirection||!heldDirection.direction.vector)return;if(time-heldDirection.start<(props.step?.incrementEnabled?1000:150)||time-heldDirection.last<100)return;heldDirection.last=time;joystickDirection(heldDirection.direction)}
function pick(event){
  if(event.button!==0)return
  if(joystickGesture){const moved=Math.hypot(joystickGesture.dx,joystickGesture.dy)>4;releaseJoystick();if(moved){start=null;return}}
  if(!root||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return
  start=null;const rect=host.value.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera)
  const hit=raycaster.intersectObjects(meshes)[0];if(!hit)return
  if(hit.object.userData.hardware==='enable'){activate('enable');return}
  if(hit.object===screenMesh&&hit.uv){const x=hit.uv.x*645,y=hit.uv.y*483,area=hitAreas.find(a=>x>=a.left&&x<=a.right&&y>=a.top&&y<=a.bottom);if(area)activate('screen:'+area.id);return}
  const materialId=hit.object.userData.cadMaterial
  if(materialId===5||materialId===0){activate('emergency');return}
  if(materialId===6&&hit.uv){if(hit.face.normal.z<.8)return;const id=pendantKeyAt(hit.uv.x,hit.uv.y);if(id)activate(id);return}
  if(materialId===1){const point=root.worldToLocal(hit.point.clone());if(point.z<0)activate('enable');else openJoystick();return}
  emit('hardware','enable')
}
function disposeRoot(object){const materials=new Set(),textures=new Set();object?.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)});for(const m of materials){if(m.map)textures.add(m.map);m.dispose()}for(const texture of textures)texture.dispose()}
onMounted(async()=>{
  window.addEventListener('blur',cancelJog)
  window.addEventListener('keyup',releaseDirection)
  screenCanvas=document.createElement('canvas');screenCanvas.width=645;screenCanvas.height=483;drawScreen()
  try{
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.001,10);renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;host.value.appendChild(renderer.domElement)
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enableZoom=true;controls.enablePan=true;controls.screenSpacePanning=true;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};controls.minDistance=.15;controls.maxDistance=1.8;scene.add(new THREE.HemisphereLight(0xffffff,0x718799,2.5));const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(-1,2,3);scene.add(key)
    observer=new ResizeObserver(resize);observer.observe(host.value);resize()
    const animate=(time=0)=>{if(disposed)return;animation=requestAnimationFrame(animate);if(document.hidden){cancelJog();return}updateJoystick(time);repeatDirection(time);const changed=controls.update();if(needsRender||changed){projectAnchors();lastProjection=time;renderer.render(scene,camera);needsRender=false}};animate()
    const loadedRoot=await loadAbbModel('/models/abb-irb6700/flexpendant.glb',{signal:request.signal,onProgress:progress=>loadingProgress.value=modelLoadingText(progress,'示教器')})
    if(disposed){disposeRoot(loadedRoot);return}root=loadedRoot;root.traverse(mesh=>{if(!mesh.isMesh)return;meshes.push(mesh);if(mesh.material.name==='CAD-material-7')screenMesh=mesh});if(!screenMesh)throw Error('示教器屏幕缺失')
    enableKey=createPendantEnableKey(root);meshes.push(enableKey.key)
    screenTexture=new THREE.CanvasTexture(screenCanvas);screenTexture.colorSpace=THREE.SRGBColorSpace;screenTexture.flipY=false;const oldMaterial=screenMesh.material;screenMesh.material=new THREE.MeshBasicMaterial({map:screenTexture,side:THREE.DoubleSide});oldMaterial.dispose();drawScreen();scene.add(root);resize();loading.value=false
  }catch(error){if(!disposed&&error.name!=='AbortError'){loading.value=false;failure.value='示教器模型加载失败，请关闭弹窗后重试。'}}
})
onBeforeUnmount(()=>{cancelJog();window.removeEventListener('blur',cancelJog);window.removeEventListener('keyup',releaseDirection);disposed=true;request.abort();cancelAnimationFrame(animation);observer?.disconnect();controls?.dispose();disposeRoot(scene);screenTexture?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove()})
</script>
<style scoped>
.flexpendant-model{position:relative;min-width:0;border:1px solid #d6e3ec;border-radius:16px;background:radial-gradient(ellipse,#fff,#e0eaf2);overflow:hidden}.flexpendant-canvas{height:430px;width:100%;position:relative;touch-action:none}.flexpendant-canvas :deep(canvas){width:100%;height:100%;display:block;touch-action:none}.flexpendant-view-tools{position:absolute;top:9px;left:12px;pointer-events:none;font-size:10px;color:#8a9eac}.flexpendant-status{position:absolute;inset:0;background:#edf4f9e8;display:grid;place-items:center;z-index:3;font-size:13px;padding:20px;text-align:center}.flexpendant-model .pendant-hotspot{position:absolute;min-height:0!important;padding:0!important;border:0!important;border-radius:50%;background:transparent!important;cursor:pointer;z-index:2}.pendant-hotspot:hover,.pendant-hotspot:focus-visible{outline:2px solid #31a6c7;outline-offset:2px;box-shadow:0 0 10px #31a6c744}.flexpendant-canvas:focus-visible{outline:2px solid #31a6c7;outline-offset:-3px}
@media(max-width:700px){.flexpendant-canvas{height:340px}}
.flexpendant-view-tools{z-index:4;right:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}.flexpendant-view-tools>div{pointer-events:auto;display:flex;gap:4px}.flexpendant-view-tools button{min-height:28px!important;font-size:11px!important;padding:0 7px!important}.pendant-screen-overlay{position:fixed;inset:0;z-index:4000;background:#132a40b3;display:grid;place-items:center;padding:16px}.pendant-screen-overlay section{width:min(94vw,1000px,calc(133.54dvh - 127px));background:white;border-radius:10px;overflow:hidden;box-shadow:0 16px 60px #0005}.pendant-screen-overlay canvas{display:block;width:100%;height:auto;aspect-ratio:645/483;background:#fff}
.flexpendant-view-tools .pendant-enable-toggle.enabled{background:#35ac63!important;color:#fff!important;border-color:#228647!important;font-weight:600}.flexpendant-view-tools{flex-wrap:wrap}.flexpendant-view-tools>div{flex-wrap:wrap;justify-content:flex-end}
.joystick-direction-pad{position:absolute;z-index:6;display:grid;grid-template-columns:repeat(3,28px);gap:0;pointer-events:none}.joystick-direction-pad>button{pointer-events:auto;width:28px;height:28px;min-height:0!important;padding:0!important;background:transparent!important;border:0!important;color:#158fe5!important;text-shadow:0 0 2px #fff;font-size:28px!important;line-height:1!important;cursor:pointer;border-radius:50%}.joystick-direction-pad>button:active{background:#138bd9!important;color:white!important}
.joystick-enable-hint{position:absolute;top:88px;left:0;white-space:nowrap;font-size:11px;color:#a76a1b;background:#fff9e8;border-radius:4px;padding:2px 5px;pointer-events:none}
.flexpendant-status{display:flex;flex-direction:column;justify-content:center;gap:10px;padding-top:54px}.flexpendant-status canvas{display:block;width:min(100%,430px);height:auto;max-height:calc(100% - 45px);object-fit:contain;cursor:pointer}
</style>


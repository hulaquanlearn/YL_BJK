<template>
  <section class="panel park-model">
    <div class="park-model-tools"><span>{{ selectedName || '酿造智能园' }}</span><div><el-button @click="toggleView">{{ viewMode==='3d'?'俯视视角':'立体视角' }}</el-button><el-button @click="resetView">复位</el-button></div></div>
    <div v-if="selectedRooms.length" class="park-room-list"><span>房间</span><el-button v-for="room in selectedRooms" :key="room.id" @click="toggleGround">{{ groundVisible?'返回厂房外观':`${room.name} · ${room.floor}楼` }}</el-button></div>
    <div ref="stage" class="park-model-stage" aria-label="酿造智能园3D外观示意"><p v-if="error" class="park-model-error">{{ error }}</p></div>
    <p class="park-model-caption">{{ parkLayoutNote }} 拖动旋转，滚轮缩放，点击车间查看名称。</p>
  </section>
</template>
<script setup>
import { computed,onMounted,onBeforeUnmount,ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject,CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { parkBuildings,parkCorridors,parkLayoutNote,parkRiverPoints,parkRooms } from '../../utils/brewing-park-layout.mjs'
const stage=ref(null),error=ref(''),selectedName=ref(''),selectedId=ref(''),viewMode=ref('3d'),groundVisible=ref(false)
const selectedRooms=computed(()=>parkRooms.filter(room=>room.building===selectedId.value))
let renderer,labels,camera,scene,controls,observer,frame,canvas,down,raycaster,grainShell,grainGround
const selectable=[],buildingMaterials=[]
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.8})}
function box(parent,x,y,z,w,h,d,mat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh}
function beam(parent,a,b,r,mat){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),4),mat);mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());parent.add(mesh)}
function selectBuilding(id){if(id!=='grain'&&groundVisible.value)toggleGround();selectedId.value=id;selectedName.value=parkBuildings.find(b=>b.id===id)?.name||'';for(const item of buildingMaterials)item.mat.emissive.setHex(item.id===id?0x17434c:0x000000)}
function toggleGround(){groundVisible.value=!groundVisible.value;if(grainShell)grainShell.visible=!groundVisible.value;if(grainGround)grainGround.visible=groundVisible.value;if(groundVisible.value){controls.target.set(6.5,0,80);camera.position.set(31,33,113);controls.update()}else resetView()}
function build(){
  const wall=material(0xe6e8e5),roof=material(0x9daeb4),windowMat=material(0x42616d),steel=material(0x697b83),concrete=material(0xc5c9c2),green=material(0x879f80),water=material(0x6cabb9)
  box(scene,65,-.5,92,195,1,242,material(0xe9eee9))
  const grid=new THREE.GridHelper(240,24,0xcbd5cf,0xdce4de);grid.position.set(50,.02,92);scene.add(grid)
  const riverCurve=new THREE.CatmullRomCurve3(parkRiverPoints.map(([x,z])=>new THREE.Vector3(x,0,z)))
  function riverStrip(width,y,mat){const points=riverCurve.getPoints(120),positions=[],indices=[];points.forEach((p,i)=>{const tangent=riverCurve.getTangent(i/(points.length-1)),normal=new THREE.Vector3(-tangent.z,0,tangent.x).normalize().multiplyScalar(width/2);positions.push(p.x+normal.x,y,p.z+normal.z,p.x-normal.x,y,p.z-normal.z);if(i<points.length-1){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3)}});const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const stripMat=mat.clone();stripMat.side=THREE.DoubleSide;scene.add(new THREE.Mesh(geometry,stripMat))}
  riverStrip(10,.1,green);riverStrip(4,.2,water)
  for(const building of parkBuildings){
    const group=new THREE.Group();group.userData.building=building.id;scene.add(group);if(building.id==='grain')grainShell=group
    const ownedWall=wall.clone();buildingMaterials.push({id:building.id,mat:ownedWall})
    const height=building.height||10
    for(const [x,z,w,d] of building.boxes){
      const body=box(group,x+w/2,height/2,z+d/2,w,height,d,ownedWall);body.userData.building=building.id;selectable.push(body)
      box(group,x+w/2,height+.2,z+d/2,w+.5,.45,d+.5,roof)
      if(building.id==='qu'||building.id==='breaking'){const edges=new THREE.EdgesGeometry(new THREE.BoxGeometry(w+.5,.45,d+.5)),outline=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x6b818a}));outline.position.set(x+w/2,height+.2,z+d/2);group.add(outline)}
      const fieldFacade=building.facade==='upper-windows-long-sides'
      if(fieldFacade){const panels=material(0xadb3b1);for(const side of [x-.09,x+w+.09]){box(group,side,3.6,z+d/2,.16,7.2,d,panels);for(let offset=1;offset<d;offset+=5)box(group,side+(side<x?-.1:.1),3.5,z+offset,.18,7,.75,wall)}}
      for(const y of [2.5,5.5,8.5].filter(value=>value<height)){
        for(let offset=2.5;offset<w-1;offset+=fieldFacade?4.8:4){box(group,x+offset,y,z-.06,fieldFacade?3.2:1.7,fieldFacade?2:1.5,.12,windowMat);box(group,x+offset,y,z+d+.06,fieldFacade?3.2:1.7,fieldFacade?2:1.5,.12,windowMat)}
        if(!fieldFacade||y===8.5)for(let offset=2;offset<d-1;offset+=5){box(group,x-.2,y,z+offset,.12,1.5,2.4,windowMat);box(group,x+w+.2,y,z+offset,.12,1.5,2.4,windowMat)}
      }
    }
    const [x,z,w,d]=building.boxes[0],button=document.createElement('button');button.type='button';button.className='park-building-label';button.textContent=building.name;button.addEventListener('click',()=>selectBuilding(building.id))
    const label=new CSS2DObject(button);label.position.set(x+w/2,height+2,z+d/2);group.add(label)
  }
  grainGround=new THREE.Group();grainGround.visible=false;scene.add(grainGround)
  box(grainGround,6.5,.2,79.5,11,.3,13,concrete)
  for(const room of parkRooms){const[x,z,w,d]=room.box;box(grainGround,x+w/2,.4,z+d/2,w,.25,d,material(0x75aeb7));const title=document.createElement('span');title.className='park-ground-label';title.textContent='备件库（一楼）';const label=new CSS2DObject(title);label.position.set(x+w/2,1.2,z+d/2);grainGround.add(label)}
  const ports=new Map();for(const c of parkCorridors)for(const p of [c.from,c.to]){const key=p.join(',');ports.set(key,(ports.get(key)||0)+1)}
  for(const corridor of parkCorridors){
    const group=new THREE.Group();group.userData.corridor=corridor.id;scene.add(group)
    const [ax,az]=corridor.from,[bx,bz]=corridor.to,length=Math.hypot(bx-ax,bz-az),alongX=az===bz,y=7,half=1.5
    box(group,(ax+bx)/2,y,(az+bz)/2,alongX?length:3,.6,alongX?3:length,concrete)
    box(group,(ax+bx)/2,y+3,(az+bz)/2,alongX?length:3,.35,alongX?3:length,roof)
    const steps=Math.max(1,Math.ceil(length/8))
    for(let step=0;step<=steps;step++){
      const t=step/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t
      for(const side of [-1,1]){const sx=x+(alongX?0:side*half),sz=z+(alongX?side*half:0);box(group,sx,y/2,sz,.5,y,.5,concrete);beam(group,[sx,y,sz],[sx,y+3,sz],.1,steel)}
    }
    const trimStart=ports.get(corridor.from.join(','))>1?half:0,trimEnd=ports.get(corridor.to.join(','))>1?half:0,dx=(bx-ax)/length,dz=(bz-az)/length,wallLength=Math.max(.1,length-trimStart-trimEnd)
    for(const side of [-1,1]){
      const sx=ax+dx*trimStart+(alongX?0:side*half),sz=az+dz*trimStart+(alongX?side*half:0),ex=bx-dx*trimEnd+(alongX?0:side*half),ez=bz-dz*trimEnd+(alongX?side*half:0)
      if(corridor.style==='steel'){
        beam(group,[sx,y+.3,sz],[ex,y+.3,ez],.11,steel);beam(group,[sx,y+2.9,sz],[ex,y+2.9,ez],.11,steel)
        for(let step=0;step<steps;step++){const t=step/steps,u=(step+1)/steps;beam(group,[sx+(ex-sx)*t,y+.3,sz+(ez-sz)*t],[sx+(ex-sx)*u,y+2.9,sz+(ez-sz)*u],.09,steel)}
      }else{
        box(group,(sx+ex)/2,y+1.5,(sz+ez)/2,alongX?wallLength:.22,2.5,alongX?.22:wallLength,wall)
        if(corridor.style==='window')for(let step=0;step<steps;step++){const t=(step+.5)/steps;box(group,sx+(ex-sx)*t,y+1.7,sz+(ez-sz)*t,alongX?Math.min(2,length/steps*.6):.26,1.1,alongX?.26:Math.min(2,length/steps*.6),windowMat)}
      }
    }
    if(corridor.style==='steel'||corridor.style==='panel')beam(group,[ax,y+3.5,az],[bx,y+3.5,bz],.18,steel)
  }
  for(const[key,count]of ports)if(count>1){const[x,z]=key.split(',').map(Number);box(scene,x,7,z,3,.6,3,concrete);box(scene,x,10,z,3,.35,3,roof)}
  // Open ground between workshops six and five is intentionally left unbuilt.
  const labelNode=document.createElement('span');labelNode.className='park-ground-label';labelNode.textContent='空地';const groundLabel=new CSS2DObject(labelNode);groundLabel.position.set(60.8,.4,99);scene.add(groundLabel)
}
function resetView(){if(!camera||!controls)return;controls.target.set(51,0,88);camera.position.set(...(viewMode.value==='3d'?[185,190,247]:[51,290,88.01]));controls.enableRotate=viewMode.value==='3d';camera.lookAt(controls.target);controls.update()}
function toggleView(){viewMode.value=viewMode.value==='3d'?'top':'3d';resetView()}
function resize(){if(!stage.value||!renderer)return;const w=stage.value.clientWidth,h=stage.value.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h);labels.setSize(w,h)}
function pointerDown(event){down={x:event.clientX,y:event.clientY}}
function pointerUp(event){if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6)return;const bounds=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),camera);const hit=raycaster.intersectObjects(selectable)[0];if(hit)selectBuilding(hit.object.userData.building)}
onMounted(()=>{
  try{
    scene=new THREE.Scene();scene.background=new THREE.Color(0xf3f6f5);camera=new THREE.PerspectiveCamera(44,1,.1,1200);raycaster=new THREE.Raycaster()
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));canvas=renderer.domElement;canvas.setAttribute('aria-label','可旋转的园区模型');stage.value.append(canvas)
    labels=new CSS2DRenderer();labels.domElement.className='park-model-labels';stage.value.append(labels.domElement)
    scene.add(new THREE.HemisphereLight(0xffffff,0x859789,2.4));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(-50,120,40);scene.add(sun)
    build();controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=70;controls.maxDistance=490;controls.maxPolarAngle=Math.PI*.48;resetView();resize()
    observer=new ResizeObserver(resize);observer.observe(stage.value);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp)
    const animate=()=>{frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);labels.render(scene,camera)};animate()
  }catch(e){error.value='当前设备无法显示3D模型，请使用支持WebGL的浏览器。'}
})
onBeforeUnmount(()=>{cancelAnimationFrame(frame);observer?.disconnect();canvas?.removeEventListener('pointerdown',pointerDown);canvas?.removeEventListener('pointerup',pointerUp);controls?.dispose();const materials=new Set();scene?.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)});for(const m of materials)m.dispose();renderer?.dispose();renderer?.domElement.remove();labels?.domElement.remove();selectable.length=0;buildingMaterials.length=0})
</script>
<style scoped>
.park-model{padding:18px}.park-model-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}.park-model-tools>span{font-weight:600}.park-model-tools>div{display:flex;gap:8px;flex-wrap:wrap}.park-model-tools .el-button+.el-button{margin-left:0}.park-room-list{display:flex;align-items:center;gap:12px;margin:0 0 12px;color:#60717a;font-size:13px}.park-model-stage{height:600px;position:relative;overflow:hidden;border-radius:10px}.park-model-stage :deep(canvas){display:block;width:100%;height:100%;touch-action:none}.park-model-stage :deep(.park-model-labels){position:absolute;inset:0;pointer-events:none}.park-model-stage :deep(.park-building-label){pointer-events:auto;border:1px solid #c3d0d1;background:#ffffffed;color:#263e45;padding:5px 8px;border-radius:5px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}.park-model-stage :deep(.park-building-label:focus-visible){outline:3px solid #26818e}.park-model-stage :deep(.park-ground-label){font-size:12px;color:#4e6354}.park-model-caption{color:#6e7c83;font-size:12px;line-height:1.7;margin:12px 0 0}.park-model-error{padding:40px;text-align:center}@media(max-width:650px){.park-model-stage{height:480px}.park-model{padding:12px}}
</style>

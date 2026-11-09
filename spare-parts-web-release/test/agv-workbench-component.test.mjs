import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import {renderToString} from '@vue/server-renderer'
import {parse,compileScript,compileStyle} from '@vue/compiler-sfc'
import * as THREE from 'three'
import {modelSurfaceAnchor} from '../src/utils/model-surface-anchor.mjs'
import {buildVehicleModel,modelTitle} from '../src/utils/agv-model-catalog.mjs'
import * as presentation from '../src/utils/agv-presentation.mjs'
import * as workbench from '../src/utils/agv-workbench.mjs'

// Real SFC compilation, setup, render and Three geometry. Only lifecycle,
// WebGL/canvas, observers and RAF are synthetic ports; no browser or service.
const filename=new URL('../src/components/agv/AgvModelViewer.vue',import.meta.url)
const source=fs.readFileSync(filename,'utf8')
const {descriptor,errors}=parse(source,{filename:filename.pathname})
assert.deepEqual(errors,[])
const exposed='host,failure,partInfo,labels,expanded,restoredParts,selectedSystem,selectedPart,selectedInfo,selectedGroup,selectionState,systemRows,timelinePercent,drawer,toggleDrawer,collapsedGroups,hiddenParts,labelsEnabled,autoRotate,viewMode,sectionEnabled,sectionPosition,playing,explosionAmount,groupCount,groupAction,toggleGroup,togglePartVisibility,showAllParts,toggleSection,setSectionPosition,toggleLabels,toggleRotation,setView,expandAll,resetAssembly,inspect,inspectSystem,clearSelection,scrubAssembly,resize,get parts(){return parts},get model(){return model},get camera(){return camera},get controls(){return controls},get renderer(){return renderer}'
const instrumented=parse(source.replace('</script>',`defineExpose({${exposed}})\n</script>`),{filename:filename.pathname}).descriptor
const compiled=compileScript(instrumented,{id:'agv-workbench-test',inlineTemplate:true})
assert.ok(compiled.content.includes('__expose('),'test exposure must not silently stop instrumenting the real setup')
const executable=compiled.content
  .replace(/^import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?/gm,(_,names)=>`const {${names.replace(/\s+as\s+/g,':')}}=Vue;`)
  .replace(/^import .+$/gm,'').replace('export default','this.Component =')

function harness(props={family:'latent',variant:'old'},options={}){
  const mounted=[],unmounted=[],frames=new Map(),observers=[],documentEvents=new Map(),canvasEvents=new Map()
  let api,id=0,time=1000,renderCalls=0,removed=false,rendererDisposed=false,contextLost=false
  const fakeDocument={hidden:false,addEventListener:(type,fn)=>documentEvents.set(type,fn),removeEventListener:type=>documentEvents.delete(type)}
  const canvas={setAttribute(){},addEventListener:(type,fn)=>canvasEvents.set(type,fn),removeEventListener:type=>canvasEvents.delete(type),remove(){removed=true},getBoundingClientRect:()=>({left:0,top:0,width:900,height:600})}
  class Renderer{
    constructor(){if(options.failWebgl)throw new Error('synthetic WebGL unavailable');this.domElement=canvas}
    setClearColor(){} setPixelRatio(){} setSize(width,height){this.size=[width,height]}
    render(scene,camera){renderCalls++;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true)}
    dispose(){rendererDisposed=true} forceContextLoss(){contextLost=true}
  }
  class Controls{
    constructor(camera){this.target=new THREE.Vector3();this.camera=camera;this.listeners=new Map();this.disposed=false;this.emitDuringUpdate=false}
    update(){this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);if(this.emitDuringUpdate){this.listeners.get('change')?.();return true}return false}
    saveState(){} reset(){} handleResize(){} clearMotion(){}
    addEventListener(type,fn){this.listeners.set(type,fn)} removeEventListener(type){this.listeners.delete(type)}
    dispose(){this.disposed=true}
  }
  class Observer{
    constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this)}
    observe(){} disconnect(){this.disconnected=true}
  }
  const context=vm.createContext({
    Vue:{...Vue,onMounted:fn=>mounted.push(fn),onBeforeUnmount:fn=>unmounted.push(fn)},
    useModelFullscreen:()=>({fullscreen:Vue.ref(false),toggle(){},close:async()=>{}}),THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls:Controls,buildVehicleModel,modelTitle,modelSurfaceAnchor,...presentation,...workbench,
    document:fakeDocument,window:{devicePixelRatio:2,matchMedia:()=>({matches:!!options.reducedMotion})},
    ResizeObserver:Observer,IntersectionObserver:Observer,
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:key=>frames.delete(key)
  })
  vm.runInContext(executable,context,{filename:filename.pathname})
  const render=context.Component.setup(props,{expose:value=>{api=value}})
  api.host.value={clientWidth:900,clientHeight:600,appendChild(){}}
  for(const mount of mounted)mount()
  function step(count=1){for(let index=0;index<count;index++){time+=50;const pending=[...frames.values()];frames.clear();for(const frame of pending)frame(time);assert.ok(frames.size<=1,'only one RAF may remain, including controls.change during frame')}}
  function cleanup(){for(const unmount of unmounted)unmount()}
  function materials(){const result=new Set();for(const part of api.parts)part.traverse(mesh=>{for(const material of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[])result.add(material)});return [...result]}
  return {s:api,frames,step,cleanup,materials,canvasEvents,documentEvents,observers,fakeDocument,html:()=>renderToString(Vue.createSSRApp({render:()=>render({},[])})),get renders(){return renderCalls},get cleaned(){return removed&&rendererDisposed&&contextLost}}
}
const positions=s=>s.parts.map(part=>[part.name,...part.position.toArray()])

for(const props of [{family:'latent',variant:'old'},{family:'latent',variant:'new'},{family:'counterweight',variant:'old'},{family:'flipping',variant:'old'}]){
  test(`${props.family}/${props.variant} compiled workbench controls and resource lifecycle`,async()=>{
    const h=harness(props),s=h.s
    try{
      assert.equal(s.failure.value,'')
      assert.ok(s.partInfo.value.length>5)
      assert.equal(s.systemRows.value.flatMap(group=>group.parts).length,s.partInfo.value.length)
      assert.equal(s.groupCount(s.systemRows.value.find(group=>group.parts.some(part=>part.id==='chassis'))),s.systemRows.value.find(group=>group.parts.some(part=>part.id==='chassis')).parts.filter(part=>part.id!=='chassis').length)
      const html=await h.html()
      for(const text of ['部件矩阵','系统与部件','拆解程度','复位'])assert.ok(html.includes(text),text)
      assert.ok(!html.includes('agv-identity'),'the unique vehicle title is supplied by the parent outside the canvas')
      assert.match(html,/class="agv-canvas"/)
      assert.ok(!html.includes('model-components')&&!html.includes('model-system-panel'),'no permanent left/right columns')
      assert.ok(!html.includes('agv-more-panel'),'view controls stay directly available')
      for(const text of ['正视','俯视','旋转','复位'])assert.ok(html.includes(text),text)
      for(const text of ['暂停','查看全车','拆解演示速度','拆解速度'])assert.ok(!html.includes(text),text+' removed')
      s.drawer.value='structure';const partsHtml=await h.html()
      assert.ok(!partsHtml.includes('matrix-search')&&partsHtml.includes('显示全部'),'part tree has no search box')
      assert.ok(partsHtml.includes('整组')&&partsHtml.includes('模型剖切'),'group actions, part tree and section coexist in one drawer')
      assert.ok(!partsHtml.includes('role="tablist"'),'the same systems are not duplicated across tabs')
      s.drawer.value=''
      h.step(2);assert.equal(h.frames.size,0,'idle model must not spin a permanent render loop')
      const movable=s.parts.find(part=>part.name!=='chassis'),id=movable.name
      const chassis=s.parts.find(part=>part.name==='chassis')
      let solidMesh;s.model.traverse(mesh=>{if(!solidMesh&&mesh.isMesh&&mesh.geometry.type==='BoxGeometry')solidMesh=mesh})
      const point=new THREE.Box3().setFromObject(solidMesh).getCenter(new THREE.Vector3()).project(s.camera)
      const primary={clientX:(point.x*.5+.5)*900,clientY:(-.5*point.y+.5)*600,pointerId:1,button:0,isPrimary:true}
      h.canvasEvents.get('pointerdown')(primary);h.canvasEvents.get('pointerdown')({...primary,pointerId:2,isPrimary:false});h.canvasEvents.get('pointerup')(primary)
      assert.equal(s.expanded.value,false,'two-finger gestures must not become a part click')
      h.canvasEvents.get('pointerdown')({...primary,button:2});h.canvasEvents.get('pointerup')({...primary,button:2})
      assert.equal(s.expanded.value,false,'right-button pan must not become a part click')
      h.canvasEvents.get('pointerdown')(primary);h.canvasEvents.get('pointercancel')();h.canvasEvents.get('pointerup')(primary)
      assert.equal(s.expanded.value,false,'cancelled pointer must not retain a stale click')
      h.canvasEvents.get('pointerdown')(primary);h.canvasEvents.get('pointerup')(primary)
      assert.equal(s.expanded.value,true,'an actual raycast on the model starts disassembly')
      s.resetAssembly();h.step(40)
      s.drawer.value='structure'
      s.toggleGroup(s.systemRows.value[0].id);assert.ok(s.collapsedGroups.value.has(s.systemRows.value[0].id))
      s.drawer.value=''

      s.expandAll();h.step(3);assert.ok(s.explosionAmount.value>0&&s.explosionAmount.value<1)
      const movingPositions=positions(s);h.step(3);assert.notDeepEqual(positions(s),movingPositions,'fixed-speed animation advances parts');h.step(40);assert.equal(s.timelinePercent.value,100);assert.equal(s.playing.value,false)
      assert.equal(chassis.position.length(),0,'chassis must not explode')

      s.scrubAssembly('35');assert.equal(s.timelinePercent.value,35);assert.equal(s.playing.value,false)
      assert.ok(movable.position.length()>0);assert.equal(chassis.position.length(),0)
      s.scrubAssembly('0');s.expandAll();h.step();assert.ok(s.explosionAmount.value>0,'fixed-speed animation starts');
      h.step(30)
      const group=s.systemRows.value.find(candidate=>s.groupCount(candidate)>0)
      s.inspectSystem(group)
      assert.equal(s.selectedGroup.value.id,group.id)
      for(const part of group.parts.filter(part=>part.id!=='chassis'))assert.ok(s.restoredParts.value.has(part.id))
      assert.equal(s.groupAction(group),'拆开')
      const restored=[...s.restoredParts.value];s.clearSelection();assert.deepEqual([...s.restoredParts.value],restored)
      h.step(40);assert.equal(h.frames.size,0)

      const before=h.renders;s.togglePartVisibility(id);assert.equal(movable.visible,false);assert.equal(s.parts.filter(p=>p.visible).length,s.partInfo.value.length-1)
      h.step();assert.ok(h.renders>before,'visibility must wake the idle renderer')
      s.togglePartVisibility('chassis');assert.equal(chassis.visible,true)
      s.inspect(id);assert.equal(movable.visible,true);assert.ok(!s.hiddenParts.value.has(id));assert.equal(s.selectedInfo.value.id,id)
      s.toggleSection();assert.equal(s.renderer.localClippingEnabled,true)
      for(const material of h.materials())assert.equal(material.clippingPlanes.length,1)
      const plane=h.materials()[0].clippingPlanes[0],oldConstant=plane.constant
      s.scrubAssembly(100);h.step();s.setSectionPosition(100)
      for(const part of s.parts)assert.ok(plane.distanceToPoint(new THREE.Box3().setFromObject(part).max)>0,'100% section includes every fully exploded part')
      s.setSectionPosition(25);assert.notEqual(plane.constant,oldConstant)
      s.inspectSystem(group)
      for(const material of h.materials())assert.equal(material.clippingPlanes[0],plane,'highlight clones retain the live section plane')
      h.step(40);s.toggleSection();h.step()
      for(const material of h.materials())assert.equal(material.clippingPlanes.length,0)

      s.toggleLabels();h.step();assert.equal(s.labels.value.length,0)
      s.toggleLabels();h.step();assert.ok(s.labels.value.length>0)
      s.setView('top');assert.ok(s.camera.position.y>s.controls.target.y)
      assert.ok(Number.isFinite(s.camera.position.length()))
      s.setView('front');assert.ok(s.camera.position.z>s.controls.target.z)
      s.controls.emitDuringUpdate=true;s.toggleRotation();h.step(5);assert.equal(h.frames.size,1)
      s.controls.emitDuringUpdate=false;s.toggleRotation();h.step(2);assert.equal(h.frames.size,0)

      s.expandAll();h.step(2);h.fakeDocument.hidden=true;h.documentEvents.get('visibilitychange')();assert.equal(h.frames.size,0)
      const hiddenPositions=positions(s);h.step(50);assert.deepEqual(positions(s),hiddenPositions)
      h.fakeDocument.hidden=false;h.documentEvents.get('visibilitychange')();assert.equal(h.frames.size,1)
      h.step(2);assert.notDeepEqual(positions(s),hiddenPositions)
      const intersection=h.observers[1];intersection.callback([{isIntersecting:false}]);assert.equal(h.frames.size,0)
      intersection.callback([{isIntersecting:true}]);assert.equal(h.frames.size,1)

      s.resetAssembly();h.step(40)
      assert.equal(s.expanded.value,false);assert.equal(s.timelinePercent.value,0);assert.equal(s.hiddenParts.value.size,0)
      assert.equal(s.sectionEnabled.value,false);assert.equal(s.autoRotate.value,false)
      assert.equal(s.selectedPart.value,'');assert.equal(s.selectedSystem.value,'')
      for(const part of s.parts){assert.equal(part.position.length(),0);assert.equal(part.visible,true)}
      assert.equal(h.frames.size,0)
      const geometries=new Set(),originalMaterials=new Set()
      s.model.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[])originalMaterials.add(material)})
      let disposedGeometry=0,disposedMaterial=0
      for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposedGeometry++)
      for(const material of originalMaterials)material.addEventListener('dispose',()=>disposedMaterial++)
      h.cleanup()
      assert.equal(disposedGeometry,geometries.size);assert.equal(disposedMaterial,originalMaterials.size)
      assert.ok(h.cleaned);assert.ok(s.controls.disposed);assert.equal(s.controls.listeners.size,0)
      assert.equal(h.frames.size,0);assert.equal(h.canvasEvents.size,0);assert.equal(h.documentEvents.size,0)
      assert.ok(h.observers.every(observer=>observer.disconnected))
    }finally{if(!h.cleaned)h.cleanup()}
  })
}

test('reduced-motion uses the real target pose and completed feedback without an animation loop',()=>{
  const h=harness({family:'latent',variant:'old'},{reducedMotion:true})
  try{h.s.expandAll();h.step();assert.equal(h.s.timelinePercent.value,100);assert.equal(h.s.playing.value,false);assert.equal(h.frames.size,0);h.s.resetAssembly();h.step();assert.equal(h.s.timelinePercent.value,0)}finally{h.cleanup()}
})

test('all four complete vehicles stay in frame after canvas height/width and view changes',async()=>{
 for(const props of [{family:'latent',variant:'old'},{family:'latent',variant:'new'},{family:'counterweight'},{family:'flipping'}]){
  const h=harness(props),s=h.s
  try{
   for(const expanded of [false,true]){
    if(expanded)s.expandAll()
    for(const [width,height] of [[1280,480],[900,760],[340,330],[1800,700],[390,844]]){
     s.host.value.clientWidth=width;s.host.value.clientHeight=height;s.resize();h.step(40)
     assert.deepEqual(s.renderer.size,[width,height])
     for(const mode of ['free','top','front']){
      if(mode==='free'){s.clearSelection()}else s.setView(mode)
      h.step(2)
      const bounds=new THREE.Box3().setFromObject(s.model)
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
       const point=new THREE.Vector3(x,y,z).project(s.camera)
       assert.ok(Math.abs(point.x)<.99&&Math.abs(point.y)<.99&&point.z>-1&&point.z<1,`${props.family}/${props.variant} ${width}x${height} ${mode}: ${point.toArray()}`)
      }
     }
    }
   }
   s.setView('top');s.setView('top');assert.equal(s.viewMode.value,'free','preset toggles back without restoring the assembly')
   assert.equal(s.expanded.value,true)
   s.setView('front');s.controls.listeners.get('start')();assert.equal(s.viewMode.value,'free','manual orbit clears a stale preset indication')
   const html=await h.html()
   assert.ok(!html.includes('>透视<'))
   assert.ok(!html.includes('model-feedback'));assert.ok(!html.includes('model-instruction'));assert.ok(!html.includes('model-view-actions'))
   assert.ok(!html.includes('stage-orientation'));assert.ok(!html.includes('stage-watermark'))
   assert.ok(!html.includes('ASSEMBLY NOTES'),'the permanent assembly-notes footer is gone; descriptions stay contextual')
  }finally{h.cleanup()}
 }
})

test('phone bottom-sheet drawer keeps the whole vehicle above the sheet',()=>{
 const h=harness({family:'latent',variant:'old'}),s=h.s
 try{
  s.host.value.clientWidth=390;s.host.value.clientHeight=844;s.resize();h.step(2)
  s.drawer.value='structure';s.resize();h.step(2)
  const bounds=new THREE.Box3().setFromObject(s.model)
  let lowest=1
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const point=new THREE.Vector3(x,y,z).project(s.camera)
   lowest=Math.min(lowest,point.y)
   assert.ok(Math.abs(point.x)<.99&&Math.abs(point.y)<.99&&point.z>-1&&point.z<1,`phone drawer clips the vehicle: ${point.toArray()}`)
  }
  assert.ok(lowest>.05,'the whole vehicle bottom stays above the drawer sheet, not behind it')
  const centre=new THREE.Box3().setFromObject(s.model).getCenter(new THREE.Vector3()).project(s.camera)
  assert.ok(centre.y>0,'the vehicle centre must stay above the bottom sheet')
  s.drawer.value='';s.resize();h.step(2)
  const full=new THREE.Box3().setFromObject(s.model).getCenter(new THREE.Vector3()).project(s.camera)
  assert.ok(Math.abs(full.y)<.35,'closing the sheet re-centres the vehicle in the full canvas')
 }finally{h.cleanup()}
})

test('WebGL construction failure retains the real matrix and exposes a readable fallback',async()=>{
  const h=harness({family:'latent',variant:'old'},{failWebgl:true})
  try{
    assert.match(h.s.failure.value,/WebGL/);assert.ok(h.s.partInfo.value.length>5);assert.equal(h.frames.size,0)
    const html=await h.html();assert.ok(html.includes('仍可在部件矩阵查看功能说明'))
    h.s.inspect(h.s.partInfo.value.find(part=>part.id!=='chassis').id)
    assert.ok(h.s.selectedInfo.value.description);assert.equal(h.frames.size,0)
    assert.equal(h.s.playing.value,false);assert.equal(h.s.expanded.value,false);assert.match(h.s.selectionState.value,/仅查看说明/)
    assert.match(html,/<fieldset[^>]*disabled/,'unavailable 3D playback controls are genuinely disabled')
  }finally{h.cleanup()}
})

test('scoped stylesheet compiles with light steel-blue tokens and responsive panel reflow',()=>{
  const style=descriptor.styles[0]
  assert.equal(style.scoped,true);assert.equal(style.src,'./AgvModelViewer.css')
  const css=fs.readFileSync(new URL('../src/components/agv/AgvModelViewer.css',import.meta.url),'utf8')
  const result=compileStyle({source:css,id:'data-v-agv-workbench-test',filename:'AgvModelViewer.css',scoped:true})
  assert.deepEqual(result.errors,[])
  assert.ok(result.code.includes('@container(max-width:1000px)'))
  assert.ok(result.code.includes('@container(max-width:720px)'))
  assert.ok(result.code.includes('prefers-reduced-motion'))
  assert.ok(result.code.includes('#f8fafc'));assert.ok(source.includes('scene.background=null')&&source.includes('alpha:true'),'the gradient remains visible behind the model')
  assert.ok(!source.includes('new THREE.Color(0x101f30)'))
  // Full-canvas layout: no permanent side columns, one on-demand drawer, one bottom bar.
  assert.ok(css.includes('.agv-stage{position:relative'))
  assert.ok(css.includes('.agv-topbar{position:relative'))
  assert.ok(css.includes('.agv-drawer{position:absolute'))
  assert.ok(css.includes('.agv-bottombar{position:absolute'))
  assert.ok(!css.includes('workbench-layout'))
  assert.ok(!css.includes('model-system-panel'))
  assert.ok(!css.includes('TorusGeometry'))
})

test('a group action on the assembled vehicle moves only that system and toggles it back',async()=>{
 for(const props of [{family:'latent',variant:'old'},{family:'latent',variant:'new'},{family:'counterweight'},{family:'flipping'}]){
  const h=harness(props),s=h.s
  try{
   const group=s.systemRows.value.find(g=>s.groupCount(g)>0),ids=new Set(group.parts.map(p=>p.id))
   assert.equal(s.groupAction(group),'拆开')
   s.inspectSystem(group);h.step(40)
   for(const p of s.parts)assert.equal(p.position.length()>0,p.name!=='chassis'&&ids.has(p.name),p.name)
   assert.equal(s.groupAction(group),'归位')
   s.inspectSystem(group);h.step(40)
   for(const p of s.parts)assert.equal(p.position.length(),0,p.name+' returns to its actual installed position')
   s.drawer.value='structure'
   const html=await h.html()
   assert.equal((html.match(/aria-label="系统与部件"/g)||[]).length,1)
   assert.ok(html.includes('模型剖切')&&html.includes('显示全部'))
  }finally{h.cleanup()}
 }
})

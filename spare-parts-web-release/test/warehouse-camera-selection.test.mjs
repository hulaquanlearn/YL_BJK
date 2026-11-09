import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
test('clicking a spare part cancels camera animation and opens details without moving the camera',()=>{
 const fn=source.slice(source.indexOf('function onStageClick('),source.indexOf('\nfunction onStagePointerCancel(')),calls=[],part={_id:'selected'}
 const s={stagePointers:new Set([1]),multiPointerGesture:false,renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:500,height:300})}},camera:{},stage:{value:{}},pointerStart:{pointerId:1,x:10,y:10,button:0},pointer:{},raycaster:{setFromCamera(){},intersectObjects:()=>[{object:{}}]},clickableMeshes:[],partModelsRoot:{},stockPartsForHit:()=>[part],selectedPart:{value:null},cameraAnimation:{pending:true},locatePart:(...args)=>calls.push(args)}
 vm.createContext(s);vm.runInContext(fn,s);s.onStageClick({pointerId:1,clientX:10,clientY:10,button:0})
 assert.equal(s.cameraAnimation,null);assert.equal(calls.length,1);assert.equal(calls[0][0],part);assert.equal(calls[0][2],true)
})
test('search-based location moves closer while preserving the current horizontal viewing direction',()=>{
 const fn=source.slice(source.indexOf('function focusPart('),source.indexOf('\nfunction setView(')),s={THREE,camera:{position:new THREE.Vector3(7,6,-5),up:new THREE.Vector3()},controls:{target:new THREE.Vector3(1,0,2)},viewMode:{value:'perspective'},getPartMarkerPlacement:()=>({x:0,y:1,z:0}),shelfLocalToWorld:(_s,v)=>v,performance:{now:()=>100},cameraAnimation:null}
 vm.createContext(s);vm.runInContext(fn,s);s.focusPart({size:{depth:1},position:{rotationY:Math.PI}},{});
 const old=s.camera.position.clone().sub(s.controls.target);old.y=0;old.normalize();const next=s.cameraAnimation.toPosition.clone().sub(s.cameraAnimation.toTarget);next.y=0;next.normalize();assert.ok(old.dot(next)>.999999)
})

function viewHarness(){
 const s={THREE,viewMode:{value:'perspective'},computed:fn=>({get value(){return fn()}}),camera:new THREE.PerspectiveCamera(43,1,.1,200),controls:{target:new THREE.Vector3(1,2,3),enableRotate:true,enableDamping:true,touches:{ONE:THREE.TOUCH.ROTATE},mouseButtons:{LEFT:THREE.MOUSE.ROTATE}},selectedShelf:{value:{position:{x:10,z:20}}},cameraAnimation:null,performance:{now:()=>100},sceneActive:true,document:{hidden:false},animationFrame:0,requestAnimationFrame:()=>1,renderer:null,labelRenderer:null,scene:{},overviewTarget:()=>new THREE.Vector3(1,2,3),overviewCameraPosition:(mode,target)=>target.clone().add(mode==='top'?new THREE.Vector3(0,30,.01):new THREE.Vector3(-30,22,-36))}
 s.camera.position.set(8,6,10);s.controls.update=()=>s.camera.lookAt(s.controls.target)
 vm.createContext(s)
 const menu=source.slice(source.indexOf('const viewMenuAction = computed('),source.indexOf('\nconst displayMode'))
 const setView=source.slice(source.indexOf('function setView('),source.indexOf('\nfunction resizeScene('))
 const reset=source.slice(source.indexOf('function resetPerspectiveView('),source.indexOf('\nfunction focusShelf('))
 const mobile=source.slice(source.indexOf('function mobileSceneCommand('),source.indexOf('\nconst selectedShelf'))
 vm.runInContext(menu+'\nthis.menuAction=()=>viewMenuAction.value;\n'+setView+'\n'+reset+'\n'+mobile,s)
 return s
}

test('view menus expose only the opposite preset and mobile switches the same real camera mode',()=>{
 const s=viewHarness()
 assert.equal(s.menuAction().command,'top');assert.equal(s.menuAction().label,'俯视视角')
 s.mobileSceneCommand(s.menuAction().command)
 assert.equal(s.viewMode.value,'top');assert.equal(s.menuAction().command,'perspective');assert.equal(s.menuAction().label,'立体视角')
 assert.equal(s.controls.enableRotate,false);assert.equal(s.controls.enableDamping,false)
 assert.equal(s.controls.touches.ONE,THREE.TOUCH.PAN);assert.equal(s.controls.mouseButtons.LEFT,THREE.MOUSE.PAN)
 const top=s.cameraAnimation.toPosition.clone();s.animate(900)
 assert.ok(s.camera.position.distanceTo(top)<1e-9)
 assert.deepEqual(s.camera.up.toArray(),[0,0,1])
 assert.ok(Math.abs(s.camera.position.x-s.controls.target.x)<1e-9)
 s.setView(s.menuAction().command)
 assert.equal(s.viewMode.value,'perspective');assert.equal(s.menuAction().command,'top')
 assert.equal(s.controls.enableRotate,true);assert.equal(s.controls.enableDamping,true)
 assert.equal(s.controls.touches.ONE,THREE.TOUCH.ROTATE);assert.equal(s.controls.mouseButtons.LEFT,THREE.MOUSE.ROTATE)
})

test('reset returns the real camera and menu to the perspective overview rather than leaving a top-view label',()=>{
 const s=viewHarness();s.setView('top');s.animate(900)
 s.mobileSceneCommand('reset')
 assert.equal(s.viewMode.value,'perspective');assert.equal(s.menuAction().label,'俯视视角')
 assert.deepEqual(s.cameraAnimation.toTarget.toArray(),[1,2,3],'reset clears shelf focus back to the whole-room target')
 s.animate(900)
 assert.deepEqual(s.camera.position.toArray(),[-29,24,-33]);assert.deepEqual(s.camera.up.toArray(),[0,1,0])
 assert.equal(s.controls.enableRotate,true)
 const before=s.cameraAnimation;s.setView('unsupported');assert.equal(s.cameraAnimation,before);assert.equal(s.viewMode.value,'perspective')
})

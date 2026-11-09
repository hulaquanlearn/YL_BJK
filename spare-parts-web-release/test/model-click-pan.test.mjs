import test from 'node:test'
import assert from 'node:assert/strict'
import {PerspectiveCamera,OrthographicCamera,Vector3} from 'three'
import {installModelClickPan} from '../src/utils/model-click-pan.mjs'

class Surface{
 listeners=new Map()
 addEventListener(type,fn){const set=this.listeners.get(type)||new Set();set.add(fn);this.listeners.set(type,set)}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn)}
 contains(target){return target===this}
 getBoundingClientRect(){return {height:500}}
 fire(type,values={}){const event={target:this,pointerType:'mouse',button:2,buttons:0,clientX:100,clientY:100,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...values};for(const fn of this.listeners.get(type)||[])fn(event);return event}
}
function fixture(camera=new PerspectiveCamera(40,2,.01,100)){
 const element=new Surface(),doc=new Surface(),win=new Surface();doc.defaultView=win;element.ownerDocument=doc
 camera.position.set(2,3,6);camera.lookAt(0,0,0);camera.updateMatrixWorld()
 let changes=0;const states=[],controls={target:new Vector3(),dispatchEvent(){changes++}}
 const pan=installModelClickPan({element,camera,controls,onChange:state=>states.push(state)})
 const click=()=>{element.fire('pointerdown');element.fire('pointerup')}
 return {element,doc,win,camera,controls,pan,states,click,get changes(){return changes}}
}
test('right click then unheld mouse motion translates camera and target equally without rotating or zooming',()=>{
 const f=fixture(),position=f.camera.position.clone(),orientation=f.camera.quaternion.clone(),distance=f.camera.position.distanceTo(f.controls.target)
 assert.equal(f.element.fire('pointerdown').stopped,true);assert.equal(f.pan.active,false)
 f.element.fire('pointerup');assert.equal(f.pan.active,true)
 f.element.fire('pointermove',{clientX:160,clientY:130})
 assert.ok(f.controls.target.length()>.1);assert.ok(f.camera.position.clone().sub(position).distanceTo(f.controls.target)<1e-10)
 assert.deepEqual(f.camera.quaternion.toArray(),orientation.toArray());assert.ok(Math.abs(f.camera.position.distanceTo(f.controls.target)-distance)<1e-10)
 assert.equal(f.changes,1);assert.equal(f.element.fire('contextmenu').prevented,true)
 f.click();assert.equal(f.pan.active,false);const saved=f.camera.position.clone();f.element.fire('pointermove',{clientX:200});assert.deepEqual(f.camera.position,saved)
 f.pan.dispose()
})
test('orthographic and inverted free views pan along camera screen axes',()=>{
 for(const camera of [new PerspectiveCamera(40,2,.01,100),new OrthographicCamera(-2,2,1,-1,.01,100)]){
  const f=fixture(camera);camera.up.set(0,-1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld()
  const right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0);f.click();f.element.fire('pointermove',{clientX:150})
  assert.ok(f.controls.target.dot(right)<0);assert.ok(f.controls.target.clone().cross(right).length()<1e-10);f.pan.dispose()
 }
})
test('escape, leave, outside press, blur, hide, cancellation and left click exit; touch stays untouched',()=>{
 const f=fixture()
 for(const exit of [()=>f.doc.fire('keydown',{key:'Escape'}),()=>f.element.fire('pointerleave'),()=>f.doc.fire('pointerdown',{target:f.doc}),()=>f.win.fire('blur'),()=>{f.doc.hidden=true;f.doc.fire('visibilitychange')},()=>f.element.fire('pointercancel'),()=>f.element.fire('pointerdown',{button:0})]){
  f.click();assert.equal(f.pan.active,true);exit();assert.equal(f.pan.active,false)
 }
 assert.equal(f.element.fire('pointerdown',{pointerType:'touch',button:0}).prevented,undefined)
 f.element.fire('pointerup',{pointerType:'touch',button:0});assert.equal(f.pan.active,false)
 f.click();f.pan.dispose();assert.equal(f.pan.active,false)
 for(const surface of [f.element,f.doc,f.win])assert.equal([...surface.listeners.values()].reduce((n,s)=>n+s.size,0),0)
})

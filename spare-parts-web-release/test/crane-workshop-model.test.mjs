import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createWorkshopState,applyWorkshopAction} from '../src/utils/crane-workshop.mjs'
import {buildWorkshopModel,applyWorkshopVisual} from '../src/utils/crane-workshop-model.mjs'
import {buildCraneModel,applyCranePose} from '../src/utils/crane-model.mjs'
import {craneHomePose} from '../src/utils/crane-state.mjs'

test('twelve pit openings, hidden open covers, grain levels and carried material follow one state',()=>{
 let state=createWorkshopState();const view=buildWorkshopModel(state.config.layout,state.config)
 applyWorkshopVisual(view,state)
 assert.equal(view.pits.size,12)
 const p=view.pits.get('c1-r1'),covered=view.pits.get('c2-r1')
 assert.equal(p.coverParts[0].object.visible,false)
 assert.equal(covered.coverParts[0].object.visible,true)
 assert.ok(!('stationGrain' in view),'no independent receiving trough')
 assert.equal(view.grabGrain.visible,false)
 const before=p.surface.geometry.attributes.position.getY(10)
 state={...state,pools:{...state.pools,'c1-r1':{...state.pools['c1-r1'],material:7}},grab:{...state.grab,load:1}}
 applyWorkshopVisual(view,state)
 assert.ok(p.surface.geometry.attributes.position.getY(10)<before)
 assert.equal(view.grabGrain.visible,true)
 applyWorkshopVisual(view,state,{unloadProgress:.5,pose:craneHomePose()});assert.equal(view.stream.visible,true)
 const materialHeight=view.grabGrain.scale.y;assert.ok(materialHeight>0&&materialHeight<.5)
 applyWorkshopVisual(view,state,{active:false});assert.equal(view.root.visible,false);assert.equal(view.grabGrain.visible,false)
 state=applyWorkshopAction(createWorkshopState(),{type:'set-cover',poolId:'c2-r1',manual:true,open:true}).state
 applyWorkshopVisual(view,state);assert.equal(covered.coverParts[0].object.visible,false)
})
test('workshop extension reaches the pit bottom with connected telescopic sections and all four columns are reachable',()=>{
 const crane=buildCraneModel(),state=createWorkshopState()
 for(const z of [-6,-2,2,6]){
  const pose={...craneHomePose(),transfer:1,trolley:.5+z/17,hoist:(2.99+1.15)/4.5}
  applyCranePose(crane,pose,{workshop:true});crane.root.updateMatrixWorld(true)
  const jaws=new THREE.Box3().setFromObject(crane.rig.jaws)
  assert.ok(Math.abs(jaws.min.y+1.15)<.03);assert.ok(Math.abs(crane.rig.grab.position.z-z)<1e-8)
  const a=new THREE.Box3().setFromObject(crane.rig.stage2.children[0]),b=new THREE.Box3().setFromObject(crane.rig.stage3.children[0])
  assert.ok(a.min.y<b.max.y,'telescopic sections must overlap')
  assert.ok(jaws.min.y>state.config.bottomY)
 }
})

test('square pits use one crowned water-sealed cap that vanishes completely after removal',()=>{
 let state=createWorkshopState();const view=buildWorkshopModel(state.config.layout,state.config)
 applyWorkshopVisual(view,state)
 for(const pit of state.config.layout){
  assert.equal(pit.width,pit.length)
  const p=view.pits.get(pit.id);assert.equal(p.coverParts.length,1)
  const cap=p.coverParts[0].object;assert.equal(cap.userData.coverType,'water-sealed-pit-cap')
  const box=new THREE.Box3().setFromObject(cap),size=box.getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.x-size.z)<.001);assert.ok(size.y>.2)
  assert.equal(cap.children.filter(o=>o.name==='pit-cap-lifting-ring').length,2)
  assert.equal(p.waterSeal.visible,true)
 }
 state=applyWorkshopAction(state,{type:'set-cover',poolId:'c2-r1',manual:true,open:true}).state
 applyWorkshopVisual(view,state)
 assert.equal(view.pits.get('c2-r1').coverParts[0].object.visible,false)
 assert.equal(view.pits.get('c2-r1').waterSeal.visible,true)
})

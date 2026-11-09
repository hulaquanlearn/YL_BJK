import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkshopState,applyWorkshopAction,checkWorkshopInvariants} from '../src/utils/crane-workshop.mjs'
import {craneHomePose} from '../src/utils/crane-state.mjs'
import {beginGrabPlayback,advanceGrabPlayback} from '../src/utils/crane-grab-playback.mjs'

test('rendered endpoints drive a complete real-material cycle at every column without resetting other pools',()=>{
 let state=createWorkshopState(),pose={...craneHomePose(),transfer:1}
 for(const id of ['c1-r1','c2-r2','c3-r3','c4-r1']){
  state=applyWorkshopAction(state,{type:'select-pool',poolId:id}).state
  state=applyWorkshopAction(state,{type:'set-cover',poolId:id,open:true,manual:true}).state
  let started=beginGrabPlayback(state,pose);assert.equal(started.result.ok,true);let playback=started.playback;state=started.state
  for(let frame=0;frame<3000&&!playback.complete;frame++){
   ({playback,state}=advanceGrabPlayback(playback,state,.1,{speed:3}));assert.equal(playback.error,null);assert.equal(checkWorkshopInvariants(state).ok,true)
  }
  assert.equal(playback.complete,true);assert.equal(state.pools[id].material,7);pose=playback.pose
 }
 assert.equal(state.hopper.load,4);assert.equal(state.grab.load,0)
 for(const id of ['c1-r1','c2-r2','c3-r3','c4-r1'])assert.equal(state.pools[id].material,7)
})
test('pause and duplicate completed frames cannot advance a grab or settle material again',()=>{
 let {state,playback}=beginGrabPlayback(createWorkshopState(),craneHomePose())
 const paused=applyWorkshopAction(state,{type:'pause'}).state
 assert.deepEqual(advanceGrabPlayback(playback,paused,99),{playback,state:paused})
 for(let i=0;i<2000&&!playback.complete;i++)({state,playback}=advanceGrabPlayback(playback,state,.1,{speed:5}))
 const after=advanceGrabPlayback(playback,state,100)
 assert.deepEqual(after,{state,playback});assert.equal(state.hopper.load,1)
})

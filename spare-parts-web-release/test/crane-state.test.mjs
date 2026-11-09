import test from 'node:test';
import assert from 'node:assert/strict';
import {craneAxes,craneHomePose,cranePose,advanceCraneDemo,craneTrolleyGap} from '../src/utils/crane-state.mjs';
test('offline crane coordinates reject nonfinite values and clamp manual endpoints without accepting unknown controls',()=>{
 const pose=cranePose({travel:2,hoist:-1,rotation:NaN,grip:Infinity,remotePLC:1});
 assert.equal(pose.travel,1);assert.equal(pose.hoist,0);assert.equal(pose.rotation,0);assert.equal(pose.grip,0);
 assert.deepEqual(Object.keys(pose),craneAxes.map(a=>a.id));
 const first=craneHomePose();first.travel=0;assert.equal(craneHomePose().travel,.5);
});
test('shared-span trolley controls preserve order and separation at manual and animated extremes',()=>{
 for(const trolley of [0,.2,.5,.8,1])for(const transfer of [0,.2,.5,.8,1]){
  const state=cranePose({trolley,transfer});
  assert.ok(state.transfer-state.trolley>=craneTrolleyGap-1e-12);
  assert.ok(state.transfer<=1&&state.trolley>=0);
  const next=advanceCraneDemo(craneHomePose(),state,.1);
  assert.ok(next.transfer-next.trolley>=craneTrolleyGap-1e-12);
 }
});
test('transfer centre alignment requires a fully raised grab, lowered fixture and level bin',()=>{
 const aligned={...craneHomePose(),trolley:1,transfer:1,transferHoist:1}
 assert.equal(cranePose(aligned).trolley,1)
 for(const change of [{hoist:.1},{transferHoist:.8},{flip:.1}])assert.ok(cranePose({...aligned,...change}).trolley<1)
});
test('pausing crane demonstration freezes every axis; delayed frames cannot skip a full travel or overshoot endpoints',()=>{
 const home=craneHomePose(),target={...home,travel:1,grip:1};
 assert.deepEqual(advanceCraneDemo(home,target,30,{running:false}),home);
 const next=advanceCraneDemo(home,target,30);assert.ok(next.travel>.5&&next.travel<.53);assert.equal(next.hoist,0);
 const end=advanceCraneDemo({...home,travel:.999},target,.1);assert.equal(end.travel,1);
});

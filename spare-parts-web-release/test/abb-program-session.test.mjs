import test from 'node:test'
import assert from 'node:assert/strict'
import {Quaternion,Vector3} from 'three'
import {AbbProgramSession} from '../src/utils/abb-program-session.mjs'
import {solveProgramRequest,prepareProgramMotion} from '../src/utils/abb-program-motion.mjs'
import {robotReferenceJoints,robotFlangeMatrix} from '../src/utils/abb-kinematics.mjs'
import {poseMatrix,linearRobotPath} from '../src/utils/abb-inverse-kinematics.mjs'

test('the opaque program state advances only after the rendered movement completes; interrupted movement resumes',async()=>{
 let joints=robotReferenceJoints.slice(),finish,requests=0,done=false
 const updates=[],target=[5,3,-5,0,90,0]
 const session=new AbbProgramSession({getJoints:()=>joints,stopMotion:()=>{},frames:()=>({}),update:p=>updates.push(p),move:motion=>new Promise(resolve=>{finish=()=>{joints=motion.frames.at(-1);resolve()}}),request:async body=>{
  requests++;assert.equal(body.stopOnMotion,true)
  if(!body.state)return {state:{pc:0},events:[],stop:{type:'ready'}}
  return {state:{pc:1},events:[{type:'motion',instruction:'MoveAbsJ',joints:target,line:10}],stop:{type:'motion'}}
 }})
 const run=session.run({single:true,routine:'main'}).then(()=>done=true)
 await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,2);assert.deepEqual(session.state,{pc:0});assert.equal(done,false)
 session.stop();finish();await run;assert.deepEqual(session.state,{pc:0});assert.ok(session.pending)
 const resumed=session.run({single:true});await new Promise(resolve=>setImmediate(resolve));finish();await resumed
 assert.equal(requests,2,'resumes already-fetched movement without fetching ahead');assert.deepEqual(session.state,{pc:1});assert.equal(session.history.length,1)
})

test('FK/IK handshakes run internally and waits/end stop without fetching the next instruction',async()=>{
 const updates=[],bodies=[];let joints=robotReferenceJoints.slice()
 const session=new AbbProgramSession({getJoints:()=>joints,stopMotion:()=>{},move:async m=>{joints=m.frames.at(-1)},update:p=>updates.push(p),request:async body=>{
  bodies.push(body)
  if(!body.state)return {state:{pc:0},events:[],stop:{type:'ready'}}
  if(!body.solve)return {state:{pc:0,pending:true},events:[],stop:{type:'robot-solve',request:{kind:'fk',joints}}}
  assert.equal(body.solve.pose.pos.length,3)
  return {state:{pc:1},events:[],stop:{type:'wait',kind:'waitdi',signal:'di1',expected:1,current:0,line:12}}
 }})
 await session.run({routine:'main'});assert.equal(bodies.length,3);assert.equal(updates.at(-2).stop.type,'wait');assert.equal(session.state.pc,1)
 const late=new AbbProgramSession({getJoints:()=>joints,move:async()=>{},stopMotion:()=>{},update:()=>{},request:async()=>({state:{pc:2},events:[],stop:{type:'end'}})})
 await late.run();assert.equal(late.ended,true)
})

test('stopped requests cannot overwrite a restarted program, and failed movements keep the checkpoint',async()=>{
 let reply;const updates=[]
 const session=new AbbProgramSession({getJoints:()=>robotReferenceJoints,move:async()=>{throw Error('unreachable')},stopMotion:()=>{},update:p=>updates.push(p),request:()=>new Promise(resolve=>{reply=resolve})})
 const running=session.run();session.clear();reply({state:{pc:999},events:[],stop:{type:'end'}});await running;assert.equal(session.state,null)
 session.request=async()=>({state:{pc:1},events:[{type:'motion',instruction:'MoveAbsJ',joints:[0,0,0,0,90,0]}],stop:{type:'motion'}})
 await session.run();assert.equal(session.state,null);assert.ok(session.pending);assert.equal(updates.some(p=>p.error==='unreachable'),true)
})

test('real FK is millimetres/scalar-first and IK errors never produce clipped or invented joints',()=>{
 const joints=[20,15,-25,20,65,30],fk=solveProgramRequest({kind:'fk',joints})
 const m=poseMatrix(fk.pose),target=robotFlangeMatrix(joints)
 assert.ok(m.elements.every((v,i)=>Math.abs(v-target.elements[i])<1e-9))
 const result=solveProgramRequest({kind:'ik',frame:'flange',pose:fk.pose,seed:robotReferenceJoints})
 assert.ok(result.joints)
 assert.ok(solveProgramRequest({kind:'fk',joints:[1000,0,0,0,0,0]}).error)
 assert.ok(solveProgramRequest({kind:'ik',pose:{pos:[50000,50000,50000],quat:[1,0,0,0]},seed:robotReferenceJoints}).error)
 assert.throws(()=>prepareProgramMotion({type:'motion',instruction:'MoveL',straight:true,joints,flange:fk.pose,tool:'unknown'},robotReferenceJoints),/TCP/)
})

test('MoveL follows the TCP line when a nonzero tool offset rotates',()=>{
 const seed=robotReferenceJoints,target=robotFlangeMatrix([5,3,-5,0,85,5]),tool={pos:[200,0,300],quat:[1,0,0,0]},tcp=poseMatrix(tool)
 const start=robotFlangeMatrix(seed).multiply(tcp),end=target.clone().multiply(tcp),a=new Vector3().setFromMatrixPosition(start),b=new Vector3().setFromMatrixPosition(end)
 const path=linearRobotPath(target,seed,{tool});assert.equal(path.ok,true,JSON.stringify(path));assert.ok(path.frames.length>1)
 path.frames.forEach((q,i)=>{const point=new Vector3().setFromMatrixPosition(robotFlangeMatrix(q).multiply(tcp)),expected=a.clone().lerp(b,(i+1)/path.frames.length);assert.ok(point.distanceTo(expected)<.0006)})
})

test('rendered MoveL finishes at the exact interpreter joints so the next FK cannot drift',()=>{
 const seed=robotReferenceJoints,target=[5,3,-5,0,85,5],tool={pos:[200,0,300],quat:[1,0,0,0]},flange=solveProgramRequest({kind:'fk',joints:target}).pose
 const motion=prepareProgramMotion({type:'motion',instruction:'MoveL',straight:true,joints:target,flange,tool:'tool1',toolPose:tool},seed)
 assert.deepEqual(motion.frames.at(-1),target)
})

test('programmed TCP speed affects base duration and manual preview never exceeds the 250mm/s cap',()=>{
 const joints=[5,3,-5,0,85,5],flange=solveProgramRequest({kind:'fk',joints}).pose,event={type:'motion',instruction:'MoveL',straight:true,joints,flange,tool:'tool0'}
 const slow=prepareProgramMotion({...event,speed:'v10'},robotReferenceJoints),fast=prepareProgramMotion({...event,speed:'v250'},robotReferenceJoints),capped=prepareProgramMotion({...event,speed:'v1000'},robotReferenceJoints)
 assert.ok(slow.duration>fast.duration*5);assert.equal(capped.duration,fast.duration)
})

test('manual jogging after a completed program checkpoint requires restart instead of silently using stale joints',async()=>{
 let joints=robotReferenceJoints.slice(),requests=0;const updates=[]
 const session=new AbbProgramSession({getJoints:()=>joints,stopMotion:()=>{},update:p=>updates.push(p),move:async()=>{},request:async()=>{requests++;return {state:{pc:10},events:[],stop:{type:'wait',signal:'diReady'}}}})
 await session.run();assert.equal(requests,1)
 joints=[1,...joints.slice(1)];await session.run();assert.equal(requests,1);assert.match(updates.at(-1).error,/姿态已手动改变/)
 session.clear();await session.run();assert.equal(requests,2)
})

test('manual movement also invalidates an interrupted pending motion, while ordinary stop alone still permits resume',async()=>{
 let finish;const updates=[]
 const session=new AbbProgramSession({getJoints:()=>robotReferenceJoints,stopMotion:()=>{},update:p=>updates.push(p),request:async()=>({state:{pc:1},events:[{type:'motion',instruction:'MoveAbsJ',joints:[5,0,0,0,90,0]}],stop:{type:'motion'}}),move:()=>new Promise(resolve=>finish=resolve)})
 const run=session.run();await new Promise(resolve=>setImmediate(resolve));session.stop();finish();await run
 assert.ok(session.pending);session.markManualPoseChange();await session.run();assert.match(updates.at(-1).error,/姿态已手动改变/)
})


test('stop aborts the active simulation transport and a later run gets a fresh uncancelled request',async()=>{
 let signal,requests=0;const errors=[];
 const session=new AbbProgramSession({getJoints:()=>robotReferenceJoints,move:async()=>{},stopMotion(){},update:patch=>{if(patch.error)errors.push(patch.error)},request:async(_body,options)=>{requests++;signal=options.signal;if(requests===1)return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));return {state:{pc:2},events:[],stop:{type:'end'}}}});
 const first=session.run();assert.equal(signal.aborted,false);session.stop();assert.equal(signal.aborted,true);await first;assert.equal(session.state,null);assert.equal(errors.length,0);
 await session.run();assert.equal(signal.aborted,false);assert.equal(session.state.pc,2);assert.equal(session.ended,true);
});

test('selected routines publish committed tool output signals even without an automated filling cell',async()=>{
 const updates=[],signals={do18_pidai_zhengzhuan:1,go32_47_boqi_zhuansu:750};
 const session=new AbbProgramSession({getJoints:()=>robotReferenceJoints,move:async()=>{},stopMotion:()=>{},update:p=>updates.push(p),request:async()=>({state:{signals},events:[],stop:{type:'end'}})});
 await session.run({routine:'belt-only'});const patch=updates.find(p=>'toolSignals' in p);assert.deepEqual(patch.toolSignals,signals);assert.equal(patch.cell,null);assert.notEqual(patch.toolSignals,signals);
});

test('IO preceding a motion drives the belt during that motion without prematurely committing the robot checkpoint',async()=>{
 let finish;const updates=[];const session=new AbbProgramSession({getJoints:()=>robotReferenceJoints,move:()=>new Promise(r=>{finish=r}),stopMotion:()=>{},update:p=>updates.push(p),request:async()=>({state:{pc:1,signals:{do18_pidai_zhengzhuan:1}},events:[{type:'motion',instruction:'MoveAbsJ',joints:robotReferenceJoints}],stop:{type:'end'}})});
 const running=session.run();await new Promise(r=>setImmediate(r));assert.equal(session.state,null);assert.equal(updates.find(p=>p.current?.instruction==='MoveAbsJ').toolSignals.do18_pidai_zhengzhuan,1);finish();await running;assert.equal(session.state.pc,1);
});

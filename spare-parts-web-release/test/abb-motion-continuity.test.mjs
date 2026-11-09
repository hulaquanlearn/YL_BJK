import test from 'node:test'
import assert from 'node:assert/strict'
import {sampleJointPath} from '../src/utils/abb-motion-sampling.mjs'
import {prepareProgramMotion} from '../src/utils/abb-program-motion.mjs'
import {AbbProgramSession} from '../src/utils/abb-program-session.mjs'
const home=[0,0,0,0,90,0],tick=()=>new Promise(r=>setImmediate(r))

test('one linear motion does not decelerate at each IK sample, and fine eases only once',()=>{
 const frames=Array.from({length:21},(_,i)=>[i,0,0,0,90,0])
 for(const time of [.199,.2,.201,.499,.5,.501])assert.ok(Math.abs(sampleJointPath(frames,time,1,{continuous:true}).joints[0]-time*20)<1e-10)
 const a=sampleJointPath(frames,.499,1).joints[0],b=sampleJointPath(frames,.5,1).joints[0],c=sampleJointPath(frames,.501,1).joints[0]
 assert.ok(b-a>.029&&c-b>.029,'no stop at a middle IK sample')
 assert.deepEqual(sampleJointPath(frames,2,1).joints,frames.at(-1));assert.equal(sampleJointPath(frames,1,1).complete,true)
 const event={type:'motion',instruction:'MoveL',joints:[.1,0,0,0,90,0],speed:'v5000',zone:'z20'}
 const automatic=prepareProgramMotion(event,home,{}, {automatic:true}),fine=prepareProgramMotion({...event,zone:'fine'},home,{}, {automatic:true})
 assert.equal(automatic.continuous,true);assert.equal(fine.continuous,false);assert.ok(automatic.duration<.3)
 assert.equal(prepareProgramMotion(event,home).duration,.3,'ordinary manual motion retains its reduced-speed floor')
})

test('automatic lookahead overlaps the current motion without committing future IO or checkpoints',async()=>{
 let finish,joints=home.slice(),requests=0;const updates=[]
 const session=new AbbProgramSession({getJoints:()=>joints,stopMotion(){},update:p=>updates.push(p),move:motion=>new Promise(r=>{finish=()=>{joints=motion.frames.at(-1);r()}}),request:async body=>{
  requests++
  if(!body.state)return {state:{pc:0},events:[],stop:{type:'ready'}}
  if(body.state.pc===0)return {state:{pc:1,signals:{belt:1}},events:[{type:'motion',instruction:'MoveAbsJ',joints:[1,0,0,0,90,0]}],stop:{type:'yield'}}
  return {state:{pc:2,signals:{belt:0}},events:[],stop:{type:'end'}}
 }})
 const run=session.run({automation:{}});await tick();assert.equal(requests,3);assert.equal(session.state.pc,0)
 assert.ok(!updates.some(p=>p.toolSignals?.belt===0),'future IO must remain private while moving')
 finish();await run;assert.equal(session.state.pc,2);assert.equal(session.ended,true)
})

test('stopping aborts speculative requests and never commits their result',async()=>{
 let finish,prefetchSignal;const session=new AbbProgramSession({getJoints:()=>home,stopMotion(){},update(){},move:()=>new Promise(r=>{finish=r}),request:async(body,{signal})=>{
  if(!body.state)return {state:{pc:0},events:[],stop:{type:'ready'}}
  if(body.state.pc===0)return {state:{pc:1},events:[{type:'motion',instruction:'MoveAbsJ',joints:home}],stop:{type:'yield'}}
  prefetchSignal=signal;return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))
 }})
 const run=session.run({automation:{}});await tick();assert.ok(prefetchSignal);session.stop();assert.equal(prefetchSignal.aborted,true);finish();await run
 assert.equal(session.state.pc,0);assert.ok(session.pending);assert.equal(session.ended,false)
})

test('program waits scale with playback rather than imposing a 30 ms floor per source wait',async t=>{
 let clock=0,active=true;const delays=[]
 t.mock.method(Date,'now',()=>clock)
 t.mock.method(globalThis,'setTimeout',(done,delay)=>{delays.push(delay);clock+=delay;queueMicrotask(done);return 0})
 const session=new AbbProgramSession({getJoints:()=>home,stopMotion(){},update(){},move:async()=>{},request:async()=>{},speed:()=>10})
 await session.wait(.01,()=>active);assert.equal(delays.length,0,'a 1 ms wall-clock wait cannot add a visible 30 ms pause')
 await session.wait(.5,()=>active);assert.ok(Math.abs(delays.reduce((sum,v)=>sum+v,0)-50)<1e-8,'0.5 simulated seconds at 10x must wait 50 ms')
 assert.ok(delays.every(v=>v<=30),'long waits must remain interruptible')
})

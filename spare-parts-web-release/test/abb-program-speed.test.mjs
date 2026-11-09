import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareProgramMotion} from '../src/utils/abb-program-motion.mjs'
import {robotReferenceJoints} from '../src/utils/abb-kinematics.mjs'

const motion=(joints,speed,zone='fine')=>prepareProgramMotion({type:'motion',instruction:'MoveAbsJ',joints,speed,zone},robotReferenceJoints,{}, {automatic:true})
test('normal execution uses the correct per-axis limits, including the faster wrist',()=>{
 const base=robotReferenceJoints.slice(),fast={tcp:1e9,orientation:1e9}
 const j1=base.slice();j1[0]+=50
 const j6=base.slice();j6[5]+=95
 assert.ok(Math.abs(motion(j1,fast).duration-.75)<1e-8)
 assert.ok(Math.abs(motion(j6,fast).duration-.75)<1e-8)
})
test('VelSet override and TCP cap affect motion, and orientation remains independently limited',()=>{
 const target=robotReferenceJoints.slice();target[0]+=10
 const fast=motion(target,{tcp:1000,orientation:1e9})
 const half=motion(target,{tcp:1000,orientation:1e9,override:50})
 const capped=motion(target,{tcp:5000,orientation:1e9,maxTcp:500})
 assert.ok(Math.abs(half.duration-fast.duration*2)<1e-8)
 assert.ok(Math.abs(capped.duration-half.duration)<1e-8)
 const wrist=robotReferenceJoints.slice();wrist[5]+=90
 assert.ok(Math.abs(motion(wrist,{tcp:1e9,orientation:10}).duration-13.5)<1e-8)
})

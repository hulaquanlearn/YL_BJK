import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {robotFlangeMatrix,robotReferenceJoints} from '../src/utils/abb-kinematics.mjs'
import {inverseRobotJoints,flangeTarget,linearRobotPath} from '../src/utils/abb-inverse-kinematics.mjs'
test('IK recovers reachable poses in different wrist and arm configurations',()=>{
 for(const q of [[20,15,-25,20,65,30],[-35,-15,20,-35,100,-40],[0,0,0,0,30,0]]){
  const target=robotFlangeMatrix(q),result=inverseRobotJoints(target)
  assert.equal(result.ok,true,JSON.stringify(result))
  assert.ok(new Vector3().setFromMatrixPosition(robotFlangeMatrix(result.joints)).distanceTo(new Vector3().setFromMatrixPosition(target))<.0005)
 }
})
test('frame composition uses millimetres and ABB scalar-first quaternion, rejects unsupported frames',()=>{
 const target=flangeTarget({pos:[1000,0,500],quat:[1,0,0,0]},{robhold:true,tcp:[100,0,0],quat:[1,0,0,0]},{uframe:{pos:[0,100,0],quat:[1,0,0,0]},oframe:{pos:[0,0,200],quat:[1,0,0,0]}})
 assert.deepEqual(new Vector3().setFromMatrixPosition(target).toArray(),[.9,.1,.7])
 assert.throws(()=>flangeTarget({pos:[0,0,0],quat:[0,0,0,0]}))
 assert.throws(()=>flangeTarget({pos:[0,0,0],quat:[1,0,0,0]},{robhold:false}))
})
test('linear paths remain solvable and unreachable poses fail without clipping them to a fake target',()=>{
 const target=robotFlangeMatrix([5,3,-5,0,90,0]),path=linearRobotPath(target,robotReferenceJoints)
 assert.equal(path.ok,true,JSON.stringify(path));assert.ok(path.frames.length>1)
 const unreachable=target.clone();unreachable.setPosition(50,50,50)
 assert.equal(inverseRobotJoints(unreachable).ok,false)
})

test('small linear joystick increments are actually solved instead of accepted as an unchanged pose',()=>{
 const seed=[20,15,-25,20,65,30],target=robotFlangeMatrix(seed),start=new Vector3().setFromMatrixPosition(target)
 target.setPosition(start.clone().add(new Vector3(.00005,0,0)))
 const result=inverseRobotJoints(target,seed,{attempts:1,positionTolerance:.000001,rotationTolerance:.000001})
 assert.equal(result.ok,true,JSON.stringify(result))
 const actual=new Vector3().setFromMatrixPosition(robotFlangeMatrix(result.joints))
 assert.ok(actual.distanceTo(start)>.000045);assert.ok(actual.distanceTo(start.clone().add(new Vector3(.00005,0,0)))<.000001)
})

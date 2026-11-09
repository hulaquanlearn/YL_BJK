import test from 'node:test'
import assert from 'node:assert/strict'
import {Matrix4,Vector3} from 'three'
import {robotCadTransforms,robotFlangeMatrix,robotReferenceJoints,clampRobotJoints,robotJointLimits} from '../src/utils/abb-kinematics.mjs'
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`)
test('all ABB CAD transforms return to the exact zero-angle assembly, including both balance branches',()=>{
 const identity=new Matrix4().elements
 for(const matrix of robotCadTransforms([0,0,0,0,0,0]))matrix.elements.forEach((v,i)=>near(v,identity[i]))
})
test('base yaw rotates the entire arm and the wrist uses the original 200 mm offset',()=>{
 const zero=robotFlangeMatrix([0,0,0,0,0,0]),yaw=robotFlangeMatrix([90,0,0,0,0,0])
 near(zero.elements[12],2.1125);near(zero.elements[14],2.26)
 near(yaw.elements[12],0);near(yaw.elements[13],2.1125);near(yaw.elements[14],2.26)
 const reference=new Vector3().setFromMatrixPosition(robotFlangeMatrix(robotReferenceJoints))
 near(reference.x,1.9125);near(reference.y,0);near(reference.z,2.06)
})
test('joint values are bounded, transforms remain rigid and the flange orientation follows every axis',()=>{
 assert.deepEqual(clampRobotJoints([999,-999,999,-999,999,-999]),robotJointLimits.map((range,i)=>range[i%2?0:1]))
 for(const joints of [robotReferenceJoints,[30,-20,40,60,-45,90],[-120,60,-90,-170,110,-240]]){
  for(const matrix of robotCadTransforms(joints)){near(matrix.determinant(),1,1e-7);assert.ok(matrix.elements.every(Number.isFinite))}
 }
 const before=robotFlangeMatrix(robotReferenceJoints),after=robotFlangeMatrix([0,0,0,0,90,45])
 near(before.elements[12],after.elements[12]);near(before.elements[14],after.elements[14]);assert.notDeepEqual(before.elements.slice(0,12),after.elements.slice(0,12))
})

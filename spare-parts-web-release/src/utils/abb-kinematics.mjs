import {Matrix4,Vector3,MathUtils} from 'three'
import data from './abb-kinematics-data.mjs'
import {robotDisassemblyOffset,disassemblyProgress} from './abb-robot-disassembly.mjs'

export const robotJointLimits=[[-170,170],[-65,85],[-180,70],[-300,300],[-130,130],[-360,360]]
export const robotReferenceJoints=[0,0,0,0,90,0]
export const robotPartLinks={base:0,axis1:1,cable1:1,axis2:2,cable2:2,axis3:3,cable3:3,axis4:4,axis5:5,axis6:6,balance1:7,balance2:8}
const basis=new Matrix4().makeRotationX(-Math.PI/2),inverseBasis=basis.clone().invert()
const corrections=data.corrections.map(c=>new Matrix4().fromArray(c))

export function clampRobotJoints(values,fallback=robotReferenceJoints,limits=robotJointLimits){
  return limits.map(([min,max],i)=>Math.max(min,Math.min(max,Number.isFinite(Number(values?.[i]))?Number(values[i]):fallback[i])))
}
function dh(entry,angle){
  return new Matrix4().makeTranslation(entry.Length,0,0)
    .multiply(new Matrix4().makeRotationX(entry.Twist))
    .multiply(new Matrix4().makeRotationZ(entry.Rotation+angle))
    .multiply(new Matrix4().makeTranslation(0,0,entry.Offset))
}
export function robotLinkFrames(values,limits=robotJointLimits){
  const angles=clampRobotJoints(values,robotReferenceJoints,limits).map(MathUtils.degToRad)
  const balance=Math.atan2(213.4*Math.sin(angles[1]),683.9-213.4*Math.cos(angles[1]))
  angles.push(balance,balance+angles[1])
  const frames=[new Matrix4()]
  function walk(index,parent){
    for(const entry of data.joints[index]){
      const frame=parent.clone().multiply(dh(entry,angles[index]))
      if(entry.Link>=0)frames[entry.Link]=frame
      if(entry.NextJoint>=0)walk(entry.NextJoint,frame)
    }
  }
  walk(0,new Matrix4().fromArray(data.base))
  return frames
}
export function robotCadTransforms(values,limits=robotJointLimits){
  return robotLinkFrames(values,limits).map((frame,index)=>basis.clone().multiply(frame).multiply(corrections[index]).multiply(inverseBasis))
}
export function applyRobotJoints(root,values,spread=0,limits=robotJointLimits){
  const joints=clampRobotJoints(values,robotReferenceJoints,limits),transforms=robotCadTransforms(joints,limits),amount=Math.max(0,Math.min(1,Number(spread)||0))
  for(const [id,link] of Object.entries(robotPartLinks)){
    const node=root.getObjectByName(id);if(!node)continue
    node.matrix.copy(transforms[link]);node.matrix.decompose(node.position,node.quaternion,node.scale)
    node.userData.assemblyPosition=node.position.clone()
    node.position.add(robotDisassemblyOffset(id,amount))
  }
  const tool=root.getObjectByName('tool')
  if(tool?.userData.mountPosition){
    tool.position.copy(tool.userData.mountPosition)
    // Tool local +Y points away from its mounting face.
    tool.position.add(new Vector3(0,.45,0).applyQuaternion(tool.quaternion).multiplyScalar(disassemblyProgress('tool',amount)))
    // Once detached, keep the tool parked while the flange is removed later.
    const flange=root.getObjectByName('axis6')
    if(flange)tool.position.sub(robotDisassemblyOffset('axis6',amount).applyQuaternion(flange.quaternion.clone().invert()))
  }
  root.userData.joints=joints;root.updateMatrixWorld(true)
  return joints
}
export function robotFlangeMatrix(values,limits=robotJointLimits){
  // The source wrist flange is defined in the original CAD assembly coordinates.
  const flange=new Matrix4().set(0,0,1,2.1125,0,1,0,0,-1,0,0,2.26,0,0,0,1)
  return robotLinkFrames(values,limits)[6].clone().multiply(corrections[6]).multiply(flange)
}

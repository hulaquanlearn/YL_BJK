import {Vector3,Quaternion} from 'three'
import {robotJointLimits,robotFlangeMatrix} from './abb-kinematics.mjs'
import {flangeTarget,poseMatrix,inverseRobotJoints,linearRobotPath} from './abb-inverse-kinematics.mjs'

export function checkedJoints(values,limits=robotJointLimits){
 if(!Array.isArray(values)||values.length!==6||!values.every(Number.isFinite))throw Error('关节点位需要六个有效角度')
 values.forEach((value,i)=>{if(value<limits[i][0]||value>limits[i][1])throw Error('J'+(i+1)+' 目标 '+value+'° 超出当前机器人关节范围')})
 return values.slice()
}
function frameData(ref,list){
 if(!ref||ref.resolution==='default')return null
 if(ref.resolution!=='static')throw Error((ref.ref||'坐标数据')+' 未确定，需先补充实际值')
 const value=ref.data||list?.find(item=>item.name===ref.ref)
 if(!value)throw Error('缺少 '+ref.ref+' 的坐标数据')
 return value
}
export function prepareProgramMotion(action,joints,frames={},{automatic=false}={}){
 const limits=action.jointLimits||frames.jointLimits||robotJointLimits
 if(!['MoveAbsJ','MoveJ','MoveL','TriggJ','TriggL'].includes(action.instruction))throw Error('尚不支持运动指令 '+action.instruction)
 if(action.type==='motion'){
  const target=checkedJoints(action.joints||action.to,limits)
  let path={frames:[target]}
  if(action.straight){
   if(!action.flange)throw Error('直线运动缺少法兰目标位姿')
   const tool=action.toolPose||frames.tools?.find(t=>t.name.toLowerCase()===String(action.tool).toLowerCase())
   if(action.tool!=='tool0'&&!tool)throw Error('直线运动缺少已解析的工具 TCP')
   path=linearRobotPath(poseMatrix(action.flange),joints,{tool,limits})
   if(!path.ok)throw Error(path.reason)
   // The interpreter committed this exact IK solution. The path solver uses
   // intermediate seeds and can converge to a slightly different wrist pose;
   // finish at the committed joints so the rendered robot and next FK agree.
   if(path.frames.at(-1).some((q,i)=>Math.abs(q-target[i])>2))throw Error('直线末端解与程序关节目标不连续，请核对起始姿态与构型')
   path.frames[path.frames.length-1]=target
  }
  return timedMotion(path,joints,action.instruction,action.speed,action.toolPose,automatic,action.zone,limits)
 }
 const target=action.target
 if(target?.resolution!=='static')throw Error(target?.reason||'点位尚未确定，请补值后继续')
 if(target.externalAxes||(target.extax||target.pose?.extax||[]).some(v=>Math.abs(v)<1e9))throw Error('当前预演不支持外部轴')
 let path
 if(action.instruction==='MoveAbsJ')path={frames:[checkedJoints(target.joints,limits)]}
 else{
  const tool=frameData(action.tool,frames.tools),wobj=frameData(action.wobj,frames.wobjs),matrix=flangeTarget(target.pose,tool,wobj)
  const result=/L$/.test(action.instruction)?linearRobotPath(matrix,joints,{tool,limits}):inverseRobotJoints(matrix,joints,{limits})
  if(!result.ok)throw Error(result.reason)
  path={frames:result.frames||[result.joints]}
 }
 return timedMotion(path,joints,action.instruction,action.speed,frameData(action.tool,frames.tools),automatic,action.zone,limits)
}
function timedMotion(path,joints,instruction,speed,tool,automatic=false,zone='fine',limits=robotJointLimits){
 // ABB 3HAC044265-001 (IRC5), IRB 6700-150/3.20 maximum axis speed.
 // These limits constrain each axis separately, not an invented common 40°/s.
 const axisSpeeds=[100,90,90,170,120,190]
 const tcp=tool?poseMatrix({pos:tool.pos||tool.tcp,quat:tool.quat}):null
 const pose=q=>{const matrix=robotFlangeMatrix(q,limits);if(tcp)matrix.multiply(tcp);return {position:new Vector3().setFromMatrixPosition(matrix),orientation:new Quaternion().setFromRotationMatrix(matrix)}}
 let previous=joints,prior=pose(joints),axisSeconds=0,tcpMetres=0,orientationDegrees=0
 // The viewer assigns equal time to IK segments. Bound the fastest segment,
 // including tool rotation, instead of averaging away a local speed violation.
 const count=path.frames.length
 for(const frame of path.frames){
  axisSeconds=Math.max(axisSeconds,...frame.map((value,i)=>Math.abs(value-previous[i])*count/axisSpeeds[i]))
  const steps=/L$/.test(instruction)?1:Math.max(1,Math.ceil(Math.max(...frame.map((q,i)=>Math.abs(q-previous[i])))/3))
  for(let i=1;i<=steps;i++){
   const next=pose(previous.map((v,j)=>v+(frame[j]-v)*i/steps)),scale=steps*count
   tcpMetres=Math.max(tcpMetres,prior.position.distanceTo(next.position)*scale)
   orientationDegrees=Math.max(orientationDegrees,prior.orientation.angleTo(next.orientation)*180/Math.PI*scale)
   prior=next
  }
  previous=frame
 }
 const label=typeof speed==='string'?speed:speed?.ref||'',named=label.match(/^v([0-9.]+)$/i),programmed=Number(speed?.tcp??speed?.data?.[0]??speed?.data?.tcp??named?.[1])
 const override=Number(speed?.override??100)/100,orientation=Number(speed?.orientation??speed?.data?.[1]??500)
 if(!(override>0))throw Error('程序速度倍率必须大于零')
 // VelSet changes programmed TCP/orientation velocity; Max caps only TCP.
 // Manual point positioning retains reduced speed. Executing a routine uses
 // normal programmed speed, irrespective of whether it has a filling cell.
 const linearSpeed=Math.min(automatic?Infinity:250,Number(speed?.maxTcp)||Infinity,(programmed>0?programmed:100)*override)/1000
 const angularSpeed=(orientation>0?orientation:500)*override
 const continuous=automatic&&/L$/.test(instruction)&&!!zone&&!/^fine$/i.test(String(zone)),peak=continuous?1:1.5
 // fine uses one smoothstep profile (peak derivative 1.5). AccSet is retained
 // as source metadata; controller/load-specific acceleration is not inferred.
 return {...path,duration:Math.max(automatic?.016:.3,peak*axisSeconds,peak*tcpMetres/linearSpeed,peak*orientationDegrees/angularSpeed),instruction,continuous}
}
export function solveProgramRequest(request){
 try{
  const limits=request?.jointLimits||robotJointLimits
  if(request?.kind==='fk'){
   const matrix=robotFlangeMatrix(checkedJoints(request.joints,limits),limits),p=new Vector3().setFromMatrixPosition(matrix).multiplyScalar(1000),q=new Quaternion().setFromRotationMatrix(matrix).normalize()
   return {pose:{pos:p.toArray(),quat:[q.w,q.x,q.y,q.z]}}
  }
  if(request?.kind==='ik'){
   if(request.frame&&request.frame!=='flange')throw Error('未支持的求解坐标系 '+request.frame)
   const seed=checkedJoints(request.seed,limits);if(request.normalizeTurns)for(const axis of [3,5])seed[axis]-=Math.round(seed[axis]/360)*360
   let result=inverseRobotJoints(poseMatrix(request.pose),seed,{...(request.continuous?{attempts:1}:{}),positionTolerance:.00001,rotationTolerance:.00001,limits})
   if(!result.ok)throw Error(result.reason)
   if(request.normalizeTurns)for(const axis of [3,5])result.joints[axis]-=Math.round(result.joints[axis]/360)*360
   return {joints:checkedJoints(result.joints,limits)}
  }
  throw Error('未知机器人求解请求')
 }catch(error){return {error:{code:'robot-solve-failed',message:error.message}}}
}

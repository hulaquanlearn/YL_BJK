import {Matrix4,Vector3,Quaternion,MathUtils} from 'three'
import {robotFlangeMatrix,robotJointLimits,clampRobotJoints,robotReferenceJoints} from './abb-kinematics.mjs'

const positionOf=m=>new Vector3().setFromMatrixPosition(m)
const rotationOf=m=>new Quaternion().setFromRotationMatrix(m).normalize()
function errorOf(current,target){
 const p=positionOf(target).sub(positionOf(current)),q=rotationOf(target).multiply(rotationOf(current).invert()).normalize()
 if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w)
 const length=Math.hypot(q.x,q.y,q.z),angle=2*Math.atan2(length,Math.max(0,q.w)),scale=length>1e-10?angle/length:2
 return [p.x,p.y,p.z,q.x*scale,q.y*scale,q.z*scale]
}
function solve(a,b){
 const rows=a.map((row,i)=>[...row,b[i]])
 for(let i=0;i<6;i++){
  let pivot=i;for(let j=i+1;j<6;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j
  if(Math.abs(rows[pivot][i])<1e-12)return null
  ;[rows[i],rows[pivot]]=[rows[pivot],rows[i]]
  const divisor=rows[i][i];for(let k=i;k<7;k++)rows[i][k]/=divisor
  for(let j=0;j<6;j++)if(j!==i){const scale=rows[j][i];for(let k=i;k<7;k++)rows[j][k]-=scale*rows[i][k]}
 }
 return rows.map(row=>row[6])
}
export function poseMatrix(pose){
 if(!Array.isArray(pose?.pos)||pose.pos.length!==3||!Array.isArray(pose?.quat)||pose.quat.length!==4||![...pose.pos,...pose.quat].every(Number.isFinite))throw Error('点位需要 3 个位置数值和 4 个四元数数值')
 const [w,x,y,z]=pose.quat,q=new Quaternion(x,y,z,w)
 if(q.length()<1e-8)throw Error('点位四元数不能为零')
 return new Matrix4().compose(new Vector3(...pose.pos).multiplyScalar(.001),q.normalize(),new Vector3(1,1,1))
}
export function flangeTarget(pose,tool,wobj){
 if(tool?.robhold===false||wobj?.robhold===true||wobj?.ufprog===false)throw Error('当前暂不支持固定工具、机器人夹持工件或外部机械单元坐标系')
 const work=wobj?poseMatrix(wobj.uframe).multiply(poseMatrix(wobj.oframe)):new Matrix4()
 const tcp=tool?poseMatrix({pos:tool.tcp,quat:tool.quat}):new Matrix4()
 return work.multiply(poseMatrix(pose)).multiply(tcp.invert())
}
export function inverseRobotJoints(target,seed=robotReferenceJoints,{attempts=4,positionTolerance=.0005,rotationTolerance=.001,limits=robotJointLimits}={}){
 if(!target?.elements?.every(Number.isFinite))return {ok:false,reason:'目标位姿无效'}
 const starts=[seed,[seed[0],20,-35,seed[3],65,seed[5]],[seed[0],-20,30,0,90,0],robotReferenceJoints]
 let best={ok:false,positionError:Infinity,rotationError:Infinity}
 for(const start of starts.slice(0,attempts)){
  let q=clampRobotJoints(start,robotReferenceJoints,limits)
  for(let iteration=0;iteration<160;iteration++){
   const current=robotFlangeMatrix(q,limits),error=errorOf(current,target),pe=Math.hypot(...error.slice(0,3)),re=Math.hypot(...error.slice(3))
   if(pe+re<best.positionError+best.rotationError)best={ok:false,joints:q.slice(),positionError:pe,rotationError:re}
   if(pe<positionTolerance&&re<rotationTolerance)return {ok:true,joints:q,positionError:pe,rotationError:re}
   const columns=q.map((_,axis)=>{const next=q.slice(),step=q[axis]+.01>limits[axis][1]?-.01:.01;next[axis]+=step;return errorOf(current,robotFlangeMatrix(next,limits)).map(v=>v/MathUtils.degToRad(step))})
   const jac=Array.from({length:6},(_,i)=>columns.map(column=>column[i])),lambda=.015
   const normal=Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>jac.reduce((sum,row)=>sum+row[i]*row[j],0)+(i===j?lambda*lambda:0)))
   const rhs=Array.from({length:6},(_,i)=>jac.reduce((sum,row,k)=>sum+row[i]*error[k],0)),delta=solve(normal,rhs)
   if(!delta)break
   const scale=Math.min(1,.15/Math.max(...delta.map(Math.abs)))
   const next=clampRobotJoints(q.map((v,i)=>v+MathUtils.radToDeg(delta[i]*scale)),robotReferenceJoints,limits)
   if(next.every((v,i)=>Math.abs(v-q[i])<1e-7))break
   q=next
  }
 }
 return {...best,reason:'该点位未找到满足关节范围的逆解，请核对工具、工件坐标与起始姿态'}
}
export function linearRobotPath(target,seed,{maxSteps=200,tool=null,limits=robotJointLimits}={}){
 // RAPID MoveL interpolates the tool TCP, including when the tool rotates.
 const tcp=tool?poseMatrix({pos:tool.pos||tool.tcp,quat:tool.quat}):new Matrix4(),inverseTcp=tcp.clone().invert()
 const start=robotFlangeMatrix(seed,limits).multiply(tcp),end=target.clone().multiply(tcp),a=positionOf(start),b=positionOf(end),qa=rotationOf(start),qb=rotationOf(end)
 const count=Math.max(1,Math.ceil(a.distanceTo(b)/.025),Math.ceil(qa.angleTo(qb)/.06))
 if(count>maxSteps)return {ok:false,reason:'当前单段距离过大，请先核对起始姿态或分段预演'}
 const frames=[];let joints=seed
 for(let i=1;i<=count;i++){
  const t=i/count,m=new Matrix4().compose(a.clone().lerp(b,t),qa.clone().slerp(qb,t),new Vector3(1,1,1)).multiply(inverseTcp),result=inverseRobotJoints(m,joints,{attempts:1,limits})
  if(!result.ok)return {...result,frames:[],reason:'直线段在 '+Math.round(t*100)+'% 处无法求解：'+result.reason}
  joints=result.joints;frames.push(joints)
 }
 // A straight MoveL must not silently change wrist configuration mid-path.
 for(let i=1;i<frames.length;i++){const step=frames[i].map((value,j)=>value-frames[i-1][j]);
  if(step.some(value=>Math.abs(value)>90)||Math.abs(step[3])>120||Math.abs(step[5])>170)return {ok:false,reason:'直线段中途关节跳变（可能在 MoveL 中途换构型），请核对起始姿态、工具与工件坐标'}}
 return {ok:true,frames,joints}
}

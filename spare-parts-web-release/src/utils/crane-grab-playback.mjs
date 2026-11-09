import {craneAxes,craneHomePose,cranePose} from './crane-state.mjs'
import {applyWorkshopAction,workshopSummary} from './crane-workshop.mjs'

export function grabWorldPose(pose){return {x:(pose.travel-.5)*20,z:(pose.trolley-.5)*17,bottomY:2.99-pose.hoist*4.5}}
const targetPose=(x,z,extra={})=>cranePose({...craneHomePose(),transfer:1,travel:x/20+.5,trolley:z/17+.5,...extra})
export function beginGrabPlayback(state,currentPose){
 const started=applyWorkshopAction(state,{type:'begin-grab',poolId:state.selectedPoolId})
 if(!started.result.ok)return {...started,playback:null}
 const pool=state.pools[state.selectedPoolId],surface=workshopSummary(state).materialY,hoist=(2.99-surface+.05)/4.5,parkHoist=(3.65-state.transfer.hoistTopY)/2
 const poolPose=(extra={})=>targetPose(pool.x,pool.z,{transferHoist:parkHoist,...extra})
 const steps=[
  {label:'先提升至安全高度',target:cranePose({...currentPose,hoist:0,grip:0,rotation:0,flip:0,transfer:1,transferHoist:parkHoist})},
  {label:'定位到选中窖池',target:poolPose(),arrive:'above-pool'},
  {label:'张开抓斗',target:poolPose({grip:1})},
  {label:'下降至酒醅料面',target:poolPose({grip:1,hoist}),arrive:'surface'},
  {label:'闭斗抓取酒醅',target:poolPose({hoist}),action:'take'},
  {label:'携料提升越过池沿',target:poolPose(),arrive:'lifted'},
  {label:'转运斗下降到接料高度',target:poolPose({transferHoist:1}),action:'prepare-transfer'},
  {label:'移至转运斗口上方',target:targetPose(pool.x,state.transfer.z,{transferHoist:1}),arrive:'hopper'},
  {label:'开斗放入转运斗',target:targetPose(pool.x,state.transfer.z,{transferHoist:1,grip:1}),action:'release',unload:true,minSeconds:1.8},
  {label:'合斗并退出转运斗口',target:poolPose({transferHoist:1})}
 ]
 return {state:started.state,result:started.result,playback:{steps,index:0,elapsed:0,from:cranePose(currentPose),pose:cranePose(currentPose),running:true,complete:false,error:null,unloadProgress:0}}
}

// Frame time only. A background/resumed frame cannot skip stages or settle twice.
export function advanceGrabPlayback(playback,state,deltaSeconds,{speed=1}={}){
 if(!playback||!playback.running||playback.complete||state.paused||!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return {playback,state}
 const p={...playback},step=p.steps[p.index],distance=Math.max(...craneAxes.map(a=>Math.abs(step.target[a.id]-p.from[a.id]))),duration=Math.max(step.minSeconds||.15,distance/.32)
 p.elapsed+=Math.min(.1,deltaSeconds)*Math.max(.1,Math.min(5,Number(speed)||1))
 const t=Math.min(1,p.elapsed/duration),smooth=t*t*(3-2*t)
 p.pose=cranePose(Object.fromEntries(craneAxes.map(a=>[a.id,p.from[a.id]+(step.target[a.id]-p.from[a.id])*smooth])))
 p.unloadProgress=step.unload?smooth:0
 if(t<1)return {playback:p,state}
 p.pose=step.target
 const action=step.arrive?{type:'arrive',at:step.arrive,grab:grabWorldPose(p.pose)}:step.action==='prepare-transfer'?{type:'prepare-transfer',topY:3.65-2*p.pose.transferHoist,grab:grabWorldPose(p.pose)}:step.action?{type:step.action}:null
 if(action){const applied=applyWorkshopAction(state,action);if(!applied.result.ok){p.running=false;p.error=applied.result.reason;return {playback:p,state}}state=applied.state}
 p.index++;p.elapsed=0;p.from={...p.pose};p.unloadProgress=0
 if(p.index===p.steps.length){p.complete=true;p.running=false}
 return {playback:p,state}
}

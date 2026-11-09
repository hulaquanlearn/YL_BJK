import {prepareProgramMotion,solveProgramRequest} from './abb-program-motion.mjs'

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value))
// Server state is opaque. Commit it only after its motion has actually finished.
export class AbbProgramSession{
 constructor({request,getJoints,move,stopMotion,update,frames=()=>({}),speed=()=>1}){
  Object.assign(this,{request,getJoints,move,stopMotion,update,frames,speed});this.epoch=0;this.running=false;this.clear()
 }
 clear(){this.stop();this.state=null;this.pending=null;this.solve=null;this.elapsed=0;this.solveRequest=null;this.history=[];this.ended=false;this.expectedJoints=null;this.manualPoseChanged=false}
 markManualPoseChange(){this.stop();if(this.state||this.pending)this.manualPoseChanged=true}
 stop(){this.epoch++;this.running=false;this.requestController?.abort();this.requestController=null;this.stopMotion?.()}
 async run({single=false,routine,signals={},inputs={},parameters={},automation=null,toolType='tool-640'}={}){
  if(this.running)return
  if(this.ended){this.update({status:'例程已结束，可重新开始'});return}
  // Paused in-flight movement may resume from its rendered intermediate pose.
  // A completed checkpoint must not silently reuse stale controller joints
  // after the user manually jogs or resets the displayed robot.
  if(this.manualPoseChanged||(!this.pending&&this.expectedJoints?.some((value,i)=>Math.abs(value-this.getJoints()[i])>.001))){
   this.update({error:'模型姿态已手动改变，当前程序位置与模型不一致；请重新开始后再运行'});return
  }
  const epoch=++this.epoch,active=()=>epoch===this.epoch;this.running=true;this.update({busy:true,error:''})
  try{
   for(let count=0;count<(automation?100000:500)&&active();count++){
    if(this.pending){
     const pending=this.pending,motions=(pending.response.events||[]).filter(e=>e.type==='motion')
     if(motions.length>1)throw Error('接口返回多段运动，已停止；请重新开始并检查接口版本')
     let lookahead=null
     if(motions.length){
      const event={...motions[0],toolPose:motions[0].toolPose||pending.toolPose}
      const prepared=pending.prepared||prepareProgramMotion(event,this.getJoints(),this.frames(),{automatic:true})
      const motionSeconds=automation?Math.min(60,prepared.duration):0
      if(automation&&!single&&['yield','motion'].includes(pending.response.stop?.type)){
       const controller=new AbortController();this.requestController=controller
       lookahead={controller,task:this.prefetch(pending,signals,controller.signal,active,motionSeconds).then(value=>({value}),error=>({error}))}
      }
      this.update({current:event,status:'正在执行 '+event.instruction,toolSignals:clone(pending.response.state?.signals)||{}})
      try{await this.move({...prepared,context:event})}
      catch(error){lookahead?.controller.abort();throw error}
      if(!active())return
      this.elapsed=motionSeconds
      this.history.push({state:pending.before,joints:pending.joints});if(this.history.length>100)this.history.shift()
     }
     this.state=pending.response.state;this.expectedJoints=this.getJoints().slice();this.pending=null;this.solve=null
     const stop=pending.response.stop||{},last=motions.at(-1)
     this.update({cell:this.state?.cell?{...clone(this.state.cell),signals:clone(this.state.signals)}:null,toolSignals:clone(this.state?.signals)||{}})
     if(automation){const seconds=(pending.response.events||[]).filter(e=>e.type==='cell').reduce((n,e)=>n+(e.seconds||0),0);if(seconds)await this.wait(seconds,active);if(!active())return}
     this.update({current:stop.type==='motion'?last||stop:stop,stop,status:single&&stop.type==='limit'?'单步完成':stop.message||({ready:'已就绪','robot-solve':'正在计算下一段运动',motion:'运动段完成',yield:stop.reason==='next-motion'?'已到下一段运动前':'运动段完成',end:'例程已结束',wait:'等待模拟条件',blocked:'程序已阻塞',limit:'执行达到步数上限，可继续'}[stop.type]||'单步完成'),events:pending.response.events||[]})
     if(stop.type==='robot-solve'){
      this.solveRequest=stop.request;this.solve=solveProgramRequest(stop.request)
     }else if(stop.type==='end'){this.ended=true;return}
     else if(stop.type==='wait'&&automation&&stop.autoSeconds){await this.wait(stop.autoSeconds,active);if(!active())return;this.elapsed=stop.autoSeconds}
     else if(stop.type==='wait'&&automation&&stop.kind==='time'){await this.wait(stop.seconds||0,active);if(!active())return}
     else if(stop.type==='limit'&&automation&&!single){}
     else if(['wait','blocked','limit','pause'].includes(stop.type))return
     if(single&&motions.length)return
     if(lookahead){
      const next=await lookahead.task
      if(this.requestController===lookahead.controller)this.requestController=null
      if(!active())return
      if(next.error)throw next.error
      if(next.value){this.elapsed=0;this.pending=next.value;continue}
     }
    }
    const before=clone(this.state),joints=this.getJoints().slice()
    const controller=new AbortController();this.requestController=controller
    let response
    try{response=await this.request({routine,state:clone(this.state),signals,...(!this.state?{variables:inputs,parameters,automation,toolType}:{}),joints,solve:this.solve,elapsed:this.elapsed||0,maxSteps:single?1:2000,stopOnMotion:true},{signal:controller.signal})}
    finally{if(this.requestController===controller)this.requestController=null}
    if(!active())return
    this.elapsed=0;this.pending={before,joints,response,toolPose:this.solveRequest?.kind==='ik'?this.solveRequest.tool:null}
   }
   if(active())this.update({status:'本次预演达到请求上限，可继续'})
  }catch(error){if(active())this.update({error:error.response?.data?.msg||error.message})}
  finally{if(active()){this.running=false;this.update({busy:false})}}
 }
 async prefetch(pending,signals,signal,active,motionSeconds=0){
  const before=clone(pending.response.state),joints=(pending.response.events.find(e=>e.type==='motion').joints||pending.response.events.find(e=>e.type==='motion').to).slice()
  let state=clone(before),solve=null;const events=[]
  // Look ahead by one motion only. Predicted state and IO remain private until
  // the current rendered motion commits; stop cancels all speculative requests.
  for(let count=0;count<32&&active()&&!signal.aborted;count++){
   const response=await this.request({state,signals,joints,solve,elapsed:count===0?motionSeconds:0,maxSteps:2000,stopOnMotion:true},{signal})
   if(!active()||signal.aborted)return null
   events.push(...(response.events||[]))
   if(response.stop?.type==='robot-solve'){state=response.state;solve=solveProgramRequest(response.stop.request);continue}
   response.events=events
   const motion=events.find(e=>e.type==='motion')
   return {before,joints,response,...(motion?{prepared:prepareProgramMotion(motion,joints,this.frames(),{automatic:true})}:{})}
  }
  return null
 }
 async wait(seconds,active){
  let remaining=Math.max(0,Number(seconds)||0),last=Date.now();
  while(remaining>0&&active()){
   const rate=Math.max(0,Number(this.speed?.()??1)),delay=rate?Math.min(30,remaining/rate*1000):30
   // Sub-frame waits still advance interpreter time; they need no extra 30 ms
   // browser delay. Longer waits remain interruptible and follow live override.
   if(delay<4)return
   await new Promise(r=>setTimeout(r,delay));const now=Date.now();remaining-=(now-last)/1000*Math.max(0,Number(this.speed?.()??1));last=now
  }
 }
 async back(){
  if(this.running)return
  const previous=this.history.at(-1);if(!previous){this.update({status:'暂无已完成运动的检查点'});return}
  const epoch=++this.epoch;this.running=true;this.update({busy:true,error:''})
  try{
   await this.move({frames:[previous.joints],duration:.5})
   if(epoch!==this.epoch)return
   this.history.pop();this.state=previous.state;this.pending=null;this.solve=null;this.solveRequest=null;this.ended=false
   this.update({status:'已返回上一个预演检查点',stop:null,current:null})
  }catch(error){if(epoch===this.epoch)this.update({error:error.message})}
  finally{if(epoch===this.epoch){this.running=false;this.update({busy:false})}}
 }
}

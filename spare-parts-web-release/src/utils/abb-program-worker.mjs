import simulator from '../../../server/src/robot-sim.js'
import {solveProgramRequest} from './abb-program-motion.mjs'

let report=null
// Both runtimes execute the same source. The worker never opens a socket or
// writes a backup; it only interprets the report already authorized and read.
self.onmessage=({data:{id,type,body,report:nextReport}})=>{
 try{
  if(type==='load'){report=nextReport;self.postMessage({id,result:{ready:true}});return}
  if(!report)throw Error('尚未加载机器人备份')
  let result
  if(!body.state){
   const created=simulator.createSimulation(report,body)
   if(created.error)throw Error(created.error.message)
   result={state:created.state,events:[],stop:created.stop}
  }else{
   result=simulator.advanceSimulation(report,{...body,solveResult:body.solve})
   const events=[...(result.events||[])]
   for(let i=0;i<32&&result.stop?.type==='robot-solve';i++){
    const solve=solveProgramRequest(result.stop.request)
    result=simulator.advanceSimulation(report,{state:result.state,signals:body.signals,solveResult:solve,maxSteps:body.maxSteps,stopOnMotion:body.stopOnMotion,elapsed:0})
    events.push(...(result.events||[]))
   }
   result.events=events
  }
  self.postMessage({id,result})
 }catch(error){self.postMessage({id,error:{message:error.message,code:error.code||'offline-simulation'}})}
}

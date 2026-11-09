export function createLocalProgram({createWorker,fallback}){
 let report=null,worker=null,ready=null,failed=false,sequence=0,generation=0
 const pending=new Map()
 function shutdown(reason=new Error('离线计算已停止')){
  worker?.terminate();worker=null;ready=null
  for(const item of pending.values()){item.cleanup();item.reject(reason)}pending.clear()
 }
 function send(message,signal){
  return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(signal.reason||new Error('动作已停止'));return}
   const id=++sequence,onAbort=()=>shutdown(signal.reason||new Error('动作已停止'))
   const timer=setTimeout(()=>{failed=true;shutdown(new Error('离线计算没有响应'))},15000)
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort)}
   pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',onAbort,{once:true})
   try{worker.postMessage({id,...message})}catch(error){failed=true;shutdown(error)}
  })
 }
 async function start(){
  if(ready)return ready
  const currentGeneration=generation
  try{
   worker=createWorker()
   worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;pending.delete(data.id);item.cleanup();if(data.error){const error=Error(data.error.message);error.code=data.error.code;item.reject(error)}else item.resolve(data.result)}
   worker.onerror=()=>{failed=true;shutdown(new Error('无法启动离线计算'))}
   ready=send({type:'load',report});await ready
  }catch(error){if(currentGeneration===generation){failed=true;shutdown(error)}throw error}
 }
 return {
  load(value){generation++;shutdown();report=value;failed=false},
  async request(body,{signal}={}){
   if(failed||!report)return fallback(body,{signal})
   try{await start();if(signal?.aborted)throw signal.reason||new Error('动作已停止');return await send({type:'advance',body},signal)}
   catch(error){if(signal?.aborted||!failed)throw error;return fallback(body,{signal})}
  },
  dispose(){generation++;shutdown();report=null}
 }
}

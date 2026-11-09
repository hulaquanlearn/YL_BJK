// Keep the footer readable without delaying the interpreter, motion or live IO.
// Publish the heading and its source location together; retain only the latest
// pending snapshot, so the display never plays an old queue after stopping.
export function createProgramDisplay({publish,interval=1000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}){
 let timer=null,pending=null,last=-Infinity,wasRunning=false,disposed=false
 function clear(){if(timer!==null)cancel(timer);timer=null;pending=null}
 function show(value){last=now();publish(value)}
 function push({status='',current=null,running=false}){
  if(disposed)return
  const started=running&&!wasRunning;wasRunning=running
  const urgent=!running||/^已停止|程序已阻塞|主程序已退出/.test(status)
  if(urgent){clear();show({status,current});return}
  // Between adjacent moves these are bookkeeping, not a new operator state.
  if(/^(运动段完成|已到下一段运动前|正在计算下一段运动)$/.test(status))return
  pending={status:started&&!/^正在执行|等待/.test(status)?'程序运行中':status,current}
  if(started||now()-last>=interval){const next=pending;clear();show(next);return}
  if(timer===null)timer=schedule(()=>{timer=null;if(disposed||!pending)return;const next=pending;pending=null;show(next)},Math.max(0,interval-(now()-last)))
 }
 return {push,dispose(){disposed=true;clear()}}
}

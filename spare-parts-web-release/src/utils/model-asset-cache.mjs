const aborted=()=>new DOMException('模型加载已取消','AbortError')
// Memory only, scoped to the current login. Never persist protected assets.
export function createModelAssetCache({fetchImpl=(...args)=>fetch(...args),session=()=>'',maxBytes=32*1024*1024}={}){
 const ready=new Map(),pending=new Map();let bytes=0,owner=session()
 function clear(){for(const task of pending.values())task.controller.abort();pending.clear();ready.clear();bytes=0;owner=session()}
 function read(url,{signal,onProgress}={}){
  if(owner!==session())clear()
  if(signal?.aborted)return Promise.reject(aborted())
  const cached=ready.get(url)
  if(cached){ready.delete(url);ready.set(url,cached);onProgress?.({loaded:cached.byteLength,total:cached.byteLength,phase:'cached'});return Promise.resolve(cached.slice(0))}
  let task=pending.get(url)
  if(!task){
   task={controller:new AbortController(),listeners:new Set(),progress:{loaded:0,total:0,phase:'download'}};pending.set(url,task)
   task.promise=(async()=>{
    const response=await fetchImpl(url,{signal:task.controller.signal,credentials:'same-origin'})
    if(!response.ok)throw Error('模型资源加载失败（'+response.status+'）')
    const total=Number(response.headers.get('X-Model-Byte-Length')||(!response.headers.get('Content-Encoding')&&response.headers.get('Content-Length')))||0,chunks=[];let loaded=0
    const progress=()=>{task.progress={loaded,total,phase:'download'};for(const entry of task.listeners)entry.onProgress?.(task.progress)}
    if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;progress()}}
    else {const value=new Uint8Array(await response.arrayBuffer());chunks.push(value);loaded=value.length;progress()}
    if(task.controller.signal.aborted||owner!==session())throw aborted()
    const buffer=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
    if(loaded<=maxBytes){while(bytes+loaded>maxBytes&&ready.size){const [key,value]=ready.entries().next().value;ready.delete(key);bytes-=value.byteLength}ready.set(url,buffer.buffer);bytes+=loaded}
    return buffer.buffer
   })().finally(()=>{if(pending.get(url)===task)pending.delete(url)})
  }
  return new Promise((resolve,reject)=>{
   const entry={onProgress},finish=()=>{signal?.removeEventListener('abort',cancel);task.listeners.delete(entry)},cancel=()=>{finish();reject(aborted());if(!task.listeners.size){if(pending.get(url)===task)pending.delete(url);task.controller.abort()}}
   task.listeners.add(entry);signal?.addEventListener('abort',cancel,{once:true});onProgress?.(task.progress)
   task.promise.then(buffer=>{if(signal?.aborted)return;finish();resolve(buffer.slice(0))},error=>{finish();reject(error)})
  })
 }
 return {read,clear}
}

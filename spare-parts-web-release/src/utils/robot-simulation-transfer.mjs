// The opaque interpreter state is large; compress uploads as well as downloads.
// Express already inflates gzip JSON, so older clients keep the same contract.
export async function simulationTransfer(data,{signal,Compression=globalThis.CompressionStream}={}){
 const check=()=>{if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError')}
 check()
 if(!Compression)return {data}
 const json=JSON.stringify(data)
 if(json.length<16384)return {data}
 try{
  const stream=new Blob([json]).stream().pipeThrough(new Compression('gzip'),{signal})
  const compressed=await new Response(stream).arrayBuffer();check()
  if(compressed.byteLength>=json.length)return {data}
  return {data:compressed,headers:{'Content-Type':'application/json','Content-Encoding':'gzip'}}
 }catch(error){check();return {data}}
}

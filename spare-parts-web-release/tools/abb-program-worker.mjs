import path from 'node:path'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

export const programWorkerEntry=fileURLToPath(new URL('../src/utils/abb-program-worker.mjs',import.meta.url))
export async function bundleProgramWorker(){
 const result=await build({entryPoints:[programWorkerEntry],bundle:true,platform:'browser',format:'esm',target:'chrome80',write:false,minify:true,metafile:true})
 return {code:result.outputFiles[0].text,inputs:Object.keys(result.metafile.inputs).map(p=>path.resolve(p))}
}
export function abbProgramWorker(){
 let compiled=null,reference=null,development=false
 return {name:'abb-program-worker',
  configResolved(config){development=config.command==='serve'},
  resolveId(id){if(id==='virtual:abb-program-worker-url')return '\0abb-program-worker-url'},
  async load(id){
   if(id!=='\0abb-program-worker-url')return
   if(development)return 'export default "/__abb-program-worker.js"'
   compiled=await bundleProgramWorker();for(const input of compiled.inputs)this.addWatchFile(input)
   reference=this.emitFile({type:'asset',name:'abb-program-worker.js',source:compiled.code})
   return `export default import.meta.ROLLUP_FILE_URL_${reference}`
  },
  configureServer(server){
   let cache=null
   server.middlewares.use('/__abb-program-worker.js',async(_req,res,next)=>{
    try{
     if(!cache||await Promise.all(cache.inputs.map(async p=>(await fs.stat(p)).mtimeMs)).then(times=>times.some((t,i)=>t!==cache.times[i]))){
      cache=await bundleProgramWorker();cache.times=await Promise.all(cache.inputs.map(async p=>(await fs.stat(p)).mtimeMs));server.watcher.add(cache.inputs)
     }
     res.setHeader('Content-Type','text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(cache.code)
    }catch(error){next(error)}
   })
  }
 }
}

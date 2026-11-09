import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'
import {getToken} from '../auth.js'
import {createModelAssetCache} from './model-asset-cache.mjs'
const cache=createModelAssetCache({session:()=>typeof localStorage==='undefined'?'':getToken()})
if(typeof window!=='undefined')window.addEventListener('auth-changed',()=>cache.clear())
const compressed=new Set(['irb6700-150-320','tool-640','tool-700','flexpendant'])
// Old WebViews may lack the CSP WebAssembly allowance. Keep them working with
// the original CAD rather than widening script permissions to unsafe-eval.
const decoderReady=MeshoptDecoder.supported?MeshoptDecoder.ready.then(()=>true,()=>false):Promise.resolve(false)
async function modelTarget(url){
 const match=url.match(/\/([^/?]+)\.glb(?=\?|$)/)
 return compressed.has(match?.[1])&&await decoderReady?url.replace('.glb','.meshopt.glb'):url
}
export async function preloadAbbModel(url,{signal}={}){
 await cache.read(await modelTarget(url),{signal})
}
export async function loadAbbModel(url,{signal,onProgress}={}){
 const target=await modelTarget(url)
 const bytes=await cache.read(target,{signal,onProgress});if(signal?.aborted)throw new DOMException('加载取消','AbortError')
 onProgress?.({phase:'prepare'});const result=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,'');return result.scene
}
export function modelLoadingText(progress,label){
 if(progress?.phase==='prepare'||progress?.phase==='cached')return '正在装配'+label+'…'
 const size=value=>(value/1048576).toFixed(1)+' MB'
 return progress?.total?label+'下载 '+Math.min(100,Math.round(progress.loaded/progress.total*100))+'%':progress?.loaded?label+'已下载 '+size(progress.loaded):'正在连接'+label+'…'
}

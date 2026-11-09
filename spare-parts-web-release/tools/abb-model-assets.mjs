import fs from 'node:fs'
import path from 'node:path'
import {gzipSync} from 'node:zlib'
import {MeshoptEncoder} from 'meshoptimizer'

export const compressedRobotModels=['irb6700-150-320','tool-640','tool-700','flexpendant']
// Lossless buffer codec only: retain vertex/index order, UVs, node extras,
// textures and CAD material IDs used by the hardware and mechanism picking.
export async function encodeModel(bytes){
 await MeshoptEncoder.ready
 const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),binary=bytes.subarray(28+jsonLength),chunks=[]
 let length=0
 const append=data=>{const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const offset=length;chunks.push(Buffer.from(data));length+=data.length;return offset}
 const widths={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}
 for(let i=0;i<gltf.bufferViews.length;i++){
  const view=gltf.bufferViews[i],source=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),accessors=gltf.accessors.filter(a=>a.bufferView===i)
  if(!accessors.length){view.buffer=0;view.byteOffset=append(source);continue}
  const first=accessors[0],stride=view.byteStride||widths[first.componentType]*sizes[first.type],count=view.byteLength/stride
  if(!Number.isInteger(count)||accessors.some(a=>a.sparse)||![34962,34963].includes(view.target))throw Error('Unexpected CAD buffer layout')
  const mode=view.target===34963?'INDICES':'ATTRIBUTES',encoded=MeshoptEncoder.encodeGltfBuffer(source,count,stride,mode,0),byteOffset=append(encoded)
  view.buffer=1;view.extensions={...view.extensions,EXT_meshopt_compression:{buffer:0,byteOffset,byteLength:encoded.length,byteStride:stride,count,mode,filter:'NONE'}}
 }
 const virtualLength=gltf.buffers[0].byteLength;gltf.buffers=[{byteLength:length},{byteLength:virtualLength,extensions:{EXT_meshopt_compression:{fallback:true}}}]
 gltf.extensionsUsed=[...new Set([...(gltf.extensionsUsed||[]),'EXT_meshopt_compression'])];gltf.extensionsRequired=[...new Set([...(gltf.extensionsRequired||[]),'EXT_meshopt_compression'])]
 const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((-json.length)&3,32),bin=Buffer.concat(chunks),binPad=Buffer.alloc((-bin.length)&3),header=Buffer.alloc(20),binHeader=Buffer.alloc(8)
 header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+jsonPad.length+8+bin.length+binPad.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length+binPad.length);binHeader.writeUInt32LE(0x004e4942,4)
 return Buffer.concat([header,json,jsonPad,binHeader,bin,binPad])
}

function modelEncoder(root){
 const cache=new Map()
 const asset=async name=>{const file=path.join(root,'public/models/abb-irb6700',name+'.glb'),stat=fs.statSync(file),key=name+':'+stat.mtimeMs+':'+stat.size;if(!cache.has(key)){for(const previous of cache.keys())if(previous.startsWith(name+':'))cache.delete(previous);cache.set(key,encodeModel(fs.readFileSync(file)))}return cache.get(key)}
 return asset
}
export function abbDevelopmentAssets(root){
 const asset=modelEncoder(root)
 return async(req,res,next)=>{const match=(req.url||'').match(/^\/models\/abb-irb6700\/([\w-]+)\.meshopt\.glb(?:\?|$)/);if(!match||!compressedRobotModels.includes(match[1]))return next();try{res.setHeader('Content-Type','model/gltf-binary');res.setHeader('Cache-Control','private, no-store');res.end(await asset(match[1]))}catch(error){next(error)}}
}
export function abbModelAssets(){
 let root,asset
 return {name:'lossless-abb-model-assets',configResolved(config){root=config.root;asset=modelEncoder(root)},async generateBundle(){for(const name of compressedRobotModels){const bytes=await asset(name),fileName='models/abb-irb6700/'+name+'.meshopt.glb';this.emitFile({type:'asset',fileName,source:bytes});this.emitFile({type:'asset',fileName:fileName+'.gz',source:gzipSync(bytes,{level:9})})}},configureServer(server){server.middlewares.use(abbDevelopmentAssets(root))}}
}

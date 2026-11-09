import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js'
import {encodeModel,compressedRobotModels} from '../tools/abb-model-assets.mjs'
const parts=bytes=>{const n=bytes.readUInt32LE(12);return {json:JSON.parse(bytes.subarray(20,20+n)),binary:bytes.subarray(28+n)}}
test('delivery compression preserves every CAD buffer byte, material, node and embedded texture',async()=>{
 await MeshoptDecoder.ready
 for(const name of compressedRobotModels){
  const raw=fs.readFileSync(new URL('../public/models/abb-irb6700/'+name+'.glb',import.meta.url)),before=parts(raw),encoded=await encodeModel(raw),after=parts(encoded)
  assert.ok(encoded.length<raw.length*.60,name+' delivery size')
  for(const field of ['nodes','meshes','materials','accessors','images','textures'])assert.equal(JSON.stringify(after.json[field]),JSON.stringify(before.json[field]),name+' '+field)
  for(let i=0;i<before.json.bufferViews.length;i++){
   const source=before.json.bufferViews[i],view=after.json.bufferViews[i],expected=before.binary.subarray(source.byteOffset||0,(source.byteOffset||0)+source.byteLength),ext=view.extensions?.EXT_meshopt_compression
   if(ext){const decoded=new Uint8Array(view.byteLength);MeshoptDecoder.decodeGltfBuffer(decoded,ext.count,ext.byteStride,after.binary.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);assert.equal(Buffer.compare(Buffer.from(decoded),expected),0,name+' buffer '+i)}
   else assert.deepEqual(after.binary.subarray(view.byteOffset,view.byteOffset+view.byteLength),expected,name+' image '+i)
  }
 }
})

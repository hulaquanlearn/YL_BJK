import test from 'node:test'
import assert from 'node:assert/strict'
import {preloadAbbModel,loadAbbModel} from '../src/utils/abb-model-loader.mjs'

test('background pendant preloading and opening share the authenticated asset cache',async()=>{
 const original=globalThis.fetch;let requests=0
 const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[]})),padding=(4-json.length%4)%4,bytes=Buffer.alloc(20+json.length+padding,32);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length+padding,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20)
 globalThis.fetch=async(_url,options)=>{requests++;assert.equal(options.credentials,'same-origin');return new Response(bytes)}
 try{const url='/models/abb-irb6700/flexpendant.glb?preload-unit';await preloadAbbModel(url);const scene=await loadAbbModel(url);assert.equal(scene.isObject3D,true);assert.equal(requests,1)}finally{globalThis.fetch=original}
})

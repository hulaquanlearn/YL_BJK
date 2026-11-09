import test from 'node:test'
import assert from 'node:assert/strict'
import {createModelAssetCache} from '../src/utils/model-asset-cache.mjs'
test('concurrent readers share a download, one cancelled consumer does not cancel another, ready buffers are isolated',async()=>{
 let requests=0,release;const gate=new Promise(r=>release=r),progress=[]
 const cache=createModelAssetCache({fetchImpl:async()=>{requests++;await gate;return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Length':'3'}})}}),abort=new AbortController()
 const first=cache.read('/one',{signal:abort.signal}),rejected=assert.rejects(first,{name:'AbortError'}),second=cache.read('/one',{onProgress:p=>progress.push(p)})
 abort.abort();release();await rejected;const b=await second;new Uint8Array(b)[0]=99
 assert.deepEqual([...new Uint8Array(await cache.read('/one'))],[1,2,3]);assert.equal(requests,1);assert.equal(progress.at(-1).loaded,3)
})
test('aborted or failed transfers retry, login change and clear discard cached private bytes',async()=>{
 let user='A',requests=0;const cache=createModelAssetCache({session:()=>user,fetchImpl:async()=>{requests++;return requests===1?new Response('',{status:503}):new Response('safe')}})
 await assert.rejects(cache.read('/model'));await cache.read('/model');await cache.read('/model');assert.equal(requests,2)
 user='B';await cache.read('/model');assert.equal(requests,3);cache.clear();await cache.read('/model');assert.equal(requests,4)
 const abort=new AbortController();abort.abort();await assert.rejects(cache.read('/model',{signal:abort.signal}),{name:'AbortError'})
})
test('LRU budget evicts old transfers without retaining oversized models',async()=>{
 let requests=0;const cache=createModelAssetCache({maxBytes:4,fetchImpl:async()=>{requests++;return new Response('abc')}})
 await cache.read('/one');await cache.read('/two');await cache.read('/two');assert.equal(requests,2);await cache.read('/one');assert.equal(requests,3)
})

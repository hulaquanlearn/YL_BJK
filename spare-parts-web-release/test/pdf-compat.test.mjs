import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

test('older WebView clone compatibility preserves cycles, typed arrays and transferable buffers',()=>{
 const script=`
  import assert from 'node:assert/strict';
  delete globalThis.structuredClone;
  const {ensurePdfCompatibility}=await import('./src/utils/pdf-compat.mjs');
  await Promise.all([ensurePdfCompatibility(),ensurePdfCompatibility()]);
  const value={bytes:new Uint8Array([1,2,3]),map:new Map([['part',42]]),date:new Date(1234)};value.self=value;
  const copy=structuredClone(value,null);
  assert.notEqual(copy,value);assert.equal(copy.self,copy);assert.deepEqual([...copy.bytes],[1,2,3]);assert.equal(copy.map.get('part'),42);assert.equal(+copy.date,1234);
  const buffer=new Uint8Array([4,5]).buffer;
  const moved=structuredClone({buffer},{transfer:[buffer]});
  assert.equal(buffer.byteLength,0);assert.deepEqual([...new Uint8Array(moved.buffer)],[4,5]);
  console.log('clone-compatible');
 `
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000})
 assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/clone-compatible/)
})

test('a modern WebView keeps its existing native structuredClone',async()=>{
 const native=globalThis.structuredClone,{ensurePdfCompatibility}=await import('../src/utils/pdf-compat.mjs')
 await ensurePdfCompatibility();assert.equal(globalThis.structuredClone,native)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {collectParts} from '../src/utils/collect-parts.mjs'
test('selectors load the complete scope beyond the 200-item API limit',async()=>{
 const calls=[],all=Array.from({length:541},(_,i)=>({_id:i+1}))
 const rows=await collectParts(async params=>{calls.push(params);return {data:all.slice((params.page-1)*200,params.page*200),total:541}},{workshopCode:'qu_making',shelf:1})
 assert.equal(rows.length,541);assert.equal(rows[540]._id,541);assert.deepEqual(calls.map(c=>c.page),[1,2,3]);assert.ok(calls.every(c=>c.shelf===1&&c.workshopCode==='qu_making'))
})
test('scope changes cancel collection and stale pages cannot overwrite current choices',async()=>{
 let current=true,calls=0
 const rows=await collectParts(async()=>{calls++;current=false;return {data:[{_id:1}],total:300}},{},()=>current)
 assert.equal(rows,null);assert.equal(calls,1)
})
test('incomplete and repeated pages produce an error instead of silently omitting choices',async()=>{
 await assert.rejects(collectParts(async()=>({data:[],total:250}),{}),/未完整加载/)
 await assert.rejects(collectParts(async()=>({data:[{_id:1}],total:250}),{}),/未完整加载/)
 assert.deepEqual(await collectParts(async()=>({data:[],total:0}),{}),[])
})

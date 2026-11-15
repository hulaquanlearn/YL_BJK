import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {openChannel} from './agent-channel.mjs'
const parent=fileURLToPath(new URL('../.local/agent-channel-tests/',import.meta.url))
async function fixture(){await mkdir(parent,{recursive:true});return openChannel(await mkdtemp(path.join(parent,'run-')))}
test('separate inboxes, explicit idempotent acknowledgement and reverse reply',async()=>{
 const c=await fixture(),m=await c.send({from:'codex',to:'dsh',task:'test-1',subject:'ping',body:'hello'})
 assert.equal((await c.list('codex')).length,0);assert.equal((await c.list('dsh')).length,1)
 const a=await c.ack('dsh',m.id,'received'),again=await c.ack('dsh',m.id,'again');assert.deepEqual(again,a)
 assert.equal((await c.list('dsh')).length,0);assert.equal((await c.list('dsh',{all:true})).length,1)
 const r=await c.send({from:'dsh',to:'codex',task:'test-1',subject:'pong',body:'reply',replyTo:m.id})
 assert.equal((await c.list('codex'))[0].replyTo,m.id);await c.ack('codex',r.id)
 assert.deepEqual((await c.status()).pending,{codex:0,dsh:0})
})
test('concurrent writers preserve all messages and isolate tasks',async()=>{
 const c=await fixture();await Promise.all(Array.from({length:24},(_,i)=>c.send({from:'codex',to:'dsh',task:i%2?'a':'b',subject:'item '+i,body:'text'})))
 const all=await c.list('dsh');assert.equal(all.length,24);assert.equal(new Set(all.map(m=>m.id)).size,24);assert.equal((await c.list('dsh',{task:'a'})).length,12)
})
test('invalid identities, traversal and unrelated replies are rejected',async()=>{
 const c=await fixture(),p={from:'codex',to:'dsh',task:'a',subject:'ping',body:'hello'}
 await assert.rejects(c.send({...p,to:'another-project'}));await assert.rejects(c.send({...p,task:'../bad'}));await assert.rejects(c.ack('dsh','../bad'))
 const m=await c.send(p);await assert.rejects(c.send({...p,from:'dsh',to:'codex',task:'different',replyTo:m.id}))
 await assert.rejects(c.send({...p,from:'dsh',to:'codex',body:'x'.repeat(65537)}))
})
test('wait sees a new message, times out and rejects unbounded waits',async()=>{
 const c=await fixture(),waiting=c.wait('codex',{task:'a',timeoutMs:2000})
 await c.send({from:'dsh',to:'codex',task:'a',subject:'ready',body:'reply'})
 assert.equal((await waiting).length,1);assert.deepEqual(await c.wait('dsh',{timeoutMs:0}),[])
 await assert.rejects(c.wait('dsh',{timeoutMs:60000}))
})
test('another project marker is rejected',async()=>{
 const c=await fixture(),s=await c.status();await writeFile(path.join(s.home,'channel.json'),JSON.stringify({schema:1,workspace:'wrong',projectId:'wrong'}))
 await assert.rejects(openChannel(s.workspace))
})

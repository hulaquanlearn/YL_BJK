import test from 'node:test'
import assert from 'node:assert/strict'
import {gunzipSync} from 'node:zlib'
import {simulationTransfer} from '../src/utils/robot-simulation-transfer.mjs'

test('large simulation uploads preserve every state value and compress without mutating the opaque state',async()=>{
 const data={state:{globals:{values:Array.from({length:3000},(_,i)=>[i,i/3,'机器人甑锅'])},solveCache:{},robotJoints:[0,1,2,3,4,5]},elapsed:.03},before=structuredClone(data)
 const wire=await simulationTransfer(data);assert.equal(wire.headers['Content-Encoding'],'gzip');assert.ok(wire.data.byteLength<JSON.stringify(data).length*.4)
 assert.deepEqual(JSON.parse(gunzipSync(wire.data).toString()),data);assert.deepEqual(data,before)
})
test('small bodies and browsers lacking compression retain the existing JSON contract',async()=>{
 const small={routine:'main'},large={state:'x'.repeat(20000)};assert.deepEqual(await simulationTransfer(small),{data:small});assert.deepEqual(await simulationTransfer(large,{Compression:null}),{data:large})
 class Unsupported{constructor(){throw Error('not supported')}}assert.deepEqual(await simulationTransfer(large,{Compression:Unsupported}),{data:large})
})
test('cancelled compression does not fall back to sending a stale request',async()=>{
 const controller=new AbortController();controller.abort(new Error('session stopped'));await assert.rejects(simulationTransfer({state:'x'.repeat(20000)},{signal:controller.signal}),/session stopped/)
 const during=new AbortController();class Stop{constructor(){during.abort(new Error('stopped during compression'));throw Error('failed')}}await assert.rejects(simulationTransfer({state:'x'.repeat(20000)},{signal:during.signal,Compression:Stop}),/stopped during compression/)
})

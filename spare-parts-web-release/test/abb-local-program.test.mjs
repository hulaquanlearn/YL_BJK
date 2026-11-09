import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {bundleProgramWorker} from '../tools/abb-program-worker.mjs'
import {createLocalProgram} from '../src/utils/abb-local-program.mjs'
const require=createRequire(import.meta.url),{parseRoutines}=require('../../server/src/robot-backup')

test('the browser bundle shares interpreter and solver source, completes FK/IK locally and retains exact wait checkpoints',async()=>{
 const bundle=await bundleProgramWorker();assert.ok(bundle.inputs.some(p=>p.replaceAll('\\','/').endsWith('server/src/robot-sim.js')));assert.ok(bundle.inputs.some(p=>p.endsWith('abb-kinematics-data.mjs')));assert.ok(!bundle.inputs.some(p=>p.endsWith('robot-backup.js')),'no ZIP, filesystem or configuration modules enter the browser bundle')
 assert.ok(!bundle.inputs.some(p=>p.endsWith('robot-basemod-legacy.js')),'private author source is delivered only in authenticated backup responses')
 assert.ok(!bundle.code.includes('PROC guodu('),'no private RAPID routine body in a public worker')
 const responses=[],self={postMessage:value=>responses.push(structuredClone(value))};vm.runInNewContext(bundle.code,{self,TextEncoder},{timeout:5000})
 const text='MODULE Local\nVAR robtarget p;\nPROC main()\np:=CRobT();\nMoveL p,v100,z20,tool0;\nWaitTime 0.01;\nENDPROC\nENDMODULE',report={sha256:'local-test',files:[{id:'file-1',name:'Local.mod',task:'T_ROB1',kind:'program',readable:true,text,routines:parseRoutines(text.split('\n'))}],signals:[]}
 const send=(type,extra)=>{self.onmessage({data:{id:responses.length+1,type,...structuredClone(extra)}});const response=responses.at(-1);assert.equal(response.error,undefined,response.error?.message);return response.result}
 send('load',{report});let result=send('advance',{body:{routine:'main',joints:[0,0,0,0,90,0]}});result=send('advance',{body:{state:result.state,stopOnMotion:true,maxSteps:2000}})
 assert.equal(result.events.filter(e=>e.type==='motion').length,1);assert.notEqual(result.stop.type,'robot-solve','FK/IK do not require network round trips')
 result=send('advance',{body:{state:result.state,stopOnMotion:true,maxSteps:2000}});assert.equal(result.stop.type,'wait');assert.equal(result.stop.seconds,.01)
 result=send('advance',{body:{state:result.state,stopOnMotion:true,maxSteps:2000}});assert.equal(result.stop.type,'end');assert.equal(result.state.virtualTime,.01)
})

function setup({unsupported=false,sourceError=false}={}){
 let fallbackCalls=0,terminated=0;const workers=[]
 const bridge=createLocalProgram({createWorker(){if(unsupported)throw Error('Worker unavailable');const worker={terminate(){terminated++},postMessage(message){if(message.type==='load')queueMicrotask(()=>worker.onmessage({data:{id:message.id,result:{ready:true}}}));else if(sourceError)queueMicrotask(()=>worker.onmessage({data:{id:message.id,error:{code:'state-stale',message:'wrong source'}}}));else worker.last=message}};workers.push(worker);return worker},fallback:async()=>{fallbackCalls++;return {remote:true}}})
 bridge.load({sha256:'report'});return {bridge,workers,get fallbackCalls(){return fallbackCalls},get terminated(){return terminated}}
}
test('aborting a local request terminates calculation; resume recreates it without falling back or accepting stale results',async()=>{
 const f=setup(),abort=new AbortController(),request=f.bridge.request({state:{pc:1}},{signal:abort.signal});await new Promise(resolve=>setTimeout(resolve,0));abort.abort(Error('stopped'));await assert.rejects(request,/stopped/);assert.equal(f.terminated,1);assert.equal(f.fallbackCalls,0)
 const resumed=f.bridge.request({state:{pc:1}});await new Promise(resolve=>setTimeout(resolve,0));const worker=f.workers.at(-1);worker.onmessage({data:{id:worker.last.id,result:{state:{pc:2}}}});assert.deepEqual(await resumed,{state:{pc:2}});f.bridge.dispose()
})
test('unavailable workers use the authorized API, but source errors do not silently start a second execution',async()=>{
 const unsupported=setup({unsupported:true});assert.deepEqual(await unsupported.bridge.request({}),{remote:true});assert.equal(unsupported.fallbackCalls,1);unsupported.bridge.dispose()
 const invalid=setup({sourceError:true});await assert.rejects(invalid.bridge.request({}),/wrong source/);assert.equal(invalid.fallbackCalls,0);invalid.bridge.dispose()
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {fileSize} from '../src/utils/file-display.mjs'

function subject({preview=async()=>({id:'preview-1',kind:'ai_logs',itemCount:1,totalBytes:64}),confirm=async()=>{},selectionDisabled=false}={}){
 const calls=[];let unmount
 const script=fs.readFileSync(new URL('../src/components/DataCatalog.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},onBeforeUnmount:fn=>unmount=fn,fileSize,
  defineProps:()=>({legacySummary:[],selectionDisabled}),defineEmits:()=> (...args)=>calls.push({emit:args}),
  ElMessageBox:{confirm:async()=>{calls.push({confirm:true});return confirm()}},
  office:{post:async(url,body)=>{calls.push({method:'POST',url,body:JSON.parse(JSON.stringify(body))});return {data:url.endsWith('/cleanup-preview')?await preview():{releasedBytes:64}}},
   delete:async url=>{calls.push({method:'DELETE',url});return {data:{released:true}}},
   get:async url=>{calls.push({method:'GET',url});return {data:url.endsWith('/audit')?[]:{categories:[]}}}}
 })
 vm.runInContext(script+'\nthis.state={cleanup,select,selected,busy,error,message};',context);context.state.selected.value='ai_logs'
 return {state:context.state,calls,unmount:()=>unmount()}
}
test('cancelling the cleanup confirmation releases its preview without a cleanup request',async()=>{
 const app=subject({confirm:async()=>{throw 'cancel'}});await app.state.cleanup()
 assert.ok(app.calls.some(c=>c.method==='DELETE'&&c.url==='/data-management/cleanup-preview/preview-1'))
 assert.equal(app.calls.filter(c=>c.url==='/data-management/cleanup').length,0);assert.equal(app.state.busy.value,false)
})
test('empty previews never start cleanup and a legacy allocated empty token is released',async()=>{
 for(const id of [null,'legacy-empty']){const app=subject({preview:async()=>({id,itemCount:0,totalBytes:0})});await app.state.cleanup()
  assert.equal(app.calls.filter(c=>c.confirm||c.url==='/data-management/cleanup').length,0);assert.equal(app.calls.filter(c=>c.method==='DELETE').length,id?1:0);assert.match(app.state.message.value,/没有符合条件/)
 }
})
test('a response arriving after unmount is released without opening a confirmation or deleting files',async()=>{
 let finish;const app=subject({preview:()=>new Promise(r=>finish=r)});const pending=app.state.cleanup();app.unmount()
 finish({id:'late-preview',itemCount:1,totalBytes:64,kind:'ai_logs'});await pending
 assert.equal(app.calls.filter(c=>c.confirm||c.url==='/data-management/cleanup').length,0);assert.ok(app.calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/late-preview')))
})
test('leaving during confirmation prevents a later confirm from executing the reviewed cleanup',async()=>{
 let finish,ready;const entered=new Promise(r=>ready=r),app=subject({confirm:()=>{ready();return new Promise(r=>finish=r)}})
 const pending=app.state.cleanup();await entered;app.unmount();finish();await pending
 assert.equal(app.calls.filter(c=>c.url==='/data-management/cleanup').length,0);assert.ok(app.calls.some(c=>c.method==='DELETE'))
})
test('confirmed cleanup submits only the reviewed preview and disabled legacy operations freeze category changes',async()=>{
 const app=subject();await app.state.cleanup();assert.deepEqual(app.calls.find(c=>c.url==='/data-management/cleanup').body,{previewId:'preview-1'})
 const locked=subject({selectionDisabled:true});locked.state.select('raw_duty_photo');await locked.state.cleanup();assert.equal(locked.state.selected.value,'ai_logs');assert.equal(locked.calls.length,0)
})

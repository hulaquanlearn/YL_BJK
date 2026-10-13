import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {fileSize} from '../src/utils/attendance-display.mjs'

const plain=value=>JSON.parse(JSON.stringify(value))
const reviewedItems=[
  {kind:'work_photo',id:71,revision:5,title:'工作截图',bytes:1024,fileCount:1,unreviewedIds:[99]},
  {kind:'work_photo',id:72,revision:8,title:'另一页截图',bytes:3072,fileCount:1,unreviewedIds:[100]}
]
const listData={items:[],summary:[{kind:'inspection',bytes:1024,itemCount:1,fileCount:1},{kind:'attendance',bytes:2048,itemCount:2,fileCount:4},{kind:'work_photo',bytes:512,itemCount:1,fileCount:1},{kind:'task_file',bytes:256,itemCount:1,fileCount:1}],total:0}

function storage({preview={items:reviewedItems.map(item=>({...item,kind:'inspection'})),itemCount:2,totalBytes:4096},confirm=async()=>{}}={}) {
  const calls=[],confirmCalls=[]
  const source=fs.readFileSync(new URL('../src/views/WorkStorage.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
  const context=vm.createContext({
    ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},fileSize,
    ElMessageBox:{confirm:async(...args)=>{confirmCalls.push(args);return confirm(...args)}},
    office:{
      get:async(url,options)=>{
        calls.push({method:'GET',url,params:plain(options?.params || {})})
        if(url==='/work-storage/cleanup-preview')return {data:preview}
        if(url==='/work-storage/audit')return {data:[{id:1,title:'审计记录',released_bytes:4096}]}
        if(url==='/work-storage')return {data:listData}
        throw new Error(`Unexpected GET ${url}`)
      },
      post:async(url,body)=>{calls.push({method:'POST',url,body:plain(body)});return {data:{itemCount:2,releasedBytes:4096}}},
      delete:async()=>{throw new Error('Unexpected individual delete')},
      patch:async()=>{throw new Error('Unexpected retention write')}
    }
  })
  vm.runInContext(source+'\nthis.storage={featureKey,kind,cutoff,page,items,summary,total,busy,error,message,audit,groups,selectedGroup,retentionOpen,selectFunction,load,setRetention,cleanupFunction};',context)
  const state=context.storage;state.cutoff.value='2026-01-01'
  return {state,calls,confirmCalls}
}

test('function selection limits the secondary types and sends the selected function scope',async()=>{
  const {state,calls}=storage()
  assert.equal(state.featureKey.value,'inspection');assert.equal(state.kind.value,'inspection')
  assert.deepEqual(plain(state.selectedGroup.value.kinds),['inspection'])
  state.page.value=7;await state.selectFunction('qu_making')
  assert.deepEqual(plain(state.selectedGroup.value.kinds),['work_photo','task_file'])
  assert.equal(state.kind.value,'');assert.equal(state.page.value,1)
  assert.deepEqual(calls.at(-1).params,{function:'qu_making',kind:'',cutoff:'2026-01-01',page:1})
  state.kind.value='task_file';await state.load()
  assert.deepEqual(calls.at(-1).params,{function:'qu_making',kind:'task_file',cutoff:'2026-01-01',page:1})
  await state.selectFunction('attendance')
  assert.deepEqual(plain(state.selectedGroup.value.kinds),['attendance'])
  assert.equal(state.kind.value,'attendance')
  assert.deepEqual(calls.at(-1).params,{function:'attendance',kind:'attendance',cutoff:'2026-01-01',page:1})
  assert.deepEqual(plain(state.groups.value).map(group=>[group.key,group.count,group.bytes]),[['inspection',1,1024],['attendance',2,2048],['qu_making',2,768]],'function cards keep the global per-kind summary')
})

test('batch cleanup confirms all-page scope and posts only the exact reviewed revisions',async()=>{
  const preview={items:reviewedItems,itemCount:2,totalBytes:4096,unreviewedItems:[{kind:'attendance',id:99,revision:1}]}
  const {state,calls,confirmCalls}=storage({preview})
  state.featureKey.value='qu_making';state.kind.value='work_photo';state.page.value=7
  state.items.value=[{kind:'work_photo',id:71,revision:5}]
  await state.cleanupFunction()
  assert.deepEqual(calls[0],{method:'GET',url:'/work-storage/cleanup-preview',params:{function:'qu_making',kind:'work_photo',cutoff:'2026-01-01'}})
  assert.equal(confirmCalls.length,1)
  const [confirmation,title]=confirmCalls[0]
  assert.equal(title,'一键清理资料');assert.match(confirmation,/制曲履职考评.*制曲工作截图/)
  assert.match(confirmation,/2026-01-01/);assert.match(confirmation,/2 份资料/);assert.match(confirmation,/4\.0 KB/)
  assert.match(confirmation,/所有分页/);assert.match(confirmation,/工作文字和考评记录保留/)
  assert.deepEqual(calls.find(call=>call.method==='POST'),{method:'POST',url:'/work-storage/cleanup',body:{function:'qu_making',kind:'work_photo',cutoff:'2026-01-01',items:[{kind:'work_photo',id:71,revision:5},{kind:'work_photo',id:72,revision:8}]}})
  assert.equal(calls.filter(call=>call.method==='POST').length,1)
  assert.deepEqual(calls.find(call=>call.url==='/work-storage').params,{function:'qu_making',kind:'work_photo',cutoff:'2026-01-01',page:1})
  assert.ok(calls.some(call=>call.url==='/work-storage/audit'))
  assert.equal(state.page.value,1);assert.equal(state.busy.value,false);assert.equal(state.error.value,'')
  assert.match(state.message.value,/已清理 2 份资料/);assert.match(state.message.value,/4\.0 KB/)
  assert.equal(state.audit.value.length,1)
})

test('cancelling a concrete cleanup preview sends no delete request and releases the busy state',async()=>{
  const {state,calls,confirmCalls}=storage({confirm:async()=>{throw 'cancel'}})
  await state.cleanupFunction()
  assert.equal(confirmCalls.length,1);assert.equal(calls.length,1)
  assert.equal(calls[0].url,'/work-storage/cleanup-preview')
  assert.equal(state.busy.value,false);assert.equal(state.error.value,'');assert.equal(state.featureKey.value,'inspection')
})

test('an empty eligible preview is reported without confirmation or a cleanup write',async()=>{
  const {state,calls,confirmCalls}=storage({preview:{items:[],itemCount:0,totalBytes:0}})
  await state.cleanupFunction()
  assert.equal(calls.length,1);assert.equal(confirmCalls.length,0)
  assert.ok(calls.every(call=>call.method==='GET'))
  assert.equal(state.busy.value,false);assert.equal(state.error.value,'')
  assert.match(state.message.value,/无符合条件资料/)
})

test('selection and a second cleanup stay frozen while the reviewed confirmation is pending',async()=>{
  let accept,entered
  const confirmation=new Promise(resolve=>{accept=resolve}),confirmationEntered=new Promise(resolve=>{entered=resolve})
  const {state,calls}=storage({confirm:async()=>{entered();await confirmation}})
  const cleaning=state.cleanupFunction();await confirmationEntered
  assert.equal(state.busy.value,true)
  await state.selectFunction('attendance');await state.load();await state.cleanupFunction()
  state.setRetention({kind:'inspection',id:123,revision:1})
  assert.equal(state.featureKey.value,'inspection');assert.equal(state.kind.value,'inspection')
  assert.equal(state.retentionOpen.value,false);assert.equal(calls.length,1)
  assert.equal(calls.filter(call=>call.url==='/work-storage/cleanup-preview').length,1)
  accept();await cleaning
  assert.equal(calls.filter(call=>call.method==='POST').length,1)
  assert.equal(calls.find(call=>call.method==='POST').body.function,'inspection')
  assert.equal(state.busy.value,false)
})

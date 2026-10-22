import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {fileSize} from '../src/utils/attendance-display.mjs'

const plain=value=>JSON.parse(JSON.stringify(value))
const reviewedItems=[
  {kind:'attendance',id:71,revision:5,title:'工作截图',bytes:1024,fileCount:1,unreviewedIds:[99]},
  {kind:'attendance',id:72,revision:8,title:'另一页截图',bytes:3072,fileCount:1,unreviewedIds:[100]}
]
const listData={items:[],summary:[{kind:'attendance',bytes:2048,itemCount:2,fileCount:4}],total:0}

function storage({preview={items:reviewedItems.map(item=>({...item,kind:'attendance'})),itemCount:2,totalBytes:4096},confirm=async()=>{},allowIndividual=false}={}) {
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
      delete:async(url,options)=>{if(!allowIndividual)throw new Error('Unexpected individual delete');calls.push({method:'DELETE',url,body:plain(options.data)});return {data:{releasedBytes:1024}}},
      patch:async()=>{throw new Error('Unexpected retention write')}
    }
  })
  vm.runInContext(source+'\nthis.storage={kind,cutoff,page,items,total,busy,error,message,audit,retentionOpen,load,setRetention,cleanupFunction,remove};',context)
  const state=context.storage;state.cutoff.value='2026-01-01'
  return {state,calls,confirmCalls}
}

test('manual early deletion confirms retained content and sends an explicit override without the batch cutoff',async()=>{
  const {state,calls,confirmCalls}=storage({allowIndividual:true});
  await state.remove({kind:'attendance',id:91,title:'保留资料',bytes:1024,revision:2,retentionUntil:'2099-12-31',canDelete:true,eligible:false});
  assert.match(confirmCalls[0][0],/管理员提前删除/);assert.match(confirmCalls[0][0],/2099-12-31/);assert.match(confirmCalls[0][0],/原始文件、对应结果与相关备注/);
  assert.deepEqual(calls.find(r=>r.method==='DELETE'),{method:'DELETE',url:'/work-storage/attendance/91',body:{manual:true,revision:2}});
  assert.equal(state.busy.value,false);assert.equal(state.error.value,'');
});
test('cancelled manual deletion and protected items send no destructive request',async()=>{
  const cancelled=storage({allowIndividual:true,confirm:async()=>{throw 'cancel'}});
  await cancelled.state.remove({kind:'attendance',id:91,title:'保留资料',bytes:1024,revision:2,canDelete:true});
  assert.ok(cancelled.calls.every(r=>r.method!=='DELETE'));assert.equal(cancelled.state.busy.value,false);
  const protectedItem=storage({allowIndividual:true});await protectedItem.state.remove({kind:'attendance',id:93,canDelete:false});
  assert.equal(protectedItem.calls.length,0);assert.equal(protectedItem.confirmCalls.length,0);
});

test('batch cleanup confirms all-page scope and posts only the exact reviewed revisions',async()=>{
  const preview={items:reviewedItems,itemCount:2,totalBytes:4096,unreviewedItems:[{kind:'attendance',id:99,revision:1}]}
  const {state,calls,confirmCalls}=storage({preview})
  state.page.value=7
  state.items.value=[{kind:'attendance',id:71,revision:5}]
  await state.cleanupFunction()
  assert.deepEqual(calls[0],{method:'GET',url:'/work-storage/cleanup-preview',params:{function:'all',kind:'',cutoff:'2026-01-01'}})
  assert.equal(confirmCalls.length,1)
  const [confirmation,title]=confirmCalls[0]
  assert.equal(title,'一键清理资料');assert.match(confirmation,/将清理最后更新早于/)
  assert.match(confirmation,/2026-01-01/);assert.match(confirmation,/2 份资料/);assert.match(confirmation,/4\.0 KB/)
  assert.match(confirmation,/所有分页/);assert.match(confirmation,/考勤会连同原文件、结果和备注删除/)
  assert.deepEqual(calls.find(call=>call.method==='POST'),{method:'POST',url:'/work-storage/cleanup',body:{function:'all',kind:'',cutoff:'2026-01-01',items:[{kind:'attendance',id:71,revision:5},{kind:'attendance',id:72,revision:8}]}})
  assert.equal(calls.filter(call=>call.method==='POST').length,1)
  assert.deepEqual(calls.find(call=>call.url==='/work-storage').params,{function:'all',kind:'',cutoff:'2026-01-01',page:1})
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
  assert.equal(state.busy.value,false);assert.equal(state.error.value,'')
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
  await state.load();await state.cleanupFunction()
  state.setRetention({kind:'attendance',id:123,revision:1})
  assert.equal(state.retentionOpen.value,false);assert.equal(calls.length,1)
  assert.equal(calls.filter(call=>call.url==='/work-storage/cleanup-preview').length,1)
  accept();await cleaning
  assert.equal(calls.filter(call=>call.method==='POST').length,1)
  assert.equal(calls.find(call=>call.method==='POST').body.function,'all')
  assert.equal(state.busy.value,false)
})

test('historical photo cleanup states the permanent unlink and preserves the selected scope',async()=>{
 const preview={items:[{kind:'raw_duty_photo',id:1,revision:7,bytes:100,historyCount:1,referenceCount:1}],itemCount:1,totalBytes:100}
 const {state,calls,confirmCalls}=storage({preview,confirm:async()=>{throw 'cancel'}})
 state.kind.value='raw_duty_photo';await state.cleanupFunction()
 assert.deepEqual(calls[0].params,{function:'all',kind:'raw_duty_photo',cutoff:'2026-01-01'})
 assert.match(confirmCalls[0][0],/1 张历史凭证照片/);assert.match(confirmCalls[0][0],/图片关联将永久删除/);assert.match(confirmCalls[0][0],/保留履职文字与审计记录/)
 assert.ok(calls.every(c=>c.method==='GET'))
})

test('manual historical deletion has its own warning and sends only the reviewed photo revision',async()=>{
 const {state,calls,confirmCalls}=storage({allowIndividual:true})
 await state.remove({kind:'raw_duty_photo',id:1,revision:7,title:'历史照片',bytes:100,canDelete:true,historyCount:1,referenceCount:1})
 assert.match(confirmCalls[0][0],/已提交过的历史凭证/);assert.match(confirmCalls[0][0],/照片及事项中的图片关联将永久删除/)
 assert.deepEqual(calls.find(c=>c.method==='DELETE'),{method:'DELETE',url:'/work-storage/raw_duty_photo/1',body:{manual:true,revision:7}})
})

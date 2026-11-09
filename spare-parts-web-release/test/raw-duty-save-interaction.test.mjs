import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const view=fs.readFileSync(new URL('../src/views/RawDuties.vue',import.meta.url),'utf8')
const methods=['saveReport','act','saveItem','closeItem','changeFillDate','openDuty'].map(name=>{
 const match=view.match(new RegExp('^async function '+name+'\\([^\\n]+','m'))
 assert.ok(match,`${name} must be exercised from the view`)
 return match[0]
}).join('\n')
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function subject({confirm=async()=>{},persist=async()=>{},post=async()=>({data:{}})}={}){
 const calls=[],ref=value=>({value}),state={busy:ref(false),dirty:ref(true),editable:ref(true),error:ref(''),itemSaveError:ref(''),showItem:ref(true),nextItem:ref(null),record:ref({id:12,revision:2,template:{entries:[]}}),feedback:ref(''),selectedDate:ref('2026-10-28'),week:ref('2026-10-26'),activeDuty:ref('first'),frequencyFilter:ref('每班'),expandedDuties:ref([])}
 const context=vm.createContext({isAppSurface:()=>false,...state,ElMessageBox:{confirm:async(...args)=>{calls.push({confirm:args});return confirm(...args)}},ElMessage:{warning:message=>calls.push({warning:message}),success:message=>calls.push({success:message})},persist:async submit=>{calls.push({persist:submit});return persist(submit)},api:{post:async(...args)=>{calls.push({post:args});return post(...args)}},refresh:async()=>{calls.push({refresh:true})},acceptRecord:async()=>{},monday:()=> '2026-10-26',openOwn:async()=>{},nextTick:async()=>{},document:{querySelector:()=>null}})
 vm.runInContext(methods+'\nthis.actions={saveReport,act,saveItem,closeItem,changeFillDate,openDuty}',context)
 return {state,actions:context.actions,calls}
}

test('repeated submit during confirmation opens one prompt and sends one revision',async()=>{
 const gate=deferred(),{state:s,actions:a,calls}=subject({confirm:()=>gate.promise})
 const first=a.saveReport(true);assert.equal(s.busy.value,true);assert.equal(await a.saveReport(true),false);assert.equal(calls.filter(c=>c.confirm).length,1)
 gate.resolve();assert.equal(await first,true);assert.equal(calls.filter(c=>'persist'in c).length,1);assert.equal(s.busy.value,false)
})

test('cancelled submit releases the busy state and keeps the form without a write',async()=>{
 const {state:s,actions:a,calls}=subject({confirm:async()=>{throw Error('cancel')}})
 assert.equal(await a.saveReport(true),false);assert.equal(s.busy.value,false);assert.equal(s.dirty.value,true);assert.equal(calls.filter(c=>'persist'in c).length,0)
})

test('failed save keeps the selected date and failed item close leaves the form open for retry',async()=>{
 const {state:s,actions:a}=subject({persist:async()=>{throw Error('offline')}})
 await a.changeFillDate('2026-10-29');assert.equal(s.selectedDate.value,'2026-10-28');assert.equal(s.dirty.value,true);assert.match(s.error.value,/保存失败/)
 let closed=false;await a.closeItem(()=>{closed=true});assert.equal(closed,false);assert.equal(s.showItem.value,true);assert.equal(s.busy.value,false);assert.match(s.itemSaveError.value,/填写内容已保留/)
 await a.openDuty('next');assert.equal(s.itemSaveError.value,'');assert.equal(s.activeDuty.value,'next')
})

test('repeated item saves and review actions cannot send overlapping revisions',async()=>{
 const saving=deferred(),{state:s,actions:a,calls}=subject({persist:()=>saving.promise})
 const first=a.saveItem(false);await a.saveItem(false);await a.act('return');assert.equal(calls.filter(c=>'persist'in c).length,1);assert.equal(calls.filter(c=>c.post).length,0);assert.equal(s.showItem.value,true)
 saving.resolve();await first;assert.equal(s.showItem.value,false);assert.equal(s.busy.value,false)
 const gate=deferred(),other=subject({confirm:()=>gate.promise});const confirming=other.actions.act('confirm');await other.actions.act('confirm');assert.equal(other.calls.filter(c=>c.confirm).length,1);gate.resolve();await confirming;assert.equal(other.calls.filter(c=>c.post).length,1)
})

test('failed review exposes a retry message and releases the operation lock',async()=>{
 const {state:s,actions:a}=subject({post:async()=>{throw Error('offline')}});await a.act('return');assert.equal(s.busy.value,false);assert.match(s.error.value,/操作失败/)
})

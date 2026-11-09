import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'

function subject({confirm=false}={}){
 const source=fs.readFileSync(new URL('../src/utils/fire-inspection-controller.mjs',import.meta.url),'utf8').replace(/^import .+$/gm,'').replace('export function useFireInspection','function useFireInspection')
 const confirmations=[],route={query:{}},unmounts=[],storage=new Map()
 const context=vm.createContext({
  ...Vue,watch(){},onMounted(){},onBeforeUnmount:fn=>unmounts.push(fn),onBeforeRouteLeave(){},useRoute:()=>route,useRouter:()=>({replace(){}}),
  getUser:()=>({id:'fixture-user',role:'viewer',staffWorkshopCode:'raw_grain'}),fireApi:{},
  ElMessage:{success(){},error(){},warning(){},info(){}},ElMessageBox:{confirm:async(...args)=>{confirmations.push(args);if(!confirm)throw new Error('cancel')}},
  navigator:{userAgent:'DigitalWorkbenchAndroid/1.9.10-android.21'},window:{addEventListener(){},removeEventListener(){},location:{origin:'https://fixture.invalid'}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),get length(){return storage.size},key:i=>[...storage.keys()][i]},
  setInterval:()=>1,clearInterval(){},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},crypto:{randomUUID:()=> 'fixture-id'},
  console,Date,Intl,Math,Set,Map
 })
 vm.runInContext(source+';this.f=useFireInspection(ref(true));',context)
 return {f:context.f,confirmations,context}
}

for(const [label,fill] of [
 ['rectification text',f=>{f.issueForm.remark='已完成检查，等待补充凭证'}],
 ['uploaded rectification photos',f=>{f.issueForm.photos.push({id:'photo-fixture'})}],
 ['photo awaiting retry',f=>{f.issuePendingFile.value={name:'现场照片.jpg',size:128}}]
])test(`leaving with ${label} asks and cancellation keeps the pending content`,async()=>{
 const {f,confirmations}=subject();f.openIssue({id:'issue-fixture'},'resolve');fill(f)
 assert.equal(f.hasUnsubmitted.value,true)
 assert.equal(await f.confirmLeaving(),false)
 assert.equal(confirmations.length,1)
 assert.equal(f.issueVisible.value,true)
})

test('rectification close cancellation preserves text, uploaded photos and retry file',async()=>{
 const {f,confirmations}=subject();f.openIssue({id:'issue-fixture'},'resolve')
 f.issueForm.remark='保留填写';f.issueForm.photos.push({id:'photo-fixture'});const pending={name:'待重试.jpg'};f.issuePendingFile.value=pending
 assert.equal(typeof f.closeIssue,'function')
 let closed=0;await f.closeIssue(()=>closed++)
 assert.equal(closed,0);assert.equal(confirmations.length,1);assert.equal(f.issueVisible.value,true)
 assert.equal(f.issueForm.remark,'保留填写');assert.equal(f.issueForm.photos.length,1);assert.equal(f.issuePendingFile.value.name,pending.name)
})

test('uploading or saving a rectification blocks close and route leaving',async()=>{
 const {f,confirmations}=subject({confirm:true});f.openIssue({id:'issue-fixture'},'resolve');f.issueBusy.value=true
 assert.equal(typeof f.closeIssue,'function')
 let closed=0;await f.closeIssue(()=>closed++)
 assert.equal(await f.confirmLeaving(),false);assert.equal(closed,0);assert.equal(f.issueVisible.value,true);assert.equal(confirmations.length,0)
})

test('an unchanged empty rectification can close without a prompt',async()=>{
 const {f,confirmations}=subject();f.openIssue({id:'issue-fixture'},'resolve');assert.equal(typeof f.closeIssue,'function')
 let closed=0;await f.closeIssue(()=>closed++)
 assert.equal(closed,1);assert.equal(f.issueVisible.value,false);assert.equal(confirmations.length,0)
})

test('explicit discard can close a pending rectification with an honest warning',async()=>{
 const {f,confirmations}=subject({confirm:true});f.openIssue({id:'issue-fixture'},'resolve');f.issueForm.remark='待保存'
 assert.equal(typeof f.closeIssue,'function');let closed=0;await f.closeIssue(()=>closed++)
 assert.equal(closed,1);assert.equal(f.issueVisible.value,false);assert.equal(confirmations.length,1)
 assert.match(confirmations[0][0],/整改/);assert.doesNotMatch(confirmations[0][0],/离开后保留本机填写草稿/)
})

test('the real rectification dialog and cancel action use the controller close guard',()=>{
 const source=fs.readFileSync(new URL('../src/components/fire/FireCommonDialogs.vue',import.meta.url),'utf8'),template=source.match(/<template>([\s\S]*?)<\/template>\s*<script setup>/)[1]
 const {f}=subject();f.openIssue({id:'issue-fixture'},'resolve');f.closeIssue=()=>{}
 const components=new Map(),helpers={...Vue,resolveComponent:name=>{if(!components.has(name))components.set(name,{name});return components.get(name)}},render=Function('Vue',compile(template,{mode:'function',prefixIdentifiers:false}).code)(helpers)
 const tree=render(Vue.proxyRefs({...f,issueCamera:Vue.ref(null)}),[]),dialogs=tree.children.filter(v=>v?.type?.name==='el-dialog'),dialog=dialogs.at(-1)
 assert.equal(dialog.props.beforeClose??dialog.props['before-close'],f.closeIssue)
 f.issueBusy.value=true;const busyTree=render(Vue.proxyRefs({...f,issueCamera:Vue.ref(null)}),[]),busyDialog=busyTree.children.filter(v=>v?.type?.name==='el-dialog').at(-1)
 assert.equal(busyDialog.props.closeOnPressEscape??busyDialog.props['close-on-press-escape'],false)
 const footer=dialog.children.footer(),cancel=footer.find(v=>v?.type?.name==='el-button');assert.ok(cancel)
 // The compiled click handler should delegate, rather than mutate issueVisible itself.
 let called=0;const ctx=Vue.proxyRefs({...f,closeIssue:()=>{called++},issueCamera:Vue.ref(null)}),next=render(ctx,[]).children.filter(v=>v?.type?.name==='el-dialog').at(-1)
 next.children.footer().find(v=>v?.type?.name==='el-button').props.onClick();assert.equal(called,1);assert.equal(f.issueVisible.value,true)
})


test('failed bootstrap leaves a retryable recognition status and successful retry restores the server capability',async()=>{
 const {f,context}=subject();context.fireApi.bootstrap=async()=>{throw Error('合成网络中断')};
 await assert.rejects(f.bootstrap(false),/合成网络中断/);assert.equal(f.photoRecognition.value.enabled,false);assert.match(f.photoRecognition.value.reason,/读取失败.*刷新/);assert.doesNotMatch(f.photoRecognition.value.reason,/正在读取/);
 context.fireApi.bootstrap=async()=>({areas:[],cycles:[],selectedCycleId:'new-cycle',photoRecognition:{enabled:true,reason:'',periodMonth:'2026-11'}});await f.bootstrap(false);assert.equal(f.photoRecognition.value.enabled,true);assert.equal(f.query.cycleId,'new-cycle');
 context.fireApi.bootstrap=async()=>{throw Error('再次离线')};await assert.rejects(f.bootstrap(),/再次离线/);assert.equal(f.photoRecognition.value.enabled,false);assert.equal(f.photoRecognition.value.periodMonth,'2026-11');
});

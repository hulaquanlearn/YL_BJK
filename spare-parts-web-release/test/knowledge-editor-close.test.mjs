import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {emptyReferenceMetadata,spareDocumentFamilies,spareDocumentKinds,referenceStatusLabels} from '../src/utils/spare-documents.mjs'

const source=fs.readFileSync(new URL('../src/views/Knowledge.vue',import.meta.url),'utf8')
function subject({confirm=async()=>{},save=async()=>({msg:'已保存'}),role='admin'}={}){
 const calls=[];let leave
 const context=vm.createContext({isAppSurface:()=>false,
  ref:value=>({value}),computed:get=>({get value(){return get()}}),reactive:value=>value,onMounted(){},onBeforeUnmount(){},onBeforeRouteLeave:fn=>leave=fn,watch(){},emptyReferenceMetadata,spareDocumentFamilies,spareDocumentKinds,referenceStatusLabels,
  useRouter:()=>({currentRoute:{value:{query:{}}}}),getUser:()=>({role,id:1}),canEditAnyWorkshop:()=>role!=='viewer',userWorkshopCode:()=> 'raw_grain',isViewer:()=>role==='viewer',
  marked:{setOptions(){},parse:v=>v},DOMPurify:{sanitize:v=>v},FormData,Blob,
  ElMessage:{warning:msg=>calls.push({warning:msg}),success:msg=>calls.push({success:msg})},
  ElMessageBox:{confirm:async(...args)=>{calls.push({confirm:args});return confirm(...args)}},
  createKnowledgeEntry:async body=>{calls.push({save:body});return save(body)},
  getKnowledgeEntries:async()=>({data:[],total:0}),getKnowledgeStats:async()=>({data:{categories:[],tags:[]}}),
  getKnowledgeProcessStages:async()=>({data:[]}),getKnowledgeTags:async()=>({data:[]})
 })
 const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 vm.runInContext(script+'\nthis.state={form,openCreate,openEdit,createVisible,submitting,selectedFile,editorDirty,closeEditor,beforeEditorClose,beforeKnowledgeUnload,submit};',context)
 return {state:context.state,calls,leave:()=>leave()}
}
function fillFault(state){Object.assign(state.form,{workshopCode:'raw_grain',entryType:'fault',title:'故障记录',category:'故障经验',faultSymptom:'输送机停止',solution:'确认故障后处理'})}

test('a clean editor closes directly; dirty content requires an explicit discard and survives cancellation',async()=>{
 const clean=subject();await clean.state.openCreate();await clean.state.closeEditor();assert.equal(clean.state.createVisible.value,false);assert.equal(clean.calls.length,0)
 const cancelled=subject({confirm:async()=>{throw 'cancel'}});await cancelled.state.openCreate();fillFault(cancelled.state)
 await cancelled.state.closeEditor();assert.equal(cancelled.state.createVisible.value,true);assert.equal(cancelled.state.form.solution,'确认故障后处理');assert.equal(cancelled.calls.filter(c=>c.confirm).length,1)
 const discarded=subject();await discarded.state.openCreate();fillFault(discarded.state);let closed=false
 await discarded.state.beforeEditorClose(()=>closed=true);assert.equal(closed,true);assert.equal(discarded.calls.filter(c=>c.confirm).length,1)
})

test('knowledge saves cannot be fake-cancelled or submitted twice while the request is running',async()=>{
 let finish;const app=subject({save:()=>new Promise(r=>finish=r)});await app.state.openCreate();fillFault(app.state)
 const saving=app.state.submit();assert.equal(app.state.submitting.value,true)
 await app.state.closeEditor();let closed=false;await app.state.beforeEditorClose(()=>closed=true);await app.state.submit()
 assert.equal(app.state.createVisible.value,true);assert.equal(closed,false);assert.equal(await app.leave(),false)
 assert.equal(app.calls.filter(c=>c.save).length,1);assert.equal(app.calls.filter(c=>c.confirm).length,0)
 assert.match(source,/:close-on-click-modal="!submitting"/);assert.match(source,/:close-on-press-escape="!submitting"/);assert.match(source,/:disabled="submitting" @click="closeEditor"/)
 finish({msg:'已保存'});await saving;assert.equal(app.state.submitting.value,false);assert.equal(app.state.createVisible.value,false)
})

test('navigation and refresh protect text or newly selected attachments, while a successful discard permits navigation',async()=>{
 const app=subject({confirm:async()=>{throw 'cancel'}});await app.state.openCreate();app.state.selectedFile.value={name:'资料.pdf',size:128,lastModified:1}
 assert.equal(app.state.editorDirty(),true);assert.equal(await app.leave(),false)
 const event={prevented:false,preventDefault(){this.prevented=true}};app.state.beforeKnowledgeUnload(event);assert.equal(event.prevented,true);assert.equal(event.returnValue,'')
 const allowed=subject();await allowed.state.openCreate();fillFault(allowed.state);assert.equal(await allowed.leave(),true)
})

test('editing an existing entry starts clean and restoring the original fields clears the dirty state',async()=>{
 const app=subject();await app.state.openEdit({id:3,entryType:'fault',title:'原记录',category:'故障经验',faultSymptom:'停机',solution:'检修',tags:[]})
 assert.equal(app.state.editorDirty(),false);app.state.form.title='修订记录';assert.equal(app.state.editorDirty(),true);app.state.form.title='原记录';assert.equal(app.state.editorDirty(),false)
 await app.state.closeEditor();assert.equal(app.calls.filter(c=>c.confirm).length,0)
})

test('read-only users cannot submit knowledge through the handler',async()=>{
 const app=subject({role:'viewer'});fillFault(app.state);await app.state.submit();assert.equal(app.calls.filter(c=>c.save).length,0);assert.match(app.calls[0].warning,/不能提交知识/)
})

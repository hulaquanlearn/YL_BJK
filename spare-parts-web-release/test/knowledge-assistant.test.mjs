import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {emptyReferenceMetadata,spareDocumentFamilies,spareDocumentKinds,referenceStatusLabels} from '../src/utils/spare-documents.mjs'
function subject({role='admin',accountId=1,storage=new Map(),chat=async()=>({data:{answer:'答复',evidence:[]}}),read=async id=>({data:{id,viewCount:1}}),preview=async()=>({blob:{type:'application/pdf'}})}={}){
 let unmount=()=>{},currentAccountId=accountId
 const calls=[],source=fs.readFileSync(new URL('../src/views/Knowledge.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({emptyReferenceMetadata,spareDocumentFamilies,spareDocumentKinds,referenceStatusLabels,watch(){},isAppSurface:()=>false,ref:value=>({value}),computed:get=>({get value(){return get()}}),reactive:value=>value,onMounted(){},onBeforeUnmount:fn=>{unmount=fn},onBeforeRouteLeave(){},useRouter:()=>({currentRoute:{value:{query:{}}}}),getUser:()=>({role,id:currentAccountId}),window:{removeEventListener(){}},URL:{createObjectURL:blob=>{calls.push({created:blob});return 'blob:preview-'+calls.length},revokeObjectURL:url=>calls.push({revoked:url})},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},canEditAnyWorkshop:()=>['admin','raw_grain','qu_making','brewing'].includes(role),userWorkshopCode:()=> 'raw_grain',isViewer:()=>role==='viewer',marked:{setOptions(){},parse:v=>v},DOMPurify:{sanitize:v=>v},ElMessage:{warning:msg=>calls.push({warning:msg})},getKnowledgeEntry:read,previewKnowledgeFileResponse:preview,chatKnowledgeAssistant:async(messages,context)=>{calls.push({messages:JSON.parse(JSON.stringify(messages)),context:context&&JSON.parse(JSON.stringify(context))});return chat(messages,context)}})
 vm.runInContext(source+'\nthis.state={openAssistant,askAssistant,aiContext,aiMessages,aiQuestion,aiAnswer,aiEvidence,aiLoading,aiTurns,newAssistantConversation,assistantVisible,detailVisible,previewVisible,openDetail,detail,detailLoading,detailError,openPreview,closePreview,previewLoading,previewUrl,previewFile};',context);return {state:context.state,calls,unmount:()=>unmount(),setAccount:id=>{currentAccountId=id}}
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
test('opening current-file AI binds its server identity and revision and clears a previous file conversation',async()=>{
 const {state:s,calls}=subject();s.openAssistant({id:7,revisionNo:2,title:'当前设备手册',contentText:'不传浏览器正文'});s.aiQuestion.value='这个怎么处理？';await s.askAssistant();assert.equal(calls[0].context.entryId,7);assert.equal(calls[0].context.revisionNo,2);assert.equal(calls[0].context.contentText,undefined);assert.equal(s.detailVisible.value,false);assert.equal(s.assistantVisible.value,true)
 s.openAssistant({id:8,revisionNo:1,title:'另一份资料'});assert.equal(s.aiMessages.value.length,0);assert.equal(s.aiAnswer.value,'');s.openAssistant();assert.equal(s.aiContext.value,null)
})
test('duplicate submit and context switches are blocked while a question is in flight',async()=>{
 let release;const gate=new Promise(r=>release=r),{state:s,calls}=subject({chat:async()=>{await gate;return {data:{answer:'完成'}}}})
 s.openAssistant({id:7,revisionNo:2,title:'设备'});s.aiQuestion.value='设备故障';const pending=s.askAssistant();await s.askAssistant();s.openAssistant({id:8,revisionNo:1,title:'别的文件'});assert.equal(s.aiContext.value.entryId,7);assert.equal(calls.filter(c=>c.messages).length,1);release();await pending;assert.equal(s.aiLoading.value,false)
})
test('ordinary users cannot open or invoke AI even through handlers; failures keep the original question for retry',async()=>{
 const denied=subject({role:'viewer'});denied.state.openAssistant();denied.state.aiQuestion.value='设备故障';await denied.state.askAssistant();assert.equal(denied.state.assistantVisible.value,false);assert.ok(denied.calls.every(c=>!c.messages))
 const {state:s}=subject({chat:async()=>({data:{answer:'模型不可用',degraded:true}})});s.aiQuestion.value='故障如何处理';await s.askAssistant();assert.equal(s.aiQuestion.value,'故障如何处理');assert.equal(s.aiMessages.value.length,0);assert.equal(s.aiAnswer.value,'模型不可用')
})

test('questions remain visible, follow-ups keep context, and refresh restores only the same account and file revision',async()=>{
 const storage=new Map(),{state:s,calls}=subject({storage});s.openAssistant();s.aiQuestion.value='AGVEKK故障';await s.askAssistant();s.aiQuestion.value='那下一步怎么查？';await s.askAssistant();
 assert.equal(s.aiTurns.value[0].question,'AGVEKK故障');assert.equal(s.aiTurns.value[1].answer,'答复');assert.equal(s.aiQuestion.value,'');assert.equal(calls[1].messages[0].content,'AGVEKK故障');
 const restored=subject({storage}).state;restored.openAssistant();assert.equal(restored.aiTurns.value.length,2);assert.equal(restored.aiMessages.value.length,4);
 const other=subject({storage,accountId:2}).state;other.openAssistant();assert.equal(other.aiTurns.value.length,0);
 restored.openAssistant({id:8,revisionNo:1,title:'别的文档'});assert.equal(restored.aiTurns.value.length,0);restored.openAssistant();assert.equal(restored.aiTurns.value.length,2);
 restored.newAssistantConversation();assert.equal(restored.aiMessages.value.length,0);assert.equal(restored.aiTurns.value.length,0);
 const cleared=subject({storage}).state;cleared.openAssistant();assert.equal(cleared.aiTurns.value.length,0);
});

test('failed requests retain their visible question and do not enter model history',async()=>{
 const {state:s}=subject({chat:async()=>{throw Error('network')}});s.aiQuestion.value='AGVEKK故障';await s.askAssistant();assert.equal(s.aiTurns.value[0].question,'AGVEKK故障');assert.ok(s.aiTurns.value[0].error);assert.equal(s.aiMessages.value.length,0);assert.equal(s.aiQuestion.value,'AGVEKK故障');
});

test('detail failures expose a retry and repeated taps share the current load',async()=>{
 const gate=deferred();let reads=0
 const {state:s}=subject({read:async id=>{reads++;if(reads===1)return gate.promise;return {data:{id,title:'设备手册',viewCount:2}}}})
 const first=s.openDetail({id:7});await s.openDetail({id:7});assert.equal(reads,1);assert.equal(s.detailVisible.value,true);assert.equal(s.detailLoading.value,true)
 gate.reject(Error('offline'));await first;assert.match(s.detailError.value,/加载失败/);assert.equal(s.detailLoading.value,false)
 await s.openDetail({id:7});assert.equal(s.detail.value.title,'设备手册');assert.equal(s.detailError.value,'')
})

test('late detail responses cannot replace a newer selection or reopen after leaving',async()=>{
 const older=deferred(),newer=deferred(),{state:s,unmount}=subject({read:id=>id===1?older.promise:newer.promise})
 const first=s.openDetail({id:1}),second=s.openDetail({id:2});newer.resolve({data:{id:2,viewCount:1}});await second;older.resolve({data:{id:1,viewCount:1}});await first;assert.equal(s.detail.value.id,2)
 const late=deferred(),other=subject({read:()=>late.promise});const pending=other.state.openDetail({id:3});other.unmount();late.resolve({data:{id:3}});await pending;assert.equal(other.state.detail.value,null);unmount()
})

test('cancelling a preview unlocks retry and discards the cancelled blob; closing releases the current PDF file',async()=>{
 const older=deferred(),newer=deferred();let reads=0
 const {state:s,calls}=subject({preview:()=>++reads===1?older.promise:newer.promise})
 const first=s.openPreview({id:1});await s.openPreview({id:1});assert.equal(reads,1)
 s.closePreview();assert.equal(s.previewLoading.value,false);const second=s.openPreview({id:2});older.resolve({blob:{type:'image/png',old:true}});await first;assert.equal(s.previewLoading.value,true);assert.equal(s.previewUrl.value,'')
 newer.resolve({blob:{type:'application/pdf',current:true}});await second;assert.equal(calls.filter(c=>c.created).length,0);assert.equal(s.previewVisible.value,true);assert.equal(s.previewFile.value.current,true)
 s.closePreview();assert.equal(s.previewFile.value,null);assert.equal(s.previewUrl.value,'')
})

test('leaving before preview or AI completion neither retains blobs nor writes stale account conversations',async()=>{
 const file=deferred(),answer=deferred(),storage=new Map(),a=subject({storage,preview:()=>file.promise,chat:()=>answer.promise})
 a.state.aiQuestion.value='维修怎么办';const reading=a.state.openPreview({id:1}),asking=a.state.askAssistant();a.unmount();file.resolve({blob:{type:'image/png'}});answer.resolve({data:{answer:'迟到答案'}});await Promise.all([reading,asking]);assert.equal(a.calls.filter(c=>c.created).length,0);assert.equal(storage.size,0);assert.equal(a.state.aiAnswer.value,'')
 const nextAnswer=deferred(),b=subject({storage,chat:()=>nextAnswer.promise});b.state.aiQuestion.value='原账号问题';const pending=b.state.askAssistant();b.setAccount(2);nextAnswer.resolve({data:{answer:'原账号答案'}});await pending;assert.equal(storage.size,0);assert.equal(b.state.aiAnswer.value,'')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
function subject({role='admin',accountId=1,storage=new Map(),chat=async()=>({data:{answer:'答复',evidence:[]}})}={}){
 const calls=[],source=fs.readFileSync(new URL('../src/views/Knowledge.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({ref:value=>({value}),reactive:value=>value,onMounted(){},useRouter:()=>({}),getUser:()=>({role,id:accountId}),sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},canEditAnyWorkshop:()=>['admin','raw_grain','qu_making','brewing'].includes(role),userWorkshopCode:()=> 'raw_grain',isViewer:()=>role==='viewer',marked:{setOptions(){},parse:v=>v},DOMPurify:{sanitize:v=>v},ElMessage:{warning:msg=>calls.push({warning:msg})},chatKnowledgeAssistant:async(messages,context)=>{calls.push({messages:JSON.parse(JSON.stringify(messages)),context:context&&JSON.parse(JSON.stringify(context))});return chat(messages,context)}})
 vm.runInContext(source+'\nthis.state={openAssistant,askAssistant,aiContext,aiMessages,aiQuestion,aiAnswer,aiEvidence,aiLoading,aiTurns,newAssistantConversation,assistantVisible,detailVisible,previewVisible};',context);return {state:context.state,calls}
}
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

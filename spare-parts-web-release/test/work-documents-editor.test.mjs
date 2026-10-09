import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {ref,computed,watch,nextTick} from 'vue'

function editor(confirm){
 const calls=[]
 const source=fs.readFileSync(new URL('../src/components/WorkDocuments.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({ref,computed,watch,onMounted(){},defineExpose(){},defineEmits:()=>()=>{},defineProps:()=>({dutyId:'a'}),ElMessage:{success(){}},ElMessageBox:{confirm},work:{get:async()=>{calls.push('load');return {data:{entries:[{id:'a',documentTitle:'原文档',documentUrl:'https://example.com/a'}],canEdit:true,week:'2026-09-28'}}},post:async()=>{calls.push('save')}}})
 vm.runInContext(source+'\nthis.editor={entries,selectedId,title,url,busy,selectDuty,refresh,changed};',context)
 context.editor.entries.value=[{id:'a',documentTitle:'原文档',documentUrl:'https://example.com/a'},{id:'b',documentTitle:'新文档',documentUrl:'https://example.com/b'}]
 return {state:context.editor,calls}
}
test('cancelled document switch and refresh retain unsaved title and selected item',async()=>{
 const {state,calls}=editor(async()=>{throw new Error('cancel')});await nextTick();state.title.value='未保存标题'
 const select={value:'b'};await state.selectDuty('b',select);await state.refresh()
 assert.equal(state.selectedId.value,'a');assert.equal(select.value,'a');assert.equal(state.title.value,'未保存标题');assert.equal(state.changed.value,true);assert.deepEqual(calls,[])
})
test('accepted switch loads selected binding and busy editor cannot switch',async()=>{
 const {state}=editor(async()=>{});await nextTick();state.title.value='未保存标题';await state.selectDuty('b');await nextTick()
 assert.equal(state.selectedId.value,'b');assert.equal(state.title.value,'新文档');assert.equal(state.changed.value,false)
 state.busy.value=true;await state.selectDuty('a');assert.equal(state.selectedId.value,'b')
})

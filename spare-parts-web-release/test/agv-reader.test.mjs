import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {electricalCatalog} from '../src/utils/agv-electrical.mjs'
import {computed} from 'vue'
function subject(preview){let unmount;const source=fs.readFileSync(new URL('../src/components/agv/AgvElectrical.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'');const context=vm.createContext({computed,electricalCatalog,defineProps:()=>({variant:'old',family:'latent'}),previewKnowledgeFileResponse:preview,ref:value=>({value}),onBeforeUnmount:fn=>{unmount=fn}});vm.runInContext(source+'\nthis.review={openPage,close,file,visible,error,initialPage};',context);return {state:context.review,unmount:()=>unmount()}}
test('all AGV drawing links retain authenticated files and requested pages without blob URLs',async()=>{
 const ids=[],file=new Blob(['%PDF-1.4\nfile'],{type:'application/pdf'}),{state:s}=subject(async id=>{ids.push(id);return {blob:file}})
 for(const [id,page] of [[20,23],[19,2],[17,2],[12,18]]){await s.openPage(page,id);assert.equal(s.file.value,file);assert.equal(s.initialPage.value,page);assert.equal(s.visible.value,true);s.close();assert.equal(s.file.value,null)}assert.deepEqual(ids,[20,19,17,12])
})
test('a failed or cancelled AGV preview can be retried without keeping a stale file',async()=>{
 let resolve,reads=0;const file=new Blob(['%PDF-1.4'],{type:'application/pdf'}),a=subject(async()=>{if(++reads===1)throw Error('offline');return {blob:file}});await a.state.openPage(2);assert.ok(a.state.error.value);await a.state.openPage(4);assert.equal(a.state.file.value,file)
 const b=subject(()=>new Promise(r=>{resolve=r})),pending=b.state.openPage(2);b.unmount();resolve({blob:file});await pending;assert.equal(b.state.file.value,null)
})

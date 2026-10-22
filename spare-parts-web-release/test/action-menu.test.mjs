import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

test('more menu emits only available enabled commands and blocks stale, hidden and disabled commands',()=>{
 const source=fs.readFileSync(new URL('../src/components/ActionMenu.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const events=[],props={disabled:false,items:[{key:'import',label:'导入'},{key:'export',disabled:true},{key:'hidden',visible:false}]}
 const context=vm.createContext({computed:fn=>({get value(){return fn()}}),defineProps:()=>props,defineEmits:()=>(...args)=>events.push(args)})
 vm.runInContext(source+'\nthis.subject={select,visibleItems};',context)
 context.subject.select('import');context.subject.select('export');context.subject.select('hidden');context.subject.select('missing')
 assert.deepEqual(events,[['select','import']]);props.disabled=true;context.subject.select('import');assert.equal(events.length,1)
 props.disabled=false;props.items=[];context.subject.select('import');assert.equal(events.length,1)
})

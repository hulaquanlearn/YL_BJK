import {createLocalProgram} from '../src/utils/abb-local-program.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {ref,shallowRef,computed,watch,reactive,toRefs,nextTick,effectScope} from 'vue'

test('receiving-pose interlock does not cancel manual positioning, but revoking an active program still stops it',async()=>{
 const events=[],props=reactive({joints:[0,0,0,0,90,0],motionAllowed:true,speedPercent:100,toolType:'tool-640'});let session
 class Session{constructor(options){this.options=options;this.running=false;this.state={checkpoint:42};session=this}stop(){this.running=false;this.options.stopMotion()}}
 const script=fs.readFileSync(new URL('../src/components/agv/AbbProgramControl.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const ctx=vm.createContext({createLocalProgram,ref,shallowRef,computed,watch,reactive,toRefs,inject:()=>reactive({backupId:'',routineId:''}),useRoute:()=>({query:{}}),onMounted(){},onBeforeUnmount(){},defineProps:()=>props,defineEmits:()=>((name,value)=>events.push({name,value})),defineExpose(){},AbbProgramSession:Session});const scope=effectScope();scope.run(()=>vm.runInContext(script,ctx))
 props.motionAllowed=false;await nextTick();assert.equal(events.filter(e=>e.name==='stop').length,0,'changing receivingMotion must not cancel its own manual move')
 props.motionAllowed=true;await nextTick();session.running=true;props.motionAllowed=false;await nextTick();assert.equal(events.filter(e=>e.name==='stop').length,1);assert.equal(session.state.checkpoint,42);scope.stop()
})

test('restart clears the old checkpoint and blocks execution until the rendered robot returns home',async()=>{
 let finishReset,session;const events=[],props=reactive({joints:[20,10,0,0,90,0],motionAllowed:true,speedPercent:100,toolType:'tool-640',resetPose:()=>new Promise(resolve=>{finishReset=resolve})})
 class Session{constructor(options){this.options=options;this.running=false;this.state={checkpoint:42};session=this}stop(){this.running=false;this.options.stopMotion()}clear(){this.stop();this.state=null}}
 const script=fs.readFileSync(new URL('../src/components/agv/AbbProgramControl.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const ctx=vm.createContext({createLocalProgram,ref,shallowRef,computed,watch,reactive,toRefs,inject:()=>reactive({backupId:'',routineId:''}),useRoute:()=>({query:{}}),onMounted(){},onBeforeUnmount(){},defineProps:()=>props,defineEmits:()=>((name,value)=>events.push({name,value})),defineExpose(){},AbbProgramSession:Session}),scope=effectScope()
 scope.run(()=>vm.runInContext(script,ctx));const restarted=ctx.restart();assert.equal(session.state,null);assert.equal(vm.runInContext('busy.value',ctx),true);assert.ok(events.some(event=>event.name==='running'&&event.value))
 finishReset();await restarted;assert.equal(vm.runInContext('busy.value',ctx),false);assert.ok(events.some(event=>event.name==='status'&&event.value.includes('回到起始位')));assert.equal(events.at(-1).value,false);scope.stop()
})

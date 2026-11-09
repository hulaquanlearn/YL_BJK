import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {ref,nextTick} from 'vue'
const source=fs.readFileSync(new URL('../src/components/fire/FireCamera.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
function setup(getUserMedia){
 let teardown,api,props={disabled:false};const emitted=[],video={srcObject:null,play:async()=>{}},context=vm.createContext({ref,nextTick,defineProps:()=>props,defineEmits:()=>((...args)=>emitted.push(args)),defineExpose:value=>{api=value},navigator:{userAgent:'Browser',mediaDevices:{getUserMedia}},document:{hidden:false,addEventListener(){},removeEventListener(){}},window:{addEventListener(){},removeEventListener(){}},onBeforeUnmount:fn=>{teardown=fn},watch(){}})
 vm.runInContext(source+'\nvideo.value=fixtureVideo;this.state={visible,error,ready};',vm.createContext({...context,fixtureVideo:video}))
 return {api,teardown,emitted,video}
}
test('closing the camera while permission is pending stops a late stream and never uploads it',async()=>{
 let finish,stops=0;const s=setup(()=>new Promise(r=>{finish=r})),opening=s.api.open();s.api.close();finish({getTracks:()=>[{stop(){stops++}}]});await opening;assert.equal(stops,1);assert.equal(s.emitted.length,0);s.teardown()
})
test('unmount releases the live camera and capture-only UI offers no browser file picker fallback',async()=>{
 let stops=0;const s=setup(async options=>{assert.equal(options.audio,false);assert.equal(options.video.facingMode.ideal,'environment');return {getTracks:()=>[{stop(){stops++}}]}});await s.api.open();assert.ok(s.video.srcObject);s.teardown();assert.equal(stops,1);assert.equal(s.video.srcObject,null);assert.equal(s.emitted.length,0)
 const component=fs.readFileSync(new URL('../src/components/fire/FireCamera.vue',import.meta.url),'utf8');assert.match(component,/<input v-if="nativeAndroid"[^>]*capture="environment"/);assert.doesNotMatch(component,/相册|album/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'

test('blue directions start on press, repeat only while held, and release or focus loss cancels immediately',()=>{
 const events=[],props={step:{enableState:1,incrementEnabled:false}};let now=0
 const script=fs.readFileSync(new URL('../src/components/agv/FlexPendantModel.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
 const context=vm.createContext({THREE,AbortController,performance:{now:()=>now},ref:value=>({value}),defineProps:()=>props,defineEmits:()=>((name,value)=>events.push({name,value})),defineExpose(){},watch(){},onMounted(){},onBeforeUnmount(){}})
 vm.runInContext(script+'\nthis.subject={pressDirection,releaseDirection,repeatDirection,cancelJog,keyboard};',context)
 const s=context.subject,direction={vector:[1,1,0]},event={pointerId:1,currentTarget:{setPointerCapture(){}}}
 s.pressDirection(direction,event);assert.equal(events[0].name,'jog','motion begins on pointerdown')
 now=300;s.repeatDirection(now);assert.equal(events.filter(e=>e.name==='jog').length,2)
 s.releaseDirection();assert.equal(events.at(-1).value,'jog-release')
 now=500;s.repeatDirection(now);assert.equal(events.filter(e=>e.name==='jog').length,2,'release starts no new motion')
 s.releaseDirection();assert.equal(events.filter(e=>e.value==='jog-release').length,1)
 props.step.incrementEnabled=true;s.pressDirection(direction,event);const count=events.length
 now=1100;s.repeatDirection(now);assert.equal(events.length,count,'fine increment waits one second before repetition')
 now=1600;s.repeatDirection(now);assert.equal(events.length,count+1)
 s.cancelJog();assert.equal(events.at(-1).value,'jog-release')
 now=2000;s.repeatDirection(now);assert.equal(events.at(-1).value,'jog-release')
})

test('pendant model removes +/- controls and uses wheel zoom, left rotate and right pan without hijacking screen buttons',async()=>{
 const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../src/components/agv/FlexPendantModel.vue',import.meta.url),'utf8'))
 assert.doesNotMatch(source,/放大示教器|缩小示教器|zoomView\(/) 
 assert.match(source,/@contextmenu\.prevent/)
 assert.match(source,/controls\.enableZoom=true/)
 assert.match(source,/controls\.mouseButtons=\{[^}]*LEFT:THREE\.MOUSE\.ROTATE[^}]*RIGHT:THREE\.MOUSE\.PAN/)
 assert.match(source,/function pointerDown\(event\)\{if\(event\.button!==0\)/)
 assert.ok(source.includes('function pick(event){')&&source.includes('if(event.button!==0)return'))
 assert.match(source,/放大屏幕/);assert.match(source,/恢复正面视图/);assert.match(source,/使能/)
})

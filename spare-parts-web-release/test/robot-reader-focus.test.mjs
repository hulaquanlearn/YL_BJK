import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {rapidDocument} from '../src/utils/rapid-reader.mjs'

function page(){
 const listeners=new Map(),media={matches:true,addEventListener(_name,fn){this.change=fn},removeEventListener(){this.change=null}}
 const trigger={isConnected:true,getClientRects:()=>[{}],focus(){doc.activeElement=this}}
 const doc={activeElement:trigger,body:{style:{overflow:'auto',paddingRight:'2px'},classList:{contains:()=>false}},documentElement:{clientWidth:1265},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 let dispose
 const context=vm.createContext({useRoute:()=>({query:{}}),isAppSurface:()=>false,ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},onBeforeUnmount:fn=>dispose=fn,nextTick:async()=>{},document:doc,window:{innerWidth:1280,getComputedStyle:()=>({paddingRight:'2px'}),matchMedia:()=>media},navigator:{userAgent:'Desktop test'},localStorage:{setItem(){},getItem(){return ''}},ElMessageBox:{},setTimeout})
 const script=fs.readFileSync(new URL('../src/views/RobotProgram.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 vm.runInContext(script+'\nthis.state={readerFocus,sourceExpanded,assistantExpanded,sourceReader,sourcePanel,assistantPanel,assistantBody,readerKeydown,setReaderFocus,fileTreeVisible,showCompactFilePicker,selectedId,readerTab,assistantTab,analysis,history,question};',context)
 return{state:context.state,doc,listeners,media,trigger,dispose:()=>dispose()}
}
test('expanded source preserves the reading position and returns body/focus on collapse',async()=>{
 const {state:s,doc,listeners,trigger}=page();let position={top:720,left:80},focused=false
 s.sourceReader.value={captureScroll:()=>({...position}),restoreScroll:value=>{position={...value}},focusScroller:()=>focused=true}
 await s.setReaderFocus('source');assert.equal(s.sourceExpanded.value,true);assert.equal(s.assistantExpanded.value,false);assert.equal(focused,true);assert.equal(position.top,720);assert.equal(doc.body.style.overflow,'hidden');assert.equal(doc.body.style.paddingRight,'17px');assert.equal(listeners.has('keydown'),true)
 position.top=4000;await s.setReaderFocus('');assert.equal(position.top,4000);assert.equal(position.left,80);assert.equal(doc.body.style.overflow,'auto');assert.equal(doc.body.style.paddingRight,'2px');assert.equal(doc.activeElement,trigger);assert.equal(listeners.has('keydown'),false)
})
test('assistant expansion retains the selected analysis tab, draft question, history and scroll without a new AI request',async()=>{
 const {state:s,doc}=page();const history=[{role:'user',content:'原问题'},{role:'assistant',content:'原回答'}],analysis={summary:'已保存分析'}
 s.history.value=history;s.analysis.value=analysis;s.question.value='未发送的追问';s.assistantTab.value='chat';s.selectedId.value='main';s.assistantBody.value={scrollTop:530,scrollLeft:0,focus(){doc.activeElement=this}}
 await s.setReaderFocus('assistant');assert.equal(s.assistantExpanded.value,true);assert.equal(s.assistantBody.value.scrollTop,530);assert.equal(s.assistantTab.value,'chat');assert.equal(s.question.value,'未发送的追问');assert.equal(s.history.value,history);assert.equal(s.analysis.value,analysis);assert.equal(s.selectedId.value,'main')
 await s.setReaderFocus('source');assert.equal(s.assistantExpanded.value,false);assert.equal(s.sourceExpanded.value,true);await s.setReaderFocus('');assert.equal(s.history.value,history)
})
test('Escape closes the reader and keyboard Tab stays inside the active reading panel',async()=>{
 const {state:s,doc}=page();const first={getClientRects:()=>[{}],getAttribute:()=>null,focus(){doc.activeElement=this}},last={...first,focus(){doc.activeElement=this}},viewport={}
 s.sourcePanel.value={contains:()=>true,querySelectorAll:()=>[first,last]};s.sourceReader.value={focusScroller:()=>{doc.activeElement=viewport}}
 await s.setReaderFocus('source');let prevented=false;doc.activeElement=last;s.readerKeydown({key:'Tab',target:last,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(doc.activeElement,first)
 prevented=false;s.readerKeydown({key:'Tab',target:first,shiftKey:true,preventDefault(){prevented=true}});assert.equal(doc.activeElement,last);assert.equal(prevented,true)
 await s.readerKeydown({key:'Escape',target:viewport,preventDefault(){},stopPropagation(){}});assert.equal(s.readerFocus.value,'');assert.equal(doc.body.style.overflow,'auto')
})
test('a compact picker exists only without a directory and outside expanded reading',async()=>{
 const {state:s,doc,media,dispose}=page();assert.equal(s.fileTreeVisible.value,true);assert.equal(s.showCompactFilePicker.value,false);media.matches=false;media.change();assert.equal(s.fileTreeVisible.value,false);assert.equal(s.showCompactFilePicker.value,true)
 await s.setReaderFocus('source');assert.equal(s.showCompactFilePicker.value,false);await s.setReaderFocus('');assert.equal(s.showCompactFilePicker.value,true)
 await s.setReaderFocus('assistant');dispose();assert.equal(doc.body.style.overflow,'auto');assert.equal(media.change,null)
})
test('the removed source metadata and coverage blocks are absent from the rendered template',()=>{
 const page=fs.readFileSync(new URL('../src/views/RobotProgram.vue',import.meta.url),'utf8'),source=page.slice(page.indexOf('<section ref="sourcePanel"'),page.indexOf('<Teleport to="body" :disabled="!assistantExpanded">'))
 assert.doesNotMatch(source,/source-heading|file-path|annotation-toolbar|current-source-name|selectedFile\?\.(?:encoding|lineCount|path)|本文件 \{\{/)
 assert.match(source,/<el-select v-if="showCompactFilePicker"/);assert.match(source,/只看注释行/);assert.match(source,/下一条注释/)
})
test('the source reader keeps all 509 lines while annotation visibility changes independently',()=>{
 const file={id:'main',name:'Main.mod',text:Array.from({length:509},(_,i)=>'! line '+(i+1)).join('\n')}
 const source=fs.readFileSync(new URL('../src/components/RobotSourceReader.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({useRoute:()=>({query:{}}),isAppSurface:()=>false,ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch(){},nextTick:async()=>{},rapidDocument,explanationReview:()=>[],defineProps:()=>({file,notes:[{fileId:'main',line:300,text:'已保存说明'}],onlyNotes:false,highlight:null}),defineExpose(){},localStorage:{getItem:()=>null}})
 vm.runInContext(source+'\nthis.state={visible,shownNotes,showNotes,viewport,captureScroll,restoreScroll};',context)
 const s=context.state;assert.equal(s.visible.value.length,509);assert.equal(s.visible.value.at(-1).number,509);assert.equal(s.shownNotes.value.size,1);s.showNotes.value=false;assert.equal(s.shownNotes.value.size,0);assert.equal(s.visible.value.length,509)
 s.viewport.value={scrollTop:4600,scrollLeft:70};const before=s.captureScroll();s.viewport.value.scrollTop=0;s.restoreScroll(before);assert.equal(s.viewport.value.scrollTop,4600);assert.equal(s.viewport.value.scrollLeft,70)
})


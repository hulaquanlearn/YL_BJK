import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {pdfFitScale} from '../src/utils/pdf-fit.mjs'
import {ref} from 'vue'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=()=>new Promise(r=>setImmediate(r))
function subject(){
 let destroy;const drawing=[],requested=[],nextDocument={value:null},props={file:new Blob(['%PDF-fixture']),initialPage:1},surface={clientWidth:800,clientHeight:600},canvas={style:{},getContext:()=>({})}
 const script=fs.readFileSync(new URL('../src/components/PdfReader.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'').replace("import('pdfjs-dist/legacy/build/pdf.mjs')",'loadPdfLibrary()').replace("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')",'loadPdfWorker()')
 const previewCanvases=[];const dom={createElement(){const image={width:0,height:0,getContext:()=>({}),toDataURL:()=>"data:image/png;base64,fixture"};previewCanvases.push(image);return image}};
 const ctx=vm.createContext({pdfFitScale,PdfWorker:class {terminate(){}},getComputedStyle:()=>({paddingLeft:"12",paddingRight:"12",paddingTop:"12",paddingBottom:"12"}),document:dom,ensurePdfCompatibility:async()=>{},Blob,ref,watch(){},defineProps:()=>props,readPdfData:async()=>new Uint8Array([1]),loadPdfWorker:async()=>({default:'worker-url'}),loadPdfLibrary:async()=>({GlobalWorkerOptions:{},PDFWorker:class {destroy(){}},getDocument:()=>({promise:Promise.resolve(nextDocument.value),destroy:async()=>{}})}),onMounted(){},onBeforeUnmount:fn=>{destroy=fn},window:{devicePixelRatio:1},setTimeout,clearTimeout})
 vm.runInContext(script+'\nthis.s={open,render,previewPage,pagePreview,previewBusy,page,error,busy,scale,wheelZoom,pointerStart,pointerMove,pointerEnd,fitPage,setDoc(doc){pdf=doc},setCanvas(c,s){canvas.value=c;surface.value=s}};',ctx);ctx.s.setCanvas(canvas,surface)
 function document(name,numPages=25,getPage){
  return {numPages,destroy:async()=>{},getPage:getPage||(async n=>{
   requested.push([name,n]);return {getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>{drawing.push(name);return {promise:Promise.resolve(),cancel(){}}}}
  })}
 }
 return {s:ctx.s,drawing,requested,previewCanvases,nextDocument,document,destroy:()=>destroy()}
}
test('switching PDF while its old page loads cannot paint the old document into the new reader',async()=>{const f=subject(),old=deferred(),next=deferred();f.s.setDoc(f.document('A',25,()=>old.promise));const p=f.s.render();f.nextDocument.value=next.promise;const opening=f.s.open();await tick();old.resolve({getViewport:()=>({width:600,height:800}),render:()=>{f.drawing.push('A');return {promise:Promise.resolve(),cancel(){}}}});await p;next.resolve(f.document('B'));await opening;assert.deepEqual(f.drawing,['B'])})
test('late render completion cannot clear the current page error',async()=>{const f=subject(),rendered=deferred();f.s.setDoc(f.document('A',25,async()=>({getViewport:()=>({width:600,height:800}),render:()=>({promise:rendered.promise,cancel(){}})})));const first=f.s.render();await tick();f.s.setDoc(f.document('B',25,async()=>{throw Error('cannot read B')}));await f.s.render();assert.ok(f.s.error.value);rendered.resolve();await first;assert.ok(f.s.error.value)})
test('manual page numbers display the same clamped integer that is actually rendered',async()=>{const f=subject();f.s.setDoc(f.document('A'));for(const [input,expected] of [[99,25],[-3,1],[2.5,2],['',1]]){f.s.page.value=input;await f.s.render();assert.equal(f.s.page.value,expected);assert.equal(f.requested.at(-1)[1],expected)}})


test("PDF page click opens a zoomable page image and releases the temporary rendering canvas",async()=>{
 const f=subject();f.s.setDoc(f.document("current"));await f.s.previewPage();assert.match(f.s.pagePreview.value,/^data:image\/png/);assert.equal(f.s.previewBusy.value,false);assert.equal(f.previewCanvases.length,1);assert.equal(f.previewCanvases[0].width,0);assert.equal(f.previewCanvases[0].height,0)
})
test("an enlarged page finishing after leaving is discarded",async()=>{
 const f=subject(),rendered=deferred();f.s.setDoc(f.document("current",25,async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:rendered.promise,cancel(){}})})));const pending=f.s.previewPage();await tick();f.destroy();rendered.resolve();await pending;assert.equal(f.s.pagePreview.value,"");assert.equal(f.previewCanvases[0].width,0)
})

test('PDF fits on open, zooms around the wheel/pinch point, pans, and resets without a size dropdown',async()=>{
 const f=subject(),area={clientWidth:800,clientHeight:600,scrollLeft:0,scrollTop:0,setPointerCapture(){},scrollTo(x,y){this.scrollLeft=x;this.scrollTop=y}},canvas={style:{},getContext:()=>({}),getBoundingClientRect(){return {left:12-area.scrollLeft,top:12-area.scrollTop,width:parseFloat(this.style.width),height:parseFloat(this.style.height)}}};f.s.setCanvas(canvas,area);f.s.setDoc(f.document('zoom'));await f.s.render();assert.equal(f.s.scale.value,1);
 const initial=parseFloat(canvas.style.width);f.s.wheelZoom({deltaY:-100,clientX:200,clientY:200});assert.ok(parseFloat(canvas.style.width)>initial);assert.ok(area.scrollLeft>0);
 const start=f.s.scale.value;f.s.pointerStart({pointerId:1,pointerType:'touch',clientX:100,clientY:100});f.s.pointerStart({pointerId:2,pointerType:'touch',clientX:200,clientY:100});f.s.pointerMove({pointerId:2,clientX:300,clientY:100});assert.ok(f.s.scale.value>start*1.9);f.s.pointerEnd({pointerId:2});const offset=area.scrollLeft;f.s.pointerMove({pointerId:1,clientX:50,clientY:100});assert.equal(area.scrollLeft,offset+50);f.s.pointerEnd({pointerId:1});f.s.fitPage();assert.equal(f.s.scale.value,1);assert.equal(area.scrollLeft,0);f.destroy();
 const template=fs.readFileSync(new URL('../src/components/PdfReader.vue',import.meta.url),'utf8').split('<script setup>')[0];assert.doesNotMatch(template,/el-select|PDF缩放/)
})

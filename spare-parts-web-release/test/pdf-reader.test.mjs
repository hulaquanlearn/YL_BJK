import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {pdfFitScale} from '../src/utils/pdf-fit.mjs'
import {readPdfData} from '../src/utils/pdf-document.mjs'

test('authenticated PDF bytes can be reread after PDF.js transfers its buffer, without fetching blob URLs',async()=>{
 const file=new Blob(['%PDF-1.4\nfile'],{type:'application/pdf'}),first=await readPdfData(file)
 structuredClone(first,{transfer:[first.buffer]});assert.equal(first.byteLength,0)
 assert.equal(new TextDecoder().decode(await readPdfData(file)),'%PDF-1.4\nfile')
 await assert.rejects(readPdfData(new Blob([])),/empty/)
})

function subject(file){
 let onUnmount=()=>{},parameters,loads=0
 const props={file,initialPage:2},source=fs.readFileSync(new URL('../src/components/PdfReader.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'').replace("import('pdfjs-dist/legacy/build/pdf.mjs')",'Promise.resolve(pdfLibrary)').replace("import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')","Promise.resolve({default:'/assets/pdf.worker.js'})")
 const context=vm.createContext({pdfFitScale,PdfWorker:class {terminate(){}},getComputedStyle:()=>({paddingLeft:"12",paddingRight:"12",paddingTop:"12",paddingBottom:"12"}),ensurePdfCompatibility:async()=>{},Blob,readPdfData,defineProps:()=>props,ref:value=>({value}),watch(){},onMounted(){},onBeforeUnmount:fn=>{onUnmount=fn},clearTimeout(){},window:{devicePixelRatio:1},pdfLibrary:{GlobalWorkerOptions:{},PDFWorker:class {destroy(){}},getDocument:options=>{parameters=options;loads++;return {promise:Promise.resolve({numPages:25,getPage:async()=>({getViewport:()=>({width:100,height:100}),render:()=>({promise:Promise.resolve(),cancel(){}})})}),destroy:async()=>{}}}}})
 vm.runInContext(source+'\ncanvas.value={style:{},getContext:()=>({})};surface.value={clientWidth:700,clientHeight:600};this.review={open,page,count,error};',context)
 return {state:context.review,options:()=>parameters,loads:()=>loads,unmount:onUnmount}
}
test('PDF reader sends bytes and local resources to PDF.js, preserving page selection and retry under connect-src self',async()=>{
 const file=new Blob(['%PDF-1.4\nfile'],{type:'application/pdf'}),s=subject(file);await s.state.open()
 assert.equal(s.options().url,undefined);assert.equal(s.options().data[0],37);assert.equal(s.options().cMapUrl,'/pdfjs/cmaps/');assert.equal(s.state.page.value,2);assert.equal(s.state.count.value,25);assert.equal(s.state.error.value,'')
 await s.state.open();assert.equal(s.loads(),2)
})
test('leaving during the file read cannot open a stale PDF task',async()=>{
 let resolve;const s=subject({arrayBuffer:()=>new Promise(r=>{resolve=r})}),pending=s.state.open();await new Promise(r=>setImmediate(r));s.unmount();resolve(new ArrayBuffer(8));await pending;assert.equal(s.loads(),0)
})

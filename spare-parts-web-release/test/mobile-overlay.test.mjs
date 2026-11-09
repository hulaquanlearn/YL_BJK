import test from 'node:test'
import assert from 'node:assert/strict'
import {closeMobileOverlay} from '../src/utils/mobile-overlay.mjs'
function layer(kind,z,{visible=true,closable=true,disabled=false}={}){
 const item={clicked:0,style:{zIndex:String(z)},classList:{contains:value=>value===kind},getClientRects:()=>visible?[{}]:[],querySelector:()=>closable?{disabled,getAttribute:()=>null,click:()=>item.clicked++}:null}
 return item
}
const page=layers=>({querySelectorAll:()=>layers,body:{}})
test('Back closes the image above its PDF dialog without leaving the page',()=>{
 const pdf=layer('el-dialog',2001),image=layer('el-image-viewer__wrapper',2003)
 assert.equal(closeMobileOverlay(page([pdf,image])),true);assert.equal(image.clicked,1);assert.equal(pdf.clicked,0)
})
test('a confirmation or an unclosable saving form consumes Back without bypassing protection',()=>{
 for(const overlay of [layer('el-message-box',2005),layer('el-dialog',2001,{closable:false}),layer('el-dialog',2001,{disabled:true})]){assert.equal(closeMobileOverlay(page([overlay])),true);assert.equal(overlay.clicked,0)}
})
test('hidden overlays do not swallow Back and nested layers inherit their overlay z-index',()=>{
 const hidden=layer('el-dialog',3000,{visible:false});assert.equal(closeMobileOverlay(page([hidden])),false)
 const pdf=layer('el-dialog',0),image=layer('el-image-viewer__wrapper',2003);pdf.parentElement={style:{zIndex:'2008'}}
 assert.equal(closeMobileOverlay(page([pdf,image])),true);assert.equal(pdf.clicked,1);assert.equal(image.clicked,0)
})

test('Back invokes a dialog\'s explicit custom close control when its standard header button is hidden',()=>{
 const detail=layer('el-dialog',2001,{closable:false})
 detail.querySelector=selector=>selector.includes('[data-workbench-close]')?{disabled:false,getAttribute:()=>null,click:()=>detail.clicked++}:null
 assert.equal(closeMobileOverlay(page([detail])),true);assert.equal(detail.clicked,1)
})

// Native Back closes the visible layer before attempting guarded route navigation.
export function closeMobileOverlay(documentObject=globalThis.document,styleFor=globalThis.getComputedStyle) {
 if(!documentObject?.querySelectorAll)return false
 const picker=documentObject.querySelector?.('.workbench-picker input[aria-expanded="true"]')
 if(picker){
  picker.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))
  return true
 }
 const layers=[...documentObject.querySelectorAll('.el-image-viewer__wrapper, .el-dialog, .el-drawer, .el-message-box')]
  .filter(element=>element.getClientRects().length)
  .map((element,index)=>{
   let z=0
   for(let current=element;current&&current!==documentObject.body;current=current.parentElement){const value=Number.parseInt(styleFor?.(current)?.zIndex||current.style?.zIndex,10);if(Number.isFinite(value))z=Math.max(z,value)}
   return {element,z,index}
  }).sort((a,b)=>b.z-a.z||b.index-a.index)
 const top=layers[0]?.element
 if(!top)return false
 // Never navigate behind a confirmation, or bypass a form's before-close hook.
 if(top.classList.contains('el-message-box'))return true
 const close=top.querySelector('.el-image-viewer__close, .el-dialog__headerbtn, .el-drawer__close-btn, [data-workbench-close]')
 if(close&&!close.disabled&&close.getAttribute('aria-disabled')!=='true')close.click()
 return true
}

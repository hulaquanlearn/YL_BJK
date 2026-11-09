import {ref,onMounted,onBeforeUnmount} from 'vue'

export function useModelFullscreen(element){
 const fullscreen=ref(false);let fallback=false,oldOverflow=''
 const sync=()=>{fullscreen.value=document.fullscreenElement===element.value||fallback}
 function release(){if(fallback){fallback=false;document.body.style.overflow=oldOverflow}sync()}
 async function close(){if(document.fullscreenElement===element.value)await document.exitFullscreen();release()}
 async function toggle(){
  if(fullscreen.value){await close();return}
  try{if(!element.value?.requestFullscreen)throw Error('unsupported');await element.value.requestFullscreen();sync()}
  catch{oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';fallback=true;sync()}
 }
 const key=event=>{if(event.key==='Escape'&&fallback){event.preventDefault();release()}}
 onMounted(()=>{document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',key)})
 onBeforeUnmount(()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',key);release();if(document.fullscreenElement===element.value)document.exitFullscreen().catch(()=>{})})
 return {fullscreen,toggle,close}
}

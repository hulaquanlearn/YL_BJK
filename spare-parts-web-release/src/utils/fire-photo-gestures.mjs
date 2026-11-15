// Keep the viewer's close/focus/scroll lifecycle. Only App image gestures change.
export function createFirePhotoMarker() {
  let dispose,generation=0,currentMarker=null
  return marker => {
    if(marker===currentMarker)return
    currentMarker=marker
    const current=++generation;dispose?.();dispose=undefined
    // The toolbar ref mounts before the viewer's image sibling.
    if(marker)queueMicrotask(()=>{if(current===generation&&marker.isConnected)dispose=attachGestures(marker)})
  }
}

function attachGestures(marker) {
  const viewer=marker.closest('.el-image-viewer__wrapper'),image=viewer?.querySelector('.el-image-viewer__img')
  if(!viewer||!image)return
  const canvas=image.parentElement,pointers=new Map(),listeners=[]
  const original={transform:image.style.transform,transition:image.style.transition,cursor:image.style.cursor,touchAction:canvas.style.touchAction,overflow:canvas.style.overflow}
  let scale=1,x=0,y=0,gesture=null,tap=null,lastTap=null,pinched=false,lastTouchAt=0
  const ready=()=>image.complete&&image.naturalWidth>0
  const on=(target,type,fn)=>{target.addEventListener(type,fn,{capture:true,passive:false});listeners.push(()=>target.removeEventListener(type,fn,true))}
  const point=event=>{const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2}}
  const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)}}
  function paint(nextScale=scale,nextX=x,nextY=y){
    scale=Math.max(1,Math.min(5,nextScale))
    const maxX=Math.max(0,(image.offsetWidth*scale-canvas.clientWidth)/2),maxY=Math.max(0,(image.offsetHeight*scale-canvas.clientHeight)/2)
    x=scale===1?0:Math.max(-maxX,Math.min(maxX,nextX));y=scale===1?0:Math.max(-maxY,Math.min(maxY,nextY))
    image.style.transform=`translate(${x}px, ${y}px) scale(${scale})`;image.style.transition='none';image.style.cursor=scale>1?'grab':'zoom-in'
    viewer.dataset.photoScale=String(scale)
  }
  function rebase(){
    if(pointers.size>=2)gesture={...pair(),scale,offsetX:x,offsetY:y,pinch:true}
    else if(pointers.size===1)gesture={point:[...pointers.values()][0],x,y}
    else gesture=null
  }
  function zoomAt(value,p){const ratio=Math.max(1,Math.min(5,value))/scale;paint(value,p.x-(p.x-x)*ratio,p.y-(p.y-y)*ratio)}
  function toggle(event){if(!ready()||event.type==='dblclick'&&Date.now()-lastTouchAt<500)return;event.preventDefault();event.stopPropagation();scale>1?paint(1,0,0):zoomAt(2.5,point(event));rebase()}
  function start(event){
    if(!ready()||event.pointerType==='mouse'&&event.button!==0)return
    event.preventDefault();event.stopPropagation()
    const p=point(event);if(!pointers.size){pinched=false;tap={...p,time:Date.now()}}
    pointers.set(event.pointerId,p);if(pointers.size>1){pinched=true;tap=lastTap=null}
    try{canvas.setPointerCapture(event.pointerId)}catch{}
    rebase()
  }
  function move(event){
    if(!pointers.has(event.pointerId))return
    event.preventDefault();event.stopPropagation();const p=point(event);pointers.set(event.pointerId,p)
    if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>8)tap=null
    if(pointers.size>=2&&gesture?.pinch){
      const current=pair(),nextScale=Math.max(1,Math.min(5,gesture.scale*current.distance/Math.max(1,gesture.distance))),ratio=nextScale/gesture.scale
      paint(nextScale,current.x-(gesture.x-gesture.offsetX)*ratio,current.y-(gesture.y-gesture.offsetY)*ratio)
    }else if(gesture?.point&&scale>1)paint(scale,gesture.x+p.x-gesture.point.x,gesture.y+p.y-gesture.point.y)
  }
  function finish(event){
    if(!pointers.has(event.pointerId))return
    pointers.delete(event.pointerId)
    const cancelled=event.type!=='pointerup'
    if(event.pointerType!=='mouse')lastTouchAt=Date.now()
    if(!cancelled&&!pinched&&tap&&event.pointerType!=='mouse'&&Date.now()-tap.time<280){
      const p=point(event),now=Date.now()
      if(lastTap&&now-lastTap.time<320&&Math.hypot(p.x-lastTap.x,p.y-lastTap.y)<30){toggle(event);lastTap=null}else lastTap={...p,time:now}
    }
    tap=null;if(cancelled)lastTap=null;rebase()
  }
  const suppress=event=>{if(event.target===image||canvas.contains(event.target)){event.preventDefault();event.stopPropagation()}}
  on(canvas,'pointerdown',start);on(canvas,'pointermove',move);on(canvas,'pointerup',finish);on(canvas,'pointercancel',finish);on(canvas,'lostpointercapture',finish)
  // Stop the viewer's independent drag handler from moving the image a second time.
  on(canvas,'touchstart',suppress);on(canvas,'touchmove',suppress);on(canvas,'mousedown',suppress);on(canvas,'dblclick',toggle)
  on(canvas,'wheel',event=>{event.preventDefault();event.stopPropagation();if(ready())zoomAt(scale*(event.deltaY<0?1.2:1/1.2),point(event))})
  on(viewer,'keydown',event=>{
    if(!['ArrowUp','ArrowDown','+','=','-','0',' '].includes(event.key)||!ready())return
    event.preventDefault();event.stopPropagation();event.key==='0'||event.key===' '?paint(1,0,0):zoomAt(scale*(['ArrowDown','-'].includes(event.key)?1/1.2:1.2),{x:0,y:0})
  })
  on(image,'load',()=>{paint(1,0,0);pointers.clear();gesture=tap=lastTap=null})
  canvas.style.touchAction='none';canvas.style.overflow='hidden';paint()
  const observer=new ResizeObserver(()=>{paint();rebase()});observer.observe(canvas);observer.observe(image)
  return ()=>{
    listeners.forEach(remove=>remove());observer.disconnect();pointers.clear()
    Object.assign(image.style,{transform:original.transform,transition:original.transition,cursor:original.cursor});canvas.style.touchAction=original.touchAction;canvas.style.overflow=original.overflow;delete viewer.dataset.photoScale
  }
}

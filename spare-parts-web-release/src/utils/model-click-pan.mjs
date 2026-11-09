import {Vector3} from 'three'

// Capture before Orbit/Trackball controls so right-click never starts a drag.
export function installModelClickPan({element,camera,controls,onChange=()=>{},ownerDocument=element.ownerDocument}){
 let active=false,last=null,armed=false
 const ownerWindow=ownerDocument.defaultView,offset=new Vector3(),right=new Vector3(),up=new Vector3()
 function stop(){armed=false;last=null;if(active){active=false;onChange(false)}}
 function consume(event){event.preventDefault();event.stopImmediatePropagation()}
 function down(event){
  if(event.pointerType!=='mouse')return
  if(event.button===2){consume(event);armed=true;last={x:event.clientX,y:event.clientY};return}
  if(active){consume(event);stop()}
 }
 function release(event){
  if(event.pointerType!=='mouse'||event.button!==2)return
  consume(event)
  if(!armed)return
  armed=false;active=!active;last={x:event.clientX,y:event.clientY}
  controls.clearMotion?.();onChange(active)
 }
 function move(event){
  if(!active||event.pointerType!=='mouse'||event.buttons!==0)return
  consume(event)
  const dx=event.clientX-last.x,dy=event.clientY-last.y;last={x:event.clientX,y:event.clientY}
  const height=element.getBoundingClientRect().height;if(!height||(!dx&&!dy))return
  camera.updateMatrixWorld()
  const span=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*camera.position.distanceTo(controls.target)/camera.projectionMatrix.elements[5]
  right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1)
  offset.copy(right).multiplyScalar(-dx*span/height).addScaledVector(up,dy*span/height)
  camera.position.add(offset);controls.target.add(offset)
  controls.dispatchEvent({type:'change'})
 }
 function outside(event){if(!element.contains(event.target))stop()}
 function key(event){if(event.key==='Escape')stop()}
 function hidden(){if(ownerDocument.hidden)stop()}
 function context(event){consume(event)}
 const listeners=[[element,'pointerdown',down,true],[element,'pointerup',release,true],[element,'pointermove',move,true],[element,'contextmenu',context,true],[element,'pointerleave',stop],[element,'pointercancel',stop],[ownerDocument,'pointerdown',outside,true],[ownerDocument,'keydown',key],[ownerDocument,'visibilitychange',hidden],[ownerWindow,'blur',stop]]
 for(const [target,type,listener,capture] of listeners)target.addEventListener(type,listener,capture)
 return {get active(){return active},stop,dispose(){stop();for(const [target,type,listener,capture] of listeners)target.removeEventListener(type,listener,capture)}}
}

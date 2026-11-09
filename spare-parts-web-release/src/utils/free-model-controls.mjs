import {TrackballControls} from 'three/addons/controls/TrackballControls.js'
import {Vector3,Quaternion} from 'three'

// Trackball rotation crosses both poles and permits viewing the underside.
// Keep the small OrbitControls interface used by the existing viewers.
export class FreeModelControls extends TrackballControls{
 constructor(camera,element){
  super(camera,element)
  this.autoRotate=false;this.autoRotateSpeed=.7;this.rotateSpeed=2.5
  this.dynamicDampingFactor=.18;this._dragging=false
  this.addEventListener('start',()=>{this._dragging=true})
  this.addEventListener('end',()=>{this._dragging=false})
 }
 get enableDamping(){return !this.staticMoving}
 set enableDamping(value){this.staticMoving=!value}
 saveState(){this._target0.copy(this.target);this._position0.copy(this.object.position);this._up0.copy(this.object.up);this._zoom0=this.object.zoom}
 clearMotion(){this._lastAngle=0;this._movePrev?.copy(this._moveCurr);this._zoomStart?.copy(this._zoomEnd);this._panStart?.copy(this._panEnd)}
 update(delta=1/60){
  const before=this.object.position.clone(),rotation=this.object.quaternion.clone(),up=this.object.up.clone()
  if(this.autoRotate&&!this._dragging){
   const turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),2*Math.PI/60*this.autoRotateSpeed*delta)
   this.object.position.sub(this.target).applyQuaternion(turn).add(this.target);this.object.up.applyQuaternion(turn)
  }
  super.update()
  return before.distanceToSquared(this.object.position)>1e-12||rotation.angleTo(this.object.quaternion)>1e-6||up.distanceToSquared(this.object.up)>1e-12
 }
}

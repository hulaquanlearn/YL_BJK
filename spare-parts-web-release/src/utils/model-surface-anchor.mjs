import {Box3,Vector3,Raycaster,Matrix4} from 'three'

const samples=new WeakMap()
export function objectVisible(object){for(let node=object;node;node=node.parent)if(!node.visible)return false;return true}
function triangleSamples(geometry){
 if(samples.has(geometry))return samples.get(geometry)
 const position=geometry.attributes.position,index=geometry.index,count=Math.floor((index?.count||position?.count||0)/3),points=[]
 for(let i=0;i<count;i+=Math.max(1,Math.floor(count/48))){
  const p=new Vector3()
  for(let j=0;j<3;j++)p.add(new Vector3().fromBufferAttribute(position,index?index.getX(i*3+j):i*3+j))
  points.push(p.multiplyScalar(1/3))
 }
 samples.set(geometry,points);return points
}
// Every returned point lies on a triangle of a visible mesh, never in a union-box gap.
export function modelSurfaceAnchor(objects,camera,{attachment=false}={}){
 const meshes=[]
 for(const root of objects||[])root?.traverse(node=>{if(node.isMesh&&node.geometry?.attributes.position&&objectVisible(node))meshes.push(node)})
 if(!meshes.length)return null
 const box=new Box3();for(const mesh of meshes)box.expandByObject(mesh)
 const center=box.getCenter(new Vector3()),extent=Math.max(box.getSize(new Vector3()).length(),.001),eye=camera?.getWorldPosition(new Vector3())
 let best=null,bestMesh=null,bestInstance=null,score=Infinity
 const clipped=(mesh,point)=>{const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];return materials.every(m=>m.clippingPlanes?.some(p=>p.distanceToPoint(point)<0))}
 for(const mesh of meshes){
  const count=mesh.isInstancedMesh?mesh.count:1
  for(let instance=0;instance<count;instance++){
   const transform=mesh.matrixWorld.clone()
   if(mesh.isInstancedMesh){const local=new Matrix4();mesh.getMatrixAt(instance,local);transform.multiply(local)}
   for(const sample of triangleSamples(mesh.geometry)){
    const point=sample.clone().applyMatrix4(transform);if(clipped(mesh,point))continue
    const distance=point.distanceToSquared(center)/(extent*extent)+(eye?point.distanceTo(eye)*.01/extent:0)
    if(distance<score){score=distance;best=point;bestMesh=mesh;bestInstance=mesh.isInstancedMesh?instance:null}
   }
  }
 }
 if(!best)return null
 if(camera){
  const ray=new Raycaster(eye,best.clone().sub(eye).normalize()),hit=ray.intersectObjects(meshes,false).find(hit=>!clipped(hit.object,hit.point))
  if(hit){best=hit.point;bestMesh=hit.object;bestInstance=hit.instanceId??null}
  const projected=best.clone().project(camera);if(projected.z< -1||projected.z>1)return null
 }
 if(!attachment)return best
 const transform=bestMesh.matrixWorld.clone()
 if(bestInstance!==null){const instance=new Matrix4();bestMesh.getMatrixAt(bestInstance,instance);transform.multiply(instance)}
 return {object:bestMesh,geometry:bestMesh.geometry,localPoint:best.clone().applyMatrix4(transform.invert()),instanceId:bestInstance}
}

// Keep a real triangle attachment while a rigid part moves. Camera/view changes
// request a new visible surface; ordinary joint animation only transforms it.
export function createModelAnchorTracker(){
 const entries=new Map(),matrix=new Matrix4(),instance=new Matrix4()
 return {
  clear(){entries.clear()},
  get(id,objects,camera){
   let entry=entries.get(id)
   if(entry&&(!objectVisible(entry.object)||entry.geometry!==entry.object.geometry||entry.roots.length!==objects.length||entry.roots.some((root,i)=>root!==objects[i])))entry=null
   if(!entry){const found=modelSurfaceAnchor(objects,camera,{attachment:true});if(!found){entries.delete(id);return null}entry={...found,roots:objects.slice()};entries.set(id,entry)}
   matrix.copy(entry.object.matrixWorld)
   if(entry.instanceId!==null){entry.object.getMatrixAt(entry.instanceId,instance);matrix.multiply(instance)}
   const point=entry.localPoint.clone().applyMatrix4(matrix)
   if(camera){const projected=point.clone().project(camera);if(projected.z< -1||projected.z>1)return null}
   return point
  }
 }
}

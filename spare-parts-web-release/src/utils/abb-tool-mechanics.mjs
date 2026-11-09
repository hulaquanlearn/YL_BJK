import {Box3,Vector3,Matrix4,Quaternion,MathUtils,Mesh,CylinderGeometry,MeshStandardMaterial,Float32BufferAttribute,DataTexture,RGBAFormat,RepeatWrapping,SRGBColorSpace} from 'three'
import {clearMovingPinSlot} from './abb-tool-clearance.mjs'

const sourceNode=(root,id)=>{let found;root.traverse(n=>{if(n.userData.sourceInstance===String(id))found=n});return found}
const center=node=>new Box3().setFromObject(node).getCenter(new Vector3())
const around=(point,rotation)=>new Matrix4().makeTranslation(...point.toArray()).multiply(new Matrix4().makeRotationFromQuaternion(rotation)).multiply(new Matrix4().makeTranslation(...point.clone().negate().toArray()))

export function createToolMechanics(root,type){
 root.updateMatrixWorld(true)
 const rotorAssembly=sourceNode(root,72),rotor=sourceNode(root,73),guard=sourceNode(root,type==='tool-640'?159:135)
 if(!rotorAssembly||!rotor||!guard)throw Error('布料头打散轴或护罩部件缺失')
 // The 640 source reuses a 550 mm roller, offset 50 mm, beside a 648 mm belt.
 if(type==='tool-640'){
  const inverse=root.matrixWorld.clone().invert(),axisCenter=center(rotor).applyMatrix4(inverse)
  let belt;root.traverse(n=>{if(n.name.includes('皮带U17'))belt=n})
  const ratio=new Box3().setFromObject(belt).getSize(new Vector3()).z/new Box3().setFromObject(rotor).getSize(new Vector3()).z
  const matrix=new Matrix4().makeTranslation(0,0,-axisCenter.z*ratio).multiply(new Matrix4().makeScale(1,1,ratio)).multiply(inverse.clone().multiply(rotorAssembly.matrixWorld))
  const parent=root.matrixWorld.clone().invert().multiply(rotorAssembly.parent.matrixWorld).invert()
  rotorAssembly.matrix.copy(parent.multiply(matrix));rotorAssembly.matrix.decompose(rotorAssembly.position,rotorAssembly.quaternion,rotorAssembly.scale);root.updateMatrixWorld(true)
 }
 const invRoot=root.matrixWorld.clone().invert(),point=n=>center(n).applyMatrix4(invRoot)
 const rake=sourceNode(root,type==='tool-640'?169:187)
 const supports=(type==='tool-640'?[145,182]:[185,186]).map(id=>sourceNode(root,id))
 if(rake&&supports.every(Boolean)){
  const bounds=new Box3().setFromObject(rake),a=point(supports[0]).z,b=point(supports[1]).z,width=Math.abs(a-b),ratio=width/bounds.getSize(new Vector3()).z
  const target=(a+b)/2,current=bounds.getCenter(new Vector3()).applyMatrix4(invRoot).z
  const correction=new Matrix4().makeTranslation(0,0,target-current*ratio).multiply(new Matrix4().makeScale(1,1,ratio))
  const local=rake.parent.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(correction).multiply(invRoot.clone().multiply(rake.matrixWorld))
  local.decompose(rake.position,rake.quaternion,rake.scale);rake.updateMatrix();root.updateMatrixWorld(true)
 }
 const hingeIds=type==='tool-640'?[158,160]:[136,137],hingeA=sourceNode(root,hingeIds[0]),hingeB=sourceNode(root,hingeIds[1])
 if(!hingeA||!hingeB)throw Error('护罩铰轴缺失')
 const pivot=point(hingeA).add(point(hingeB)).multiplyScalar(.5),axis=point(hingeB).sub(point(hingeA)).normalize()
 if(axis.z<0)axis.negate()
 const frame=sourceNode(root,type==='tool-640'?140:165)
 const clearance=type==='tool-640'?clearMovingPinSlot(root,frame,pivot,point(sourceNode(root,161)),axis,MathUtils.degToRad(50)):null
 const ids=type==='tool-640'?[[123,157,129,126,125],[132,163,138,135,134]]:[[123,139,140,126,125],[128,138,141,131,130]]
 const snapshots=new Map()
 function capture(node){if(node&&!snapshots.has(node))snapshots.set(node,invRoot.clone().multiply(node.matrixWorld));return node}
 capture(guard);capture(rotor)
 const cylinders=ids.map(([bodyId,baseId,eyeId,rodId,nutId],side)=>{
  const body=capture(sourceNode(root,bodyId)),eye=capture(sourceNode(root,eyeId)),rod=capture(sourceNode(root,rodId)),nut=capture(sourceNode(root,nutId)),baseNode=sourceNode(root,baseId)
  if(!body||!eye||!rod||!baseNode)throw Error('气缸连接部件缺失')
  const eyeIds=type==='tool-640'?(side?[162]:[161]):(side?[147]:[142])
  const bodyIds=type==='tool-640'?(side?[137,139]:[128,130]):(side?[150,151,154,155]:[148,149,152,153])
  const eyeAux=eyeIds.map(id=>capture(sourceNode(root,id))).filter(Boolean),restEye=point(eyeAux[0]||eye),eyeCenter=point(eye)
  restEye.z=eyeCenter.z
  const base=point(baseNode);base.z=restEye.z
  const direction=restEye.clone().sub(base),length=direction.length(),guardBounds=new Box3().setFromObject(guard),seat=side?guardBounds.min.z:guardBounds.max.z
  const pin=new Mesh(new CylinderGeometry(.004,.004,Math.abs(restEye.z-seat)+.008,12),new MeshStandardMaterial({color:'#b9c2c7',metalness:.72,roughness:.34}));pin.name='护罩气缸连接销_'+side;pin.rotation.x=Math.PI/2;pin.position.set(restEye.x,restEye.y,(restEye.z+seat)/2);root.add(pin);pin.updateMatrixWorld(true);capture(pin)
  return {body,eye,rod,nut,pin,base,restEye,direction:direction.normalize(),length,restStroke:Math.abs(rod.position.x),eyeAux,bodyAux:bodyIds.map(id=>capture(sourceNode(root,id))).filter(Boolean)}
 })
 const rotorAxis=point(sourceNode(root,77)).sub(point(sourceNode(root,75))).normalize(),rotorCenter=point(rotor)
 function place(node,transform){
  if(!node)return
  root.updateMatrixWorld(true);node.parent.updateWorldMatrix(true,false)
  const local=node.parent.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(transform).multiply(snapshots.get(node))
  local.decompose(node.position,node.quaternion,node.scale);node.updateMatrix();node.updateWorldMatrix(false,true)
 }
 function setGuard(amount){
  const rotation=new Quaternion().setFromAxisAngle(axis,MathUtils.degToRad(type==='tool-640'?50:-55)*MathUtils.clamp(Number(amount)||0,0,1)),hinge=around(pivot,rotation),states=[]
  for(const c of cylinders){
   const eye=c.restEye.clone().applyMatrix4(hinge),direction=eye.clone().sub(c.base),length=direction.length(),extension=length-c.length
   if(c.restStroke+extension<-.001||c.restStroke+extension>.0551)throw Error('护罩角度超出55mm气缸行程')
   states.push({c,eye,direction:direction.normalize(),extension})
  }
  place(guard,hinge)
  for(const {c,eye,direction,extension} of states){
   const turn=around(c.base,new Quaternion().setFromUnitVectors(c.direction,direction)),slide=new Matrix4().makeTranslation(...direction.clone().multiplyScalar(extension).toArray()).multiply(turn)
   place(c.body,turn);for(const node of c.bodyAux)place(node,turn);place(c.rod,slide);place(c.nut,slide);place(c.eye,hinge);place(c.pin,hinge);for(const node of c.eyeAux)place(node,hinge)
  }
  root.updateMatrixWorld(true)
  return states.map(s=>({base:s.c.base.clone(),eye:s.eye.clone(),extension:s.extension}))
 }
 function setRotor(angle){place(rotor,around(rotorCenter,new Quaternion().setFromAxisAngle(rotorAxis,angle)))}
 let belt;root.traverse(n=>{if(n.isMesh&&n.name.includes('皮带U17'))belt=n})
 const drums=[sourceNode(root,5),sourceNode(root,55)]
 if(!belt||drums.some(n=>!n))throw Error('布料头皮带或驱动滚筒缺失')
 const drumCenters=drums.map(point),travelAxis=drumCenters[1].clone().sub(drumCenters[0]).normalize(),beltAxis=new Vector3(0,0,1)
 const normal=new Vector3().crossVectors(beltAxis,travelAxis);if(normal.y<0)normal.negate()
 const length=drumCenters[0].distanceTo(drumCenters[1]),radius=.06,perimeter=2*length+2*Math.PI*radius
 // Add surface coordinates only. Preserve the CAD positions and closed loop.
 belt.geometry=belt.geometry.clone();const positions=belt.geometry.attributes.position,uv=[],vertex=new Vector3(),transform=invRoot.clone().multiply(belt.matrixWorld)
 for(let i=0;i<positions.count;i++){
  vertex.fromBufferAttribute(positions,i).applyMatrix4(transform).sub(drumCenters[0]);const along=vertex.dot(travelAxis),height=vertex.dot(normal)
  let distance
  if(along>length)distance=length+(Math.PI/2-Math.atan2(height,along-length))*radius
  else if(along<0){let angle=Math.atan2(height,along);if(angle>Math.PI/2)angle-=2*Math.PI;distance=2*length+Math.PI*radius+(-Math.PI/2-angle)*radius}
  else distance=height>=0?along:2*length+Math.PI*radius-along
  uv.push(distance/perimeter,vertex.z/.648)
 }
 belt.geometry.setAttribute('uv',new Float32BufferAttribute(uv,2))
 const pixels=new Uint8Array(64*8*4)
 for(let y=0;y<8;y++)for(let x=0;x<64;x++){const seam=x<2,grain=(x*13+y*7)%9;pixels.set(seam?[211,202,151,255]:[244-grain,235-grain,189-grain,255],(y*64+x)*4)}
 const beltTexture=new DataTexture(pixels,64,8,RGBAFormat);beltTexture.colorSpace=SRGBColorSpace;beltTexture.wrapS=beltTexture.wrapT=RepeatWrapping;beltTexture.repeat.set(8,1);beltTexture.needsUpdate=true
 belt.material=belt.material.clone();belt.material.color.set('#ffffff');belt.material.metalness=.03;belt.material.roughness=.8;belt.material.map=beltTexture;belt.material.name='yellow-conveyor-belt';belt.material.needsUpdate=true
 drums.forEach(capture)
 function setBeltTravel(distance){
  if(!Number.isFinite(distance))return
  beltTexture.offset.x=distance/perimeter*8
  drums.forEach((drum,i)=>place(drum,around(drumCenters[i],new Quaternion().setFromAxisAngle(beltAxis,-distance/radius))))
 }
 return {setGuard,setRotor,setBeltTravel,belt,beltTexture,drums,pivot,axis,rotorCenter,rotorAxis,cylinders,rake,supports,frame,clearance}
}

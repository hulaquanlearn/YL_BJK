import {BufferGeometry,Float32BufferAttribute,Mesh,Box3,Matrix4,Vector3} from 'three'

function surface(mesh,rings){
 const p0=new Vector3(...rings.at(-1)[0]),p1=new Vector3(...rings.at(-1)[1]),p2=new Vector3(...rings.at(-1)[2]);if(p1.sub(p0).cross(p2.sub(p0)).y<0)rings=rings.map(r=>r.slice().reverse())
 const positions=[],uv=[],indices=[]
 for(const ring of rings)for(const p of ring){positions.push(...p);uv.push(p[0]*2,p[2]*2)}
 for(let level=1;level<rings.length;level++)for(let i=0;i<4;i++){const a=(level-1)*4+i,b=(level-1)*4+(i+1)%4,c=level*4+i,d=level*4+(i+1)%4;indices.push(a,b,c,b,d,c)}
 const last=rings.at(-1),center=last.reduce((v,p)=>v.add(new Vector3(...p)),new Vector3()).multiplyScalar(.25),tip=positions.length/3
 positions.push(center.x,center.y+.006,center.z);uv.push(center.x*2,center.z*2)
 for(let i=0;i<4;i++)indices.push((rings.length-1)*4+i,(rings.length-1)*4+(i+1)%4,tip)
 indices.push(0,2,1,0,3,2)
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();mesh.geometry.dispose();mesh.geometry=geometry
}
const rectangle=(y,w,d)=>[[-w/2,y,-d/2],[-w/2,y,d/2],[w/2,y,d/2],[w/2,y,-d/2]]
const slab=(a,b,t)=>{const h=b.y-a.y,dw=b.w-a.w,dd=b.d-a.d;return h*(a.w*a.d*t+(a.w*dd+a.d*dw)*t*t/2+dw*dd*t*t*t/3)}
export function createHopperStock(material){
 const mesh=new Mesh(new BufferGeometry(),material);mesh.name='hopper-stock';mesh.receiveShadow=true
 let previous='',info=null
 function update(data,fraction){
  fraction=Math.max(0,Math.min(1,fraction));mesh.visible=fraction>1e-5
  if(!mesh.visible)return false
  const {outlet:o,shrinkingHopper:s,upperHopper:u}=data||{};if(!o||!s||!u){mesh.visible=false;return false}
  const key=JSON.stringify([o,s,u,Math.round(fraction*10000)]);if(key===previous)return false;previous=key
  const margin=.012,profile=[{y:o.bottomY+.015,w:o.innerWidth-margin*2,d:o.innerDepth-margin*2},{y:s.bottomY,w:s.bottomInnerWidth-margin*2,d:s.bottomInnerDepth-margin*2},{y:s.topY,w:s.topInnerWidth-margin*2,d:s.topInnerDepth-margin*2},{y:u.topY-.045,w:u.innerWidth-margin*2,d:u.innerDepth-margin*2}]
  const capacity=profile.slice(1).reduce((v,b,i)=>v+slab(profile[i],b,1),0),wanted=capacity*fraction;let total=0,top=profile[0],rings=[rectangle(top.y,top.w,top.d)]
  for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i],volume=slab(a,b,1);if(total+volume<wanted-1e-10){rings.push(rectangle(b.y,b.w,b.d));total+=volume;top=b;continue}let lo=0,hi=1;for(let k=0;k<25;k++){const t=(lo+hi)/2;if(total+slab(a,b,t)<wanted)lo=t;else hi=t}const t=(lo+hi)/2;top={y:a.y+(b.y-a.y)*t,w:a.w+(b.w-a.w)*t,d:a.d+(b.d-a.d)*t};rings.push(rectangle(top.y,top.w,top.d));break}
  surface(mesh,rings);info={fraction,height:top.y,width:top.w,depth:top.d,geometricCapacity:capacity};return true
 }
 return {mesh,update,inspect:()=>info,dispose(){mesh.geometry.dispose();mesh.removeFromParent()}}
}

function localBounds(node,owner){
 const box=new Box3(),inverse=owner.matrixWorld.clone().invert();node.traverse(mesh=>{if(!mesh.isMesh)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)))});return box
}
function beltVolume(mesh,sections,up,across,along){
 const positions=[],uv=[],indices=[]
 function quad(points,normal){const [a,b,c]=points,face=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a));if(face.dot(normal)<0)points=points.slice().reverse();const start=positions.length/3;for(const p of points){positions.push(...p.toArray());uv.push(p.x*2,p.z*2)}indices.push(start,start+1,start+2,start,start+2,start+3)}
 for(let i=1;i<sections.length;i++){const a=sections[i-1],b=sections[i];quad([a[2],a[3],b[3],b[2]],up);quad([a[0],a[1],b[1],b[0]],up.clone().negate());quad([a[0],a[2],b[2],b[0]],across.clone().negate());quad([a[1],a[3],b[3],b[1]],across)}
 const cap=s=>[s[0],s[1],s[3],s[2]];quad(cap(sections[0]),along.clone().negate());quad(cap(sections.at(-1)),along)
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();mesh.geometry.dispose();mesh.geometry=geometry
}
export function createBucketStock(material){
 const ownMaterial=material.clone();ownMaterial.map=material.map?.clone();ownMaterial.bumpMap=ownMaterial.map
 const mesh=new Mesh(new BufferGeometry(),ownMaterial);mesh.name='bucket-stock';mesh.receiveShadow=true
 let owner=null,bed=null,previous='',travel=0
 function configure(tool,rig){
  owner=tool;bed=null;previous='';if(!tool)return
  tool.updateWorldMatrix(true,true);let belt=rig?.belt;const drums=rig?.drums||[5,55].map(id=>{let found;tool.traverse(n=>{if(n.userData.sourceInstance===String(id))found=n});return found})
  if(!belt)tool.traverse(n=>{if(n.isMesh&&n.name.includes('皮带U17'))belt=n})
  if(!belt||drums.some(n=>!n))return
  const centers=drums.map(n=>localBounds(n,tool).getCenter(new Vector3())),along=centers[1].clone().sub(centers[0]),length=along.length();along.normalize()
  const cad=tool.children.find(n=>n!==mesh),transform=new Matrix4().multiplyMatrices(tool.matrixWorld.clone().invert(),cad?.matrixWorld||tool.matrixWorld),across=new Vector3(0,0,1).transformDirection(transform),normal=new Vector3().crossVectors(along,across).normalize()
  const bounds=localBounds(belt,tool),width=Math.max(.1,Math.min(.624,bounds.getSize(new Vector3()).z-.028)),topY=bounds.min.y
  // CAD +Y points away from the flange: the carrying surface is the -Y
  // side of the belt, not its outside return run. Centre on the belt, not
  // the source roller (the 640 roller has a 50mm lateral offset).
  centers[0].addScaledVector(across,bounds.getCenter(new Vector3()).sub(centers[0]).dot(across))
  let frame;tool.traverse(n=>{if(n.isMesh&&n.name.includes('布料头框架'))frame=n});const ceiling=Array(12).fill(-Infinity)
  if(frame){const matrix=new Matrix4().multiplyMatrices(tool.matrixWorld.clone().invert(),frame.matrixWorld),vertices=frame.geometry.attributes.position;for(let i=0;i<vertices.count;i++){const d=new Vector3().fromBufferAttribute(vertices,i).applyMatrix4(matrix).sub(centers[0]),u=d.dot(along),z=Math.abs(d.dot(across));if(u<0||u>length||z<width/2-.02||z>width/2+.04)continue;const bin=Math.min(11,Math.floor(u/length*12));ceiling[bin]=Math.max(ceiling[bin],d.dot(normal))}}
  for(let i=0;i<12;i++){if(!Number.isFinite(ceiling[i])){let nearest=ceiling.findIndex(Number.isFinite);for(let j=0;j<12;j++)if(Number.isFinite(ceiling[j])&&Math.abs(j-i)<Math.abs(nearest-i))nearest=j;ceiling[i]=nearest<0?.22:ceiling[nearest]}ceiling[i]=Math.max(.074,Math.min(.35,ceiling[i]-.012))}
  let front,deck;tool.traverse(n=>{if(n.isMesh&&n.name.includes('皮带前刮板'))front=n;if(n.isMesh&&n.name.includes('承重滑板'))deck=n});const clipMinX=deck?localBounds(deck,tool).min.x+.006:front?localBounds(front,tool).max.x+.008:centers[0].x+.02
  const rotor=rig?.rotorCenter?.clone().applyMatrix4(transform),exit=rotor&&rotor.distanceTo(centers[0])<rotor.distanceTo(centers[1])?0:1
  bed={start:centers[0],along,across,normal,length,width,topY,exit,ceiling,clipMinX};mesh.visible=false
 }
 function update(fraction,{beltDistance=0}={}){
  fraction=Math.max(0,Math.min(1,fraction));mesh.visible=!!bed&&fraction>1e-5;if(!mesh.visible)return false
  const key=Math.round(fraction*10000);let changed=key!==previous;previous=key
  if(changed){
   const coverage=Math.max(.026,(bed.length-.024)*Math.sqrt(fraction)),a=bed.exit?bed.length-.012-coverage:.012,b=bed.exit?bed.length-.012:.012+coverage
   const point=(t,z,h)=>{let u=t;for(let i=0;i<3;i++){const x=bed.start.x+bed.along.x*u+bed.normal.x*h;if(x<bed.clipMinX&&bed.along.x>.1)u+=(bed.clipMinX-x)/bed.along.x;h=Math.min(h,bed.ceiling[Math.min(11,Math.floor(u/bed.length*12))])}return bed.start.clone().addScaledVector(bed.along,u).addScaledVector(bed.normal,h).addScaledVector(bed.across,z)},height=Math.sqrt(fraction),sections=[]
   for(let i=0;i<=12;i++){const t=a+(b-a)*i/12,ceiling=bed.ceiling[Math.min(11,Math.floor(t/bed.length*12))],top=.068+(ceiling-.068)*height;sections.push([point(t,-bed.width/2,.068),point(t,bed.width/2,.068),point(t,-bed.width/2,top),point(t,bed.width/2,top)])}
   beltVolume(mesh,sections,bed.normal,bed.across,bed.along)
  }
  if(ownMaterial.map&&travel!==beltDistance){ownMaterial.map.offset.x=-beltDistance*2;travel=beltDistance;changed=true}
  return changed
 }
 function outlet(){if(!bed||!owner)return null;owner.updateWorldMatrix(true,false);const point=bed.start.clone().addScaledVector(bed.along,bed.exit?bed.length:0).addScaledVector(bed.normal,.07),axis=bed.across.clone().transformDirection(owner.matrixWorld);return {point:owner.localToWorld(point),axis,width:bed.width}}
 return {mesh,configure,update,outlet,inspect:()=>bed&&{length:bed.length,width:bed.width,topY:bed.topY,exit:bed.exit,up:bed.normal.toArray(),start:bed.start.toArray(),along:bed.along.toArray(),across:bed.across.toArray()},dispose(){mesh.geometry.dispose();ownMaterial.map?.dispose();ownMaterial.dispose();mesh.removeFromParent()}}
}

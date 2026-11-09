import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three'

function hull(points){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
 const lower=[],upper=[]
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}
 for(const p of sorted.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}
 return [...lower.slice(0,-1),...upper.slice(0,-1)]
}

// A local visualization repair: clearance follows the actual moving pin path.
// CAD/GLB source bytes are untouched. Only triangles intersecting the slot change.
export function clearMovingPinSlot(root,frame,pivot,pin,axis,angle,radius=.006){
 const ring=[]
 for(let i=0;i<=20;i++){
  const p=pin.clone().sub(pivot).applyAxisAngle(axis,angle*i/20).add(pivot)
  for(let j=0;j<16;j++){const a=j*Math.PI/8;ring.push({x:p.x+Math.cos(a)*radius,y:p.y+Math.sin(a)*radius})}
 }
 const polygon=hull(ring),bounds={minX:Math.min(...ring.map(p=>p.x)),maxX:Math.max(...ring.map(p=>p.x)),minY:Math.min(...ring.map(p=>p.y)),maxY:Math.max(...ring.map(p=>p.y))}
 const inverse=root.matrixWorld.clone().invert()
 let removed=0
 frame.traverse(mesh=>{
  if(!mesh.isMesh)return
  const original=mesh.geometry,position=original.attributes.position,normal=original.attributes.normal,index=original.index,transform=inverse.clone().multiply(mesh.matrixWorld),positions=[],normals=[]
  const vertex=i=>({p:new Vector3().fromBufferAttribute(position,i),n:normal?new Vector3().fromBufferAttribute(normal,i):new Vector3(0,1,0),world:new Vector3().fromBufferAttribute(position,i).applyMatrix4(transform)})
  function add(poly){for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){positions.push(...v.p.toArray());normals.push(...v.n.clone().normalize().toArray())}}
  function split(poly,a,b){
   const inside=[],outside=[],distance=v=>(b.x-a.x)*(v.world.y-a.y)-(b.y-a.y)*(v.world.x-a.x)
   for(let i=0;i<poly.length;i++){
    const from=poly[i],to=poly[(i+1)%poly.length],df=distance(from),dt=distance(to),isIn=df>=-1e-12
    ;(isIn?inside:outside).push(from)
    if((df>1e-12&&dt< -1e-12)||(df< -1e-12&&dt>1e-12)){
     const t=df/(df-dt),v={p:from.p.clone().lerp(to.p,t),n:from.n.clone().lerp(to.n,t),world:from.world.clone().lerp(to.world,t)}
     inside.push(v);outside.push(v)
    }
   }
   return {inside,outside}
  }
  for(let i=0;i<(index?.count||position.count);i+=3){
   let part=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j))
   if(Math.max(...part.map(v=>v.world.x))<bounds.minX||Math.min(...part.map(v=>v.world.x))>bounds.maxX||Math.max(...part.map(v=>v.world.y))<bounds.minY||Math.min(...part.map(v=>v.world.y))>bounds.maxY){add(part);continue}
   for(let edge=0;edge<polygon.length&&part.length>=3;edge++){
    const result=split(part,polygon[edge],polygon[(edge+1)%polygon.length]);if(result.outside.length>=3)add(result.outside);part=result.inside
   }
   if(part.length>=3)removed++
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;original.dispose()
 })
 return {removed,polygon,bounds}
}

import {BufferGeometry,Float32BufferAttribute,Mesh,MeshStandardMaterial,Vector3} from 'three'

// Colour only the right-hand rear enabling paddle's CAD surface, preserving
// the body and the front joystick. Source GLB bytes remain unchanged.
export function createPendantEnableKey(root){
 const positions=[],normals=[],v=[new Vector3(),new Vector3(),new Vector3()],n=new Vector3()
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.cadMaterial!==2)return
  const g=mesh.geometry,p=g.attributes.position,normal=g.attributes.normal,index=g.index
  for(let i=0;i<(index?.count||p.count);i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
   // Source GfxDataStream face 3071 and faces 3110–3118 form the oval paddle
   // and its rounded sidewalls, respectively.
   // Material batching retains its contiguous vertex range. Selecting the CAD
   // face avoids the old guessed capsule which coloured the surrounding seam.
   if(!ids.every(id=>id>=115763&&id<115841||id>=116570&&id<116974))continue
   v.forEach((q,j)=>q.fromBufferAttribute(p,ids[j]))
   ids.forEach((id,j)=>{n.fromBufferAttribute(normal,id);positions.push(...v[j].clone().addScaledVector(n,.0002).toArray());normals.push(...n.toArray())})
  }
 })
 const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3)).setAttribute('normal',new Float32BufferAttribute(normals,3))
 const material=new MeshStandardMaterial({color:'#22272b',roughness:.82,metalness:0}),key=new Mesh(geometry,material);key.name='rear-enabling-key';key.userData.hardware='enable';root.add(key)
 return {key,setEnabled(enabled){material.color.set(enabled?'#29c365':'#22272b');material.emissive.set(enabled?'#159c42':'#000000');material.emissiveIntensity=enabled?.35:0}}
}

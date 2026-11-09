import {Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,CylinderGeometry,Box3,Vector3,Raycaster} from 'three'

export const robotServicePart={id:'service-panel',label:'1–6 轴抱闸释放按钮',description:'黑色 1–6 轴抱闸释放按钮位于防误触护罩内，按轴号区分。用于说明维护部件位置，不作为机器人点动按键。'}
export const robotBatteryPart={id:'smb-battery',label:'ABB SMB 电池仓',description:'SMB（串行测量板）电池仓位于回转座框架下部的小盖板内，与旁边的抱闸释放按钮分开标记。'}

// In the manual's front view (pp. 81 / 187), the square cover is LEFT of
// the vertical guard. On this CAD's negative-Z face that means larger X.
const batteryBounds=[[0,.215,.278],[1,.445,.508],[2,-.232,-.230]]

function clipTriangle(points,axis,value,lower){
 const result=[]
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],ia=lower?a[axis]>=value:a[axis]<=value,ib=lower?b[axis]>=value:b[axis]<=value
  if(ia)result.push(a)
  if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);result.push(a.map((v,j)=>v+(b[j]-v)*t))}
 }
 return result
}

// The SMB cover is selected on the existing axis-1 CAD shell. Do not add a
// second box/housing: the product manual page 187 shows the battery assembly
// on this cover, but the supplied CAD has no separate battery body.
export function createRobotBatteryCompartment(root){
 const owner=root.getObjectByName('axis1');if(!owner)return null
 const existing=owner.getObjectByName(robotBatteryPart.id);if(existing)return existing
 const vertices=[],coverNormals=[],normalAccum=new Vector3()
 const append=(polygon,positions,normals)=>{for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]]){positions.push(...v.slice(0,3));normals.push(...v.slice(3,6))}}
 owner.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.axis)return
  const p=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index
  const remainder=[],remainingNormals=[];let extracted=false
  for(let i=0;i<(index?.count||p.count);i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
   let polygon=ids.map(id=>[p.getX(id),p.getY(id),p.getZ(id),normal.getX(id),normal.getY(id),normal.getZ(id)])
   // Split, rather than overlay, the original body triangles: every original
   // surface fragment belongs to exactly one selectable part.
   for(const [axis,min,max]of batteryBounds){
    for(const [value,lower]of [[min,true],[max,false]]){
     append(clipTriangle(polygon,axis,value,!lower),remainder,remainingNormals)
     polygon=clipTriangle(polygon,axis,value,lower)
     if(polygon.length<3)break
    }
    if(polygon.length<3)break
   }
   if(polygon.length>=3){extracted=true;append(polygon,vertices,coverNormals);normalAccum.add(new Vector3(...polygon[0].slice(3,6)))}
  }
  if(extracted){mesh.geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(remainder,3)).setAttribute('normal',new Float32BufferAttribute(remainingNormals,3));mesh.geometry.computeBoundingSphere()}
 })
 if(!vertices.length)throw Error('SMB 电池盖板表面缺失')
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new Float32BufferAttribute(coverNormals,3))
 const box=new Box3().setFromBufferAttribute(geometry.attributes.position),center=box.getCenter(new Vector3())
 const normal=normalAccum.lengthSq()>1e-12?normalAccum.normalize():new Vector3(0,0,-1)
 const group=new Group();group.name=robotBatteryPart.id
 const skin=new Mesh(geometry,new MeshStandardMaterial({color:'#aeb8bf',metalness:.55,roughness:.5,side:2}));skin.name='smb-battery-cover';group.add(skin)
 group.userData={labelAnchor:center.clone().addScaledVector(normal,.018).toArray(),labelNormal:normal.toArray(),surfaceCenter:center.toArray(),attachment:'partitioned existing axis1 CAD face; no duplicate surface or added housing',source:'ABB 3HAC044266-010 pp.81,187; cover detail dimensions estimated'}
 owner.add(group)
 return group
}

// The guard is sampled from the source CAD. The supplied CAD has the recessed
// oval guard and a recessed body face. Ray-sample that original mounting face
// for each cap; the projecting rim and the adjacent shell are not its floor.
export function createRobotServicePanel(root){
 const owner=root.getObjectByName('axis1');if(!owner)return null
 const existing=owner.getObjectByName('service-panel');if(existing)return existing
 const group=new Group();group.name='service-panel'
 const positions=[],normals=[],v=new Vector3(),n=new Vector3()
 owner.traverse(mesh=>{
  if(!mesh.isMesh)return
  const p=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index
  for(let i=0;i<(index?.count||p.count);i+=3){
   const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
   if(!ids.every(id=>{v.fromBufferAttribute(p,id);return v.x>=.12&&v.x<=.17&&v.y>=.415&&v.y<=.565&&v.z>=-.286&&v.z<=-.23}))continue
   for(const id of ids){v.fromBufferAttribute(p,id);n.fromBufferAttribute(normal,id);positions.push(...v.addScaledVector(n,.00015).toArray());normals.push(...n.toArray())}
  }
 })
 if(!positions.length)throw Error('抱闸按钮护罩表面缺失')
 const guardGeometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3)).setAttribute('normal',new Float32BufferAttribute(normals,3))
 const guard=new Mesh(guardGeometry,new MeshStandardMaterial({color:'#69727a',roughness:.55,metalness:.5}))
 guard.name='brake-button-guard';group.add(guard)
 const guardBox=new Box3().setFromBufferAttribute(guardGeometry.attributes.position),center=guardBox.getCenter(new Vector3()),size=guardBox.getSize(new Vector3())
 // Probe from inside the guard toward the body: its bounding-box rear rim
 // is not the recessed button mounting face.
 const topY=center.y+size.y*.39,step=.021,buttonNormal=new Vector3(0,0,-1),bodyMeshes=[]
 owner.traverse(mesh=>{if(mesh.isMesh)bodyMeshes.push(mesh)})
 owner.updateWorldMatrix(true,true)
 for(let axis=1;axis<=6;axis++){
  const y=topY-(axis-1)*step
  const probe=new Vector3(center.x,y,guardBox.max.z-.012),world=owner.localToWorld(probe.clone()),direction=new Vector3(0,0,1).transformDirection(owner.matrixWorld)
  const hit=new Raycaster(world,direction,0,.02).intersectObjects(bodyMeshes,false)[0]
  if(!hit)throw Error('抱闸按钮本体安装面缺失：'+axis)
  const bodyZ=owner.worldToLocal(hit.point.clone()).z
  const cap=new Mesh(new CylinderGeometry(.0065,.0065,.004,24),new MeshStandardMaterial({color:'#171b1e',roughness:.82}))
  cap.name='brake-release-'+axis;cap.quaternion.setFromUnitVectors(new Vector3(0,1,0),buttonNormal)
  cap.position.set(center.x,y,bodyZ-.002)
  const labelAnchor=cap.position.clone().addScaledVector(buttonNormal,.014)
  cap.userData={axis,labelAnchor:labelAnchor.toArray(),labelNormal:buttonNormal.toArray(),bodyMountZ:bodyZ,bodyMountMesh:hit.object.name,attachment:'round cap touching original robot body face behind guard'}
  group.add(cap)
 }
 group.userData={labelAnchor:center.clone().addScaledVector(buttonNormal,.026).toArray(),labelNormal:buttonNormal.toArray(),guardCenter:center.toArray(),guardFrontZ:guardBox.min.z,buttons:group.children.filter(item=>item.userData.axis).map(item=>item.userData.axis),source:'axis1 original CAD mounting face sampled per button; no added mounting plate'}
 owner.add(group)
 return group
}

import {Group,Mesh,BoxGeometry,CylinderGeometry,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial,Vector3} from 'three'

// Central suspended rotary unit, one inclined arm over the selected pot.
export function createInfraredCamera(stations){
 const root=new Group();root.name='infrared-camera-assembly'
 const centre=new Vector3().fromArray(stations[0].position).add(new Vector3().fromArray(stations[1].position)).multiplyScalar(.5);centre.y=0;root.position.copy(centre)
 const offsets=stations.map(s=>new Vector3(...s.position).sub(centre)),radius=Math.hypot(offsets[0].x,offsets[0].z),park=-Math.PI/2,angles={0:park,1:Math.atan2(offsets[0].x,offsets[0].z),2:Math.atan2(offsets[1].x,offsets[1].z),3:park},wrap=a=>Math.atan2(Math.sin(a),Math.cos(a))
 const steel=new MeshStandardMaterial({color:'#68757a',roughness:.65,metalness:.6}),black=new MeshStandardMaterial({color:'#202a30',roughness:.7}),glass=new MeshStandardMaterial({color:'#183b40',metalness:.5,roughness:.2})
 const box=(parent,name,size,position,material)=>{const mesh=new Mesh(new BoxGeometry(...size),material);mesh.name=name;mesh.position.fromArray(position);mesh.castShadow=true;parent.add(mesh);return mesh}
 box(root,'camera-centre-mount',[.34,.06,.34],[0,4.98,0],steel)
 box(root,'camera-centre-column',[.085,.52,.085],[0,4.69,0],steel)
 const bearing=new Mesh(new CylinderGeometry(.14,.14,.18,24),black);bearing.name='camera-rotary-bearing';bearing.position.y=4.42;root.add(bearing)
 const turn=new Group();turn.name='camera-rotary-arm';root.add(turn)
 const a=new Vector3(0,4.40,0),b=new Vector3(0,4.00,radius),direction=b.clone().sub(a),arm=box(turn,'camera-single-inclined-arm',[.075,direction.length(),.075],a.clone().add(b).multiplyScalar(.5).toArray(),steel);arm.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.normalize())
 box(turn,'camera-arm-counterweight',[.18,.16,.32],[0,4.40,-.18],black)
 const head=new Group();head.name='camera-head';head.position.z=radius;turn.add(head)
 box(head,'camera-end-bracket',[.16,.10,.15],[0,4.00,0],black)
 box(head,'camera-hanging-bracket',[.045,.70,.045],[0,3.64,0],steel)
 const housing=box(head,'camera-body',[.24,.27,.14],[.025,3.31,0],black);housing.userData={sensors:['AT20','DS77pro'],sharedHousing:true}
 box(head,'camera-cable',[.012,.64,.012],[.065,3.64,0],black)
 const lens=new Mesh(new CylinderGeometry(.042,.042,.045,24),glass);lens.name='camera-downward-lens';lens.position.set(0,3.155,0);head.add(lens)
 lens.userData={model:'AT20',role:'thermal'}
 const heightLens=new Mesh(new CylinderGeometry(.023,.023,.045,24),glass);heightLens.name='ds77pro-height-lens';heightLens.position.set(.078,3.155,0);heightLens.userData={model:'DS77pro',role:'height'};head.add(heightLens)
 const light=new Mesh(new BoxGeometry(.025,.025,.008),new MeshStandardMaterial({color:'#7d8990',emissive:'#000000'}));light.name='camera-status-light';light.position.set(.047,3.33,.064);head.add(light)
 const sightGeometry=new BufferGeometry();sightGeometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(24),3));const sight=new LineSegments(sightGeometry,new LineBasicMaterial({color:'#2b9c8a',transparent:true,opacity:.34,depthWrite:false}));sight.name='camera-field-of-view';sight.visible=false;root.add(sight)
 let cell=null,position=0,yaw=park,reach=0,previousSignature='';turn.rotation.y=yaw
 function pose(){head.position.z=reach;const end=new Vector3(0,4.00,reach),d=end.clone().sub(a);arm.scale.y=d.length()/b.clone().sub(a).length();arm.position.copy(a).add(end).multiplyScalar(.5);arm.quaternion.setFromUnitVectors(new Vector3(0,1,0),d.normalize())}
 pose()
 function setCell(value){cell=value;if(!value){position=0;yaw=park;reach=0;turn.rotation.y=yaw;pose();sight.visible=false;light.material.emissive.set('#000000')}}
 function update(delta,{running=false,rate=1}={}){
  const camera=cell?.infrared,targetCode=camera?.targetPosition??camera?.position??0,target=angles[targetCode]??park,distance=wrap(target-yaw),dt=running?Math.max(0,delta)*Math.max(0,rate):0,amount=Math.sign(distance)*Math.min(Math.abs(distance),dt*Math.PI/4),targetReach=[1,2].includes(targetCode)?radius:0,shift=Math.sign(targetReach-reach)*Math.min(Math.abs(targetReach-reach),dt*1.2)
  yaw=wrap(yaw+amount);reach+=shift;turn.rotation.y=yaw;pose();position=targetCode
  const active=!!camera?.enabled&&camera.position===position&&[1,2].includes(position),station=stations[position-1]
  sight.visible=active&&!!station&&Math.abs(wrap(target-yaw))<.01&&Math.abs(reach-targetReach)<.001
  light.material.color.set(active?'#2bb593':'#7d8990');light.material.emissive.set(active?'#125e4b':'#000000')
  if(sight.visible){const floor=station.position[1]+(cell.height||0)/1000+.015,r=station.dimensions.upperRadius*.9,values=[];for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])values.push(Math.sin(yaw)*reach,3.13,Math.cos(yaw)*reach,station.position[0]-centre.x+x*r*.7,floor,station.position[2]-centre.z+z*r*.7);sightGeometry.attributes.position.array.set(values);sightGeometry.attributes.position.needsUpdate=true;sightGeometry.computeBoundingSphere()}
  const signature=[active,sight.visible,position,cell?.height].join(':'),changed=signature!==previousSignature;previousSignature=signature;return Math.abs(amount)>0||Math.abs(shift)>0||changed
 }
 root.userData={dimensionsEstimated:true,mechanism:'central-rotary',sensors:['AT20','DS77pro'],sharedHousing:true,source:'用户确认：AT20红外/DS77pro测高，同盒同杆；待机在两锅中间，上甑移至在用锅中心。支架外形/运动参数为展示近似',setCell,update,inspect:()=>{root.updateWorldMatrix(true,true);return {position,yaw,radius,reach,pivot:centre.toArray(),head:head.getWorldPosition(new Vector3()).toArray(),lens:lens.getWorldPosition(new Vector3()).toArray(),heightLens:heightLens.getWorldPosition(new Vector3()).toArray(),observing:sight.visible,estimated:true}}}
 return root
}

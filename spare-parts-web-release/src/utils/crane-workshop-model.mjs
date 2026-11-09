import * as THREE from 'three'

// Geometry consumes the reviewed demonstration state; it holds no quantities.
export function buildWorkshopModel(layout,config){
 const root=new THREE.Group();root.name='crane-workshop'
 const pits=new Map(),materials={
  floor:new THREE.MeshStandardMaterial({color:0xc0c5c3,roughness:.9}),
  wall:new THREE.MeshStandardMaterial({color:0x706457,roughness:1}),
  steel:new THREE.MeshStandardMaterial({color:0xaab1b2,metalness:.65,roughness:.4}),
  dark:new THREE.MeshStandardMaterial({color:0x545b59,roughness:.7}),
  water:new THREE.MeshStandardMaterial({color:0x688b92,metalness:.25,roughness:.25,transparent:true,opacity:.65}),
 }
 const grainPixels=new Uint8Array(128*128*4)
 for(let i=0;i<128*128;i++){const n=((i*1103515245+12345)>>>8)%91;grainPixels.set([71+n,35+n*.55,13+n*.24,255],i*4)}
 const grainTexture=new THREE.DataTexture(grainPixels,128,128);grainTexture.wrapS=grainTexture.wrapT=THREE.RepeatWrapping;grainTexture.repeat.set(5,4);grainTexture.colorSpace=THREE.SRGBColorSpace;grainTexture.needsUpdate=true
 materials.grain=new THREE.MeshStandardMaterial({map:grainTexture,color:0xccab86,roughness:1})
 function mesh(parent,geometry,material,x=0,y=0,z=0){const o=new THREE.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o}
 function box(parent,size,at,material=materials.steel){return mesh(parent,new THREE.BoxGeometry(...size),material,...at)}
 const floorShape=new THREE.Shape();floorShape.moveTo(-15,-9.5);floorShape.lineTo(15,-9.5);floorShape.lineTo(15,9.5);floorShape.lineTo(-15,9.5);floorShape.closePath()
 for(const pit of layout){
  const hole=new THREE.Path(),x=pit.x,z=-pit.z,w=pit.width/2,d=pit.length/2;hole.moveTo(x-w,z-d);hole.lineTo(x-w,z+d);hole.lineTo(x+w,z+d);hole.lineTo(x+w,z-d);hole.closePath();floorShape.holes.push(hole)
  const group=new THREE.Group();group.position.set(pit.x,0,pit.z);group.userData.poolId=pit.id;root.add(group)
  const wallHeight=config.rimY-config.bottomY;
  box(group,[pit.width,.06,pit.length],[0,config.bottomY-.03,0],materials.wall)
  for(const sign of [-1,1]){
   box(group,[.16,wallHeight,pit.length+.32],[sign*(w+.08),(config.rimY+config.bottomY)/2,0],materials.wall)
   box(group,[pit.width,.15,.16],[0,config.rimY-.075,sign*(d+.08)],materials.steel)
   box(group,[pit.width,wallHeight,.15],[0,(config.rimY+config.bottomY)/2,sign*(d+.08)],materials.wall)
   box(group,[.16,.15,pit.length+.32],[sign*(w+.08),config.rimY-.075,0],materials.steel)
  }
  const bulk=box(group,[pit.width-.04,1,pit.length-.04],[0,0,0],materials.grain)
  const surfaceGeometry=new THREE.PlaneGeometry(pit.width-.04,pit.length-.04,24,16);surfaceGeometry.rotateX(-Math.PI/2)
  const surface=mesh(group,surfaceGeometry,materials.grain),coverParts=[]
  // One removable stainless pit cap: a shallow folded crown, lifting rings,
  // and a skirt that drops into the perimeter water-seal channel.
  const cap=new THREE.Group();cap.name='pit-cap';cap.userData.coverType='water-sealed-pit-cap';group.add(cap)
  const vertices=[],indices=[],outer=[[-w,-d],[-w,d],[w,d],[w,-d]],inner=outer.map(([x,z])=>[x*.72,z*.72])
  for(const [x,z] of outer)vertices.push(x,.04,z)
  for(const [x,z] of inner)vertices.push(x,.10,z)
  for(let i=0;i<4;i++){const j=(i+1)%4;indices.push(i,j,j+4,i,j+4,i+4)}indices.push(4,5,6,4,6,7)
  const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));shell.setIndex(indices);shell.computeVertexNormals();mesh(cap,shell,materials.steel)
  const waterSeal=new THREE.Group();waterSeal.name='water-seal-channel';group.add(waterSeal)
  for(const sign of [-1,1]){
   box(cap,[.035,.10,pit.length+.04],[sign*(w+.015),-.01,0])
   box(cap,[pit.width,.10,.035],[0,-.01,sign*(d+.015)])
   box(waterSeal,[.22,.035,pit.length+.44],[sign*(w+.13),config.rimY+.01,0])
   box(waterSeal,[.035,.12,pit.length+.44],[sign*(w+.23),config.rimY+.06,0])
   box(waterSeal,[pit.width+.22,.035,.22],[0,config.rimY+.01,sign*(d+.13)])
   box(waterSeal,[pit.width+.44,.12,.035],[0,config.rimY+.06,sign*(d+.23)])
   box(waterSeal,[.13,.012,pit.length+.20],[sign*(w+.13),config.rimY+.035,0],materials.water)
   box(waterSeal,[pit.width+.20,.012,.13],[0,config.rimY+.035,sign*(d+.13)],materials.water)
   const ring=mesh(cap,new THREE.TorusGeometry(.075,.012,8,24),materials.steel,sign*pit.width*.23,.18,0)
   ring.name='pit-cap-lifting-ring'
   box(cap,[.22,.02,.10],[sign*pit.width*.23,.11,0],materials.steel)
  }
  coverParts.push({object:cap})
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(pit.width+.50,.025,pit.length+.50)),new THREE.LineBasicMaterial({color:0x46c96b}));outline.position.y=config.rimY+.14;group.add(outline)
  pits.set(pit.id,{group,bulk,surface,coverParts,waterSeal,outline,lastMaterial:null,lastCover:null})
 }
 const floor=mesh(root,new THREE.ShapeGeometry(floorShape),materials.floor);floor.rotation.x=-Math.PI/2;floor.position.y=-.012
 const hopperGrain=box(new THREE.Group(),[1.6,1,1.0],[0,-.3,0],materials.grain);hopperGrain.visible=false
 const grabGrain=mesh(new THREE.Group(),new THREE.SphereGeometry(.38,16,10),materials.grain,0,-1.09,0);grabGrain.scale.set(1,.5,.85);grabGrain.visible=false
 const streamGeometry=new THREE.BufferGeometry();streamGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(80*3),3));const stream=new THREE.Points(streamGeometry,new THREE.PointsMaterial({color:0x8c5229,size:.055}));stream.visible=false;root.add(stream)
 return {root,pits,hopperGrain,grabGrain,stream,config}
}

export function applyWorkshopVisual(view,state,{active=true,unloadProgress=0,pose=null}={}){
 const c=state.config,progress=Math.max(0,Math.min(1,unloadProgress)),flow=state.grab.load*progress
 view.root.visible=active
 for(const [id,p] of view.pits){
  const data=state.pools[id],ratio=data.material/c.poolUnits,level=c.bottomY+(c.initialMaterialY-c.bottomY)*ratio
  p.outline.visible=id===state.selectedPoolId
  if(p.lastMaterial!==data.material){
   const height=Math.max(.001,level-c.bottomY);p.bulk.visible=p.surface.visible=data.material>0;p.bulk.scale.y=height;p.bulk.position.y=c.bottomY+height/2-.02
   const positions=p.surface.geometry.attributes.position
   for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i),edge=Math.min(1,Math.max(0,(data.width/2-Math.abs(x))/.35),Math.max(0,(data.length/2-Math.abs(z))/.3));positions.setY(i,level+.04*edge*(Math.sin(x*17+z*9)+Math.cos(z*23-x*11)))}
   positions.needsUpdate=true;p.surface.geometry.computeVertexNormals();p.lastMaterial=data.material
  }
  if(p.lastCover!==data.coverOpen){for(const {object} of p.coverParts){object.visible=!data.coverOpen;object.position.set(0,c.rimY+.09,0)}p.lastCover=data.coverOpen}
 }
 const received=state.hopper.load+flow,hopperHeight=Math.min(1,received/c.hopper.capacity)*.55
 view.hopperGrain.scale.y=Math.max(.001,hopperHeight);view.hopperGrain.position.y=-.3+hopperHeight/2;view.hopperGrain.visible=active&&received>0
 view.grabGrain.visible=active&&state.grab.load-flow>1e-6;view.grabGrain.scale.y=.5*Math.max(.04,(state.grab.load-flow)/c.grabCapacity)
 view.stream.visible=active&&progress>0&&progress<1&&state.grab.load>0
 if(view.stream.visible&&pose){
  const positions=view.stream.geometry.attributes.position,top=2.99-pose.hoist*4.5,fixtureTop=3.65-2*pose.transferHoist,bottom=fixtureTop-.42-.3+hopperHeight
  const x=(pose.travel-.5)*20,z=(pose.transfer-.5)*17
  for(let i=0;i<positions.count;i++){const t=(i/positions.count+progress*3)%1;positions.setXYZ(i,x+Math.sin(i*13)*.2,top-(top-bottom)*t,z+Math.cos(i*7)*.15)}positions.needsUpdate=true
 }
 return view
}

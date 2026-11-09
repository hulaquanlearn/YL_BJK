import {Group,Mesh,CylinderGeometry,BoxGeometry,TorusGeometry,LatheGeometry,MeshStandardMaterial,Vector2,Vector3,Box3,Triangle} from 'three'

// User's field photo: rear central hub, long rocker and pinned hydraulic drive.
// All dimensions/stroke remain illustrative, not measured or mapped to valve IO.
export function createHydraulicLid({radius=1.2,height=.97}={}){
 const root=new Group();root.name='hydraulic-pot-lid'
 const metal=new MeshStandardMaterial({color:'#aab5b9',metalness:.78,roughness:.34}),dark=new MeshStandardMaterial({color:'#536169',metalness:.55,roughness:.65}),chrome=new MeshStandardMaterial({color:'#ced8dc',metalness:.9,roughness:.19})
 const box=(parent,name,size,position,material=dark)=>{const m=new Mesh(new BoxGeometry(...size),material);m.name=name;m.position.fromArray(position);parent.add(m);return m}
 const axle=(parent,name,radius,length,position,material=chrome)=>{const m=new Mesh(new CylinderGeometry(radius,radius,length,24),material);m.name=name;m.rotation.z=Math.PI/2;m.position.copy(position);parent.add(m);return m}
 const pivot=new Vector3(0,height+.28,-radius-.30),hinge=new Group();hinge.name='lid-hinge';hinge.position.copy(pivot);root.add(hinge)
 const centre=new Vector3(0,height+.055-pivot.y,-pivot.z),hub=centre.clone().add(new Vector3(0,.50,0)),rodLocal=new Vector3(0,.05,-.45)
 // Rocker carries the centre of the lid; no floating rim hinge or short side prop.
 box(root,'pot-rocker-bracket',[.38,.36,.38],[0,pivot.y-.03,pivot.z]);box(root,'rocker-pedestal',[.28,pivot.y,.24],[0,pivot.y/2,pivot.z]);box(root,'pot-rocker-wall-bridge',[.38,.22,.34],[0,height*.7,-radius-.15]);
 axle(root,'rocker-base-axle',.09,.48,pivot)
 const beam=box(hinge,'lid-cylinder-arm',[.20,hub.length(),.24],hub.clone().multiplyScalar(.5).toArray(),metal);beam.quaternion.setFromUnitVectors(new Vector3(0,1,0),hub.clone().normalize())
 box(hinge,'lid-drive-crank',[.24,.20,.62],[0,.025,-.215],metal)
 axle(hinge,'lid-centre-hub',.15,.42,hub)
 box(hinge,'lid-hub-support',[.30,.50,.28],centre.clone().add(new Vector3(0,.25,0)).toArray(),metal)
 for(const t of [.15,.32,.49,.66,.83])for(const x of [-.113,.113])axle(hinge,'rocker-bolt-'+t+'-'+x,.027,.035,hub.clone().multiplyScalar(t).add(new Vector3(x,0,0)))
 // Revolved dished steel shell: convex back, concave inside, continuous thin rim.
 // Opening carries the same curved solid, never replaces it with a flat disk.
 const profile=[],r=radius+.025;for(let i=0;i<=36;i++){const u=i/36;profile.push(new Vector2(Math.max(.0001,r*u),.24*(1-u*u)))}for(let i=36;i>=0;i--){const u=i/36;profile.push(new Vector2(Math.max(.0001,r*u),.24*(1-u*u)-.025))}profile.push(profile[0].clone())
 const dome=new Mesh(new LatheGeometry(profile,64),metal);dome.name='lid-shell';dome.position.copy(centre);hinge.add(dome)
 const cap=new Mesh(new CylinderGeometry(.25,.25,.05,32),metal);cap.name='lid-centre-cap';cap.position.copy(centre).add(new Vector3(0,.225,0));hinge.add(cap)
 for(const x of [-.075,.075])box(hinge,'lid-clevis-ear-'+x,[.035,.18,.20],rodLocal.clone().add(new Vector3(x,0,0)).toArray())
 const pin=axle(hinge,'hydraulic-lid-pin',.035,.24,rodLocal)
 const base=new Vector3(0,.10,-radius-.95);box(root,'pot-cylinder-bracket',[.36,.18,1.10],[0,.09,-radius-.52]);
 for(const x of [-.09,.09])box(root,'base-clevis-ear-'+x,[.035,.20,.20],base.clone().add(new Vector3(x,0,0)).toArray())
 axle(root,'hydraulic-base-pin',.035,.26,base)
 const cylinder=new Group();cylinder.name='hydraulic-oil-cylinder';cylinder.position.copy(base);root.add(cylinder)
 const barrelLength=.70,barrel=new Mesh(new CylinderGeometry(.065,.065,barrelLength,24),dark);barrel.name='hydraulic-cylinder-barrel';barrel.position.y=barrelLength/2;cylinder.add(barrel)
 const rod=new Mesh(new CylinderGeometry(.028,.028,1,20),chrome);rod.name='hydraulic-piston-rod';cylinder.add(rod)
 for(const y of [.10,.60]){const port=new Mesh(new CylinderGeometry(.014,.014,.09,12),dark);port.rotation.z=Math.PI/2;port.position.set(.07,y,0);cylinder.add(port)}
 const eye=name=>{const m=new Mesh(new TorusGeometry(.044,.014,12,24),chrome);m.name=name;m.rotation.y=Math.PI/2;cylinder.add(m);return m}
 eye('hydraulic-base-eye');const rodEye=eye('hydraulic-rod-eye');let amount=1,target=1,stroke=0
 function set(value){amount=Math.max(0,Math.min(1,Number(value)||0));hinge.rotation.x=-amount*100*Math.PI/180;hinge.updateMatrix();const end=rodLocal.clone().applyMatrix4(hinge.matrix),direction=end.clone().sub(base),length=direction.length();cylinder.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.normalize());stroke=length-barrelLength;rod.scale.y=stroke;rod.position.y=barrelLength+stroke/2;rodEye.position.y=length;root.userData.amount=amount;root.userData.rodEnd=end.toArray()}
 function setTarget(value){target=Math.max(0,Math.min(1,Number(value)||0));root.userData.target=target}
 function update(delta){const next=amount+Math.sign(target-amount)*Math.min(Math.abs(target-amount),Math.max(0,delta)/3);if(next===amount)return false;set(next);return true}
 const sweptBox=new Box3(),vertices=[],vertex=new Vector3();for(let i=0;i<=40;i++){set(i/40);root.updateMatrixWorld(true);for(const moving of [hinge,cylinder]){sweptBox.union(new Box3().setFromObject(moving));moving.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position,index=mesh.geometry.index,n=index?index.count:p.count;for(let j=0;j<n;j++){vertex.fromBufferAttribute(p,index?index.getX(j):j).applyMatrix4(mesh.matrixWorld);vertices.push(vertex.x,vertex.y,vertex.z)}})}}
 const sweptTriangles=new Float32Array(vertices),triangle=new Triangle()
 function intersectsSweep(obstacle){const expanded=obstacle.clone().expandByScalar(.06);if(!sweptBox.intersectsBox(expanded))return false;for(let i=0;i<sweptTriangles.length;i+=9){triangle.a.fromArray(sweptTriangles,i);triangle.b.fromArray(sweptTriangles,i+3);triangle.c.fromArray(sweptTriangles,i+6);if(expanded.intersectsTriangle(triangle))return true}return false}
 root.userData={estimated:true,drive:'hydraulic oil cylinder',source:'用户现场图：背面中心轴座—长摆臂—液压油缸；铰点/行程为展示近似，非Do105盖顶信号',set,setTarget,update,sweptBounds:()=>sweptBox.clone(),intersectsSweep,inspect:()=>({amount,target,stroke,barrelLength,base:base.toArray(),rodEnd:root.userData.rodEnd,hingeAngle:hinge.rotation.x})};set(1);setTarget(1)
 root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true}});return root
}

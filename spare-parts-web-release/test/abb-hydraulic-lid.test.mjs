import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3,Box3,Triangle} from 'three'
import {createHydraulicLid} from '../src/utils/abb-hydraulic-lid.mjs'
import {placeBrewingPot,brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'
import {Group,Mesh,CylinderGeometry,MeshStandardMaterial} from 'three'
test('hydraulic oil cylinder endpoints remain pinned to base and lid throughout opening',()=>{
 const root=createHydraulicLid(),lid=root.userData,hinge=root.getObjectByName('lid-hinge'),rod=root.getObjectByName('hydraulic-piston-rod')
 assert.equal(lid.drive,'hydraulic oil cylinder')
 const strokes=[]
 for(let i=0;i<=20;i++){lid.set(i/20);root.updateMatrixWorld(true);const tip=new Vector3(0,.5,0).applyMatrix4(rod.matrixWorld);assert.ok(tip.distanceTo(new Vector3(...lid.inspect().rodEnd))<1e-8,'rod top stays on moving lid pin');strokes.push(lid.inspect().stroke)}
 assert.ok(Math.max(...strokes)-Math.min(...strokes)>.1);assert.ok(Math.abs(hinge.rotation.x+100*Math.PI/180)<1e-12)
 lid.set(1);lid.setTarget(0);lid.update(1.5);assert.equal(lid.inspect().amount,.5);lid.update(1.5);assert.equal(lid.inspect().amount,0);lid.setTarget(1);lid.update(3);assert.equal(lid.inspect().amount,1)
});
test('field-photo lid is a thin dished shell, preserved when opened instead of becoming a flat disk',()=>{
 const root=createHydraulicLid(),api=root.userData,shell=root.getObjectByName('lid-shell'),vertices=shell.geometry.attributes.position,ys=[]
 let centre=[],rim=[];for(let i=0;i<vertices.count;i++){const r=Math.hypot(vertices.getX(i),vertices.getZ(i)),y=vertices.getY(i);if(r<.01)centre.push(y);if(r>1.22)rim.push(y);ys.push(y)}
 assert.ok(Math.min(...centre)-Math.max(...rim)>.2,'inner and outer centre both rise above the rim');assert.ok(Math.max(...centre)-Math.min(...centre)<.03,'shell is thin at centre');assert.ok(Math.max(...rim)-Math.min(...rim)<.03,'rim has physical thin thickness')
 const geometry=shell.geometry;api.set(0);const closed=shell.getWorldPosition(new Vector3());api.set(1);root.updateMatrixWorld(true);assert.equal(shell.geometry,geometry);assert.ok(shell.getWorldPosition(new Vector3()).distanceTo(closed)>.5)
});
test('rocker and hydraulic solids never pierce the dished shell or push it through the pot rim',()=>{
 const root=createHydraulicLid(),api=root.userData,shell=root.getObjectByName('lid-shell'),p=shell.geometry.attributes.position,idx=shell.geometry.index,tri=new Triangle(),v=new Vector3()
 for(let step=0;step<=40;step++){
  api.set(step/40);root.updateMatrixWorld(true)
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(shell.matrixWorld);if(Math.hypot(v.x,v.z)<1.2)assert.ok(v.y>.97,'shell clears the pot rim and interior')}
  for(const name of ['lid-cylinder-arm','hydraulic-cylinder-barrel','hydraulic-piston-rod']){
   const solid=root.getObjectByName(name);solid.geometry.computeBoundingBox();const box=solid.geometry.boundingBox.clone().expandByScalar(.001),matrix=solid.matrixWorld.clone().invert().multiply(shell.matrixWorld)
   for(let i=0;i<idx.count;i+=3){tri.a.fromBufferAttribute(p,idx.getX(i)).applyMatrix4(matrix);tri.b.fromBufferAttribute(p,idx.getX(i+1)).applyMatrix4(matrix);tri.c.fromBufferAttribute(p,idx.getX(i+2)).applyMatrix4(matrix);assert.equal(box.intersectsTriangle(tri),false,name+' intersects shell at '+step/40)}
  }
 }
});
test('lid has a continuous solid connection through the arm, clevis and cylinder pins throughout its stroke',()=>{
 const root=createHydraulicLid(),api=root.userData,arm=root.getObjectByName('lid-cylinder-arm'),plate=root.getObjectByName('lid-shell'),hub=root.getObjectByName('lid-centre-hub'),support=root.getObjectByName('lid-hub-support'),pin=root.getObjectByName('hydraulic-lid-pin'),rodEye=root.getObjectByName('hydraulic-rod-eye'),baseEye=root.getObjectByName('hydraulic-base-eye'),basePin=root.getObjectByName('hydraulic-base-pin'),fixed=root.getObjectByName('pot-cylinder-bracket'),rod=root.getObjectByName('hydraulic-piston-rod');
 for(let i=0;i<=40;i++){
  api.set(i/40);root.updateMatrixWorld(true);
  assert.ok(pin.getWorldPosition(new Vector3()).distanceTo(rodEye.getWorldPosition(new Vector3()))<1e-8,'moving eye and lid pin share centre');
  assert.ok(basePin.getWorldPosition(new Vector3()).distanceTo(baseEye.getWorldPosition(new Vector3()))<1e-8,'fixed eye and base pin share centre');
  for(const [a,b] of [[arm,hub],[hub,support],[support,plate]])assert.ok(new Box3().setFromObject(a).intersectsBox(new Box3().setFromObject(b)),'rocker—hub—support—curved shell stay connected');
  const crank=root.getObjectByName('lid-drive-crank');assert.ok(new Box3().setFromObject(arm).intersectsBox(new Box3().setFromObject(crank)),'drive crank joins rocker');assert.ok(new Box3().setFromObject(crank).intersectsBox(new Box3().setFromObject(pin)),'crank supports moving pin');
  assert.ok(new Box3().setFromObject(fixed).intersectsBox(new Box3().setFromObject(basePin)),'fixed bracket supports cylinder base');
  assert.ok(api.sweptBounds().containsBox(new Box3().setFromObject(root.getObjectByName('lid-hinge'))),'interlock bounds contain moving lid');
  assert.ok(rod.scale.y>0&&rod.scale.y<api.inspect().barrelLength,'exposed piston stays within the cylinder travel');assert.ok(Math.abs(api.inspect().base[0])<1e-12&&Math.abs(api.inspect().rodEnd[0])<1e-12,'cylinder stays on the lid rear centreline')
 }
});
test('both installed lids open on the same side and their faces point in the same direction',()=>{
 const source=new Group();source.add(new Mesh(new CylinderGeometry(1.2,1.1,1.07,32),new MeshStandardMaterial()));source.children[0].position.y=.435;
 const pots=brewingWorkcell.pots.map(station=>placeBrewingPot(source,station)),normals=[];
 for(const pot of pots){pot.updateMatrixWorld(true);const plate=pot.getObjectByName('lid-shell'),centre=plate.getWorldPosition(new Vector3()).applyMatrix4(pot.matrixWorld.clone().invert());assert.ok(centre.x< -1.2&&Math.abs(centre.z)<1e-6,'both lids open on the user-corrected opposite -X side');normals.push(new Vector3(0,1,0).transformDirection(plate.matrixWorld))}
 assert.ok(normals[0].dot(normals[1])>.999,'pot calibration tilt may differ; lids do not face opposite ways')
});
test('lid clearance detects the plate but excludes the empty corner of the union bounding box',()=>{
 const lid=createHydraulicLid().userData,corner=new Box3(new Vector3(1.09,1.09,-1.11),new Vector3(1.11,1.11,-1.09)),plate=new Box3(new Vector3(-.02,.99,-.02),new Vector3(.02,1.07,.02));
 assert.ok(lid.sweptBounds().intersectsBox(corner),'old union test would block this empty corner');assert.equal(lid.intersectsSweep(corner),false);assert.equal(lid.intersectsSweep(plate),true)
});

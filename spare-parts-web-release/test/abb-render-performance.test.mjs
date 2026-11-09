import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,PerspectiveCamera,Vector3,Raycaster} from 'three'
import {createModelAnimationClock} from '../src/utils/model-animation-clock.mjs'
import {createModelAnchorTracker} from '../src/utils/model-surface-anchor.mjs'
import {createPartMaterialPool} from '../src/utils/model-part-materials.mjs'
import {createMaterialSimulation} from '../src/utils/abb-material-simulation.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'

test('a slow rendered frame advances the full wall time; hiding or resuming never teleports the robot',()=>{
 const tick=createModelAnimationClock()
 assert.equal(tick(1000),0);assert.equal(tick(1100),.1);assert.equal(tick(1350),.25)
 assert.equal(tick(2000,false),0);assert.equal(tick(7000,false),0);assert.equal(tick(8000,true),0);assert.equal(tick(8020,true),.02)
})

test('a triangle attachment follows rigid motion without repeating CAD raycasts and refreshes hidden/replaced parts',()=>{
 const root=new Group(),part=new Mesh(new BoxGeometry(),new MeshStandardMaterial()),other=part.clone();other.position.x=2;root.add(part,other);root.updateMatrixWorld(true)
 const camera=new PerspectiveCamera(38,1,.01,100);camera.position.set(0,1,5);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
 let casts=0;const raycast=part.raycast;part.raycast=function(...args){casts++;return raycast.apply(this,args)}
 const tracker=createModelAnchorTracker(),p=tracker.get('part',[part],camera),calls=casts;assert.ok(p);assert.ok(calls>0)
 part.position.set(1,2,0);part.rotation.y=.5;root.updateMatrixWorld(true)
 const moved=tracker.get('part',[part],camera);assert.equal(casts,calls,'joint motion reprojects a cached triangle attachment')
 const hits=new Raycaster(camera.position,moved.clone().sub(camera.position).normalize()).intersectObject(part);assert.ok(hits.some(h=>h.point.distanceTo(moved)<1e-5),'attachment stays on its actual transformed mesh')
 part.visible=false;assert.equal(tracker.get('part',[part],camera),null)
 assert.ok(tracker.get('part',[other],camera),'replacement geometry is reacquired')
 tracker.clear();assert.ok(tracker.get('part',[other],camera))
})

test('identical IO checkpoints do not rebuild the material mesh; equal-volume redistribution still does',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),mesh=model.root.getObjectByName('pot-left-deposit-surface')
 const state={barrel:'left',height:5,targetHeight:800,depositGridSize:24,depositCells:{a:{u:0,v:0,volume:.0005}},signals:{do22_boji_zz_dk:0}}
 model.setCell(state);model.update(0);const version=mesh.geometry.attributes.position.version
 for(let i=0;i<30;i++){model.setCell({...structuredClone(state),signals:{do22_boji_zz_dk:i%2},lastUpdateTime:i});model.update(0)}
 assert.equal(mesh.geometry.attributes.position.version,version,'repeated FK/IO/Wait checkpoints leave the surface buffer intact')
 state.depositCells.a.u=.25;model.setCell(state);model.update(0);assert.ok(mesh.geometry.attributes.position.version>version,'moving the same material volume redraws the surface')
 model.setCell(null);model.resetPot('left');model.update(0);assert.equal(mesh.visible,false);model.dispose()
})

test('material reuse reduces duplicate GPU state while keeping part selection isolated',()=>{
 const source=new MeshStandardMaterial({color:'#aaaaaa'}),a=createPartMaterialPool(),b=createPartMaterialPool()
 const first=a(source),second=a(source),neighbour=b(source);assert.equal(first,second);assert.notEqual(first,neighbour)
 first.color.set('#46c96b');assert.equal(second.color.getHexString(),'46c96b');assert.equal(neighbour.color.getHexString(),'aaaaaa');assert.equal(source.color.getHexString(),'aaaaaa')
})

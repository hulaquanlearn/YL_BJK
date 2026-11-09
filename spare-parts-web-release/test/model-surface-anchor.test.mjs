import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {modelSurfaceAnchor} from '../src/utils/model-surface-anchor.mjs'
import {modelObservationParts} from '../src/utils/model-observation.mjs'
import {buildVehicleModel} from '../src/utils/agv-model-catalog.mjs'
import {robotParts} from '../src/utils/abb-robot.mjs'
import {applyRobotJoints} from '../src/utils/abb-kinematics.mjs'

function cameraFor(root,direction=[1,1,2]){root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root),c=b.getCenter(new T.Vector3()),r=Math.max(b.getSize(new T.Vector3()).length(),.001),camera=new T.PerspectiveCamera(38,1.5,r/1000,r*20);camera.position.copy(c).addScaledVector(new T.Vector3(...direction).normalize(),r*2);camera.lookAt(c);camera.updateMatrixWorld(true);return camera}
function verify(objects,camera,label){const point=modelSurfaceAnchor(objects,camera);assert.ok(point,label+' anchor');const meshes=[];objects.forEach(o=>o.traverse(n=>{if(n.isMesh)meshes.push(n)}));const eye=camera.getWorldPosition(new T.Vector3()),ray=new T.Raycaster(eye,point.clone().sub(eye).normalize()),hits=ray.intersectObjects(meshes,false);assert.ok(hits.some(h=>h.point.distanceTo(point)<1e-5),label+' anchor must be an actual triangle intersection');return point}
async function load(url){const b=await readFile(new URL('../public'+url,import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}

test('hollow and separated assemblies anchor on a surface, follow parent transforms and disappear with hidden geometry',()=>{
 const root=new T.Group(),a=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),b=a.clone();a.position.x=-3;b.position.x=3;root.add(a,b)
 let camera=cameraFor(root),p=verify([root],camera,'two separated parts');assert.ok(Math.abs(p.x)>2.49)
 root.position.set(4,2,1);root.rotation.y=.5;root.updateMatrixWorld(true);camera=cameraFor(root);p=verify([root],camera,'moved parent');assert.ok(p.x>0)
 root.visible=false;assert.equal(modelSurfaceAnchor([root],camera),null)
})
test('all four AGV families and all ABB links anchor on their actual current geometry after motion and separation',async()=>{
 let checked=0
 for(const [family,variant] of [['latent','old'],['latent','new'],['counterweight','old'],['flipping','old']]){
  const {root,parts}=buildVehicleModel({family,variant});root.updateMatrixWorld(true)
  for(const view of [[1,1,2],[-1,1,-2]]){const camera=cameraFor(root,view);for(const part of parts){verify([part],camera,family+'/'+part.name);checked++}}
 }
 const root=await load('/models/abb-irb6700/irb6700-150-320.glb')
 for(const joints of [[0,0,0,0,90,0],[35,20,-25,25,65,30],[-35,-20,30,-20,100,-30]]){
  applyRobotJoints(root,joints,.4)
  for(const view of [[1,1,2],[-1,1,-2],[0,3,.01]]){const camera=cameraFor(root,view);for(const part of robotParts){verify([root.getObjectByName(part.id)],camera,'ABB/'+part.id);checked++}}
 }
 assert.ok(checked>200)
})
test('all 330 catalog models project every identified part onto real triangles from opposite views',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../../docs/SPARE_REBUILD_FREEZE_330_20261103.json',import.meta.url))),stats={models:0,parts:0,anchors:0}
 for(const item of catalog.items){
  const root=await load(item.url),meshes=[];root.traverse(n=>{if(n.isMesh)meshes.push(n)})
  const identified=modelObservationParts(item.url,meshes),parts=identified.length?identified:[{id:'whole',objects:meshes}];stats.models++;stats.parts+=parts.length
  for(const view of [[1,.7,2],[-1,.7,-2]]){const camera=cameraFor(root,view);for(const part of parts){verify(part.objects,camera,item.id+'/'+part.id);stats.anchors++}}
  const materials=new Set(),geometries=new Set();root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)materials.add(n.material)});for(const g of geometries)g.dispose();for(const m of materials)m.dispose()
 }
 assert.equal(stats.models,330);assert.ok(stats.anchors>2000)
})

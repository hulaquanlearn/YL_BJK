import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {pendantKeys,pendantKeyAt,pendantSurfacePoint} from '../src/utils/abb-pendant-controls.mjs'
import {createPendantEnableKey} from '../src/utils/abb-pendant-enable.mjs'

test('the complete rear enabling paddle, including its rounded ends, changes colour without painting the casing',async()=>{
 const bytes=await readFile(new URL('../public/models/abb-irb6700/flexpendant.glb',import.meta.url)),length=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length)
 const read=id=>{const a=g.accessors[id],v=g.bufferViews[a.bufferView],size={VEC3:3,SCALAR:1}[a.type],values=[];for(let i=0;i<a.count*size;i++){const at=(v.byteOffset||0)+(a.byteOffset||0)+i*4;values.push(a.componentType===5126?bin.readFloatLE(at):bin.readUInt32LE(at))}return values}
 const p=g.meshes.flatMap(m=>m.primitives).find(p=>p.material===2),geometry=new T.BufferGeometry()
 geometry.setAttribute('position',new T.Float32BufferAttribute(read(p.attributes.POSITION),3));geometry.setAttribute('normal',new T.Float32BufferAttribute(read(p.attributes.NORMAL),3));geometry.setIndex(read(p.indices))
 const body=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));body.userData.cadMaterial=2
 const root=new T.Group();root.add(body);const {key,setEnabled}=createPendantEnableKey(root);root.updateMatrixWorld(true)
 const bounds=new T.Box3().setFromObject(key),size=bounds.getSize(new T.Vector3())
 assert.ok(size.y>.054&&size.z>.017,'entire 55 x 18 mm paddle, not a narrow seam')
 assert.ok(key.geometry.attributes.position.count/3>500,'front and all rounded sidewalls are included')
 for(const y of [-.018,0,.018])for(const z of [-.034,-.039,-.044]){
  const hit=new T.Raycaster(new T.Vector3(.2,y,z),new T.Vector3(-1,0,0)).intersectObject(key)[0]
  assert.ok(hit,'paddle covers '+y+','+z)
 }
 const original=body.material.color.getHex();setEnabled(true);assert.equal(key.material.color.getHexString(),'29c365');assert.equal(body.material.color.getHex(),original)
 setEnabled(false);assert.equal(key.material.color.getHexString(),'22272b')
 root.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})
})

test('every physical hard-key hotspot lands on its printed front panel, never repeated edge or rear UVs',async()=>{
 const bytes=await readFile(new URL('../public/models/abb-irb6700/flexpendant.glb',import.meta.url)),length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length)
 const read=id=>{const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],size={VEC3:3,VEC2:2,SCALAR:1}[a.type],width=a.componentType===5123?2:4,values=[];for(let i=0;i<a.count;i++)for(let j=0;j<size;j++){const at=(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width*size)+j*width;values.push(a.componentType===5126?bin.readFloatLE(at):width===2?bin.readUInt16LE(at):bin.readUInt32LE(at))}return {values,size}}
 const p=gltf.meshes.find(m=>m.primitives.some(p=>p.material===6)).primitives.find(p=>p.material===6),geometry=new T.BufferGeometry()
 for(const [field,name] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){const {values,size}=read(p.attributes[field]);geometry.setAttribute(name,new T.Float32BufferAttribute(values,size))}
 geometry.setIndex(read(p.indices).values)
 const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true)
 const locations={}
 for(const key of pendantKeys){
  const point=pendantSurfacePoint(mesh,key.x/150,1-key.y/419);assert.ok(point,key.id)
  const ray=new T.Raycaster(point.clone().add(new T.Vector3(0,0,.2)),new T.Vector3(0,0,-1)),hit=ray.intersectObject(mesh)[0]
  assert.ok(hit.point.distanceTo(point)<1e-6,key.id+' is on the visible face')
  assert.equal(pendantKeyAt(hit.uv.x,hit.uv.y),key.id)
  locations[key.id]=point
 }
 assert.ok(locations['preset-1'].y>.04,'programmable keys occupy the upper panel')
 assert.ok(locations.stop.y<-.05,'stop occupies the lower control cluster')
 assert.ok(locations['mechanical-unit'].y>locations['axis-group'].y)
 geometry.dispose();mesh.material.dispose()
})

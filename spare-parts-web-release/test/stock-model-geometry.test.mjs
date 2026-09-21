import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import {flattenStockModel,instanceStockModels} from '../src/utils/stock-model-geometry.mjs'
test('static category merging preserves transformed bounds and instances keep shelf placements',()=>{
  const template=new Group(), material=new MeshStandardMaterial()
  for(let i=0;i<3;i++){const mesh=new Mesh(new BoxGeometry(1,2,1),material);mesh.position.x=i*2;template.add(mesh)}
  const geometry=flattenStockModel(template)
  const before=new Box3().setFromObject(template)
  assert.ok(before.min.distanceTo(geometry.boundingBox.min)<1e-6)
  assert.ok(before.max.distanceTo(geometry.boundingBox.max)<1e-6)
  const root=new Group()
  for(let i=0;i<100;i++){const anchor=new Group();anchor.position.set(i,2,i*3);const mesh=new Mesh(geometry,material);mesh.userData.sharedStockModel=true;anchor.add(mesh);root.add(anchor)}
  instanceStockModels(root)
  const instances=root.children.filter(x=>x.isInstancedMesh)
  assert.equal(instances.length,1);assert.equal(instances[0].count,100)
  const matrix=new Matrix4();instances[0].getMatrixAt(99,matrix)
  assert.deepEqual(new Vector3().setFromMatrixPosition(matrix).toArray(),[99,2,297])
})

import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceModels } from '../../spare-parts-web-release/src/utils/evidence-models.mjs'
import { GLTFLoader } from '../../spare-parts-web-release/node_modules/three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Vector3 } from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
for(const item of evidenceModels) for(const level of ['low','detail']) test(`${item.id} ${level}: real GLB dimensions and size budget`,async()=>{
  const buffer=fs.readFileSync(new URL('../../spare-parts-web-release/public'+item[level+'Url'],import.meta.url))
  assert.equal(buffer.toString('ascii',0,4),'glTF')
  assert.equal(buffer.readUInt32LE(8),buffer.length)
  assert.ok(buffer.length<(level==='low'?50000:1500000))
  const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')
  const size=new Box3().setFromObject(gltf.scene).getSize(new Vector3()).multiplyScalar(1000)
  for(const [axis,name] of [['x','width'],['y','height'],['z','depth']]) assert.ok(Math.abs(size[axis]-item.dimensionsMm[name])<.3,`${axis}: ${size[axis]}`)
})

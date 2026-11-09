// First valid reviewed-model-variants.json version: every listed variant must be
// a generated, hashed GLB whose recorded dimensions match the asset.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import registry from '../src/utils/reviewed-model-variants.json' with {type:'json'}

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('variant registry only lists generated, hashed and measured assets',async()=>{
 assert.equal(registry.schema,1)
 assert.ok(Array.isArray(registry.variants)&&registry.variants.length>=10)
 const seen=new Set()
 for(const variant of registry.variants){
  assert.ok(!seen.has(variant.id),`duplicate ${variant.id}`)
  seen.add(variant.id)
  for(const field of ['id','catalogId','model','brands','url','sha256','confirmedDimensionsMm','unknown','quality','previewOnly'])
   assert.ok(field in variant,`${variant.id} missing ${field}`)
  assert.match(variant.url,/^\/models\/variants-20261103\/[^/]+\.glb$/)
  assert.equal(variant.previewOnly,true,`${variant.id} must stay previewOnly`)
  assert.ok(['尺寸参考','结构示意'].includes(variant.quality))
  assert.ok(catalog.models.some(model=>model.id===variant.catalogId),`${variant.id} catalogId`)
  const bytes=await fs.readFile(new URL('../public'+variant.url,import.meta.url))
  assert.equal(sha(bytes),variant.sha256,`${variant.id} hash`)
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
  scene.updateMatrixWorld(true)
  const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
  assert.equal(size.toArray().every(Number.isFinite),true,`${variant.id} finite`)
  const measured=[size.x,size.y,size.z].map(value=>+(value*1000).toFixed(1))
  for(const [index,value] of measured.entries())assert.ok(Math.abs(value-variant.bboxMm[index])<0.1,`${variant.id} bbox axis ${index} ${value} != ${variant.bboxMm[index]}`)
  assert.ok(variant.confirmedDimensionsMm.length>0)
  assert.ok(variant.unknown.length>0)
  const root=scene.children[0]
  assert.ok(root?.userData?.variantId===variant.id||root?.userData?.variantId,`${variant.id} userData`)
 }
})

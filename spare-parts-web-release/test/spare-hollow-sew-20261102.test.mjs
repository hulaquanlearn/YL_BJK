// Batch B26: hollow-shaft reducers keep their hollow metadata while gaining
// SEW-drawing external details; geometry must differ from the input baseline.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const ids=[217,218,219,220,226,229,249,252,259,260,261,262,267,268,269,274]
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('B26 hollow reducers differ geometrically and keep hollow metadata',async()=>{
 for(const id of ids){
  const entry=catalog.models.find(model=>model.id===id)
  assert.ok(entry,`${id} catalog`)
  assert.equal(entry.requiresReview,true,`${id} review flag`)
  assert.match(entry.note,/A型空心输出端/)
  assert.match(entry.note,/厂家图纸/)
  const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  const baseline=fingerprints.models.find(row=>String(row.id)===String(id))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
  assert.notEqual(geometryFingerprint(bytes),baseline,`${id} geometry must differ`)
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
  scene.updateMatrixWorld(true)
  let hollow=null
  scene.traverse(node=>{if(node.userData?.hollowShaft)hollow=node.userData.hollowShaft})
  assert.ok(hollow,`${id} hollow metadata preserved`)
  assert.equal(hollow.schema,1)
  assert.equal(hollow.boreDiameterMm,170)
  assert.match(hollow.note,/图纸|核对/)
  scene.traverse(node=>{node.geometry?.dispose();[].concat(node.material||[]).forEach(material=>material.dispose())})
 }
})

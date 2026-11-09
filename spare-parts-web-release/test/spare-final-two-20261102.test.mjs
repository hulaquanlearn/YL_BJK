// Final two items: 168 generic hydraulic correction unit and 196 refined 22212E.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('168 is a generic hydraulic correction unit with honest unknowns',async()=>{
 const entry=catalog.models.find(model=>model.id===168)
 const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
 assert.equal(sha(bytes),entry.sha256)
 const baseline=fingerprints.models.find(row=>String(row.id)===String(168))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
 assert.notEqual(geometryFingerprint(bytes),baseline)
 assert.match(entry.note,/液压纠偏装置/)
 assert.match(entry.note,/不虚构型号/)
 assert.equal(entry.status,'rebuilt')
})
test('196 is metric, refined and keeps the 40-mesh observation mapping',async()=>{
 const entry=catalog.models.find(model=>model.id===196)
 assert.equal(sha(await fs.readFile(new URL('../public'+entry.url,import.meta.url))),entry.sha256)
 assert.match(entry.note,/22212 E|22212E/)
 assert.match(entry.note,/圆柱孔/)
 assert.match(entry.note,/60×110×28/)
 const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
 assert.equal(meshes.length,40)
 assert.equal(meshes[2].userData.hollowShaft,undefined)
 const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
 assert.ok(Math.abs(size.x-.11)<1e-4&&Math.abs(size.y-.11)<1e-4&&Math.abs(size.z-.028)<1e-4)
})

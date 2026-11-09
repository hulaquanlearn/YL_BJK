// B27: the curated 22212E evidence asset must be metric-correct while keeping its
// 40-mesh observation mapping.
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
test('196 evidence asset is metric and differs from baseline geometry',async()=>{
 const entry=catalog.models.find(model=>model.id===196)
 const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
 assert.equal(sha(bytes),entry.sha256)
 const baseline=fingerprints.models.find(row=>String(row.id)===String(196))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
 assert.notEqual(geometryFingerprint(bytes),baseline)
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 const meshes=[];scene.traverse(node=>{if(node.isMesh)meshes.push(node)})
 assert.equal(meshes.length,40)
 const size=new T.Box3().setFromObject(scene).getSize(new T.Vector3())
 assert.ok(Math.abs(size.x-.11)<1e-4&&Math.abs(size.y-.11)<1e-4&&Math.abs(size.z-.028)<1e-4)
 assert.match(entry.note,/22212E/)
 assert.match(entry.note,/10 倍/)
})

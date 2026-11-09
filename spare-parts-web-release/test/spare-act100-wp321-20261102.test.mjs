// Batch B25: ACT100 order correspondence and the WP321 conflicting-source reference.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('ACT100 and WP321 references differ from baseline and document their source limits',async()=>{
 for(const id of [22,71]){
  const entry=catalog.models.find(model=>model.id===id)
  assert.ok(entry,`${id} catalog`)
  const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  const baseline=fingerprints.models.find(row=>String(row.id)===String(id))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
  assert.notEqual(geometryFingerprint(bytes),baseline,`${id} geometry differs`)
 }
 const act=catalog.models.find(model=>model.id===22)
 assert.match(act.note,/30529620/)
 assert.match(act.note,/40×110×100/)
 assert.match(act.note,/ATC100DIN/)
 const wp=catalog.models.find(model=>model.id===71)
 assert.equal(wp.requiresReview,true)
 assert.match(wp.note,/冲突/)
 assert.match(wp.note,/CAD/)
 assert.match(wp.note,/57.*72/)
 assert.match(wp.note,/73.*58/)
})

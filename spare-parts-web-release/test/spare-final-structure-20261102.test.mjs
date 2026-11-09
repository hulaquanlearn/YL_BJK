// Batch B24: remaining structure items plus the pending-source Huakang couplings.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import progress from '../../docs/SPARE_REBUILD_PROGRESS_20261102.json' with {type:'json'}

const batch=progress.batches.find(record=>record.id==='B24-final-structure')
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('B24 items differ from baseline; Huakang couplings keep pending-source contract',async()=>{
 assert.ok(batch,`B24 batch exists`)
 for(const id of batch.items){
  const entry=catalog.models.find(model=>String(model.id)===String(id))
  assert.ok(entry,`${id} catalog`)
  const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  const baseline=fingerprints.models.find(row=>String(row.id)===String(id))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
  assert.notEqual(geometryFingerprint(bytes),baseline,`${id} geometry must differ`)
  assert.ok(entry.source,`${id} source`)
  if([298,299,300,301,302].includes(id)){
   assert.equal(entry.requiresReview,true,`${id} keeps review flag`)
   assert.equal(entry.status,'rebuilt',`${id} status`)
   assert.match(entry.note,/来源尚待核实/,`${id} pending-source note`)
  }
 }
})

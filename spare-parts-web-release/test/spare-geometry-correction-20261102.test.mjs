// Batch B21 geometry correction: every item must differ from the input-330
// baseline in world-space vertices/indices/normals, not just in metadata.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import progress from '../../docs/SPARE_REBUILD_PROGRESS_20261102.json' with {type:'json'}

const batch=progress.batches.find(record=>record.id==='B21-geometry-correction')
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
test('B21 items differ from baseline in actual geometry',async()=>{
 assert.ok(batch,`B21 batch exists`)
 assert.equal(batch.items.length,71,`B21 item count`)
 for(const id of batch.items){
  const entry=catalog.models.find(model=>String(model.id)===String(id))
  assert.ok(entry,`${id} catalog`)
  const bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url))
  assert.equal(sha(bytes),entry.sha256,`${id} hash`)
  const baseline=fingerprints.models.find(row=>String(row.id)===String(id))?.geometry;assert.ok(baseline,'Known baseline fingerprint')
  assert.notEqual(geometryFingerprint(bytes),baseline,`${id} geometry must differ from baseline`)
  assert.ok(entry.source,`${id} source`)
  assert.ok(entry.note.length>20,`${id} note`)
 }
})

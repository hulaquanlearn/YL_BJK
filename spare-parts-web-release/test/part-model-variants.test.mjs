import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import {partModelVariants} from '../src/utils/part-model-variants.mjs'
import manifest from '../src/utils/reviewed-model-variants.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}

test('published variant references are real, self-contained GLB assets with matching hashes',()=>{
 const entries=catalog.models
 assert.ok(manifest.variants.length>0)
 const ids=new Set()
 for(const item of manifest.variants){
  assert.equal(ids.has(item.id),false);ids.add(item.id)
  const parent=entries.find(row=>String(row.id)===String(item.catalogId))
  assert.ok(parent,`parent ${item.catalogId}`)
  assert.ok(partModelVariants({categoryModelId:parent.id,categoryModelUrl:parent.url}).some(row=>row.id===item.id))
  const bytes=fs.readFileSync(path.resolve('public','.'+item.url))
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)
  assert.equal(bytes.toString('ascii',0,4),'glTF')
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim())
  assert.ok(json.meshes?.length)
  assert.equal((json.buffers||[]).some(row=>row.uri),false)
  assert.equal((json.images||[]).some(row=>row.uri&&!row.uri.startsWith('data:')),false)
  assert.ok(item.quality&&item.confirmedDimensionsMm)
  assert.ok(Array.isArray(item.unknown))
 }
})

test('variants require an existing binding and never match by a guessed brand or name',()=>{
 const variant=manifest.variants[0],entries=catalog.models
 const parent=entries.find(row=>String(row.id)===String(variant.catalogId))
 assert.deepEqual(partModelVariants({name:variant.model,brand:variant.brands?.[0]}),[])
 assert.deepEqual(partModelVariants({categoryModelId:'unknown',categoryModelUrl:parent.url}),[])
 for(const url of ['https://other.example/a.glb','/models/variants-20261103/../private.glb'])
  assert.deepEqual(partModelVariants({categoryModelUrl:parent.url},[{...variant,url}]),[])
})

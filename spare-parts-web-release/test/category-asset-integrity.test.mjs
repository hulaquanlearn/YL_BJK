import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Box3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {flattenStockModel} from '../src/utils/stock-model-geometry.mjs'
test('all 51 local category GLBs parse, retain bounds after flattening, and have reference images',async()=>{
  const dir=new URL('../public/models/categories/',import.meta.url),loader=new GLTFLoader()
  const files=fs.readdirSync(dir).filter(name=>name.endsWith('.glb'))
  assert.equal(files.length,51)
  for(const name of files){
    const bytes=fs.readFileSync(new URL(name,dir))
    assert.equal(bytes.readUInt32LE(8),bytes.length,name)
    assert.ok(fs.statSync(new URL(name.replace(/\.glb$/,'.jpg'),dir)).size>0,name+' image')
    const parsed=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
    const expected=new Box3().setFromObject(parsed.scene,true),geometry=flattenStockModel(parsed.scene)
    assert.ok(!geometry.boundingBox.isEmpty(),name)
    assert.ok(expected.min.distanceTo(geometry.boundingBox.min)<1e-4,name+' lower bounds')
    assert.ok(expected.max.distanceTo(geometry.boundingBox.max)<1e-4,name+' upper bounds')
    geometry.dispose()
  }
})


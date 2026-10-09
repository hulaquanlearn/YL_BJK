import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {Box3,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
test('all five requested models load, contain finite geometry, and identify illustrative quality',async()=>{
  const catalog=JSON.parse(await fs.readFile(new URL('../../server/data/ledger-model-catalog.json',import.meta.url),'utf8'))
  const models=catalog.supplements.find(batch=>batch.version==='missing-five-20261009-v1').models
  assert.deepEqual(models.map(m=>m.materialCode),['502005240','502006637','505024987','505026166','505026171'])
  for(const model of models){
    const bytes=await fs.readFile(new URL('../public'+model.modelUrl,import.meta.url))
    const result=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
    const size=new Box3().setFromObject(result.scene).getSize(new Vector3())
    assert.ok(size.toArray().every(n=>Number.isFinite(n)&&n>0),model.name)
    assert.equal(model.quality,'外观示意');assert.ok(model.description)
    const dimensions=result.scene.children[0].userData.nominalDimensionsMm
    if(dimensions) {
      assert.ok(Math.abs(size.x / size.z - dimensions.outerDiameter / dimensions.width)<.001,model.name+' dimensional proportions');
    }
    result.scene.traverse(node=>{if(node.geometry){assert.ok(Array.from(node.geometry.attributes.position.array).every(Number.isFinite));node.geometry.dispose();node.material.dispose()}})
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {pdfFitScale} from '../src/utils/pdf-fit.mjs'
test('whole-page mode contains portrait and landscape drawings within the resized available viewport',()=>{
 for(const page of [{width:600,height:800},{width:800,height:600}])for(const space of [{width:330,height:440},{width:1200,height:600},{width:600,height:300}]){
  const scale=pdfFitScale(page,space)
  assert.ok(page.width*scale<=space.width+.001)
  assert.ok(page.height*scale<=space.height+.001)
  assert.equal(pdfFitScale(page,space,'width'),space.width/page.width)
  assert.equal(pdfFitScale(page,space,2),space.width/page.width*2)
 }
})

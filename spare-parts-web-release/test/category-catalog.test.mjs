import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCategoryCatalog,searchCategoryCatalog,referenceImageForModel} from '../src/utils/category-catalog.mjs'
import {locatedPartDisplay} from '../src/utils/located-part-display.mjs'

test('Chinese and English model names share A-Z order; dropdown finds names, aliases and pinyin',()=>{
  const rows=prepareCategoryCatalog(['轴承','RGV部件','消声器','电机','PLC模块','三角带/V带'].map((name,i)=>({id:i+1,name,keywords:name==='消声器'?'muffler,排气降噪':''})))
  assert.deepEqual(rows.map(r=>r.name),['电机','PLC模块','RGV部件','三角带/V带','消声器','轴承'])
  for(const query of ['消声','xiaosheng','xsq','MUFFLER','排气'])assert.deepEqual(searchCategoryCatalog(rows,query).map(r=>r.name),['消声器'])
  assert.equal(searchCategoryCatalog(rows,'轴承 muffler').length,0)
  assert.equal(searchCategoryCatalog(rows,'').length,6)
})

test('image fallback resolves bundled categories only, never invents upload or external URLs',()=>{
  assert.equal(referenceImageForModel('/models/categories/motor.glb'),'/models/categories/motor.jpg')
  assert.equal(referenceImageForModel('/models/reference-20260904/deep-groove-bearing.glb'),'/models/reference-20260904/deep-groove-bearing.png')
  for(const url of ['/uploads/part-models/a.glb','https://example.com/a.glb','/models/categories/../../a.glb','blob:123'])assert.equal(referenceImageForModel(url),'')
})

test('located part hides repeated punctuation variants while retaining additional specifications',()=>{
  assert.deepEqual(locatedPartDisplay({materialDesc:'NSK,带座轴承,UCP213，立式座，',materialCode:'505019297',spec:'带座轴承, UCP213, 立式座,'}),{name:'NSK,带座轴承,UCP213，立式座',code:'505019297',spec:''})
  assert.equal(locatedPartDisplay({name:'电机',code:'1',spec:'380V / 3kW'}).spec,'380V / 3kW')
  assert.equal(locatedPartDisplay({materialCode:'123'}).name,'123')
})

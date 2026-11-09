import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parse,compileStyle} from '@vue/compiler-sfc'
import postcss from 'postcss'

test('warehouse button styles stay attached to the button after Vue compilation',()=>{
 const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
 let css=''
 for(const style of parse(source).descriptor.styles){
  const compiled=compileStyle({source:style.content,id:'warehouse-style-check',scoped:style.scoped})
  assert.deepEqual(compiled.errors,[])
  postcss.parse(compiled.code).walkRules(rule=>{
   assert.ok(!rule.selectors.includes('#app'),'a lazy warehouse stylesheet must never resize or pad the root')
  })
  css+=compiled.code
 }
 assert.match(css,/#app \.model-title-heading \.refresh-layout-button/)
})

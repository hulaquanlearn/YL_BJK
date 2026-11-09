import test from 'node:test'
import assert from 'node:assert/strict'
import {depositColumn,depositIntegral} from '../src/utils/abb-deposit-geometry.mjs'
const dimensions={lowerRadius:1.09,upperRadius:1.2,height:.97},cell={targetHeight:800,depositGridSize:24}
test('tapered columns preserve volume at partial and final heights without clipping tall boxes',()=>{
 const alpha=(1.2-1.09)/.97/1.09,baseArea=.01,capacity=baseArea*depositIntegral(.8,alpha)
 for(const fraction of [.001,.1,.5,1]){
  const result=depositColumn({u:.3,v:-.4,capacity,area:capacity/.8,volume:capacity*fraction},cell,dimensions)
  assert.ok(Math.abs(result.renderedVolume-capacity*fraction)<1e-12)
  assert.ok(result.height<=.8+1e-10)
  if(fraction===1)assert.ok(Math.abs(result.height-.8)<1e-10)
 }
})

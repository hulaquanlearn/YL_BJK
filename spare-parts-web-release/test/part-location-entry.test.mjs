import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyPartLocation,locationEntryPayload} from '../src/utils/part-location-entry.mjs'
test('standard selections produce the existing six-digit code, preserving leading zeroes',()=>{
  const value={...emptyPartLocation(),shelf:7,position:1,layer:2,location:6}
  assert.equal(locationEntryPayload(value,'raw_grain').locationCode,'071206')
  assert.equal(locationEntryPayload({...value,shelf:99,position:2,layer:4,location:99},'brewing').locationCode,'992499')
})
test('partial shelf locations retain shelf and layer without inventing direction or slot',()=>{
  assert.deepEqual(locationEntryPayload({...emptyPartLocation(),shelf:1,layer:4},'raw_grain'),{locationType:'shelf',locationNote:null,shelf:1,layer:4,position:null,location:null,locationCode:null})
})
test('location mode clears shelf data and other locations require an actual description',()=>{
  assert.throws(()=>locationEntryPayload({locationType:'free_text'},'raw_grain'),/具体存放位置/)
  const value=locationEntryPayload({locationType:'free_text',locationNote:' 二楼A柜 ',shelf:1,layer:2},'raw_grain')
  assert.equal(value.locationNote,'二楼A柜');assert.equal(value.shelf,null);assert.equal(value.locationCode,null)
  assert.equal(locationEntryPayload({...emptyPartLocation(),locationNote:'制曲备件库'},'qu_making').locationType,'free_text')
})
test('missing required fields and invalid numbers cannot generate malformed codes',()=>{
  assert.throws(()=>locationEntryPayload(emptyPartLocation(),'raw_grain'),/货架/)
  const value={...emptyPartLocation(),shelf:1,layer:1,position:1,location:1}
  for(const patch of [{shelf:100},{shelf:0},{layer:5},{position:3},{location:100},{location:1.5}])assert.throws(()=>locationEntryPayload({...value,...patch},'raw_grain'))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { collectFilteredParts } from '../src/utils/selection.mjs'
import { compareUnitTotals } from '../src/utils/statistics-sort.mjs'
test('select all traverses filtered pages and excludes records without write access',async()=>{
  const rows=Array.from({length:536},(_,i)=>({_id:String(i),workshopCode:i%2?'raw_grain':'qu_making'})),calls=[]
  const selected=await collectFilteredParts(async query=>{calls.push(query);return {total:536,data:rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize)}},{searchKeyword:'轴承',stockStatus:'normal'},row=>row.workshopCode==='raw_grain')
  assert.equal(calls.length,3);assert.equal(selected.length,268);assert.ok(calls.every(q=>q.searchKeyword==='轴承'&&q.stockStatus==='normal'))
})
test('cancelled or incomplete selections are never returned as a complete result',async()=>{
  assert.equal(await collectFilteredParts(async()=>({total:1,data:[{_id:1}]}),{},()=>true,()=>false),null)
  await assert.rejects(collectFilteredParts(async()=>({total:500,data:[{_id:1}]}),{},()=>true),/不完整/)
})
test('quantity sorting compares matching units instead of mixed sums',()=>{
  const a={unitTotals:[{unit:'个',total:1},{unit:'米',total:9999}]},b={unitTotals:[{unit:'米',total:1},{unit:'个',total:2}]}
  assert.ok(compareUnitTotals(a,b)<0)
  assert.equal(compareUnitTotals(a,{unitTotals:[...a.unitTotals].reverse()}),0)
})

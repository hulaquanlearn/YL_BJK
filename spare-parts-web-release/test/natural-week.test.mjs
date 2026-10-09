import test from 'node:test'
import assert from 'node:assert/strict'
import {weekCode,weekMonday,addDays} from '../src/utils/natural-week.mjs'
test('ISO week picker maps whole Monday to Sunday weeks including week 53',()=>{
  for(const [monday,code] of [['2026-09-28','2026-W40'],['2026-12-28','2026-W53'],['2027-01-04','2027-W01'],['2024-12-30','2025-W01']]){
    assert.equal(weekCode(monday),code);assert.equal(weekMonday(code),monday)
  }
  assert.equal(addDays('2026-12-28',7),'2027-01-04');assert.equal(addDays('2026-09-28',-7),'2026-09-21')
})
test('invalid or empty week selections do not become unrelated dates',()=>{
  for(const v of ['','2026-W00','2027-W53','2026-W54','2026-09-28'])assert.equal(weekMonday(v),'')
})

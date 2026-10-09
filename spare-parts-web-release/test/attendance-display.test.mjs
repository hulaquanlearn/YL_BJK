import test from 'node:test'
import assert from 'node:assert/strict'
import {canReadFeature} from '../src/utils/feature-access.mjs'
import {duration,attendanceCsv} from '../src/utils/attendance-display.mjs'
test('attendance is raw-grain/admin only and storage is admin only',()=>{
  for(const role of ['admin','raw_grain','qu_making','brewing','viewer']){assert.equal(canReadFeature({role,staffWorkshopCode:'raw_grain'},'/attendance'),['admin','raw_grain'].includes(role));assert.equal(canReadFeature({role},'/work-storage'),role==='admin')}
})
test('CSV preserves timestamps and quotes, distinguishes unavailable seconds and prevents formula injection',()=>{
  assert.equal(duration(1308),'21分48秒');assert.equal(duration(1),'0分01秒');assert.equal(duration(null),'—')
  const row={name:'=CMD()',id:'G1',department:'原粮',date:'2026-09-17',shift:'24:00-8:00',start:'2026-09-17 00:00:00',end:'2026-09-17 08:00:00',key:'G1',status:'missing_exit',advanceSeconds:null,earlyCount:0,gpsTimes:['2026-09-17 08:00:05'],timeline:[{sourceRows:[2,3]}]};const csv=attendanceCsv([row],{G1:{note:'备注"含引号\n换行'}});assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'=CMD\(\)/);assert.match(csv,/备注""含引号/);assert.match(csv,/缺出门待核查/);assert.match(csv,/"2；3"/)
})

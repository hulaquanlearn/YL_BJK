import test from 'node:test'
import assert from 'node:assert/strict'
import {dutySubmitted,recordsForDuty} from '../src/utils/work-pending.mjs'
const duty={id:'directive_tasks',frequency:'每日'}
const record=(id,status,date,mode='daily')=>({id,status,kind:'duties',week_start:'2026-09-28',record_date:date,payload:{mode,checks:[{dutyId:duty.id}]}})
test('a later draft does not hide an already submitted item for the selected date',()=>{
 const rows=[record(1,'submitted','2026-09-30'),record(2,'draft','2026-09-30')]
 assert.equal(dutySubmitted(rows,duty,'2026-09-30','2026-09-28'),true)
 assert.equal(dutySubmitted(rows,duty,'2026-10-01','2026-09-28'),false)
 assert.equal(dutySubmitted(rows,duty,'2026-09-30','2026-09-21'),false)
})
test('weekly submissions belong to the selected week and daily entries cannot satisfy them',()=>{
 const weekly={...duty,frequency:'每周'},rows=[record(1,'submitted','2026-09-28'),record(2,'draft','2026-09-30','weekly')]
 assert.equal(dutySubmitted(rows,weekly,'2026-09-30','2026-09-28'),false)
 rows.push(record(3,'submitted','2026-10-02','weekly'))
 assert.equal(recordsForDuty(rows,weekly,'2026-09-30','2026-09-28').length,2)
 assert.equal(dutySubmitted(rows,weekly,'2026-09-30','2026-09-28'),true)
})

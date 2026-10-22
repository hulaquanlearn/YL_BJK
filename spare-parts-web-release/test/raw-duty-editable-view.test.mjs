import test from 'node:test'
import assert from 'node:assert/strict'
import {editableReportView} from '../src/utils/raw-duty-editable-view.mjs'
const report={user_id:12,week_start:'2026-10-12',status:'draft',revision:2,cadence:null,template:{entries:[{id:'d',frequency:'每班'},{id:'m',frequency:'每月'}]},checks:[{dutyId:'d',result:'已完成',note:'旧周记录',recordDate:'',photoIds:[1]},{dutyId:'m',result:'已完成',note:'月记录',recordDate:'2026-10-06',photoIds:[2]}]}
test('old editable report enters daily UI without a manual upgrade step or fabricated dates',()=>{
 const before=structuredClone(report),view=editableReportView(report,12,true,'2026-10-15')
 assert.equal(view.pendingCadenceUpgrade,true);assert.equal(view.cadence.version,2);assert.deepEqual(view.cadence.calendar,{})
 assert.deepEqual(view.checks[0].dailyRecords,[]);assert.equal(view.checks[1].monthlyRecords[0].recordDate,'2026-10-06')
 assert.deepEqual(view.cadence.legacyChecks,report.checks);assert.deepEqual(report,before)
})
test('explicit dated old work maps only to that one day; readonly and submitted reports stay unchanged',()=>{
 const dated={...report,checks:[{...report.checks[0],recordDate:'2026-10-13'}]},view=editableReportView(dated,12,true,'2026-10-15')
 assert.equal(view.checks[0].dailyRecords.length,1);assert.equal(view.cadence.calendar['2026-10-13'],'work')
 assert.equal(editableReportView(report,1,true,'2026-10-15'),report);assert.equal(editableReportView(report,12,false,'2026-10-15'),report)
 const submitted={...report,status:'submitted'};assert.equal(editableReportView(submitted,12,true,'2026-10-15'),submitted)
})

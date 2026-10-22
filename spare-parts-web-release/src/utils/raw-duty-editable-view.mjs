import {weekDays,weekMonths} from './raw-duty-cadence-summary.mjs'

// Display old editable reports in the normal daily flow. Persist only after a user saves.
// Undated weekly evidence remains archived, never copied into seven daily completions.
export function editableReportView(report,userId,active,today){
 if(report.cadence?.version||report.user_id!==userId||!active||!['draft','returned'].includes(report.status))return report
 const days=weekDays(report.week_start),months=weekMonths(report.week_start),calendar={}
 const checks=report.template.entries.map(entry=>{
  const old=structuredClone(report.checks.find(c=>c.dutyId===entry.id)||{dutyId:entry.id})
  const validDay=old.recordDate&&old.recordDate<=today&&days.includes(old.recordDate)
  if(entry.frequency==='每班'){
   if(validDay&&(old.result||old.note||old.photoIds?.length))calendar[old.recordDate]='work'
   return {dutyId:entry.id,dailyRecords:validDay?[{...old,date:old.recordDate}]:[]}
  }
  if(entry.frequency==='每月')return {dutyId:entry.id,monthlyRecords:old.monthlyRecords?.length?old.monthlyRecords:old.recordDate&&old.recordDate<=today&&months.includes(old.recordDate.slice(0,7))?[{...old,month:old.recordDate.slice(0,7)}]:[]}
  return {...old,recordDate:validDay?old.recordDate:''}
 })
 return {...report,checks,pendingCadenceUpgrade:true,cadence:{version:2,calendar,legacyChecks:structuredClone(report.checks)}}
}

const day=value=>String(value||'').slice(0,10)
export function recordsForDuty(records,duty,date,weekStart){
  return (records||[]).filter(r=>r.kind==='duties'&&(!r.week_start||day(r.week_start)===weekStart)&&r.payload?.checks?.some(c=>c.dutyId===duty.id))
    .filter(r=>duty.frequency==='每日'?day(r.record_date)===date:duty.frequency==='每周'?r.payload.mode==='weekly':true)
}
export function dutySubmitted(records,duty,date,weekStart){
  return recordsForDuty(records,duty,date,weekStart).some(r=>r.status==='submitted')
}

function dutyState(c = {}) {
 if (!c.result) return 'missing'
 const note = typeof c.note === 'string' && c.note.trim()
 if (c.dateRequired && !c.recordDate) return 'evidence'
 if (c.result !== '已完成' && !note) return 'evidence'
 return ({'已完成':'done','异常':'abnormal','进行中':'working','未完成':'incomplete','本周未发生':'exempt','本期不适用':'exempt'})[c.result] || 'missing'
}
function dutyMatches(c = {}, key = 'all') {
 if (key === 'all') return true
 if (key === 'missing' || key === 'evidence') return dutyState(c) === key
 return ({abnormal:['异常'],done:['已完成'],working:['进行中'],incomplete:['未完成'],exempt:['本周未发生','本期不适用']})[key]?.includes(c.result) || false
}
function dutyProgress(entries = [], checks = []) {
 const byId = new Map(checks.map(c => [c.dutyId, c]))
 const out = {total:entries.length,filled:0,ready:0,missing:0,evidence:0,done:0,abnormal:0,working:0,incomplete:0,exempt:0}
 for (const e of entries) {
  const c = byId.get(e.id) || {}, state = dutyState(c)
  if (state === 'missing' || state === 'evidence') out[state]++
  const resultState = ({'已完成':'done','异常':'abnormal','进行中':'working','未完成':'incomplete','本周未发生':'exempt','本期不适用':'exempt'})[c.result]
  if (resultState) out[resultState]++
  if (c.result) out.filled++
  if (!['missing','evidence'].includes(state)) out.ready++
 }
 return out
}
export {dutyState,dutyProgress,dutyMatches};

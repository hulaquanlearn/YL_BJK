export const attendanceStatuses = Object.freeze({
  normal: '正常下班出门', early: '提前出门', sequence_review: '进出顺序待核查', rest: '休息', leave: '请假 / 调休', blank: '空排班',
  missing_exit: '有下班GPS，未见对应闸机出门', missing_no_gps: '未见对应下班记录',
  partial: '数据不足', unmatched: '考勤未匹配', no_records: '该班次无考勤',
  returned: '旧规则：出门后班内返回', late_exit: '旧规则：观察窗后有出门', no_signal: '旧规则：未见所查异常'
})
export const statusLabel = status => attendanceStatuses[status] || '待核查'
export const needsAttendanceReview = row => !['normal','rest','leave','blank'].includes(row.status)
export const needsAttendanceReanalysis = analysis => Boolean(analysis && (Number(analysis.version || 1)<2 || Number(analysis.version)===2 && Number(analysis.ruleRevision || 1)<7))
const matchesPerson = (person, query) => `${person.name || ''} ${person.id || ''}`.toLowerCase().includes(query)
export function attendancePeopleForKeyword(analysis, keyword = '') {
  const query = keyword.trim().toLowerCase()
  return query ? (analysis?.people || []).filter(person => matchesPerson(person, query)) : []
}
export function attendanceShiftOptions(analysis, keyword = '') {
  const query = keyword.trim().toLowerCase()
  if (query && Array.isArray(analysis?.people)) return [...new Set(attendancePeopleForKeyword(analysis, keyword).flatMap(person => Object.keys(person.shiftCounts || {})))]
  if (!query && Array.isArray(analysis?.shiftOptions)) return [...new Set(analysis.shiftOptions.filter(value => typeof value === 'string' && value))]
  const sourceOrder = [...(analysis?.results || [])].filter(row => !query || matchesPerson(row, query)).sort((a,b)=>(a.scheduleRow ?? Infinity)-(b.scheduleRow ?? Infinity) || String(a.date || '').localeCompare(String(b.date || '')) || (a.scheduleColumn ?? Infinity)-(b.scheduleColumn ?? Infinity))
  return [...new Set(sourceOrder.map(row => row.shift).filter(Boolean))]
}
export const attendanceResultOptions = rows => [...new Set(rows.map(row=>row.status).filter(Boolean))].map(value=>({value,label:statusLabel(value)}))
export function attendanceResultGroups(rows = []) {
  const counts=new Map()
  for(const row of rows)if(row.status)counts.set(row.status,(counts.get(row.status)||0)+1)
  const definitions=[
    {label:'正常',items:[['normal','正常下班']]},
    {label:'待核查',items:[['early','提前出门'],['missing_exit','GPS下班待核查'],['sequence_review','进出待核查'],['missing_no_gps','缺下班记录']]},
    {label:'数据不足',items:[['partial','文件覆盖不足'],['unmatched','人员未匹配'],['no_records','班次无记录']]},
    {label:'旧版结果',items:[['returned',statusLabel('returned')],['late_exit',statusLabel('late_exit')],['no_signal',statusLabel('no_signal')]]}
  ]
  const known=new Set(definitions.flatMap(group=>group.items.map(([value])=>value)))
  definitions[1].items.push(...[...counts.keys()].filter(value=>!known.has(value)).map(value=>[value,statusLabel(value)]))
  return definitions.map(group=>({label:group.label,options:group.items.filter(([value])=>counts.has(value)).map(([value,label])=>({value,label,count:counts.get(value)}))})).filter(group=>group.options.length)
}
export function filterAttendanceRows(rows, {tab = 'all', status = '', shift = '', keyword = '', minAdvance = 0} = {}) {
  const query = keyword.trim().toLowerCase()
  return rows.filter(row => (status ? row.status === status : tab === 'all' || tab === 'late' && row.arrival?.status === 'late' || tab === 'signals' && needsAttendanceReview(row) && row.status !== 'early' || row.status === tab) && (!shift || row.shift === shift) && (!query || matchesPerson(row, query)) && (!minAdvance || Number(row.advanceSeconds) >= minAdvance))
}
// Later visit exits must never become the previous shift's final exit, including legacy reports.
export function associatedExit(row) {
  if (Object.hasOwn(row, 'finalExit')) return row.finalExit || null
  return row.normalExit || row.afterExit || (row.status === 'early' ? row.earlyExit : null) || null
}
export function attendanceEvidence(row) {
  const evidence = []
  if (row.arrival?.status==='late') evidence.push({code:'arrival',text:`迟到 ${duration(row.arrival.lateSeconds)}`})
  const outings = row.outingCount ?? row.earlyCount ?? 0
  if (outings) evidence.push({code:'outings',text:`班内出门 ${outings} 次${row.returnedOutings ? ` · 返回 ${row.returnedOutings} 次` : ''}`})
  if (row.gpsTimes?.length) evidence.push({code:'gps',text:`下班时段GPS ${row.gpsTimes.length} 条`})
  if (row.sequenceIssues?.length) evidence.push({code:'sequence',text:`进出顺序疑点 ${row.sequenceIssues.length} 项`})
  if (row.retryScanCount) evidence.push({code:'retry',text:`重复刷脸 ${row.retryScanCount} 条（合并核查）`})
  if (row.subsequentEvents?.some(e=>e.type==='out')) evidence.push({code:'subsequent',text:'后续出门不补算本班'})
  return evidence
}
export function duration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const n = Math.round(seconds), minutes = Math.floor(n / 60), rest = n % 60
  return `${minutes}分${String(rest).padStart(2, '0')}秒`
}
export function shortTime(value) { return value ? value.slice(11) : '未查到' }
export function fileSize(value) {
  const n = Number(value) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 ** 2).toFixed(2)} MB`
}
export function attendanceCsv(rows, notes = {}) {
  const escape = value => {
    let text = String(value ?? '')
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const header = ['姓名', '工号', '部门', '排班日期', '班次', '应上班', '应下班', '核查类型', '本班关联出门', '正常下班窗口内出门', '提前时长（秒）', '班内出门次数', '班内返回次数', '班内出门记录', '重复刷脸次数', '重复刷脸组（原始行）', '下班时段GPS', '正常下班窗口截止', '补充观察截止', '顺序疑点', '核查线索', '后续记录（不补算本班离场）', '较晚出门（仅作后续证据）', '文件时间范围覆盖', '排班原始行', '排班原始列', '考勤原始行', '核查备注', '上班核查依据', '上班手机打卡', '上班闸机进门', '手机与闸机间隔（秒）', '30分钟内配对', '上班核查时间', '迟到时长（秒）', '上班结果']
  const eventsText = events => (events || []).map(e=>`${e.time} ${e.type==='in'?'进门':e.type==='out'?'出门':e.type==='gps'?'GPS':e.type}${e.scopeReason?`（${e.scopeReason}）`:''}`).join('；')
  const retryGroupsText = groups => (groups || []).map(g=>`${g.from} 至 ${g.to} ${g.type==='in'?'进门':'出门'} ${g.gate || ''} ${g.scanCount} 条（原始行：${(g.sourceRows || []).join('、')}）`).join('；')
  const body = rows.map(r => [r.name, r.id, r.department, r.date, r.shift, r.start, r.end, statusLabel(r.status), associatedExit(r), r.normalExit, r.advanceSeconds, r.outingCount ?? r.earlyCount, r.returnedOutings, eventsText(r.outingEvents || r.earlyEvents), r.retryScanCount, retryGroupsText(r.retryGroups), (r.gpsTimes || []).join('；'), r.normalExitEnd, r.observationEnd, (r.sequenceIssues || []).map(i=>`${i.time || ''} ${i.message || i.code}`).join('；'), (r.findings || []).map(f=>f.text).join('；'), eventsText(r.subsequentEvents || r.timeline?.filter(e=>e.contextOnly)), r.lateExit, r.rowType==='schedule' ? '' : r.complete ? '是' : '否', r.scheduleRow, r.scheduleColumn, (r.timeline || []).flatMap(e => e.sourceRows || []).join('；'), notes[r.key]?.note || '', r.arrival?.basis==='paired_gate'?'手机与闸机配对':r.arrival?.basis==='gps'?'手机打卡':r.arrival?.basis==='gate'?'闸机进门':'', r.arrival?.mobileTime, r.arrival?.gateTime, r.arrival?.gapSeconds, r.arrival?.basis ? r.arrival.paired?'是':'否' : '', r.arrival?.time, r.arrival?.lateSeconds, r.arrival?.status==='late'?'迟到':r.arrival?.status==='on_time'?'按时打卡':r.arrival?'缺上班记录':''])
  return '\uFEFF' + [header, ...body].map(row => row.map(escape).join(',')).join('\r\n')
}

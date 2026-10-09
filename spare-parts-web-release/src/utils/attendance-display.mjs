export const attendanceStatuses = Object.freeze({
  early: '提前出门', returned: '出门后班内返回', missing_exit: '缺出门待核查',
  late_exit: '观察窗后有出门', missing_no_gps: '缺出门且无下班GPS',
  partial: '数据未覆盖', unmatched: '考勤未匹配', no_records: '该班次无考勤', no_signal: '未见所查异常'
})
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
  const header = ['姓名', '工号', '部门', '排班日期', '班次', '应上班', '应下班', '核查类型', '下班前最后出门', '提前时长（秒）', '提前出门记录数', '班内返回时间', '下班观察窗内出门', '观察窗后出门', '下班时段GPS', '出门后首次GPS', '观察截止', '数据覆盖完整', '排班原始行', '排班原始列', '考勤原始行', '核查备注']
  const body = rows.map(r => [r.name, r.id, r.department, r.date, r.shift, r.start, r.end, attendanceStatuses[r.status], r.earlyExit, r.advanceSeconds, r.earlyCount, r.returnedAt, r.afterExit, r.lateExit, r.gpsTimes.join('；'), r.gpsAfterExit, r.observationEnd, r.complete ? '是' : '否', r.scheduleRow, r.scheduleColumn, r.timeline.flatMap(e => e.sourceRows || []).join('；'), notes[r.key]?.note || ''])
  return '\uFEFF' + [header, ...body].map(row => row.map(escape).join(',')).join('\r\n')
}

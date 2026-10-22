const dayTypes = new Set(['work', 'rest', 'leave', 'blank'])

// Calendar dates and weekday positions use workshop dates, independent of the browser timezone.
export function buildAttendanceMonth(analysis, personId) {
  const match = String(analysis?.month || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  if (!match || !Array.isArray(analysis?.people)) return null
  const year = Number(match[1]), monthIndex = Number(match[2]) - 1
  if (year < 2000 || year > 2100) return null
  const person = analysis.people.find(person => String(person.id).toUpperCase() === String(personId).toUpperCase())
  if (!person || !Array.isArray(person.days)) return null

  const month = analysis.month, dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const sourceDays = new Map(person.days.filter(day => typeof day.date === 'string' && day.date.startsWith(month + '-')).map(day => [day.date, day]))
  const personResults = (analysis.results || []).filter(row => row.id === person.id)
  const days = Array.from({length:dayCount}, (_, index) => {
    const dayNumber = index + 1, date = `${month}-${String(dayNumber).padStart(2, '0')}`
    const source = sourceDays.get(date), available = Boolean(source && dayTypes.has(source.type))
    const type = available ? source.type : 'blank'
    const result = type === 'work' ? personResults.find(row => row.date === date && row.shift === source.shift) || personResults.find(row => row.date === date) || null : null
    const statusCategory = type === 'work' ? result?.status === 'normal' ? 'normal' : result?.status === 'early' ? 'early' : 'review' : type
    return {date,dayNumber,type,shift:available ? source.shift : undefined,label:available ? source.label : '排班数据未提供',result,statusCategory,available}
  })

  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({length:cells.length / 7}, (_, index) => cells.slice(index * 7, index * 7 + 7))
  const count = predicate => days.filter(predicate).length
  const summary = {
    workDays:count(day => day.available && day.type === 'work'),
    restDays:count(day => day.available && day.type === 'rest'),
    leaveDays:count(day => day.available && day.type === 'leave'),
    blankDays:count(day => day.available && day.type === 'blank'),
    normalShifts:count(day => day.statusCategory === 'normal'),
    earlyShifts:count(day => day.statusCategory === 'early'),
    lateShifts:count(day => day.type === 'work' && day.result?.arrival?.status === 'late'),
    reviewShifts:count(day => day.statusCategory === 'review'),
    unavailableDays:count(day => !day.available)
  }
  return {person,month,days,weeks,summary,earlyDays:days.filter(day => day.statusCategory === 'early'),lateDays:days.filter(day => day.type === 'work' && day.result?.arrival?.status === 'late')}
}

const D = require('./work-duties');

// One fault forfeits the configured item's entire base score, never other items.
// Today may still be reported; only elapsed required days become missed reports.
function buildAudit(rule, records, calendar, { catalog = D, photos = null, asOf = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) } = {}) {
  const snapshot = records.flatMap(r => r.payload?.checks || []).find(c => c.dutyId === rule.dutyId)?.dutySnapshot;
  const duty = catalog.get(rule.dutyId) || snapshot || D.get(rule.dutyId);
  if (!rule.dutyId || !duty) return null;
  const mode = D.cadence[duty.frequency];
  const rows = records.filter(r => r.kind === 'duties' && r.payload?.mode === mode && r.status === 'submitted' &&
    String(r.record_date).slice(0, 10) <= asOf && (!calendar?.weekStart || r.week_start === calendar.weekStart ||
      (String(r.record_date).slice(0, 10) >= calendar.weekStart && String(r.record_date).slice(0, 10) <= calendar.workEnd)) &&
    (mode !== 'daily' || !calendar || calendar.workDates.includes(String(r.record_date).slice(0, 10))));
  const submitted = rows.flatMap(record => (record.payload.checks || []).filter(c => c.dutyId === duty.id).map(check => ({ record, check })));
  const events = [];
  const expectedDates = calendar?.confirmed && mode === 'daily' ? calendar.workDates.filter(d => d < asOf) : [];
  for (const date of expectedDates) {
    if (!submitted.some(x => String(x.record.record_date).slice(0, 10) === date)) events.push({ type: 'missing', date, recordIds: [], label: '漏报' });
  }
  if (calendar?.confirmed && mode === 'weekly' && calendar.workEnd < asOf && !submitted.length)
    events.push({ type: 'missing', date: calendar.workEnd, recordIds: [], label: '本周事项漏报' });
  for (const { record, check } of submitted) {
    const date = String(record.record_date).slice(0, 10), recordedDuty = check.dutySnapshot || duty;
    const abnormal = recordedDuty.abnormalOptions?.includes(check.status) || ['异常', '有异常', '发现问题', '未完成'].includes(check.status);
    if (abnormal) events.push({ type: check.status === '未完成' ? 'unfinished' : 'abnormal', date, recordIds: [Number(record.id)],
      label: check.status === '未完成' ? '未完成' : '异常', note: check.note || '', action: check.action || '', productionReport: check.productionReport || null });
    if (photos && !D.hasMaterial(recordedDuty, check, photos.some(p => String(p.record_id) === String(record.id) && p.task_key === duty.id)))
      events.push({ type: 'missing_material', date, recordIds: [Number(record.id)], label: '缺少必要验证材料' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  // Multiple task/evidence records for one daily item are one occurrence per day.
  // Continuous work may have separate occurrences on the same date.
  const units = new Set(events.map(e => mode === 'continuous' && e.recordIds.length ? `record:${e.recordIds[0]}` : `date:${e.date}`));
  const deductionCount = calendar?.confirmed ? units.size : 0;
  const deductionPerOccurrence = Number(rule.max), deduction = Math.min(Number(rule.max), deductionCount * deductionPerOccurrence);
  const deductionReason = events.length ? `${events.map(e => `${e.date} ${e.label}${e.recordIds.length ? `（记录${e.recordIds.join('、')}）` : ''}`).join('；')}。每次扣本项分值${rule.max}分，本项累计扣${deduction}分，基础分最低0分。` : '';
  return { dutyId: duty.id, title: duty.title, frequency: duty.frequency, expectedDates, events,
    deductionPerOccurrence, deductionCount, deduction, scoreLimit: Math.max(0, Number(rule.max) - deduction), deductionReason,
    missingDates: events.filter(e => e.type === 'missing').map(e => e.date),
    abnormalDates: [...new Set(events.filter(e => e.type === 'abnormal').map(e => e.date))],
    unfinishedDates: [...new Set(events.filter(e => e.type === 'unfinished').map(e => e.date))],
    incompleteMaterialDates: [...new Set(events.filter(e => e.type === 'missing_material').map(e => e.date))],
    calendarConfirmed: Boolean(calendar?.confirmed), pendingCalendar: !calendar?.confirmed,
    evidenceRecordIds: [...new Set(submitted.map(x => Number(x.record.id)))] };
}

function buildAudits(config, records, calendar, options) {
  return config.map(rule => ({ ruleId: String(rule.id), audit: buildAudit(rule, records, calendar, options) })).filter(item => item.audit);
}

module.exports = { buildAudit, buildAudits };

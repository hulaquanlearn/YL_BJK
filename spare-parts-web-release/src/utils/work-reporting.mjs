// Editable records must use the same effective catalog as the save API.
// Published/read-only evidence continues to display its original snapshot.
export function reportingDuty(check, current, editable) {
  return editable && current ? current : check?.dutySnapshot || current || null
}

export function reportingStatus(status, duty) {
  if (['photo', 'document'].includes(duty?.reportMode)) return '已提交材料'
  if (duty?.options?.includes(status)) return status
  const normalized = { 无异常: '正常', 有异常: '异常', 未发现: '正常', 发现问题: '异常' }[status]
  return normalized && duty?.options?.includes(normalized) ? normalized : ''
}

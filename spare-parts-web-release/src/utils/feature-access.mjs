export function isRawEmployee(user) {
  return user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain' && user.staffPosition !== 'shift_leader'
}
export function staffPositionLabel(user) {
  if (user?.staffWorkshopCode === 'raw_grain') return user.staffPosition === 'shift_leader' ? '工段长' : '员工'
  return ({group_leader:'组长',shift_leader:'班长'})[user?.staffPosition] || '人员'
}
export function canReadFeature(user, path) {
  if(path==='/account')return Boolean(user)
  if(path==='/ai-call-logs')return user?.role==='admin'
  if (isRawEmployee(user)) return ['/portal','/inventory','/warehouse-3d'].includes(path)
  if(path === '/robot-program')return Boolean(user)
  if (path === '/raw-duties') return ['admin','raw_grain'].includes(user?.role) || (user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain' && user.staffPosition === 'shift_leader')
  if (path === '/attendance') return ['admin','raw_grain'].includes(user?.role) || (user?.role==='viewer' && user.staffWorkshopCode==='raw_grain' && user.staffPosition === 'shift_leader')
  if (path === '/work-storage') return user?.role === 'admin'
  if (path === '/work') return false
  return Boolean(user)
}

// The remaining work module uses the raw-grain permission check at each entrance.
export function preferredWorkPath() {
  return '/raw-duties'
}

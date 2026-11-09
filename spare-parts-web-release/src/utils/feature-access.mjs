import { canReadFire } from './fire-inspection.mjs'

export function isRawEmployee(user) {
  return user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain' && user.staffPosition !== 'shift_leader'
}
export function staffPositionLabel(user) {
  return ({employee:'员工',maintenance:'维修人员（车间）',manufacturer_maintenance:'维修人员（厂家）',group_leader:'线长 / 组长',shift_leader:'班长 / 工段长'})[user?.staffPosition] || '人员'
}
export function canReadFeature(user, path) {
  if(path==='/control-passwords')return ['admin','qu_making'].includes(user?.role)||(user?.role==='viewer'&&user.staffWorkshopCode==='qu_making')
  if(path==='/account')return Boolean(user)
  if(path==='/fire-inspection')return canReadFire(user)
  if(path==='/agv-repairs')return false // retired
  if (isRawEmployee(user)) return ['/portal','/inventory','/warehouse-3d'].includes(path)
  if(path === '/robot-program')return Boolean(user)
  if (path === '/raw-duties') return ['admin','raw_grain'].includes(user?.role) || (user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain' && user.staffPosition === 'shift_leader')
  if (path === '/attendance') return false // retired route is never authorized
  if (path === '/work-storage') return user?.role === 'admin'
  if (path === '/work') return false
  return Boolean(user)
}

// Each work function owns its authorization; opening the centre grants no rights.
export function preferredWorkPath(user) {
  return ['/raw-duties','/fire-inspection','/agv-vehicles'].find(path=>canReadFeature(user,path)) || '/portal'
}

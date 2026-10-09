const managers = new Set(['admin','raw_grain','qu_making','brewing'])
export function canReadFeature(user, path) {
  if (path === '/attendance') return ['admin','raw_grain'].includes(user?.role)
  if (path === '/work-storage') return user?.role === 'admin'
  if (path === '/work') return managers.has(user?.role) || (user?.role === 'viewer' && user.staffWorkshopCode === 'qu_making' && ['group_leader','shift_leader'].includes(user.staffPosition))
  if (path === '/inspection-notices') return managers.has(user?.role) || (user?.role === 'viewer' && user.staffWorkshopCode === 'raw_grain')
  return Boolean(user)
}

// Choose the relevant starting page without hiding the other feature entries.
export function preferredWorkPath(user) {
  return user?.role === 'raw_grain' || user?.staffWorkshopCode === 'raw_grain' ? '/inspection-notices' : '/work'
}

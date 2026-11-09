import { canReadFeature, staffPositionLabel } from './feature-access.mjs'

// A narrow desktop window is still a website. Phone navigation requires actual
// mobile identity or a coarse primary pointer together with the phone viewport.
export function mobileWorkspaceEnabled({ userAgent = '', narrow = false, coarse = false, embedded = false, standalone = false } = {}) {
  if (embedded) return false
  if (/DigitalWorkbench(?:Android|IOS)\//.test(userAgent)) return true
  return (narrow || standalone) && (coarse || /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(userAgent))
}

const groups = [
  { id: 'spare', title: '备件管理', description: '库存、出入库与现场定位', path: '/inventory', enter: '进入备件管理', icon: 'Box', links: [
    ['库存总览', '/inventory', 'Box'], ['出入库流水', '/movements', 'Switch'], ['补货清单', '/replenishment', 'ShoppingCartFull'], ['3D 库位', '/warehouse-3d', 'Location'], ['盘点管理', '/check', 'DocumentChecked'], ['备件统计', '/statistics', 'DataAnalysis'], ['物料与模型', '/model-library', 'Collection'], ['设备与备件', '/equipment', 'Tools'], ['数据检查', '/data-quality', 'Warning']
  ] },
  { id: 'engineering', title: '智能工程', description: '机器人程序、资料与故障经验', path: '/robot-program', enter: '进入智能工程', icon: 'Reading', links: [
    ['机器人程序智能分析', '/robot-program', 'DocumentChecked'], ['工程知识库', '/knowledge', 'Reading']
  ] },
  { id: 'work', title: '工作管理', description: '履职、消防与设备模型展示', path: '/raw-duties', enter: '进入工作管理', icon: 'Calendar', links: [
    ['工段长履职考评', '/raw-duties', 'DocumentChecked'], ['消防点检', '/fire-inspection', 'CircleCheck'], ['设备模型展示', '/agv-vehicles', 'View'], ['中控密码管理', '/control-passwords', 'Lock']
  ] }
]

/** The catalogue describes existing routes; API authorization remains authoritative. */
export const nativeFieldPaths=new Set(['/inventory','/movements','/replenishment','/warehouse-3d','/check','/knowledge','/raw-duties','/fire-inspection','/agv-vehicles','/control-passwords'])
export function mobileModules(user, {nativeAndroid=false}={}) {
  if (!user) return []
  return groups.map(group => ({ ...group, links: group.links.filter(([, path]) => (canReadFeature(user, path)||path==='/control-passwords')&&(!nativeAndroid||nativeFieldPaths.has(path))).map(([label, path, icon]) => ({ label, path, icon, ...(path==='/control-passwords'?{disabled:!canReadFeature(user,path)}:{}) })) }))
    .filter(group => group.links.length)
    .map(group => ({ ...group, ...(group.id === 'work' ? { description: group.links.filter(link => !link.disabled).map(link => link.label).join('、') } : {}), path: group.links.some(link => link.path === group.path) ? group.path : group.links.find(link=>!link.disabled)?.path||'/portal' }))
}

export function mobileAccountLinks(user) {
  if (!user) return []
  const links = [{ label: '个人资料与账号安全', path: '/account', icon: 'User' }]
  if (user.role === 'admin') links.push(
    { label: '账号管理', path: '/account?tab=users', icon: 'UserFilled' },
    { label: '数据管理', path: '/account?tab=storage', icon: 'Folder' },
    { label: 'AI 调用记录', path: '/account?tab=records', icon: 'List' },
    { label: 'API 与 Codex 用量', path: '/account?tab=usage', icon: 'DataAnalysis' }
  )
  return links
}

export function mobileRoleLabel(user) {
  if (user?.role === 'viewer' && user.staffWorkshopCode) return `${({ raw_grain: '原粮车间', qu_making: '制曲车间', brewing: '酿酒车间' })[user.staffWorkshopCode] || '车间'}${staffPositionLabel(user)}`
  return ({ admin: '系统管理员', raw_grain: '原粮车间管理员', qu_making: '制曲车间管理员', brewing: '酿酒车间管理员', viewer: '车间人员' })[user?.role] || '未登录'
}

export function mobileSnapshot(user, page, options) {
  const name = user?.displayName || user?.username || '同事'
  return { version: 1, page, accountId: String(user?._id || user?.id || user?.username || ''), name, initial: name.slice(0, 1), role: mobileRoleLabel(user), modules: mobileModules(user,options) }
}

export function isMobileNavigationAllowed(user, path, {nativeAndroid=false}={}) {
  if (!user || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\#\s]/.test(path)) return false
  // The native client may retain an inventory scope when returning from 3D.
  const [pathname, query = ''] = path.split('?')
  if (path.split('?').length > 2) return false
  if (pathname === '/account') {
    const params = new URLSearchParams(query)
    if ([...params.keys()].some(key => key !== 'tab') || params.getAll('tab').length > 1) return false
    const tab = params.get('tab')
    return !tab || tab === 'profile' || !nativeAndroid&&user.role === 'admin' && ['users', 'storage', 'records', 'usage'].includes(tab)
  }
  if (pathname === '/portal') return !query
  return mobileModules(user,{nativeAndroid}).some(group => group.links.some(link => link.path === pathname && !link.disabled))
}

export function inventoryDetailBack(route, state) {
  return route.path === '/knowledge' && route.query.library === 'parts'
    && typeof state?.inventoryDetailBack === 'string'
    && /^\/inventory(?:[?#]|$)/.test(state.inventoryDetailBack)
    && state.back === state.inventoryDetailBack
}

export async function navigateMobile(router, user, path, options) {
  if (!isMobileNavigationAllowed(user, path,options)) return false
  if (router.currentRoute.value.fullPath === path) return true
  try {
    const failure = await router.push(path)
    return !failure && router.currentRoute.value.fullPath === path
  } catch { return false }
}

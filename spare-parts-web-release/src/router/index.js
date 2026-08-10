import { createRouter, createWebHistory } from 'vue-router'
import { getToken, getUser } from '../auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { public: true, title: '账号登录' } },
  { path: '/', redirect: '/inventory' },
  { path: '/inventory', name: 'Inventory', component: () => import('../views/Inventory.vue'), meta: { title: '库存总览', description: '查询备件库存、库位和预警状态' } },
  { path: '/replenishment', name: 'Replenishment', component: () => import('../views/Replenishment.vue'), meta: { title: '补货清单', description: '按最高储备生成低库存备件补货建议' } },
  { path: '/procurement', name: 'Procurement', component: () => import('../views/Procurement.vue'), meta: { title: '采购跟踪', description: '跟踪补货采购、在途数量与到货入库' } },
  { path: '/movements', name: 'Movements', component: () => import('../views/Movements.vue'), meta: { title: '库存流水', description: '追溯每一次出库、入库和盘点调整' } },
  { path: '/warehouse-3d', name: 'Warehouse3D', component: () => import('../views/Warehouse3D.vue'), meta: { title: '3D 库位', description: '在房间模型中定位货架、层数和货位' } },
  { path: '/equipment', name: 'Equipment', component: () => import('../views/Equipment.vue'), meta: { title: '设备与备件', description: '建立设备、维修工单与常用备件关系' } },
  { path: '/data-quality', name: 'DataQuality', component: () => import('../views/DataQuality.vue'), meta: { title: '数据质量', description: '发现并修复补货、统计和定位所依赖的数据问题' } },
  { path: '/check', name: 'Check', component: () => import('../views/Check.vue'), meta: { title: '盘点管理', description: '创建盘点任务并完成审批闭环' } },
  { path: '/statistics', name: 'Statistics', component: () => import('../views/Statistics.vue'), meta: { title: '备件统计', description: '实时掌握库存结构、风险和流动趋势' } },
  { path: '/account', name: 'Account', component: () => import('../views/Account.vue'), meta: { title: '账号设置', description: '修改密码和查看当前权限' } },
  { path: '/users', name: 'Users', component: () => import('../views/Users.vue'), meta: { title: '账号管理', description: '创建账号并分配用户和管理员权限', admin: true } }
]

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

router.beforeEach(to => {
  if (to.meta.public) return getToken() && getUser() ? '/inventory' : true
  if (!getToken() || !getUser()) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.admin && getUser()?.role !== 'admin') return '/inventory'
  return true
})

export default router

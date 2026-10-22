import { createRouter, createWebHistory } from 'vue-router'
import { getToken, getUser, setSession } from '../auth'
import { getMe } from '../api'
import { canReadFeature } from '../utils/feature-access.mjs'

const routes = [
  { path: '/ai-call-logs', redirect: '/account?tab=records' },
  { path: '/robot-program', name: 'RobotProgram', component: () => import('../views/RobotProgram.vue'), meta: { module:'knowledge', title:'机器人程序智能分析', description:'ABB备份分析、中文注释与修改审阅' } },
  { path: '/raw-duties', name: 'RawDuties', component: () => import('../views/RawDuties.vue'), meta: { module: 'work', title: '工段长履职考评', description: '填写每周履职情况、查看验证材料与导出周材料' } },
  { path: '/attendance', name: 'AttendanceReview', component: () => import('../views/AttendanceReview.vue'), meta: { module: 'work', title: '考勤核查', description: '按排班核对闸机进出与手机打卡记录' } },
  { path: '/work-storage', redirect: '/account?tab=storage' },
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { public: true, title: '账号登录' } },
  { path: '/', redirect: '/portal' },
  { path: '/portal', name: 'Portal', component: () => import('../views/Portal.vue'), meta: { portal: true, title: '业务板块' } },
  { path: '/knowledge', name: 'Knowledge', component: () => import('../views/Knowledge.vue'), meta: { module: 'knowledge', title: '工程知识', description: '沉淀工程资料、故障经验与标准处置方法' } },
  { path: '/inventory', name: 'Inventory', component: () => import('../views/Inventory.vue'), meta: { module: 'spare', title: '库存总览', description: '查询备件库存、库位和预警状态' } },
  { path: '/replenishment', name: 'Replenishment', component: () => import('../views/Replenishment.vue'), meta: { title: '补货清单', description: '按最高储备生成低库存备件补货建议' } },
  { path: '/movements', name: 'Movements', component: () => import('../views/Movements.vue'), meta: { title: '库存流水', description: '追溯每一次出库、入库和盘点调整' } },
  { path: '/warehouse-3d', name: 'Warehouse3D', component: () => import('../views/Warehouse3D.vue'), meta: { title: '3D 库位', description: '在房间模型中定位货架、层数和货位' } },
  { path: '/model-library', name: 'ModelLibrary', component: () => import('../views/ModelLibrary.vue'), meta: { title: '备件模型库', description: '管理备件图片与模型，支持批量关联' } },
  { path: '/equipment', name: 'Equipment', component: () => import('../views/Equipment.vue'), meta: { title: '设备与备件', description: '按设备型号查找和维护常用备件' } },
  { path: '/data-quality', name: 'DataQuality', component: () => import('../views/DataQuality.vue'), meta: { title: '数据质量', description: '发现并修复补货、统计和定位所依赖的数据问题' } },
  { path: '/check', name: 'Check', component: () => import('../views/Check.vue'), meta: { title: '盘点管理', description: '创建盘点任务并完成审批闭环' } },
  { path: '/statistics', name: 'Statistics', component: () => import('../views/Statistics.vue'), meta: { title: '备件统计', description: '实时掌握库存结构、风险和流动趋势' } },
  { path: '/account', name:'Account', component:()=>import('../views/Account.vue'), meta:{module:'account',title:'个人中心',description:'管理个人资料与账号安全'} },
  { path: '/users', redirect: '/account?tab=users' },
  { path: '/:pathMatch(.*)*', redirect: '/portal' }
]

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

let verifiedToken = ''
router.beforeEach(async to => {
  const token = getToken()
  if (token && token !== verifiedToken) {
    try {
      const response = await getMe()
      setSession(token, response.data.user || response.data)
      verifiedToken = token
    } catch { return to.path === '/login' ? true : '/login' }
  }
  if (to.meta.public) return getToken() && getUser() ? '/portal' : true
  if (!getToken() || !getUser()) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.admin && getUser()?.role !== 'admin') return '/portal'
  if (!canReadFeature(getUser(), to.path)) return '/portal'
  return true
})

export default router

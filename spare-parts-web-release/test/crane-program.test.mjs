import test from 'node:test'
import assert from 'node:assert/strict'
import {craneProgramAxes,craneProgramActions,craneProgramFlows} from '../src/utils/crane-program.mjs'
import {craneAxes} from '../src/utils/crane-state.mjs'

const EXPECTED_LABELS=['取斗','放斗','入池','出池','移动到位置','转运','扫描','空','转移覆盖糟','反运','踩窖','抓平','池底抓糟','取盖']
const FORBIDDEN=[
 [/Yx\s*\(/,'PLC Yx address'],
 [/\b(?:robotOpt|vectorOpt|flipHopper|AutoDigLess|transferMove\w*|switchBaodou|digmove|rzmove|transYZRmove|OnMain|OnAuxMove\w*)\b/,'original function name'],
 [/\b\d{1,3}(?:\.\d{1,3}){3}\b/,'IP address'],
 [/\b(?:192\.168|password|admin)\b/i,'credential'],
 [/密码|账号|人员表|人员名单/,'credential or personnel table'],
 [/PLC|ProfiNET|PN\s*名称/i,'field address or bus name']
]
const CHINESE=/[\u4e00-\u9fa5]/

function stringsOf(value){
 if(typeof value==='string')return [value]
 if(Array.isArray(value))return value.flatMap(stringsOf)
 if(value&&typeof value==='object')return Object.values(value).flatMap(stringsOf)
 return []
}
function assertClean(text,where){
 for(const [pattern,label] of FORBIDDEN)assert.ok(!pattern.test(text),`${where} exposes ${label}: ${text.slice(0,80)}`)
}

test('9 个机构轴与 crane-state 的 9 个演示轴一一对应',()=>{
 assert.ok(Array.isArray(craneProgramAxes))
 assert.equal(craneProgramAxes.length,9)
 assert.ok(Object.isFrozen(craneProgramAxes))
 const ids=craneProgramAxes.map(axis=>axis.id)
 assert.equal(new Set(ids).size,ids.length)
 const stateIds=craneAxes.map(axis=>axis.id)
 assert.equal(stateIds.length,9)
 assert.deepEqual(ids,stateIds,'9 个 id 必须与 crane-state 顺序一致')
 const scan=craneProgramAxes[8]
 assert.equal(scan.id,'scan')
 assert.deepEqual(scan.controllerAxes,['A15'])
 assert.equal(scan.unit,'rad')
 const controllerAxes=craneProgramAxes.flatMap(axis=>axis.controllerAxes)
 assert.equal(new Set(controllerAxes).size,controllerAxes.length,'同一控制器轴不能出现在两个机构')
 for(const axis of craneProgramAxes){
  assert.equal(typeof axis.label,'string')
  assert.ok(CHINESE.test(axis.label),`${axis.id} label should be Chinese`)
  assert.ok(['mm','rad'].includes(axis.unit),`${axis.id} unit`)
  assert.equal(typeof axis.description,'string')
  assert.ok(axis.description.length>=12,`${axis.id} description too short`)
  assert.ok(Array.isArray(axis.controllerAxes)&&axis.controllerAxes.length>=1)
  for(const name of axis.controllerAxes)assert.match(name,/^A\d{1,2}$/)
  assertClean(axis.description,`axis ${axis.id}`)
  assertClean(axis.label,`axis ${axis.id}`)
  assert.ok(Object.isFrozen(axis.controllerAxes))
 }
 const units=new Set(craneProgramAxes.map(axis=>axis.unit))
 assert.deepEqual([...units].sort(),['mm','rad'])
})

test('14 个动作与工艺标签一一对应，handler 为工序名而不是原始函数',()=>{
 assert.equal(craneProgramActions.length,14)
 assert.ok(Object.isFrozen(craneProgramActions))
 const ids=craneProgramActions.map(action=>action.id)
 assert.equal(new Set(ids).size,ids.length)
 assert.deepEqual(craneProgramActions.map(action=>action.label),EXPECTED_LABELS)
 for(const action of craneProgramActions){
  assert.match(action.id,/^[a-z][a-z0-9-]*$/)
  assert.equal(typeof action.handler,'string')
  assert.ok(CHINESE.test(action.handler))
  assertClean(action.handler,`action ${action.id}`)
  assert.ok(Object.isFrozen(action))
 }
})

test('工艺流程覆盖取放斗、入池、出池、转运、翻转、覆盖糟、踩窖、抓平、池底、取盖与扫描',()=>{
 assert.ok(Array.isArray(craneProgramFlows))
 assert.ok(craneProgramFlows.length>=12)
 assert.ok(Object.isFrozen(craneProgramFlows))
 const ids=craneProgramFlows.map(flow=>flow.id)
 assert.equal(new Set(ids).size,ids.length)
 for(const required of ['get-vector','put-vector','put-material','get-material','transfer','anti-transfer','transfer-top','tread-material','flat-material','get-material-bottom','get-cover','scan']){
  assert.ok(ids.includes(required),`missing flow ${required}`)
 }
 for(const flow of craneProgramFlows){
  assert.match(flow.id,/^[a-z][a-z0-9-]*$/)
  assert.equal(typeof flow.label,'string')
  assert.ok(CHINESE.test(flow.label))
  assert.ok(Array.isArray(flow.steps)&&flow.steps.length>=4,`${flow.id} needs at least 4 steps`)
  for(const step of flow.steps){
   assert.equal(typeof step,'string')
   assert.ok(step.length>=6,`${flow.id} step too short`)
   assert.ok(CHINESE.test(step))
   assertClean(step,`flow ${flow.id} step`)
  }
  assert.ok(Object.isFrozen(flow.steps))
  assert.ok(Object.isFrozen(flow))
 }
 // flow 与动作关联：除“移动到位置/空”外，每个动作都有对应流程
 const flowIds=new Set(ids)
 for(const action of craneProgramActions){
  if(['move-pos','null'].includes(action.id))continue
  assert.ok(flowIds.has(action.id),`action ${action.id} has no flow`)
 }
})


test('导出内容只有非敏感结构/工艺数据，没有原始数值、代码或额外接口',()=>{
 const exported={craneProgramAxes,craneProgramActions,craneProgramFlows}
 for(const [name,value] of Object.entries(exported)){
  assert.notEqual(typeof value,'function',`${name} should be data`)
  assert.ok(Object.isFrozen(value),`${name} should be frozen`)
  const strings=stringsOf(value)
  for(const text of strings)assertClean(text,`${name}`)
 }
 // 不在数据里出现 4 位以上数字（PLC 地址/标定值形态）
 for(const value of [craneProgramAxes,craneProgramActions,craneProgramFlows]){
  for(const text of stringsOf(value))assert.ok(!/\b\d{4,}\b/.test(text),`numeric field value leaked: ${text.slice(0,60)}`)
 }
})

test('复核修正：取盖为人工绑/松吊带、转运不自动回安全姿态、开合与换向只写阈值条件',()=>{
 const byId=Object.fromEntries(craneProgramAxes.map(axis=>[axis.id,axis]))
 // 开合与换向只写条件/阈值，不能概括成“必须完全闭合”或“不允许旋转”
 assert.ok(byId.grip.description.includes('同步偏差'))
 assert.ok(!byId.grip.description.includes('完全闭合'))
 assert.ok(byId.rotation.description.includes('阈值'))
 assert.ok(!byId.rotation.description.includes('不允许旋转'))
 // 取盖：两次暂停等待人工确认吊带（绑好、松开），不能写成自动夹盖或插销锁盖
 const cover=craneProgramFlows.find(flow=>flow.id==='get-cover')
 assert.ok(cover)
 assert.ok(cover.steps.filter(step=>step.includes('暂停')).length>=2)
 assert.ok(cover.steps.filter(step=>step.includes('人工确认')).length>=2)
 assert.ok(!cover.steps.some(step=>/插销锁定|自动夹紧|自动抓取盖体/.test(step)))
 // 转运：张开放料后函数返回，不能写下一次调度才可能执行的动作
 const transfer=craneProgramFlows.find(flow=>flow.id==='transfer')
 assert.ok(transfer)
 assert.ok(!transfer.steps.some(step=>/恢复安全姿态|确认转运完成后返回|回到安全姿态/.test(step)))
 assert.ok(transfer.steps.some(step=>step.includes('不自动回安全姿态')))
})

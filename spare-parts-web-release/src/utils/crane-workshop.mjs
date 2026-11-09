// 智能行车四列窖池抓糟演示 · 纯作业状态机（随车长方体转运斗方案）
//
// 依据 docs/CRANE_WORKSHOP_COLLABORATION_20261106.md 最新"用户更正 → 接料与盖板
// 方案替换"契约实现：
// - 取消固定接料位；抓取后卸到随桥架同 X 的随车长方体转运斗。
// - 状态只保留 coverOpen，不再有盖板叠放数据；显示由几何层处理。
// - 纯状态/守恒/阶段机，不依赖 Three、DOM、时间或随机数。
//
// 阶段：idle → begin-grab → approach → arrive above-pool → descend
//       → arrive surface → close → take → lift → arrive lifted → transport
//       → prepare-transfer（降转运提升）→ arrive hopper → discharge
//       → release → complete
// UI 负责平滑插值，到端点后提交 arrive/take/release/prepare-transfer。
const PHASES = Object.freeze(['idle','approach','descend','close','lift','transport','discharge','complete'])
const LOG_LIMIT = 100
const EPS = 1e-9
const DEFAULT_ROWS = 3
const COLUMNS = [-6,-2,2,6]
const ROW_PITCH = 8

function buildDefaultLayout(){
 const layout = []
 for(let column = 1; column <= COLUMNS.length; column++){
  for(let row = 1; row <= DEFAULT_ROWS; row++){
   layout.push({
    id: `c${column}-r${row}`,
    column,
    row,
    x: (row - (DEFAULT_ROWS + 1) / 2) * ROW_PITCH,
    z: COLUMNS[column - 1],
    width: 3.2,
    length: 3.2
   })
  }
 }
 return layout
}
export const workshopLayout = Object.freeze(buildDefaultLayout().map(item=>Object.freeze(item)))

export const workshopConfig = Object.freeze({
 rimY: .25,
 bottomY: -1.2,
 initialMaterialY: .1,
 grabSafeBottomY: 2.99,
 minClearance: .3,
 minTwoCarSeparationZ: 2.38,
 transferZ: 8.5,
 transferHoistTopY: 3.65,
 hopper: Object.freeze({capacity: 4, receiveTopY: 1.65, rimOffset: -.10}),
 poolUnits: 8,
 grabCapacity: 1
})

function clone(value){return JSON.parse(JSON.stringify(value))}
function isNumber(value){return typeof value === 'number' && Number.isFinite(value)}
function distance2D(ax,az,bx,bz){return Math.hypot(ax - bx, az - bz)}
function materialSurfaceY(config,material){
 const fraction = Math.max(0, Math.min(1, material / config.poolUnits))
 return config.bottomY + (config.initialMaterialY - config.bottomY) * fraction
}
function normalizeLayoutItem(item,index){
 return {
  id: typeof item.id === 'string' && item.id ? item.id : `pool-${index + 1}`,
  column: isNumber(item.column) ? item.column : Math.floor(index / DEFAULT_ROWS) + 1,
  row: isNumber(item.row) ? item.row : (index % DEFAULT_ROWS) + 1,
  x: isNumber(item.x) ? item.x : 0,
  z: isNumber(item.z) ? item.z : 0,
  width: isNumber(item.width) ? item.width : 3.2,
  length: isNumber(item.length) ? item.length : 3.2
 }
}
function buildLayoutForRows(rows){
 const count = Math.max(1, Math.floor(rows))
 const layout = []
 for(let column = 1; column <= COLUMNS.length; column++){
  for(let row = 1; row <= count; row++){
   layout.push({id: `c${column}-r${row}`, column, row, x: (row - (count + 1) / 2) * ROW_PITCH, z: COLUMNS[column - 1], width: 3.2, length: 3.2})
  }
 }
 return layout
}
function normalizeConfig(overrides = {}){
 const config = {
  ...workshopConfig,
  ...overrides,
  hopper: {...workshopConfig.hopper, ...(overrides.hopper || {})}
 }
 // 旧固定接料位方案已删除，不保留兼容字段/路径。
 delete config.station
 if(Array.isArray(overrides.layout)) config.layout = overrides.layout.map(normalizeLayoutItem)
 else if(isNumber(overrides.rows)) config.layout = buildLayoutForRows(overrides.rows)
 else config.layout = workshopLayout.map(item=>({...item}))
 config.poolUnits = isNumber(config.poolUnits) && config.poolUnits > 0 ? config.poolUnits : workshopConfig.poolUnits
 config.grabCapacity = isNumber(config.grabCapacity) && config.grabCapacity > 0 ? config.grabCapacity : workshopConfig.grabCapacity
 config.hopper.capacity = isNumber(config.hopper.capacity) && config.hopper.capacity > 0 ? config.hopper.capacity : workshopConfig.hopper.capacity
 config.hopper.receiveTopY = isNumber(config.hopper.receiveTopY) ? config.hopper.receiveTopY : workshopConfig.hopper.receiveTopY
 config.hopper.rimOffset = isNumber(config.hopper.rimOffset) ? config.hopper.rimOffset : workshopConfig.hopper.rimOffset
 return config
}
export function createWorkshopState(overrides = {}){
 const config = normalizeConfig(overrides || {})
 const layout = config.layout
 const pools = {}
 layout.forEach((item,index)=>{pools[item.id] = {...item, coverOpen: index === 0, material: config.poolUnits}})
 return {
  config,
  selectedPoolId: layout.length ? layout[0].id : null,
  phase: 'idle',
  paused: false,
  pools,
  grab: {load: 0, x: 0, z: -5.1, bottomY: config.grabSafeBottomY},
  transfer: {z: config.transferZ, hoistTopY: config.transferHoistTopY},
  hopper: {load: 0},
  totals: {initial: layout.length * config.poolUnits},
  seq: 0,
  log: []
 }
}
function makeResult(ok,reason = null,settled = false,events = []){return {ok,reason,settled,events}}
function commit(state,entries){
 state.seq += 1
 const events = entries.map(entry=>({seq: state.seq, ...entry}))
 for(const event of events) state.log.push(event)
 if(state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT)
 return makeResult(true, null, false, events)
}
function block(state,reason){return {state, result: makeResult(false, reason)}}
function poolOf(state,poolId){return state.pools[poolId] || null}
function selectedPool(state){return state.pools[state.selectedPoolId] || null}
function inIdlePhase(state){return state.phase === 'idle' || state.phase === 'complete'}
function pauseGuard(state){return state.paused ? block(state, 'paused') : null}
function hopperFree(state){return state.config.hopper.capacity - state.hopper.load}

function applySelectPool(state,action){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(!inIdlePhase(state))return block(state, 'invalid-phase')
 const pool = poolOf(state, action.poolId)
 if(!pool)return block(state, 'unknown-pool')
 if(state.selectedPoolId === pool.id)return {state, result: makeResult(true)}
 state.selectedPoolId = pool.id
 const result = commit(state, [{type: 'select-pool', poolId: pool.id}])
 return {state, result}
}
function applySetCover(state,action){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(!inIdlePhase(state))return block(state, 'invalid-phase')
 if(action.manual !== true)return block(state, 'manual-required')
 const pool = poolOf(state, action.poolId)
 if(!pool)return block(state, 'unknown-pool')
 if(state.grab.load !== 0)return block(state, 'grab-loaded')
 if(pool.coverOpen === Boolean(action.open))return {state, result: makeResult(true)}
 pool.coverOpen = Boolean(action.open)
 const result = commit(state, [{type: 'set-cover', poolId: pool.id, open: pool.coverOpen}])
 return {state, result}
}
function applyBeginGrab(state,action){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(!inIdlePhase(state))return block(state, 'invalid-phase')
 const pool = poolOf(state, action.poolId)
 if(!pool)return block(state, 'unknown-pool')
 if(!pool.coverOpen)return block(state, 'cover-closed')
 if(!(pool.material > 0))return block(state, 'pool-empty')
 if(state.grab.load !== 0)return block(state, 'grab-loaded')
 if(hopperFree(state) < state.config.grabCapacity - EPS)return block(state, 'hopper-full')
 state.selectedPoolId = pool.id
 state.phase = 'approach'
 const result = commit(state, [{type: 'begin-grab', poolId: pool.id}])
 return {state, result}
}
function applyArrive(state,action){
 const guard = pauseGuard(state)
 if(guard)return guard
 const grab = action.grab
 if(!grab || !isNumber(grab.x) || !isNumber(grab.z) || !isNumber(grab.bottomY))return block(state, 'invalid-grab')
 const pool = selectedPool(state)
 if(!pool)return block(state, 'unknown-pool')
 const at = action.at
 // 只有非接料端点继续旧横向间距检查；接料端点要求抓斗与转运斗 Z 重合。
 if(at !== 'hopper' && Math.abs(grab.z - state.transfer.z) < state.config.minTwoCarSeparationZ - EPS)return block(state, 'transfer-proximity')
 if(at === 'above-pool'){
  if(state.phase !== 'approach')return block(state, 'invalid-phase')
  if(distance2D(grab.x, grab.z, pool.x, pool.z) > .15)return block(state, 'position-out-of-range')
  if(grab.bottomY < state.config.rimY + state.config.minClearance - EPS)return block(state, 'height-out-of-range')
  state.grab = {load: state.grab.load, x: grab.x, z: grab.z, bottomY: grab.bottomY}
  state.phase = 'descend'
  return {state, result: commit(state, [{type: 'arrive', at, poolId: pool.id, x: grab.x, z: grab.z, bottomY: grab.bottomY}])}
 }
 if(at === 'surface'){
  if(state.phase !== 'descend')return block(state, 'invalid-phase')
  if(distance2D(grab.x, grab.z, pool.x, pool.z) > .15)return block(state, 'position-out-of-range')
  const surface = materialSurfaceY(state.config, pool.material)
  if(Math.abs(grab.bottomY - surface) > .2 + EPS)return block(state, 'height-out-of-range')
  state.grab = {load: state.grab.load, x: grab.x, z: grab.z, bottomY: grab.bottomY}
  state.phase = 'close'
  return {state, result: commit(state, [{type: 'arrive', at, poolId: pool.id, x: grab.x, z: grab.z, bottomY: grab.bottomY}])}
 }
 if(at === 'lifted'){
  if(state.phase !== 'lift')return block(state, 'invalid-phase')
  if(distance2D(grab.x, grab.z, pool.x, pool.z) > .15)return block(state, 'position-out-of-range')
  if(grab.bottomY < state.config.grabSafeBottomY - .01 - EPS)return block(state, 'height-out-of-range')
  state.grab = {load: state.grab.load, x: grab.x, z: grab.z, bottomY: grab.bottomY}
  state.phase = 'transport'
  return {state, result: commit(state, [{type: 'arrive', at, poolId: pool.id, x: grab.x, z: grab.z, bottomY: grab.bottomY}])}
 }
 if(at === 'hopper'){
  if(state.phase !== 'transport')return block(state, 'invalid-phase')
  if(state.transfer.hoistTopY > state.config.hopper.receiveTopY + EPS)return block(state, 'transfer-not-lowered')
  if(state.grab.load <= 0)return block(state, 'no-load')
  if(Math.abs(grab.x - pool.x) > .15)return block(state, 'position-out-of-range')
  if(Math.abs(grab.z - state.transfer.z) > .15)return block(state, 'position-out-of-range')
  if(grab.bottomY < state.config.grabSafeBottomY - .01 - EPS)return block(state, 'grab-not-raised')
  if(grab.bottomY < state.transfer.hoistTopY + state.config.minClearance - EPS)return block(state, 'grab-not-raised')
  if(hopperFree(state) <= EPS)return block(state, 'hopper-full')
  state.grab = {load: state.grab.load, x: grab.x, z: grab.z, bottomY: grab.bottomY}
  state.phase = 'discharge'
  return {state, result: commit(state, [{type: 'arrive', at, x: grab.x, z: grab.z, bottomY: grab.bottomY}])}
 }
 return block(state, 'unknown-arrive')
}
function applyPrepareTransfer(state,action){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(state.phase !== 'transport')return block(state, 'invalid-phase')
 const pool = selectedPool(state)
 if(!pool)return block(state, 'unknown-pool')
 if(state.grab.load <= 0)return block(state, 'no-load')
 const grab = action.grab
 if(!grab || !isNumber(grab.x) || !isNumber(grab.z) || !isNumber(grab.bottomY))return block(state, 'invalid-grab')
 const topY = action.topY
 if(!isNumber(topY))return block(state, 'height-out-of-range')
 if(topY > state.config.hopper.receiveTopY + EPS || topY <= state.config.rimY + EPS)return block(state, 'height-out-of-range')
 if(distance2D(grab.x, grab.z, pool.x, pool.z) > .15)return block(state, 'position-out-of-range')
 if(grab.bottomY < state.config.grabSafeBottomY - .01 - EPS)return block(state, 'grab-not-raised')
 state.transfer.hoistTopY = topY
 state.grab = {load: state.grab.load, x: grab.x, z: grab.z, bottomY: grab.bottomY}
 return {state, result: commit(state, [{type: 'prepare-transfer', topY, poolId: pool.id}])}
}
function applyTake(state){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(state.phase !== 'close')return block(state, 'invalid-phase')
 const pool = selectedPool(state)
 if(!pool)return block(state, 'unknown-pool')
 const amount = Math.min(state.config.grabCapacity - state.grab.load, pool.material)
 if(!(amount > 0))return block(state, 'pool-empty')
 pool.material -= amount
 state.grab.load += amount
 state.phase = 'lift'
 const result = commit(state, [{type: 'take', poolId: pool.id, amount}])
 result.settled = true
 return {state, result}
}
function applyRelease(state){
 const guard = pauseGuard(state)
 if(guard)return guard
 if(state.phase !== 'discharge')return block(state, 'invalid-phase')
 if(state.grab.load <= 0)return block(state, 'no-load')
 const free = hopperFree(state)
 if(free <= EPS)return block(state, 'hopper-full')
 const amount = Math.min(free, state.grab.load)
 state.hopper.load += amount
 state.grab.load -= amount
 state.phase = state.grab.load > EPS ? 'discharge' : 'complete'
 const result = commit(state, [{type: 'release', target: 'hopper', amount, partial: state.grab.load > EPS}])
 result.settled = true
 return {state, result}
}
function applyPause(state,paused){
 if(state.paused === paused)return {state, result: makeResult(true)}
 state.paused = paused
 return {state, result: commit(state, [{type: paused ? 'pause' : 'resume'}])}
}
export function applyWorkshopAction(state,action){
 if(!state || typeof state !== 'object')throw new Error('applyWorkshopAction expects a workshop state')
 const next = clone(state)
 if(!action || typeof action.type !== 'string')return block(next, 'invalid-action')
 switch(action.type){
  case 'select-pool': return applySelectPool(next, action)
  case 'set-cover': return applySetCover(next, action)
  case 'begin-grab': return applyBeginGrab(next, action)
  case 'arrive': return applyArrive(next, action)
  case 'prepare-transfer': return applyPrepareTransfer(next, action)
  case 'take': return applyTake(next)
  case 'release': return applyRelease(next)
  case 'pause': return applyPause(next, true)
  case 'resume': return applyPause(next, false)
  case 'reset-material': return {state: createWorkshopState(next.config), result: makeResult(true)}
  default: return block(next, 'invalid-action')
 }
}
export function workshopSummary(state){
 if(!state || typeof state !== 'object')throw new Error('workshopSummary expects a workshop state')
 const remaining = Object.values(state.pools).reduce((sum,pool)=>sum + pool.material, 0)
 const grabLoad = state.grab.load
 const hopperLoad = state.hopper.load
 const initial = state.totals.initial
 const pool = state.pools[state.selectedPoolId] || null
 return {
  remaining,
  grabLoad,
  hopperLoad,
  hopperCapacity: state.config.hopper.capacity,
  initial,
  conserved: Math.abs(remaining + grabLoad + hopperLoad - initial) <= 1e-6,
  selectedPool: state.selectedPoolId,
  materialY: pool ? materialSurfaceY(state.config, pool.material) : null
 }
}
export function checkWorkshopInvariants(state){
 const errors = []
 if(!state || typeof state !== 'object')return {ok: false, errors: ['invalid-state']}
 if(!PHASES.includes(state.phase))errors.push('invalid-phase')
 if(typeof state.paused !== 'boolean')errors.push('invalid-paused')
 if(!Number.isInteger(state.seq) || state.seq < 0)errors.push('invalid-seq')
 if(!Array.isArray(state.log) || state.log.length > LOG_LIMIT)errors.push('invalid-log')
 const config = state.config || {}
 if(!isNumber(config.poolUnits) || config.poolUnits <= 0)errors.push('invalid-pool-units')
 if(!isNumber(config.grabCapacity) || config.grabCapacity <= 0)errors.push('invalid-grab-capacity')
 if(!config.hopper || !isNumber(config.hopper.capacity) || config.hopper.capacity <= 0)errors.push('invalid-hopper-capacity')
 const poolIds = Object.keys(state.pools || {})
 if(!poolIds.length)errors.push('no-pools')
 for(const id of poolIds){
  const pool = state.pools[id]
  if(!pool || typeof pool.coverOpen !== 'boolean')errors.push(`invalid-cover:${id}`)
  if(!isNumber(pool.material) || pool.material < -EPS || pool.material > config.poolUnits + EPS)errors.push(`invalid-material:${id}`)
 }
 if(!state.pools[state.selectedPoolId])errors.push('invalid-selected-pool')
 if(!isNumber(state.grab.load) || state.grab.load < -EPS || state.grab.load > config.grabCapacity + EPS)errors.push('invalid-grab-load')
 if(!isNumber(state.grab.x) || !isNumber(state.grab.z) || !isNumber(state.grab.bottomY))errors.push('invalid-grab-position')
 if(!state.transfer || !isNumber(state.transfer.z) || !isNumber(state.transfer.hoistTopY))errors.push('invalid-transfer-state')
 if(!state.hopper || !isNumber(state.hopper.load) || state.hopper.load < -EPS || state.hopper.load > config.hopper.capacity + EPS)errors.push('invalid-hopper-load')
 if(!isNumber(state.totals.initial))errors.push('invalid-initial')
 else if(Math.abs(state.totals.initial - poolIds.length * config.poolUnits) > 1e-6)errors.push('initial-mismatch')
 if(!workshopSummary(state).conserved)errors.push('material-not-conserved')
 return {ok: errors.length === 0, errors}
}

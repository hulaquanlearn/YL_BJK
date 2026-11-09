import test from 'node:test'
import assert from 'node:assert/strict'
import {workshopLayout,workshopConfig,createWorkshopState,applyWorkshopAction,workshopSummary,checkWorkshopInvariants} from '../src/utils/crane-workshop.mjs'

const clone=value=>JSON.parse(JSON.stringify(value))
const POOL='c1-r1'
const POOL_POS={x:-8,z:-6}
const RECEIVE_TOP_Y=1.65

function apply(state,action){return applyWorkshopAction(state,action)}
function expectOk(state,action){
 const before=clone(state)
 const {state:next,result}=apply(state,action)
 assert.equal(result.ok,true,`action ${action && action.type} failed: ${result.reason}`)
 assert.equal(result.reason,null)
 assert.deepEqual(state,before,'ok action must not mutate the input state')
 return {state:next,result}
}
function expectBlocked(state,action,reason){
 const before=clone(state)
 const {state:next,result}=apply(state,action)
 assert.equal(result.ok,false,`action ${action && action.type} unexpectedly succeeded`)
 if(reason)assert.equal(result.reason,reason)
 assert.deepEqual(state,before,'blocked action must not mutate the input state')
 assert.deepEqual(next,before,'blocked action must return the unchanged state')
 return result
}
function beginCycle(state,poolId=POOL){return expectOk(state,{type:'begin-grab',poolId}).state}
function arrive(state,at,grab){return expectOk(state,{type:'arrive',at,grab}).state}
function surfaceY(state,poolId=POOL){
 const config=state.config,pool=state.pools[poolId]
 return config.bottomY+(config.initialMaterialY-config.bottomY)*pool.material/config.poolUnits
}
function cycleToHopper(state,poolId=POOL){
 const coords=state.pools[poolId]
 let next=beginCycle(state,poolId)
 next=arrive(next,'above-pool',{x:coords.x,z:coords.z,bottomY:.6})
 next=arrive(next,'surface',{x:coords.x,z:coords.z,bottomY:surfaceY(state,poolId)})
 next=expectOk(next,{type:'take'}).state
 next=arrive(next,'lifted',{x:coords.x,z:coords.z,bottomY:2.99})
 next=expectOk(next,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{x:coords.x,z:coords.z,bottomY:2.99}}).state
 next=arrive(next,'hopper',{x:coords.x,z:8.5,bottomY:2.99})
 return next
}

test('四列三排布局、随车转运斗配置与初始状态符合修订契约',()=>{
 assert.equal(workshopLayout.length,12)
 assert.ok(Object.isFrozen(workshopLayout))
 assert.ok(Object.isFrozen(workshopLayout[0]))
 assert.deepEqual(workshopLayout[0],{id:'c1-r1',column:1,row:1,x:-8,z:-6,width:3.2,length:3.2})
 assert.deepEqual(workshopLayout[11],{id:'c4-r3',column:4,row:3,x:8,z:6,width:3.2,length:3.2})
 assert.equal(new Set(workshopLayout.map(item=>item.id)).size,12)
 assert.equal(workshopConfig.rimY,.25)
 assert.equal(workshopConfig.bottomY,-1.2)
 assert.equal(workshopConfig.initialMaterialY,.1)
 assert.equal(workshopConfig.grabSafeBottomY,2.99)
 assert.equal(workshopConfig.minClearance,.3)
 assert.equal(workshopConfig.minTwoCarSeparationZ,2.38)
 assert.equal(workshopConfig.transferZ,8.5)
 assert.deepEqual({...workshopConfig.hopper},{capacity:4,receiveTopY:1.65,rimOffset:-.1})
 assert.equal(workshopConfig.poolUnits,8)
 assert.equal(workshopConfig.grabCapacity,1)
 const state=createWorkshopState()
 assert.equal(state.selectedPoolId,POOL)
 assert.equal(state.phase,'idle')
 assert.equal(state.paused,false)
 assert.equal(state.totals.initial,96)
 assert.deepEqual(state.grab,{load:0,x:0,z:-5.1,bottomY:2.99})
 assert.deepEqual(state.transfer,{z:8.5,hoistTopY:3.65})
 assert.deepEqual(state.hopper,{load:0})
 assert.equal(state.seq,0)
 assert.deepEqual(state.log,[])
 assert.equal(Object.keys(state.pools).length,12)
 assert.equal(state.pools[POOL].coverOpen,true)
 assert.equal(state.pools['c2-r1'].coverOpen,false)
 for(const pool of Object.values(state.pools)){assert.equal(pool.material,8);assert.equal(pool.width,pool.length);assert.equal(pool.length,3.2)}
 const summary=workshopSummary(state)
 assert.equal(summary.remaining,96);assert.equal(summary.grabLoad,0);assert.equal(summary.hopperLoad,0);assert.equal(summary.hopperCapacity,4);assert.equal(summary.initial,96);assert.equal(summary.conserved,true);assert.equal(summary.selectedPool,POOL);assert.ok(Math.abs(summary.materialY-.1)<1e-9)
 assert.deepEqual(checkWorkshopInvariants(state),{ok:true,errors:[]})
})

test('完整抓糟周期：提升、降转运斗、Z 到转运斗、release 结算一次并守恒',()=>{
 let state=createWorkshopState()
 state=beginCycle(state)
 assert.equal(state.phase,'approach')
 state=arrive(state,'above-pool',{...POOL_POS,bottomY:.6})
 state=arrive(state,'surface',{...POOL_POS,bottomY:.1})
 const taken=expectOk(state,{type:'take'})
 assert.equal(taken.result.settled,true)
 state=taken.state
 assert.equal(state.grab.load,1)
 assert.equal(state.pools[POOL].material,7)
 state=arrive(state,'lifted',{...POOL_POS,bottomY:2.99})
 assert.equal(state.phase,'transport')
 const prepared=expectOk(state,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{...POOL_POS,bottomY:2.99}})
 assert.equal(prepared.state.phase,'transport')
 assert.equal(prepared.state.transfer.hoistTopY,RECEIVE_TOP_Y)
 state=prepared.state
 state=arrive(state,'hopper',{x:POOL_POS.x,z:8.5,bottomY:2.99})
 assert.equal(state.phase,'discharge')
 const released=expectOk(state,{type:'release'})
 assert.equal(released.result.settled,true)
 state=released.state
 assert.equal(state.phase,'complete')
 assert.equal(state.grab.load,0)
 assert.equal(state.hopper.load,1)
 const summary=workshopSummary(state)
 assert.equal(summary.remaining,95)
 assert.equal(summary.grabLoad,0)
 assert.equal(summary.hopperLoad,1)
 assert.equal(summary.hopperCapacity,4)
 assert.equal(summary.conserved,true)
 assert.deepEqual(checkWorkshopInvariants(state),{ok:true,errors:[]})
})

test('阶段顺序错误被阻断，且状态与物料不变',()=>{
 let state=createWorkshopState()
 state=beginCycle(state)
 expectBlocked(state,{type:'take'},'invalid-phase')
 expectBlocked(state,{type:'release'},'invalid-phase')
 expectBlocked(state,{type:'prepare-transfer',topY:1.65,grab:{...POOL_POS,bottomY:2.99}},'invalid-phase')
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:POOL_POS.x,z:8.5,bottomY:2.99}},'invalid-phase')
 expectBlocked(state,{type:'arrive',at:'surface',grab:{...POOL_POS,bottomY:.1}},'invalid-phase')
 expectBlocked(state,{type:'begin-grab',poolId:POOL},'invalid-phase')
 expectBlocked(state,{type:'select-pool',poolId:'c2-r1'},'invalid-phase')
 state=arrive(state,'above-pool',{...POOL_POS,bottomY:.6})
 state=arrive(state,'surface',{...POOL_POS,bottomY:.1})
 const taken=expectOk(state,{type:'take'}).state
 expectBlocked(taken,{type:'take'},'invalid-phase')
 expectBlocked(taken,{type:'prepare-transfer',topY:1.65,grab:{...POOL_POS,bottomY:2.99}},'invalid-phase')
 const lifted=arrive(taken,'lifted',{...POOL_POS,bottomY:2.99})
 const hopperReady=expectOk(lifted,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{...POOL_POS,bottomY:2.99}}).state
 const atHopper=arrive(hopperReady,'hopper',{x:POOL_POS.x,z:8.5,bottomY:2.99})
 const completed=expectOk(atHopper,{type:'release'}).state
 expectBlocked(completed,{type:'release'},'invalid-phase')
})

test('转运准备与 hopper 端点的高度/Z 校验',()=>{
 let state=beginCycle(createWorkshopState())
 state=arrive(state,'above-pool',{...POOL_POS,bottomY:.6})
 state=arrive(state,'surface',{...POOL_POS,bottomY:.1})
 state=expectOk(state,{type:'take'}).state
 state=arrive(state,'lifted',{...POOL_POS,bottomY:2.99})
 // 未降转运提升就尝试 hopper
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:POOL_POS.x,z:8.5,bottomY:2.99}},'transfer-not-lowered')
 // 转运提升高度非法
 expectBlocked(state,{type:'prepare-transfer',topY:2.0,grab:{...POOL_POS,bottomY:2.99}},'height-out-of-range')
 expectBlocked(state,{type:'prepare-transfer',topY:.2,grab:{...POOL_POS,bottomY:2.99}},'height-out-of-range')
 expectBlocked(state,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{x:0,z:-6,bottomY:2.99}},'position-out-of-range')
 expectBlocked(state,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{...POOL_POS,bottomY:1.5}},'grab-not-raised')
 state=expectOk(state,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{...POOL_POS,bottomY:2.99}}).state
 // hopper 端点校验
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:0,z:8.5,bottomY:2.99}},'position-out-of-range')
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:POOL_POS.x,z:7,bottomY:2.99}},'position-out-of-range')
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:POOL_POS.x,z:8.5,bottomY:2.0}},'grab-not-raised')
 // 非 hopper 端点仍校验横向间距
 let near=createWorkshopState({transferZ:-6})
 near=beginCycle(near)
 expectBlocked(near,{type:'arrive',at:'above-pool',grab:{...POOL_POS,bottomY:.6}},'transfer-proximity')
 expectBlocked(state,{type:'arrive',at:'above-pool',grab:null},'invalid-grab')
 expectBlocked(state,{type:'arrive',at:'nowhere',grab:{...POOL_POS,bottomY:2.99}},'unknown-arrive')
})

test('盖板门控：未开盖拒绝抓糟，只能人工设置，拒绝自动移盖',()=>{
 let state=createWorkshopState()
 expectBlocked(state,{type:'begin-grab',poolId:'c2-r1'},'cover-closed')
 expectBlocked(state,{type:'set-cover',poolId:'c2-r1',open:true},'manual-required')
 expectBlocked(state,{type:'set-cover',poolId:'c9-r9',open:true,manual:true},'unknown-pool')
 state=expectOk(state,{type:'set-cover',poolId:'c2-r1',open:true,manual:true}).state
 assert.equal(state.pools['c2-r1'].coverOpen,true)
 const seq=state.seq
 state=expectOk(state,{type:'set-cover',poolId:'c2-r1',open:true,manual:true}).state
 assert.equal(state.seq,seq)
 state=expectOk(state,{type:'begin-grab',poolId:'c2-r1'}).state
 assert.equal(state.selectedPoolId,'c2-r1')
 expectBlocked(state,{type:'set-cover',poolId:'c2-r1',open:false,manual:true},'invalid-phase')
 state=expectOk({...state,phase:'idle',selectedPoolId:'c2-r1'},{type:'set-cover',poolId:'c2-r1',open:false,manual:true}).state
 expectBlocked(state,{type:'begin-grab',poolId:'c2-r1'},'cover-closed')
})

test('暂停冻结业务动作（含转运准备与 hopper），恢复后可继续',()=>{
 let state=createWorkshopState()
 const paused=expectOk(state,{type:'pause'}).state
 assert.equal(paused.paused,true)
 for(const action of [
  {type:'begin-grab',poolId:POOL},
  {type:'select-pool',poolId:'c2-r1'},
  {type:'set-cover',poolId:'c2-r1',open:true,manual:true},
  {type:'arrive',at:'above-pool',grab:{...POOL_POS,bottomY:.6}},
  {type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{...POOL_POS,bottomY:2.99}},
  {type:'take'},{type:'release'}
 ])expectBlocked(paused,action,'paused')
 assert.deepEqual(workshopSummary(paused),workshopSummary(state))
 assert.equal(apply(paused,{type:'pause'}).state.paused,true)
 const resumed=expectOk(paused,{type:'resume'}).state
 assert.equal(resumed.paused,false)
 assert.equal(apply(resumed,{type:'resume'}).state.paused,false)
 let next=beginCycle(resumed)
 next=arrive(next,'above-pool',{...POOL_POS,bottomY:.6})
 next=arrive(next,'surface',{...POOL_POS,bottomY:.1})
 expectOk(next,{type:'take'})
})

test('转运斗容量：满斗阻断、可在余量不足时部分结算但不标 complete',()=>{
 // 默认容量 4：四轮后满斗，第五轮开始被阻断
 let state=createWorkshopState()
 for(let round=0;round<4;round++){
  state=cycleToHopper(state,POOL)
  state=expectOk(state,{type:'release'}).state
 }
 assert.equal(state.hopper.load,4)
 assert.equal(state.pools[POOL].material,4)
 expectBlocked(state,{type:'begin-grab',poolId:POOL},'hopper-full')
 const before=clone(state)
 expectBlocked(state,{type:'arrive',at:'hopper',grab:{x:POOL_POS.x,z:8.5,bottomY:2.99}},'invalid-phase')
 assert.deepEqual(state,before)
 // 部分结算：构造余量 0.5 的 discharge 状态
 let pending=cycleToHopper(createWorkshopState())
 pending.hopper.load=3.5
 pending.totals.initial=99.5
 const partial=expectOk(pending,{type:'release'})
 assert.equal(partial.result.settled,true)
 assert.equal(partial.state.hopper.load,4)
 assert.ok(Math.abs(partial.state.grab.load-.5)<1e-9)
 assert.equal(partial.state.phase,'discharge')
 assert.notEqual(partial.state.phase,'complete')
})

test('无料池阻断；重置是唯一恢复初始量的动作',()=>{
 const single={layout:[{id:'p1',column:1,row:1,x:0,z:0,width:5,length:3.2}],poolUnits:1}
 let state=createWorkshopState(single)
 state=cycleToHopper(state,'p1')
 state=expectOk(state,{type:'release'}).state
 assert.equal(state.pools.p1.material,0)
 expectBlocked({...state,phase:'complete'},{type:'begin-grab',poolId:'p1'},'pool-empty')
 const reset=expectOk({...state,phase:'complete'},{type:'reset-material'})
 assert.equal(reset.state.pools.p1.material,1)
 assert.equal(reset.state.grab.load,0)
 assert.equal(reset.state.hopper.load,0)
 assert.equal(reset.state.phase,'idle')
 assert.equal(reset.state.seq,0)
 assert.deepEqual(reset.state.log,[])
})

test('多池循环保持守恒，日志最多 100 条，动作不依赖时间',()=>{
 let state=createWorkshopState({hopper:{capacity:96,receiveTopY:1.65,rimOffset:-.1}})
 const pools=workshopLayout.slice(0,8).map(item=>item.id)
 for(let round=0;round<2;round++){
  for(const poolId of pools){
   if(!state.pools[poolId].coverOpen)state=expectOk(state,{type:'set-cover',poolId,open:true,manual:true}).state
   const pool=state.pools[poolId]
   state=beginCycle(state,poolId)
   state=arrive(state,'above-pool',{x:pool.x,z:pool.z,bottomY:.6})
   state=arrive(state,'surface',{x:pool.x,z:pool.z,bottomY:.1})
   state=expectOk(state,{type:'take'}).state
   state=arrive(state,'lifted',{x:pool.x,z:pool.z,bottomY:2.99})
   state=expectOk(state,{type:'prepare-transfer',topY:RECEIVE_TOP_Y,grab:{x:pool.x,z:pool.z,bottomY:2.99}}).state
   state=arrive(state,'hopper',{x:pool.x,z:8.5,bottomY:2.99})
   state=expectOk(state,{type:'release'}).state
   assert.deepEqual(checkWorkshopInvariants(state),{ok:true,errors:[]})
  }
 }
 const summary=workshopSummary(state)
 assert.equal(summary.conserved,true)
 assert.equal(summary.remaining+summary.grabLoad+summary.hopperLoad,96)
 assert.equal(summary.hopperLoad,16)
 assert.equal(state.log.length,100)
 assert.ok(state.log.every(entry=>Number.isInteger(entry.seq)&&entry.seq>0))
})

test('支持 rows/layout/hopper 配置覆盖，默认第一口已开盖',()=>{
 const rows=createWorkshopState({rows:1})
 assert.equal(Object.keys(rows.pools).length,4)
 assert.equal(rows.totals.initial,32)
 assert.deepEqual(Object.values(rows.pools).map(pool=>pool.z).sort((a,b)=>a-b),[-6,-2,2,6])
 for(const pool of Object.values(rows.pools))assert.equal(pool.x,0)
 assert.equal(rows.pools['c1-r1'].coverOpen,true)
 assert.equal(rows.pools['c2-r1'].coverOpen,false)
 assert.equal(workshopSummary(rows).conserved,true)
 const custom=createWorkshopState({layout:[{id:'x1',column:1,row:1,x:1,z:2,width:2,length:1}],hopper:{capacity:2,receiveTopY:1.5,rimOffset:-.6}})
 assert.equal(Object.keys(custom.pools).length,1)
 assert.equal(custom.totals.initial,8)
 assert.equal(custom.pools.x1.coverOpen,true)
 assert.equal(custom.selectedPoolId,'x1')
 assert.equal(custom.config.hopper.capacity,2)
 assert.equal(custom.config.hopper.receiveTopY,1.5)
})

test('幂等/纯函数/未知动作校验',()=>{
 const state=createWorkshopState()
 expectBlocked(state,null,'invalid-action')
 expectBlocked(state,{type:'unknown'},'invalid-action')
 expectBlocked(state,{type:'select-pool',poolId:'missing'},'unknown-pool')
 expectBlocked(state,{type:'begin-grab',poolId:'missing'},'unknown-pool')
 expectBlocked(state,{type:'set-cover',poolId:'missing',open:true,manual:true},'unknown-pool')
 const before=clone(state)
 const {state:next,result}=apply(state,{type:'select-pool',poolId:POOL})
 assert.equal(result.ok,true)
 assert.deepEqual(state,before)
 assert.equal(next.selectedPoolId,POOL)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadFeature, preferredWorkPath, staffPositionLabel } from '../src/utils/feature-access.mjs'
import { createWritePermissionDirective } from '../src/utils/write-permission.mjs'

test('原粮员工仅显示备件查询和库位，工段长与其他车间班长使用同一岗位标识', () => {
  for (const staffPosition of ['employee','group_leader',null]) {
    const user={role:'viewer',staffWorkshopCode:'raw_grain',staffPosition}
    for (const path of ['/inventory','/warehouse-3d','/portal']) assert.equal(canReadFeature(user,path),true)
    for (const path of ['/raw-duties','/attendance','/work','/check','/knowledge','/robot-program','/statistics','/replenishment','/movements']) assert.equal(canReadFeature(user,path),false,path)
    assert.equal(staffPositionLabel(user),'员工')
  }
  assert.equal(staffPositionLabel({staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'}),'工段长')
  assert.equal(staffPositionLabel({staffWorkshopCode:'qu_making',staffPosition:'shift_leader'}),'班长')
})

test('visible work entrances do not grant unassigned or other-workshop staff data access', () => {
  for (const role of ['admin','raw_grain','qu_making','brewing']) {
    assert.equal(canReadFeature({role}, '/work'), false)
  }
  for (const staffPosition of ['group_leader','shift_leader']) {
    assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'qu_making',staffPosition}, '/work'), false)
    assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'raw_grain',staffPosition}, '/work'), false)
  }
  assert.equal(canReadFeature({role:'viewer'}, '/work'), false)
  assert.equal(canReadFeature(null, '/inventory'), false)
  for(const role of ['admin','viewer','raw_grain','qu_making','brewing'])assert.equal(canReadFeature({role},'/robot-program'),true)
  assert.equal(canReadFeature(null,'/robot-program'),false)
  for (const role of ['admin','raw_grain']) assert.equal(canReadFeature({role}, '/raw-duties'), true)
  assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'}, '/raw-duties'), true)
  for (const role of ['qu_making','brewing','viewer']) assert.equal(canReadFeature({role}, '/raw-duties'), false)
  assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'qu_making'}, '/raw-duties'), false)
  assert.equal(preferredWorkPath({role:'raw_grain'}), '/raw-duties')
  assert.equal(preferredWorkPath({role:'viewer',staffWorkshopCode:'raw_grain'}), '/raw-duties')
  assert.equal(canReadFeature({role:'qu_making'}, preferredWorkPath({role:'qu_making'})), false)
  for(const staffPosition of ['shift_leader'])assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'raw_grain',staffPosition},'/attendance'),true)
  for(const user of [{role:'viewer',staffWorkshopCode:'raw_grain'},{role:'viewer',staffWorkshopCode:'qu_making',staffPosition:'shift_leader'},{role:'brewing'}])assert.equal(canReadFeature(user,'/attendance'),false)
})

test('an editor cannot trigger another workshop control and updated scopes are enforced', () => {
  const target = new EventTarget(); target.setAttribute = () => {}
  let effects=0, notices=0
  const guard=createWritePermissionDirective(()=>false,()=>notices++)
  guard.mounted(target,{value:false})
  target.addEventListener('click',()=>effects++)
  target.dispatchEvent(new Event('click',{cancelable:true}))
  assert.equal(effects,0); assert.equal(notices,1)
  guard.updated(target,{value:true})
  target.dispatchEvent(new Event('click',{cancelable:true}))
  assert.equal(effects,1)
  guard.updated(target,{value:false})
  const key=new Event('keydown',{cancelable:true}); key.key='Enter'
  target.dispatchEvent(key); assert.equal(key.defaultPrevented,true)
  guard.unmounted(target)
})

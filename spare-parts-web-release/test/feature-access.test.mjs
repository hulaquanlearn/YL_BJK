import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadFeature } from '../src/utils/feature-access.mjs'
import { createWritePermissionDirective } from '../src/utils/write-permission.mjs'

test('visible work entrances do not grant unassigned or other-workshop staff data access', () => {
  for (const role of ['admin','raw_grain','qu_making','brewing']) {
    assert.equal(canReadFeature({role}, '/work'), true)
    assert.equal(canReadFeature({role}, '/inspection-notices'), true)
  }
  for (const staffPosition of ['group_leader','shift_leader']) {
    assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'qu_making',staffPosition}, '/work'), true)
    assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'raw_grain',staffPosition}, '/work'), false)
  }
  assert.equal(canReadFeature({role:'viewer'}, '/work'), false)
  assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'qu_making'}, '/inspection-notices'), false)
  assert.equal(canReadFeature({role:'viewer',staffWorkshopCode:'raw_grain'}, '/inspection-notices'), true)
  assert.equal(canReadFeature(null, '/inventory'), false)
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

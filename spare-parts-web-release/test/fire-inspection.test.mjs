import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadFeature, preferredWorkPath } from '../src/utils/feature-access.mjs'
import { mobileModules, isMobileNavigationAllowed } from '../src/utils/mobile-workspace.mjs'
import { fireImportDefaults, fireSelectedImportWarnings, firePage, firePointState, resolveFireScan } from '../src/utils/fire-inspection.mjs'

test('fire assignments open only the fire function and their work centre, independently of workshop duties', () => {
  const employee={role:'viewer',id:14,staffWorkshopCode:'raw_grain',staffPosition:'employee'}
  assert.equal(canReadFeature(employee,'/fire-inspection'),true)
  const assigned={...employee,fireAccess:{canRead:true,canManage:false,areaIds:[9]}}
  assert.equal(canReadFeature(assigned,'/fire-inspection'),true)
  for(const path of ['/raw-duties','/attendance','/check'])assert.equal(canReadFeature(assigned,path),false,path)
  assert.equal(preferredWorkPath(assigned),'/fire-inspection')
  const work=mobileModules(assigned).find(group=>group.id==='work')
  assert.equal(work.path,'/fire-inspection')
  assert.deepEqual(work.links.filter(link=>!link.disabled).map(link=>link.path),['/fire-inspection'])
  assert.equal(work.links.find(link=>link.path==='/control-passwords')?.disabled,true)
  assert.equal(isMobileNavigationAllowed(assigned,'/control-passwords'),false)
  assert.equal(isMobileNavigationAllowed(assigned,'/fire-inspection?point=43'),true)
  assert.equal(isMobileNavigationAllowed(employee,'/fire-inspection'),true)
  assert.equal(canReadFeature({role:'admin'},'/fire-inspection'),true)
  assert.equal(canReadFeature({role:'brewing'},'/fire-inspection'),false)
  assert.equal(canReadFeature({...employee,fireAccess:{canRead:false,areaIds:[9]}},'/fire-inspection'),true)
})

test('checked status belongs to the selected cycle and never erases the independent abnormal flag', () => {
  const previous={status:'checked',hasIssue:true,lastCheckedAt:'2026-10-26T01:00:00Z'}
  assert.equal(firePointState(previous,3).tone,'checked')
  assert.equal(previous.hasIssue,true)
  assert.equal(firePointState(previous,null).tone,'neutral')
  assert.equal(firePointState({status:'pending',lastCheckedAt:previous.lastCheckedAt},4).tone,'pending')
})

const assets=[{id:1,type:'extinguisher',quantity:2,status:'active'},{id:2,type:'hydrant',quantity:1,status:'active'}]






test('scan links stay in this application and carry no authorization or submit action', () => {
  const origin='https://czsdsg.cn'
  assert.deepEqual(resolveFireScan(origin+'/fire-inspection?point=43',origin),{pointId:'43'})
  assert.deepEqual(resolveFireScan('FIRE:XF-001',origin),{code:'XF-001'})
  assert.deepEqual(resolveFireScan('XF-001',origin),{code:'XF-001'})
  for(const value of ['https://evil.test/fire-inspection?point=43',origin+'/inventory?point=43',origin+'/fire-inspection?point=1&point=2','javascript:alert(1)',origin+'/fire-inspection?point=../43'])assert.throws(()=>resolveFireScan(value,origin),undefined,value)
})

test('import selection excludes ambiguous duplicate rows without discarding unconfigured equipment', () => {
  const preview={rows:[{sheet:'灭火器',row:2,sourceKey:'a'},{sheet:'灭火器',row:3,sourceKey:'b'},{sheet:'消防栓',row:4,sourceKey:'c',quantity:0,status:'unconfigured'}],warnings:[{sheet:'灭火器',row:2,code:'duplicate_code'},{sheet:'灭火器',row:3,code:'duplicate_code'},{sheet:'消防栓',row:4,code:'unconfigured'}]}
  assert.deepEqual(fireImportDefaults(preview),['c'])
  assert.equal(preview.rows.length,3,'selection does not delete source records')
})

test('import defaults exclude existing-code warnings and already imported rows while retaining new source rows',()=>{
  const preview={rows:[{sheet:'灭火器',row:2,sourceKey:'existing'},{sheet:'灭火器',row:3,sourceKey:'prior',alreadyImported:true},{sheet:'消防栓',row:4,sourceKey:'new'}],warnings:[{sheet:'灭火器',row:2,code:'existing_code'}]}
  assert.deepEqual(fireImportDefaults(preview),['new'])
  assert.equal(preview.rows.length,3)
})

test('large ledgers render bounded pages and do not restrict the underlying lookup data', () => {
  const points=Array.from({length:1003},(_,id)=>({id}))
  assert.equal(firePage(points,1).length,24)
  assert.equal(firePage(points,2)[0].id,24)
  assert.equal(firePage(points,999).at(-1).id,1002)
  assert.equal(points.length,1003)
  assert.deepEqual(firePage([],1),[])
})

test('unselected warning rows do not prevent safe rows from importing, while selected sheet header warnings still require review',()=>{const p={rows:[{sourceKey:'a',sheet:'灭火器',row:2},{sourceKey:'b',sheet:'灭火器',row:3}],warnings:[{sheet:'灭火器',row:3,code:'duplicate_code'},{sheet:'灭火器',row:1,code:'location_header'}]};assert.equal(fireSelectedImportWarnings(p,['a']).length,1);assert.equal(fireSelectedImportWarnings(p,['b']).length,2);assert.equal(fireSelectedImportWarnings(p,[]).length,0)})

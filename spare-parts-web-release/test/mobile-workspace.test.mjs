import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileModules, mobileAccountLinks, mobileSnapshot, isMobileNavigationAllowed, navigateMobile } from '../src/utils/mobile-workspace.mjs'

test('work description follows authorized entries instead of advertising unavailable assessment', () => {
 const employee = {role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'employee'}
 const work = mobileModules(employee,{nativeAndroid:true}).find(group=>group.id==='work')
 assert.equal(work.description,'消防点检')
 assert.equal(work.path,'/fire-inspection')
 const leaderWork=mobileModules({...employee,staffPosition:'shift_leader'},{nativeAndroid:true}).find(group=>group.id==='work')
 assert.ok(leaderWork.description.includes('工段长履职考评'))
})

test('mobile catalogue retains all current business domains and excludes retired features',()=>{
  const modules=mobileModules({role:'admin'})
  assert.deepEqual(modules.map(group=>group.id),['spare','engineering','work'])
  assert.deepEqual(modules.flatMap(group=>group.links.map(link=>link.path)),[
    '/inventory','/movements','/replenishment','/warehouse-3d','/check','/statistics','/model-library','/equipment','/data-quality','/robot-program','/knowledge','/raw-duties','/fire-inspection','/agv-vehicles','/control-passwords'
  ])
  assert.equal(new Set(modules.flatMap(group=>group.links.map(link=>link.path))).size,15)
  assert.equal(mobileModules(null).length,0)
  modules[0].links[0].label='changed'
  assert.equal(mobileModules({role:'admin'})[0].links[0].label,'库存总览')
})

test('raw-grain employee mobile entry points obey existing read restrictions',()=>{
  const employee={role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'employee'}
  assert.deepEqual(mobileModules(employee).map(group=>group.id),['spare','work'])
  assert.deepEqual(mobileModules(employee)[0].links.map(link=>link.path),['/inventory','/warehouse-3d'])
  assert.equal(mobileAccountLinks(employee).length,1)
  assert.equal(isMobileNavigationAllowed(employee,'/account?tab=storage'),false)
  assert.equal(isMobileNavigationAllowed(employee,'/robot-program'),false)
  const leader={...employee,staffPosition:'shift_leader'}
  assert.ok(mobileModules(leader).some(group=>group.links.some(link=>link.path==='/raw-duties')))
  assert.equal(mobileModules({role:'brewing'}).some(group=>group.links.some(link=>link.path==='/agv-repairs')),false)
})
test('native App keeps field operations and blocks web administration even from old saved links',()=>{
 const user={role:'admin'},options={nativeAndroid:true},paths=mobileModules(user,options).flatMap(g=>g.links.map(l=>l.path))
 for(const p of ['/inventory','/warehouse-3d','/check','/knowledge','/fire-inspection','/agv-vehicles'])assert.ok(paths.includes(p),p)
 for(const p of ['/statistics','/model-library','/equipment','/data-quality','/robot-program','/account?tab=users','/account?tab=storage'])assert.equal(isMobileNavigationAllowed(user,p,options),false,p)
 assert.equal(isMobileNavigationAllowed(user,'/account?tab=profile',options),true)
 assert.equal(isMobileNavigationAllowed({role:'viewer',staffWorkshopCode:'raw_grain'},'/agv-repairs',options),false)
 assert.equal(isMobileNavigationAllowed(user,'/model-library'),true,'web administration remains available')
})

test('native snapshot exposes only display identity and permitted functionality',()=>{
  const snapshot=mobileSnapshot({_id:19,username:'test',displayName:'张工',role:'admin',token:'secret',password:'not-for-native',privateField:'hidden'},'/inventory')
  assert.equal(snapshot.accountId,'19')
  assert.equal(snapshot.name,'张工')
  assert.equal(snapshot.initial,'张')
  assert.deepEqual(Object.keys(snapshot),['version','page','accountId','name','initial','role','modules'])
  assert.doesNotMatch(JSON.stringify(snapshot),/secret|not-for-native|privateField/)
  assert.equal(mobileSnapshot(null,'/login').modules.length,0)
})

test('native navigation rejects outside origins, retired routes, and unauthorized account tabs',()=>{
  const admin={role:'admin'},viewer={role:'viewer'}
  for(const path of ['https://evil.test/inventory','//evil.test/inventory','/\\evil.test','/agv-repairs','/work','/plc','/users','/inventory#hidden','/account?tab=users&tab=profile','/account?redirect=/users','/account?tab=unknown']) {
    assert.equal(isMobileNavigationAllowed(admin,path),false,path)
  }
  assert.equal(isMobileNavigationAllowed(null,'/inventory'),false)
  assert.equal(isMobileNavigationAllowed(admin,'/account?tab=storage'),true)
  assert.equal(isMobileNavigationAllowed(viewer,'/account?tab=storage'),false)
  assert.equal(isMobileNavigationAllowed(viewer,'/account'),true)
  assert.equal(isMobileNavigationAllowed(admin,'/inventory?scope=1&searchKeyword=%E8%BD%B4%E6%89%BF'),true)
})

test('native navigation honors router rejection and unsaved-form cancellation',async()=>{
  let called=0
  const router={currentRoute:{value:{fullPath:'/inventory'}},async push(path){called++;return {type:4}}}
  assert.equal(await navigateMobile(router,{role:'admin'},'/portal'),false)
  assert.equal(router.currentRoute.value.fullPath,'/inventory')
  assert.equal(await navigateMobile(router,{role:'admin'},'/inventory'),true)
  assert.equal(called,1)
  assert.equal(await navigateMobile(router,{role:'viewer',staffWorkshopCode:'raw_grain'},'/check'),false)
  assert.equal(called,1)
  router.push=async path=>{router.currentRoute.value.fullPath=path}
  assert.equal(await navigateMobile(router,{role:'admin'},'/portal'),true)
  router.push=async()=>{throw new Error('network')}
  assert.equal(await navigateMobile(router,{role:'admin'},'/knowledge'),false)
})

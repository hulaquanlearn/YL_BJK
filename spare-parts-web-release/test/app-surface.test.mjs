import test from 'node:test'
import assert from 'node:assert/strict'
import {isAppSurface,appPathAllowed} from '../src/app/surface.mjs'
import {mobileWorkspaceEnabled} from '../src/utils/mobile-workspace.mjs'

test('installed phone web apps keep App presentation in landscape without changing ordinary wide desktop windows',()=>{
 for(const userAgent of ['Mozilla iPhone Mobile','Mozilla Android Mobile']){
  const windowObject={navigator:{standalone:true},matchMedia:()=>({matches:false})}
  assert.equal(isAppSurface({userAgent,windowObject}),true)
  assert.equal(mobileWorkspaceEnabled({userAgent,narrow:false,standalone:true}),true)
  assert.equal(isAppSurface({userAgent,windowObject:{matchMedia:q=>({matches:q.includes('display-mode')})}}),true)
 }
 const userAgent='Mozilla Windows Chrome'
 assert.equal(isAppSurface({userAgent,windowObject:{navigator:{standalone:true},matchMedia:()=>({matches:false})}}),false)
 assert.equal(mobileWorkspaceEnabled({userAgent,standalone:true}),false)
})

test('native iOS keeps the App shell and business presentation together in landscape',()=>{
 const userAgent='Mozilla/5.0 iPhone Mobile DigitalWorkbenchIOS/1.9.10'
 assert.equal(isAppSurface({userAgent,windowObject:{matchMedia:()=>({matches:false})}}),true)
 assert.equal(mobileWorkspaceEnabled({userAgent,narrow:false,coarse:false}),true)
 assert.equal(mobileWorkspaceEnabled({userAgent,narrow:false,embedded:true}),false)
})

test('App presentation stays independent of desktop window size and mini-program embedding',()=>{
 const windowObject={matchMedia:q=>({matches:q.includes('max-width')})}
 assert.equal(isAppSurface({userAgent:'Mozilla Windows Chrome',windowObject}),false)
 assert.equal(isAppSurface({userAgent:'Mozilla iPhone Mobile',windowObject}),true)
 assert.equal(isAppSurface({userAgent:'DigitalWorkbenchAndroid/1.9.10-android.20',windowObject}),true)
 assert.equal(isAppSurface({userAgent:'Mozilla Android Mobile',windowObject:{...windowObject,__wxjs_environment:'miniprogram'}}),false)
 assert.equal(isAppSurface({userAgent:'Mozilla iPhone Mobile',windowObject:{matchMedia:()=>({matches:false})}}),false)
})
test('App routes keep field workflows separate from web management and configuration',()=>{
 for(const path of ['/portal','/inventory?searchKeyword=轴承','/fire-inspection?point=3&asset=7','/robot-program','/knowledge','/agv-vehicles','/account?tab=profile'])assert.equal(appPathAllowed(path),true,path)
 for(const path of ['/account?tab=users','/account?tab=storage','/account?tab=usage','/account?tab=profile&tab=usage','/statistics','/model-library','/equipment','/data-quality'])assert.equal(appPathAllowed(path),false,path)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
const body=source.slice(source.indexOf('function stageFramingScale('),source.indexOf('\nfunction overviewCameraPosition('))
test('warehouse framing keeps every room corner within wide and mobile viewports',()=>{
 for(const [width,depth] of [[24,36],[50,12],[12,50]]) for(const aspect of [0.5,1,1.8,3]){
  const fit=new Function('THREE','roomWidth','roomDepth','camera',`${body}; return stageFramingScale;`)(THREE,{value:width},{value:depth},{fov:42})
  const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000)
  camera.position.copy(new THREE.Vector3(-.75,.65,-1.09).normalize().multiplyScalar(fit(aspect)))
  camera.lookAt(0,0,0);camera.updateMatrixWorld()
  for(const x of [-width/2,width/2]) for(const y of [-1.2,4.8]) for(const z of [-depth/2,depth/2]){
   const p=new THREE.Vector3(x,y,z).project(camera)
   assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1,`clipped corner ${width}/${depth}/${aspect}`)
  }
 }
})
function miniPage(file,api,wx={}){
 let page
 vm.runInNewContext(fs.readFileSync(new URL(`../../miniprogram/pages/${file}`,import.meta.url),'utf8'),{
  Page:p=>page=p,require:p=>p.includes('api')?api:{},wx,console:{error(){}},getApp:()=>({globalData:{}})
 })
 page.data=structuredClone(page.data)
 page.setData=function(values,done){Object.assign(this.data,values);done?.()}
 return page
}
test('mini inventory retries failed initial and next pages without losing existing rows',async()=>{
 let fail=true;const calls=[]
 const page=miniPage('index/index.js',{getParts:async params=>{calls.push(params.page);if(fail)throw Error('offline');return{success:true,data:[{_id:params.page,totalStock:3}],total:3}}},{showToast(){}})
 await page.loadParts({page:1});assert.equal(page.data.loadError,true);assert.equal(page.data.filteredParts.length,0)
 fail=false;await page.retryParts();assert.equal(page.data.loadError,false);assert.equal(page.data.filteredParts.length,1)
 fail=true;await page.loadParts({page:2,append:true});assert.equal(page.data.filteredParts.length,1);assert.equal(page.data.currentPage,1)
 page.loadMore();assert.equal(calls.length,3)
 fail=false;await page.retryParts();assert.equal(page.data.currentPage,2);assert.equal(page.data.filteredParts.length,2);assert.deepEqual(calls,[1,1,2,2])
})
test('mini low stock shortcut opens the actionable inventory list',()=>{
 let destination
 const page=miniPage('home/home.js',{}, {navigateTo:args=>destination=args.url})
 page.gotoLowStock();assert.equal(destination,'/pages/index/index?lowStock=1')
})
test('mini count filter validates required choices then navigates once without a second confirmation',()=>{
 const urls=[];const toasts=[]
 const page=miniPage('filter/filter.js',{}, {navigateTo:args=>urls.push(args.url),showToast:args=>toasts.push(args.title)})
 page.data.selectedWorkshop='全部';page.confirmFilter();assert.equal(urls.length,0)
 page.data.selectedWorkshop='五粮货区';page.data.selectedShelfNo='全部';page.confirmFilter();assert.equal(urls.length,0)
 page.data.selectedShelfNo='1号';page.data.selectedLayer='2层';page.confirmFilter();assert.equal(urls.length,1)
 assert.equal(new URL(urls[0],'https://local.test').searchParams.get('workshop'),'五粮货区')
 assert.equal(new URL(urls[0],'https://local.test').searchParams.get('shelf'),'1号')
 assert.equal(toasts.length,2)
})

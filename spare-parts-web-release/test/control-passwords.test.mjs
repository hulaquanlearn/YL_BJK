import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadFeature } from '../src/utils/feature-access.mjs'
import { mobileModules, isMobileNavigationAllowed } from '../src/utils/mobile-workspace.mjs'
import { controlComputers, controlDesks, controlRoomLayout, createControlRoom, layoutControlLabels } from '../src/utils/control-room.mjs'
test('nine photo numbers occupy four distinct rows, with 123 and 4 separated',()=>{
  assert.deepEqual(controlComputers.map(row=>row.id),[1,2,3,4,5,6,7,8,9])
  const rows=Map.groupBy(controlComputers,row=>row.z)
  assert.deepEqual([...rows.values()].map(group=>group.map(row=>row.id)),[[1,2,3],[4],[5],[6,7,8,9]])
  for(let i=1;i<controlComputers.length;i++)assert.ok(controlComputers[i-1].z>=controlComputers[i].z)
  assert.ok(controlDesks.slice(0,3).every(desk=>desk.x===controlDesks[0].x&&desk.width===controlDesks[0].width&&desk.depth===controlDesks[0].depth))
  const gap=(front,rear)=>front.z-front.depth/2-(rear.z+rear.depth/2)
  assert.ok(gap(controlDesks[2],controlDesks[3])>gap(controlDesks[1],controlDesks[2]))
  assert.ok(gap(controlDesks[0],controlDesks[1])>.05&&gap(controlDesks[0],controlDesks[1])<.2,'first two desks retain a narrow seam')
  assert.equal(controlDesks[3].z,controlRoomLayout.airConditioners[1])
  assert.ok(controlDesks[2].z>controlRoomLayout.airConditioners[0]&&controlDesks[2].z-controlRoomLayout.airConditioners[0]<1)
  assert.ok(controlDesks[3].z-controlRoomLayout.screenZ>5)
  const room=createControlRoom();assert.equal(room.computers.size,9)
  for(const id of [1,2,3,4,5,6,7,8,9])assert.ok(room.targets.some(mesh=>mesh.userData.computerId===id))
  assert.ok(room.targets.every(mesh=>room.computers.has(mesh.userData.computerId)))
  room.root.traverse(mesh=>{if(mesh.geometry){assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));mesh.geometry.dispose()}mesh.material?.dispose()})
})
test('everyone sees the module but only system and qu-making users may navigate',()=>{
  const accounts=[{role:'admin'},{role:'qu_making'},{role:'viewer',staffWorkshopCode:'qu_making'},{role:'raw_grain'},{role:'brewing'},{role:'viewer'},{role:'viewer',staffWorkshopCode:'raw_grain'}]
  for(const user of accounts)for(const options of [{},{nativeAndroid:true}]){
    const allowed=['admin','qu_making'].includes(user.role)||user.staffWorkshopCode==='qu_making'
    const link=mobileModules(user,options).flatMap(group=>group.links).find(link=>link.path==='/control-passwords')
    assert.ok(link);assert.equal(link.disabled,!allowed)
    assert.equal(canReadFeature(user,'/control-passwords'),allowed)
    assert.equal(isMobileNavigationAllowed(user,'/control-passwords',options),allowed)
  }
  assert.equal(canReadFeature(null,'/control-passwords'),false)
})
test('phone labels remain separate while retaining their actual computer anchors',()=>{
  const input=Object.fromEntries(Array.from({length:9},(_,index)=>[index+1,{x:120+index%4*15,y:190+Math.floor(index/4)*18,visible:true}]))
  const labels=layoutControlLabels(input,{width:335,height:440,size:32,gap:4})
  for(const [id,label]of Object.entries(labels)){
    assert.equal(label.anchorX,input[id].x);assert.equal(label.anchorY,input[id].y)
    assert.ok(label.x>=19&&label.x<=316&&label.y>=19&&label.y<=421)
    for(const [otherId,other]of Object.entries(labels))if(id!==otherId)assert.ok(Math.abs(label.x-other.x)>=36||Math.abs(label.y-other.y)>=36)
  }
})

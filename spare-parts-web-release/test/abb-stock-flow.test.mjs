import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {MeshStandardMaterial,Box3,Group,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createHopperStock,createBucketStock} from '../src/utils/abb-bulk-stock.mjs'
import {createFeedStation} from '../src/utils/abb-feed-station.mjs'
import {createMaterialSimulation} from '../src/utils/abb-material-simulation.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'

test('hopper stock fills the real upper opening and tapered lower cavity and falls by fill fraction',()=>{
 const feeder=createFeedStation(),material=new MeshStandardMaterial(),stock=createHopperStock(material);feeder.add(stock.mesh)
 stock.update(feeder.userData,1);const full=new Box3().setFromObject(stock.mesh),info=stock.inspect()
 assert.ok(full.max.x-full.min.x>1.2,'full upper cavity is wider than the old .74m cube');assert.ok(full.max.y-full.min.y>1.5)
 const vertices=stock.mesh.geometry.attributes.position;assert.ok([...Array(vertices.count)].some((_,i)=>Math.abs(vertices.getX(i))<.22&&vertices.getY(i)<feeder.userData.shrinkingHopper.bottomY))
 stock.update(feeder.userData,.2);assert.ok(stock.inspect().height<info.height);assert.ok(stock.inspect().width<info.width)
 stock.update(feeder.userData,0);assert.equal(stock.mesh.visible,false);stock.dispose();material.dispose();feeder.userData.dispose()
})
test('both real CAD tools receive a material wedge aligned to their belt instead of the fixed cube',async()=>{
 for(const type of ['tool-640','tool-700']){
  const bytes=await fs.readFile(new URL('../public/models/abb-irb6700/'+type+'.glb',import.meta.url)),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
  const owner=new Group();owner.add(scene);const material=new MeshStandardMaterial(),stock=createBucketStock(material);owner.add(stock.mesh);stock.configure(owner);stock.update(1)
  const full=new Box3().setFromObject(stock.mesh),data=stock.inspect();assert.ok(data.width>.59&&data.width<.63);assert.ok(full.max.x-full.min.x>.25);assert.ok(full.max.y-full.min.y>.1,'inclined floor and fill depth follow the CAD');assert.notEqual(stock.mesh.geometry.type,'BoxGeometry')
  assert.ok(data.up[1]<0,'the carrying side faces toward the flange, not the outside belt run');assert.ok(full.min.z>-.313&&full.max.z<.313,'stock is centred inside the actual belt, not on the source roller offset');const points=stock.mesh.geometry.attributes.position;for(let i=0;i<points.count;i++){const p=new Vector3().fromBufferAttribute(points,i).sub(new Vector3(...data.start));assert.ok(p.dot(new Vector3(...data.up))>.067,'stock must be above the inside belt surface')}
  stock.update(.1);const low=new Box3().setFromObject(stock.mesh);assert.ok(low.getSize(new Vector3()).length()<full.getSize(new Vector3()).length());stock.update(0);assert.equal(stock.mesh.visible,false);stock.dispose();material.dispose();scene.traverse(n=>{n.geometry?.dispose();n.material?.dispose()})
 }
})
test('visual receiving continuously drains one container into the other, closes, then replenishes without changing paused masses',()=>{
 const model=createMaterialSimulation(brewingWorkcell.pots),feeder=createFeedStation();model.attachEquipment({feeder,tool:null})
 const cell={profile:'brewing-cell@1',barrel:'left',height:0,targetHeight:800,capacityLitres:90,hopperVolume:.135,hopperCapacityLitres:135,hopperLowFraction:.4,hopperHighFraction:.95,chainRateLitresPerSecond:90,bucketVolume:0,pendingBucketVolume:.09,receivedBucketVolume:0,receiveRateLitresPerSecond:180,gateReadyAt:.4,transferStartAt:.4,transferAt:.9,lastUpdateTime:0,receiving:true,receivePhase:'opening',loaded:false,gateOpen:1,chainActive:0,signals:{}}
 model.setCell(cell);const update=(dt,gate=1,running=true)=>model.update(dt,{running,gateAmount:gate,atReceiving:true,feederPoint:new Vector3(0,2,0)})
 update(.65);let s=model.materialState();assert.ok(Math.abs(s.visualHopperVolume-.09)<1e-9);assert.ok(Math.abs(s.bucketFill-.5)<1e-9);assert.equal(s.chainActive,false);assert.equal(s.feeding,true)
 const paused=[s.visualHopperVolume,s.visualBucketVolume];update(10,1,false);s=model.materialState();assert.deepEqual([s.visualHopperVolume,s.visualBucketVolume],paused)
 update(.25);assert.equal(model.feedGateTarget,0);assert.equal(model.materialState().bucketFill,1)
 update(.5,0);s=model.materialState();assert.ok(s.visualHopperVolume>.045);assert.equal(s.chainActive,true);assert.ok(Math.abs(s.visualHopperVolume+s.visualBucketVolume-(.135+s.projectedIncomingVolume))<1e-9)
 model.dispose();feeder.userData.dispose()
})

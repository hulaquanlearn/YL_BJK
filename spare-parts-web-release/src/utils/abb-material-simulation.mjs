import {bucketHasMaterial,toolDrive} from './abb-tool-drive.mjs'
import {createHopperStock,createBucketStock} from './abb-bulk-stock.mjs'
import {createMaterialSurface} from './abb-material-surface.mjs'
import {Group,Mesh,MeshStandardMaterial,CylinderGeometry,IcosahedronGeometry,InstancedMesh,Matrix4,Vector3,Quaternion,DataTexture,RGBAFormat,RepeatWrapping,SRGBColorSpace,Color} from 'three'
// Visual bulk model driven by program state. Recipe density/flow are uncalibrated.
export function createMaterialSimulation(stations){
 const root=new Group();root.name='simulated-jiupei';const palette=['#4a2f1e','#5b3a25','#321f14','#6e4a30'],pixels=new Uint8Array(128*128*4);for(let i=0;i<128*128;i++){let hash=Math.imul(i+17,0x45d9f3b);hash=Math.imul(hash^(hash>>>16),0x45d9f3b);const colour=new Color(palette[(hash>>>24)%4]).convertLinearToSRGB();pixels.set([colour.r*255,colour.g*255,colour.b*255,255],i*4)}const texture=new DataTexture(pixels,128,128,RGBAFormat);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(6,6);texture.needsUpdate=true;const material=new MeshStandardMaterial({color:'#fff',map:texture,bumpMap:texture,bumpScale:.003,roughness:1,metalness:0}),surfaces=new Map(),matrix=new Matrix4(),identity=new Quaternion(),one=new Vector3(1,1,1)
 for(const station of stations){const group=new Group();group.position.fromArray(station.position);group.quaternion.fromArray(station.quaternion);const body=new Mesh(new CylinderGeometry(1,1,1,64,1,false),material);body.name=station.id+'-material';body.receiveShadow=true;group.add(body);const surface=createMaterialSurface(station.dimensions,material);surface.mesh.name=station.id+'-deposit-surface';group.add(surface.mesh);root.add(group);group.visible=false;surfaces.set(station.id,{group,body,surface,height:0,volume:0,cells:0,spatial:false,renderedVolume:0,station})}
 const streams=['receiving-grains','spreading-grains','chain-to-hopper-grains'].map(name=>{const mesh=new InstancedMesh(new IcosahedronGeometry(.009,0),material,160);mesh.name=name;mesh.frustumCulled=false;mesh.visible=false;root.add(mesh);return mesh})
 const hopperStock=createHopperStock(material),hopper=hopperStock.mesh,bucketStock=createBucketStock(material),bucket=bucketStock.mesh;const chain=new InstancedMesh(new IcosahedronGeometry(.02,0),material,100);chain.name='chain-material';chain.frustumCulled=false
 let cell=null,clock=0,chainClock=0,buffer=1,bucketFill=0,equipment={},chainActive=false,feedingNow=false,pouringNow=false,spatialDirty=true,surfaceKey='',visualStamp='',visualElapsed=0,stockTravel=0,gateTarget=0,visualHopperVolume=0,visualBucketVolume=0,projectedIncomingVolume=0
 let lastHopperCapacity=0
 function attachEquipment(next){if(equipment.feeder!==next.feeder){hopper.removeFromParent();chain.removeFromParent();next.feeder?.add(hopper,chain)}if(equipment.tool!==next.tool){bucket.removeFromParent();next.tool?.add(bucket);bucketStock.configure(next.tool,next.toolRig)}equipment=next}
 function setCell(value){
  cell=value
  if(Number(value?.hopperCapacityLitres)>0)lastHopperCapacity=Number(value.hopperCapacityLitres)
  const stamp=value?JSON.stringify([value.lastUpdateTime,value.receiving,value.loaded,value.gateOpen,value.hopperVolume,value.bucketVolume,value.chainActive]):'';if(stamp!==visualStamp){visualElapsed=0;visualStamp=stamp}
  // IO/FK checkpoints frequently repeat the same deposit. Rebuild only if
  // geometry inputs change, including equal-volume redistribution or pot switch.
  const key=value?JSON.stringify([value.barrel,value.height,value.targetHeight,value.depositGridSize,value.depositGrid,value.depositCells]):''
  if(key!==surfaceKey){spatialDirty=true;surfaceKey=key}
  if(!value){spatialDirty=true;bucketFill=0;feedingNow=false;pouringNow=false}
 }
 function resetPot(barrel){const v=surfaces.get('pot-'+barrel);if(!v)return;if(cell?.barrel===barrel)setCell(null);v.height=0;v.volume=0;v.cells=0;v.spatial=false;v.renderedVolume=0;v.group.visible=false;v.surface.mesh.visible=false;spatialDirty=true;surfaceKey=''}
 function update(delta,{running=false,feederPoint=null,toolPoint=null,rate=1,gateAmount=0,guardAmount=0,atReceiving=false,beltDistance=null,programVisible=true,visiblePots={}}={}){
  const visibilityChanged=root.visible!==programVisible;root.visible=programVisible
  const dt=(running?Math.max(0,Number(delta)||0):0)*Math.max(0,Math.min(20,rate));clock+=dt;visualElapsed+=dt;let changed=visibilityChanged
  const hopperLitres=Number(cell?.hopperVolume),hopperCapacity=Number(cell?.hopperCapacityLitres)
  const hasHopper=!!cell&&Number.isFinite(hopperLitres)&&Number.isFinite(hopperCapacity)&&hopperCapacity>0
  const visualNow=(Number(cell?.lastUpdateTime)||0)+visualElapsed,lastUpdate=Number(cell?.lastUpdateTime)||0,scheduled=Number.isFinite(cell?.transferStartAt)&&Number.isFinite(cell?.transferAt),openingAt=Number(cell?.transferStartAt)-.4,visualLoaded=!!cell?.loaded||scheduled&&visualNow>=cell.transferAt
  gateTarget=Number(!!cell?.receiving&&!visualLoaded&&(scheduled?visualNow>=openingAt:cell.gateOpen===undefined||!!cell.gateOpen))
  const gateReady=atReceiving&&gateAmount>.95&&!!gateTarget
  const drive=toolDrive(cell),pouring=!!cell&&!cell.receiving&&guardAmount>.9&&drive.belt>0&&drive.rotor!==0&&drive.speed>0&&drive.rotorSpeed>0&&(cell.profile==='brewing-cell@1'?bucketHasMaterial(cell):(cell.bucketFraction??1)>.005)
  const backendChain=cell&&Object.prototype.hasOwnProperty.call(cell,'chainActive')?!!cell.chainActive:buffer<.98
  const closeReadyAt=Number(cell?.gateClosedAt)||(scheduled?cell.transferAt+.4:0),chainRate=(Number(cell?.chainRateLitresPerSecond)||0)/1000
  let previewTransfer=0,preRefill=0,postRefill=0
  if(hasHopper){
   const remaining=Math.max(0,(Number(cell.pendingBucketVolume)||0)-(Number(cell.receivedBucketVolume)||0))
   if(cell.receiving&&cell.receivePhase==='refill'&&scheduled)preRefill=Math.max(0,Math.min((Number(cell.refillTargetVolume)||remaining)-hopperLitres,Math.max(0,Math.min(visualNow,openingAt)-lastUpdate)*chainRate))
   if(cell.receiving&&!cell.loaded&&scheduled&&atReceiving){const time=Math.max(0,visualNow-Math.max(lastUpdate,cell.transferStartAt));previewTransfer=Math.min(hopperLitres+preRefill,remaining,time*(Number(cell.receiveRateLitresPerSecond)||0)/1000)}
   const stock=hopperLitres+preRefill-previewTransfer
   const high=hopperCapacity/1000*(cell.hopperHighFraction??.95),low=hopperCapacity/1000*(cell.hopperLowFraction??.2),refill=backendChain||cell.refillActive||stock<=low+1e-12
   if(!gateTarget&&(visualLoaded||!cell.receiving)&&refill)postRefill=Math.max(0,Math.min(high-stock,Math.max(0,visualNow-Math.max(lastUpdate,closeReadyAt))*chainRate))
   visualHopperVolume=Math.max(0,stock+postRefill);projectedIncomingVolume=preRefill+postRefill;buffer=Math.max(0,Math.min(1,visualHopperVolume/(hopperCapacity/1000)))
  }
  const scheduledRefill=hasHopper&&!gateTarget&&visualNow>=closeReadyAt&&visualHopperVolume<hopperCapacity/1000*(cell.hopperHighFraction??.95)-1e-8&&(backendChain||cell.refillActive||hopperLitres-previewTransfer<=hopperCapacity/1000*(cell.hopperLowFraction??.2)+1e-12)&&(visualLoaded||!cell.receiving)
  const feeding=!!cell?.receiving&&!visualLoaded&&gateReady&&(!hasHopper||hopperLitres+preRefill>1e-8)&&(!('pendingBucketVolume' in (cell||{}))||cell.pendingBucketVolume>1e-8)
  chainActive=!!running&&!!cell&&!cell.complete&&!!(backendChain||scheduledRefill)&&!gateTarget&&gateAmount<.05&&!feeding
  if(!hasHopper){if(chainActive)buffer=Math.min(1,buffer+dt*.22);else if(running&&feeding)buffer=Math.max(0,buffer-dt*.27)}
  if(chainActive)chainClock+=dt
  visualBucketVolume=Math.max(0,(Number(cell?.bucketVolume)||0)+previewTransfer)
  const targetBucket=cell?.profile==='brewing-cell@1'?visualBucketVolume/(Number(cell.capacityLitres||90)/1000):Number(cell?.bucketFraction)||0
  const receiveGateReady=!cell?.receiving||visualLoaded||gateReady
  bucketFill=Math.min(1,Math.max(0,receiveGateReady?targetBucket:0))
  if(running&&drive.belt&&drive.speed)stockTravel+=dt*.18*drive.belt*drive.speed
  const {feeder,tool}=equipment
  if(feeder){changed=hopperStock.update(feeder.userData,buffer)||changed;chain.visible=!!cell;const deck=feeder.userData.chainDeck;for(let i=0;i<100;i++){const t=((i/100+chainClock*.38)%1),x=Math.sin(i*13.7)*.28,z=deck.tailZ-.05-t*(deck.length-.12);matrix.makeTranslation(x,deck.deckY+.075+(i%3)*.012,z);chain.setMatrixAt(i,matrix)}chain.instanceMatrix.needsUpdate=true;changed=changed||chainActive}
  if(tool)changed=bucketStock.update(bucketFill,{beltDistance:beltDistance??stockTravel})||changed
  const surface=cell?surfaces.get('pot-'+cell.barrel):null
  if(surface){
   const spatial=!!cell.depositGrid||!!cell.depositCells&&typeof cell.depositCells==='object'
   surface.spatial=spatial
   if(spatial&&spatialDirty){
    const info=surface.surface.update(cell);surface.volume=info.volume;surface.renderedVolume=info.renderedVolume;surface.cells=info.cells;surface.height=Math.min(cell.targetHeight,Math.max(0,cell.height))/1000;surface.group.visible=info.volume>0;surface.body.visible=false;changed=true;spatialDirty=false
   }else if(!spatial){
    const desired=Math.min(cell.targetHeight,Math.max(0,cell.height))/1000;const next=cell.complete?desired:surface.height+(Math.max(surface.height,desired)-surface.height)*Math.min(1,dt*4);if(Math.abs(next-surface.height)>.00001){surface.height=next;changed=true}surface.group.visible=surface.height>.001;surface.surface.mesh.visible=false;surface.body.visible=true;const r=surface.station.dimensions.lowerRadius+(surface.station.dimensions.upperRadius-surface.station.dimensions.lowerRadius)*surface.height/.97-.025;surface.body.scale.set(r,Math.max(.001,surface.height),r);surface.body.position.y=surface.height/2
   }
  }
  const chainPoint=feeder?feeder.localToWorld(new Vector3(0,feeder.userData.chainDeck.deckY+.05,feeder.userData.chainDeck.dischargeZ)):null
  for(let kind=0;kind<3;kind++){
   const mesh=streams[kind],point=kind===2?chainPoint:kind===1?toolPoint:feederPoint,enabled=running&&(kind===2?chainActive:kind===1?pouring:feeding)&&point&&surface
   mesh.visible=!!enabled;if(!enabled)continue;changed=true
   const outlet=kind===1?bucketStock.outlet():null,origin=outlet?.point||point
   const floor=kind===2?point.y-.32:kind===1?surface.station.position[1]+surface.height:point.y-.60
   for(let i=0;i<160;i++){const age=(clock*1.4+i/160)%1,drop=Math.max(.01,origin.y-floor),angle=i*2.39996,radius=Math.sqrt((i*.618)%1)*(kind===1?.10:.055);matrix.compose(new Vector3(origin.x+Math.cos(angle)*radius,origin.y-drop*age*age,origin.z+Math.sin(angle)*radius).addScaledVector(outlet?.axis||new Vector3(),outlet?(i/159-.5)*outlet.width:0),identity,one);mesh.setMatrixAt(i,matrix)}mesh.instanceMatrix.needsUpdate=true
  }
  for(const [id,v] of surfaces)if(visiblePots[id]===false)v.group.visible=false;else if(v.volume>0||v.height>0)v.group.visible=true
  hopper.visible=hopper.visible&&programVisible;bucket.visible=bucket.visible&&programVisible;chain.visible=chain.visible&&programVisible
  feedingNow=feeding;pouringNow=pouring
  return changed||(running&&(pouring||feeding))
 }
 function inspect(){return [...surfaces].map(([id,v])=>({id,height:v.height,visible:root.visible&&v.group.visible,cells:v.cells||0,volume:v.volume||0,spatial:!!v.spatial,renderedVolume:v.renderedVolume||0}))}
 function materialState(){return {hopperStock:hopperStock.inspect(),bucketStock:bucketStock.inspect(),visualHopperVolume,visualBucketVolume,projectedIncomingVolume,buffer,bucketFill,hopperLitres:Number(cell?.hopperVolume)||0,hopperCapacityLitres:Number(cell?.hopperCapacityLitres)||0,chainActive,feeding:feedingNow,pouring:pouringNow,emptyReturn:!!cell&&cell.stage==='空斗返回',coveredCells:[...surfaces.values()].reduce((n,v)=>n+(v.cells||0),0),depositedVolume:[...surfaces.values()].reduce((n,v)=>n+(v.volume||0),0),cellDepositedVolume:Number(cell?.depositedVolume)||0,renderedVolume:[...surfaces.values()].reduce((n,v)=>n+(v.renderedVolume||0),0),streams:streams.map(mesh=>({name:mesh.name,visible:mesh.visible}))}}
 function dispose(){root.traverse(o=>{o.geometry?.dispose()});hopperStock.dispose();bucketStock.dispose();chain.geometry.dispose();chain.removeFromParent();material.dispose();texture.dispose();root.removeFromParent()}
 return {root,setCell,resetPot,hopperSnapshot(){return lastHopperCapacity>0?{initialHopperLitres:Math.max(0,Math.min(lastHopperCapacity,visualHopperVolume*1000)),hopperCapacityLitres:lastHopperCapacity}:null},update,inspect,materialState,dispose,attachEquipment,detachTool(owner){if(equipment.tool===owner){bucket.removeFromParent();equipment={...equipment,tool:null};bucketStock.configure(null)}},get feedGateTarget(){return gateTarget},get chainActive(){return chainActive},get bucketFill(){return bucketFill},get streams(){return streams.map(m=>({name:m.name,visible:m.visible}))}}
}

import * as THREE from 'three'
import {cranePose} from './crane-state.mjs'
import {cranePartMechanism} from './crane-parts.mjs'

// Offline structural illustration of the 古井贡 76-set intelligent crane, built
// from the 168-page commissioning/training deck pages listed on each part and
// from the 3D CAD screenshots of the grab, telescopic arm, transfer car and
// 2D scanner in that deck. It is NOT a manufacturing CAD model and contains no
// controller program, field address, credential or commissioning command.
//
// Coordinates: metres, Y up, +X = 大车行走 (crane travel), +Z = 伸缩小车横移
// (trolley traverse, north positive). Assembly views on pages 94–97/109–111
// establish the arrangement; they contain no manufacturing dimensions, so
// span, girder height, mast sections, grab draught and cabinet placement are
// proportioned illustrations. Every axis value consumed by applyCranePose is a
// normalised 0..1 demonstration ratio, never a field limit, speed or load.
export const craneModelDimensions=Object.freeze({
 runwayLength:30,
 span:20,
 runwayBeamTop:3.2,
 railTop:3.38,
 girderTop:6.05,
 trolleyUnderside:6.45,
 mastRetractedBottom:4.45,
 mastExtension:3,
 mastSectionSlide:1.5,
 grabHeight:1.46,
 transferRailX:0,
 transferHoistFrameY:4.35,
 transferFixtureTopY:3.65,
 travelDisplay:20,
 trolleyDisplay:17,
 transferDisplay:17,
 transferHoistDisplay:2
})
export const craneModelNote='依据《古井贡76套智能行车调试培训》168页资料中可辨识的部件与三维截图绘制的结构示意。跨度、梁高、伸缩节、抓斗斗容、柜体位置和所有动作行程均为离线比例，总装布局已按第94—97、109—111页及用户三视图复核；原行车程序另行核验；不代表现场尺寸、速度、载荷、轨迹或控制接线。'

const DIM=craneModelDimensions
const UP=new THREE.Vector3(0,1,0)

function clampUnit(value,fallback){
 return typeof value==='number'&&Number.isFinite(value)?Math.min(1,Math.max(0,value)):fallback
}

// Line a unit-height cylinder between two local points. Used for the grab and
// transfer-car wire ropes, whose two ends move with different demonstration
// axes, so the length and orientation have to be recomputed on every pose.
function positionRope(object,from,to){
 const start=new THREE.Vector3(from[0],from[1],from[2])
 const end=new THREE.Vector3(to[0],to[1],to[2])
 const direction=new THREE.Vector3().subVectors(end,start)
 const length=Math.max(.02,direction.length())
 object.position.copy(start).addScaledVector(direction,.5)
 object.quaternion.setFromUnitVectors(UP,direction.normalize())
 object.scale.set(1,length,1)
}

export function buildCraneModel(){
 const root=new THREE.Group()
 root.name='intelligent-crane'
 root.userData={
  modelType:'offline-structural-illustration',
  sourceTitle:'古井贡76套智能行车调试培训',
  sourcePageCount:168,
  coordinateSystem:'metres, Y up, +X 大车行走, +Z 伸缩小车横移(北)',
  displayNote:craneModelNote,
  family:'intelligent-crane'
 }
 const parts=[]
 const materials={
  steel:new THREE.MeshStandardMaterial({color:0x9aa4ab,metalness:.82,roughness:.32}),
  steelDark:new THREE.MeshStandardMaterial({color:0x5d666c,metalness:.7,roughness:.42}),
  panel:new THREE.MeshStandardMaterial({color:0xb9c3c9,metalness:.32,roughness:.52}),
  paint:new THREE.MeshStandardMaterial({color:0xd93225,metalness:.22,roughness:.5}),
  paintDark:new THREE.MeshStandardMaterial({color:0xab271f,metalness:.24,roughness:.55}),
  orange:new THREE.MeshStandardMaterial({color:0xd08a2c,metalness:.32,roughness:.46}),
  yellow:new THREE.MeshStandardMaterial({color:0xd8a520,metalness:.5,roughness:.38}),
  green:new THREE.MeshStandardMaterial({color:0x2f7a4f,metalness:.35,roughness:.5}),
  blue:new THREE.MeshStandardMaterial({color:0x1f5c99,metalness:.4,roughness:.42}),
  white:new THREE.MeshStandardMaterial({color:0xe8e4dc,metalness:.08,roughness:.7}),
  black:new THREE.MeshStandardMaterial({color:0x1b1f22,metalness:.2,roughness:.75}),
  rubber:new THREE.MeshStandardMaterial({color:0x14161a,metalness:.04,roughness:.92}),
  brass:new THREE.MeshStandardMaterial({color:0xb08d3f,metalness:.7,roughness:.35}),
  glass:new THREE.MeshStandardMaterial({color:0xc4d2d6,metalness:.1,roughness:.3,transparent:true,opacity:.55}),
  lamp:new THREE.MeshStandardMaterial({color:0xd63a2c,emissive:0x6e140c,roughness:.3}),
  jaw:new THREE.MeshStandardMaterial({color:0xb7bfc4,metalness:.55,roughness:.42,side:THREE.DoubleSide}),
  concrete:new THREE.MeshStandardMaterial({color:0xb4bdc2,metalness:.05,roughness:.9}),
  scan:new THREE.MeshBasicMaterial({color:0x54c8d8,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false})
 }
 const rig={
  travel:[],trolley:[],transfer:[],
  grabRopes:[],transferRopes:[],spindles:[],grabAttached:[],turnoverAttached:[],turnoverRotating:[],
  turnover:null,grab:null,jaws:null,jawA:null,jawB:null,
  stage2:null,stage3:null,drum:null,antiFallRod:null
 }

 function material(value){return typeof value==='string'?(materials[value]||materials.steel):value}
 function mesh(parent,geometry,materialValue,x=0,y=0,z=0){
  const object=new THREE.Mesh(geometry,material(materialValue))
  object.position.set(x,y,z)
  object.castShadow=true
  object.receiveShadow=true
  parent.add(object)
  return object
 }
 function box(parent,size,at,materialValue='steel'){
  return mesh(parent,new THREE.BoxGeometry(size[0],size[1],size[2]),materialValue,at[0],at[1],at[2])
 }
 function cylinder(parent,radius,height,at,materialValue='steel',axis='y',segments=20){
  const object=mesh(parent,new THREE.CylinderGeometry(radius,radius,height,segments),materialValue,at[0],at[1],at[2])
  if(axis==='x')object.rotation.z=Math.PI/2
  if(axis==='z')object.rotation.x=Math.PI/2
  return object
 }
 function tube(parent,points,radius,materialValue='black',segments=24){
  const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(point[0],point[1],point[2])))
  return mesh(parent,new THREE.TubeGeometry(curve,segments,radius,6,false),materialValue)
 }
 // Two-tyre wheel set: the tyre keeps the running radius, the flange sits on the
 // rail head and the hub is a visible axle end. All wheels are illustrative.
 function wheel(parent,radius,width,at,materialValue='steelDark',axis='z'){
  const tyre=cylinder(parent,radius,width,at,materialValue,axis,24)
  cylinder(parent,radius*.94,width*.34,at,'steel',axis,24)
  cylinder(parent,radius*.42,width*1.25,at,'steelDark',axis,16)
  for(let i=0;i<6;i++){
   const a=i*Math.PI/3,p=at.slice(),r=radius*.58;
   if(axis==='x'){p[0]+=width*.7;p[1]+=Math.cos(a)*r;p[2]+=Math.sin(a)*r}
   else{p[2]+=width*.7;p[0]+=Math.cos(a)*r;p[1]+=Math.sin(a)*r}
   cylinder(parent,.018,.035,p,'steel',axis,6)
  }
  return tyre
 }
 function part(id,label,system,sourceSlides,description,presentationOffset=[0,0,0]){
  const group=new THREE.Group()
  group.name=id
  const mechanism=cranePartMechanism[id]||{mechanism:'',axes:[]}
  group.userData={partId:id,label,description,sourceSlides:sourceSlides.slice(),system,presentationOffset:presentationOffset.slice(),mechanism:mechanism.mechanism,controllerAxes:mechanism.axes.slice()}
  root.add(group)
  parts.push(group)
  return group
 }
 function rope(parent,from,to){
  const object=mesh(parent,new THREE.CylinderGeometry(.014,.014,1,8),'black',0,0,0)
  positionRope(object,from,to)
  return object
 }

 // ---------------- 轨道与环境组 runway: fixed, never moved by a pose ------
 const runway=part('runway','轨道与立柱','runway',[8,93,94,96],'两根车间轨道梁由立柱支撑，轨道沿大车行走方向布置；端部设缓冲挡块，北侧立柱上固定滑触线。资料只给轨道长度与台数，柱距、标高的比例为示意。')
 for(const z of [-DIM.span/2,DIM.span/2]){
  box(runway,[DIM.runwayLength,.8,.55],[0,2.8,z],'panel')
  box(runway,[DIM.runwayLength,.06,.2],[0,3.23,z],'steelDark')
  box(runway,[DIM.runwayLength,.12,.15],[0,3.32,z],'steel')
  for(const x of [-14.4,14.4]){
   box(runway,[.5,.32,.72],[x,3.5,z],'yellow')
   for(const dx of [-.14,.14])cylinder(runway,.09,.34,[x+dx,3.55,z],'rubber','x',16)
  }
  for(const x of [-15,-7.5,0,7.5,15]){
   const outside=z>0? .55:-.55
   box(runway,[.45,2.4,.45],[x,1.2,z+outside],'panel')
   box(runway,[.62,.18,1.0],[x,2.3,z+outside*.5],'panel')
   box(runway,[.78,.06,.78],[x,.03,z+outside],'concrete')
  }
 }
 // 滑触线 (conductor rail) on the north runway side, 集电器 collects from it.
 box(runway,[DIM.runwayLength,.09,.11],[0,3.55,DIM.span/2+.62],'brass')
 for(const x of [-15,-7.5,0,7.5,15])box(runway,[.08,.38,.3],[x,3.36,DIM.span/2+.47],'steelDark')

 // ---------------- 集电器 collector: rides with 大车 ----------------------
 const collector=part('collector','集电器','runway',[97,101],'行车从滑触线取电的集电器，固定在大车端梁上，与声光报警器共用支架；安装侧由滑触线位置决定。模型中按北侧安装示意。',[-2.4,.6,0])
 box(collector,[.55,.5,.14],[0,3.62,DIM.span/2+.35],'steelDark')
 cylinder(collector,.05,.5,[-.16,3.62,DIM.span/2+.45],'white','x',12)
 cylinder(collector,.05,.5,[.16,3.62,DIM.span/2+.45],'white','x',12)
 for(const dx of [-.16,.16])box(collector,[.16,.1,.12],[dx,3.56,DIM.span/2+.58],'steel')
 box(collector,[.08,.3,.5],[0,3.88,DIM.span/2+.1],'steelDark')

 // ---------------- 双主梁 bridge girder --------------------------------
 const girder=part('bridge-girder','双主梁与小车轨道','bridge',[56,57,69,110],'两根箱形主梁落在南北端梁上，梁顶铺伸缩小车轨道；主梁间设横向联系，周转小车沿双主梁内侧下翼缘横移，与梁上伸缩小车共用跨度方向。布置按总装图复核，截面与跨度尺寸仍为示意。',[0,2.4,0])
 for(const x of [-1.75,1.75]){
  box(girder,[1.05,.1,DIM.span+.6],[x,4.65,0],'paint');
  box(girder,[.65,.1,DIM.span+.6],[x,5.99,0],'paint');
  for(const dx of [-.30,.30])box(girder,[.06,1.3,DIM.span+.6],[x+dx,5.3,0],'paint');
  for(let z=-9;z<=9;z+=3)box(girder,[.68,1.2,.06],[x,5.3,z],'paintDark');
  box(girder,[.24,.06,DIM.span+.6],[x,6.08,0],'steelDark');
  box(girder,[.14,.08,DIM.span+.6],[x,6.15,0],'steel');
  // Underhung transfer wheels run on the inner lower flange, not an outside rail.
  box(girder,[.15,.08,DIM.span-.5],[Math.sign(x)*1.30,4.72,0],'yellow');
 }
 // End diaphragms stay outside the shared trolley passage.
 for(const z of [-DIM.span/2,DIM.span/2])box(girder,[4.1,1.4,.12],[0,5.3,z],'paint');

 const walkway=part('bridge-walkway','双侧走台与护栏','bridge',[94,95,96,97,109,110,111],'两根长主梁外侧各设红色走台和踢脚板、浅灰护栏，端部连接检修通道；涂装按古井车间实拍复核，布局按总装视图，尺寸仍为比例示意。',[-2.6,1.8,0]);
 for(const side of [-1,1]){
  const x=side*2.6;
  box(walkway,[1.05,.06,DIM.span+.6],[x,5.96,0],'paint');
  box(walkway,[.06,.18,DIM.span+.6],[side*3.1,6.08,0],'paint');
  for(let z=-10;z<=10;z+=1.5)box(walkway,[.045,1.08,.045],[side*3.1,6.53,z],'panel');
  for(const y of [6.55,7.06])box(walkway,[.045,.045,DIM.span+.6],[side*3.1,y,0],'panel');
  for(let z=-9;z<=9;z+=3)box(walkway,[1.05,.12,.13],[x,5.86,z],'paintDark');
 }
 for(const z of [-10.12,10.12]){
  box(walkway,[6.2,.06,.32],[0,5.96,z],'paint');
  for(const x of [-3.1,-1.5,1.5,3.1])box(walkway,[.045,1.08,.045],[x,6.53,z],'panel');
  for(const y of [6.55,7.06])box(walkway,[6.2,.045,.045],[0,y,z],'panel');
 }
 // Access gates, hinges and latches visible in the user's detailed CAD views.
 for(const side of [-1,1]){
  const end=side;
  const x=side*3.13,z=end*8.9;
  tube(walkway,[[x,6.08,z-.43],[x,7.01,z-.43],[x,7.04,z+.4],[x,6.08,z+.43],[x,6.08,z-.43]],.025,'panel',24);
  box(walkway,[.04,.04,.84],[x,6.55,z],'panel');
  for(const y of [6.25,6.85])box(walkway,[.07,.12,.08],[x,y,z-.45],'steelDark');
  box(walkway,[.05,.16,.2],[x,6.85,z+.4],'panel');
  box(walkway,[.07,.035,.24],[x,6.87,z+.28],'steelDark');
  box(walkway,[.08,.08,.16],[x,6.26,z+.5],'panel');
 }

 // ---------------- 南北端梁 -------------------------------------------
 function endCarriage(id,label,z,offset){
  const group=part(id,label,'bridge',[55,56,69,94],'端梁承托主梁，南北端梁各一台伺服行走电机（资料编号 M1/M2，共两台，不是每端两台），端部装缓冲器；轴距和轮径按外形比例示意。',offset)
  box(group,[6.3,.66,.8],[0,4.25,z],'paint')
  box(group,[6.5,.16,.95],[0,3.9,z],'steelDark')
  for(const x of [-2.55,2.55]){
   box(group,[.3,.3,.24],[x,3.95,z],'steelDark')
   wheel(group,.4,.18,[x,3.78,z],'steelDark','z')
  }
  for(const x of [-3.35,3.35])cylinder(group,.12,.26,[x,3.9,z],'rubber','x',16)
  return group
 }
 const endSouth=endCarriage('endcarriage-south','南端梁',-DIM.span/2,[0,.6,-3.6])
 const endNorth=endCarriage('endcarriage-north','北端梁',DIM.span/2,[0,.6,3.6])

 // ---------------- 大车伺服电机 M1(南)/M2(北) ---------------------------
 const travelMotors=part('travel-motors','大车伺服电机','bridge',[94,107],'南北端梁各一台大车伺服电机（资料编号 M1/M2）经减速机驱动大车行走，配风扇与编码器；模型只示意外形与安装位置。',[0,1,2.8])
 for(const z of [-DIM.span/2,DIM.span/2]){
  const side=z>0?1:-1
  cylinder(travelMotors,.16,.44,[2.55,4.25,z+side*.62],'steelDark','z',20)
  box(travelMotors,[.34,.3,.28],[2.55,4.25,z+side*.4],'steelDark')
  box(travelMotors,[.26,.18,.16],[2.55,4.25,z+side*.86],'yellow')
  box(travelMotors,[.2,.14,.14],[2.55,4.5,z+side*.4],'panel')
  cylinder(travelMotors,.09,.06,[2.55,4.62,z+side*.4],'steelDark','z',16)
 }

 // ---------------- 大车控制柜 -----------------------------------------
 const cabinet=part('bridge-cabinet','大车控制柜','bridge',[54,55,57,58],'大车控制柜内装主断路器、变压器、S120 控制单元、工控机、IO 与通信设备；柜门、散热和元件位置只按资料表格示意，不复制接线或参数。',[-3.4,2.4,0])
 box(cabinet,[.78,1.3,2.8],[-2.6,6.64,-4.2],'panel');
 box(cabinet,[.83,.08,2.85],[-2.6,7.33,-4.2],'steel');
 for(const z of [-4.9,-3.5]){
  box(cabinet,[.035,1.2,1.34],[-3.01,6.64,z],'steel');
  box(cabinet,[.045,.2,.035],[-3.04,6.7,z+.45],'steelDark');
  for(const y of [6.15,6.23,6.31])box(cabinet,[.04,.025,.9],[-3.035,y,z],'steelDark');
 }
 for(const z of [-5.4,-3])for(const x of [-2.85,-2.35])box(cabinet,[.06,.08,.06],[x,5.97,z],'steelDark');

 // ---------------- 声光报警器 -----------------------------------------
 const alarm=part('alarm-beacon','声光报警器','bridge',[56,94,99,144],'大车南、北两侧各一只声光报警器，由柜内继电器驱动；仅按外形建模，不包含电压、回路或调试接线。',[0,1.4,4])
 for(const side of [-1,1]){
  box(alarm,[.16,.35,.1],[side*2.6,5.77,side*3],'steelDark')
  const light=box(alarm,[.65,.14,.45],[side*2.6,5.54,side*3],'yellow');light.rotation.z=side*.16
  const lens=box(alarm,[.54,.025,.35],[side*2.6,5.46,side*3],'white');lens.rotation.z=side*.16
 }
 for(const z of [-10.35,10.35]){
  cylinder(alarm,.045,1.9,[-1.55,5.58,z],'steelDark','y',20)
  box(alarm,[.16,.2,.14],[-1.55,6.6,z],'black')
  cylinder(alarm,.09,.06,[-1.55,6.7,z],'yellow')
  mesh(alarm,new THREE.SphereGeometry(.11,16,12,0,Math.PI*2,0,Math.PI/2),'lamp',-1.55,6.74,z)
 }

 // ---------------- 大车前后限位开关 -----------------------------------
 const limits=part('limit-switches','大车前后限位','bridge',[55,94,96,98],'大车前后限位开关装在大车主梁/端梁端部，撞块在轨道端部；模型只表示开关与滚轮外形，不表示接线或动作整定值。',[0,.9,2.8])
 for(const z of [-10,10])for(const x of [-1.55,1.55]){
  box(limits,[.18,.22,.12],[x,3.95,z+(z>0?.45:-.45)],'yellow')
  cylinder(limits,.022,.2,[x+(x>0?-.13:.13),3.95,z+(z>0?.55:-.55)],'steel','x',10)
  box(limits,[.06,.06,.12],[x+(x>0?-.2:.2),3.95,z+(z>0?.55:-.55)],'steelDark')
 }

 // ---------------- 拖链与线槽 -----------------------------------------
 const chains=part('cable-chains','拖链与线槽','bridge',[110,111,95],'大车平台有三条拖链：伸缩小车拖链与两条周转小车拖链，另有平台、南北端梁线槽。模型中用分段链节示意，弯折形态不表示实际拖链长度。',[0,1.2,0])
 box(chains,[.3,.1,11.2],[-1.25,6.0,0],'steelDark')
 for(let index=0;index<22;index++){
  const z=-5.3+index*.5
  const link=box(chains,[.22,.06,.34],[-1.25,6.12,z],'black')
  link.rotation.x=index%2?.22:-.22
 }
 for(const zdirection of [-1,1])for(let index=0;index<8;index++){
  const z=zdirection*(.4+index*.5)
  const link=box(chains,[.16,.05,.3],[zdirection*1.3,4.5,z],'black')
  link.rotation.x=index%2?.2:-.2
 }
 for(let z=-4;z<=4;z+=2)box(chains,[.08,.3,.08],[1.3,4.5,z],'steelDark')
 // 大车线槽三段：平台 + 南/北端梁（第111页）
 box(chains,[.42,.1,11.2],[-1.25,6.05,0],'panel')
 for(const z of [-DIM.span/2,DIM.span/2])box(chains,[.42,.1,.7],[0,4.35,z],'panel')

 // ---------------- 无线网桥与摄像头 -----------------------------------
 const wireless=part('wireless-bridge','无线网桥与摄像头','bridge',[42,43,44,45,46,47,48,55,94],'无线网桥摄像端装在行车平台上，录像端在轨道端部；另有摄像头监视吊具。模型只表示设备外形与大致位置，不包含 IP 地址、网桥名称或密码。',[0,1.2,-4.2])
 cylinder(wireless,.03,.95,[-3.15,5.95,6.1],'steelDark','y',20)
 box(wireless,[.16,.16,.24],[-3.15,6.42,6.1],'white')
 box(wireless,[.2,.18,.32],[-3.15,6.75,5.62],'white')
 cylinder(wireless,.06,.1,[-3.15,6.75,5.44],'black','z',16)
 box(wireless,[.1,.12,.14],[-3.15,6.55,5.62],'steelDark')

 // ---------------- 伸缩小车车架 ---------------------------------------
 const frame=part('trolley-frame','伸缩小车车架','telescopic',[119,120,121,122,123],'伸缩小车在两根主梁轨道上行走，车架承载行走机构、提升机构、动力柜与防坠电缸。车架长宽与主梁间距为示意。',[0,1.6,0])
 box(frame,[4.1,.4,.35],[0,6.85,-.8],'paint')
 box(frame,[4.1,.4,.35],[0,6.85,.8],'paint')
 box(frame,[.35,.4,1.5],[-1.95,6.85,0],'paint')
 box(frame,[.35,.4,1.5],[1.95,6.85,0],'paint')
 for(const x of [-1.25,1.25])box(frame,[1.5,.08,1.9],[x,7.1,0],'paint');for(const z of [-.8,.8])box(frame,[1,.08,.3],[0,7.1,z],'paint')
 for(const x of [-.5,.5])box(frame,[.07,.5,1.15],[x,6.28,0],'steelDark')
 for(const z of [-.54,.54])box(frame,[.95,.5,.07],[0,6.28,z],'steelDark')
 for(const x of [-.4,.4])for(const z of [-.55,.55])cylinder(frame,.12,.07,[x,6.42,z],'steelDark','x',16)
 rig.drum=cylinder(frame,.22,1.3,[0,7.40,0],'steel','x',24)
 for(const dx of [-.7,.7])box(frame,[.25,.25,.25],[dx,7.40,0],'steelDark')
 for(const dx of [-.18,.18])box(frame,[.05,.06,.5],[dx,7.62,0],'steelDark')
 box(frame,[.18,.3,.18],[1.05,7.05,-.7],'yellow')
 box(frame,[.16,.22,.16],[-1.05,7.05,0],'green')

 // ---------------- 伸缩小车行走机构 -----------------------------------
 const drive=part('trolley-drive','伸缩小车行走机构','telescopic',[117,118,119,125],'伸缩小车行走为成对驱动，每侧伺服电机经减速机带动车轮；轮距与减速机位置为示意，不表示 2 kW 等资料参数的实际选型。',[0,1.2,2.6])
 for(const x of [-1.75,1.75])for(const z of [-.6,.6]){
  wheel(drive,.2,.14,[x,6.39,z],'steelDark','x')
  box(drive,[.1,.5,.2],[Math.sign(x)*1.91,6.60,z],'steelDark')
 }
 for(const x of [-1.95,1.95]){
  cylinder(drive,.15,.46,[x,6.86,.95],'steelDark','z',20)
  box(drive,[.28,.26,.24],[x,6.86,.7],'steelDark')
  box(drive,[.16,.14,.12],[x,6.86,1.24],'yellow')
 }
 for(const z of [-.9,.9])box(drive,[.16,.16,.14],[0,6.42,z],'yellow')

 // ---------------- 伸缩提升臂 -----------------------------------------
 const mast=part('telescopic-mast','伸缩提升臂','telescopic',[119,126,127,128,129],'提升由成对 7 kW 伺服经卷扬与三节伸缩臂完成，另有防坠电缸、伸缩臂上限位和导轨润滑。三节臂长、伸缩行程和防坠电缸位置为示意，不是实测提升高度或速度。',[0,.8,0])
 box(mast,[.94,.55,1.0],[0,6.22,0],'steelDark')
 box(mast,[.8,2.3,.9],[0,5.6,0],'paint')
 for(const x of [-.44,.44])for(const z of [-.5,.5])cylinder(mast,.035,1.5,[x,5.2,z],'steelDark','y',12)
 cylinder(mast,.08,1.0,[.62,5.7,0],'steelDark','y',20)
 rig.antiFallRod=cylinder(mast,.035,.7,[.62,4.9,0],'steel','y',16)
 box(mast,[.12,.14,.12],[.32,4.42,0],'yellow')
 box(mast,[.22,.25,.18],[-.55,4.62,-.35],'green')
 rig.stage2=new THREE.Group()
 mast.add(rig.stage2)
 box(rig.stage2,[.66,2.3,.76],[0,5.6,0],'paint')
 for(const x of [-.36,.36])box(rig.stage2,[.05,.06,1.4],[x,5.2,-.41],'steelDark')
 rig.stage3=new THREE.Group()
 rig.stage2.add(rig.stage3)
 box(rig.stage3,[.52,2.3,.64],[0,5.6,0],'paint')
 box(rig.stage3,[.42,.12,.54],[0,4.44,0],'steelDark')
 for(const corner of [[.44,0],[-.44,0],[0,.48],[0,-.48]]){
  rig.grabRopes.push({object:rope(mast,[corner[0],DIM.trolleyUnderside,corner[1]],[corner[0],DIM.mastRetractedBottom,corner[1]]),corner})
 }

 // ---------------- 小车动力柜与抓斗动力柜 -----------------------------
 const trolleyCab=part('trolley-cabinet','伸缩小车与抓斗动力柜','telescopic',[113,114,115,116,132,133,134,135],'伸缩小车动力柜内装行走/提升伺服驱动器与防坠电缸控制；抓斗动力柜一、二装抓斗开合与旋转驱动器。柜内元件只按资料表格示意。',[2.4,2.2,0])
 box(trolleyCab,[.8,.08,1.5],[2.15,7.1,0],'steelDark');
 box(trolleyCab,[.6,1.4,1.3],[2.15,7.84,0],'panel');
 box(trolleyCab,[.025,1.3,1.2],[2.47,7.84,0],'steel');
 box(trolleyCab,[.04,.2,.035],[2.49,7.85,.43],'steelDark');
 for(const y of [7.4,7.48,7.56])box(trolleyCab,[.035,.025,.9],[2.49,y,0],'steelDark');
 for(const z of [-.65,.05])box(trolleyCab,[.5,.55,.45],[-.7,7.42,z],'panel');

 // ---------------- 伸缩小车激光测距 -----------------------------------
 const trolleyLaser=part('trolley-laser','伸缩小车激光测距','telescopic',[85,96,103],'伸缩小车激光定位传感器（资料编号 B5）装在伸缩部装小车侧面，用于测量行走位置；模型只表示传感器与支架外形。',[1.4,.8,1.4])
 box(trolleyLaser,[.1,.32,.1],[.75,6.5,.75],'steelDark')
 box(trolleyLaser,[.16,.22,.14],[.75,6.24,.75],'panel')
 cylinder(trolleyLaser,.05,.06,[.75,6.11,.75],'steelDark','y',16)
 box(trolleyLaser,[.1,.06,.1],[.75,6.12,.75],'rubber')

 // ---------------- 伸缩小车提升伺服电机×2 ---------------------------------
 const hoistMotors=part('trolley-hoist-motors','伸缩小车提升伺服电机','telescopic',[113,114,119],'两台提升伺服电机（资料编号 M5/M6）经卷扬成对驱动伸缩提升；模型只示意外形与安装位置。',[0,1.2,0])
 for(const x of [-1.0,1.0]){
  box(hoistMotors,[.28,.26,.34],[x,7.15,.35],'steelDark')
  cylinder(hoistMotors,.12,.22,[x,7.0,.35],'steel','z',20)
  box(hoistMotors,[.2,.16,.2],[x,7.34,.35],'panel')
 }
 // ---------------- 滑环与分线盒 -----------------------------------------
 const slipRing=part('trolley-slip-ring','滑环','telescopic',[114,119],'伸缩小车提升卷扬滑环，供旋转部件馈电与信号；模型只示意外形。',[0,1.2,0])
 cylinder(slipRing,.12,.24,[0,7.72,0],'steelDark','y',20)
 box(slipRing,[.26,.08,.26],[0,7.6,0],'steel')
 const junctionBox=part('trolley-junction-box','分线盒','telescopic',[114,119],'伸缩小车分线盒，汇聚传感器与执行器线缆；模型只示意外形。',[1.2,1.2,0])
 box(junctionBox,[.3,.24,.18],[1.5,7.15,.6],'panel')
 box(junctionBox,[.02,.18,.12],[1.66,7.15,.6],'steelDark')
 // ---------------- 伸缩限位与高度限制 -----------------------------------
 const trolleyLimits=part('trolley-limit-switches','伸缩限位与高度限制','telescopic',[114,119,120],'伸缩小车限位开关（S3/S4）、伸缩臂上限位（S8）与起升高度限制器（S7）；模型只示意外形。',[0,1,0])
 for(const z of [-.85,.85])box(trolleyLimits,[.16,.22,.1],[1.6,6.6,z],'yellow')
 box(trolleyLimits,[.18,.16,.12],[.5,6.9,.3],'yellow')
 box(trolleyLimits,[.16,.18,.12],[.5,7.55,0],'yellow')

 // ---------------- 防坠电缸与到位传感器 ---------------------------------
 const antiFall=part('trolley-anti-fall','防坠电缸与到位传感器','telescopic',[114,124],'伸缩小车防坠电缸及其伸、缩到位传感器；模型只示意外形与安装位置，不含安全整定值。',[0,1,0])
 box(antiFall,[.16,.2,.16],[-.62,4.78,0],'steelDark')
 cylinder(antiFall,.04,.5,[-.62,4.45,0],'steel','y',16)
 for(const dz of [-.12,.12])box(antiFall,[.08,.1,.06],[-.62,4.2,dz],'yellow')
 // ---------------- 导轨电动加油器 ---------------------------------------
 const oiler=part('trolley-oiler','导轨电动加油器','telescopic',[114,129,167],'伸缩小车导轨电动加油器（资料编号 U1），定时润滑伸缩导轨；模型只示意外形。',[1.2,.8,0])
 box(oiler,[.18,.22,.14],[1.3,6.55,.7],'green')
 box(oiler,[.08,.12,.1],[1.3,6.72,.7],'steelDark')

 // ---------------- 抓斗本体 (回转支承与推杆) ---------------------------
 const grab=part('grab','抓斗本体与回转支承','grab',[132,133,136,138,139,141],'抓斗通过回转支承相对提升臂旋转，两台电动推杆带动颚板开合，起重量限制器给出负载反馈。模型的开合、旋转为演示，斗容、推杆行程和起重量限制值无资料依据。',[0,-.4,0])
 box(grab,[.95,.14,1.15],[0,-.07,0],'paintDark')
 for(const x of [-.38,.38])for(const z of [-.48,.48])box(grab,[.09,.36,.09],[x,-.27,z],'paint')
 box(grab,[1.0,.14,1.2],[0,-.47,0],'paintDark')
 cylinder(grab,.42,.1,[0,-.56,0],'yellow','y',24)
 cylinder(grab,.3,.12,[0,-.62,0],'steelDark','y',24)
 box(grab,[.5,.06,.08],[0,-.6,0],'yellow')
 box(grab,[.92,.12,1.12],[0,-.72,0],'paintDark')
 for(const x of [-.56,.56]){
  box(grab,[.18,.12,.3],[x,-.06,0],'paint');
  cylinder(grab,.10,.80,[x,.34,0],'paint','y',20);
  cylinder(grab,.115,.12,[x,.79,0],'steel','y',20);
  cylinder(grab,.09,.32,[x,1.00,0],'black','y',20);
  box(grab,[.15,.16,.12],[x,.57,-.14],'panel');
  rig.spindles.push(cylinder(grab,.035,.5,[x,-.31,0],'steel','y',12));
  tube(grab,[[x,-.56,0],[x*.8,-.62,.22],[x*.65,-.58,.30]],.025,'paint',10);
 }
 box(grab,[.2,.14,.14],[.34,-.35,-.42],'yellow')
 cylinder(grab,.05,.12,[.34,-.42,-.42],'brass','y',12)
 tube(grab,[[-.48,-.05,.42],[-.58,-.3,.6],[-.5,-.6,.72]],.012,'black')

 // ---------------- 抓斗颚板 -------------------------------------------
 const jaws=part('grab-jaws','抓斗颚板','grab',[138,139,140],'两片颚板绕顶部铰点开合，闭合时合成斗体；资料只说明电动推杆与上下限位，没有颚板角度、斗容和切割刃尺寸，模型中开合角度为示意。',[0,-.7,0])
 jawSetup()
 rig.jaws=jaws

 // ---------------- 抓斗伺服电机×2 + 旋转电机 -----------------------------
 const grabMotors=part('grab-motors','抓斗伺服电机','grab',[133,134,138,139],'两台抓斗伺服电机（M7/M8）驱动电动推杆开合；模型只示意外形与安装位置。',[0,-.4,0])
 for(const x of [-.56,.56]){
  box(grabMotors,[.18,.16,.2],[x,-.02,.3],'steelDark')
  cylinder(grabMotors,.06,.18,[x,-.12,.3],'steel','z',16)
  box(grabMotors,[.14,.1,.1],[x,.02,-.3],'panel')
 }
 const grabRotationMotor=part('grab-rotation-motor','抓斗旋转伺服电机','grab',[133,134,138],'抓斗旋转伺服电机（M9）驱动回转支承，实现0°/90°换向；模型只示意外形。',[0,-.4,0])
 box(grabRotationMotor,[.18,.14,.2],[0,-.56,-.45],'steelDark')
 cylinder(grabRotationMotor,.05,.12,[0,-.63,-.45],'steel','y',16)
 // ---------------- 推杆上下限位磁性开关 ---------------------------------
 const grabLimits=part('grab-limit-switches','电动推杆上下限位','grab',[133,140],'两组电动推杆的上下限位磁性开关（S1/S2/S3/S4）；模型只示意外形。',[0,-.4,0])
 for(const x of [-.56,.56])for(const y of [-.6,-.88])box(grabLimits,[.08,.05,.08],[x,y,.12],'yellow')
 // ---------------- 起重量限制器 -----------------------------------------
 const grabLoadLimiter=part('grab-load-limiter','起重量限制器','grab',[136,141],'抓斗起重量限制器（Q1），提供负载反馈；模型只示意外形。',[0,-.4,0])
 box(grabLoadLimiter,[.14,.12,.14],[.34,-.4,-.42],'panel')
 rig.grabAttached=[grabMotors,grabRotationMotor,grabLimits,grabLoadLimiter]

 function jawSetup(){
  rig.jawA=new THREE.Group();rig.jawA.position.set(0,-.56,0);jaws.add(rig.jawA)
  rig.jawB=new THREE.Group();rig.jawB.position.set(0,-.56,0);jaws.add(rig.jawB)
  buildJaw(rig.jawA,1)
  buildJaw(rig.jawB,-1)
 }
 function buildJaw(group,side){
  // Curved clamshell scoop, extruded side plates and open top (deck p96/p138).
  // Local profile coordinates are z/y; the hinge axis runs across bucket width.
  const outline=new THREE.Shape();outline.moveTo(0,0);outline.lineTo(side*.64,-.3);
  outline.quadraticCurveTo(side*.76,-.82,0,-.9);outline.closePath();
  for(const x of [-.48,.45]){
   const plate=new THREE.ExtrudeGeometry(outline,{depth:.03,bevelEnabled:false,curveSegments:18});
   plate.rotateY(-Math.PI/2);plate.translate(x,0,0);
   mesh(group,plate,'jaw');
  }
  const vertices=[],indices=[];
  for(let i=0;i<=18;i++){
   const t=i/18,z=side*((1-t)*(1-t)*.64+2*(1-t)*t*.76),y=(1-t)*(1-t)*-.3+2*(1-t)*t*-.82+t*t*-.9;
   vertices.push(-.48,y,z,.48,y,z);
   if(i<18){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const shell=mesh(group,geometry,'jaw');shell.name=side>0?'jaw-shell-north':'jaw-shell-south';
  box(group,[.98,.05,.06],[0,-.89,0],'steelDark');
  cylinder(group,.055,1.04,[0,0,0],'steel','x',16);
 }

 // ---------------- 梁内悬挂式周转小车 ---------------------------------
 const transferCar=part('transfer-car','梁内悬挂式周转小车','transfer',[94,95,96,109,143,144,145,158],'周转机构位于双主梁之间下方，两侧走轮贴合主梁内侧下翼缘，沿跨度方向行走；不在桥架外侧另加一条轨道。',[0,.8,0]);
 for(const side of [-1,1]){
  const x=side*1.30,inside=side*1.17;
  box(transferCar,[.18,.3,1.65],[inside,4.25,0],'paint');
  for(const z of [-.6,.6]){
   wheel(transferCar,.17,.12,[x,4.93,z],'steelDark','x');
   box(transferCar,[.06,.65,.2],[inside,4.61,z],'paint');
   cylinder(transferCar,.06,.28,[side*1.22,4.93,z],'steel','x',12);
  }
  cylinder(transferCar,.13,.42,[inside,4.32,.9],'steelDark','z');
  box(transferCar,[.24,.25,.2],[inside,4.32,.65],'paint');
 }
 // Paired side carriages leave a central passage for the raised grab/mast.
 // Do not insert an invented cross-member through that transfer passage.

 const transferHoist=part('transfer-hoist','双侧卷扬与剪叉提升','transfer',[144,145,149,158,159],'两侧卷扬与剪叉导向连接悬挂小车和翻转吊具。提升时固定上架保持水平，剪叉与绳长随升降变化。',[0,.6,0]);
 for(const x of [-.94,.94]){
  cylinder(transferHoist,.2,.55,[x,4.43,0],'paintDark','z');
  for(const z of [-.32,.32])cylinder(transferHoist,.25,.06,[x,4.43,z],'paint','z');
 }
 rig.scissors=[];
 rig.scissorJoints=[];
 for(const x of [-1.22,1.22])for(let stage=0;stage<3;stage++)for(const direction of [-1,1]){
  const arm=box(transferHoist,[.09,1,.1],[0,0,0],'paint');
  rig.scissors.push({object:arm,x,direction,stage});
 }
 for(const x of [-1.22,1.22])for(let stage=0;stage<=3;stage++)for(const z of [-.65,.65]){
  const joint=cylinder(transferHoist,.065,.16,[x,0,z],'paintDark','x',12);
  rig.scissorJoints.push({object:joint,stage});
 }
 for(const corner of [[1.0,.55],[-1.0,.55],[1.0,-.55],[-1.0,-.55]]){
  rig.transferRopes.push({object:rope(transferHoist,[corner[0],DIM.transferHoistFrameY,corner[1]],[corner[0],DIM.transferFixtureTopY,corner[1]]),corner});
 }

 // ---------------- 周转动力柜 -----------------------------------------
 const transferCab=part('transfer-cabinet','周转动力柜','transfer',[142,143,144,145],'周转动力柜一、二装行走与提升伺服驱动器及 24V 电源；柜体位置按资料描述的桥架平台布置，尺寸为示意。',[2.2,1.2,0])
 for(const z of [-5.3,5.3]){
  box(transferCab,[.5,1.0,.45],[2.6,6.49,z],'paint')
  box(transferCab,[.03,.9,.32],[2.32,6.49,z],'paintDark')
  box(transferCab,[.08,.35,.08],[2.6,7.09,z],'steelDark')
 }

 // ---------------- 周转小车激光测距 -----------------------------------
 const transferLaser=part('transfer-laser','周转小车激光测距','transfer',[85,145,158],'周转小车两侧的激光定位传感器（资料编号 B6/B7，分别测量上甑侧与窖池侧）装在小车两侧，模型中朝两侧反光板方向示意。',[0,.8,1.6])
 for(const z of [-.95,.95]){
  box(transferLaser,[.08,.12,.26],[1.1,4.25,Math.sign(z)*.84],'steelDark')
  box(transferLaser,[.14,.18,.12],[1.1,4.35,z],'panel')
  cylinder(transferLaser,.05,.05,[1.1,4.35,z+(z>0?.09:-.09)],'steelDark','z',16)
  box(transferLaser,[.08,.24,.08],[1.1,4.5,z],'steelDark')
 }

 // ---------------- 周转小车行走/提升伺服电机 ---------------------------
 const transferDriveMotors=part('transfer-drive-motors','周转小车行走伺服电机','transfer',[143,144,145,159],'两侧周转小车行走伺服电机（成对驱动，A9/A10）；模型只示意外形与安装位置。',[0,.8,0])
 for(const x of [-1.17,1.17]){
  box(transferDriveMotors,[.22,.22,.26],[x,4.32,.65],'steelDark')
  cylinder(transferDriveMotors,.09,.2,[x,4.22,.65],'steel','z',16)
  box(transferDriveMotors,[.16,.16,.14],[x,4.5,.65],'panel')
 }
 const transferHoistMotors=part('transfer-hoist-motors','周转小车提升伺服电机','transfer',[143,144,159],'两侧周转小车提升伺服电机（成对驱动，A11/A12）；模型只示意外形与安装位置。',[0,.6,0])
 for(const x of [-.94,.94]){
  box(transferHoistMotors,[.22,.22,.3],[x,4.72,0],'steelDark')
  cylinder(transferHoistMotors,.1,.2,[x,4.62,0],'steel','z',16)
 }
 // ---------------- 周转限位与限重 --------------------------------------
 const transferHoistLimits=part('transfer-hoist-limits','卷扬起升高度限制器','transfer',[143,144,158],'两侧卷扬机起升高度限制器（S8/S9）；模型只示意外形。',[0,.6,0])
 for(const x of [-.94,.94])box(transferHoistLimits,[.14,.14,.1],[x,4.86,.4],'yellow')
 const transferLimitSwitches=part('transfer-limit-switches','周转小车行程开关','transfer',[143,145,158],'周转小车南北行程开关（S5/S6）；模型只示意外形。',[0,.8,0])
 for(const z of [-.8,.8])box(transferLimitSwitches,[.16,.2,.1],[1.3,4.3,z],'yellow')
 const transferLoadLimiters=part('transfer-load-limiters','起重量限制器','transfer',[143,144,160],'两侧起重量限制器（XZQ1/XZQ2）；模型只示意外形。',[0,.6,0])
 // Load cells mount beside the paired hoists, leaving the raised grab passage
 // open. The old centre-line boxes intersected the telescopic mast on receipt.
 for(const x of [-1.03,1.03]){
  box(transferLoadLimiters,[.16,.14,.14],[x,4.6,-.44],'panel')
  box(transferLoadLimiters,[.16,.04,.12],[x,4.51,-.37],'paint')
 }

 // ---------------- 周转翻转吊具 ---------------------------------------
 const turnover=part('turnover-flip','周转翻转吊具','turnover',[94,96,147,148,149,151,152],'提升吊架保持水平，翻转由内框绕两侧水平支承轴完成；四组推杆与插销夹持周转斗。翻转角度为演示值，未代入控制器限位。',[0,-1,0]);
 for(const x of [-1.15,1.15])box(turnover,[.16,.55,1.65],[x,-.28,0],'paint');
 for(const z of [-.72,.72])box(turnover,[2.45,.16,.16],[0,-.1,z],'paint');
 rig.flipFrame=new THREE.Group();rig.flipFrame.position.y=-.42;turnover.add(rig.flipFrame);
 for(const x of [-.92,.92]){
  box(rig.flipFrame,[.1,.1,1.4],[x,-.2,0],'paint');
  for(const z of [-.55,.55])cylinder(rig.flipFrame,.035,.3,[x,-.06,z],'steel','y',12);
 }
 for(const z of [-.65,.65])box(rig.flipFrame,[1.9,.1,.1],[0,-.2,z],'paint');
 for(const x of [-1.15,1.15])cylinder(turnover,.16,.2,[x,-.42,0],'paint','x');
 box(turnover,[.35,.3,.4],[1.42,-.42,0],'paint');
 rig.turnover=turnover;

 // Removable stainless transfer bin, confirmed by the user's real photos.
 const hopper=part('transfer-hopper','周转料斗','turnover',[94,96,149],'周转吊具内携带的不锈钢料斗，随内框翻转；可切换显示空吊具。外形与安装关系参考用户实物照，容量和尺寸为示意。',[0,-1.8,0]);
 // The side trunnions pass through the bin centre, not its top. This keeps
 // the rectangular bin inside the outer frame throughout a 180-degree flip.
 box(hopper,[1.72,.06,1.10],[0,-.33,0],'panel');
 for(const x of [-.85,.85])box(hopper,[.06,.06,1.14],[x,.32,0],'steel');
 for(const z of [-.55,.55])box(hopper,[1.75,.06,.06],[0,.32,z],'steel');
 const corners=[[-.83,.29,-.52],[.83,.29,-.52],[.83,.29,.52],[-.83,.29,.52],[-.83,-.30,-.52],[.83,-.30,-.52],[.83,-.30,.52],[-.83,-.30,.52]];
 for(let i=0;i<4;i++){
  const j=(i+1)%4,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...corners[i],...corners[j],...corners[j+4],...corners[i+4]],3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();mesh(hopper,g,'jaw');
 }
 rig.hopper=hopper;

 // ---------------- 周转翻转附件：推杆/插销/翻转电机/步进/加油器/水平仪 -----
 const turnoverPushrods=part('turnover-pushrods','四组电动推杆','turnover',[147,148,151],'周转吊具四组电动推杆，夹持周转斗；模型只示意外形与安装位置。',[0,-1,0])
 for(const x of [-.92,.92])for(const z of [-.55,.55]){
  box(turnoverPushrods,[.1,.1,.14],[x,-.18,z],'paint')
  cylinder(turnoverPushrods,.03,.16,[x,-.24,z],'steel','z',12)
 }
 const turnoverPinSwitches=part('turnover-pin-switches','插销接近开关','turnover',[148,151],'四组插销接近开关（B1–B4），反馈插销到位；模型只示意外形。',[0,-1,0])
 for(const x of [-.98,.98])for(const z of [-.4,.4])box(turnoverPinSwitches,[.06,.06,.1],[x,-.42,z],'yellow')
 const turnoverFlipMotor=part('turnover-flip-motor','周转翻转伺服电机','turnover',[147,164],'周转翻转伺服电机，驱动内框双向翻转（A13/A14）；模型只示意外形。',[0,-1,0])
 box(turnoverFlipMotor,[.2,.16,.22],[1.42,-.42,-.3],'steelDark')
 cylinder(turnoverFlipMotor,.06,.14,[1.42,-.34,-.3],'steel','z',16)
 const turnoverStepper=part('turnover-stepper','步进电机与推杆','turnover',[147,156,166],'步进电机与步进推杆伸缩到位传感器；模型只示意外形。',[0,-1,0])
 box(turnoverStepper,[.16,.16,.2],[0,-.3,.83],'steelDark')
 for(const dz of [-.08,.08])box(turnoverStepper,[.05,.08,.05],[0,-.22,.85+dz],'yellow')
 const turnoverOiler=part('turnover-oiler','电动加油器','turnover',[167],'周转翻转电动加油器；模型只示意外形。',[0,-1,0])
 box(turnoverOiler,[.14,.16,.12],[-1.30,-.3,.55],'green')
 const turnoverLevel=part('turnover-level-sensor','水平仪','turnover',[168],'周转翻转水平仪，反馈吊架水平；模型只示意外形。',[0,-1,0])
 box(turnoverLevel,[.18,.08,.12],[0,-.28,-.73],'panel')
 rig.turnoverAttached=[turnoverFlipMotor,turnoverOiler]
 rig.turnoverRotating=[turnoverPushrods,turnoverPinSwitches,turnoverStepper,turnoverLevel]
 // Clamping and sensing attachments belong to the rotating cradle (deck
 // p151/152). Keep them separate root parts for the exploded assembly, but
 // rebase their local coordinates to the same trunnion as the bin.
 for(const attached of rig.turnoverRotating)for(const child of attached.children)child.position.y+=.42

 // ---------------- 2D 激光扫描云台 ------------------------------------
 const gimbal=part('laser-gimbal','2D 激光扫描云台','turnover',[148,149,155,165,166],'2D 激光扫描仪装在独立伺服云台上，对应程序独立A15轴；演示0—90°换位，安装偏置与实际极限仍取决于现场配置，扫描扇面为示意。',[1.2,.8,2.4])
 // Deck p165/167 shows the vertical bearing and hanging scanner on the
 // rotating cradle. The independent scan axis rotates within this carrier.
 box(gimbal,[.45,.08,.35],[.8,-.05,-.95],'yellow')
 cylinder(gimbal,.12,.18,[.8,-.18,-1.06],'steel','y',20)
 rig.scanner=new THREE.Group();rig.scanner.position.set(.8,-.3,-1.06);gimbal.add(rig.scanner)
 box(rig.scanner,[.2,.16,.16],[0,0,0],'steelDark')
 cylinder(rig.scanner,.13,.2,[0,-.16,0],'black','x',20)
 cylinder(rig.scanner,.06,.05,[0,-.26,0],'steel','y',16)
 box(rig.scanner,[.12,.09,.08],[0,-.2,.14],'green')
 const fan=new THREE.BufferGeometry();fan.setAttribute('position',new THREE.Float32BufferAttribute([0,-.26,0,-1.1,-1.3,0,1.1,-1.3,0],3));fan.computeVertexNormals();mesh(rig.scanner,fan,'scan')
 for(const child of gimbal.children){child.position.y+=.42;child.position.z-=.09}
 rig.gimbal=gimbal

 // ---------------- 激光测距网关 (SIG200) ------------------------------
 const gateway=part('laser-gateway','激光测距网关','positioning',[84,85,86,87,102,107],'激光测距网关（资料标注 SIG200）汇接伸缩小车与周转小车的激光传感器，ProfiNET 组网。模型只表示设备与安装位置，不复制 IP 地址、PN 名称或调试报文。',[-2.6,.6,-1.6])
 box(gateway,[.18,.55,.14],[-2.62,5.15,-1.6],'blue')
 for(let index=0;index<4;index++)cylinder(gateway,.045,.05,[-2.62,5.32-index*.11,-1.66],'steel','z',12)
 box(gateway,[.1,.16,.42],[-2.5,5.0,-1.6],'steelDark')
 tube(gateway,[[-2.62,5.4,-1.66],[-2.5,5.5,-1.4],[-2.2,5.35,-1.2]],.012,'black')

 // ---------------- 大车定位读码相机(南)与读码传感器(北) -----------------
 // 资料第95页：读码相机在南侧、读码传感器在北侧，二者配对读取地面代码条。
 const reader=part('code-reader','大车定位读码相机','positioning',[88,89,90,95,104,105],'大车南侧读码相机，与北侧读码传感器配对读取地面代码条定位；模型只表示相机、光源与支架外形，不复制相机参数或代码格式。',[-2.8,.8,-1.2])
 box(reader,[.1,.6,.1],[-2.05,4.3,-1.6],'steelDark')
 box(reader,[.18,.16,.32],[-2.05,3.9,-1.6],'panel')
 cylinder(reader,.055,.08,[-2.05,3.8,-1.6],'steelDark','y',16)
 box(reader,[.4,.03,.06],[-2.05,3.78,-1.6],'white')
 const readerNorth=part('read-code-sensor','大车定位读码传感器','positioning',[95,96,104,105],'大车北侧读码传感器，与南侧读码相机配对；模型只表示传感器与支架外形。',[-2.8,.8,1.2])
 box(readerNorth,[.1,.6,.1],[-2.05,4.3,1.6],'steelDark')
 box(readerNorth,[.14,.12,.2],[-2.05,4.15,1.6],'panel')
 box(readerNorth,[.08,.5,.08],[-2.05,4.45,1.6],'steelDark')
 box(readerNorth,[.4,.03,.06],[-2.05,3.78,1.6],'white')

 // ---------------- 行车平台大灯 -----------------------------------------
 const platformLights=part('platform-lights','行车平台大灯','bridge',[94],'行车平台两端各一盏大灯，供夜间检修照明；模型仅按外形示意。',[0,1.6,0])
 for(const z of [-8.6,8.6]){
  box(platformLights,[.3,.18,.22],[2.2,6.9,z],'steelDark')
  mesh(platformLights,new THREE.SphereGeometry(.14,16,12),'lamp',2.2,6.98,z)
 }
 // ---------------- 安全门开关 -------------------------------------------
 const doorSwitches=part('safety-door-switches','安全门开关','bridge',[94,99],'南北检修门各一只安全门开关，常闭触点接入安全回路；模型只示意外形与安装位置。',[0,1.4,2.6])
 for(const z of [-10.2,10.2]){
  box(doorSwitches,[.14,.2,.1],[2.3,3.95,z],'yellow')
  box(doorSwitches,[.05,.14,.05],[2.42,3.95,z],'steelDark')
 }
 // ---------------- 监控摄像头 -------------------------------------------
 const camera=part('camera','监控摄像头','bridge',[94],'行车平台摄像头，监视吊具与作业区域；模型只按外形示意，不包含网络参数。',[0,1.2,2])
 box(camera,[.14,.14,.2],[0,6.7,4.6],'white')
 box(camera,[.06,.1,.12],[0,6.62,4.72],'steelDark')
 cylinder(camera,.04,.3,[0,6.56,4.6],'steelDark','y',16)

 // ---------------- pose rig: which parts follow which demonstration axis --
 rig.grab=grab
 rig.jaws=jaws
 rig.travel=[collector,girder,walkway,endSouth,endNorth,travelMotors,cabinet,alarm,limits,chains,wireless,gateway,reader,readerNorth,platformLights,doorSwitches,camera,transferCab]
 rig.trolley=[frame,drive,mast,trolleyCab,trolleyLaser,hoistMotors,slipRing,junctionBox,trolleyLimits,antiFall,oiler,grab,jaws]
 rig.transfer=[transferCar,transferHoist,transferLaser,transferDriveMotors,transferHoistMotors,transferHoistLimits,transferLimitSwitches,transferLoadLimiters]

 const model={root,parts,materials,rig,dimensions:DIM}
 applyCranePose(model,{})
 return model
}

// Apply one normalised demonstration pose to an existing model. The viewer may
// call this every animation frame, so every write below is absolute: positions
// are assigned, never accumulated. Unknown or non-finite values fall back to the
// rest pose used by crane-state.mjs (travel .5, trolley .2, hoist 0, rotation 0,
// grip 0, transfer .8, transferHoist 0, flip 0, scan 0).
export function applyCranePose(model,pose,{workshop=false}={}){
 if(!model||!model.rig)throw new Error('applyCranePose expects the object returned by buildCraneModel')
 const rig=model.rig
 const input=cranePose(pose||{})
 const travel=clampUnit(input.travel,.5)
 const trolley=clampUnit(input.trolley,.5)
 const hoist=clampUnit(input.hoist,0)
 const rotation=clampUnit(input.rotation,0)
 const grip=clampUnit(input.grip,0)
 const transfer=clampUnit(input.transfer,.5)
 const transferHoist=clampUnit(input.transferHoist,0)
 const flip=input.flip

 const travelX=(travel-.5)*DIM.travelDisplay
 const trolleyZ=(trolley-.5)*DIM.trolleyDisplay
 const transferZ=(transfer-.5)*DIM.transferDisplay
 const stroke=DIM.mastExtension+(workshop?1.5:0)
 const grabTop=DIM.mastRetractedBottom-stroke*hoist
 const fixtureTop=DIM.transferFixtureTopY-DIM.transferHoistDisplay*transferHoist
 const yaw=rotation*Math.PI/2
 const jawOpen=.5*grip
 const flipAngle=flip*Math.PI

 for(const partObject of rig.travel)partObject.position.set(travelX,0,0)
 for(const partObject of rig.trolley)partObject.position.set(travelX,0,trolleyZ)
 for(const partObject of rig.transfer)partObject.position.set(travelX+DIM.transferRailX,0,transferZ)

 rig.turnover.position.set(travelX+DIM.transferRailX,fixtureTop,transferZ)
 rig.turnover.rotation.z=0
 rig.flipFrame.rotation.z=flipAngle
 rig.hopper.position.set(travelX,fixtureTop-.42,transferZ)
 rig.hopper.rotation.z=flipAngle
 rig.gimbal.position.copy(rig.hopper.position)
 rig.gimbal.rotation.z=flipAngle
 for(const attached of rig.turnoverAttached){attached.position.copy(rig.turnover.position);attached.rotation.z=0}
 for(const attached of rig.turnoverRotating){attached.position.copy(rig.hopper.position);attached.rotation.z=flipAngle}
 rig.scanner.rotation.y=input.scan*Math.PI/2

 rig.grab.position.set(travelX,grabTop,trolleyZ)
 rig.grab.rotation.y=yaw
 rig.jaws.position.copy(rig.grab.position)
 rig.jaws.rotation.y=yaw
 for(const attached of rig.grabAttached){attached.position.copy(rig.grab.position);attached.rotation.y=yaw}
 rig.jawA.rotation.x=-jawOpen
 rig.jawB.rotation.x=jawOpen

 // 三节伸缩臂：第二节与第三节各下移 1.5 m 行程比例，两节都挂在上一节上，
 // 因此最内节底端始终等于抓斗顶部，演示中不会出现断开的悬空结构。
 rig.stage2.position.y=-stroke/2*hoist
 rig.stage3.position.y=-stroke/2*hoist
 rig.drum.rotation.x=hoist*Math.PI*4
 const rodLength=.85+1.1*hoist
 rig.antiFallRod.scale.y=rodLength/.7
 rig.antiFallRod.position.y=5.2-rodLength/2
 for(const spindle of rig.spindles){
  const length=.5+.22*grip
  spindle.scale.y=length/.5
  spindle.position.y=-.06-length/2
 }

 // 四根钢丝绳从车架四角附近垂直下到抓斗顶部；抓斗旋转时钢丝绳不跟着转，
 // 绳长只由提升行程决定，避免绳子穿入伸缩臂或主梁。
 for(const ropeEntry of rig.grabRopes){
  positionRope(ropeEntry.object,[ropeEntry.corner[0],DIM.trolleyUnderside,ropeEntry.corner[1]],[ropeEntry.corner[0],grabTop,ropeEntry.corner[1]])
 }

 // Suspension eyes stay on the level outer frame; only the inner cradle flips.
 for(const ropeEntry of rig.transferRopes){
  const [x,z]=ropeEntry.corner;
  positionRope(ropeEntry.object,[x,DIM.transferHoistFrameY,z],[x,fixtureTop,z]);
 }
 for(const arm of rig.scissors){
  const step=(DIM.transferHoistFrameY-fixtureTop)/3;
  positionRope(arm.object,[arm.x,DIM.transferHoistFrameY-arm.stage*step,arm.direction*.65],[arm.x,DIM.transferHoistFrameY-(arm.stage+1)*step,-arm.direction*.65]);
 }
 for(const joint of rig.scissorJoints)joint.object.position.y=DIM.transferHoistFrameY-(DIM.transferHoistFrameY-fixtureTop)*joint.stage/3;
 return model
}

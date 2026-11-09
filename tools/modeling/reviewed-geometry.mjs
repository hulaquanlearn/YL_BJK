// Category geometry for visual identification. Only explicit dimensions supplied
// by the reviewed plan are dimensional references; details remain illustrative.
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
import {mergeGeometries} from '../../spare-parts-web-release/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'
import {createIdentityGeometry} from './identity-geometry.mjs'
const colors={steel:0xaeb7bf,bright:0xd0d6dc,dark:0x303840,blue:0x356681,white:0xdde2e5,brass:0xb59b68}
const mat=c=>new T.MeshStandardMaterial({color:colors[c]??c,metalness:['steel','bright','brass'].includes(c)?.72:.12,roughness:c==='bright'?.32:.53})
function add(g,geo,c,p=[0,0,0],r=[0,0,0],part=['body','主体','用于辨认外部主体，具体尺寸以厂家资料为准。']){const m=new T.Mesh(geo,mat(c));m.position.set(...p);m.rotation.set(...r);m.name=part[1];m.userData.observation={schema:1,id:part[0],name:part[1],description:part[2]};g.add(m);return m}
const box=(g,w,h,d,c,p,part,r)=>add(g,new T.BoxGeometry(w,h,d),c,p,r,part)
const cyl=(g,r,h,c,p,part,rot=[0,0,Math.PI/2],sides=32)=>add(g,new T.CylinderGeometry(r,r,h,sides),c,p,rot,part)
function ring(g,ri,ro,w,c,p,part,axis='z',gap=0){const b=Math.min((ro-ri)*.13,w*.08),h=w/2;const points=[[ri+b,-h],[ro-b,-h],[ro,-h+b],[ro,h-b],[ro-b,h],[ri+b,h],[ri,h-b],[ri,-h+b],[ri+b,-h]].map(v=>new T.Vector2(...v));return add(g,new T.LatheGeometry(points,64,gap/2,Math.PI*2-gap),c,p,axis==='x'?[0,0,Math.PI/2]:axis==='y'?[0,0,0]:[Math.PI/2,0,0],part)}
const part=(id,name,description)=>[id,name,description]
const hole=(s,x,y,r)=>{const h=new T.Path();h.absarc(x,y,r,0,Math.PI*2,true);s.holes.push(h)}
function plate(g,w,h,d,c,p,holes,part,oval=false){const s=new T.Shape();if(oval)s.absellipse(0,0,w/2,h/2,0,Math.PI*2,false);else{s.moveTo(-w/2,-h/2);s.lineTo(w/2,-h/2);s.lineTo(w/2,h/2);s.lineTo(-w/2,h/2);s.closePath()}for(const[x,y,r]of holes)hole(s,x,y,r);const geo=new T.ExtrudeGeometry(s,{depth:d,steps:1,bevelEnabled:false,curveSegments:32});geo.translate(0,0,-d/2);return add(g,geo,c,p,undefined,part)}

export function bearing({bore=0.5,outer=1,width=.26,type='roller'}={}){
 const g=new T.Group(),ri=bore/2,ro=outer/2,wall=(ro-ri)*.24,orbit=(ri+ro)/2
 ring(g,ro-wall,ro,width,'steel',[0,0,0],part('outer','外圈','外侧环件与座孔配合，内侧滚道承接滚动体载荷。'))
 ring(g,ri,ri+wall,width,'bright',[0,0,0],part('inner','内圈','内圈通过贯通轴孔与轴配合，滚道与滚动体接触。'))
 const double=type!=='ball',rows=double?[-1,1]:[0],radius=(ro-ri)*.23,count=type==='roller'?18:12
 for(const row of rows){const z=row*width*.235
  for(let i=0;i<count;i++){const a=i*Math.PI*2/count,p=[Math.sin(a)*orbit,Math.cos(a)*orbit,z]
   if(type==='roller'){
    const length=width*.39,profile=[[0,-length/2],[radius*.74,-length/2],[radius*.96,-length*.22],[radius,0],[radius*.96,length*.22],[radius*.74,length/2],[0,length/2]].map(v=>new T.Vector2(...v))
    const m=add(g,new T.LatheGeometry(profile,16),'bright',p,undefined,part('rolling','双列滚子','两列鼓形滚子传递载荷；数量、滚道曲线及保持架细节为示意。'))
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.sin(a)*row*.12,Math.cos(a)*row*.12,1).normalize())
   }else add(g,new T.SphereGeometry(radius,16,12),'bright',p,undefined,part('rolling',double?'双列滚珠':'滚珠','滚珠在内外圈之间滚动。示意数量与实际产品可能不同。'))
  }
  // Narrow cage rails leave rolling bodies visible rather than filling the race.
  ring(g,orbit-radius*.28,orbit+radius*.28,width*.035,'brass',[0,0,z-width*.14],part('cage','保持架','保持架分隔和引导滚动体，此处仅表达基本位置关系。'))
 }
 return g
}

function motor(g,offset=[0,0,0],scale=1){const m=new T.Group();m.position.set(...offset);m.scale.setScalar(scale);g.add(m)
 cyl(m,.28,.72,'blue',[0,.39,0],part('motor-case','电机机壳','电机外壳保护内部定子、转子；内部电磁结构没有展开。'))
 for(let i=0;i<12;i++){const a=i*Math.PI/6;box(m,.66,.055,.025,'blue',[0,.39+Math.cos(a)*.284,Math.sin(a)*.284],part('motor-fins','散热筋','轴向散热筋增加机壳表面积，辅助电机散热。'),[a,0,0])}
 cyl(m,.29,.14,'dark',[-.43,.39,0],part('fan-cover','风罩','风罩保护后部冷却风扇；通风开口为简化示意。'))
 for(let i=0;i<8;i++)box(m,.01,.39,.025,'steel',[-.506,.39,0],part('fan-cover','风罩','后部冷却风扇防护罩。'),[i*Math.PI/8,0,0])
 cyl(m,.075,.27,'steel',[.49,.39,0],part('shaft','输出轴','输出轴与负载或减速机输入连接并传递转矩。'))
 box(m,.24,.18,.24,'blue',[0,.76,0],part('terminal','接线盒','接线盒容纳电气接线，端子与接线方式需核对铭牌。'))
 for(const x of [-.23,.23])box(m,.18,.09,.65,'blue',[x,.06,0],part('feet','安装底脚','安装底脚用于将电机固定在基础或支架上。'))
 return m
}
function sleeve(){const g=new T.Group(),p=part('sleeve','开口锥套','锥套有贯通轴孔和轴向开口，通过锁紧件将轴承固定在轴上。')
 const profile=[[.27,-.32],[.36,-.32],[.40,.23],[.30,.23],[.27,-.32]].map(v=>new T.Vector2(...v));add(g,new T.LatheGeometry(profile,64,.025,Math.PI*2-.05),'steel',[0,0,0],[Math.PI/2,0,0],p)
 ring(g,.27,.43,.12,'bright',[0,0,.28],part('locknut','锁紧螺母','螺母在螺纹端锁紧锥套，外形为结构示意。'))
 ring(g,.27,.46,.024,'steel',[0,0,.202],part('washer','止动垫圈','止动垫圈用于防止锁紧螺母松动。'))
 for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,.065,.025,.05,'dark',[Math.sin(a)*.425,Math.cos(a)*.425,.29],part('locknut','锁紧螺母','螺母外缘的槽口用于操作锁紧件。'),[0,0,-a])}
 return g
}
function housing({style='pillow',withBearing=true}={}){const g=new T.Group(),ri=.19,ro=.34
 if(style==='square'||style==='oval'){
  const oval=style==='oval',bolts=oval?[[-.49,0],[.49,0]]:[[-.38,-.38],[.38,-.38],[-.38,.38],[.38,.38]]
  plate(g,oval?1.25:1.02,oval?.65:1.02,.13,'blue',[0,.6,0],[[0,0,ri],...bolts.map(([x,y])=>[x,y,.07])],part('housing','法兰座体',oval?'椭圆两孔法兰座，中心为贯通轴孔。':'方形四孔法兰座，中心为贯通轴孔。'),oval)
  ring(g,ri,ro,.27,'blue',[0,.6,.07],part('housing','法兰座体','环形座体支承轴承，安装外形与底座式轴承座不同。'))
 }else{
  plate(g,1.35,.48,.19,'blue',[0,.1,0],[[-.51,0,.07],[.51,0,.07]],part('base','底座','底座两侧用于安装固定，孔距以具体型号资料为准。')).rotation.x=Math.PI/2
  if(style==='split'){
   for(const [id,start]of[['lower',Math.PI],['cap',0]]){
    const shape=new T.Shape();shape.absarc(0,0,ro,start,start+Math.PI,false);shape.lineTo(Math.cos(start+Math.PI)*ri,Math.sin(start+Math.PI)*ri);shape.absarc(0,0,ri,start+Math.PI,start,true);shape.closePath()
    add(g,new T.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:false,curveSegments:32}),'blue',[0,.52,-.21],undefined,part(id,id==='cap'?'上盖':'下座','剖分轴承座由上盖与下座组成；紧固孔及内部座面为简化示意。'))
   }
   for(const x of [-.39,.39]){box(g,.16,.30,.42,'blue',[x,.39,0],part('lower','下座','下座连接底座，承接轴承座载荷。'));cyl(g,.06,.20,'steel',[x,.62,0],part('bolts','合盖螺栓','螺栓将上盖与下座固定在一起。'),[0,0,0])}
  }else{
   ring(g,ri,ro,.38,'blue',[0,.52,0],part('housing','座体','整体立式座体支承轴承，中心保留贯通轴孔。'))
   for(const x of [-.23,.23])box(g,.15,.32,.35,'blue',[x,.27,0],part('housing','座体','座体两侧的支承部分连接到底座。'))
  }
 }
 const y=style==='square'||style==='oval'?.6:.52
 if(withBearing){ring(g,.15,.205,.44,'bright',[0,y,.05],part('inner','轴承内圈','内圈的贯通孔用于与轴配合。'));ring(g,.205,.28,.06,'dark',[0,y,.25],part('seal','轴承密封面','密封面保护轴承内部，未展开内部滚动体。'))}
 else ring(g,.19,.27,.045,'dark',[0,y,.23],part('seal','密封位置','表示轴承座端部的密封位置，内部轴承未展开。'))
 return g
}
function cylinder({bore=50,stroke=200}={}){const g=new T.Group(),r=bore/2000,L=(stroke+bore*.7)/1000,e=bore*.45/1000,cy=r*1.4,w=r*2.7
 cyl(g,r,L,'steel',[0,cy,0],part('barrel','缸筒','缸筒容纳活塞，缸径及行程来自型号；外部长度及安装附件仍为示意。'))
 for(const x of[-L/2,L/2]){box(g,e,w,w,'steel',[x,cy,0],part('caps','端盖','前后端盖与缸筒连接，前盖导向活塞杆。'));ring(g,r*.25,r*.5,e*.3,'dark',[x,cy,0],part('guide','导向密封','活塞杆导向与密封所在部位。'),'x');cyl(g,r*.23,e*.45,'brass',[x,cy+w*.6,0],part('ports','气口','气口连接供气回路，两端进排气驱动活塞。'),[0,0,0])}
 for(const y of[-1,1])for(const z of[-1,1])cyl(g,r*.075,L+e,'bright',[0,cy+y*w*.38,z*w*.38],part('ties','四根拉杆','四根拉杆连接并紧固前后端盖。'))
 const extension=Math.max(bore*.5,Math.min(stroke*.32,bore*2))/1000
 cyl(g,r*.3,extension+e,'bright',[L/2+e/2+extension/2,cy,0],part('rod','活塞杆','活塞杆将活塞的直线运动传递给外部机构；伸出量为展示姿态。'))
 return g
}
function reducer({series='R',hasMotor=false,hasCoupling=false,tandem=false}={}){const g=new T.Group(),rightAngle=/^[KS]/.test(series),parallel=/^F/.test(series),hollow=/A/.test(series)
 const body=new T.Shape();body.moveTo(-.43,0);body.lineTo(.43,0);body.lineTo(.43,.55);body.lineTo(.27,.85);body.lineTo(-.3,.85);body.lineTo(-.43,.55);body.closePath()
 // A-type output is a hollow shaft, so the bore has to read as a hole through
 // the housing; a blind cap would contradict the category. Bore diameter,
 // keyway and shrink-disc detail are still unreviewed.
 if(hollow&&rightAngle){const bore=new T.Path();bore.absarc(0,.42,.085,0,Math.PI*2,true);body.holes.push(bore)}
 add(g,new T.ExtrudeGeometry(body,{depth:parallel?.72:.55,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025}),'blue',[0,.08,-.275],undefined,part('gearbox','减速箱体','箱体容纳齿轮并支承轴系，内部齿轮未展开；外廓及孔位为系列识别示意。'))
 for(const x of [-.32,.32])box(g,.24,.10,.76,'blue',[x,.05,0],part('feet','安装底脚','底脚用于将减速机固定在安装面，具体安装尺寸以厂家资料为准。'))
 // Seat the output flange on the housing face instead of leaving it floating.
 const axis=rightAngle?'z':'x',p=rightAngle?[0,.5,.325]:[.48,parallel?.72:.46,0]
 ring(g,.085,.29,.10,'blue',p,part('output','输出端','输出端与负载连接；不同系列的输入、输出轴方向不同。'),axis)
 if(hollow){
  const shaft=ring(g,.085,.15,.18,'bright',p,part('shaft','空心输出端','A类结构以空心输出端示意，键槽、收缩盘等细节未校核。'),axis)
  shaft.userData.hollowShaft={schema:1,throughBore:rightAngle,boreDiameterMm:170,note:rightAngle?'按A型空心轴结构开出贯通示意孔；孔径、键槽与收缩盘仍需厂家图纸核对。':'平行轴型端面已贴靠箱体，贯通孔未建模，需图纸核对。'}
 }
 else cyl(g,.085,.38,'bright',p,part('shaft','输出轴','实心输出轴传递减速后的转矩。'),axis==='x'?[0,0,Math.PI/2]:[Math.PI/2,0,0])
 for(let i=0;i<6;i++)box(g,.035,.43,.025,'blue',[-.29+i*.115,.39,-.3],part('gearbox','减速箱体','箱体的加强筋与分合面为外观示意。'))
 if(/^RF|AF|SAF/.test(series))ring(g,.085,.37,.055,'blue',[.45,.46,0],part('flange','安装法兰','法兰用于连接安装面；螺栓孔尺寸以厂家图纸为准。'),'x')
 let input=-.57
 if(tandem){box(g,.45,.44,.45,'blue',[-.74,.46,0],part('second','前级减速箱','型号中列出两级箱体组合，具体接口与空间尺寸仍需核对。'));input=-1.06}
 ring(g,.07,.23,.15,'steel',[input,.46,0],part('input','输入接口','输入接口连接电机或联轴器。'),'x')
 if(hasMotor)motor(g,[input-.55,.17,0],.74)
 if(hasCoupling){ring(g,.07,.16,.26,'steel',[input-.25,.46,0],part('coupling','输入联轴器','联轴器位于减速机输入侧，用于连接输入轴系。'),'x')}
 return g
}
function coupling({chain=false,ends,outerScale=1}={}){const g=new T.Group(),scale=Number(outerScale)>0?Number(outerScale):1
 // ends[0] is the reducer-side hub (negative X); ends[1] the head-pulley side (positive X).
 // Only the bore diameter (Φ, mm) and the axial hub length (mm) come from the saved
 // description; outer diameter, flanges and the pin/chain pattern remain illustrative.
 const hubEnds=Array.isArray(ends)&&ends.length===2?ends:[{boreMm:240,lengthMm:280},{boreMm:240,lengthMm:280}]
 for(const [i,x] of [-.2,.2].entries()){
  const boreMm=Number(hubEnds[i]?.boreMm),lengthMm=Number(hubEnds[i]?.lengthMm)
  if(!(boreMm>0&&lengthMm>0))throw Error('coupling ends need positive boreMm and lengthMm')
  const ri=boreMm/2000
  ring(g,ri,.25*scale,lengthMm/1000,'steel',[x,.3,0],part('hubs','两侧轮毂','两侧轮毂通过贯通轴孔与各自轴连接。'),'x');ring(g,ri,.34*scale,.07,'bright',[x/2,.3,0],part('flanges',chain?'链轮':'连接端','两半联轴器通过中间连接结构传递转矩。'),'x')}
 if(chain){for(let i=0;i<20;i++){const a=i*Math.PI/10;box(g,.28,.06,.08,'dark',[0,.3+Math.sin(a)*.35,Math.cos(a)*.35],part('chain','连接链条','链条连接两侧链轮，链板和滚子为结构示意。'),[a,0,0])}}
 else for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,.035,.29,'dark',[0,.3+Math.sin(a)*.29,Math.cos(a)*.29],part('pins','连接件','环向连接件传递载荷，具体销、齿及弹性件形式应按型号核对。'))}
 return g
}
function belt({wide=false,toothed=false}={}){const g=new T.Group();const path=new T.EllipseCurve(0,0,.68,.40,0,Math.PI*2,false,0),points=path.getPoints(80).slice(0,-1).map(v=>new T.Vector3(v.x,0,v.y)),curve=new T.CatmullRomCurve3(points,true)
 if(wide){const s=new T.Shape();s.moveTo(-.026,-.22);s.lineTo(.026,-.22);s.lineTo(.026,.22);s.lineTo(-.026,.22);s.closePath();add(g,new T.ExtrudeGeometry(s,{steps:100,bevelEnabled:false,extrudePath:curve}),'dark',undefined,undefined,part('belt','宽幅带体','输送带为宽幅带体，不采用细圆环表示。接头和表面花纹仍为示意。'))}
 else add(g,new T.TubeGeometry(curve,100,.035,8,true),'dark',undefined,undefined,part('belt','带体','闭合带体用于传递运动；截面与有效长度以具体型号为准。'))
 if(toothed)for(let i=0;i<48;i++){const a=i*Math.PI/24;box(g,.06,.04,.02,'dark',[Math.cos(a)*.63,0,Math.sin(a)*.35],part('teeth','内侧齿','内侧齿用于与带轮配合，齿距和齿形仅作示意。'),[0,-a,0])}
 return g
}
function chain({double=false,connector=false}={}){const g=new T.Group(),n=connector?1:8
 for(let i=0;i<n;i++){const x=(i-(n-1)/2)*.13
  for(const row of double?[-.08,.08]:[0]){for(const z of[-.045,.045])box(g,.18,.06,.018,'steel',[x,.12,row+z],part('plates','链板','链板连接相邻销轴，单排与双排链条在宽度方向不同。'));for(const dx of[-.065,.065])cyl(g,.028,.07,'bright',[x+dx,.12,row],part('rollers','滚子','滚子与链轮齿接触，链节节距为示意。'),[Math.PI/2,0,0])}
  cyl(g,.013,double?.27:.12,'dark',[x-.065,.12,0],part('pins','销轴','销轴连接链板与滚子，接头结构以实际链号为准。'),[Math.PI/2,0,0])
 }
 return g
}
function electrical({type='mccb',poles=3}={}){const g=new T.Group()
 if(type==='loadcell'){plate(g,1.05,.22,.26,'steel',[0,.2,0],[[-.39,0,.045],[-.22,0,.045]],part('beam','梁式弹性体','SLB415为梁式称重传感器，安装孔和受力端为识别示意。'));cyl(g,.055,.08,'steel',[.37,.33,0],part('load','受力端','载荷通过受力端传递到弹性体，实际盲孔与附件请查厂家图纸。'),[0,0,0]);cyl(g,.018,.38,'dark',[-.45,.2,.28],part('cable','信号线缆','线缆连接称重仪表，内部应变片未展开。'),[Math.PI/2,0,0]);return g}
 if(type==='scanner'){cyl(g,.35,.24,0xd6bd35,[0,.18,0],part('body','扫描器壳体','安全激光扫描器的机身，不能用圆柱接近探头代替。'),[0,0,0]);cyl(g,.33,.22,'dark',[0,.4,0],part('optics','环形扫描窗','扫描窗口用于激光扫描；实际扫描范围以厂家配置为准。'),[0,0,0]);box(g,.28,.16,.04,'dark',[0,.15,.34],part('panel','状态面板','状态面板显示运行信息，指示灯仅作外观示意。'));return g}
 if(type==='resistor'){box(g,1.1,.12,.42,'steel',[0,.08,0],part('base','安装底板','底板用于将制动电阻固定在安装面。'));for(let i=0;i<12;i++)box(g,.045,.3,.36,'steel',[-.49+i*.09,.27,0],part('fins','电阻散热壳','散热壳容纳电阻元件，外部翅片辅助散热。'));for(const x of[-.6,.6])cyl(g,.025,.2,'dark',[x,.25,0],part('leads','引出端','引出端连接制动电路，电阻内部没有展开。'));return g}
 if(type==='junction'){box(g,.9,.75,.38,'dark',[0,.4,0],part('box','箱体','接线箱容纳接线端子及电气连接，防爆细节以厂家资料为准。'));box(g,.94,.77,.07,'dark',[0,.4,.23],part('lid','箱盖','箱盖与箱体配合，供检修和密封连接。'));for(const x of[-.38,.38])for(const y of[.1,.7])cyl(g,.025,.03,'bright',[x,y,.28],part('fasteners','盖板紧固件','紧固件固定盖板，数量与安装结构为示意。'),[Math.PI/2,0,0]);for(const x of[-.28,0,.28])cyl(g,.055,.15,'steel',[x,-.03,0],part('glands','电缆入口','电缆入口连接电缆或配套引入装置。'),[0,0,0]);return g}
 box(g,poles*.23,.9,.40,type==='mcb'?'white':'dark',[0,.48,0],part('housing','绝缘壳体','断路器壳体容纳触头与保护机构，内部未展开。'))
 box(g,.15,.26,.10,'dark',[0,.53,.26],part('handle','操作手柄','手柄用于分合操作，实际状态以器件标识为准。'))
 for(let i=0;i<poles;i++)for(const y of[.1,.86]){const x=(i-(poles-1)/2)*.23;box(g,.15,.09,.06,'steel',[x,y,.24],part('terminals','接线端','分极接线端的位置示意，端子尺寸与额定参数需核对产品资料。'))}
 return g
}
function seal(){const g=new T.Group();ring(g,.27,.39,.10,'dark',[0,.4,0],part('body','密封环体','轴承座端部使用的密封环体；不是完整轴承座。'));for(let i=0;i<4;i++)ring(g,.255,.315,.015,'dark',[0,.4,-.035+i*.023],part('lips','四道密封唇','TSN L系列四唇结构示意，具体截面及尺寸仍需厂家资料。'));return g}
// Mounted bearing units: two-bolt pillow blocks, four-bolt square flange units
// and two-bolt oval flange units. Envelope, hole spacing, bore and inner-ring
// width/offset in spec come from the manufacturer table for the exact model;
// spherical seat radius, insert outside diameter, seal and casting shape stay
// illustrative and are listed in the evidence userData.
function mountedUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000,style=spec.style||'pillow'
 const need=(values)=>{const out={};for(const [name,raw] of Object.entries(values)){const value=Number(raw);if(!(value>0))throw Error('mounted unit needs '+name);out[name]=value}return out}
 const noInsert=Boolean(spec.noInsert)
 const base=need({shaftD:spec.shaftD,L:spec.L,J:spec.J,N:spec.N,B:spec.B||spec.depth*0.8||1,S:spec.S||0.001})
 const d=m(base.shaftD),b=m(base.B),s=m(base.S),n=m(base.N),j=m(base.J)
 const clamp=(value,min,max)=>Math.min(max,Math.max(min,value))
 function insert(h,centre,outerRadius){
  const ro=Math.max(d/2+.004,outerRadius*.78)
  ring(g,d/2,ro,b,'bright',[0,h,centre],part('inner','宽内圈','内孔直径、内圈宽度与轴向偏置 S 按厂家尺寸表；内圈外径未在表中，为示意。'),'z')
  ring(g,d/2,ro,.004,'dark',[0,h,centre+b/2-.003],part('seal','密封','密封为示意，型式与材料以实物为准。'),'z')
  // Set-screw locking: two screws on the wide inner ring, as in the UC insert.
  // Screw size, exact angle and depth are illustrative; the locking style is
  // stated by the catalogue text (set screw locking).
  for(const angle of [Math.PI*.28,Math.PI*.28+Math.PI*2/3]){
   const screw=new T.Mesh(new T.CylinderGeometry(.004,.004,.012,12),mat('steel'))
   screw.position.set(Math.cos(angle)*ro*1.02,h+Math.sin(angle)*ro*1.02,centre+b*.18)
   screw.rotation.z=-angle+Math.PI/2;screw.name='紧定螺钉'
   screw.userData.observation={schema:1,id:'set-screws',name:'紧定螺钉',description:'UC 宽内圈采用紧定螺钉锁紧，数量 2 个；螺钉规格、角度与深度为示意。'}
   g.add(screw)
  }
  // Grease nipple on the housing side, within the overall envelope.
  const nipple=new T.Mesh(new T.CylinderGeometry(.005,.005,.014,12),mat('gold'))
  nipple.position.set(outerRadius*.86,h,centre);nipple.rotation.z=Math.PI/2;nipple.name='润滑嘴'
  nipple.userData.observation={schema:1,id:'grease-nipple',name:'润滑嘴',description:'润滑嘴位置为示意；样本说明配润滑嘴，具体螺纹与位置未在尺寸表中。'}
  g.add(nipple)
  return ro
 }
 if(style==='pillow'){
  const values=need({width:spec.width||spec.A,H:spec.H,H1:spec.H1,H2:spec.H2,N1:spec.N1})
  const l=m(base.L),a=m(values.width),h=m(values.H),h1=m(values.H1),h2=m(values.H2),n1=m(values.N1),outer=h2-h
  if(!(outer>0))throw Error('pillow H2 must exceed H')
  const plate=new T.Shape()
  plate.moveTo(-l/2+0.012,-a/2);plate.lineTo(l/2-0.012,-a/2);plate.quadraticCurveTo(l/2,-a/2,l/2,-a/2+0.012)
  plate.lineTo(l/2,a/2-0.012);plate.quadraticCurveTo(l/2,a/2,l/2-0.012,a/2);plate.lineTo(-l/2+0.012,a/2)
  plate.quadraticCurveTo(-l/2,a/2,-l/2,a/2-0.012);plate.lineTo(-l/2,-a/2+0.012);plate.quadraticCurveTo(-l/2,-a/2,-l/2+0.012,-a/2)
  for(const side of [-1,1]){
   // Stadium slot (straight sides + semicircular ends), not an ellipse.
   const cx=side*j/2,half=Math.max(0,(n1-n)/2),radius=n/2,slot=new T.Path()
   slot.moveTo(cx-half,radius);slot.lineTo(cx+half,radius)
   slot.absarc(cx+half,0,radius,Math.PI/2,-Math.PI/2,true)
   slot.lineTo(cx-half,-radius)
   slot.absarc(cx-half,0,radius,-Math.PI/2,Math.PI/2,true)
   slot.closePath();plate.holes.push(slot)
  }
  const plateGeo=new T.ExtrudeGeometry(plate,{depth:h1,bevelEnabled:false,curveSegments:24})
  plateGeo.rotateX(Math.PI/2);plateGeo.translate(0,h1,0)
  add(g,plateGeo,'blue',[0,0,0],undefined,part('base','安装底座','底座外形、安装孔间距与长圆孔尺寸按厂家尺寸表；紧固件未建模。'))
  const housing=new T.Shape()
  housing.moveTo(-outer,h1);housing.lineTo(-outer,h)
  for(let index=0;index<=48;index++){const angle=Math.PI-index*Math.PI/48;housing.lineTo(Math.cos(angle)*outer,h+Math.sin(angle)*outer)}
  housing.lineTo(outer,h1);housing.closePath()
  const seat=new T.Path();seat.absarc(0,h,outer*.74,0,Math.PI*2,true);housing.holes.push(seat)
  const housingGeo=new T.ExtrudeGeometry(housing,{depth:a,bevelEnabled:false,curveSegments:32})
  housingGeo.translate(0,0,-a/2)
  add(g,housingGeo,'blue',[0,0,0],undefined,part('housing','座体','座体外廓（L/A/H1/H2）与中心高按厂家表；球面座半径未公布，内孔为示意。'))
  insert(h,b/2-s,outer*.74)
 }else if(style==='square-flange'||style==='oval-flange'){
  const square=style==='square-flange'
  const plateX=m(square?base.L:Number(spec.H)),plateY=m(square?base.L:base.L)
  const thickness=m(Number(spec.flangeThickness)),depth=m(Number(spec.depth))
  if(!(plateX>0&&plateY>0&&thickness>0&&depth>0))throw Error('flange needs plate size, flangeThickness and depth')
  const shape=new T.Shape()
  if(square){
   const r=.012
   shape.moveTo(-plateX/2+r,-plateY/2);shape.lineTo(plateX/2-r,-plateY/2);shape.quadraticCurveTo(plateX/2,-plateY/2,plateX/2,-plateY/2+r)
   shape.lineTo(plateX/2,plateY/2-r);shape.quadraticCurveTo(plateX/2,plateY/2,plateX/2-r,plateY/2)
   shape.lineTo(-plateX/2+r,plateY/2);shape.quadraticCurveTo(-plateX/2,plateY/2,-plateX/2,plateY/2-r)
   shape.lineTo(-plateX/2,-plateY/2+r);shape.quadraticCurveTo(-plateX/2,-plateY/2,-plateX/2+r,-plateY/2)
   for(const x of [-j/2,j/2])for(const y of [-j/2,j/2]){const hole=new T.Path();hole.absarc(x,y,n/2,0,Math.PI*2,true);shape.holes.push(hole)}
  }else{
   // Oval flange: stadium plate, bolt holes on the long axis (x = H).
   const half=(plateX-plateY)/2
   shape.moveTo(-half,plateY/2);shape.lineTo(half,plateY/2)
   shape.absarc(half,0,plateY/2,Math.PI/2,-Math.PI/2,true)
   shape.lineTo(-half,-plateY/2)
   shape.absarc(-half,0,plateY/2,-Math.PI/2,Math.PI/2,true)
   shape.closePath()
   for(const x of [-j/2,j/2]){const hole=new T.Path();hole.absarc(x,0,n/2,0,Math.PI*2,true);shape.holes.push(hole)}
  }
  const bossRadius=Math.min(plateX,plateY)*.30,innerRadius=Math.max(d/2+.004,noInsert?d/2+.006:bossRadius*.78)
  const centreHole=new T.Path();centreHole.absarc(0,0,innerRadius+.002,0,Math.PI*2,true);shape.holes.push(centreHole)
  add(g,new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:32}),'blue',[0,0,0],undefined,part('housing','法兰座体','法兰外形、安装孔间距与孔径按厂家尺寸表；中心孔与凸台外形为示意。'))
  const bossDepth=Math.max(.004,depth-thickness)
  if(spec.noBoss){
   // Depth of the casting is not documented (LYC page E value inconsistent):
   // stop at the flange plate instead of inventing a boss.
   g.userData.evidence={schema:1,style,ledgerBrand:spec.ledgerBrand||'',productModel:spec.productModel||'',dimensionSource:spec.dimensionSource||null,confirmedDimensionsMm:spec.confirmedDimensionsMm||'',unknown:spec.unknown||[],noInsert,noBoss:true}
   g.userData.quality='法兰板外形示意'
   return g
  }
  const boss=new T.Mesh(new T.LatheGeometry([[innerRadius+.002,-bossDepth/2],[bossRadius,-bossDepth/2],[bossRadius,bossDepth/2],[innerRadius+.002,bossDepth/2],[innerRadius+.002,-bossDepth/2]].map(point=>new T.Vector2(point[0],point[1])),40),mat('blue'))
  boss.rotation.x=Math.PI/2;boss.position.set(0,0,thickness+bossDepth/2);boss.name='法兰凸台'
  boss.userData.observation={schema:1,id:'housing',name:'法兰凸台',description:'凸台外形为示意；尺寸表给出总宽与法兰厚度，未给凸台直径。'}
  g.add(boss)
  // The published S offset cannot push the insert outside the flange envelope:
  // the insert stays inside the A0/A3 depth and S is recorded in the evidence.
  const centre=clamp(depth-m(Number(spec.centreFromEnd||spec.A2||0)),(noInsert?d/2:b/2),Math.max((noInsert?d/2:b/2),depth-(noInsert?d/2:b/2)))
  if(!noInsert)insert(0,centre,bossRadius)
 }else throw Error('Unknown mounted unit style '+style)
 g.userData.evidence={schema:1,style,ledgerBrand:spec.ledgerBrand||'',productModel:spec.productModel||'',dimensionSource:spec.dimensionSource||null,confirmedDimensionsMm:spec.confirmedDimensionsMm||'',unknown:spec.unknown||[],axialOffsetSmm:Number(spec.S)||0,axialOffsetNote:style==='pillow'?'内圈按 S 向 +z 侧偏移，允许略超出座体宽度 A':(noInsert?'内圈宽度 B 未取得，未建内圈，仅保留座孔':'法兰型内圈受总宽 A0/A3 约束未做轴向突出，S 作为资料值记录'),noInsert,stainless:Boolean(spec.stainless)}
 g.userData.quality='厂家尺寸表外形示意'
 return g
}
// Split plummer block housing (SNL/SN 2,3,5,6 series). Dimensions A, A1, H,
// H1, H2, J, L, N, N1, Da and Ca come from the SKF datasheet for the exact
// designation; seal grooves, dowels, ribs and cap bolt positions stay illustrative.
function splitHousing(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({A:spec.A,A1:spec.A1,H:spec.H,H1:spec.H1,H2:spec.H2,J:spec.J,L:spec.L,N:spec.N,N1:spec.N1,Da:spec.Da})){
  const value=Number(raw);if(!(value>0))throw Error('split housing needs '+key);values[key]=value
 }
 const A=m(values.A),A1=m(values.A1),H=m(values.H),H1=m(values.H1),H2=m(values.H2),J=m(values.J),L=m(values.L),N=m(values.N),N1=m(values.N1),bore=m(values.Da/2)
 if(!(H>H1&&H1>H2&&A>=A1&&L>J))throw Error('split housing dimensions inconsistent')
 // Foot: L x A1 plate with two side-open bolt slots (N long, N1 wide); the bolt
 // slides in from the side, so each slot is open towards +-z as in the drawing.
 const baseParts=[]
 const box=(width,depth,x,z)=>{const geometry=new T.BoxGeometry(width,H2,depth);geometry.translate(x,H2/2,z);baseParts.push(geometry)}
 const rail=(L/2-(J/2+N1/2)),middle=Math.max(N1,J-N1),slotInner=Math.max(0,A1-2*N)
 box(rail,A1,-(L/2+(J/2+N1/2))/2,0)
 box(rail,A1,(L/2+(J/2+N1/2))/2,0)
 box(middle,A1,0,0)
 for(const side of [-1,1])if(slotInner>0)box(N1,slotInner,side*J/2,0)
 const baseGeo=mergeGeometries(baseParts,false)
 baseParts.forEach(geometry=>geometry.dispose())
 if(!baseGeo)throw Error('split housing base merge failed')
 add(g,baseGeo,'blue',[0,0,0],undefined,part('base','安装底座','底座外形、侧开安装长圆槽与孔距按 SKF 尺寸表；紧固件未建模。'))
 // Lower half: material below the seat, top edge follows the lower bore semicircle.
 const lowerShape=new T.Shape()
 lowerShape.moveTo(-L/2,H2);lowerShape.lineTo(L/2,H2);lowerShape.lineTo(L/2,H1);lowerShape.lineTo(bore,H1)
 lowerShape.absarc(0,H1,bore,0,-Math.PI,true)
 lowerShape.lineTo(-L/2,H1);lowerShape.closePath()
 const lowerGeo=new T.ExtrudeGeometry(lowerShape,{depth:A,bevelEnabled:false,curveSegments:32})
 lowerGeo.translate(0,0,-A/2)
 add(g,lowerGeo,'blue',[0,0,0],undefined,part('lower','下座','下座外形、中心高与座孔直径按 SKF 尺寸表；肋板与铸造圆角为示意。'))
 for(const z of [-A/2+.004,A/2-.004]){
  const ear=new T.Mesh(new T.LatheGeometry([[bore,-.004],[bore+.006,-.004],[bore+.006,.004],[bore,.004],[bore,-.004]].map(point=>new T.Vector2(point[0],point[1])),40),mat('blue'))
  ear.rotation.x=Math.PI/2;ear.position.set(0,H1,z);ear.name='座孔端面'
  ear.userData.observation={schema:1,id:'lower',name:'座孔端面',description:'座孔两端环面用于安装密封，端面宽度为示意。'}
  g.add(ear)
 }
 // Cap: upper half with the same seat radius and a split face at H1.
 const capShape=new T.Shape()
 capShape.moveTo(-L/2,H1);capShape.lineTo(-bore,H1)
 capShape.absarc(0,H1,bore,Math.PI,0,true)
 capShape.lineTo(L/2,H1);capShape.lineTo(L/2,H);capShape.lineTo(-L/2,H);capShape.closePath()
 const capGeo=new T.ExtrudeGeometry(capShape,{depth:A,bevelEnabled:false,curveSegments:32})
 capGeo.translate(0,0,-A/2)
 add(g,capGeo,'blue',[0,0,0],undefined,part('cap','上盖','上盖外形与座孔按 SKF 尺寸表；分合面、紧固螺栓与吊环为示意。'))
 // Two cap bolts at the split face, kept inside the overall envelope.
 for(const side of [-1,1]){
  const bolt=new T.Mesh(new T.CylinderGeometry(.008,.008,Math.min(H-H1-.01,.12),16),mat('steel'))
  bolt.position.set(side*(L/2-.06),H1+(H-H1)/2,0);bolt.name='合盖螺栓'
  bolt.userData.observation={schema:1,id:'bolts',name:'合盖螺栓',description:'合盖螺栓连接上盖与下座，数量与规格为示意。'}
  g.add(bolt)
 }
 // Seal ring at one seat end, outside the bore so the shaft bore stays open.
 const seal=new T.Mesh(new T.TorusGeometry(bore+.003,.003,8,48),mat('dark'))
 seal.position.set(0,H1,A/2-.006);seal.name='座孔密封'
 seal.userData.observation={schema:1,id:'seal',name:'座孔密封',description:'座孔密封圈位置示意，密封型式与材料以厂家资料为准。'}
  g.add(seal)
 g.userData.evidence={schema:1,style:'split-housing',ledgerBrand:spec.ledgerBrand||'',productModel:spec.productModel||'',dimensionSource:spec.dimensionSource||null,confirmedDimensionsMm:spec.confirmedDimensionsMm||'',unknown:spec.unknown||[]}
 g.userData.quality='SKF尺寸表外形示意'
 return g
}
// Simple fabricated parts whose principal dimensions are recorded in the
// material description (screens, plates, seals, tubes, casters, rollers). The
// recorded sizes are used exactly; features that the description does not give
// (pitch, fillets, hubs, fittings) stay illustrative and are listed in evidence.
function profileStrip(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const width=m(spec.width),height=m(spec.height)
 if(!(width>0&&height>0))throw Error('strip needs width/height')
 if(spec.coil){
  const coil=ring(g,Math.max(.02,(Number(spec.coilDiameterMm)||200)/1000/2-width/2),Math.max(.03,(Number(spec.coilDiameterMm)||200)/1000/2+width/2),height,'dark',[0,height/2,0],part('body','盘根','方形截面尺寸按物料规格；盘绕直径与长度未给出，为示意。'),'y')
  coil.userData.observation={schema:1,id:'body',name:'盘根',description:'方形截面 10×10 mm 按物料规格；盘绕直径与长度未给出，为示意。'}
 }else{
  const length=m(spec.length)||1
  box(g,length,height,width,'dark',[0,height/2,0],part('body','密封条','截面厚×宽按物料规格；长度未给出，按 1 m 示意。'))
 }
 return g
}
function caster(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const diameter=m(spec.wheelDiameter)
 if(!(diameter>0))throw Error('caster needs wheelDiameter')
 const radius=diameter/2,width=Math.max(.024,radius*.34)
 const wheel=new T.Mesh(new T.CylinderGeometry(radius,radius,width,40),mat('dark'));wheel.rotation.x=Math.PI/2;wheel.position.set(0,radius,0);wheel.name='行走轮'
 wheel.userData.observation={schema:1,id:'wheel',name:'行走轮',description:'轮径按物料规格；轮宽、胎面与轴承结构为示意。'}
 g.add(wheel)
 for(const z of [-width/2-.004,width/2+.004]){const hub=new T.Mesh(new T.CylinderGeometry(radius*.32,radius*.32,.006,24),mat('steel'));hub.rotation.x=Math.PI/2;hub.position.set(0,radius,z);hub.name='轮毂';hub.userData.observation={schema:1,id:'wheel',name:'轮毂',description:'轮毂与轴孔为示意。'};g.add(hub)}
 const forkRise=radius*1.25
 for(const z of [-width/2-.012,width/2+.012]){const plate=new T.Mesh(new T.BoxGeometry(radius*1.15,forkRise,.006),mat('steel'));plate.position.set(-radius*.12,radius+forkRise/2-.01,z);plate.name='支架';plate.userData.observation={schema:1,id:'fork',name:'支架',description:'支架高度与板厚为示意。'};g.add(plate)}
 const top=new T.Mesh(new T.BoxGeometry(radius*.8,.008,width+.03),mat('steel'));top.position.set(-radius*.12,radius+forkRise,.005);top.name='安装板';top.userData.observation={schema:1,id:'plate',name:'安装板',description:'安装板尺寸、螺栓孔与转向结构为示意。'};g.add(top)
 if(spec.brake){const lever=new T.Mesh(new T.BoxGeometry(radius*.9,.012,.03),mat('gold'));lever.position.set(radius*.35,radius+forkRise*.85,width/2+.02);lever.rotation.z=-.35;lever.name='制动踏板';lever.userData.observation={schema:1,id:'brake',name:'制动踏板',description:'制动踏板位置与结构为示意，不是具体型号的刹车机构。'};g.add(lever)}
 return g
}
function tubePart(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const outer=m(spec.outerDiameter)/2,wall=m(spec.wall)||.002,length=m(spec.length)
 if(!(outer>0&&length>0&&wall>0&&wall<outer))throw Error('tube needs outerDiameter/length/wall')
 const inner=outer-wall
 const profile=[[inner,0],[outer,0],[outer,length],[inner,length],[inner,0]].map(point=>new T.Vector2(point[0],point[1]))
 const body=new T.Mesh(new T.LatheGeometry(profile,48),mat('dark'));body.name='管体'
 body.userData.observation={schema:1,id:'body',name:'管体',description:'外径与壁厚按物料规格；长度按给定值或示意值。'}
 g.add(body)
 if(spec.ribs)for(let index=0;index<6;index++){const ringMesh=new T.Mesh(new T.TorusGeometry(outer+.002,.0015,6,40),mat('steel'));ringMesh.rotation.x=Math.PI/2;ringMesh.position.y=.05+index*(length-.1)/5;ringMesh.name='加强环';ringMesh.userData.observation={schema:1,id:'ribs',name:'加强环',description:'软连接/滤袋的支撑环间距为示意。'};g.add(ringMesh)}
 if(spec.bottom){const cap=new T.Mesh(new T.CylinderGeometry(outer,outer*.9,.01,40),mat('dark'));cap.position.y=.005;cap.name='袋底';cap.userData.observation={schema:1,id:'bottom',name:'袋底',description:'袋底封闭方式为示意。'};g.add(cap)}
 return g
}
function flatPanel(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const length=m(spec.length),width=m(spec.width)
 if(!(length>0&&width>0))throw Error('panel needs length/width')
 if(spec.mesh){
  const pitch=m(spec.pitch)||.0025,wire=m(spec.wire)||.0006
  const warpCount=Math.max(2,Math.floor(width/pitch)),weftCount=Math.max(2,Math.floor(length/pitch))
  for(const axis of ['warp','weft']){const count=axis==='warp'?warpCount:weftCount
   for(let index=0;index<count;index++){
    const along=axis==='warp'?width:length,other=axis==='warp'?length:width
    const offset=-along/2+(index+.5)*along/count
    const geo=axis==='warp'?new T.BoxGeometry(wire,other,wire):new T.BoxGeometry(other,wire,wire)
    const mesh=new T.Mesh(geo,mat('steel'))
    if(axis==='warp')mesh.position.set(offset,0,0);else mesh.position.set(0,offset,0)
    mesh.position.y=0;mesh.name='筛网丝'
    mesh.userData.observation={schema:1,id:axis,name:axis==='warp'?'经丝':'纬丝',description:'筛网目数与丝径按物料规格/示意；编织方式为简化示意。'}
    g.add(mesh)
   }
  }
  g.position.y=.002
  return g
 }
 const thickness=m(spec.thickness)||.002,holeDiameter=m(spec.holeDiameter)||0
 const shape=new T.Shape()
 shape.moveTo(-length/2,-width/2);shape.lineTo(length/2,-width/2);shape.lineTo(length/2,width/2);shape.lineTo(-length/2,width/2);shape.closePath()
 if(holeDiameter>0){
  const pitch=m(spec.pitch)||.025
  const cols=Math.max(1,Math.floor((length-.02)/pitch)),rows=Math.max(1,Math.floor((width-.02)/pitch))
  for(let row=0;row<rows;row++)for(let column=0;column<cols;column++){
   const hole=new T.Path();const x=-length/2+.01+(column+.5)*(length-.02)/cols,y=-width/2+.01+(row+.5)*(width-.02)/rows
   hole.absarc(x,y,holeDiameter/2,0,Math.PI*2,true);shape.holes.push(hole)
  }
 }
 add(g,new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:20}),'steel',[0,0,0],undefined,part('body','板体','外形尺寸与厚度按物料规格；孔径/孔距按资料或示意。'))
 return g
}
function roller(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const diameter=m(spec.diameter),length=m(spec.length),shaft=m(spec.shaftDiameter)||.02,shaftLength=m(spec.shaftLength)||length
 if(!(diameter>0&&length>0))throw Error('roller needs diameter/length')
 const body=new T.Mesh(new T.CylinderGeometry(diameter/2,diameter/2,length,40),mat('steel'));body.rotation.z=Math.PI/2;body.name='辊体'
 body.userData.observation={schema:1,id:'body',name:'辊体',description:'辊径与辊长按物料规格；管壁、轴承与端部结构为示意。'}
 g.add(body)
 for(const side of [-1,1]){const end=new T.Mesh(new T.CylinderGeometry(diameter*.22,diameter*.22,.01,24),mat('dark'));end.rotation.z=Math.PI/2;end.position.x=side*(length/2+.005);end.name='端盖'
  end.userData.observation={schema:1,id:'ends',name:'端盖',description:'端盖与轴承座为示意。'};g.add(end)}
 const axle=new T.Mesh(new T.CylinderGeometry(shaft/2,shaft/2,shaftLength,20),mat('bright'));axle.rotation.z=Math.PI/2;axle.name='辊轴'
 axle.userData.observation={schema:1,id:'shaft',name:'辊轴',description:'轴径与轴长按物料规格。'};g.add(axle)
 return g
}
function backstop(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const inner=m(spec.innerDiameter)/2,outer=m(spec.outerDiameter)/2
 if(!(outer>inner&&inner>0))throw Error('backstop needs inner/outer diameter')
 const ringGeo=new T.LatheGeometry([[inner,-.01],[outer,-.01],[outer,.01],[inner,.01],[inner,-.01]].map(point=>new T.Vector2(point[0],point[1])),48)
 const body=new T.Mesh(ringGeo,mat('steel'));body.name='环形本体'
 body.userData.observation={schema:1,id:'body',name:'环形本体',description:'内径/外径按物料规格；厚度为示意。'}
 g.add(body)
 const slotLength=m(spec.slotLength)||.035,slotWidth=m(spec.slotWidth)||.045
 const flap=new T.Mesh(new T.BoxGeometry(Math.max(slotLength,.02),.006,Math.max(slotWidth,.02)),mat('dark'));flap.position.set(inner+slotLength/2,.012,0);flap.name='止逆片'
 flap.userData.observation={schema:1,id:'flap',name:'止逆片',description:'止逆片尺寸按槽长/槽宽规格，摆角与弹簧为示意。'};g.add(flap)
 const handle=new T.Mesh(new T.CylinderGeometry(.012,.012,m(spec.handleLength)||.09,16),mat('gold'));handle.rotation.z=Math.PI/2;handle.position.set(outer+.02,.012,0);handle.name='把柄'
 handle.userData.observation={schema:1,id:'handle',name:'把柄',description:'把柄长度按物料规格。'};g.add(handle)
 return g
}
// AirTAC SC (tie-rod) and SAI (profile) cylinders. A, AB, AC, B, D, DA, KB,
// rod thread and port thread come from the printed catalogue pages (SC p.39,
// SAI p.23, image pages read visually); cushion screws, cap chamfers, port
// boss shapes and accessories are illustrative. Total length is A + stroke.
function tieRodCylinder(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({A:spec.A,AB:spec.AB,AC:spec.AC,B:spec.B,D:spec.D,DA:spec.DA,KB:spec.KB,stroke:spec.stroke})){
  const value=Number(raw);if(!(value>0))throw Error('SC cylinder needs '+key);values[key]=value
 }
 const A=m(values.A),AB=m(values.AB),AC=m(values.AC),B=m(values.B),rod=m(values.D),port=m(values.DA),kb=m(values.KB),stroke=m(values.stroke)
 if(Math.abs(AB+AC-A)>0.002)throw Error('SC cylinder A must equal AB+AC')
 // Body: rear block AC long, front block AB long, square section B with chamfered corners.
 const rounded=(size,length)=>{const s=new T.Shape(),r=size*.08,half=size/2
  s.moveTo(-half+r,-half);s.lineTo(half-r,-half);s.quadraticCurveTo(half,-half,half,-half+r);s.lineTo(half,half-r);s.quadraticCurveTo(half,half,half-r,half);s.lineTo(-half+r,half);s.quadraticCurveTo(-half,half,-half,half-r);s.lineTo(-half,-half+r);s.quadraticCurveTo(-half,-half,-half+r,-half)
  const geo=new T.ExtrudeGeometry(s,{depth:length,bevelEnabled:false,curveSegments:16});geo.translate(0,0,0);return geo}
 const rear=new T.Mesh(rounded(B,AC),mat('steel'));rear.rotation.y=Math.PI/2;rear.position.set(0,0,0);rear.name='后盖与缸筒'
 rear.userData.observation={schema:1,id:'barrel',name:'后盖与缸筒',description:'A/AB/AC/B 外廓尺寸按亚德客 SC 样本；倒角与圆角为示意。'}
 g.add(rear)
 const front=new T.Mesh(rounded(B,AB),mat('steel'));front.rotation.y=Math.PI/2;front.position.set(A-AB,0,0);front.name='前盖'
 front.userData.observation={schema:1,id:'front-cap',name:'前盖',description:'前盖长度 AB、截面 B 按样本；导向套与防尘圈结构为示意。'}
 g.add(front)
 // Four exposed tie rods along the barrel, thread K only recorded as illustrative rods.
 const rodThread=Number(spec.rodThreadMinorMm)||Math.max(4,values.KB*.12)
 for(const y of [-kb/2,kb/2])for(const z of [-kb/2,kb/2]){
  const tie=new T.Mesh(new T.CylinderGeometry(m(rodThread),m(rodThread),A,12),mat('steel'))
  tie.rotation.z=Math.PI/2;tie.position.set(A/2,y,z);tie.name='拉杆'
  tie.userData.observation={schema:1,id:'ties',name:'拉杆',description:'四根外露拉杆按 SC 结构；杆径与螺母为示意，样本给出拉杆螺纹 K 与间距 KB。'}
  g.add(tie)
 }
 // Piston rod with thread at the tip, extended by the stroke.
 const piston=new T.Mesh(new T.CylinderGeometry(rod/2,rod/2,stroke+.05,24),mat('bright'))
 piston.rotation.z=Math.PI/2;piston.position.set(A+(stroke-.05)/2,0,0);piston.name='活塞杆'
 piston.userData.observation={schema:1,id:'rod',name:'活塞杆',description:'杆径 D 与行程按样本；杆端螺纹 M 未建牙型，伸出量为行程示意。'}
 g.add(piston)
 const thread=new T.Mesh(new T.CylinderGeometry(rod*.36,rod*.36,m(22),16),mat('steel'))
 thread.rotation.z=Math.PI/2;thread.position.set(A+stroke-m(12),0,0);thread.name='杆端螺纹'
 thread.userData.observation={schema:1,id:'rod-end',name:'杆端螺纹',description:'杆端螺纹规格按样本记录，模型不建螺纹牙型。'}
 g.add(thread)
 // Two air ports on the end caps near the mounting face.
 for(const [x,label] of [[AC*.6,'后气口'],[A-AB*.35,'前气口']]){
  const boss=new T.Mesh(new T.CylinderGeometry(port/2,port/2,m(10),20),mat('gold'))
  boss.position.set(x,-B/2+m(5),0);boss.name=label
  boss.userData.observation={schema:1,id:'ports',name:label,description:'气口位置与凸台外形为示意，接口螺纹按样本记录。'}
  g.add(boss)
 }
 for(const x of [AC*.2,A-AB*.2]){
  const screw=new T.Mesh(new T.CylinderGeometry(.004,.004,.012,12),mat('steel'))
  screw.position.set(x,B/2*.55,0);screw.name='缓冲调节螺钉'
  screw.userData.observation={schema:1,id:'cushion',name:'缓冲调节螺钉',description:'缓冲调节螺钉位置为示意，样本仅标注其存在。'}
  g.add(screw)
 }
 return g
}
function profileCylinder(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({A:spec.A,B:spec.B,D:spec.D,DA:spec.DA,stroke:spec.stroke})){
  const value=Number(raw);if(!(value>0))throw Error('SAI cylinder needs '+key);values[key]=value
 }
 const A=m(values.A),B=m(values.B),rod=m(values.D),stroke=m(values.stroke)
 const s=new T.Shape(),half=B/2,r=B*.10
 s.moveTo(-half+r,-half);s.lineTo(half-r,-half);s.quadraticCurveTo(half,-half,half,-half+r);s.lineTo(half,half-r);s.quadraticCurveTo(half,half,half-r,half);s.lineTo(-half+r,half);s.quadraticCurveTo(-half,half,-half,half-r);s.lineTo(-half,-half+r);s.quadraticCurveTo(-half,-half,-half+r,-half)
 const barrelGeo=new T.ExtrudeGeometry(s,{depth:A,bevelEnabled:false,curveSegments:20})
 const barrel=new T.Mesh(barrelGeo,mat('steel'));barrel.rotation.y=Math.PI/2;barrel.position.set(0,0,0);barrel.name='型材缸筒'
 barrel.userData.observation={schema:1,id:'barrel',name:'型材缸筒',description:'A/B 外廓按亚德客 SAI 样本；型材圆角与米字内筋为示意。'}
 g.add(barrel)
 // Two sensor grooves on the profile, one per side.
 for(const side of [-1,1]){const groove=new T.Mesh(new T.BoxGeometry(A*.92,.006,.003),mat('dark'));groove.position.set(A/2,side*B*.30,B/2*.86);groove.name='传感器槽'
  groove.userData.observation={schema:1,id:'sensor-groove',name:'传感器槽',description:'传感器安装槽位置为示意，样本说明型材带传感器槽。'};g.add(groove)}
 // End caps (same profile, slightly thicker plates).
 for(const [x,label] of [[m(8),'后盖'],[A-m(8),'前盖']]){
  const cap=new T.Mesh(new T.BoxGeometry(m(16),B,B),mat('steel'));cap.position.set(x,0,0);cap.name=label
  cap.userData.observation={schema:1,id:'caps',name:label,description:'端盖厚度与内部结构为示意，样本给出总长基准 A。'};g.add(cap)
 }
 const piston=new T.Mesh(new T.CylinderGeometry(rod/2,rod/2,stroke+.05,24),mat('bright'))
 piston.rotation.z=Math.PI/2;piston.position.set(A+(stroke-.05)/2,0,0);piston.name='活塞杆'
 piston.userData.observation={schema:1,id:'rod',name:'活塞杆',description:'杆径 D 与行程按样本；杆端螺纹未建牙型。'};g.add(piston)
 const thread=new T.Mesh(new T.CylinderGeometry(rod*.36,rod*.36,m(24),16),mat('steel'))
 thread.rotation.z=Math.PI/2;thread.position.set(A+stroke-m(13),0,0);thread.name='杆端螺纹'
 thread.userData.observation={schema:1,id:'rod-end',name:'杆端螺纹',description:'杆端螺纹规格按样本记录，模型不建牙型。'};g.add(thread)
 for(const [x,label] of [[B*.55,'后气口'],[A-B*.55,'前气口']]){
  const boss=new T.Mesh(new T.CylinderGeometry(m(values.DA)/2,m(values.DA)/2,m(10),20),mat('gold'))
  boss.position.set(x,-B/2+m(5),0);boss.name=label
  boss.userData.observation={schema:1,id:'ports',name:label,description:'气口位置与凸台为示意，接口螺纹按样本记录。'};g.add(boss)
 }
 return g
}
// Fabricated flexible ducts, timing belts, burst discs and diverter gates. Only
// the sizes stated by the material record are exact; loop shape, tooth count from
// pitch, wall thickness and unstated heights are illustrative and recorded.
function softDuct(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const top=m(spec.topDiameter)/2,bottom=m(spec.bottomDiameter||spec.topDiameter)/2,height=m(spec.height),wall=m(spec.wall)||.002
 if(!(top>0&&bottom>0&&height>0))throw Error('soft duct needs diameters and height')
 const profile=[]
 const steps=12
 for(let index=0;index<=steps;index++){const t=index/steps,r=bottom+(top-bottom)*t,y=height*t;profile.push(new T.Vector2(r-wall,y))}
 for(let index=steps;index>=0;index--){const t=index/steps,r=bottom+(top-bottom)*t,y=height*t;profile.push(new T.Vector2(r,y))}
 const body=new T.Mesh(new T.LatheGeometry(profile,48),mat('dark',0),true)
 body.name='帆布筒体'
 body.userData.observation={schema:1,id:'body',name:'帆布筒体',description:'上/下口直径与高度按物料规格；壁厚、褶皱与缝合为示意。'}
 g.add(body)
 for(const [y,radius,label] of [[.002,bottom,'下口'], [height-.002,top,'上口']]){
  const clampRing=new T.Mesh(new T.TorusGeometry(radius-.002,.002,8,40),mat('steel'))
  clampRing.rotation.x=Math.PI/2;clampRing.position.y=y;clampRing.name=label+'卡箍'
  clampRing.userData.observation={schema:1,id:'clamps',name:label+'卡箍',description:'卡箍位置按口径；卡箍规格为示意。'}
  g.add(clampRing)
 }
 return g
}
function timingBelt(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const length=m(spec.lengthMm),width=m(spec.widthMm),pitch=m(spec.pitchMm),thickness=m(spec.thicknessMm)||.004
 if(!(length>0&&width>0&&pitch>0))throw Error('timing belt needs length/width/pitch')
 // Neutral circumference equals the stated belt length; the closed shape is a
 // circle because the two pulley centres are not given.
 const neutral=length/(Math.PI*2),outer=neutral+thickness/2,inner=neutral-thickness/2
 const ringShape=new T.Shape();ringShape.absarc(0,0,outer,0,Math.PI*2,false)
 const hole=new T.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);ringShape.holes.push(hole)
 const beltGeo=new T.ExtrudeGeometry(ringShape,{depth:width,bevelEnabled:false,curveSegments:96})
 beltGeo.rotateX(-Math.PI/2);beltGeo.translate(0,0,0)
 const belt=new T.Mesh(beltGeo,mat('dark'));belt.name='带体'
 belt.userData.observation={schema:1,id:'belt',name:'带体',description:'带长与带宽按型号（420R5M32）；闭合形状按圆环近似，两轮中心距未给出。'}
 g.add(belt)
 const teeth=Math.max(8,Math.round(length/pitch))
 for(let index=0;index<teeth;index++){
  const angle=index*Math.PI*2/teeth,tangent=angle+Math.PI/2
  const tooth=new T.Mesh(new T.BoxGeometry(Math.min(.004,pitch*.8),.002,width*.92),mat('steel'))
  tooth.position.set(Math.cos(angle)*inner,0,Math.sin(angle)*inner)
  tooth.rotation.y=-tangent;tooth.name='带齿'
  tooth.userData.observation={schema:1,id:'teeth',name:'带齿',description:'齿数按带长/齿距（R5M，5 mm）计算，齿形为示意。'}
  g.add(tooth)
 }
 return g
}
function burstDisc(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const length=m(spec.length),width=m(spec.width),openingLength=m(spec.openingLength),openingWidth=m(spec.openingWidth),thickness=m(spec.thickness)||.001
 if(!(length>0&&width>0))throw Error('burst disc needs outer length/width')
 const shape=new T.Shape(),r=Math.min(length,width)*.04
 shape.moveTo(-length/2+r,-width/2);shape.lineTo(length/2-r,-width/2);shape.quadraticCurveTo(length/2,-width/2,length/2,-width/2+r)
 shape.lineTo(length/2,width/2-r);shape.quadraticCurveTo(length/2,width/2,length/2-r,width/2);shape.lineTo(-length/2+r,width/2)
 shape.quadraticCurveTo(-length/2,width/2,-length/2,width/2-r);shape.lineTo(-length/2,-width/2+r);shape.quadraticCurveTo(-length/2,-width/2,-length/2+r,-width/2)
 if(openingLength>0&&openingWidth>0){const hole=new T.Path();const hr=Math.min(openingLength,openingWidth)*.06
  hole.moveTo(-openingLength/2+hr,-openingWidth/2);hole.lineTo(openingLength/2-hr,-openingWidth/2);hole.quadraticCurveTo(openingLength/2,-openingWidth/2,openingLength/2,-openingWidth/2+hr)
  hole.lineTo(openingLength/2,openingWidth/2-hr);hole.quadraticCurveTo(openingLength/2,openingWidth/2,openingLength/2-hr,openingWidth/2);hole.lineTo(-openingLength/2+hr,openingWidth/2)
  hole.quadraticCurveTo(-openingLength/2,openingWidth/2,-openingLength/2,openingWidth/2-hr);hole.lineTo(-openingLength/2,-openingWidth/2+hr);hole.quadraticCurveTo(-openingLength/2,-openingWidth/2,-openingLength/2+hr,-openingWidth/2)
  shape.holes.push(hole)}
 add(g,new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:24}),'bright',[0,0,0],undefined,part('disc','爆破片','外形与通径按物料规格；爆破压力与材料层为资料值，拱形/夹持结构未证为示意。'))
 return g
}
function diverterGate(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const size=m(spec.size),height=m(spec.height||spec.size)
 if(!(size>0&&height>0))throw Error('diverter gate needs size')
 const body=new T.Mesh(new T.BoxGeometry(size,height,size),mat('steel'));body.position.y=height/2;body.name='壳体'
 body.userData.observation={schema:1,id:'body',name:'壳体',description:'进出料口 300×300 按物料规格；壳体高度与深度未给出，按 300 mm 示意。'}
 g.add(body)
 const flap=new T.Mesh(new T.BoxGeometry(size*.92,.008,size*.7),mat('dark'));flap.position.set(0,height*.55,0);flap.rotation.z=Math.PI*.18;flap.name='拨板'
 flap.userData.observation={schema:1,id:'flap',name:'拨板',description:'拨板角度与轴位为示意，实际翻板结构待图纸。'}
 g.add(flap)
 const motor=new T.Mesh(new T.CylinderGeometry(size*.12,size*.12,size*.24,24),mat('blue'));motor.rotation.z=Math.PI/2;motor.position.set(size*.62,height*.7,0);motor.name='驱动电机'
 motor.userData.observation={schema:1,id:'motor',name:'驱动电机',description:'0.75 kW 电机功率按物料规格；机座与安装法兰为示意。'}
 g.add(motor)
 return g
}
// Small pneumatic, vacuum, rope, shaft and rubber-spring parts. Recorded sizes
// are exact; unstated diameters, lengths, thread profiles and internal wires are
// illustrative and listed in the evidence userData.
function pneumaticFitting(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const tubeOd=m(spec.tubeOd),thread=m(spec.threadMm)||.013
 if(!(tubeOd>0))throw Error('fitting needs tubeOd')
 const hexAcross=tubeOd*1.75,hexLength=tubeOd*.9
 const hex=new T.Mesh(new T.CylinderGeometry(hexAcross/Math.sqrt(3),hexAcross/Math.sqrt(3),hexLength,6),mat('steel'))
 hex.rotation.z=Math.PI/2;hex.position.x=hexLength/2;hex.name='接头本体'
 hex.userData.observation={schema:1,id:'body',name:'接头本体',description:'六角本体为示意；螺纹规格与接管外径按物料规格。'}
 g.add(hex)
 const stud=new T.Mesh(new T.CylinderGeometry(thread/2,thread/2,tubeOd*.9,20),mat('bright'))
 stud.rotation.z=Math.PI/2;stud.position.x=-tubeOd*.45;stud.name='外螺纹'
 stud.userData.observation={schema:1,id:'thread',name:'外螺纹',description:'外螺纹规格按物料规格（R1/4 等），模型不建牙型。'}
 g.add(stud)
 const collet=new T.Mesh(new T.CylinderGeometry(tubeOd*.72,tubeOd*.62,tubeOd*.7,20),mat('blue'))
 collet.rotation.z=Math.PI/2;collet.position.x=hexLength+tubeOd*.35;collet.name='快插卡套'
 collet.userData.observation={schema:1,id:'collet',name:'快插卡套',description:'快插卡套与释放环为示意，接管外径按规格。'}
 g.add(collet)
 const tube=new T.Mesh(new T.CylinderGeometry(tubeOd/2,tubeOd/2,tubeOd*2,20),mat('dark'))
 tube.rotation.z=Math.PI/2;tube.position.x=hexLength+tubeOd*1.2;tube.name='接管示意'
 tube.userData.observation={schema:1,id:'tube',name:'接管示意',description:'用于示意接管外径的短管，非物料本体。'}
 g.add(tube)
 return g
}
function vacuumNozzle(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const length=m(spec.length),width=m(spec.width),inlet=m(spec.inletDiameter),height=m(spec.height)||.08
 if(!(length>0&&width>0&&inlet>0))throw Error('nozzle needs length/width/inlet')
 const body=new T.Mesh(new T.BoxGeometry(length,height,width),mat('bright'));body.position.y=height/2;body.name='吸头本体'
 body.userData.observation={schema:1,id:'body',name:'吸头本体',description:'长×宽按物料规格；高度为示意，内部流道未建。'}
 g.add(body)
 const mouth=new T.Mesh(new T.BoxGeometry(length*.08,height*.7,width*.9),mat('dark'));mouth.position.set(-length*.5,height/2,0);mouth.name='吸口'
 mouth.userData.observation={schema:1,id:'mouth',name:'吸口',description:'吸口宽度与形状为示意。'};g.add(mouth)
 const connector=new T.Mesh(new T.CylinderGeometry(inlet/2,inlet/2,length*.14,28),mat('steel'))
 connector.rotation.z=Math.PI/2;connector.position.set(length*.5+length*.07,height*.55,0);connector.name='软管接口'
 connector.userData.observation={schema:1,id:'connector',name:'软管接口',description:'接口内径约 50 mm 按物料描述，螺纹为示意。'};g.add(connector)
 for(const side of [-1,1]){const wheel=new T.Mesh(new T.CylinderGeometry(width*.18,width*.18,width*.14,20),mat('rubber'===null?'dark':'dark'))
  wheel.rotation.x=Math.PI/2;wheel.position.set(-length*.35,width*.18,side*(width/2+width*.07));wheel.name='移动轮'
  wheel.userData.observation={schema:1,id:'wheels',name:'移动轮',description:'两侧可移动轮为示意，尺寸未给出。'};g.add(wheel)}
 return g
}
function wireRope(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const diameter=m(spec.diameter),length=m(spec.length),strands=Number(spec.strands)||7
 if(!(diameter>0&&length>0))throw Error('wire rope needs diameter/length')
 const core=new T.Mesh(new T.CylinderGeometry(diameter*.16,diameter*.16,length,16),mat('bright'))
 core.rotation.z=Math.PI/2;core.position.set(length/2,0,0);core.name='绳芯'
 core.userData.observation={schema:1,id:'core',name:'绳芯',description:'绳径按物料规格；绳芯与股数为示意。'}
 g.add(core)
 for(let index=0;index<strands;index++){
  const points=[]
  const phase=index*Math.PI*2/strands,turns=Math.max(6,Math.round(length/(diameter*6)))
  for(let step=0;step<=120;step++){const t=step/120,angle=phase+t*Math.PI*2*turns
   points.push(new T.Vector3(t*length,Math.cos(angle)*diameter*.31,Math.sin(angle)*diameter*.31))}
  const strand=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),180,diameter*.13,8,false),mat('steel'))
  strand.name='股绳'
  strand.userData.observation={schema:1,id:'strands',name:'股绳',description:'7 股按物料规格；每股 19 根钢丝未逐根建模。'}
  g.add(strand)
 }
 return g
}
function driveShaft(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const length=m(spec.length),diameter=m(spec.diameter)||.05
 if(!(length>0))throw Error('drive shaft needs length')
 const shaft=new T.Mesh(new T.CylinderGeometry(diameter/2,diameter/2,length,32),mat('bright'))
 shaft.rotation.z=Math.PI/2;shaft.position.set(length/2,0,0);shaft.name='轴体'
 shaft.userData.observation={schema:1,id:'shaft',name:'轴体',description:'集中驱动轴长度按物料规格；轴径未给出，为示意。'}
 g.add(shaft)
 for(const side of [0,1]){const flange=new T.Mesh(new T.CylinderGeometry(diameter*1.25,diameter*1.25,diameter*.3,32),mat('steel'))
  flange.rotation.z=Math.PI/2;flange.position.set(side? length-diameter*.15:diameter*.15,0,0);flange.name='端部法兰'
  flange.userData.observation={schema:1,id:'flanges',name:'端部法兰',description:'端部连接法兰为示意，安装接口未给出。'};g.add(flange)}
 return g
}
function rubberSpring(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const outer=m(spec.outerDiameter),height=m(spec.height)
 if(!(outer>0&&height>0))throw Error('rubber spring needs diameter and height')
 const layers=3,plate=.004,each=(height-plate*(layers+1))/layers
 for(let index=0;index<layers;index++){
  const rubber=new T.Mesh(new T.CylinderGeometry(outer/2,outer/2,each,32),mat('dark'))
  rubber.position.y=plate+each/2+index*(each+plate);rubber.name='橡胶层'
  rubber.userData.observation={schema:1,id:'rubber',name:'橡胶层',description:'外径按物料规格；层数为示意（物料还给出 ∅86 规格未建）。'}
  g.add(rubber)
 }
 for(let index=0;index<=layers;index++){const metal=new T.Mesh(new T.CylinderGeometry(outer*.42,outer*.42,plate,24),mat('steel'))
  metal.position.y=plate/2+index*(each+plate);metal.name='隔板'
  metal.userData.observation={schema:1,id:'plates',name:'隔板',description:'中间隔板为示意。'};g.add(metal)}
 return g
}
// Electrical and automation parts. Width/height/depth come from the
// manufacturer data sheet for the exact order number; terminal layout, LED
// count, heat-sink fins and casting details are illustrative.
function ioModule(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({W:spec.width,H:spec.height,D:spec.depth})){const value=Number(raw);if(!(value>0))throw Error('module needs '+key);values[key]=value}
 const W=m(values.W),H=m(values.H),D=m(values.D)
 const body=new T.Mesh(new T.BoxGeometry(D,H,W),mat('dark'));body.position.y=H/2;body.name='模块本体'
 body.userData.observation={schema:1,id:'body',name:'模块本体',description:'宽×高×深按厂家数据表；外壳圆角/材质为示意。'}
 g.add(body)
 const front=new T.Mesh(new T.BoxGeometry(D*.10,H*.86,W*.9),mat('blue'));front.position.set(D*.52,H/2,0);front.name='前连接器'
 front.userData.observation={schema:1,id:'connector',name:'前连接器',description:'前连接器/端子排位置示意，端子数与接线未复刻。'};g.add(front)
 const leds=Math.max(2,Number(spec.leds)||4)
 for(let index=0;index<leds;index++){const led=new T.Mesh(new T.BoxGeometry(.003,.004,.003),mat('green'))
  led.position.set(D*.55,H*.92-index*(H*.7/leds),W*.3);led.name='状态指示'
  led.userData.observation={schema:1,id:'leds',name:'状态指示',description:'LED 数量与位置为示意。'};g.add(led)}
 const clip=new T.Mesh(new T.BoxGeometry(.008,H*.5,W*.8),mat('steel'));clip.position.set(-D*.53,H*.55,0);clip.name='安装卡扣'
 clip.userData.observation={schema:1,id:'mount',name:'安装卡扣',description:'DIN 导轨/安装卡扣结构为示意。'};g.add(clip)
 if(spec.heatsink){for(let index=0;index<6;index++){const fin=new T.Mesh(new T.BoxGeometry(D*.7,.004,W*.9),mat('bright'))
  fin.position.set(0,.006+index*(H*.7/6),0);fin.name='散热片'
  fin.userData.observation={schema:1,id:'heatsink',name:'散热片',description:'功率模块散热片为示意，片数与间距未证。'};g.add(fin)}}
 return g
}
function sensorUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({W:spec.width,H:spec.height,L:spec.length})){const value=Number(raw);if(!(value>0))throw Error('sensor needs '+key);values[key]=value}
 const W=m(values.W),H=m(values.H),L=m(values.L)
 const body=new T.Mesh(new T.BoxGeometry(L,H,W),mat('blue'));body.position.y=H/2;body.name='传感器本体'
 body.userData.observation={schema:1,id:'body',name:'传感器本体',description:'宽×高×长按厂家数据表；外壳与安装孔为示意。'}
 g.add(body)
 const windowMesh=new T.Mesh(new T.BoxGeometry(.004,H*.6,W*.7),mat('dark'));windowMesh.position.set(L/2+.002,H*.55,0);windowMesh.name='光学窗口'
 windowMesh.userData.observation={schema:1,id:'optics',name:'光学窗口',description:'窗口位置与尺寸为示意，光学参数未建模。'};g.add(windowMesh)
 const connector=new T.Mesh(new T.CylinderGeometry(W*.22,W*.22,.012,20),mat('steel'));connector.rotation.z=Math.PI/2
 connector.position.set(-L/2-.006,H*.5,0);connector.name='M12接口'
 connector.userData.observation={schema:1,id:'connector',name:'M12接口',description:'接口型式按样本描述（M12 等），针脚未建模。'};g.add(connector)
 for(const side of [-1,1]){const hole=new T.Mesh(new T.CylinderGeometry(W*.09,W*.09,.004,16),mat('dark'))
  hole.rotation.z=Math.PI/2;hole.position.set(0,H*.2,side*(W*.5-W*.09));hole.name='安装孔'
  hole.userData.observation={schema:1,id:'mount',name:'安装孔',description:'安装孔位置为示意。'};g.add(hole)}
 return g
}
function safetyValve(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const dn=m(spec.dn),flangeOd=m(spec.flangeOd),boltCircle=m(spec.boltCircle),boltHole=m(spec.boltHole)||.018,height=m(spec.height)||.30
 if(!(dn>0&&flangeOd>0&&boltCircle>0))throw Error('valve needs dn and flange dimensions')
 const flangeShape=()=>{const shape=new T.Shape();shape.absarc(0,0,flangeOd/2,0,Math.PI*2,false)
  for(let index=0;index<4;index++){const angle=Math.PI/4+index*Math.PI/2,hole=new T.Path()
   hole.absarc(Math.cos(angle)*boltCircle/2,Math.sin(angle)*boltCircle/2,boltHole/2,0,Math.PI*2,true);shape.holes.push(hole)}return shape}
 const bodyHeight=height*.45
 const inletGeo=new T.ExtrudeGeometry(flangeShape(),{depth:.018,bevelEnabled:false,curveSegments:40})
 inletGeo.rotateX(Math.PI/2);inletGeo.translate(0,-.009,0)
 add(g,inletGeo,'steel',[0,0,0],undefined,part('flanges','进出口法兰','法兰外径/螺栓孔按 PN16 DN 标准；法兰厚度为示意。'))
 const body=new T.Mesh(new T.CylinderGeometry(dn*.62,dn*.62,bodyHeight,32),mat('steel'));body.position.y=bodyHeight/2;body.name='阀体'
 body.userData.observation={schema:1,id:'body',name:'阀体',description:'阀体按公称通径示意；流道与密封结构未建模。'};g.add(body)
 const bonnet=new T.Mesh(new T.CylinderGeometry(dn*.42,dn*.55,height*.4,28),mat('steel'));bonnet.position.y=bodyHeight+height*.2;bonnet.name='阀盖'
 bonnet.userData.observation={schema:1,id:'bonnet',name:'阀盖',description:'阀盖与弹簧罩外形为示意，整定压力按资料不入模型。'};g.add(bonnet)
 const lever=new T.Mesh(new T.BoxGeometry(dn*.9,.012,.03),mat('gold'));lever.position.set(dn*.35,height*.92,0);lever.name='提升手柄'
 lever.userData.observation={schema:1,id:'lever',name:'提升手柄',description:'手柄位置与长度示意。'};g.add(lever)
 const topGeo=new T.ExtrudeGeometry(flangeShape(),{depth:.016,bevelEnabled:false,curveSegments:40})
 topGeo.rotateX(Math.PI/2)
 const top=new T.Mesh(topGeo,mat('steel'))
 top.position.y=bodyHeight+height*.4;top.name='出口法兰'
 top.userData.observation={schema:1,id:'flanges',name:'出口法兰',description:'出口法兰按标准法兰尺寸示意。'};g.add(top)
 return g
}
function electricCylinder(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const stroke=m(spec.stroke),bodyDiameter=m(spec.bodyDiameter)||.06,rodDiameter=m(spec.rodDiameter)||.025
 if(!(stroke>0))throw Error('electric cylinder needs stroke')
 const bodyLength=stroke+bodyDiameter*5
 const body=new T.Mesh(new T.CylinderGeometry(bodyDiameter/2,bodyDiameter/2,bodyLength,32),mat('bright'))
 body.rotation.z=Math.PI/2;body.position.x=bodyLength/2;body.name='电动缸体'
 body.userData.observation={schema:1,id:'body',name:'电动缸体',description:'行程按物料规格；缸体长度与直径未给出，为示意。'}
 g.add(body)
 const rod=new T.Mesh(new T.CylinderGeometry(rodDiameter/2,rodDiameter/2,stroke,24),mat('steel'))
 rod.rotation.z=Math.PI/2;rod.position.x=bodyLength+stroke/2;rod.name='推杆'
 rod.userData.observation={schema:1,id:'rod',name:'推杆',description:'行程 450 mm 按物料规格；推杆伸出量为行程示意。'};g.add(rod)
 const motor=new T.Mesh(new T.CylinderGeometry(bodyDiameter*.42,bodyDiameter*.42,bodyDiameter*1.4,24),mat('dark'))
 motor.rotation.z=Math.PI/2;motor.position.set(-bodyDiameter*.4,bodyDiameter*.55,0);motor.name='驱动电机'
 motor.userData.observation={schema:1,id:'motor',name:'驱动电机',description:'功率/推力按物料规格；机座与减速结构为示意。'};g.add(motor)
 for(const [x,label] of [[bodyDiameter*.6,'后端盖'],[bodyLength-bodyDiameter*.6,'前端盖']]){
  const cap=new T.Mesh(new T.CylinderGeometry(bodyDiameter*.56,bodyDiameter*.56,bodyDiameter*.18,28),mat('blue'))
  cap.rotation.z=Math.PI/2;cap.position.x=x;cap.name=label
  cap.userData.observation={schema:1,id:'caps',name:label,description:'端盖外形示意。'};g.add(cap)}
 return g
}
// Low-voltage modular devices (MCB / fuse holder), motor protection breaker
// and molded-case breaker. Width/height/depth come from the standard modular
// pitch or the manufacturer datasheet; terminals, labels and internals are
// illustrative.
function dinDevice(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const values={}
 for(const [key,raw] of Object.entries({W:spec.width,H:spec.height,D:spec.depth})){const value=Number(raw);if(!(value>0))throw Error('din device needs '+key);values[key]=value}
 const W=m(values.W),H=m(values.H),D=m(values.D)
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('white'));body.position.set(0,H/2,0);body.name='绝缘壳体'
 body.userData.observation={schema:1,id:'body',name:'绝缘壳体',description:'宽×高×深按 DIN 模数/厂家数据表；壳体颜色与内部触头为示意。'}
 g.add(body)
 const handle=new T.Mesh(new T.BoxGeometry(W*.32,H*.20,.012),mat('dark'));handle.position.set(0,H*.55,D/2+.006);handle.name=spec.deviceName||'操作手柄'
 handle.userData.observation={schema:1,id:'handle',name:spec.deviceName||'操作手柄',description:spec.role==='display'?'显示区域位置与大小为示意，显示内容未建模。':'手柄/拨杆位置与形状为示意，分合状态未建模。'};g.add(handle)
 for(const y of [H*.08,H*.92]){const terminal=new T.Mesh(new T.BoxGeometry(W*.8,H*.06,D*.5),mat('steel'));terminal.position.set(0,y,-D*.1);terminal.name='接线端'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端',description:'上下接线端位置为示意，端子数与额定值按物料资料记录。'};g.add(terminal)}
 const clip=new T.Mesh(new T.BoxGeometry(W*.7,H*.35,.01),mat('steel'));clip.position.set(0,H*.5,-D/2-.005);clip.name='DIN卡扣'
 clip.userData.observation={schema:1,id:'mount',name:'DIN卡扣',description:'DIN 导轨卡扣位置与结构为示意，未按实物卡扣复刻。'};g.add(clip)
 return g
}
function motorProtector(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth)
 if(!(W>0&&H>0&&D>0))throw Error('motor protector needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.set(0,H/2,0);body.name='壳体'
 body.userData.observation={schema:1,id:'body',name:'壳体',description:'宽×高×深按 Schneider GV2 数据表；内部热磁机构未建模。'};g.add(body)
 const dial=new T.Mesh(new T.CylinderGeometry(W*.22,W*.22,.01,24),mat('bright'));dial.rotation.x=Math.PI/2;dial.position.set(0,H*.62,D/2+.005);dial.name='整定旋钮'
 dial.userData.observation={schema:1,id:'dial',name:'整定旋钮',description:'整定范围按物料资料（如 1-1.6A），旋钮刻度为示意。'};g.add(dial)
 for(const y of [H*.1,H*.9]){const terminal=new T.Mesh(new T.BoxGeometry(W*.85,H*.07,D*.5),mat('steel'));terminal.position.set(0,y,-D*.1);terminal.name='接线端'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端',description:'接线端位置为示意。'};g.add(terminal)}
 const clip=new T.Mesh(new T.BoxGeometry(W*.7,H*.4,.01),mat('steel'));clip.position.set(0,H*.5,-D/2-.005);clip.name='DIN卡扣'
 clip.userData.observation={schema:1,id:'mount',name:'DIN卡扣',description:'DIN 卡扣位置与结构为示意，未按实物卡扣复刻。'};g.add(clip)
 return g
}
function mccb(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth),poles=Number(spec.poles)||3
 if(!(W>0&&H>0&&D>0))throw Error('mccb needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.set(0,H/2,0);body.name='塑壳'
 body.userData.observation={schema:1,id:'body',name:'塑壳',description:'宽×高×深按厂家数据表；内部脱扣机构未建模。'};g.add(body)
 const handle=new T.Mesh(new T.BoxGeometry(W*.22,H*.22,.02),mat('white'));handle.position.set(0,H*.62,D/2+.01);handle.name='操作手柄'
 handle.userData.observation={schema:1,id:'handle',name:'操作手柄',description:'手柄位置与分合状态为示意。'};g.add(handle)
 for(let index=0;index<poles;index++){const pitch=W/poles,barrier=new T.Mesh(new T.BoxGeometry(.004,H*.22,D*.9),mat('blue'))
  barrier.position.set(-W/2+pitch*(index+1),H*.32,0);barrier.name='极间隔板'
  barrier.userData.observation={schema:1,id:'poles',name:'极间隔板',description:'极数与间隔示意，额定电流按物料资料。'};g.add(barrier)}
 for(const y of [H*.05,H*.95]){const terminal=new T.Mesh(new T.BoxGeometry(W*.8,H*.08,D*.6),mat('steel'));terminal.position.set(0,y,-D*.1);terminal.name='接线端'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端',description:'进出线端子为示意。'};g.add(terminal)}
 for(const x of [-W*.35,W*.35])for(const y of [H*.12,H*.88]){const hole=new T.Mesh(new T.CylinderGeometry(.006,.006,.004,16),mat('dark'))
  hole.rotation.x=Math.PI/2;hole.position.set(x,y,-D/2);hole.name='安装孔'
  hole.userData.observation={schema:1,id:'mount',name:'安装孔',description:'背板安装孔位置与数量为示意，未按实物复刻。'};g.add(hole)}
 return g
}
// Rotary shaft oil seal and threaded temperature probe. The seal inner/outer
// diameter and width come from the material description; lip profile and spring
// are illustrative. The probe thread and lead length come from the description.
function oilSeal(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const inner=m(spec.innerDiameter)/2,outer=m(spec.outerDiameter)/2,width=m(spec.width)
 if(!(inner>0&&outer>inner&&width>0))throw Error('oil seal needs inner/outer/width')
 const ringProfile=[[outer-width*.22,-width/2],[outer,-width/2],[outer,width/2],[outer-width*.22,width/2],[outer-width*.22,-width/2]].map(point=>new T.Vector2(point[0],point[1]))
 const caseMesh=new T.Mesh(new T.LatheGeometry(ringProfile,64),mat('dark'));caseMesh.rotation.x=Math.PI/2;caseMesh.name='外圈骨架'
 caseMesh.userData.observation={schema:1,id:'case',name:'外圈骨架',description:'内径/外径/宽度按物料规格；外圈截面与包胶为示意。'}
 g.add(caseMesh)
 const lipProfile=[[inner,-width*.30],[inner+width*.28,-width*.14],[inner+width*.34,0],[inner+width*.12,width*.30],[inner,width*.34],[inner,-width*.30]].map(point=>new T.Vector2(point[0],point[1]))
 const lip=new T.Mesh(new T.LatheGeometry(lipProfile,64),mat('rubber'===null?'dark':'dark'));lip.rotation.x=Math.PI/2;lip.name='密封唇'
 lip.userData.observation={schema:1,id:'lip',name:'密封唇',description:'唇口角度与过盈量为示意，介质/转速等级未证。'};g.add(lip)
 const spring=new T.Mesh(new T.TorusGeometry(inner+width*.30,width*.05,8,48),mat('bright'));spring.position.z=width*.18;spring.name='弹簧'
 spring.userData.observation={schema:1,id:'spring',name:'弹簧',description:'唇口弹簧为示意，未按实物圈数建模。'};g.add(spring)
 return g
}
function temperatureProbe(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const thread=m(spec.threadDiameter)||.005,sheath=m(spec.sheathDiameter)||.004,sheathLength=m(spec.sheathLength)||.05,lead=m(spec.leadLength)||1.5
 const stud=new T.Mesh(new T.CylinderGeometry(thread/2,thread/2,m(6),20),mat('steel'));stud.position.y=sheathLength+m(3);stud.name='螺纹接头'
 stud.userData.observation={schema:1,id:'thread',name:'螺纹接头',description:'螺纹规格按物料（M5×1.5M 记录，长度解释待确认）；不建牙型。'};g.add(stud)
 const nut=new T.Mesh(new T.CylinderGeometry(thread*.9,thread*.9,m(4),6),mat('bright'));nut.position.y=sheathLength+m(.5);nut.name='锁紧螺母'
 nut.userData.observation={schema:1,id:'nut',name:'锁紧螺母',description:'锁紧螺母为示意。'};g.add(nut)
 const tube=new T.Mesh(new T.CylinderGeometry(sheath/2,sheath/2,sheathLength,20),mat('bright'));tube.position.y=sheathLength/2;tube.name='保护套管'
 tube.userData.observation={schema:1,id:'sheath',name:'保护套管',description:'套管直径/长度未给出，为示意；分度号与量程按物料资料。'};g.add(tube)
 const leadCurve=new T.CatmullRomCurve3([new T.Vector3(0,sheathLength+m(6),0),new T.Vector3(lead*.06,sheathLength+m(12),0),new T.Vector3(lead*.03,sheathLength+m(12)+lead*.10,lead*.02),new T.Vector3(-lead*.04,sheathLength+m(8)+lead*.10,0)])
 const cable=new T.Mesh(new T.TubeGeometry(leadCurve,40,.003,8,false),mat('dark'));cable.name='引线'
 cable.userData.observation={schema:1,id:'cable',name:'引线',description:'引线长度按物料规格（1.5 m），走向为示意。'};g.add(cable)
 return g
}
// DIN-rail industrial Ethernet switch: body, RJ45 ports, power terminals and
// DIN clip. Envelope from the manufacturer datasheet; port layout illustrative.
function networkSwitch(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth),ports=Number(spec.ports)||8
 if(!(W>0&&H>0&&D>0))throw Error('switch needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.set(0,H/2,0);body.name='壳体'
 body.userData.observation={schema:1,id:'body',name:'壳体',description:'宽×高×深按厂家数据表；外壳材质与散热孔为示意。'};g.add(body)
 const row=Math.ceil(ports/2)
 for(let index=0;index<ports;index++){
  const column=index<row?0:1,line=index%row
  const port=new T.Mesh(new T.BoxGeometry(W*.28,H*.12,.012),mat('steel'))
  port.position.set(-W*.22+column*W*.44,-H*.18+line*(H*.16),D/2+.006)
  port.name='以太网口'
  port.userData.observation={schema:1,id:'ports',name:'以太网口',description:'端口数量与型式按物料（含 SFP 口），排列为示意。'};g.add(port)
 }
 const power=new T.Mesh(new T.BoxGeometry(W*.2,H*.1,.01),mat('bright'));power.position.set(W*.3,-H*.35,D/2+.005);power.name='电源端子'
 power.userData.observation={schema:1,id:'power',name:'电源端子',description:'24VDC 电源端子为示意。'};g.add(power)
 const clip=new T.Mesh(new T.BoxGeometry(W*.6,H*.35,.01),mat('steel'));clip.position.set(0,H*.5,-D/2-.005);clip.name='DIN卡扣'
 clip.userData.observation={schema:1,id:'mount',name:'DIN卡扣',description:'DIN 导轨卡扣位置为示意，未按实物卡扣复刻。'};g.add(clip)
 return g
}
// V-belts (A/B/Z/SPB profiles) and roller chains (16A/16B). Profile sizes and
// pitch lengths follow the public belt/chain standards; chain link count, pulley
// geometry and plate chamfers are illustrative.
function vBelt(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const pitchLength=m(spec.pitchLength),top=m(spec.topWidth),height=m(spec.height),bottom=top*.55
 if(!(pitchLength>0&&top>0&&height>0))throw Error('v-belt needs pitch length/profile')
 const neutral=pitchLength/(Math.PI*2),outer=neutral+height/2,inner=neutral-height/2
 const profile=[[inner,-bottom/2],[outer,-top/2],[outer,top/2],[inner,bottom/2],[inner,-bottom/2]].map(point=>new T.Vector2(point[0],point[1]))
 const belt=new T.Mesh(new T.LatheGeometry(profile,128),mat('dark'));belt.rotation.x=Math.PI/2;belt.name='V带带体'
 belt.userData.observation={schema:1,id:'belt',name:'V带带体',description:'截面与基准长度按公开标准（A/B/Z/SPB）；闭合形状按圆环近似，两轮中心距未给出。'}
 g.add(belt)
 return g
}
function rollerChain(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const pitch=m(spec.pitch),roller=m(spec.rollerDiameter),plateHeight=m(spec.plateHeight),links=Math.max(1,Number(spec.links)||20),strands=Math.max(1,Number(spec.strands)||1),innerWidth=m(spec.innerWidth)||m(15.75)
 if(!(pitch>0&&roller>0&&plateHeight>0))throw Error('chain needs pitch/roller/plate height')
 for(let link=0;link<links;link++){
  const x=link*pitch
  for(let strand=0;strand<strands;strand++){
   const offset=(strand-(strands-1)/2)*(innerWidth+m(.012))
   for(const side of [-1,1]){
    const plate=new T.Mesh(new T.BoxGeometry(pitch*.92,plateHeight,innerWidth*.28),mat('steel'))
    plate.position.set(x+pitch/2,0,offset+side*innerWidth*.62);plate.name='链板'
    plate.userData.observation={schema:1,id:'plates',name:'链板',description:'链板高度与排数按标准，链板倒角与孔形为示意。'};g.add(plate)
   }
   const rollerMesh=new T.Mesh(new T.CylinderGeometry(roller/2,roller/2,innerWidth,16),mat('bright'))
   rollerMesh.rotation.x=Math.PI/2;rollerMesh.position.set(x,0,offset);rollerMesh.name='滚子'
   rollerMesh.userData.observation={schema:1,id:'rollers',name:'滚子',description:'滚子直径按标准，内孔与套筒未建。'};g.add(rollerMesh)
   const pin=new T.Mesh(new T.CylinderGeometry(m(.00396),m(.00396),innerWidth+m(.02),12),mat('dark'))
   pin.rotation.x=Math.PI/2;pin.position.set(x,0,offset);pin.name='销轴'
   pin.userData.observation={schema:1,id:'pins',name:'销轴',description:'销轴直径为示意。'};g.add(pin)
  }
 }
 return g
}
// M30 barrel inductive sensor and Kuebler incremental encoder. Barrel diameter
// and length come from the datasheet; encoder flange/shaft come from the series
// table while body length and internal electronics are illustrative.
function barrelSensor(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const diameter=m(spec.diameter)||.030,length=m(spec.length)||.044
 const body=new T.Mesh(new T.CylinderGeometry(diameter/2,diameter/2,length,32),mat('bright'))
 body.rotation.z=Math.PI/2;body.position.x=length/2;body.name='感应面外壳'
 body.userData.observation={schema:1,id:'body',name:'感应面外壳',description:'M30 圆柱外壳，直径与长度按厂家数据表；感应面位置为示意。'}
 g.add(body)
 for(const x of [length*.18,length*.82]){
  const nut=new T.Mesh(new T.CylinderGeometry(diameter*.45,diameter*.45,m(5),6),mat('steel'))
  nut.rotation.z=Math.PI/2;nut.position.x=x;nut.name='锁紧螺母'
  nut.userData.observation={schema:1,id:'nuts',name:'锁紧螺母',description:'两只安装螺母为示意。'};g.add(nut)
 }
 const connector=new T.Mesh(new T.CylinderGeometry(diameter*.22,diameter*.22,m(12),20),mat('dark'))
 connector.rotation.z=Math.PI/2;connector.position.x=-m(6);connector.name='M12接口'
 connector.userData.observation={schema:1,id:'connector',name:'M12接口',description:'M12 插头位置示意，针脚未建。'};g.add(connector)
 const led=new T.Mesh(new T.CylinderGeometry(m(1.5),m(1.5),m(2),12),mat('green'))
 led.rotation.z=Math.PI/2;led.position.x=length-m(2);led.name='状态指示'
 led.userData.observation={schema:1,id:'led',name:'状态指示',description:'LED 位置为示意。'};g.add(led)
 return g
}
function encoderUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const flange=m(spec.flangeDiameter)||.058,shaft=m(spec.shaftDiameter)||.010,shaftLength=m(spec.shaftLength)||.020,bodyLength=m(spec.bodyLength)||.046
 const body=new T.Mesh(new T.CylinderGeometry(flange/2*.78,flange/2*.78,bodyLength,40),mat('dark'))
 body.rotation.z=Math.PI/2;body.position.x=bodyLength/2;body.name='编码器本体'
 body.userData.observation={schema:1,id:'body',name:'编码器本体',description:'法兰直径按系列表（ø58），本体长度未给出为示意；内部码盘未建模。'}
 g.add(body)
 const flangeMesh=new T.Mesh(new T.CylinderGeometry(flange/2,flange/2,m(3),40),mat('steel'))
 flangeMesh.rotation.z=Math.PI/2;flangeMesh.position.x=-m(1.5);flangeMesh.name='法兰'
 flangeMesh.userData.observation={schema:1,id:'flange',name:'法兰',description:'ø58 同步法兰按样本选型表；安装孔位置为示意。'};g.add(flangeMesh)
 const shaftMesh=new T.Mesh(new T.CylinderGeometry(shaft/2,shaft/2,shaftLength,20),mat('bright'))
 shaftMesh.rotation.z=Math.PI/2;shaftMesh.position.x=-m(1.5)-shaftLength/2;shaftMesh.name='轴'
 shaftMesh.userData.observation={schema:1,id:'shaft',name:'轴',description:'轴 ø10×20 mm 按样本选型表。'};g.add(shaftMesh)
 const cable=new T.Mesh(new T.CylinderGeometry(m(4),m(4),m(30),16),mat('dark'))
 cable.rotation.z=Math.PI/2;cable.position.x=bodyLength+m(15);cable.name='电缆/接头'
 cable.userData.observation={schema:1,id:'cable',name:'电缆/接头',description:'出线方向与接头型式为示意。'};g.add(cable)
 return g
}
// Enclosed limit switch (Omron D4MC style): body, plunger with roller, mounting
// holes and terminals. Body size from the datasheet drawing; terminal layout and
// casting details are illustrative.
function limitSwitch(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.bodyWidth),H=m(spec.bodyHeight),D=m(spec.bodyDepth),plunger=m(spec.plungerDiameter)||.0127,projection=m(spec.plungerProjection)||.015
 if(!(W>0&&H>0&&D>0))throw Error('limit switch needs body dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.y=H/2;body.name='开关本体'
 body.userData.observation={schema:1,id:'body',name:'开关本体',description:'本体宽×高×深按样本图纸；外壳与端子为示意。'};g.add(body)
 const plungerMesh=new T.Mesh(new T.CylinderGeometry(plunger/2,plunger/2,projection,20),mat('bright'))
 plungerMesh.position.y=H+projection/2;plungerMesh.name='柱塞'
 plungerMesh.userData.observation={schema:1,id:'plunger',name:'柱塞',description:'柱塞直径与伸出量按图纸标注；行程与动作特性不入模型。'};g.add(plungerMesh)
 const roller=new T.Mesh(new T.CylinderGeometry(plunger*.55,plunger*.55,plunger*.5,20),mat('steel'))
 roller.rotation.z=Math.PI/2;roller.position.y=H+projection;roller.name='滚轮'
 roller.userData.observation={schema:1,id:'roller',name:'滚轮',description:'滚轮直径按型号（D4MC-5040 为滚轮柱塞）；支撑结构简化。'};g.add(roller)
 for(const x of [-W*.3,W*.3]){const hole=new T.Mesh(new T.CylinderGeometry(m(2.15),m(2.15),D*.96,12),mat('dark'))
  hole.rotation.x=Math.PI/2;hole.position.set(x,H*.2,0);hole.name='安装孔'
  hole.userData.observation={schema:1,id:'mount',name:'安装孔',description:'两个 ø4.3 安装孔位置按图纸，孔位公差未证。'};g.add(hole)}
 const terminal=new T.Mesh(new T.BoxGeometry(W*.6,H*.12,D*.6),mat('steel'));terminal.position.set(0,H*.05,0);terminal.name='端子部'
 terminal.userData.observation={schema:1,id:'terminals',name:'端子部',description:'端子位置与数量为示意，接线方式按样本。'};g.add(terminal)
 return g
}
// Contactor, safety laser scanner and 96x96 panel meter. Envelopes come from
// manufacturer datasheets or the DIN 43700 front size; terminals/optics are
// illustrative.
function contactorUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth)
 if(!(W>0&&H>0&&D>0))throw Error('contactor needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.set(0,H/2,0);body.name='接触器本体'
 body.userData.observation={schema:1,id:'body',name:'接触器本体',description:'宽×高×深按 Schneider LC1N 数据表；内部触头/线圈未建模。'};g.add(body)
 for(let index=0;index<3;index++){const pole=new T.Mesh(new T.BoxGeometry(W*.18,H*.12,D*.7),mat('steel'))
  pole.position.set(-W*.28+index*W*.28,H*.9,-D*.05);pole.name='主触头端子'
  pole.userData.observation={schema:1,id:'terminals',name:'主触头端子',description:'三极主端子位置为示意。'};g.add(pole)}
 const coil=new T.Mesh(new T.BoxGeometry(W*.5,H*.1,D*.4),mat('blue'));coil.position.set(0,H*.09,-D*.1);coil.name='线圈端子'
 coil.userData.observation={schema:1,id:'coil',name:'线圈端子',description:'A1/A2 线圈端子为示意。'};g.add(coil)
 const aux=new T.Mesh(new T.BoxGeometry(W*.5,H*.08,D*.3),mat('bright'));aux.position.set(0,H*.9,D*.42);aux.name='辅助触头'
 aux.userData.observation={schema:1,id:'aux',name:'辅助触头',description:'辅助触头位置为示意，触点数量按型号。'};g.add(aux)
 return g
}
function areaScanner(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth)
 if(!(W>0&&H>0&&D>0))throw Error('scanner needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.y=H/2;body.name='扫描器本体'
 body.userData.observation={schema:1,id:'body',name:'扫描器本体',description:'宽×高×深按 SICK 数据表；光学窗口与接口为示意。'};g.add(body)
 const windowMesh=new T.Mesh(new T.BoxGeometry(W*.8,H*.55,.004),mat('bright'));windowMesh.position.set(0,H*.5,D/2+.002);windowMesh.name='激光窗口'
 windowMesh.userData.observation={schema:1,id:'optics',name:'激光窗口',description:'扫描窗口位置为示意。'};g.add(windowMesh)
 for(const side of [-1,1]){const connector=new T.Mesh(new T.CylinderGeometry(W*.09,W*.09,.012,20),mat('steel'))
  connector.rotation.x=Math.PI/2;connector.position.set(side*W*.28,H*.2,-D/2-.006);connector.name='M12接口'
  connector.userData.observation={schema:1,id:'connectors',name:'M12接口',description:'接口数量与位置为示意。'};g.add(connector)}
 return g
}
function panelMeter(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const front=m(spec.front)||.096,depth=m(spec.depth)||.080
 const body=new T.Mesh(new T.BoxGeometry(front,front,depth),mat('dark'));body.position.z=depth/2;body.name='表体'
 body.userData.observation={schema:1,id:'body',name:'表体',description:'面框 96×96 mm 按 DIN 43700；深度未给出按80 mm 示意。'};g.add(body)
 const screen=new T.Mesh(new T.BoxGeometry(front*.62,front*.42,.004),mat('blue'));screen.position.set(0,front*.14,depth+.002);screen.name='显示屏'
 screen.userData.observation={schema:1,id:'display',name:'显示屏',description:'显示区域为示意，实际为数码管/液晶。'};g.add(screen)
 for(let row=0;row<3;row++)for(let column=0;column<3;column++){const key=new T.Mesh(new T.BoxGeometry(front*.12,front*.08,.004),mat('white'))
  key.position.set(-front*.25+column*front*.25,-front*.14-row*front*.1,depth+.002);key.name='按键'
  key.userData.observation={schema:1,id:'keys',name:'按键',description:'按键数量与排列为示意。'};g.add(key)}
 return g
}
// IEC-frame induction motor: shaft height H, foot hole spacing A (axial) x B
// (transverse), shaft D x E from the IEC 60072 frame chart. Body length, terminal
// box and fan cowl are illustrative because the manufacturer outline is not given.
function iecMotor(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const H=m(spec.shaftHeight),A=m(spec.footAxial),B=m(spec.footTransverse),D=m(spec.shaftDiameter),E=m(spec.shaftLength)
 if(!(H>0&&A>0&&B>0&&D>0&&E>0))throw Error('iec motor needs H/A/B/D/E')
 const bodyRadius=H*.78
 const bodyLength=A*1.55
 const body=new T.Mesh(new T.CylinderGeometry(bodyRadius,bodyRadius,bodyLength,40),mat('blue'))
 body.rotation.z=Math.PI/2;body.position.set(0,H,0);body.name='机壳'
 body.userData.observation={schema:1,id:'body',name:'机壳',description:'机座号按 IEC 60072 尺寸表（H/A/B/D/E）；机壳直径与长度未给出，为示意。'};g.add(body)
 for(let index2=0;index2<14;index2++){const angle=index2*Math.PI*2/14
  const fin=new T.Mesh(new T.BoxGeometry(bodyLength*.92,.03,.02),mat('blue'))
  fin.position.set(0,H+Math.cos(angle)*(bodyRadius+.015),Math.sin(angle)*(bodyRadius+.015))
  fin.rotation.x=-angle;fin.name='散热筋'
  fin.userData.observation={schema:1,id:'fins',name:'散热筋',description:'散热筋数量、间距与形状均未证，为示意。'};g.add(fin)}
 const terminal=new T.Mesh(new T.BoxGeometry(bodyLength*.35,H*.35,H*.5),mat('dark'));terminal.position.set(-bodyLength*.1,H+bodyRadius*.9,0);terminal.name='接线盒'
 terminal.userData.observation={schema:1,id:'terminal',name:'接线盒',description:'接线盒位置与大小示意，内部端子未建。'};g.add(terminal)
 const cowl=new T.Mesh(new T.CylinderGeometry(bodyRadius*.92,bodyRadius*.92,bodyLength*.16,32),mat('dark'))
 cowl.rotation.z=Math.PI/2;cowl.position.set(-bodyLength*.58,H,0);cowl.name='风罩'
 cowl.userData.observation={schema:1,id:'fan-cover',name:'风罩',description:'风罩外形与长度未证为示意，通风口与防护网未建。'};g.add(cowl)
 const shaft=new T.Mesh(new T.CylinderGeometry(D/2,D/2,E,24),mat('bright'))
 shaft.rotation.z=Math.PI/2;shaft.position.set(bodyLength/2+E/2,H,0);shaft.name='输出轴'
 shaft.userData.observation={schema:1,id:'shaft',name:'输出轴',description:'轴伸 D×E 与轴心高 H 按 IEC 60072 尺寸表。'};g.add(shaft)
 const footHeight=Math.max(.015,H*.1),footThickness=A*.08
 for(const side of [-1,1]){
  const foot=new T.Mesh(new T.BoxGeometry(A*.86,footHeight,B*.28),mat('blue'))
  foot.position.set(0,footHeight/2,side*B/2);foot.name='安装底脚'
  foot.userData.observation={schema:1,id:'feet',name:'安装底脚',description:'底脚孔距 A×B 与轴心高 H 按 IEC 60072 尺寸表；底脚形状为示意。'};g.add(foot)
  for(const x of [-A/2,A/2]){const hole=new T.Mesh(new T.CylinderGeometry(footThickness/2,footThickness/2,footHeight*1.02,12),mat('dark'))
   hole.position.set(x,footHeight/2,side*B/2);hole.name='地脚孔'
   hole.userData.observation={schema:1,id:'feet',name:'安装底脚',description:'地脚孔位置按 A×B 孔距，孔径为示意。'};g.add(hole)}
 }
 return g
}
// DIN-rail power supply and compact VFD. Envelopes from the manufacturer data
// sheet; terminal layout, LEDs and heat-sink fins are illustrative.
function powerSupply(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth)
 if(!(W>0&&H>0&&D>0))throw Error('power supply needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.set(0,H/2,0);body.name='电源壳体'
 body.userData.observation={schema:1,id:'body',name:'电源壳体',description:'宽×高×深按明纬 NDR 数据表；内部电路与散热结构为示意。'};g.add(body)
 for(const y of [H*.06,H*.94]){const terminal=new T.Mesh(new T.BoxGeometry(W*.8,H*.07,D*.5),mat('steel'))
  terminal.position.set(0,y,D*.25);terminal.name='接线端子'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端子',description:'输入/输出端子位置为示意，端子数与电流按型号资料。'};g.add(terminal)}
 const led=new T.Mesh(new T.BoxGeometry(.004,.004,.002),mat('green'));led.position.set(0,H*.55,D/2+.001);led.name='指示灯'
 led.userData.observation={schema:1,id:'led',name:'指示灯',description:'DC OK 指示灯位置示意。'};g.add(led)
 const clip=new T.Mesh(new T.BoxGeometry(W*.6,H*.3,.01),mat('steel'));clip.position.set(0,H*.5,-D/2-.005);clip.name='DIN卡扣'
 clip.userData.observation={schema:1,id:'mount',name:'DIN卡扣',description:'DIN 导轨卡扣为示意。'};g.add(clip)
 return g
}
function vfdUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width),H=m(spec.height),D=m(spec.depth)
 if(!(W>0&&H>0&&D>0))throw Error('vfd needs dimensions')
 const body=new T.Mesh(new T.BoxGeometry(W,H,D*.72),mat('dark'));body.position.set(0,H/2,-D*.14);body.name='变频器本体'
 body.userData.observation={schema:1,id:'body',name:'变频器本体',description:'宽×高×深按 Schneider ATV310 数据表（深度含散热片）；内部功率器件未建模。'};g.add(body)
 const heatsink=new T.Mesh(new T.BoxGeometry(W*.86,H*.7,D*.3),mat('bright'));heatsink.position.set(0,H*.45,-D*.38);heatsink.name='散热片'
 heatsink.userData.observation={schema:1,id:'heatsink',name:'散热片',description:'散热片为示意，片数与风道未证。'};g.add(heatsink)
 const display=new T.Mesh(new T.BoxGeometry(W*.5,H*.22,.004),mat('blue'));display.position.set(0,H*.78,D*.23);display.name='显示面板'
 display.userData.observation={schema:1,id:'display',name:'显示面板',description:'显示与按键区域为示意。'};g.add(display)
 for(const y of [H*.08,H*.3]){const terminal=new T.Mesh(new T.BoxGeometry(W*.8,H*.1,D*.5),mat('steel'))
  terminal.position.set(0,y,D*.25);terminal.name='接线端子'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端子',description:'主回路/控制端子位置为示意。'};g.add(terminal)}
 return g
}
// Detailed variants used by the geometry-correction batch. They add confirmable
// category features (ribs, oil plugs, breathers, foot holes, keyways, door/hinges,
// glands, labyrinth seals, W33 groove) on top of the legacy structural shapes, so
// the geometry itself differs from the input-330 baseline.
function reducerV2(spec={}){
 const g=reducer(spec)
 g.updateMatrixWorld(true)
 const box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
 // Cooling ribs on both sides of the housing.
 for(const side of [-1,1])for(let rib=0;rib<5;rib++){
  const position=center.z+side*(size.z/2+.006),x=-size.x*.15+rib*(size.x*.07)
  const mesh=boxMesh(g,size.x*.06,size.y*.5,.012,'blue',[x,center.y,position],part('ribs','箱体散热筋','箱体侧面散热筋；数量/间距为结构示意，未按 SEW 图核对。'))
 }
 // Oil drain plug at the bottom and breather on top.
 cyl(g,.018,.02,'bright',[center.x-size.x*.2,box.min.y+.002,center.z],part('oil-plug','放油塞','放油塞位置按箱体底部示意，规格未证。'),[0,0,0])
 cyl(g,.016,.025,'gold',[center.x+size.x*.2,box.max.y+.002,center.z],part('breather','呼吸器','呼吸器位置按箱体顶部示意，规格未证。'))
 // Foot mounting holes through both feet.
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const mesh=cyl(g,.009,.05,'dark',[center.x+sx*size.x*.3,box.min.y+.03,center.z+sz*size.z*.32],part('foot-holes','地脚安装孔','地脚螺栓孔按底脚示意，孔距未按图纸核实。'))
 }
 // Output shaft key plus a raised key.
 const key=boxMesh(g,.05,.012,.018,'steel',[box.max.x+.01,center.y+.06,center.z],part('key','输出轴键','输出轴键为示意，键宽/键高未按图纸核实。'))
 g.userData.structureIllustrative=true
 return g
}
function boxMesh(g,w,h,d,color,position,part){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat(color));mesh.position.set(...position);const observation=Array.isArray(part)?{schema:1,id:part[0],name:part[1],description:part[2]}:part;mesh.name=observation.name;mesh.userData.observation=observation;g.add(mesh);return mesh}
function brakeResistor(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width)||.4,H=m(spec.height)||.3,D=m(spec.depth)||.2
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('steel'));body.position.y=H/2+.01;body.name='电阻箱体'
 body.userData.observation={schema:1,id:'body',name:'电阻箱体',description:'制动电阻箱体；无厂家尺寸资料，外形为示意。'};g.add(body)
 for(let index=0;index<8;index++){const fin=new T.Mesh(new T.BoxGeometry(.004,H*.8,D*.9),mat('bright'))
  fin.position.set(-W/2+index*W*.12,H*.55,0);fin.name='散热片'
  fin.userData.observation={schema:1,id:'fins',name:'散热片',description:'散热片数量与间距为示意，未核实。'};g.add(fin)}
 for(const x of [-W*.25,W*.25]){const terminal=new T.Mesh(new T.BoxGeometry(.03,.02,.04),mat('gold'))
  terminal.position.set(x,H*.95,0);terminal.name='接线端'
  terminal.userData.observation={schema:1,id:'terminals',name:'接线端',description:'接线端子位置为示意。'};g.add(terminal)}
 for(const sx of [-1,1])for(const sz of [-1,1]){const foot=new T.Mesh(new T.BoxGeometry(.04,.02,D*.3),mat('steel'))
  foot.position.set(sx*W*.4,.01,sz*D*.3);foot.name='安装脚'
  foot.userData.observation={schema:1,id:'feet',name:'安装脚',description:'安装脚为示意。'};g.add(foot)}
 return g
}
function junctionBox(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const W=m(spec.width)||.2,H=m(spec.height)||.15,D=m(spec.depth)||.08
 const body=new T.Mesh(new T.BoxGeometry(W,H,D),mat('dark'));body.position.y=H/2;body.name='箱体'
 body.userData.observation={schema:1,id:'body',name:'箱体',description:'防爆接线箱箱体；规格20/15 的尺寸解释未证，外形示意。'};g.add(body)
 const door=new T.Mesh(new T.BoxGeometry(W*.94,H*.9,.006),mat('dark'));door.position.set(0,H/2,D/2+.004);door.name='箱门'
 door.userData.observation={schema:1,id:'door',name:'箱门',description:'箱门与密封面为示意。'};g.add(door)
 for(const y of [H*.25,H*.75]){const hinge=new T.Mesh(new T.CylinderGeometry(.008,.008,.04,12),mat('steel'))
  hinge.rotation.z=Math.PI/2;hinge.position.set(-W*.47,y,D/2+.02);hinge.name='铰链'
  hinge.userData.observation={schema:1,id:'hinges',name:'铰链',description:'铰链位置为示意。'};g.add(hinge)}
 for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const bolt=new T.Mesh(new T.CylinderGeometry(.006,.006,.012,12),mat('bright'))
  bolt.rotation.x=Math.PI/2;bolt.position.set(sx*W*.42,H/2+sy*H*.42,D/2+.012);bolt.name='箱盖螺栓'
  bolt.userData.observation={schema:1,id:'bolts',name:'箱盖螺栓',description:'箱盖螺栓数量为示意，规格未证。'};g.add(bolt)}
 for(const x of [-W*.2,W*.2]){const gland=new T.Mesh(new T.CylinderGeometry(.018,.022,.04,16),mat('steel'))
  gland.rotation.x=Math.PI/2;gland.position.set(x,H*.1,-D/2-.02);gland.name='电缆密封接头'
  gland.userData.observation={schema:1,id:'glands',name:'电缆密封接头',description:'电缆密封接头数量/规格为示意，IP66/WF2 按台账文字。'};g.add(gland)}
 return g
}
function loadcell(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const L=m(spec.length)||.15,W=m(spec.width)||.03,H=m(spec.height)||.025
 const body=new T.Mesh(new T.BoxGeometry(L,H,W),mat('bright'));body.position.y=H/2;body.name='弹性体'
 body.userData.observation={schema:1,id:'body',name:'弹性体',description:'称重传感器弹性体；无厂家尺寸资料，外形示意。'};g.add(body)
 const boss=new T.Mesh(new T.CylinderGeometry(W*.35,W*.35,.012,24),mat('steel'));boss.position.set(0,H,W*.45);boss.name='承载凸台'
 boss.userData.observation={schema:1,id:'boss',name:'承载凸台',description:'承载凸台为示意。'};g.add(boss)
 for(const x of [-L*.32,L*.32]){const hole=new T.Mesh(new T.CylinderGeometry(.005,.005,H*1.1,16),mat('dark'))
  hole.position.set(x,H/2,0);hole.name='安装孔'
  hole.userData.observation={schema:1,id:'mount',name:'安装孔',description:'安装孔位置为示意，孔距未证。'};g.add(hole)}
 const cable=new T.Mesh(new T.CylinderGeometry(.004,.004,.35,12),mat('dark'));cable.rotation.z=Math.PI/2;cable.position.set(-L/2-.17,H*.5,0);cable.name='电缆'
 cable.userData.observation={schema:1,id:'cable',name:'电缆',description:'3 米电缆按台账文字，走向示意。'};g.add(cable)
 return g
}
function housingSeal(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const outer=m(spec.outerDiameter)||.13,inner=m(spec.innerDiameter)||.1,width=m(spec.width)||.012
 const profile=[[inner,-width/2],[outer,-width/2],[outer,width/2],[inner+.006,width/2],[inner+.006,width*.25],[inner,width*.25],[inner,-width/2]].map(point=>new T.Vector2(point[0],point[1]))
 const ringMesh=new T.Mesh(new T.LatheGeometry(profile,64),mat('dark'));ringMesh.rotation.x=Math.PI/2;ringMesh.name='迷宫密封环'
 ringMesh.userData.observation={schema:1,id:'ring',name:'迷宫密封环',description:'迷宫密封环截面为示意；TSN 型号尺寸未核。'};g.add(ringMesh)
 const casing=new T.Mesh(new T.TorusGeometry(outer-width*.2,width*.16,10,64),mat('steel'));casing.position.z=-width*.3;casing.name='外圈骨架'
 casing.userData.observation={schema:1,id:'case',name:'外圈骨架',description:'外圈骨架为示意，未按 TSN 原厂图核实。'};g.add(casing)
 const felt=new T.Mesh(new T.TorusGeometry((inner+outer)/2,width*.18,8,48),mat('gold'));felt.position.z=width*.3;felt.name='毡圈'
 felt.userData.observation={schema:1,id:'felt',name:'毡圈',description:'毡圈为示意。'};g.add(felt)
 return g
}
function adapterSleeve(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const d1=m(spec.shaftDiameter)||.065,d2=m(spec.boreDiameter)||.075,length=m(spec.length)||.055
 const profile=[[d1/2,-length/2],[d2/2,-length/2+.004],[d2/2,length/2-.006],[d1/2+.004,length/2],[d1/2,-length/2]].map(point=>new T.Vector2(point[0],point[1]))
 const sleeveMesh=new T.Mesh(new T.LatheGeometry(profile,64),mat('steel'));sleeveMesh.rotation.x=Math.PI/2;sleeveMesh.name='锥套'
 sleeveMesh.userData.observation={schema:1,id:'sleeve',name:'锥套',description:'锥套按 H2315 类结构；d1/d2 为示意，未按原厂表核实。'};g.add(sleeveMesh)
 const nut=new T.Mesh(new T.CylinderGeometry(d2*.78,d2*.78,length*.22,6),mat('bright'));nut.rotation.x=Math.PI/2;nut.position.z=length*.62;nut.name='锁紧螺母'
 nut.userData.observation={schema:1,id:'locknut',name:'锁紧螺母',description:'锁紧螺母为示意。'};g.add(nut)
 const washer=new T.Mesh(new T.CylinderGeometry(d2*.72,d2*.72,.004,24),mat('steel'));washer.rotation.x=Math.PI/2;washer.position.z=length*.5;washer.name='止动垫圈'
 washer.userData.observation={schema:1,id:'washer',name:'止动垫圈',description:'止动垫圈为示意。'};g.add(washer)
 for(const angle of [0,Math.PI]){const hole=new T.Mesh(new T.CylinderGeometry(.003,.003,.02,10),mat('dark'))
  hole.rotation.z=Math.PI/2;hole.position.set(Math.cos(angle)*d1*.7,Math.sin(angle)*d1*.7,0);hole.name='油孔'
  hole.userData.observation={schema:1,id:'oil-holes',name:'油孔',description:'注油孔为示意。'};g.add(hole)}
 return g
}
function sleeveV2(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const d1=m(spec.shaftDiameter)||.065,d2=m(spec.boreDiameter)||.075,length=m(spec.length)||.055
 // Tapered sleeve with a real through bore.
 ring(g,d1/2,d2/2,length,'steel',[0,0,0],part('sleeve','锥套','锥套为贯通孔，内孔 d1 与外径 d2 为示意；未按 H2315 原厂表核实。'),'z')
 // Lock nut and washer are annuli, keeping the centre open.
 ring(g,d1/2,d2/2*.92,length*.18,'bright',[0,0,length*.55],part('locknut','锁紧螺母','锁紧螺母为环形件，中心贯通。'),'z')
 ring(g,d1/2,d2/2*.86,length*.05,'steel',[0,0,length*.42],part('washer','止动垫圈','止动垫圈为环形件，中心贯通。'),'z')
 // Outer oil groove and holes sit outside the bore.
 const groove=new T.Mesh(new T.TorusGeometry(d2/2*.96,.003,8,48),mat('bright'))
 groove.position.set(0,0,length*.1);groove.name='注油槽'
 groove.userData.observation={schema:1,id:'oil-groove',name:'注油槽',description:'锥套外圆注油槽为示意。'};g.add(groove)
 for(const angle of [0,Math.PI]){
  const hole=new T.Mesh(new T.CylinderGeometry(.002,.002,.01,8),mat('dark'))
  hole.position.set(Math.cos(angle)*d2/2,Math.sin(angle)*d2/2,0);hole.rotation.z=-angle;hole.name='注油孔'
  hole.userData.observation={schema:1,id:'oil-holes',name:'注油孔',description:'锥套注油孔为示意。'};g.add(hole)
 }
 return g
}
function detailedRollerBearing(spec={}){
 const g=bearing(spec)
 const box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
 if(spec.w33!==false){
  const groove=new T.Mesh(new T.TorusGeometry(size.x*.42,.004,10,64),mat('bright'))
  groove.position.copy(center);groove.name='W33润滑槽'
  groove.userData.observation={schema:1,id:'w33-groove',name:'W33润滑槽',description:'W33 润滑槽按型号说明补充；槽宽/深度为示意。'};g.add(groove)
  for(let index=0;index<3;index++){const angle=index*Math.PI*2/3
   const hole=new T.Mesh(new T.CylinderGeometry(.002,.002,.02,10),mat('dark'))
   hole.position.set(center.x+Math.cos(angle)*size.x*.42,center.y+Math.sin(angle)*size.x*.42,center.z)
   hole.rotation.z=-angle;hole.name='润滑孔'
   hole.userData.observation={schema:1,id:'oil-holes',name:'润滑孔',description:'W33 的三个润滑孔位置为示意。'};g.add(hole)}
 }else{
  for(let index=0;index<12;index++){const angle=index*Math.PI/6
   const pocket=new T.Mesh(new T.BoxGeometry(.008,.006,.02),mat('brass'))
   pocket.position.set(center.x+Math.cos(angle)*size.x*.30,center.y+Math.sin(angle)*size.x*.30,center.z)
   pocket.rotation.z=angle;pocket.name='保持架兜孔'
   pocket.userData.observation={schema:1,id:'cage-pockets',name:'保持架兜孔',description:'黄铜保持架兜孔为结构示意，数量/形状未证。'};g.add(pocket)}
 }
 return g
}
function networkSwitchV2(spec={}){
 const g=networkSwitch(spec)
 const box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
 // Grounding screw, ventilation slots and rubber feet are confirmable switch details.
 const ground=new T.Mesh(new T.CylinderGeometry(.006,.006,.012,12),mat('gold'))
 ground.position.set(-size.x*.35,center.y-size.y*.4,center.z+size.z/2);ground.rotation.x=Math.PI/2;ground.name='接地螺钉'
 ground.userData.observation={schema:1,id:'ground',name:'接地螺钉',description:'接地螺钉位置为示意，规格未证。'};g.add(ground)
 for(let index2=0;index2<4;index2++){
  const slot=new T.Mesh(new T.BoxGeometry(size.x*.5,.006,.004),mat('dark'))
  slot.position.set(0,box.max.y-.02-index2*.012,center.z+size.z/2+size.z*.02);slot.name='散热槽'
  slot.userData.observation={schema:1,id:'vents',name:'散热槽',description:'散热槽数量/位置为示意。'};g.add(slot)
 }
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const foot=new T.Mesh(new T.CylinderGeometry(.008,.008,.006,14),mat('dark'))
  foot.position.set(sx*size.x*.35,box.min.y+.003,sz*size.z*.35);foot.name='脚垫'
  foot.userData.observation={schema:1,id:'feet',name:'脚垫',description:'脚垫为示意。'};g.add(foot)
 }
 return g
}

function screenFrame(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const w=m(spec.width)||.6,h=m(spec.height)||.5,t=m(spec.thickness)||.02
 const frame=new T.Shape()
 frame.moveTo(-w/2,-h/2);frame.lineTo(w/2,-h/2);frame.lineTo(w/2,h/2);frame.lineTo(-w/2,h/2);frame.closePath()
 const hole=new T.Path();hole.moveTo(-w/2+t,-h/2+t);hole.lineTo(-w/2+t,h/2-t);hole.lineTo(w/2-t,h/2-t);hole.lineTo(w/2-t,-h/2+t);hole.closePath()
 frame.holes.push(hole)
 const frameMesh=new T.Mesh(new T.ExtrudeGeometry(frame,{depth:.03,bevelEnabled:false}),mat('steel'));frameMesh.position.z=-.015;frameMesh.name='筛格框'
 frameMesh.userData.observation={schema:1,id:'frame',name:'筛格框',description:'平筛筛格框；无厂家尺寸资料，尺寸示意。'};g.add(frameMesh)
 for(let index2=1;index2<8;index2++){
  const bar=new T.Mesh(new T.BoxGeometry(w*.95,.006,.006),mat('bright'))
  bar.position.set(0,-h/2+h*index2/8,0);bar.name='筛条'
  bar.userData.observation={schema:1,id:'bars',name:'筛条',description:'筛条间距为示意。'};g.add(bar)
 }
 for(const y of [-h/2,h/2]){const handle=new T.Mesh(new T.BoxGeometry(.04,.02,.02),mat('dark'))
  handle.position.set(0,y,.02);handle.name='提手'
  handle.userData.observation={schema:1,id:'handles',name:'提手',description:'提手为示意。'};g.add(handle)}
 return g
}

function cageFrame(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const radius=m(spec.radius)||.2,length=m(spec.length)||1.0,bars=Number(spec.bars)||8
 for(const z of [-length/2,length/2,0]){const ringMesh=new T.Mesh(new T.TorusGeometry(radius,.006,8,48),mat('steel'))
  ringMesh.position.z=z;ringMesh.name='骨架环'
  ringMesh.userData.observation={schema:1,id:'rings',name:'骨架环',description:'笼骨架环；无厂家尺寸资料，尺寸示意。'};g.add(ringMesh)}
 for(let index2=0;index2<bars;index2++){const angle=index2*Math.PI*2/bars
  const bar=new T.Mesh(new T.CylinderGeometry(.004,.004,length,8),mat('bright'))
  bar.position.set(Math.cos(angle)*radius,Math.sin(angle)*radius,0);bar.rotation.x=Math.PI/2;bar.name='纵筋'
  bar.userData.observation={schema:1,id:'bars',name:'纵筋',description:'纵筋数量为示意。'};g.add(bar)}
 return g
}

function correctionUnit(spec={}){
 const g=new T.Group(),m=value=>value/1000
 const scale=m(spec.scale)||1
 const base=new T.Mesh(new T.BoxGeometry(.4*scale,.02*scale,.3*scale),mat('steel'));base.name='底座'
 base.userData.observation={schema:1,id:'base',name:'底座',description:'纠偏装置底座；按图纸加工但无尺寸资料，外形示意。'};g.add(base)
 const roller=new T.Mesh(new T.CylinderGeometry(.06*scale,.06*scale,.3*scale,32),mat('dark'))
 roller.rotation.z=Math.PI/2;roller.position.y=.08*scale;roller.name='纠偏辊'
 roller.userData.observation={schema:1,id:'roller',name:'纠偏辊',description:'纠偏辊为示意。'};g.add(roller)
 const cylinder=new T.Mesh(new T.CylinderGeometry(.025*scale,.025*scale,.2*scale,24),mat('blue'))
 cylinder.rotation.z=Math.PI/2;cylinder.position.set(0,.05*scale,.12*scale);cylinder.name='液压缸'
 cylinder.userData.observation={schema:1,id:'cylinder',name:'液压缸',description:'液压缸位置为示意。'};g.add(cylinder)
 for(const side of [-1,1]){const bracket=new T.Mesh(new T.BoxGeometry(.03*scale,.08*scale,.06*scale),mat('steel'))
  bracket.position.set(side*.18*scale,.04*scale,0);bracket.name='支架'
  bracket.userData.observation={schema:1,id:'brackets',name:'支架',description:'支架为示意。'};g.add(bracket)}
 return g
}

function couplingDetailed(spec={}){
 const g=coupling(spec)
 g.updateMatrixWorld(true)
 const box=new T.Box3().setFromObject(g),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
 for(let index2=0;index2<6;index2++){const angle=index2*Math.PI/3
  const bolt=new T.Mesh(new T.CylinderGeometry(.006,.006,size.x*.12,10),mat('bright'))
  bolt.rotation.z=Math.PI/2;bolt.position.set(center.x+Math.cos(angle)*size.y*.32,center.y+Math.sin(angle)*size.y*.32,center.z);bolt.name='连接螺栓'
  bolt.userData.observation={schema:1,id:'bolts',name:'连接螺栓',description:'联轴器连接螺栓为示意。'};g.add(bolt)}
 return g
}

export function createReviewedGeometry(spec={}){
 let g
 if(spec.family?.startsWith('identity-'))g=createIdentityGeometry(spec);else
 switch(spec.family){case 'bearing':g=bearing(spec);break;case 'motor':g=new T.Group();motor(g);break;case 'sleeve':g=sleeve();break;case 'housing':g=housing(spec);break;case 'cylinder':g=cylinder(spec);break;case 'reducer':g=reducer(spec);break;case 'coupling':g=coupling(spec);break;case 'belt':g=belt(spec);break;case 'chain':g=chain(spec);break;case 'electrical':g=electrical(spec);break;case 'seal':g=seal();break;case 'mounted-unit':g=mountedUnit(spec);break;case 'split-housing':g=splitHousing(spec);break;case 'profile-strip':g=profileStrip(spec);break;case 'caster':g=caster(spec);break;case 'tube-part':g=tubePart(spec);break;case 'flat-panel':g=flatPanel(spec);break;case 'roller':g=roller(spec);break;case 'backstop':g=backstop(spec);break;case 'tie-rod-cylinder':g=tieRodCylinder(spec);break;case 'profile-cylinder':g=profileCylinder(spec);break;case 'soft-duct':g=softDuct(spec);break;case 'timing-belt':g=timingBelt(spec);break;case 'burst-disc':g=burstDisc(spec);break;case 'diverter-gate':g=diverterGate(spec);break;case 'pneumatic-fitting':g=pneumaticFitting(spec);break;case 'vacuum-nozzle':g=vacuumNozzle(spec);break;case 'wire-rope':g=wireRope(spec);break;case 'drive-shaft':g=driveShaft(spec);break;case 'rubber-spring':g=rubberSpring(spec);break;case 'io-module':g=ioModule(spec);break;case 'sensor-unit':g=sensorUnit(spec);break;case 'safety-valve':g=safetyValve(spec);break;case 'electric-cylinder':g=electricCylinder(spec);break;case 'din-device':g=dinDevice(spec);break;case 'motor-protector':g=motorProtector(spec);break;case 'mccb':g=mccb(spec);break;case 'oil-seal':g=oilSeal(spec);break;case 'temperature-probe':g=temperatureProbe(spec);break;case 'network-switch':g=networkSwitch(spec);break;case 'v-belt':g=vBelt(spec);break;case 'roller-chain':g=rollerChain(spec);break;case 'barrel-sensor':g=barrelSensor(spec);break;case 'encoder-unit':g=encoderUnit(spec);break;case 'limit-switch':g=limitSwitch(spec);break;case 'contactor':g=contactorUnit(spec);break;case 'power-supply':g=powerSupply(spec);break;case 'vfd':g=vfdUnit(spec);break;case 'reducer-v2':g=reducerV2(spec);break;case 'network-switch-v2':g=networkSwitchV2(spec);break;case 'sleeve-v2':g=sleeveV2(spec);break;case 'air-prep':g=airPrep(spec);break;case 'solenoid-valve':g=solenoidValve(spec);break;case 'axial-fan':g=axialFan(spec);break;case 'vibration-motor':g=vibrationMotor(spec);break;case 'air-vibrator':g=airVibrator(spec);break;case 'bucket':g=bucketShape(spec);break;case 'wheel':g=wheelUnit(spec);break;case 'pcb':g=pcbUnit(spec);break;case 'bracket':g=bracketUnit(spec);break;case 'coil':g=coilUnit(spec);break;case 'brake-pad':g=brakePad(spec);break;case 'clutch':g=clutchUnit(spec);break;case 'bearing-cover':g=bearingCover(spec);break;case 'blower':g=blowerUnit(spec);break;case 'arc-plate':g=arcPlate(spec);break;case 'muffler':g=mufflerUnit(spec);break;case 'blade-plate':g=bladePlate(spec);break;case 'screen-frame':g=screenFrame(spec);break;case 'cage-frame':g=cageFrame(spec);break;case 'correction-unit':g=correctionUnit(spec);break;case 'coupling-detailed':g=couplingDetailed(spec);break;case 'brake-resistor':g=brakeResistor(spec);break;case 'junction-box':g=junctionBox(spec);break;case 'loadcell':g=loadcell(spec);break;case 'housing-seal':g=housingSeal(spec);break;case 'adapter-sleeve':g=adapterSleeve(spec);break;case 'bearing-detailed':g=detailedRollerBearing(spec);break;case 'area-scanner':g=areaScanner(spec);break;case 'panel-meter':g=panelMeter(spec);break;case 'iec-motor':g=iecMotor(spec);break;default:throw Error('Unreviewed geometry family '+spec.family)}
 if((spec.dimensionSource||spec.confirmedDimensionsMm)&&!g.userData.evidence){
  g.userData.evidence={schema:1,style:spec.family||'',ledgerBrand:spec.ledgerBrand||'',productModel:spec.productModel||'',dimensionSource:spec.dimensionSource||null,confirmedDimensionsMm:spec.confirmedDimensionsMm||'',unknown:spec.unknown||[]}
 }
 g.userData={...g.userData,reviewRevision:'20261023-geometry-v1',manufacturerCAD:false,quality:'外观示意',...spec.nominalDimensionsMm?{nominalDimensionsMm:spec.nominalDimensionsMm}:{}}
 return g
}

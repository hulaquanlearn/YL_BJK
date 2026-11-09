// Category and identity corrections. Metres throughout; dimensions are only
// authoritative where the accompanying plan cites the matching source.
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
const color={steel:0xa6b0ba,bright:0xdce1e4,dark:0x292e33,white:0xe6e8e8,green:0x3a8170,black:0x181b1e,blue:0x537889,brass:0xb49a6b}
function mesh(g,geo,c,p,id,name,description,rotation){const m=new T.Mesh(geo,new T.MeshStandardMaterial({color:color[c]??c,metalness:['steel','bright'].includes(c)?.72:.08,roughness:.44}));m.position.set(...p);if(rotation)m.rotation.set(...rotation);m.name=name;m.userData.observation={schema:1,id,name,description:description||name+'；外形细节为结构示意，未核实的尺寸不作为安装依据。'};g.add(m);return m}
const box=(g,w,h,d,c,p,id,name,description)=>mesh(g,new T.BoxGeometry(w,h,d),c,p,id,name,description)
const cylinder=(g,r,h,c,p,id,name,rotation,description)=>mesh(g,new T.CylinderGeometry(r,r,h,48),c,p,id,name,description,rotation)
function ring(g,ri,ro,h,c,p,id,name){const profile=[[ri,-h/2],[ro,-h/2],[ro,h/2],[ri,h/2],[ri,-h/2]].map(v=>new T.Vector2(...v));return mesh(g,new T.LatheGeometry(profile,64),c,p,id,name,undefined,[Math.PI/2,0,0])}
function sleeve(g,x,y,z,r=.008,length=.025,id='gland',name='电缆接头'){cylinder(g,r,length,'steel',[x,y,z],id,name,[Math.PI/2,0,0]);ring(g,r*.55,r,length*.15,'dark',[x,y,z+length/2],id,name)}
function terminals(g,x,y,z,count){box(g,count*.005,.009,.012,'green',[x,y,z],'terminals','接线端子');for(let i=0;i<count;i++)cylinder(g,.0015,.001,'steel',[x+(i-(count-1)/2)*.005,y+.005,z],'terminals','接线端子')}
export function createIdentityGeometry(spec){
 const g=new T.Group(),kind=spec.family.replace(/^identity-/,'')
 if(kind==='spherical-bearing'){
  const d=spec.bore,D=spec.outer,B=spec.width,ri=d/2,ro=D/2,wall=(ro-ri)*.24,orbit=(ri+ro)/2,r=(ro-ri)*.23;
  ring(g,ro-wall,ro,B,'steel',[0,0,0],'outer','外圈');
  // 1:12 diameter taper; d is the smaller nominal bore diameter.
  const large=ri+B/24,profile=[[ri,-B/2],[ri+wall,-B/2],[ri+wall,B/2],[large,B/2],[ri,-B/2]].map(v=>new T.Vector2(...v));
  mesh(g,new T.LatheGeometry(profile,64),'bright',[0,0,0],'inner','1:12锥孔内圈','22216 EK：80×140×33 mm；K 表示1:12锥孔，非带座轴承。',[Math.PI/2,0,0]);
  for(const row of [-1,1]){
   const z=row*B*.235,L=B*.39,points=[[0,-L/2],[r*.72,-L/2],[r*.97,-L*.22],[r,0],[r*.97,L*.22],[r*.72,L/2],[0,L/2]].map(v=>new T.Vector2(...v));
   for(let i=0;i<18;i++){const a=i*Math.PI/9,m=mesh(g,new T.LatheGeometry(points,16),'bright',[Math.sin(a)*orbit,Math.cos(a)*orbit,z],'rollers','双列鼓形滚子','两列鼓形滚子表达调心滚子轴承结构；滚子数量与滚道曲率为示意。');m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.sin(a)*row*.12,Math.cos(a)*row*.12,1).normalize())}
   ring(g,orbit-r*.3,orbit+r*.3,B*.035,'steel',[0,0,z-B*.14],'cage','钢板保持架');
  }
 }else if(kind==='auxiliary-contact'){
  box(g,.042,.048,.026,'black',[0,.024,0],'body','辅助触头壳体');box(g,.010,.018,.005,'dark',[0,.025,.016],'actuator','接触器联动推杆');
  for(const y of [.008,.040])for(const x of [-.012,.012]){box(g,.008,.006,.009,'steel',[x,y,.014],'terminals','触点接线端');cylinder(g,.002,.002,'bright',[x,y,.019],'screws','接线螺钉',[Math.PI/2,0,0])}
  box(g,.018,.004,.008,'dark',[0,.004,-.017],'mount','前装卡接部');
 }else if(kind==='rotary-level'){
  cylinder(g,.043,.070,'green',[0,.15,0],'head','驱动与接线壳体');cylinder(g,.046,.006,'dark',[0,.188,0],'cover','接线腔盖');
  cylinder(g,.020,.018,'steel',[0,.105,0],'process','过程安装连接',undefined,'阻旋式料位器的过程安装连接；JL90的螺纹与尺寸尚未核实。');
  cylinder(g,.005,.12,'steel',[0,.036,0],'shaft','探测转轴');box(g,.09,.032,.003,'steel',[0,-.023,0],'paddle','测量叶片','料位升高阻挡叶片转动，用于检测散料料位；不属于导轨模块。');sleeve(g,.040,.145,0);
 }else if(kind==='differential-pressure'){
  box(g,.11,.10,.045,'steel',[0,.07,0],'body','压差测量壳体');box(g,.065,.035,.004,'dark',[0,.080,.025],'display','数显窗口');
  for(const x of [-.027,.027]){cylinder(g,.006,.026,'brass',[x,.008,0],x<0?'high-port':'low-port',x<0?'高压取压口':'低压取压口');ring(g,.0025,.006,.004,'brass',[x,-.006,0],x<0?'high-port':'low-port',x<0?'高压取压口':'低压取压口').rotation.x=0}
  sleeve(g,.05,.055,0);for(const x of [-.044,.044])for(const y of [.035,.105])cylinder(g,.0025,.003,'steel',[x,y,.024],'cover-screws','盖板螺钉',[Math.PI/2,0,0]);
 }else if(kind==='regulator'){
  const w=.156,h=.09,d=.245,t=.002;
  box(g,w,t,d,'steel',[0,t/2,0],'base','安装底板');
  // Separate bars leave genuine open ventilation gaps, rather than drawn marks.
  for(const x of [-1,1])for(let i=0;i<13;i++)box(g,t,h,.008,'steel',[x*(w-t)/2,h/2,-d/2+.006+i*(d-.012)/12],'cover','通风金属护罩');
  for(let i=0;i<16;i++)box(g,.005,t,d,'steel',[-w/2+.003+i*(w-.006)/15,h-t/2,0],'cover','通风金属护罩');
  box(g,w,h,t,'steel',[0,h/2,d/2],'end','连接端面');box(g,w,h,t,'steel',[0,h/2,-d/2],'end','连接端面');
  sleeve(g,-.047,.046,.132,.011,.020,'input','同轴输入接口');terminals(g,.026,.028,.125,5);
 }else if(kind==='pickup'){
  box(g,.1596,.044,.1666,'dark',[0,.0875,0],'case','取电器封装壳体');
  for(const x of [-.058,.058])box(g,.037,.0655,.150,'black',[x,.03275,0],'core','E形磁芯与取能槽','U形取能通道为结构示意；外包络166.6×159.6×109.5mm按VAHLE E400资料。');
  for(const x of [-.0665,.0665])for(const z of [-.0425,.0425])cylinder(g,.003,.003,'steel',[x,.111,z],'mount','安装固定孔位示意');
  sleeve(g,.077,.080,0,.009,.026,'cable','同轴出线接头');
 }else if(kind==='pressure-transmitter'){
  cylinder(g,.043,.070,'blue',[0,.12,0],'head','电子接线壳体',[Math.PI/2,0,0]);cylinder(g,.046,.006,'steel',[0,.12,.039],'cover','接线腔盖',[Math.PI/2,0,0]);
  cylinder(g,.014,.056,'steel',[0,.062,0],'sensor','压力测量接头');cylinder(g,.009,.026,'steel',[0,.022,0],'process','过程引压接口');sleeve(g,.042,.125,0);
 }else if(kind==='membrane-keypad'){
  box(g,.10,.075,.0015,'black',[0,0,0],'film','薄膜面板','LCS系列薄膜按键面板，非带元件的裸电路板；具体按键排布未取得原厂图。');
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)box(g,.022,.015,.0004,'white',[(i-1)*.029,(j-1)*.020,.001],'keys','薄膜按键示意');box(g,.012,.05,.0003,'brass',[.035,-.06,-.0007],'tail','柔性引出排线');
 }else if(kind==='uf51'){
  const body=cylinder(g,.0525,.187,'white',[0,.0935,0],'body','内置天线防护外壳');body.scale.z=110/105;
  for(const y of [.003,.010]){const b=cylinder(g,.053,.003,'steel',[0,y,0],'base','底盖与密封接合面');b.scale.z=110/105}
  for(const y of [.042,.054])cylinder(g,.0015,.001,'green',[0,y,.055],'led','状态与蜂窝网络指示灯',[Math.PI/2,0,0]);
  for(const x of [-.012,.012])box(g,.016,.008,.014,'dark',[x,.003,0],'ethernet','底部双以太网接口');terminals(g,.023,.003,-.020,8);box(g,.008,.003,.004,'dark',[-.020,.003,-.020],'usb','底部USB-C接口');
 }else if(kind==='electric-cable'){
  const points=[];for(let i=0;i<=360;i++){const a=i/360*Math.PI*8;points.push(new T.Vector3(Math.cos(a)*.16,(i/360-.5)*.05,Math.sin(a)*.16))}
  mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points),256,.006,10,false),'black',[0,0,0],'jacket','电缆绝缘护套','AG3电缆线以盘绕外观示意，长度5m来自台账；芯数与端接头未核实，不画成钢丝绳。');
 }else if(kind==='fiberglass-rod'||kind==='magnetic-rod'){
  const magnetic=kind==='magnetic-rod',d=magnetic?.032:.016,l=magnetic?.730:.50;
  cylinder(g,d/2,l,magnetic?'steel':'white',[0,0,0],'rod',magnetic?'磁棒不锈钢外管':'玻璃钢吊杆',[0,0,Math.PI/2],magnetic?'直径32mm、长度730mm来自台账；不添加未证实的传动键槽。':'玻璃钢杆体；没有原厂尺寸图，长度与端部连接为示意，不画成金属驱动轴。');
  if(magnetic)for(const x of [-l/2,l/2])cylinder(g,d*.47,.002,'bright',[x,0,0],'ends','端部封口',[0,0,Math.PI/2]);
 }else if(kind==='safety-actuator'){
  const shape=new T.Shape();shape.moveTo(-.015,-.01);shape.lineTo(.015,-.01);shape.lineTo(.015,.035);shape.lineTo(.004,.045);shape.lineTo(-.004,.045);shape.lineTo(-.015,.035);shape.closePath();
  const aperture=new T.Path();aperture.absarc(0,.007,.004,0,Math.PI*2,true);shape.holes.push(aperture);mesh(g,new T.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false}),'steel',[0,0,0],'actuator','直型安全开关操作件','AZ15/16-B1为独立操作件，不含开关本体；尺寸与孔位为示意。');
 }else if(kind==='elastic-ring'){
  ring(g,.028,.043,.018,'black',[0,0,0],'elastic','除尘器弹性圈');
 }else if(kind==='track-box'){
  box(g,.22,.072,.14,'dark',[0,.036,0],'case','补偿盒封闭壳体');box(g,.224,.004,.144,'steel',[0,.074,0],'cover','密封盖板');
  for(const x of [-.095,.095])for(const z of [-.055,.055])cylinder(g,.003,.003,'steel',[x,.078,z],'screws','盖板螺钉');
  for(const x of [-.060,.060])sleeve(g,x,.035,.076,.013,.025,'connections','一次侧电缆进出接头');
 }else if(kind==='relay-socket'){
  box(g,.052,.014,.070,'black',[0,.007,0],'base','绝缘安装底座');box(g,.031,.007,.036,'dark',[0,.017,0],'socket','继电器插接座');
  for(const x of [-.021,.021])for(const z of [-.022,-.007,.007,.022]){box(g,.009,.006,.010,'steel',[x,.018,z],'terminals','接线端子');cylinder(g,.002,.002,'bright',[x,.022,z],'screws','接线螺钉')}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(g,.0015,.001,'black',[Math.cos(a)*.010,.021,Math.sin(a)*.010],'contacts','插接触点孔示意')}
  box(g,.028,.004,.010,'dark',[0,-.002,0],'mount','安装卡座');
 }else throw Error('Unknown identity geometry '+kind)
 g.userData.evidence={schema:1,style:spec.family,productModel:spec.productModel,dimensionSource:spec.dimensionSource,confirmedDimensionsMm:spec.confirmedDimensionsMm,unknown:spec.unknown||[]};g.userData.manufacturerCAD=false;return g
}

import * as THREE from 'three'

// Envelope, cover outline, wheel arch, platform, panel and lift follow the
// knowledge #21 assembly drawing (1310x700x460 mm), the body-without-covers,
// lift, drive and operator-panel figures plus the site photos. Internal
// placement and fastener detail remain illustrative, not a production CAD BOM.
export function buildAgvModel({variant='old'}={}){
 if(!['old','new'].includes(variant))throw new Error('Unknown AGV variant')
 const root=new THREE.Group();root.name='latent-agv';root.userData={family:'latent',variant,sourceKnowledgeId:21,geometryKnowledgeId:21,electricalKnowledgeId:variant==='new'?26:20,bodyEnvelopeMm:[1310,700,460],overallEnvelopeMm:variant==='old'?[1370,720,460]:[1387,720,460],envelopeNote:variant==='old'?'documented 1310x700x460 is the body envelope from #21; the modelled rubber end bumpers, end covers, side vents and corner TIM units extend the overall bounding box to 1370x720. No towing loops are modelled on the old vehicle because none of the four 2026-11-03 site photos shows a towing/tie-down ring; the real black rubber bumpers are kept. Whether the drawing tolerance already includes those protrusions is not verified.':'documented 1310x700x460 is the body envelope from #21; the modelled towing loops and rubber bumpers extend the overall bounding box to 1387x720. Whether the drawing tolerance already includes those protrusions is not verified.',groundClearanceMm:15,liftStrokeMm:90,referenceFigures:variant==='old'?['assembly-render','dimension','body-without-covers','lift-system','drive-system','operator-panel','site-photos-20261103']:['assembly-render','dimension','body-without-covers','lift-system','drive-system','operator-panel'],purpose:'structural-illustration',internalPlacement:'illustrative',internalLayoutVersion:2,geometryRevision:variant==='old'?'latent-collaboration-20261103-site-photos-rev4':'latent-collaboration-20261102',geometryVariantScope:variant==='new'?'electrical-composition-only':'manual-21-mechanical-reference',geometryEvidenceNote:variant==='new'?'新车仅有电路资料#26；车身、额定尺寸及顶升结构沿用老车说明书#21作为展示参考，尚无新车机械总装图确认。':'按老车说明书#21与2026-11-03四张老车现场照片（front/rear/side-a/side-b及后端两张近照）纠正：红色长车身与黑色腰线、平台下绕车多折风琴护套、两侧不同散热孔（side-a竖百叶、side-b圆角横格）、深色金属轮面+棕色聚氨酯外缘；无屏端中央、上下端梁之间的空槽内仅安装导航扫描头（黑上盖+红色透明扫描窗），无黑色填充壳、无亮红假墙，槽内不放内部电器；前后各1只右下方蓝黑TIM（黑色圆柱朝下）；矩形平台开口与折弯片。车号12、企业/二维码等设备管理贴纸不是通用车型特征，未建模；四图与用户圈图均不支持外露拖车环，老车未建模。器件安装坐标、线束和紧固件仍为示意，不是制造CAD。'};
 const parts=[];
 const materials={
  orange:new THREE.MeshStandardMaterial({color:0xc9481f,metalness:.28,roughness:.44,side:THREE.DoubleSide}),
  orangeDark:new THREE.MeshStandardMaterial({color:0xa93a19,metalness:.3,roughness:.5,side:THREE.DoubleSide}),
  dark:new THREE.MeshStandardMaterial({color:0x22282d,metalness:.5,roughness:.45}),
  plate:new THREE.MeshStandardMaterial({color:0x33383c,metalness:.45,roughness:.52}),
  black:new THREE.MeshStandardMaterial({color:0x0f1317,metalness:.15,roughness:.72}),
  steel:new THREE.MeshStandardMaterial({color:0x9aa4ab,metalness:.82,roughness:.3}),
  alloy:new THREE.MeshStandardMaterial({color:0xb6bec4,metalness:.75,roughness:.32}),
  rubber:new THREE.MeshStandardMaterial({color:0x1c1e20,metalness:.04,roughness:.92}),
  gold:new THREE.MeshStandardMaterial({color:0x9d7b28,metalness:.72,roughness:.38}),
  blue:new THREE.MeshStandardMaterial({color:0x1a6f9e,metalness:.4,roughness:.4}),
  green:new THREE.MeshStandardMaterial({color:0x2a7a63,metalness:.3,roughness:.55}),
  red:new THREE.MeshStandardMaterial({color:0xc03028,metalness:.25,roughness:.5}),
  screen:new THREE.MeshStandardMaterial({color:0x2f6fae,emissive:0x102f4d,roughness:.22,metalness:.1}),
  lamp:new THREE.MeshStandardMaterial({color:0xd63a2c,emissive:0x55100b,roughness:.3,transparent:true,opacity:.92}),
  clear:new THREE.MeshStandardMaterial({color:0xc4d2d6,metalness:.1,roughness:.3,transparent:true,opacity:.6}),
  screenGreen:new THREE.MeshStandardMaterial({color:0x6d8f2e,emissive:0x2f4d0d,roughness:.3,metalness:.05}),
  white:new THREE.MeshStandardMaterial({color:0xe8e4dc,metalness:.05,roughness:.7}),
  tireOld:new THREE.MeshStandardMaterial({color:0x7d6847,metalness:.04,roughness:.9}),
  deckPlate:new THREE.MeshStandardMaterial({color:0x8e9499,metalness:.62,roughness:.5}),
  orangeShadow:new THREE.MeshStandardMaterial({color:0x6e1f16,metalness:.2,roughness:.66,side:THREE.DoubleSide}),
  navWindow:new THREE.MeshStandardMaterial({color:0xd8352a,emissive:0x7a150d,transparent:true,opacity:.55,roughness:.25,metalness:.1})
 };
 if(variant==='old'){
  materials.orange.color.setHex(0xc23a2a);
  materials.orangeDark.color.setHex(0xa32a1e);
  root.userData.geometryRevision='latent-local-rear-trapezoid-20261114';
  root.userData.overallEnvelopeMm[2]=459;
  root.userData.envelopeNote+=' Moving the old external load lever into the central deck opening leaves the illustrative generated height at 459 mm; the documented 460 mm body height is unchanged and not verified by this model.';
  root.userData.geometryEvidenceNote+=' 2026-11-14本地看图修订：后壳内槽俯视为两端斜向过渡、中间平直的梯形；上下外壳保留，槽外到按钮侧及左右的中部空腔不加内挡板或水平隔板。平台接近开关位于中央矩形开口内、折弯片下方。形状按用户圈图，深度、角度与安装尺寸未实测。';
 }
 function assembly(id,label,offset,source,description){const group=new THREE.Group();group.name=id;group.userData={partId:id,label,explodeOffset:offset,presentationOffset:[...offset],sourceKnowledgeId:21,sourceFigure:source,description};root.add(group);parts.push(group);return group}
 function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,typeof material==='string'?materials[material]:material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function box(p,size,at,mat='steel',name=''){const m=mesh(p,new THREE.BoxGeometry(...size),mat,...at);m.name=name;return m}
 function cylinder(p,radius,length,at,mat='steel',axis='y'){const m=mesh(p,new THREE.CylinderGeometry(radius,radius,length,32),mat,...at);if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;return m}
 function beam(p,a,b,width=.018,mat='dark'){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),middle=va.clone().add(vb).multiplyScalar(.5),m=box(p,[width,va.distanceTo(vb),width],middle.toArray(),mat);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m}
 function roundedShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
 // Flat part: w runs along x, h along z, thickness along +y from the given base.
 function flat(p,w,h,t,base,mat='dark',radius=.03,bevel=0,holes=[]){const shape=roundedShape(w,h,radius);shape.holes.push(...holes);const geo=new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:8});geo.rotateX(-Math.PI/2);geo.translate(0,base,0);return mesh(p,geo,mat,0,0,0)}
 function slottedArm(p,a,b,z,mat='steel'){const ax=a[0],ay=a[1],bx=b[0],by=b[1],length=Math.hypot(bx-ax,by-ay),height=.058,radius=.016;const s=new THREE.Shape();const x=-length/2,y=-height/2;s.moveTo(x+radius,y);s.lineTo(x+length-radius,y);s.quadraticCurveTo(x+length,y,x+length,y+radius);s.lineTo(x+length,y+height-radius);s.quadraticCurveTo(x+length,y+height,x+length-radius,y+height);s.lineTo(x+radius,y+height);s.quadraticCurveTo(x,y+height,x,y+height-radius);s.lineTo(x,y+radius);s.quadraticCurveTo(x,y,x+radius,y);for(const cx of [-length*.28,0,length*.28]){const hole=new THREE.Path();hole.absarc(cx,0,.013,0,Math.PI*2,true);s.holes.push(hole)}const geo=new THREE.ExtrudeGeometry(s,{depth:.016,bevelEnabled:false,curveSegments:10});geo.translate(0,0,-.008);const m=new THREE.Mesh(geo,typeof mat==='string'?materials[mat]:mat);m.position.set((ax+bx)/2,(ay+by)/2,z);m.rotation.z=Math.atan2(by-ay,bx-ax);m.castShadow=m.receiveShadow=true;p.add(m);return m}
 function bundle(group,points,color,radius=.002){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),m=new THREE.Mesh(new THREE.TubeGeometry(curve,32,radius,6,false),new THREE.MeshStandardMaterial({color,roughness:.75}));m.castShadow=true;group.add(m);return m}
 // Flat panel facing +x, described in (z,y) so the short 700 mm face can carry
 // the operator-panel recess without a separate model file.
 function facePlate(p,points,x,mat,depth=.004){const s=new THREE.Shape();s.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);s.closePath();const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false});geo.rotateY(Math.PI/2);const m=new THREE.Mesh(geo,materials[mat]);m.position.x=x;m.castShadow=true;p.add(m);return m}
 function roundedFace(p,w,h,r,x,depth,mat,cy=0,openings=[]){const shape=roundedShape(w,h,r);for(const [z,y,ow,oh] of openings){const cx=-z,dy=y-cy,hole=new THREE.Path();hole.moveTo(cx-ow/2,dy-oh/2);hole.lineTo(cx-ow/2,dy+oh/2);hole.lineTo(cx+ow/2,dy+oh/2);hole.lineTo(cx+ow/2,dy-oh/2);hole.closePath();shape.holes.push(hole)}const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:8});geo.rotateY(Math.PI/2);const m=new THREE.Mesh(geo,materials[mat]);m.position.set(x,cy,0);m.castShadow=m.receiveShadow=true;p.add(m);return m}

 // ---- chassis: rails, floor pan, rubber bumpers with tow loops ----
 const chassis=assembly('chassis','车身底架',[0,0,0],'body-without-covers','按总装图和拆罩图还原车架、下护板及前后橡胶保险杠；梁位与紧固件为示意。');
 // Leave wheel wells open: neither a full floor nor continuous side rails
 // may run through the two tyres.
 for(const z of [-.29,.29])for(const x of [-.39,.40])box(chassis,[.41,.055,.032],[x,.062,z],'dark');
 for(const z of [-.13,.13])box(chassis,[1.19,.055,.026],[0,.062,z],'dark');
 // End crossmembers are interrupted around each support-wheel swept volume.
 for(const x of [-.52,-.24,.22,.48]){
  if(x===-.52||x===.48){
   box(chassis,[.036,.052,.446],[x,.062,0],'dark','caster-crossmember-center');
   for(const z of [-.2785,.2785])box(chassis,[.036,.052,.023],[x,.062,z],'dark','caster-crossmember-end');
   for(const side of [-1,1])box(chassis,[.075,.012,.075],[x,.088,side*.245],'dark','caster-support-bridge');
  }else box(chassis,[.036,.052,.58],[x,.062,0],'dark','chassis-crossmember');
 }
 for(const x of [-.4025,.4025])box(chassis,[.405,.012,.58],[x,.088,0],'dark','floor-end');
 box(chassis,[.40,.012,.26],[0,.088,0],'dark','floor-center');
 box(chassis,[1.16,.03,.05],[0,.06,0],'black','chassis-keel');
 for(const side of [1,-1]){
  box(chassis,[.035,.045,.70],[side*(variant==='old'?.625:.655),.104,0],variant==='old'?'orangeDark':'steel');
  box(chassis,[.014,.012,.70],[side*.676,.079,0],'black');
  if(variant==='new')for(const z of [-.30,.30]){const loop=mesh(chassis,new THREE.TorusGeometry(.024,.006,8,20),'steel',side*.684,.104,z);loop.rotation.y=Math.PI/2}
  for(const x of [-.58,-.36,.36,.58])box(chassis,[.05,.02,.06],[x,.024,side*.235],'black');
 }
 // lower skirt: two orange tiers split by the horizontal gap in the side view
 for(const side of [1,-1]){
  for(const [cx,w] of [[-.50,.31],[.49,.33]])box(chassis,[w,.088,.014],[cx,.062,side*.344],variant==='old'?'black':'orangeDark');
  // Close the short run below the rear side step; the two-tier skirt otherwise
  // leaves a see-through slit between its segments and the wheel opening.
  if(variant==='old')box(chassis,[.055,.088,.014],[-.3225,.062,side*.344],'black','rear-step-skirt-fill');
  // No exposed horizontal strip below the wheel opening.
 }

 // ---- top platform: thin plate, long-edge folds, central opening and bent tab ----
 const platform=assembly('platform','顶升框架与载货平台',[0,.80,0],'lift-system',variant==='old'?'顶升框架与载货平台按顶升图、顶视总图和现场照片还原：1310×700毫米银灰薄平台、两条长侧边向上折边、中央矩形开口与折弯片、平台黑色包边、平台下绕车多折风琴护套和载货检测开关；开口位置与折弯片形态为示意，不为未测量孔位编造精确排列。':'顶升框架与载货平台按顶升图和顶视总图还原：1310×700毫米薄平台、端部翻边、中央圆孔、检修口、底部加强筋和载货检测开关；孔位为示意。');
 const deckHole=new THREE.Path();
 if(variant==='old'){deckHole.moveTo(-.083,-.040);deckHole.lineTo(.053,-.040);deckHole.lineTo(.053,.040);deckHole.lineTo(-.083,.040);deckHole.closePath()}
 else deckHole.absarc(-.02,0,.050,0,Math.PI*2,true);
 flat(platform,1.30,.70,variant==='old'?.006:.022,variant==='old'?.434:.418,variant==='old'?'deckPlate':'plate',.035,variant==='old'?.0006:.002,[deckHole]).name='platform-deck';
 for(const z of [-.315,.315])box(platform,[1.25,.028,.022],[0,.404,z],'dark');
 for(const x of [-.58,0,.58])box(platform,[.022,.028,.60],[x,.404,0],'dark');
 if(variant==='new')for(const side of [1,-1]){box(platform,[.02,.024,.70],[side*.646,.448,0],'plate');box(platform,[.012,.04,.70],[side*.657,.426,0],'dark');box(platform,[1.18,.01,.014],[0,.442,side*.342],'steel')}
 if(variant==='new'){
  box(platform,[.17,.006,.11],[.245,.4415,0],'steel');
  for(const [x,z] of [[.31,-.032],[.31,.032],[.18,-.032],[.18,.032]])cylinder(platform,.004,.004,[x,.4435,z],'dark');
  const ring=mesh(platform,new THREE.TorusGeometry(.056,.006,10,32),'steel',-.02,.4415,0);ring.rotation.x=Math.PI/2;
  for(const [x,z] of [[-.55,-.29],[-.55,.29],[-.28,-.29],[-.28,.29],[0,-.29],[0,.29],[.28,-.29],[.28,.29],[.55,-.29],[.55,.29],[-.62,0],[.62,0],[-.40,0],[.40,0]]){cylinder(platform,.006,.004,[x,.442,z],'steel')}
  for(const z of [-.045,.045])cylinder(platform,.005,.02,[-.34,.448,z],'steel');
  box(platform,[.012,.01,.10],[-.34,.453,0],'steel');
 }
 for(const x of [-.29,.29])box(platform,[.018,.028,.60],[x,.404,0],'dark');
 if(variant==='old'){
  // User's close-up: threaded proximity switch inside the CENTRAL opening,
  // below the bent flap, with the sensing face pointing along the deck.
  // Cylinder size and mounting bracket are illustrative, not measured CAD.
  cylinder(platform,.0075,.050,[-.012,.427,0],'steel','x').name='load-proximity-body';
  cylinder(platform,.0075,.003,[-.0385,.427,0],'black','x').name='load-proximity-face';
  const bracket=roundedShape(.032,.030,.002),hole=new THREE.Path();
  hole.absarc(0,.004,.008,0,Math.PI*2,true);bracket.holes.push(hole);
  const bracketGeo=new THREE.ExtrudeGeometry(bracket,{depth:.002,bevelEnabled:false,curveSegments:12});bracketGeo.rotateY(Math.PI/2);
  mesh(platform,bracketGeo,'steel',.002,.423,0).name='load-proximity-bracket';
  for(const x of [-.001,.007]){
   const nut=new THREE.Shape();for(let i=0;i<6;i++){const a=i*Math.PI/3;if(i===0)nut.moveTo(.011*Math.cos(a),.011*Math.sin(a));else nut.lineTo(.011*Math.cos(a),.011*Math.sin(a))}nut.closePath();
   const bore=new THREE.Path();bore.absarc(0,0,.0076,0,Math.PI*2,true);nut.holes.push(bore);
   const geo=new THREE.ExtrudeGeometry(nut,{depth:.003,bevelEnabled:false,curveSegments:12});geo.rotateY(Math.PI/2);
   mesh(platform,geo,'alloy',x,.427,0).name='load-proximity-locknut';
  }
  bundle(platform,[[.014,.427,0],[.035,.427,0],[.048,.414,.012],[.075,.400,.022]],0x24282b,.002).name='load-proximity-cable';
  platform.userData.description+=' 接近开关按用户实物照片移至中央开口内、折弯片下方，圆柱体、锁紧螺母与线缆为安装关系示意。';
 }else{
  box(platform,[.055,.008,.040],[.10,.445,.13],'steel','load-switch-base');
  beam(platform,[.08,.451,.13],[.125,.457,.13],.006,'dark').name='load-switch-lever';
 }
 if(variant==='old'){
  // Long-edge upturned folds along the two 1310 mm sides of the thin deck.
  for(const side of [1,-1])box(platform,[1.22,.022,.016],[0,.448,side*.344],'deckPlate','deck-fold-long');
  // Folded lips around the rectangular opening; exact hole positions are not measured.
  for(const [bx,bw] of [[-.093,.012],[.063,.012]])box(platform,[bw,.005,.088],[bx,.4445,0],'deckPlate','deck-opening-lip');
  for(const bz of [-.047,.047])box(platform,[.136,.005,.010],[-.02,.4445,bz],'deckPlate','deck-opening-lip');
  // Bent sheet: rises from one edge of the rectangular opening and folds back over it.
  const flap=box(platform,[.13,.004,.050],[-.02,.444,.020],'deckPlate','deck-bent-flap');flap.rotation.x=-.45;
  box(platform,[.13,.004,.032],[-.02,.445,-.016],'deckPlate','deck-bent-flap');
  // A continuous pleated skin: ridge/valley perimeter changes at every half-fold.
  // Overlapping boxes at identical x/z would make a flat wall, not bellows.
  const rings=[],vertices=[];
  for(let i=0;i<=12;i++){
   const ridge=i%2===1,hx=ridge?.638:.628,hz=ridge?.340:.330,r=.018,ring=[];
   for(const [cx,cz,start] of [[hx-r,hz-r,0],[-hx+r,hz-r,Math.PI/2],[-hx+r,-hz+r,Math.PI],[hx-r,-hz+r,Math.PI*1.5]])for(let j=0;j<=4;j++){
    const angle=start+j*Math.PI/8;ring.push([cx+Math.cos(angle)*r,.384+i*.004,cz+Math.sin(angle)*r]);
   }
   rings.push(ring);
  }
  for(let i=0;i<12;i++)for(let j=0;j<rings[i].length;j++){
   const k=(j+1)%rings[i].length,a=rings[i][j],b=rings[i][k],c=rings[i+1][k],d=rings[i+1][j];vertices.push(...a,...c,...b,...a,...d,...c);
  }
  const bellowsGeo=new THREE.BufferGeometry();bellowsGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));bellowsGeo.computeVertexNormals();
  const bellowsMat=materials.rubber.clone();bellowsMat.side=THREE.DoubleSide;
  mesh(platform,bellowsGeo,bellowsMat).name='deck-bellows';
  // Sewn longitudinal joins and clamp strips remain part of the flexible
  // cover assembly. They follow the pleats instead of a straight floating rod.
  for(const side of [-1,1]){
   const seam=[];for(let i=0;i<=12;i++)seam.push([-.06,.384+i*.004,side*(i%2?.3405:.3305)]);
   bundle(platform,seam,0x383a3d,.0012).name='bellows-sewn-seam';
   for(const y of [.384,.432])box(platform,[1.20,.003,.012],[0,y,side*.330],'black','bellows-clamp-strip');
  }
  for(const x of [-.625,.625])for(const y of [.384,.432])box(platform,[.012,.003,.62],[x,y,0],'black','bellows-end-clamp');
 }

 // ---- side covers: one extruded profile with the wheel arch ----
 const archTop=variant==='old'?.282:.315;
 const coverOutline=variant==='old'?[[-.655,.270],[-.655,.345],[-.625,.385],[.625,.385],[.655,.345],[.655,.115],[.22,.115],[.105,archTop],[-.085,archTop],[-.20,.115],[-.30,.270]]:[[-.655,.115],[-.655,.345],[-.625,.385],[.625,.385],[.655,.345],[.655,.115],[.22,.115],[.105,archTop],[-.085,archTop],[-.20,.115]];
 const outline=coverOutline.map(([x,y])=>new THREE.Vector2(x,y));
 const left=assembly('left-cover','左侧护罩',[0,.48,.46],'body-without-covers',variant==='old'?'左侧护罩按side-b原图：红色侧壳、轮拱、圆角横格散热孔与黑色腰线贴花；两侧散热细节按各自原图，不做机械镜像；拆装顺序非实车顺序。':'护罩分上下两层，侧板带轮拱和散热百叶；外形依据整车主视图和渲染图，拆装顺序非实车顺序。');
 const right=assembly('right-cover','右侧护罩',[0,.48,-.46],'body-without-covers',variant==='old'?'右侧护罩按side-a原图：红色侧壳、轮拱、竖向银色百叶散热孔与黑色腰线贴花；两侧散热细节按各自原图，不做机械镜像；拆装顺序非实车顺序。':'护罩分上下两层，侧板带轮拱和散热百叶；外形依据整车主视图和渲染图，拆装顺序非实车顺序。');
 for(const [group,side] of [[left,1],[right,-1]]){
  if(variant==='old'){
   // Separate folded skins, not one 20 mm thick beveled extrusion. The 4 mm
   // centre joint and cooling aperture are actual missing material.
   const panels=[
    [[-.655,.270],[-.655,.355],[-.625,.365],[-.062,.365],[-.062,.282],[-.085,.282],[-.20,.115],[-.30,.270]],
    [[-.058,.282],[.105,.282],[.22,.115],[.627,.115],[.627,.355],[.625,.365],[-.058,.365]]
   ];
   const ventX=side===1?-.38:.34;
   for(let j=0;j<panels.length;j++){
    const s=new THREE.Shape(panels[j].map(v=>new THREE.Vector2(...v)));
    if((side===1&&j===0)||(side===-1&&j===1)){
     const hole=roundedShape(.098,.072,side===1?.018:.003);
     s.holes.push(new THREE.Path(hole.getPoints(12).map(v=>v.add(new THREE.Vector2(ventX,.315)))));
    }
    mesh(group,new THREE.ExtrudeGeometry(s,{depth:.002,bevelEnabled:false,curveSegments:12}),'orange',0,0,side*.348-.001).name='side-cover-skin';
   }
   for(const [a,b] of [[-.625,-.062],[-.058,.625]]){
    const shoulder=facePlate(group,[[-side*.349,.365],[-side*.328,.385],[-side*.326,.383],[-side*.347,.363]],a,'orange',b-a);shoulder.name='side-shoulder-fold';
    const upper=box(group,[b-a,.002,.022],[(a+b)/2,.384,side*.317],'orangeDark','side-upper-return');
    const channel=box(group,[b-a,.018,.002],[(a+b)/2,.372,side*.307],'orangeDark','side-inner-channel');
    if(b>0)for(const edge of [shoulder,upper,channel]){
     const positions=edge.geometry.attributes.position;
     const roll=(d,r)=>d<=0?0:r-Math.sqrt(Math.max(0,r*r-Math.min(d,r)**2));
     for(let i=0;i<positions.count;i++){const x=positions.getX(i)+edge.position.x;if(x<b-1e-5)continue;const y=positions.getY(i)+edge.position.y,z=positions.getZ(i)+edge.position.z;positions.setX(i,.664-roll(y-.365,.037)-roll(Math.abs(z)-.307,.038)-edge.position.x)}
     positions.needsUpdate=true;edge.geometry.computeVertexNormals();
    }
   }
   // Return flanges, attachment studs and the small inner accessory visible in
   // photo06 remain on their own removable cover, not on the chassis.
   for(const x of [-.642,.616])box(group,[.002,.23,.033],[x,.237,side*.331],'orangeDark','side-end-return');
   for(const x of [-.56,.42])for(const y of [.18,.35])cylinder(group,.003,.020,[x,y,side*.332],'steel','z').name='cover-stud';
   if(side===1){
    // Photo06 documents one accessory-equipped cover, not a mirrored pair.
    box(group,[.34,.023,.016],[.28,.350,side*.319],'clear','cover-inner-accessory');
    for(const x of [.14,.42])box(group,[.010,.030,.018],[x,.35,side*.319],'red','cover-accessory-clamp');
    box(group,[.40,.009,.003],[.28,.325,side*.329],'blue','cover-inner-strip');
    group.userData.innerAccessoryEvidence='photo06; one observed cover, side/size illustrative, no mirror inference';
   }
  }else{
   const shape=new THREE.Shape(outline);
   const geo=new THREE.ExtrudeGeometry(shape,{depth:.014,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1});
   geo.translate(0,0,-.007);
   const position=geo.attributes.position,roll=(d,r)=>d<=0?0:r-Math.sqrt(Math.max(0,r*r-Math.min(d,r)**2));
   for(let i=0;i<position.count;i++)if(position.getX(i)>.620){const y=position.getY(i),z=position.getZ(i)+side*.343;position.setX(i,.664-roll(y-.365,.037)-roll(Math.abs(z)-.307,.038))}
   position.needsUpdate=true;geo.computeVertexNormals();mesh(group,geo,'orange',0,0,side*.343);
  }
  // wheel arch liner and dark seam under the raised cover edge
  const arch=new THREE.Shape();arch.absarc(0,.135,variant==='old'?.145:.168,0,Math.PI,false);arch.absarc(0,.135,variant==='old'?.128:.148,Math.PI,0,true);
  const archGeo=new THREE.ExtrudeGeometry(arch,{depth:.008,bevelEnabled:false,curveSegments:16});
  mesh(group,archGeo,'black',.01,0,side*.333);
  if(variant==='new')for(const [x0,x1] of [[-.655,-.20],[.22,.627]])box(group,[x1-x0,.012,.006],[(x0+x1)/2,.115,side*.351],'black');
  for(const [x0,x1] of [[-.655,-.20],[.22,.627]])box(group,[x1-x0,.012,.007],[(x0+x1)/2,.126,side*.352],'orange');
  if(variant==='new'){
   beam(group,[-.20,.115,side*.351],[-.085,.315,side*.351],.012,'black');
   beam(group,[.105,.315,side*.351],[.22,.115,side*.351],.012,'black');
   box(group,[.19,.012,.006],[.01,.315,side*.351],'black');
  }
  if(variant==='new'){
   box(group,[.11,.075,.004],[-.455,.315,side*.3515],'black');
   for(let i=0;i<7;i++)box(group,[.005,.062,.005],[-.49+i*.0115,.315,side*.352],'steel');
   box(group,[.095,.05,.004],[-.525,.185,side*.3515],'dark');
   box(group,[.082,.038,.006],[-.525,.185,side*.353],'orangeDark');
  }
  if(variant==='old'){
   // Recessed side wall is set inboard of the outer lip, not flush with it.
   box(group,[.355,.080,.002],[-.4775,.230,side*.322],'orangeShadow','rear-side-inner-shell');
   box(group,[.355,.130,.002],[-.4775,.125,side*.349],'orange','rear-side-step');
   box(group,[.355,.002,.037],[-.4775,.1905,side*.3315],'orange','rear-side-step-ledge');
   box(group,[.355,.002,.037],[-.4775,.269,side*.3315],'orangeShadow','rear-side-cove-ceiling');
   box(group,[.002,.080,.037],[-.3005,.230,side*.3315],'orange','rear-side-cove-return');
   box(group,[.355,.002,.037],[-.4775,.060,side*.3315],'orangeDark','rear-side-step-floor');
   // The two site photos show different cooling details on the two sides; neither
   // side is a mirror of the other. side-b (left, +Z) has a rounded horizontal
   // grille, side-a (right, -Z) has vertical silver louvres.
   if(side===1){
    const grilleShape=roundedShape(.112,.086,.020),grilleInner=roundedShape(.090,.064,.014);grilleShape.holes.push(grilleInner);
    const grille=new THREE.Mesh(new THREE.ExtrudeGeometry(grilleShape,{depth:.004,bevelEnabled:false,curveSegments:8}),materials.black);
    grille.name='side-vent-grille-frame';grille.position.set(-.38,.315,side*.3545);grille.castShadow=grille.receiveShadow=true;group.add(grille);
    for(let i=0;i<6;i++)box(group,[.098,.006,.003],[-.38,.315+(i-2.5)*.011,side*.358],'dark','side-vent-grille');
   }else{
    const louverFrame=roundedShape(.120,.086,.004),louverHole=roundedShape(.098,.072,.003);louverFrame.holes.push(louverHole);
    mesh(group,new THREE.ExtrudeGeometry(louverFrame,{depth:.002,bevelEnabled:false}),'orangeDark',.34,.315,side*.350).name='side-vent-louver-frame';
    for(let i=0;i<8;i++)box(group,[.006,.070,.004],[.34+(i-3.5)*.013,.315,side*.3575],'steel','side-vent-louver');
   }
  }
  for(const [x,y] of (variant==='old'?[[.60,.25],[.60,.35],[-.60,.35]]:[[-.60,.25],[-.60,.35],[.60,.25],[.60,.35]]))cylinder(group,.0045,.004,[x,y,side*.351],'steel','z');
  box(group,[.26,.02,.008],[.44,.128,side*.352],'rubber');
  if(variant==='old'){
   const decalZ=side*.3515;
   // Visible body-side split above the wheel arch (both sides, photos).
   box(group,[.003,.068,.0015],[-.06,.349,decalZ],'black','side-seam');
   const stripe=new THREE.Shape();
   const contour=[[-.655,.094],[-.30,.094],[-.085,.282],[.105,.282],[.22,.115],[.627,.115],[.627,.160],[.25,.160],[.13,.322],[-.11,.322],[-.30,.139],[-.655,.139]];
   stripe.moveTo(...contour[0]);for(const pt of contour.slice(1))stripe.lineTo(...pt);stripe.closePath();
   const stripeGeo=new THREE.ExtrudeGeometry(stripe,{depth:.002,bevelEnabled:false});
   mesh(group,stripeGeo,'black',0,0,decalZ-.001).name='side-lower-decal';
  }
 }

 // The site side view shows a complete deep end hood. Its longitudinal return
 // belongs to this removable hood, not to the adjacent long side-cover panel.
 const hoodRearX=y=>.445+.020*THREE.MathUtils.clamp((y-.104)/.297,0,1);
 root.updateMatrixWorld(true);
 for(const cover of [left,right])cover.traverse(object=>{
  if(!object.isMesh)return;
  const bounds=new THREE.Box3().setFromObject(object);
  if(bounds.min.x>.470){object.position.x+=hoodRearX((bounds.min.y+bounds.max.y)/2)-.012-bounds.max.x;object.updateMatrixWorld(true)}
  const position=object.geometry.attributes.position,inverse=object.matrixWorld.clone().invert(),point=new THREE.Vector3();let changed=false;
  for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);const limit=hoodRearX(point.y)-.003;if(point.x<=limit)continue;point.x=limit;point.applyMatrix4(inverse);position.setXYZ(i,point.x,point.y,point.z);changed=true}
  if(changed){position.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere()}
 });
 // The rear close-ups also show a deep removable end shell. Stop the old-car
 // long covers at its joint; the short-end returns must leave with rear-cover.
 if(variant==='old')for(const cover of [left,right])cover.traverse(object=>{
  if(!object.isMesh)return;
  const bounds=new THREE.Box3().setFromObject(object);
  if(bounds.max.x<-.445){object.position.x+=-.432-bounds.min.x;object.updateMatrixWorld(true)}
  const attr=object.geometry.attributes.position,inverse=object.matrixWorld.clone().invert(),point=new THREE.Vector3();let changed=false;
  for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i).applyMatrix4(object.matrixWorld);if(point.x>=-.442)continue;point.x=-.442;point.applyMatrix4(inverse);attr.setXYZ(i,point.x,point.y,point.z);changed=true}
  if(changed){attr.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingBox();object.geometry.computeBoundingSphere()}
 });
 // ---- deep front hood with the 700 mm operator face ----
 const panel=assembly('operator-panel','车头罩与操作面板',[.48,.03,0],'operator-panel',variant==='old'?'车头罩按拆罩侧视图形成完整深包端罩，包含前脸、两侧长回包、上折面和后缘接缝；不是浅操作面板。中央绿色液晶屏带数字键盘和侧键，左右接口/急停/复位按本车配置保留；中部后退凹面与底部敞口。壳深、曲率与斜度按照片比例示意，不是实测制造尺寸。':'按用户要求同步深包车头罩，前脸、两侧长回包、上折面和后缝属于同一可拆部件；保留新车自己的蓝色触摸屏、通讯接口和按钮。外壳比例与位置为示意，不据旧车照片改变新车电气配置。');
 {
  // Front photo: a formed U-shaped shell with a broad rolled shoulder and
  // wraparound cheeks, not a flat plate containing a rectangular punched hole.
  // Native shape X is -world Z; its bottom notch remains open to the lower tier.
  const shape=new THREE.Shape();
  shape.moveTo(-.307,.401);shape.lineTo(-.3175,.393);shape.lineTo(-.328,.385);shape.lineTo(-.339,.375);shape.lineTo(-.350,.365);
  shape.lineTo(-.350,.126);shape.quadraticCurveTo(-.350,.102,-.326,.102);
  shape.lineTo(-.248,.102);shape.quadraticCurveTo(-.220,.102,-.220,.130);
  shape.lineTo(-.220,.214);shape.quadraticCurveTo(-.220,.232,-.202,.232);
  shape.lineTo(.202,.232);shape.quadraticCurveTo(.220,.232,.220,.214);
  shape.lineTo(.220,.130);shape.quadraticCurveTo(.220,.102,.248,.102);
  shape.lineTo(.326,.102);shape.quadraticCurveTo(.350,.102,.350,.126);
  shape.lineTo(.350,.365);shape.lineTo(.339,.375);shape.lineTo(.328,.385);shape.lineTo(.3175,.393);shape.lineTo(.307,.401);shape.closePath();
  const formed=new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false,curveSegments:12});formed.rotateY(Math.PI/2);
  // Subdivide before forming so the shoulder is curved across the whole face,
  // including its centre, rather than just bending the outline vertices.
  let triangles=Array.from(formed.attributes.position.array);formed.dispose();
  const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  for(let pass=0;pass<3;pass++){const next=[];for(let i=0;i<triangles.length;i+=9){const a=triangles.slice(i,i+3),b=triangles.slice(i+3,i+6),c=triangles.slice(i+6,i+9),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push(...a,...ab,...ca,...ab,...b,...bc,...ca,...bc,...c,...ab,...bc,...ca)}triangles=next}
  const roll=(distance,radius)=>distance<=0?0:radius-Math.sqrt(Math.max(0,radius*radius-Math.min(distance,radius)**2));
  for(let i=0;i<triangles.length;i+=3)triangles[i]+=.663-roll(triangles[i+1]-.365,.037)-roll(Math.abs(triangles[i+2])-.307,.038);
  const skin=new THREE.BufferGeometry();skin.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3));skin.computeVertexNormals();
  const normals=skin.attributes.normal,vertices=skin.attributes.position,sums=new Map(),keys=[];
  for(let i=0;i<vertices.count;i++){const key=[vertices.getX(i),vertices.getY(i),vertices.getZ(i)].map(v=>Math.round(v*1e6)).join(',');keys.push(key);const n=sums.get(key)||new THREE.Vector3();n.add(new THREE.Vector3().fromBufferAttribute(normals,i));sums.set(key,n)}
  for(const n of sums.values())n.normalize();for(let i=0;i<vertices.count;i++){const n=sums.get(keys[i]);normals.setXYZ(i,n.x,n.y,n.z)}
  mesh(panel,skin,'orange').name='front-formed-u-shell';
  box(panel,[.1725,.002,.614],[.55125,.401,0],'orangeDark','front-top-return');
  for(const side of [-1,1]){
   // A ruled thin shell spans roughly 200 mm from the operator face to the
   // rear seam. The upper return inclines inwards beneath the bellows.
   const rows=[[.104,.350],[.130,.350],[.230,.350],[.330,.350],[.365,.350],[.375,.339],[.385,.328],[.393,.3175],[.401,.307]];
   const positions=[],pushQuad=(a,b,c,d)=>positions.push(...a,...b,...c,...a,...c,...d);
   const point=(row,front,inner=false)=>{const [y,z]=rows[row];return [front ? .664-roll(y-.365,.037)-roll(z-.307,.038) : hoodRearX(y),y,side*(z-(inner ? .002 : 0))]};
   for(let i=0;i<rows.length-1;i++){
    if(!(variant==='old'&&side===-1&&rows[i+1][0]<=.365)){
     pushQuad(point(i,false),point(i,true),point(i+1,true),point(i+1,false));
     pushQuad(point(i,false,true),point(i+1,false,true),point(i+1,true,true),point(i,true,true));
    }
    pushQuad(point(i,false),point(i+1,false),point(i+1,false,true),point(i,false,true));
    pushQuad(point(i,true),point(i,true,true),point(i+1,true,true),point(i+1,true));
    // Rear return flange is part of the same hood and gives its visible seam.
    const a=point(i,false,true),b=point(i+1,false,true);pushQuad(a,b,[b[0],b[1],b[2]-side*.012],[a[0],a[1],a[2]-side*.012]);
   }
   for(const row of [0,rows.length-1])pushQuad(point(row,false),point(row,false,true),point(row,true,true),point(row,true));
   const wall=new THREE.BufferGeometry();wall.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));wall.computeVertexNormals();
   mesh(panel,wall,'orange').name='front-end-return';
   if(variant==='old'&&side===-1){
    const skin=new THREE.Shape([[hoodRearX(.104),.104],[.664,.104],[.664,.365],[hoodRearX(.365),.365]].map(p=>new THREE.Vector2(...p)));
    const hole=roundedShape(.055,.029,.004);skin.holes.push(new THREE.Path(hole.getPoints(12).map(p=>p.add(new THREE.Vector2(.55,.139)))));
    mesh(panel,new THREE.ExtrudeGeometry(skin,{depth:.002,bevelEnabled:false,curveSegments:8}),'orange',0,0,-.350).name='front-tim-side-skin';
   }
   for(const y of [.170,.335])cylinder(panel,.0045,.005,[hoodRearX(y)+.009,y,side*.352],'steel','z').name='hood-rear-fastener';
  }
  for(const z of [-.220,.220]){
   box(panel,[.049,.102,.002],[.6395,.181,z],'orangeDark','front-cavity-return');
  }
  box(panel,[.049,.002,.404],[.6395,.232,0],'orangeDark','front-cavity-roof');
 }
 if(variant==='new'){
  box(panel,[.018,.108,.255],[.657,.333,0],'dark');
 box(panel,[.005,.072,.20],[.668,.333,0],variant==='old'?'screenGreen':'screen');
 for(const y of [.388,.278])box(panel,[.004,.007,.262],[.676,y,0],'steel');
 for(const z of [-.131,.131])box(panel,[.004,.112,.007],[.676,.333,z],'steel');
 for(const [i,mat] of (variant==='old'?[[0,'black'],[1,'steel'],[2,'black'],[3,'red']]:[[0,'black'],[1,'steel'],[2,'steel'],[3,'dark']]))cylinder(panel,.0115,.014,[.661,.318-i*.042,-.268],mat,'x');
 for(const [i,mat] of (variant==='old'?[[0,'red'],[1,'green'],[2,'red'],[3,'green']]:[[0,'red'],[1,'rubber'],[2,'blue'],[3,'lamp']]))cylinder(panel,i===0?.0185:.0125,.016,[.662,.331-i*.045,.268],mat,'x');
 }
 if(variant==='old'){
  // One integrated operator unit: green LCD, ten-key row directly beneath it and
  // function keys either side, all inside the same dark bezel (site photos).
  box(panel,[.018,.150,.285],[.657,.318,0],'dark','panel-display-bezel');
  box(panel,[.004,.062,.205],[.668,.352,0],'screenGreen','panel-screen');
  for(const y of [.386,.318])box(panel,[.004,.006,.285],[.671,y,0],'steel');
  for(const z of [-.139,.139])box(panel,[.004,.150,.006],[.671,.318,z],'steel');
  box(panel,[.003,.030,.235],[.670,.266,0],'plate','panel-keypad-plate');
  for(let i=0;i<10;i++)box(panel,[.003,.014,.014],[.672,.266,-.099+i*.022],'alloy','panel-keypad-key');
  for(const z of [-.118,.118])for(const y of [.358,.337,.316,.295])box(panel,[.003,.013,.015],[.672,y,z],'alloy','panel-function-key');
  // Viewer-left group (+Z): round connector, key switch, rotary selector, red button.
  box(panel,[.004,.052,.052],[.668,.375,.300],'steel','panel-connector-plate');
  cylinder(panel,.014,.012,[.672,.375,.300],'black','x').name='panel-connector';
  cylinder(panel,.016,.010,[.670,.318,.300],'steel','x').name='panel-key-switch';
  box(panel,[.014,.008,.016],[.676,.318,.300],'black','panel-key');
  cylinder(panel,.016,.012,[.670,.262,.300],'black','x').name='panel-rotary-switch';
  box(panel,[.004,.012,.026],[.676,.262,.300],'steel','panel-rotary-handle');
  cylinder(panel,.013,.014,[.671,.208,.300],'red','x').name='panel-red-button';
  // Viewer-right group (-Z): E-stop then green/red/green buttons (not mirrored).
  cylinder(panel,.020,.010,[.670,.345,-.300],'dark','x').name='panel-estop-base';
  cylinder(panel,.013,.020,[.676,.345,-.300],'red','x').name='panel-estop';
  cylinder(panel,.0125,.014,[.671,.293,-.300],'green','x').name='panel-button-green';
  cylinder(panel,.0125,.014,[.671,.241,-.300],'red','x').name='panel-button-red';
  cylinder(panel,.0125,.014,[.671,.189,-.300],'green','x').name='panel-button-green';
 }
 {
  // Red inset slopes back under the upper face; its lower trapezoidal cutout
  // stays open above the separate red bumper ledge. No black rectangular plug.
  const inset=facePlate(panel,[[-.220,.232],[.220,.232],[.220,.112],[.172,.155],[-.172,.155],[-.220,.112]],.614,'orangeDark',.002);
  const position=inset.geometry.attributes.position;for(let i=0;i<position.count;i++)position.setX(i,position.getX(i)+Math.max(0,.232-position.getY(i))*.20);position.needsUpdate=true;inset.geometry.computeVertexNormals();inset.name='front-cavity';
  cylinder(panel,.0045,.405,[.632,.181,0],'alloy','z').name='front-silver-bar';
  box(panel,[.018,.042,.70],[.658,.082,0],'orangeDark','front-lower-band');
  box(panel,[.008,.010,.70],[.663,.056,0],'steel','front-lower-trim');
  box(panel,[.020,.030,.72],[.660,.036,0],'rubber','front-rubber-bumper');
 }

 // ---- rear cover: two end beams with a central recessed navigation scanner ----
 const rear=assembly('rear-cover','后端护罩与安全触边',[-.48,.03,0],'body-without-covers',variant==='old'?'后壳按2026-11-14用户确认的俯视轮廓作本地预览：内槽两端斜向过渡，中间平直；槽外到按钮侧、左右两边的中部空腔无内挡板或水平隔板。上下外壳及其折边均保留，连同壳体侧缘、绿色按钮、急停、圆形接口、银色饰条及安全触边构成可拆护罩；中央导航扫描口贯通，导航头为独立部件。槽内折弯薄板与尺寸比例为看图示意，未实测，不是制造CAD。':'后端护罩、连接器和安全触边位置按整车图；红色标牌与指示灯为示意。');
 if(variant==='old'){
  // The close-up photos show an EMPTY slot between the two end beams: only the
  // scanner (black cap + red transparent window) sits in it. Do not fill the
  // slot with a housing or a bright fake wall; internals stay behind it.
  roundedFace(rear,.654,.133,.010,-.665,.002,'orange',.3365).name='rear-upper-skin';
  roundedFace(rear,.65,.088,.010,-.665,.002,'orange',.146).name='rear-lower-skin';
  // Outer top/bottom skins enclose the removable hood. The confirmed empty
  // region is its middle cavity, not a deletion of these exterior surfaces.
  // Follow the front wraparound corners and reach both side skins; the old
  // narrow rectangle left an unintended seam behind the front and side lips.
  const outerPlan=new THREE.Shape();outerPlan.moveTo(-.445,-.349);outerPlan.lineTo(-.643,-.349);
  outerPlan.quadraticCurveTo(-.665,-.349,-.665,-.327);outerPlan.lineTo(-.665,.327);
  outerPlan.quadraticCurveTo(-.665,.349,-.643,.349);outerPlan.lineTo(-.445,.349);outerPlan.closePath();
  for(const [name,y]of [['rear-skin-return',.402],['rear-lower-return',.101]]){
   const skin=new THREE.ExtrudeGeometry(outerPlan,{depth:.002,bevelEnabled:false,curveSegments:12});skin.rotateX(-Math.PI/2);
   if(name==='rear-skin-return'){
    const vertices=skin.getAttribute('position');
    for(let i=0;i<vertices.count;i++)vertices.setY(i,vertices.getY(i)-Math.max(0,vertices.getX(i)+.643)*.019/.198);
    vertices.needsUpdate=true;skin.computeVertexNormals();
   }
   mesh(rear,skin,'orangeDark',0,y,0).name=name;
  }
  for(const side of [-1,1])for(const [top,height] of [[.403,.133],[.190,.130]]){
   const a=side===1?Math.PI/2:Math.PI,b=a+Math.PI/2,s=new THREE.Shape();
   s.absarc(0,0,.022,a,b,false);s.absarc(0,0,.020,b,a,true);s.closePath();
   const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,curveSegments:8});g.rotateX(Math.PI/2);
   mesh(rear,g,'orange',-.643,top,side*.327).name='rear-wraparound-fold';
  }
  for(const side of [-1,1]){
   const shape=new THREE.Shape([new THREE.Vector2(-.643,.270),new THREE.Vector2(-.445,.270),new THREE.Vector2(-.445,.384),new THREE.Vector2(-.643,.403)]);
   mesh(rear,new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false}),'orange',0,0,side*.348-.001).name='rear-end-return';
   const lowerSide=roundedShape(.198,.088,.001);
   if(side===1){const cut=roundedShape(.055,.029,.004);lowerSide.holes.push(new THREE.Path(cut.getPoints(12).map(p=>p.add(new THREE.Vector2(-.006,-.007)))))}
   mesh(rear,new THREE.ExtrudeGeometry(lowerSide,{depth:.002,bevelEnabled:false,curveSegments:8}),'orange',-.544,.146,side*.348-.001).name='rear-side-step';
   for(const y of [.145,.355])cylinder(rear,.0045,.005,[-.454,y,side*.350],'steel','z').name='rear-joint-fastener';
  }
  // Confirmed plan: \___/ with a straight middle. The small channel floor is
  // INSIDE that contour (toward +x); the middle cavity outside it, toward the
  // rear button face and both sides, has no added floor or internal baffles.
  // Exterior top/bottom skins remain above/below the slot; the top follows
  // the outer side skins' shallow slope instead of leaving a triangular seam.
  const groovePlan=[[-.445,-.325],[-.574,-.145],[-.574,.145],[-.445,.325]];
  rear.userData.groovePlan=groovePlan.map(p=>[...p]);
  const grooveShape=new THREE.Shape(groovePlan.map(([x,z])=>new THREE.Vector2(x,-z)));
  const grooveFloor=new THREE.ExtrudeGeometry(grooveShape,{depth:.002,bevelEnabled:false});grooveFloor.rotateX(-Math.PI/2);
  mesh(rear,grooveFloor,'orangeDark',0,.189,0).name='rear-groove-floor';
  for(const side of [-1,1]){
   const a=new THREE.Vector3(-.574,.230,side*.145),b=new THREE.Vector3(-.445,.230,side*.325),delta=b.clone().sub(a);
   const wall=box(rear,[delta.length(),.080,.002],a.clone().add(b).multiplyScalar(.5).toArray(),'orange','rear-groove-sloped-wall');wall.rotation.y=-Math.atan2(delta.z,delta.x);
   // Keep the existing central navigation aperture, rather than adding a wall
   // across the optical path. Its two coplanar margins form the flat middle.
   box(rear,[.002,.080,.090],[-.574,.230,side*.100],'orangeDark','rear-groove-straight-wall');
  }
  const oldLower=rear.getObjectByName('rear-lower-skin');rear.remove(oldLower);oldLower.geometry.dispose();
  const zs=[-.327,-.285,-.255,.255,.285,.327],xs=[-.643,-.665,-.631,-.631,-.665,-.643],vertices=[];
  for(let i=0;i<zs.length-1;i++){
   const a=[xs[i],.102,zs[i]],b=[xs[i+1],.102,zs[i+1]],c=[xs[i+1],.190,zs[i+1]],d=[xs[i],.190,zs[i]];
   vertices.push(...a,...b,...c,...a,...c,...d);
  }
  const lowerGeo=new THREE.BufferGeometry();lowerGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));lowerGeo.computeVertexNormals();mesh(rear,lowerGeo,'orange').name='rear-lower-skin';
  // Upper-beam controls visible in rear.jpg (no "12"/management sticker).
  box(rear,[.004,.045,.045],[-.666,.335,.225],'steel','rear-connector-plate');
  cylinder(rear,.014,.012,[-.672,.335,.225],'black','x').name='rear-round-connector';
  cylinder(rear,.013,.014,[-.668,.350,-.285],'green','x').name='rear-green-button';
  cylinder(rear,.024,.008,[-.668,.350,-.238],'gold','x').name='rear-estop-base';
  cylinder(rear,.021,.020,[-.674,.350,-.238],'red','x').name='rear-estop';
  box(rear,[.025,.028,.026],[-.640,.350,-.238],'black','rear-estop-contact-block');
  for(const z of [-.252,-.224])box(rear,[.014,.028,.006],[-.620,.350,z],'gold','rear-button-terminal');
  cylinder(rear,.012,.024,[-.638,.335,.225],'black','x').name='rear-connector-back';
  for(const [i,color]of [[0,0x3977a0],[1,0x433a38],[2,0xb44b3f]])bundle(rear,[[-.620,.350,-.238+i*.004],[-.615,.378,-.21],[-.610,.380,.12],[-.620,.350,.225]],color,.0015).name='rear-retained-control-lead';
  // Lower band: red lower band, silver bar, silver trim, real black rubber bumper.
  box(rear,[.018,.042,.70],[-.658,.082,0],'orangeDark','rear-lower-band');
  box(rear,[.006,.012,.42],[-.636,.145,0],'alloy','rear-silver-bar');
  box(rear,[.008,.010,.70],[-.663,.056,0],'steel','rear-lower-trim');
  box(rear,[.020,.030,.72],[-.660,.036,0],'rubber','rear-rubber-bumper');
 }else{
  roundedFace(rear,.69,.30,.022,-.657,.016,'orange',.252,[[-.23,.29,.125,.11]]).name='navigation-aperture';
  box(rear,[.05,.12,.16],[-.662,.245,.11],'dark');
  for(const z of [.06,.16])cylinder(rear,.014,.012,[-.688,.245,z],'steel','x');
  box(rear,[.004,.055,.11],[-.657,.145,-.19],'red');
  box(rear,[.02,.03,.72],[-.66,.062,0],'rubber');
  for(const z of [-.30,.30]){const loop=mesh(rear,new THREE.TorusGeometry(.024,.006,8,20),'steel',-.684,.104,z);loop.rotation.y=Math.PI/2}
  cylinder(rear,.024,.018,[-.668,.412,.26],'black');
  cylinder(rear,.021,.035,[-.668,.438,.26],'lamp');
 }

 // ---- drive units: wheel, gearmotor, encoder, swing arm, caster ----
 for(const side of [1,-1]){
  const drive=assembly(side===1?'drive-left':'drive-right',side===1?'左驱动轮组':'右驱动轮组',[0,0,0],'drive-system',variant==='old'?'依据驱动图与现场照片示意行走轮：深色金属轮面、棕色聚氨酯外缘、六颗轮毂螺栓（不建大金色亮轮毂）及减速电机、编码器、摆臂连接底座、调整杆、弹簧与万向轮；轮径、安装点及减震行程未由实车标定。':'依据驱动图示意行走轮、减速电机、编码器、摆臂连接底座、调整杆、弹簧与万向轮；轮径、安装点及减震行程未由实车标定。');
  const z=side*.278;
  cylinder(drive,.135,.088,[.01,.135,z],variant==='old'?'tireOld':'rubber','z').name='drive-tyre';
  if(variant==='old'){
   // Site photos: dark metal wheel face inside a brown polyurethane rim, six bolts,
   // no polished gold hub.
   cylinder(drive,.113,.006,[.01,.135,z+side*.045],'dark','z').name='drive-wheel-face';
   cylinder(drive,.034,.010,[.01,.135,z+side*.049],'dark','z').name='drive-wheel-hub';
   cylinder(drive,.010,.008,[.01,.135,z+side*.054],'steel','z').name='drive-wheel-cap';
   for(let i=0;i<6;i++){const angle=i*Math.PI/3;cylinder(drive,.0075,.012,[.01+Math.cos(angle)*.066,.135+Math.sin(angle)*.066,z+side*.050],'steel','z').name='drive-wheel-bolt'}
  }else{
   cylinder(drive,.098,.09,[.01,.135,z],'gold','z');
   cylinder(drive,.042,.094,[.01,.135,z],'dark','z');
   for(let i=0;i<6;i++){const angle=i*Math.PI/3;cylinder(drive,.008,.012,[.01+Math.cos(angle)*.066,.135+Math.sin(angle)*.066,z+side*.048],'steel','z')}
  }
  // Fixed gearmotor is inboard of the tyre's inner face (|z|=.234).
  box(drive,[.16,.13,.090],[-.06,.205,side*.183],'steel','drive-gearbox');
  cylinder(drive,.025,.018,[.01,.145,side*.220],'steel','z').name='drive-output-flange';
  cylinder(drive,.014,.050,[.01,.135,side*.245],'steel','z').name='drive-output-shaft';
  cylinder(drive,.018,.010,[-.1425,.212,side*.183],'steel','x').name='drive-motor-coupling';
  cylinder(drive,.046,.17,[-.23,.212,side*.183],'dark','x').name='drive-motor';
  for(let i=0;i<8;i++)box(drive,[.15,.006,.006],[-.23,.212+Math.cos(i*Math.PI/4)*.048,side*.183+Math.sin(i*Math.PI/4)*.048],'steel');
  cylinder(drive,.03,.04,[-.33,.212,side*.183],'steel','x');
  cylinder(drive,.022,.05,[-.365,.212,side*.183],'black','x').name='drive-encoder';
  box(drive,[.95,.03,.045],[-.06,.145,side*.205],'steel','drive-rocker');
  box(drive,[.10,.04,.08],[-.29,.114,side*.215],'dark','drive-pivot-base');
  cylinder(drive,.018,.08,[-.29,.143,side*.215],'steel','z');
  // Low saddle supports the end coil, not a solid block around four turns.
  box(drive,[.05,.018,.045],[.30,.169,side*.215],'steel','drive-adjustment-seat');
  cylinder(drive,.008,.11,[.30,.224,side*.215],'steel','y');
  for(const x of [.279,.321])box(drive,[.008,.012,.040],[x,.154,side*.215],'steel','drive-spring-seat-foot');
  // A schematic spring around the adjustment stem, not a suspension simulation.
  const springPoints=[];for(let i=0;i<=120;i++){const a=i/120*Math.PI*12;springPoints.push(new THREE.Vector3(.30+Math.cos(a)*.018,.1815+i/120*.075,side*.215+Math.sin(a)*.018))}
  const spring=mesh(drive,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),120,.0035,6,false),'steel');spring.name='drive-spring';
  for(const x of [-.51,.48]){
   cylinder(drive,.034,.03,[x,.036,side*.245],'rubber','z').name='drive-caster';
   box(drive,[.038,.024,.032],[x,.075,side*.245],'steel');
   box(drive,[.048,.012,.04],[x,.098,side*.245],'dark');
  }
  // Three distinct restrained runs from the fixed encoder/motor side; no
  // artificial connector on the rotating hub and no path through the tyre.
  for(let i=0;i<3;i++){
   const dz=i*.008;
   bundle(drive,[[-.388,.218+i*.004,side*(.183+dz)],[-.405,.282+i*.006,side*(.180+dz)],[-.34,.322+i*.006,side*(.205+dz)],[-.18,.330+i*.006,side*(.205+dz)]],i===0?0xb74948:0x3d6d9d,.0023).name='drive-fixed-harness';
  }
 }

 // ---- lift: scissor arms with lightening holes, screw jack, servo ----
 const lift=assembly('lift','丝杆升降与剪叉导向',[0,0,0],'lift-system','依据顶升图示意剪叉、错层交叉臂、中心销、滑块、丝杆和伺服连接；90毫米为说明书额定举升值，本模型不模拟或验证举升运动。');
 for(const z of [-.105,.105]){
  slottedArm(lift,[-.36,.155],[.34,.353],z-.012).name='scissor-arm-a';
  slottedArm(lift,[-.36,.353],[.34,.155],z+.012).name='scissor-arm-b';
  cylinder(lift,.016,.058,[-.01,.254,z],'steel','z').name='scissor-center-pin';
  box(lift,[.78,.025,.045],[0,.1225,z],'dark','lift-lower-rail');
  box(lift,[.78,.018,.045],[0,.381,z],'dark','lift-upper-rail');
  for(const y of [.148,.365])box(lift,[.06,.026,.050],[.34,y,z],'steel','lift-slider');
  for(const [x,y] of [[-.36,.155],[-.36,.353],[.34,.155],[.34,.353]])cylinder(lift,.014,.060,[x,y,z],'steel','z');
 }
 cylinder(lift,.012,.40,[-.02,.18,0],'steel','x').name='lift-screw';
 for(let i=0;i<23;i++)cylinder(lift,.015,.004,[-.21+i*.017,.18,0],'dark','x');
 box(lift,[.055,.045,.050],[-.10,.18,0],'dark','lift-nut');
 // Nut/yoke connection to the two lower sliding ends (schematic linkage).
 box(lift,[.035,.026,.23],[.34,.148,0],'steel','lift-yoke');
 // Keep the draw link beside the inline screw drive, not through its housings.
 box(lift,[.035,.026,.10],[-.10,.18,.04],'steel','lift-nut-lug');
 beam(lift,[-.10,.18,.06],[.34,.148,.06],.018,'steel').name='lift-linkage';
 box(lift,[.075,.070,.075],[.218,.18,0],'steel','lift-gearbox');
 cylinder(lift,.034,.11,[.315,.18,0],'dark','x').name='lift-servo';
 box(lift,[.04,.025,.035],[.38,.15,.06],'green','lift-limit-switch');

 // ---- controller and electrical group ----
 const control=assembly('control','控制器与电气组件',[0,0,0],'body-without-covers','依据拆罩图和现场照片示意控制器散热壳、继电器、驱动器、开关电源及端子。托架、器件数量、安装坐标与线槽走向为便于辨识的布局示意，不是实车安装图或电路图。');
 const plc=assembly('plc',variant==='old'?'SEW MOVI-PLC控制器':'PLC控制器（电路组成示意）',[-.65,.66,-.12],'control','独立PLC，不与车辆主控合并。老车08铭牌为DHR41B/MOVI-PLC红色长盒；新车只采用自身电路组成，不据照片确认型号。');
 const relays=assembly('relay-bank','继电器排',[.30,.58,.55],'control','侧面长导轨继电器排，老车按照片01/02形态；可见件数仅示意，不作完整BOM。');
 const aux=assembly('aux-power','辅助电源',[-.60,.40,.52],'control','独立辅助电源外壳与接线端，功能与参数以本车型图纸为准。');
 const dcdc=assembly('dcdc','车载稳压电源',[.60,.28,-.48],'power','独立48V稳压电源。#19标500V→48V；#20/#26 PDF23标AC600V→DC48V 1500W，保留资料差异，不宣称实车输入额定值已核定。壳体与坐标为示意。');
 const io=variant==='old'?assembly('io-board','车辆主控、板卡与端子组件',[.65,.64,.65],'control','照片中主控/板卡与插接件，独立于SEW储能PLC；板号与每根信号尚未实测映射。'):control;
 const fuses=variant==='old'?assembly('fuse-panel','熔断器安装板',[.65,.40,.42],'control','照片01/03所见双层熔断器座与底板；不臆测遮挡编号和完整数量。'):control;
 const auxiliary=variant==='old'?assembly('auxiliary-unit','竖置有筋设备（身份待核）',[-.60,.38,-.55],'control','照片05蓝色竖置设备，按外形辨识，不擅自认作驱动器或第二管理器。'):control;
 // Schematic zones, not measured mounting coordinates. Keep the side electrical
 // bays clear of the central lift and drive motors.
 box(control,[.20,.012,.24],[variant==='old'?-.480:-.505,.25,0],'dark','controller-shelf');
 box(control,[.32,.012,.13],[.39,.28,.23],'dark','relay-shelf');
 for(const z of [-.245,.245])box(control,[.17,.012,.13],[variant==='old'?-.480:-.505,.215,z],'dark','rear-equipment-shelf');
 for(const z of [-.115,.115])box(control,[.025,.14,.018],[-.505,.17,z],'steel');
 for(const z of [-.308,.308])box(control,[.95,.022,.022],[.085,.33,z],'dark','cable-duct');
 for(const x of [-.57,-.44])for(const z of [-.065,.065])box(control,[.018,.010,.018],[x,.261,z],'black');
 if(variant==='old')box(control,[.14,.005,.12],[-.505,.2235,.245],'black');
 if(variant==='old'){
  box(plc,[.34,.060,.115],[-.40,.302,0],'red','plc-housing');
  box(plc,[.33,.008,.12],[-.40,.268,0],'dark','plc-base');
  box(plc,[.15,.001,.045],[-.43,.333,0],'alloy','plc-nameplate');
  for(const x of [-.53,-.44,-.32])box(plc,[.030,.020,.018],[x,.294,.065],'black','plc-connector');
  // Elevated rear controller bridge; its legs stay behind the scissor arms.
  for(const x of [-.57,-.405]){
   box(control,[.020,.008,.30],[x,.260,0],'dark','plc-support-crossbar');
   for(const z of [-.145,.145])box(control,[.010,.162,.010],[x,.175,z],'steel','plc-support-leg');
  }
 }else{
  box(plc,[.17,.072,.17],[-.505,.302,0],'alloy','controller-housing');
  for(let i=0;i<12;i++)box(plc,[.007,.030,.165],[-.579+i*.0135,.353,0],'alloy');
 }
 const relayCount=variant==='old'?12:5,relayPitch=variant==='old'?.024:.055;
 box(relays,[.30,.010,.014],[.39,.291,.23],'steel','relay-din-rail');
 for(let i=0;i<relayCount;i++){
  const x=variant==='old'?.25+i*relayPitch:.25+i*relayPitch;
  box(relays,[variant==='old'?.019:.037,.045,.055],[x,.314,.23],'dark','relay-housing');
  box(relays,[variant==='old'?.016:.031,.014,.048],[x,.3435,.23],'clear','relay-clear-cap');
  for(const z of [.201,.259])box(relays,[.012,.010,.009],[x,.300,z],'blue','relay-terminal');
 }
 box(dcdc,[.202,.012,.13],[.43,.108,-.23],'dark','dcdc-tray');
 box(dcdc,[.21,.066,.115],[.43,.147,-.23],'alloy','dcdc-housing');
 for(let i=0;i<9;i++)box(dcdc,[.012,.016,.11],[.34+i*.0225,.188,-.23],'steel','dcdc-fin');
 box(dcdc,[.014,.035,.080],[.542,.164,-.23],'green','dcdc-terminals');
 for(const child of dcdc.children)child.position.y+=.065;
 for(const x of [.43,.53])box(dcdc,[.012,.073,.11],[x,.1305,-.23],'dark','dcdc-tray-support');
 if(variant==='old'){
  // Raised PCB above the relay level and a separate two-storey fuse tray.
  box(io,[.27,.008,.105],[.38,.364,.23],'dark','io-upper-tray');
  for(const x of [.27,.49])for(const z of [.19,.27])cylinder(io,.004,.014,[x,.375,z],'gold').name='pcb-standoff';
  box(io,[.25,.003,.095],[.38,.384,.23],'green','io-pcb');
  for(let i=0;i<8;i++)box(io,[.018,.011,.018],[.29+i*.026,.391,.23],i%2?'black':'alloy','pcb-component');
  box(io,[.18,.018,.015],[.38,.393,.285],'green','io-terminal-strip');
  box(fuses,[.17,.005,.105],[.08,.315,-.25],'alloy','fuse-lower-tray');
  box(fuses,[.17,.005,.105],[.08,.366,-.25],'alloy','fuse-upper-tray');
  for(const x of [.009,.151])for(const z of [-.29,-.21])cylinder(fuses,.0035,.046,[x,.3405,z],'steel').name='fuse-tray-post';
  for(const y of [.333,.384])for(let i=0;i<6;i++){
   const x=.018+i*.025;
   box(fuses,[.017,.025,.055],[x,y,-.25],'dark','fuse-holder');
   box(fuses,[.012,.010,.039],[x,y+.017,-.25],'clear','fuse-window');
   for(const z of [-.282,-.218])box(fuses,[.012,.012,.009],[x,y,z],'steel','fuse-terminal');
  }
 }
 if(variant==='old'){
  box(auxiliary,[.14,.13,.12],[-.505,.286,-.245],'blue','auxiliary-finned-housing');
  for(let i=0;i<5;i++)box(auxiliary,[.008,.018,.11],[-.56+i*.027,.360,-.245],'steel','auxiliary-rib');
  box(aux,[.14,.060,.12],[-.505,.256,.245],'alloy','smps-housing');
  for(let i=0;i<5;i++)cylinder(aux,.005,.008,[-.56+i*.027,.291,.245],'steel','y');
 }else{
  // Separate new-car drive housings occupy the rear side shelves. Move the
  // illustrative auxiliary supply above the side motor, not through a driver.
  box(control,[.17,.008,.13],[-.30,.272,.23],'dark','smps-shelf');
  for(const x of [-.35,-.25]){
   box(control,[.01,.174,.01],[x,.181,.285],'steel','smps-support');
   box(control,[.02,.004,.02],[x,.278,.23],'black');
  }
  box(aux,[.14,.060,.12],[-.30,.310,.23],'alloy','smps-housing');
  for(let i=0;i<5;i++)cylinder(aux,.005,.008,[-.355+i*.027,.345,.23],'steel','y');
 }
 for(let i=0;i<5;i++)box(control,[.023,.024,.04],[.26+i*.052,.304,.290],'steel','terminal-block');
 for(const side of [-1,1])for(let i=0;i<4;i++)bundle(control,[[-.56,.355+i*.004,side*.285],[-.32,.35+i*.004,side*.312],[.18,.35+i*.004,side*.312],[.50,.35+i*.004,side*.285]],i===0?0xb74948:0x3d6d9d,.0022);
 bundle(control,[[-.51,.34,.08],[-.54,.36,.18],[-.52,.35,.29]],0x468a72,.004);

 // ---- power conversion, pickup, coupler, supercapacitor ----
 const tpm=assembly('tpm','TPM电源变换器',[0,0,0],'wireless-power','知识#19标注TPM12B030-ENE-5A2-2及两块THM取电板；此处仅示意散热壳体，安装坐标与端子接线未由资料确认。');
 tpm.userData.sourceKnowledgeId=19;tpm.userData.labelAnchor=[.44,.375,-.23];
 box(tpm,[.24,.012,.15],[.44,.27,-.23],'dark','tpm-tray');
 box(tpm,[.18,.009,.10],[.44,.2805,-.23],'black');
 box(tpm,[.20,.070,.13],[.44,.32,-.23],'alloy','tpm-housing');
 for(let i=0;i<(variant==='old'?16:7);i++)box(tpm,[variant==='old'?.0035:.009,variant==='old'?.032:.014,.14],[.350+i*(variant==='old'?.012:.028),variant==='old'?.371:.362,-.23],'alloy','tpm-cooling-fin');
 box(tpm,[.016,.045,.10],[.548,.32,-.23],'dark','tpm-connectors');
 if(variant==='old'){
  const connections=assembly('wireless-connectors','无线取电邻接连接盒',[-.60,.65,.38],'power','照片05/07银长壳邻接的独立端子盒；内部功能待核，未新增第二TPM或管理器。');
  box(connections,[.085,.045,.10],[.29,.316,-.23],'alloy','wireless-junction-box');
  for(const z of [-.255,-.205])cylinder(connections,.008,.012,[.241,.316,z],'black','x').name='wireless-cable-gland';
 }
 const pickup=assembly('pickup','THM平板型取电板（两块）',[.03,.10,.60],'wireless-power','知识#19列出两块THM10E015取电板；示意安装于车底，从无线供电设施获取能量，不是电池。展开时移到侧前方展示底面，不代表实际拆装方向。');
 pickup.userData.sourceKnowledgeId=19;pickup.userData.labelAnchor=[.42,.048,0];
 for(const x of [-.42,.42]){box(pickup,[.24,.012,.24],[x,.028,0],'alloy','pickup-plate');box(pickup,[.215,.008,.215],[x,.019,0],'dark');cylinder(pickup,.009,.03,[x,.05,0],'dark');bundle(pickup,[[x,.062,0],[x,.07,.07],[x+.04,.07,.12]],0x252d35,.004)}
 const ekk=assembly('ekk','EKK储能管理器',[0,0,0],'wireless-power','EKK管理器就是MOVI-DPS Energy Interface，独立于EKS超级电容。新补照片确认EKK-A-D500-I06-500-0-0/E12的黑色平盖、银色箱体、两端红色端盖、四只圆形接口及三只大矩形插接件；不把盖板画成顶置散热齿。端口编号按照片辨识，接线功能仍按图纸核对；托架、坐标和尺寸为示意。');
 ekk.userData.sourceKnowledgeId=19;ekk.userData.labelAnchor=[.49,.265,.23];
 box(ekk,[.272,.012,.13],[.465,.173,.23],'dark','ekk-tray');
 for(const x of [.43,.59])box(ekk,[.012,.073,.11],[x,.1305,.23],'dark','ekk-tray-support');
 if(variant==='old'){
  box(ekk,[.255,.078,.10],[.46,.218,.23],'alloy','ekk-housing');
  box(ekk,[.253,.005,.111],[.46,.2595,.23],'black','ekk-flat-lid');
  for(const x of [.325,.595]){
   box(ekk,[.014,.094,.112],[x,.226,.23],'red','ekk-red-end-cover');
   for(const y of [.187,.207,.247,.267])box(ekk,[.026,.008,.124],[x,y,.23],'red','ekk-end-flange');
  }
  for(const x of [.35,.57])for(const z of [.187,.273])cylinder(ekk,.003,.002,[x,.263,z],'steel').name='ekk-lid-screw';
  box(ekk,[.135,.001,.052],[.474,.263,.23],'white','ekk-port-diagram');
  const signalPorts=[['X5221',.350,.242],['X5111',.386,.242],['X4102',.350,.202],['X4101',.386,.202]];
  for(const [id,x,y]of signalPorts){
   cylinder(ekk,.008,.009,[x,y,.2845],'steel','z').name='ekk-signal-port';
   const insert=cylinder(ekk,.0055,.003,[x,y,.291],'black','z');insert.name='ekk-signal-insert';insert.userData.connector=id;
  }
  for(const [id,x,w]of [['X2381',.435,.033],['X2361',.490,.033],['X1501',.550,.040]]){
   const shell=box(ekk,[w,.045,.024],[x,.222,.292],'steel','ekk-power-connector');shell.userData.connector=id;
   box(ekk,[w-.006,.036,.020],[x,.222,.313],'black','ekk-power-plug');
   for(const dx of [-1,1])box(ekk,[.003,.039,.011],[x+dx*(w/2+.0015),.222,.300],'steel','ekk-connector-latch');
  }
  Object.assign(ekk.userData,{photoReference:'site-20261113-ekk',connectorIds:['X5221','X5111','X4102','X4101','X2381','X2361','X1501'],placement:'illustrative'});
 }else{
  box(ekk,[.16,.060,.10],[.52,.209,.23],'alloy','ekk-housing');
  box(ekk,[.016,.100,.112],[.606,.220,.23],'red','ekk-red-end-cover');
  for(let i=0;i<3;i++)cylinder(ekk,.008,.014,[.475+i*.045,.229,.286],'dark','z').name='ekk-connector';
 }
 const capacitor=assembly('supercapacitor','EKS超级电容单元',[0,0,0],'wireless-power','老车EKS138A系列超级电容，与EKK管理器分别建模。新增照片显示三段封装、黑色端盖、灰色带菱形孔护板、连接耳和端部插接件，不能简化为裸电芯或车尾小盒。安装在车内前段内侧、剪叉前端下方，侧面电气件之后；实际尺寸、孔数和安装坐标未测量。新车只以自身电路确认储能功能，外壳仍为示意。');
 capacitor.userData.sourceKnowledgeId=19;capacitor.userData.labelAnchor=[-.505,.225,0];
 if(variant==='old'){
  capacitor.userData.labelAnchor=[.50,.31,0];
  Object.assign(capacitor.userData,{photoReference:'site-20261113-eks-and-installed-location',visiblePackSections:3,placement:'photo-relative-position-dimensions-illustrative'});
  box(capacitor,[.210,.017,.164],[.504,.1025,0],'dark','capacitor-tray');
  for(const x of [.436,.504,.572]){
   // Three sealed cassettes form ONE selectable EKS assembly. The perforated
   // protective skin is separate from the dark sealed body behind the holes.
   box(capacitor,[.062,.194,.144],[x,.208,0],'dark','capacitor-enclosure');
   const panel=new THREE.Shape();panel.moveTo(-.027,-.097);panel.lineTo(.027,-.097);
   for(let i=0;i<5;i++)panel.quadraticCurveTo(.035,-.097+(i+.5)*.0388,.027,-.097+(i+1)*.0388);
   panel.lineTo(-.027,.097);
   for(let i=0;i<5;i++)panel.quadraticCurveTo(-.035,.097-(i+.5)*.0388,-.027,.097-(i+1)*.0388);
   panel.closePath();
   for(const y of [-.065,-.022,.022,.065])for(const dx of [-.016,.016]){
    const h=new THREE.Path();h.moveTo(dx-.007,y);h.lineTo(dx,y+.009);h.lineTo(dx+.007,y);h.lineTo(dx,y-.009);h.closePath();panel.holes.push(h);
   }
   mesh(capacitor,new THREE.ExtrudeGeometry(panel,{depth:.002,bevelEnabled:false,curveSegments:8}),'alloy',x,.208,.074).name='capacitor-perforated-side';
   box(capacitor,[.062,.194,.002],[x,.208,-.075],'black','capacitor-installed-side');
   box(capacitor,[.065,.008,.152],[x,.309,0],'black','capacitor-end-cap');
   for(const z of [-.069,.069])cylinder(capacitor,.003,.004,[x,.314,z],'steel').name='capacitor-cap-screw';
   const lug=box(capacitor,[.018,.030,.004],[x+.024,.270,.080],'alloy','capacitor-mounting-ear');
   for(const y of [.261,.279])cylinder(capacitor,.003,.003,[lug.position.x,y,.084],'dark','z').name='capacitor-ear-bolt';
  }
  for(const z of [-.036,.036]){
   cylinder(capacitor,.009,.018,[.436,.323,z],'steel').name='capacitor-connector';
   cylinder(capacitor,.008,.020,[.436,.338,z],'black').name='capacitor-plug';
   bundle(capacitor,[[.436,.347,z],[.419,.359,z],[.390,.357,z*1.8],[.378,.34,z*2.5]],0x282c31,.0035).name='capacitor-fixed-lead';
  }
  cylinder(capacitor,.009,.010,[.431,.270,-.082],'steel','z').name='capacitor-monitor-connector';
  box(capacitor,[.031,.013,.001],[.463,.270,-.077],'white','capacitor-xs221-marker');
 }else{
 box(capacitor,[.19,.014,.16],[-.505,.104,0],'dark','capacitor-tray');
 box(capacitor,[.17,.090,.15],[-.505,.157,0],'dark','capacitor-enclosure');
 for(const x of [-.599,-.411])box(capacitor,[.008,.105,.16],[x,.1635,0],'alloy','capacitor-end-plate');
 for(const z of [-.078,.078])box(capacitor,[.18,.105,.004],[-.505,.1635,z],'alloy','capacitor-side-panel');
 const eksTop=flat(capacitor,.18,.16,.002,.216,'alloy',.003);eksTop.position.x=-.505;eksTop.name='capacitor-lid';
 box(capacitor,[.025,.028,.035],[-.505,.185,.098],'black','capacitor-connector');
 bundle(capacitor,[[-.505,.185,.115],[-.53,.23,.125],[-.55,.24,.15]],0x282c31,.004).name='capacitor-fixed-lead';
 }

 // ---- navigation radar (rear centre recess) and one TIM per end ----
 const navigation=assembly('navigation','导航扫描头',[-.90,.28,0],'safety','导航头与前后TIM分别选择/展开；安装位置按对应车型证据示意，不能作安全标定。');
 const timFront=assembly('tim-front','前端TIM避障组件',[.88,.18,-.54],'safety','老车每端一只；新车保留原模型自身数量，非由老车照片推定。');
 const timRear=assembly('tim-rear','后端TIM避障组件',[-.88,.18,.54],'safety','安装角度和扫描场均待实车标定。');
 const sensors=assembly('sensors','导航雷达与TIM避障组件',[0,0,0],'body-without-covers',variant==='old'?'按rear与rear-recess近照把导航雷达置于无屏端横向中部的**空槽**：上下端梁之间只有黑上盖+红色透明扫描头，周围为空，没有黑色填充壳或亮红假墙；槽顶/底为红台阶面，深色背/侧壁，内部电器收在槽后、不得外露；不偏置到角部，也不放在平台顶面。前后各1只TIM避障组件，位于面对该端右下角（front=-Z、rear=+Z，相反Z侧），蓝黑外壳、黑色圆柱朝下，并与导航雷达分开命名。器件安装坐标与扫描范围未按实车标定，不能用于标定或安全验收。':'依据拆罩图将导航雷达示意于短端平台下方，并预留对外开口；前后低位示意安全雷达。安装坐标、数量、角度和扫描范围需按实车核对，不能用于标定或安全验收。');
 if(variant==='old'){
  // The slot is empty in the photos: only the scanner sits between the beams.
  box(sensors,[.070,.010,.110],[-.600,.195,0],'dark','navigation-bracket');
  cylinder(sensors,.036,.010,[-.625,.191,0],'black');
  const navWindow=cylinder(sensors,.034,.070,[-.625,.228,0],'navWindow');navWindow.name='navigation-scan-window';
  cylinder(sensors,.030,.056,[-.625,.228,0],'dark').name='navigation-scan-head';
  cylinder(sensors,.042,.014,[-.625,.262,0],'black').name='navigation-scan-cap';
  // Exactly one TIM per end, at the lower-right corner seen from that end:
  // front end (viewed at +X) is -Z, rear end (viewed at -X) is +Z.
  for(const [prefix,x,side]of [['tim-front',.55,-1],['tim-rear',-.55,1]]){
   box(sensors,[.046,.030,.026],[x,.132,side*.335],'blue',prefix+'-housing');
   box(sensors,[.043,.022,.002],[x,.139,side*.349],'black',prefix+'-face');
   box(sensors,[.046,.018,.030],[x,.113,side*.331],'black',prefix+'-base');
   cylinder(sensors,.016,.052,[x,.086,side*.331],'black','y').name=prefix+'-cylinder';
  }
  for(let i=0;i<3;i++)bundle(sensors,[[-.58,.20,-.03],[-.57,.24,-.10],[-.55,.30,-.12]],i===0?0x252d35:0x3d6d9d,.002);
 }else{
  box(sensors,[.075,.012,.09],[-.625,.222,-.23],'steel','navigation-bracket');
  cylinder(sensors,.036,.056,[-.63,.256,-.23],'blue');
  cylinder(sensors,.038,.018,[-.63,.29,-.23],'black').name='navigation-scan-head';
  cylinder(sensors,.041,.012,[-.63,.305,-.23],'blue');
  cylinder(sensors,.03,.008,[-.63,.315,-.23],'dark');
  for(const z of [-.255,.255]){
   box(sensors,[.06,.05,.075],[.645,.135,z],'blue');
   box(sensors,[.03,.03,.06],[.678,.135,z],'black');
  }
  for(const z of [-.255,.255]){
   box(sensors,[.06,.05,.075],[-.645,.135,z],'blue');
   box(sensors,[.03,.03,.06],[-.678,.135,z],'black');
  }
  for(let i=0;i<3;i++)bundle(sensors,[[-.63,.23,-.23],[-.61,.24,-.29],[-.57,.32+i*.005,-.308]],i===0?0x252d35:0x3d6d9d,.002);
 }

 // Reparent components into direct root assemblies; mounts and fixed loom
 // deliberately stay in the nonempty compatibility sensors group.
 for(const child of [...sensors.children]){
  if(child.name.startsWith('tim-front')||(variant==='new'&&child.position.x>.63))timFront.add(child);
  else if(child.name.startsWith('tim-rear')||(variant==='new'&&child.position.x<-.64&&child.position.y<.18))timRear.add(child);
  else if(child.geometry?.type==='CylinderGeometry'&&child.position.x<-.62&&child.position.y>.18)navigation.add(child);
 }
 sensors.userData.label='传感器支架与固定线束';
 for(const g of [timFront,timRear]){
  const x=g===timFront?.645:-.645,z=variant==='old'?(g===timFront?-.300:.300):.255;
  box(sensors,[.030,.055,.020],[x,variant==='old'?(g===timFront?.125:.185):.175,z],'steel','tim-fixed-bracket');
 }
 root.userData.referenceKnowledgeIds=[17,19,20,21,36];
 if(variant==='new'){
  root.userData.referenceKnowledgeIds=[19,21,26];
  root.userData.confirmedNewElectricalFeatures=['A5/A6-Kinco-drive-circuits','Y1/Y2-separate-drive-brake-circuits','A7-lift-servo-circuit'];
  root.userData.variantComparisonNote='列出的是#26确认的新车电气组成，不据此断言抱闸/顶升等功能只在新车存在，也不代表老新机械安装差异。';
  root.userData.newMechanicalAssemblyAvailable=false;
  control.userData.sourceKnowledgeIds=[21,26];
  control.userData.description='车架与控制器外形沿用老车资料辨识示意；新车电路#26列出左右驱动器A5/A6及顶升伺服驱动器A7。A5/A6单列显示，A7放在本电气组。电源、端子、托架及全部安装坐标均未由新车总装图确认，不能据此安装或接线。';
  // The new-car PDF has three cover/index pages: PDF pages 12/13/14
  // correspond to printed electrical sheets 9/10/11 of 25, respectively.
  for(const [id,label,z,ref,driveId,motorRef,encoderRef,brakeRef] of [
   ['kinco-left','步科左驱动器 A5',.245,'A5','drive-left','M9','E1','Y1'],
   ['kinco-right','步科右驱动器 A6',-.245,'A6','drive-right','M10','E2','Y2']
  ]){
   const driver=assembly(id,label,[0,0,0],'new-drive-circuit','新车电路#26的PDF第12页（图纸9/25）列出左右驱动器A5/A6与X1—X5接口，第13页（10/25）列出独立抱闸回路。壳体、接口排布和后侧安装位置只作电气组成示意，未取得新车机械总装图。');
   Object.assign(driver.userData,{sourceKnowledgeId:26,sourcePdfPages:[12,13],sourceSheetNumbers:[9,10],deviceReference:ref,motorReference:motorRef,encoderReference:encoderRef,brakeReference:brakeRef,placement:'illustrative',labelAnchor:[-.505,.39,z]});
   for(const x of [-.54,-.47])box(driver,[.02,.009,.02],[x,.2255,z],'black','kinco-mount-foot');
   box(driver,[.11,.12,.085],[-.505,.29,z],'blue','kinco-drive-housing');
   for(let i=0;i<5;i++){
    const port=box(driver,[.013,.018,.016],[-.547+i*.021,.359,z],'green','kinco-port-X'+(i+1));
    port.userData={sourceKnowledgeId:26,connectorReference:'X'+(i+1),placement:'illustrative'};
    box(driver,[.006,.075,.09],[-.545+i*.018,.31,z],'steel','kinco-fin');
   }
   const drive=parts.find(part=>part.name===driveId);
   Object.assign(drive.userData,{sourceKnowledgeIds:[21,26],electricalKnowledgeId:26,sourcePdfPages:[12,13],motorReference:motorRef,encoderReference:encoderRef,brakeReference:brakeRef});
   drive.userData.description+=' 新车电路对应'+motorRef+'电机、'+encoderRef+'增量编码器和'+brakeRef+'抱闸；附加标识环只用于辨识抱闸回路，不代表已确认机械安装形式。';
   const collar=cylinder(drive,.034,.014,[-.323,.212,z>0?.183:-.183],'dark','x');collar.name='drive-brake-collar';
   collar.userData={sourceKnowledgeId:26,deviceReference:brakeRef,geometryEvidence:'circuit-symbol-only',placement:'illustrative'};
  }
  // A7 stays within the existing control part: no new public part ID or
  // interaction contract is needed to represent the third servo circuit.
  box(control,[.13,.01,.08],[.52,.267,.12],'dark','kinco-lift-shelf');
  for(const x of [.48,.56]){
   box(control,[.012,.168,.012],[x,.183,.13],'steel','kinco-lift-support');
   box(control,[.018,.003,.018],[x,.2735,.12],'black');
  }
  const liftDriver=box(control,[.105,.08,.07],[.52,.315,.12],'blue','kinco-lift-housing');
  liftDriver.userData={sourceKnowledgeId:26,sourcePdfPages:[14],sourceSheetNumbers:[11],deviceReference:'A7',placement:'illustrative'};
  for(let i=0;i<4;i++)box(control,[.008,.014,.075],[.48+i*.026,.362,.12],'steel');
  for(const [i,ref] of ['X3','X4','X5'].entries()){
   const port=box(control,[.012,.016,.018],[.48+i*.04,.377,.12],'green','kinco-lift-port-'+ref);
   port.userData={sourceKnowledgeId:26,connectorReference:ref,placement:'illustrative'};
  }
  // PDF p23 (sheet 20/25) confirms the same power-component families, not
  // their exact SKUs, block count or mechanical layout on the new vehicle.
  for(const part of [tpm,pickup,ekk,capacitor])Object.assign(part.userData,{sourceKnowledgeId:26,referenceKnowledgeIds:[19,26],sourcePdfPages:[23],sourceSheetNumbers:[20],placement:'illustrative'});
  tpm.userData.description='新车电路#26的PDF第23页（图纸20/25）列出TPM变换器；外壳沿用知识#19的器件辨识示意，不据此断言新车具体型号、尺寸、位置或端子接线。';
  pickup.userData.description='新车电路#26的PDF第23页（图纸20/25）列出两块THM取电板；外形及车底位置为示意，不是电池。展开移到侧前方只为展示底面，不代表实际拆装方向。';
  pickup.userData.sourceComponentCount=2;
  ekk.userData.description='新车电路#26的PDF第23页（图纸20/25）列出EKK耦合器；外壳、托架、插口和位置沿用辨识示意，不能据此确认型号、安装或接线。';
  capacitor.userData.description='新车电路#26的PDF第23页（图纸20/25）列出EKV储能模块，属于超级电容而非电池。界面按用户认件称EKS，组合级图纸仍保留EKV字样；整体封装示意不代表新车型号、内部电芯数量及实际布线。';
 }
 root.userData.internalLayoutVersion=3;
 root.userData.geometryRevision=variant==='old'?'latent-deep-front-hood-20261112-rev3':'latent-shared-deep-front-hood-20261112-rev3';
 if(variant==='old'){
  root.userData.geometryRevision='latent-open-rear-eks-ekk-20261113-rev2';
  rear.userData.description='后壳上梁和下层台阶之间，两旁保留凹进的红色挡板，中央单独留空安装导航雷达；侧壁、折边与内挡板属于整件后壳。下部侧角有嵌入TIM的真实开孔，黑色扫描筒向下。外形按用户补充正面/内侧裁图示意，尺寸和安装坐标未实测。';
  root.userData.rearShellEvidence='用户裁图确认：左右凹进红色内挡板保留，后端正中间单独留空给导航雷达，不将整条间隙掏空。TIM藏在下部侧角开孔内，黑色扫描筒向下；前后各一只，壳体尺寸/坐标为比例示意。';
  root.userData.storageEvidence='用户认件：EKS为超级电容、EKK为独立管理器；新增电容本体/安装位置及EKK接口近照。形状和相对位置按照片，尺寸和绝对坐标仍为示意。';
  root.userData.geometryEvidenceNote='按老车说明书#21、2026-11-03/12/13现场照片还原。后端左右红色内挡板向内凹进，正中为导航头开口；不是整条间隙完全贯通。TIM嵌在下部侧角开孔，黑色扫描筒向下。EKS三段封装置于剪叉前端内侧下方，EKK为独立管理器。尺寸、壳深、坐标和线束仍按比例示意，不是制造CAD。';
  sensors.userData.description='导航头在后壳正中开口，两旁保留凹进红色内壁。前后各一只TIM，嵌于下部侧角开孔、黑色扫描筒向下，不外挂到端面。安装坐标、角度和扫描场为示意，不能用于安全标定。';
 }
 if(variant==='new')root.userData.frontShellEvidence='用户2026-11-12明确要求新老车统一修正车头外形；圆弧与凹面共用，尺寸为示意，不替代新车独立电气与操作器配置。';
 root.userData.mechanicalCorrections=['fixed-side-separated-harness','inboard-gearbox-with-shafts','exposed-spring-working-coils','caster-crossmember-relief'];
 const systemMembers={control:['control','plc','relay-bank','fuse-panel','io-board','aux-power','auxiliary-unit'],power:['tpm','pickup','ekk','supercapacitor','wireless-connectors','dcdc'],safety:['sensors','navigation','tim-front','tim-rear']};
 for(const part of parts){
  const system=Object.keys(systemMembers).find(key=>systemMembers[key].includes(part.name));
  if(system)Object.assign(part.userData,{systemId:system,system,placement:'illustrative',evidenceBoundary:variant==='old'?'site-photos-20261112-and-own-wiring':'own-wiring-26-no-old-photo-identity'});
 }
 control.userData.label='电气安装托架与主干';control.userData.explodeOffset=[-.48,.42,-.30];
 sensors.userData.explodeOffset=[-.70,.34,-.72];
 for(const p of [control,sensors])p.userData.presentationOffset=[...p.userData.explodeOffset];
 if(variant==='new')for(const p of [plc,relays,aux,dcdc,navigation,timFront,timRear])Object.assign(p.userData,{sourceKnowledgeId:26,sourceKnowledgeIds:[26],geometryEvidence:'illustrative-not-old-photo-identity'});
 root.updateMatrixWorld(true);
 return {root,parts,materials};
}

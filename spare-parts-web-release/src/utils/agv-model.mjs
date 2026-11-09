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
 for(const x of [-.52,-.24,.22,.48])box(chassis,[.036,.052,.58],[x,.062,0],'dark');
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
 // The reference shows a load-detection lever on TOP of the platform,
 // not a switch buried in the solid plate. Its exact mechanism is schematic.
 box(platform,[.055,.008,.040],[.10,.445,.13],'steel','load-switch-base');
 beam(platform,[.08,.451,.13],[.125,.457,.13],.006,'dark').name='load-switch-lever';
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
 }

 // ---- side covers: one extruded profile with the wheel arch ----
 const archTop=variant==='old'?.282:.315;
 const coverOutline=variant==='old'?[[-.655,.270],[-.655,.345],[-.625,.385],[.625,.385],[.655,.345],[.655,.115],[.22,.115],[.105,archTop],[-.085,archTop],[-.20,.115],[-.30,.270]]:[[-.655,.115],[-.655,.345],[-.625,.385],[.625,.385],[.655,.345],[.655,.115],[.22,.115],[.105,archTop],[-.085,archTop],[-.20,.115]];
 const outline=coverOutline.map(([x,y])=>new THREE.Vector2(x,y));
 const left=assembly('left-cover','左侧护罩',[0,.48,.46],'body-without-covers',variant==='old'?'左侧护罩按side-b原图：红色侧壳、轮拱、圆角横格散热孔与黑色腰线贴花；两侧散热细节按各自原图，不做机械镜像；拆装顺序非实车顺序。':'护罩分上下两层，侧板带轮拱和散热百叶；外形依据整车主视图和渲染图，拆装顺序非实车顺序。');
 const right=assembly('right-cover','右侧护罩',[0,.48,-.46],'body-without-covers',variant==='old'?'右侧护罩按side-a原图：红色侧壳、轮拱、竖向银色百叶散热孔与黑色腰线贴花；两侧散热细节按各自原图，不做机械镜像；拆装顺序非实车顺序。':'护罩分上下两层，侧板带轮拱和散热百叶；外形依据整车主视图和渲染图，拆装顺序非实车顺序。');
 for(const [group,side] of [[left,1],[right,-1]]){
  const shape=new THREE.Shape(outline);
  const geo=new THREE.ExtrudeGeometry(shape,{depth:.014,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:1,steps:1});
  geo.translate(0,0,-.007);mesh(group,geo,'orange',0,0,side*.343);
  // wheel arch liner and dark seam under the raised cover edge
  const arch=new THREE.Shape();arch.absarc(0,.135,variant==='old'?.145:.168,0,Math.PI,false);arch.absarc(0,.135,variant==='old'?.128:.148,Math.PI,0,true);
  const archGeo=new THREE.ExtrudeGeometry(arch,{depth:.008,bevelEnabled:false,curveSegments:16});
  mesh(group,archGeo,'black',.01,0,side*.333);
  if(variant==='new')for(const [x0,x1] of [[-.655,-.20],[.22,.655]])box(group,[x1-x0,.012,.006],[(x0+x1)/2,.115,side*.351],'black');
  for(const [x0,x1] of [[-.655,-.20],[.22,.655]])box(group,[x1-x0,.012,.007],[(x0+x1)/2,.126,side*.352],'orange');
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
   // Rear third of the side (side/rear close-ups): upper red shell, a 27 mm
   // recessed cove and a separate lower red step. The cove is closed by an inner
   // shell plate, so no interior equipment can show through and nothing floats
   // across the recess. The step is a solid ledge, not a protruding steel shelf.
   box(group,[.355,.210,.014],[-.4775,.165,side*.316],'orangeShadow','rear-side-inner-shell');
   box(group,[.355,.130,.014],[-.4775,.125,side*.343],'orange','rear-side-step');
   box(group,[.355,.012,.034],[-.4775,.1905,side*.330],'orange','rear-side-step-ledge');
   box(group,[.355,.010,.034],[-.4775,.268,side*.330],'orangeShadow','rear-side-cove-ceiling');
   box(group,[.014,.076,.034],[-.303,.2295,side*.330],'orange','rear-side-cove-return');
   box(group,[.355,.012,.041],[-.4775,.064,side*.3305],'orangeDark','rear-side-step-floor');
   // The two site photos show different cooling details on the two sides; neither
   // side is a mirror of the other. side-b (left, +Z) has a rounded horizontal
   // grille, side-a (right, -Z) has vertical silver louvres.
   if(side===1){
    const grilleShape=roundedShape(.112,.086,.020),grilleInner=roundedShape(.090,.064,.014);grilleShape.holes.push(grilleInner);
    const grille=new THREE.Mesh(new THREE.ExtrudeGeometry(grilleShape,{depth:.004,bevelEnabled:false,curveSegments:8}),materials.black);
    grille.name='side-vent-grille-frame';grille.position.set(-.38,.315,side*.3545);grille.castShadow=grille.receiveShadow=true;group.add(grille);
    for(let i=0;i<6;i++)box(group,[.098,.006,.003],[-.38,.315+(i-2.5)*.011,side*.358],'dark','side-vent-grille');
   }else{
    box(group,[.120,.086,.002],[.34,.315,side*.3545],'dark','side-vent-louver-backing');
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
   const contour=[[-.655,.094],[-.30,.094],[-.085,.282],[.105,.282],[.22,.115],[.655,.115],[.655,.160],[.25,.160],[.13,.322],[-.11,.322],[-.30,.139],[-.655,.139]];
   stripe.moveTo(...contour[0]);for(const pt of contour.slice(1))stripe.lineTo(...pt);stripe.closePath();
   const stripeGeo=new THREE.ExtrudeGeometry(stripe,{depth:.002,bevelEnabled:false});
   mesh(group,stripeGeo,'black',0,0,decalZ-.001).name='side-lower-decal';
  }
 }

 // ---- operator panel on the 700 mm front face ----
 const panel=assembly('operator-panel','触摸屏与操作面板',[.48,.03,0],'operator-panel',variant==='old'?'按操作面板图与四张现场照片还原：中央一体式深色操作器内为绿色液晶屏，屏下沿同体排列10键数字键盘、左右两侧功能键；面对端左侧自上至下为圆形接口、钥匙开关、旋转开关、红色按钮，右侧自上至下为急停、绿/红/绿按钮；下部为宽凹口、银灰横条与黑色下层。车号12、企业名/二维码等设备管理贴纸不属于通用车型，未建模；按键间距、字体和型号丝印为示意。':'按操作面板图还原触摸屏、手操器/通讯插头、急停与复位按钮；按钮间距和型号丝印为示意。');
 roundedFace(panel,.69,.30,.022,.641,.016,'orange',.252,variant==='old'?[[0,.150,.44,.090]]:[]);
 if(variant==='new'){
  box(panel,[.018,.108,.255],[.657,.333,0],'dark');
 box(panel,[.005,.072,.20],[.668,.333,0],variant==='old'?'screenGreen':'screen');
 for(const y of [.388,.278])box(panel,[.004,.007,.262],[.676,y,0],'steel');
 for(const z of [-.131,.131])box(panel,[.004,.112,.007],[.676,.333,z],'steel');
 facePlate(panel,[[-.30,.118],[.30,.118],[.235,.262],[-.235,.262]],.655,'orangeDark');
 facePlate(panel,[[-.22,.126],[.19,.126],[.15,.19],[-.18,.19]],.659,'steel');
 box(panel,[.012,.014,.40],[.663,.256,0],'alloy');
 for(const [i,mat] of (variant==='old'?[[0,'black'],[1,'steel'],[2,'black'],[3,'red']]:[[0,'black'],[1,'steel'],[2,'steel'],[3,'dark']]))cylinder(panel,.0115,.014,[.661,.318-i*.042,-.268],mat,'x');
 for(const [i,mat] of (variant==='old'?[[0,'red'],[1,'green'],[2,'red'],[3,'green']]:[[0,'red'],[1,'rubber'],[2,'blue'],[3,'lamp']]))cylinder(panel,i===0?.0185:.0125,.016,[.662,.331-i*.045,.268],mat,'x');
 box(panel,[.006,.014,.10],[.663,.146,-.20],'steel');
 box(panel,[.02,.03,.72],[.66,.062,0],'rubber');
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
  // Real recessed lower opening cut through the end plate: dark lower cavity,
  // silver bar across the upper part of the recess, then the red lower band.
  box(panel,[.020,.095,.46],[.641,.150,0],'black','front-cavity');
  box(panel,[.010,.012,.42],[.6515,.180,0],'alloy','front-silver-bar');
  box(panel,[.018,.042,.70],[.658,.082,0],'orangeDark','front-lower-band');
  box(panel,[.008,.010,.70],[.663,.056,0],'steel','front-lower-trim');
  box(panel,[.020,.030,.72],[.660,.036,0],'rubber','front-rubber-bumper');
 }

 // ---- rear cover: two end beams with a central recessed navigation scanner ----
 const rear=assembly('rear-cover','后端护罩与安全触边',[-.48,.03,0],'body-without-covers',variant==='old'?'后端护罩按rear原图分为上下两道端梁：上层端梁保留圆形接口、带盖接口、绿色按钮与急停（车号/管理贴纸未建模）；两道端梁之间是横向中部的**空槽**，槽内只安装导航扫描头（黑上盖+红色透明扫描窗），周围为空、没有内部电器与黑色填充壳，槽内壁/台阶为深色实体；下部端梁带银灰横条，面对端右侧下部为TIM。不设无依据的顶部外露灯；器件安装位置为示意。':'后端护罩、连接器和安全触边位置按整车图；红色标牌与指示灯为示意。');
 if(variant==='old'){
  // The close-up photos show an EMPTY slot between the two end beams: only the
  // scanner (black cap + red transparent window) sits in it. Do not fill the
  // slot with a housing or a bright fake wall; internals stay behind it.
  roundedFace(rear,.69,.133,.022,-.657,.016,'orange',.3365);
  roundedFace(rear,.69,.088,.022,-.657,.016,'orange',.146);
  box(rear,[.012,.072,.68],[-.591,.230,0],'dark','rear-recess-back');
  box(rear,[.072,.008,.68],[-.621,.186,0],'orangeDark','rear-recess-floor');
  box(rear,[.072,.008,.68],[-.621,.274,0],'orangeDark','rear-recess-ceiling');
  for(const z of [-.339,.339])box(rear,[.072,.072,.012],[-.621,.230,z],'dark','rear-recess-side');
  // Upper-beam controls visible in rear.jpg (no "12"/management sticker).
  box(rear,[.004,.052,.052],[-.664,.365,-.270],'steel','rear-connector-plate');
  cylinder(rear,.014,.012,[-.668,.365,-.270],'black','x');
  box(rear,[.020,.048,.060],[-.664,.315,.140],'dark','rear-covered-port');
  box(rear,[.004,.030,.050],[-.669,.315,.140],'black','rear-covered-port-lid');
  cylinder(rear,.013,.014,[-.668,.330,.230],'green','x');
  cylinder(rear,.020,.010,[-.668,.325,.310],'dark','x');
  cylinder(rear,.013,.020,[-.674,.325,.310],'red','x');
  box(rear,[.010,.026,.020],[-.670,.286,.310],'black','rear-key');
  // Lower band: red lower band, silver bar, silver trim, real black rubber bumper.
  box(rear,[.018,.042,.70],[-.658,.082,0],'orangeDark','rear-lower-band');
  box(rear,[.010,.012,.42],[-.664,.160,0],'alloy','rear-silver-bar');
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
  box(drive,[.16,.13,.10],[-.06,.205,side*.215],'steel','drive-gearbox');
  cylinder(drive,.046,.17,[-.23,.212,side*.215],'dark','x').name='drive-motor';
  for(let i=0;i<8;i++)box(drive,[.15,.006,.006],[-.23,.212+Math.cos(i*Math.PI/4)*.048,side*.215+Math.sin(i*Math.PI/4)*.048],'steel');
  cylinder(drive,.03,.04,[-.33,.212,side*.215],'steel','x');
  cylinder(drive,.022,.05,[-.365,.212,side*.215],'black','x').name='drive-encoder';
  box(drive,[.95,.03,.045],[-.06,.145,side*.205],'steel','drive-rocker');
  box(drive,[.10,.04,.08],[-.29,.115,side*.215],'dark','drive-pivot-base');
  cylinder(drive,.018,.08,[-.29,.143,side*.215],'steel','z');
  box(drive,[.05,.09,.045],[.30,.16,side*.215],'steel','drive-adjustment-seat');
  cylinder(drive,.008,.11,[.30,.20,side*.215],'steel','y');
  // A schematic spring around the adjustment stem, not a suspension simulation.
  const springPoints=[];for(let i=0;i<=120;i++){const a=i/120*Math.PI*12;springPoints.push(new THREE.Vector3(.30+Math.cos(a)*.018,.155+i/120*.075,side*.215+Math.sin(a)*.018))}
  const spring=mesh(drive,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints),120,.0035,6,false),'steel');spring.name='drive-spring';
  for(const x of [-.51,.48]){
   cylinder(drive,.034,.03,[x,.036,side*.245],'rubber','z');
   box(drive,[.038,.024,.032],[x,.075,side*.245],'steel');
   box(drive,[.048,.012,.04],[x,.098,side*.245],'dark');
  }
  for(let i=0;i<3;i++)bundle(drive,[[.01,.135,z+side*.05],[.01,.30,side*.24],[-.10,.315,side*.30]],i===0?0xb74948:0x3d6d9d,.0023);
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
 // Schematic zones, not measured mounting coordinates: rear controller above
 // storage, side electrical bays clear of the central lift and drive motors.
 box(control,[.20,.012,.24],[variant==='old'?-.480:-.505,.25,0],'dark','controller-shelf');
 box(control,[.32,.012,.13],[.39,.28,.23],'dark','relay-shelf');
 for(const z of [-.245,.245])box(control,[.17,.012,.13],[variant==='old'?-.480:-.505,.215,z],'dark','rear-equipment-shelf');
 for(const z of [-.115,.115])box(control,[.025,.14,.018],[-.505,.17,z],'steel');
 for(const z of [-.308,.308])box(control,[.95,.022,.022],[.085,.33,z],'dark','cable-duct');
 for(const x of [-.57,-.44])for(const z of [-.065,.065])box(control,[.018,.010,.018],[x,.261,z],'black');
 box(control,[.30,.010,.014],[.39,.291,.23],'steel','relay-din-rail');
 if(variant==='old')box(control,[.14,.005,.12],[-.505,.2235,.245],'black');
 box(control,[.17,.072,.17],[variant==='old'?-.490:-.505,.302,0],'alloy','controller-housing');
 for(let i=0;i<12;i++)box(control,[.007,.030,.165],[-.579+i*.0135,.353,0],'alloy');
 for(let i=0;i<5;i++){box(control,[.037,.045,.055],[.25+i*.055,.314,.23],'dark','relay-housing');box(control,[.031,.014,.048],[.25+i*.055,.344,.23],'clear')}
 if(variant==='old'){
  box(control,[.14,.13,.12],[-.505,.286,-.245],'blue','inverter-housing');
  for(let i=0;i<5;i++)box(control,[.008,.018,.11],[-.56+i*.027,.360,-.245],'steel');
  box(control,[.14,.060,.12],[-.505,.256,.245],'alloy','smps-housing');
  for(let i=0;i<5;i++)cylinder(control,.005,.008,[-.56+i*.027,.291,.245],'steel','y');
 }else{
  // Separate new-car drive housings occupy the rear side shelves. Move the
  // illustrative auxiliary supply above the side motor, not through a driver.
  box(control,[.17,.008,.13],[-.30,.272,.23],'dark','smps-shelf');
  for(const x of [-.35,-.25]){
   box(control,[.01,.174,.01],[x,.181,.285],'steel','smps-support');
   box(control,[.02,.004,.02],[x,.278,.23],'black');
  }
  box(control,[.14,.060,.12],[-.30,.310,.23],'alloy','smps-housing');
  for(let i=0;i<5;i++)cylinder(control,.005,.008,[-.355+i*.027,.345,.23],'steel','y');
 }
 for(let i=0;i<5;i++)box(control,[.023,.024,.04],[.26+i*.052,.304,.283],'steel','terminal-block');
 for(const side of [-1,1])for(let i=0;i<4;i++)bundle(control,[[-.56,.355+i*.004,side*.285],[-.32,.35+i*.004,side*.312],[.18,.35+i*.004,side*.312],[.50,.35+i*.004,side*.285]],i===0?0xb74948:0x3d6d9d,.0022);
 bundle(control,[[-.51,.34,.08],[-.54,.36,.18],[-.52,.35,.29]],0x468a72,.004);

 // ---- power conversion, pickup, coupler, supercapacitor ----
 const tpm=assembly('tpm','TPM电源变换器',[0,0,0],'wireless-power','知识#19标注TPM12B030-ENE-5A2-2及两块THM取电板；此处仅示意散热壳体，安装坐标与端子接线未由资料确认。');
 tpm.userData.sourceKnowledgeId=19;tpm.userData.labelAnchor=[.44,.375,-.23];
 box(tpm,[.24,.012,.15],[.44,.27,-.23],'dark','tpm-tray');
 box(tpm,[.18,.009,.10],[.44,.2805,-.23],'black');
 box(tpm,[.20,.070,.13],[.44,.32,-.23],'alloy','tpm-housing');
 for(let i=0;i<7;i++)box(tpm,[.009,.014,.14],[.355+i*.028,.362,-.23],'steel');
 box(tpm,[.016,.045,.10],[.548,.32,-.23],'dark','tpm-connectors');
 const pickup=assembly('pickup','THM平板型取电板（两块）',[.03,.10,.60],'wireless-power','知识#19列出两块THM10E015取电板；示意安装于车底，从无线供电设施获取能量，不是电池。展开时移到侧前方展示底面，不代表实际拆装方向。');
 pickup.userData.sourceKnowledgeId=19;pickup.userData.labelAnchor=[.42,.048,0];
 for(const x of [-.42,.42]){box(pickup,[.24,.012,.24],[x,.028,0],'alloy','pickup-plate');box(pickup,[.215,.008,.215],[x,.019,0],'dark');cylinder(pickup,.009,.03,[x,.05,0],'dark');bundle(pickup,[[x,.062,0],[x,.07,.07],[x+.04,.07,.12]],0x252d35,.004)}
 const ekk=assembly('ekk','EKK能量耦合器',[0,0,0],'wireless-power','知识#19列出EKK-A E12能量耦合器；此处壳体、安装托盘和插口仅为结构示意，不能据此接线。');
 ekk.userData.sourceKnowledgeId=19;ekk.userData.labelAnchor=[.52,.265,.23];
 box(ekk,[.20,.012,.13],[.52,.104,.23],'dark','ekk-tray');
 box(ekk,[.16,.15,.10],[.52,.185,.23],'alloy','ekk-housing');
 box(ekk,[.012,.14,.105],[.606,.185,.23],'red');
 for(let i=0;i<3;i++)cylinder(ekk,.008,.014,[.475+i*.045,.265,.23],'dark','y');
 const capacitor=assembly('supercapacitor','EKV超级电容模块',[0,0,0],'wireless-power','知识#19标注EKV138A-36S350；说明书列出MOVI-DPS 136kWs Block 6×350F储能模块。六块分组、托架和顶部跨条为示意，并非实际内部电芯或接线复刻。');
 capacitor.userData.sourceKnowledgeId=19;capacitor.userData.labelAnchor=[-.505,.225,0];
 box(capacitor,[.19,.014,.17],[-.505,.104,0],'dark','capacitor-tray');
 for(let ix=0;ix<3;ix++)for(const z of [-.04,.04]){const x=-.56+ix*.055;box(capacitor,[.048,.10,.064],[x,.161,z],'black','capacitor-block');cylinder(capacitor,.006,.012,[x,.217,z],'steel')}
 for(const x of [-.599,-.411])box(capacitor,[.008,variant==='old'?.076:.105,.17],[x,variant==='old'?.1485:.1635,0],'dark');
 for(const z of [-.04,.04])box(capacitor,[.16,.005,.010],[-.505,.225,z],'gold');
 bundle(capacitor,variant==='old'?[[-.505,.223,.04],[-.53,.23,.09],[-.55,.24,.15]]:[[-.505,.223,.04],[-.57,.23,.09],[-.59,.24,.15]],0x282c31,.004);

 // ---- navigation radar (rear centre recess) and one TIM per end ----
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
  box(sensors,[.008,.034,.040],[.667,.100,-.300],'blue','tim-front-housing');
  box(sensors,[.010,.022,.034],[.671,.084,-.300],'black','tim-front-face');
  cylinder(sensors,.013,.050,[.664,.058,-.300],'black','y').name='tim-front-cylinder';
  box(sensors,[.008,.034,.040],[-.667,.160,.300],'blue','tim-rear-housing');
  box(sensors,[.010,.022,.034],[-.671,.144,.300],'black','tim-rear-face');
  cylinder(sensors,.013,.050,[-.664,.118,.300],'black','y').name='tim-rear-cylinder';
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
   const collar=cylinder(drive,.034,.014,[-.323,.212,z>0?.215:-.215],'dark','x');collar.name='drive-brake-collar';
   collar.userData={sourceKnowledgeId:26,deviceReference:brakeRef,geometryEvidence:'circuit-symbol-only',placement:'illustrative'};
  }
  // A7 stays within the existing control part: no new public part ID or
  // interaction contract is needed to represent the third servo circuit.
  box(control,[.13,.01,.08],[.52,.267,.12],'dark','kinco-lift-shelf');
  for(const x of [.48,.56]){
   box(control,[.012,.168,.012],[x,.178,.13],'steel','kinco-lift-support');
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
  capacitor.userData.description='新车电路#26的PDF第23页（图纸20/25）列出EKV储能模块，属于超级电容而非电池；六块分组外观沿用老车资料的辨识示意，不代表新车模块或电芯数量、型号及实际布线。';
 }
 root.updateMatrixWorld(true);
 return {root,parts,materials};
}

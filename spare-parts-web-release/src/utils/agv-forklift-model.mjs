import * as THREE from 'three'

// Static assembly illustrations: knowledge #13/#14, electrical #25/#24.
// x = vehicle length / forward, y = up, z = width; units are metres.
// Only the overall envelope is dimension-constrained. Profiles, chain pitch,
// wall thicknesses, fasteners and internal positions are illustrative, not CAD.
// No motion simulation, detailed wiring or off-vehicle charging equipment.
export function buildForkliftAgvModel(family){
 if(!['counterweight','flipping'].includes(family))throw Error('Unknown AGV family')
 const flip=family==='flipping',root=new THREE.Group(),parts=[]
 const manual=flip?13:14,electrical=flip?25:24
 const rear=-1.3,tip=flip?1.402:1.657,halfWidth=flip?.642:.521,mx=.2
 const reference=name=>`knowledge #${manual}: ${manual}-${name}.png`
 root.name=family+'-agv';root.userData={family,sourceKnowledgeId:manual,electricalKnowledgeId:electrical,bodyEnvelopeMm:flip?[2702,1284,2111]:[2957,1042,2114],overallEnvelopeMm:flip?[2702,1284,2111]:[2957,1042,2114],envelopeNote:'Modelled overall bounding box equals the documented drawing envelope within 1 mm on all three axes; local profiles, mounting points and clearances remain illustrative.',purpose:'structural-illustration',internalPlacement:'illustrative',coordinateSystem:'x-forward,y-up,z-width; metres',geometryAccuracy:'illustrative; overall envelope only, not measured mounting coordinates',pose:'static illustrative assembly; no kinematic or clearance validation',sourceReferences:[reference('image1'),reference('image2'),reference('image6'),reference('image7'),reference('image8'),reference('image9'),`knowledge #${electrical}: main circuit, pump control, battery power management`],dimensionNote:flip?'Original handoff mistakenly recorded H=2114 mm; corrected to H=2111 mm from #13 parameter text and dimension drawing. This is a source-record correction, not a user-requested dimension.':'Overall envelope from #14 dimension drawing; local profiles are illustrative.'}
 root.userData.dimensionScope='Vehicle only: rear safety bumper to fork tip, outer vehicle sides, ground to scanner cap. Off-vehicle charger shown beside the source drawings is excluded.'
 root.userData.envelopeMethod='Dimension-constrained local coordinates; no whole-vehicle or wheel scaling. Envelope agreement does not imply local CAD accuracy.'
 const materials=Object.fromEntries(Object.entries({red:0xa92734,dark:0x252e34,steel:0x9da8b0,rubber:0x181d22,green:0x397b48,gold:0xb4984a,blue:0x287ba9,screen:0x266185,orange:0xdb7c23}).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,metalness:k==='rubber'?.02:.42,roughness:k==='rubber'?.9:.43})]))
 function group(id,label,description,offset){
  const g=new THREE.Group();g.name=id
  const electric=['battery','control','charging','operator-panel','sensors','steering-drive','pump'].includes(id)
  g.userData={label,description,partId:id,sourceKnowledgeId:manual,presentationOffset:offset,placement:'illustrative',detailAccuracy:'illustrative geometry; not measured installation coordinates',sourceReferences:[reference('image1'),reference(id==='clamp'||id==='rotation'||id==='side-plates'?'image7':id==='operator-panel'?'image8':'image6'),...(electric?[`knowledge #${electrical}: circuit and functional references; not a spatial wiring map`]:[])]}
  root.add(g);parts.push(g);return g
 }
 function mesh(g,geometry,pos,mat,name){const m=new THREE.Mesh(geometry,materials[mat]);m.position.set(...pos);m.name=name||`${g.name}-${g.children.length+1}`;g.add(m);return m}
 function box(g,size,pos,mat='dark',name){return mesh(g,new THREE.BoxGeometry(...size),pos,mat,name)}
 function cyl(g,r,h,pos,mat='steel',axis='y',name){const m=mesh(g,new THREE.CylinderGeometry(r,r,h,24),pos,mat,name);if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;return m}
 function beam(g,a,b,r=.02,mat='steel',name){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),m=cyl(g,r,from.distanceTo(to),from.clone().add(to).multiplyScalar(.5).toArray(),mat,'y',name);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return m}
 // Extruded side profiles leave the service bay hollow, rather than filling it.
 function profile(g,points,z,depth,mat,name){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return mesh(g,new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,steps:1}),[0,0,z],mat,name)}
 function tube(g,points,r=.009,mat='rubber',name){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(g,new THREE.TubeGeometry(curve,24,r,8,false),[0,0,0],mat,name)}
 function ring(g,r,t,pos,mat='steel',axis='x',name){const m=mesh(g,new THREE.TorusGeometry(r,t,8,32),pos,mat,name);if(axis==='x')m.rotation.y=Math.PI/2;if(axis==='y')m.rotation.x=Math.PI/2;return m}
 function hydraulic(g,a,b,bodyRadius=.035,bodyRatio=.65,name='hydraulic-cylinder'){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),join=start.clone().lerp(end,bodyRatio)
  beam(g,a,join.toArray(),bodyRadius,'steel',`${name}-barrel`);beam(g,join.toArray(),b,bodyRadius*.45,'steel',`${name}-rod`)
  for(const [i,p] of [a,b].entries())cyl(g,bodyRadius*1.2,.045,p,'dark','z',`${name}-eye-${i}`)
 }
 function wheel(g,x,y,z,r,width,name){cyl(g,r,width,[x,y,z],'rubber','z',`${name}-tread`);for(const side of [-1,1])cyl(g,r*.57,.008,[x,y,z+side*(width/2+.004)],'gold','z',`${name}-hub-${side}`)}
 const chassis=group('chassis','底盘与车架','承载车体、门架和行走机构，把货物载荷传递到各车轮。',[0,0,0])
 chassis.userData.fixed=true
 box(chassis,[1.08,.055,.72],[-.285,.155,0],'dark','frame-floor-tray')
 for(const z of [-.5,.5]){
  box(chassis,[1.09,.085,.042],[-.485,.135,z],'dark',`frame-side-sill-${z}`)
  box(chassis,[1.27,.075,.045],[-.42,.255,z*.9],'red')
 }
 // Floor and low crossmembers stop before the rear drive / front roller bays.
 for(const x of [-.80,-.52,0])box(chassis,[.065,.09,.72],[x,.21,0],'dark','frame-crossmember')
 tube(chassis,[[-1.03,.095,-.5],[-1.23,.095,-.36],[rear+.02,.095,0],[-1.23,.095,.36],[-1.03,.095,.5]],.02,'rubber','rounded-rear-safety-bumper')
 const hood=group('hood','后部机罩与配重','保护车内电气及液压部件；后部配重用于平衡前方货物。',[-.85,.3,0])
 // Rear casting / skirts and removable skins, not an opaque full body block.
 profile(hood,[[-1.26,.16],[-1.24,.35],[-1.20,.35],[-1.22,.16]],-.43,.86,'red','rear-low-counterweight-casting')
 for(const z of [-.43,.39])profile(hood,[[-1.22,.16],[-1.20,.35],[-1.02,.35],[-1.01,.16]],z,.04,'red','counterweight-side-return')
 for(const side of [-1,1]){
  const z=side>0?.471:-.489
  profile(hood,[[-1.23,.23],[-1.14,.83],[-.99,1.0],[-.40,1.0],[-.35,.23]],z,.018,'red',`rear-curved-side-skin-${side}`)
  profile(hood,[[-.37,.23],[-.37,1.0],[.15,.97],[.15,.23]],z,.018,'red',`front-side-skin-${side}`)
  box(hood,[.325,.62,.012],[-.66,.59,side*.496],'dark',`battery-door-gasket-${side}`)
  box(hood,[.29,.585,.009],[-.66,.59,side*.505],'steel',`battery-service-door-${side}`)
  for(const y of [.34,.83])box(hood,[.025,.045,.018],[-.815,y,side*.505],'steel')
  box(hood,[.018,.09,.018],[-.55,.66,side*.511],'dark','service-door-latch')
  for(const x of [-.95,-.36,.11])for(const y of [.29,.92])cyl(hood,.009,.009,[x,y,side*.51],'steel','z')
 }
 box(hood,[.56,.018,.90],[-.67,1.0,0],'red','service-bay-top-cross-skin')
 box(hood,[.50,.018,.81],[-.08,.96,0],'dark','front-bay-lid')
 const rearCover=box(hood,[.022,.61,.80],[-1.155,.64,0],'dark','inclined-rear-service-panel');rearCover.rotation.z=-.17
 for(const z of [-.29,.29])for(let i=0;i<7;i++)box(hood,[.024,.014,.15],[-1.178,.49+i*.035,z],'rubber','rear-panel-vent')
 const mast=group('mast','升降门架与导轨','门架导轨约束货叉升降方向，滚轮让货叉架沿门架运动。',[0,.55,-.75])
 const mastMat=flip?'green':'dark'
 for(const side of [-1,1]){
  const z=side*.355
  box(mast,[.13,1.76,.018],[mx,1.08,z+side*.047],mastMat,`outer-guide-web-${side}`)
  for(const x of [mx-.056,mx+.056])box(mast,[.018,1.76,.108],[x,1.08,z],mastMat,`outer-guide-flange-${side}-${x}`)
  box(mast,[.082,1.53,.014],[mx+.025,1.145,z-side*.031],'steel',`inner-guide-web-${side}`)
  for(const x of [mx-.008,mx+.058])box(mast,[.014,1.53,.07],[x,1.145,z-side*.06],mastMat,'inner-guide-flange')
  box(mast,[.015,1.49,.022],[mx+.071,1.145,z-side*.065],'steel','guide-running-surface')
  box(mast,[.20,.075,.14],[mx,.235,z],mastMat,'mast-foot-bracket')
 }
 for(const y of [.27,1.93])box(mast,[.14,.065,.82],[mx,y,0],mastMat,'mast-cross-tie')
 box(mast,[.11,.055,.67],[mx+.025,1.87,0],'steel','inner-mast-top-tie')
 const lift=group('hydraulic-lift','起升油缸、链条与滑架','起升泵向油缸供油，链条带动滑架和货叉升降；高度检测信号反馈给控制器。',[.1,.5,.65])
 hydraulic(lift,[mx-.075,.32,0],[mx-.075,1.66,0],.051,.64,'central-lift-cylinder')
 box(lift,[.18,.065,.55],[mx-.015,1.68,0],mastMat,'chain-pulley-crosshead')
 const carriageBottom=flip?.49:.12,carriageTop=flip?1.48:.68
 for(const side of [-1,1]){
  const z=side*.235,px=mx+.025,py=1.72,r=.063
  cyl(lift,r,.034,[px,py,z],'steel','z',`lift-chain-pulley-${side}`)
  ring(lift,r*.81,.007,[px,py,z],'dark','z','pulley-groove')
  cyl(lift,.021,.05,[px,py,z],'gold','z','pulley-axle')
  // Leaf-chain links and two runs over the head pulley, not a gold solid rod.
  for(const [run,x] of [[0,px-r],[1,px+r]]){
   const bottom=run===0?.35:carriageTop-.03,count=Math.ceil((py-bottom)/.035),pitch=(py-bottom)/count
   for(let i=0;i<count;i++){
    const y=bottom+(i+.5)*pitch
    box(lift,[.014,pitch*.78,.026],[x,y,z],'dark',`leaf-chain-${side}-${run}-${i}`)
    cyl(lift,.005,.032,[x,y+pitch*.30,z],'steel','z','chain-pin')
   }
   box(lift,[.042,.05,.055],[x,bottom,z],'steel','chain-anchor')
  }
  const wrap=mesh(lift,new THREE.TorusGeometry(r,.012,6,16,Math.PI),[px,py,z],'dark','leaf-chain-top-wrap')
  wrap.userData.detail='illustrative leaf-chain wrap; not measured pitch'
  box(lift,[.08,carriageTop-carriageBottom,.06],[mx+.18,(carriageTop+carriageBottom)/2,side*.33],mastMat,`carriage-side-stile-${side}`)
  for(const y of [carriageBottom+.10,carriageTop-.09]){
   cyl(lift,.052,.055,[mx+.065,y,side*.305],'steel','z',`carriage-guide-roller-${side}-${y}`)
   cyl(lift,.018,.067,[mx+.065,y,side*.305],'gold','z','carriage-roller-axle')
  }
 }
 for(const y of [carriageBottom+.04,carriageTop-.04])box(lift,[.09,.075,.86],[mx+.18,y,0],mastMat,'open-carriage-crossbar')
 tube(lift,[[mx-.11,.34,.12],[mx-.14,.58,.12],[mx-.14,.88,.12],[mx-.09,.98,.12]],.009,'rubber','lift-cylinder-local-hose')
 box(lift,[.05,.045,.07],[mx+.23,carriageTop-.08,0],'steel','fork-height-detection-bracket')
 const forks=group('forks',flip?'下层承载货叉':'承载货叉','货叉从货物下方承托载荷，随滑架升降；左右叉间距需适应货物。',[.7,.1,0])
 const forkRoot=flip?.50:.40,forkY=flip?.49:.035
 for(const side of [-1,1]){
  const z=side*(flip?.405:.43),width=flip?.115:.095
  profile(forks,[[forkRoot,forkY],[tip,forkY],[tip,forkY+.017],[tip-.15,forkY+.04],[forkRoot+.035,forkY+.055],[forkRoot,forkY+.085]],z-width/2,width,mastMat,`tapered-lower-fork-${side}`)
  box(forks,[.055,flip?.94:.56,width],[forkRoot+.022,forkY+(flip?.94:.56)/2+.045,z],mastMat,`lower-fork-heel-${side}`)
  box(forks,[.09,.045,width+.025],[forkRoot+.005,carriageTop-.045,z],'steel','fork-carriage-hook')
 }
 if(flip){
  const outriggers=group('outriggers','支腿与前承重轮','车身前部支腿和轮组支撑载荷，与后部驱动轮共同承重。',[.15,.07,.8])
  for(const side of [-1,1]){
   const z=side*.55
   box(outriggers,[1.10,.105,.12],[.325,.17,z],'red',`front-support-leg-${side}`)
   profile(outriggers,[[-.11,.22],[-.11,.49],[.04,.49],[.31,.22]],z-.055,.11,'gold','outrigger-triangular-gusset')
   for(const dz of [-.052,.052])box(outriggers,[.23,.045,.021],[.98,.175,z+dz],'red','load-roller-clevis')
   wheel(outriggers,.995,.09,z,.09,.074,`outrigger-load-roller-${side}`)
   cyl(outriggers,.018,.125,[.995,.09,z],'steel','z','outrigger-roller-axle')
  }
  const rotation=group('rotation','翻转机构与回转支承','驱动货叉夹持架翻转；回转限位检测用于确认翻转位置。',[.6,.75,-.6])
  rotation.userData.mechanismNote='Illustrative x-axis bearing and hydraulic crank support, static pose; no inferred transmission ratio or swept-volume claim.'
  for(const x of [.36,.455])ring(rotation,.19,.028,[x,.995,0],'gold','x',`rotation-bearing-flange-${x}`)
  cyl(rotation,.072,.18,[.415,.995,0],'steel','x','longitudinal-flip-shaft')
  for(const z of [-.25,.25]){
   box(rotation,[.10,.39,.07],[.38,1.0,z],'steel','bearing-support-stile')
   for(const y of [.83,1.17])beam(rotation,[.38,y,z],[.455,.995,0],.022,'steel','bearing-support-spoke')
  }
  for(const y of [.54,1.43])box(rotation,[.065,.075,1.04],[.475,y,0],'green','rotating-frame-crossmember')
  for(const z of [-.49,.49])box(rotation,[.065,.94,.06],[.475,.985,z],'green','rotating-frame-upright')
  hydraulic(rotation,[.37,1.47,-.32],[.37,1.47,.20],.04,.62,'flip-actuator')
  profile(rotation,[[.31,1.40],[.31,1.22],[.43,1.12],[.43,1.43]],-.34,.035,'gold','flip-actuator-support-cheek')
  box(rotation,[.04,.06,.055],[.34,.805,-.23],'blue','rotation-limit-switch')
  const clamp=group('clamp','上层夹持叉与夹紧油缸','上层夹持叉压紧货物，与下层货叉配合，防止翻转时货物滑移。',[.65,1,.45])
  for(const side of [-1,1]){
   const z=side*.405
   profile(clamp,[[.51,1.505],[tip-.14,1.505],[tip,1.53],[tip,1.55],[.51,1.55]],z-.0575,.115,'green',`upper-clamping-fork-${side}`)
   box(clamp,[.062,.18,.12],[.51,1.44,z],'green','upper-fork-guide-shoe')
   box(clamp,[.025,.67,.035],[.515,1.13,side*.29],'steel','clamp-vertical-guide')
  }
  box(clamp,[.09,.075,.94],[.51,1.51,0],'green','upper-clamp-crossbar')
  hydraulic(clamp,[.495,.72,0],[.495,1.485,0],.036,.67,'vertical-clamping-cylinder')
  for(const y of [.78,1.45])box(clamp,[.045,.035,.055],[.55,y,-.29],'blue','clamp-limit-switch')
  tube(clamp,[[.45,.76,.10],[.42,.92,.15],[.42,1.2,.15],[.45,1.27,.06]],.008,'rubber','clamp-local-hydraulic-loop')
  const plates=group('side-plates','货物侧向挡板','从侧面约束货物，与上下夹持叉共同形成承载和夹持区域。',[.6,.35,-1])
  for(const side of [-1,1]){
   const z=side>0?halfWidth-.018:-halfWidth
   for(const y of [.54,1.47])box(plates,[.08,.04,.15],[.51,y,side*.565],'steel','side-plate-mounting-shoe')
   profile(plates,[[.49,.50],[1.34,.50],[1.37,.56],[1.37,1.49],[1.30,1.55],[.49,1.55]],z,.018,'steel',`thin-cargo-side-plate-${side}`)
   for(const x of [.58,1.0,1.29])box(plates,[.018,.97,.021],[x,1.02,side*(halfWidth-.034)],'dark','side-plate-stiffener')
   for(const x of [.55,1.27])for(const y of [.55,1.50])cyl(plates,.008,.008,[x,y,side*(halfWidth-.004)],'dark','z','side-plate-fastener')
  }
 }
 const steering=group('steering-drive','驱动转向轮组','驱动电机提供行走动力，转向机构改变后轮方向；编码器反馈速度和转角。',[-.8,.06,.78])
 wheel(steering,-1.02,.18,-.14,.18,.17,'rear-drive-wheel')
 box(steering,[.22,.16,.24],[-1.04,.44,-.14],'dark','traction-gearbox')
 cyl(steering,.085,.22,[-1.04,.62,-.14],'steel','y','traction-motor')
 ring(steering,.105,.013,[-1.04,.50,-.14],'gold','y','steering-ring')
 cyl(steering,.055,.16,[-.93,.65,.16],'blue','y','steering-motor')
 cyl(steering,.037,.025,[-.93,.75,.16],'dark','y','steering-encoder')
 wheel(steering,-1.04,.075,.33,.075,.065,'rear-sprung-caster')
 box(steering,[.11,.08,.10],[-1.04,.19,.33],'steel','caster-fork')
 cyl(steering,.024,.13,[-1.04,.295,.33],'steel','y','caster-spring-post')
 if(!flip){
  const wheels=group('load-wheels','前承重轮','支撑门架与前方载荷，与后驱动轮形成车辆的承重支点。',[.35,0,-.8])
  for(const side of [-1,1]){
   wheel(wheels,.20,.105,side*.443,.105,.12,`front-load-wheel-${side}`)
   profile(wheels,[[.045,.105],[.07,.22],[.26,.22],[.32,.105]],side*.443-.035,.07,'red','front-load-wheel-fender')
   cyl(wheels,.018,.15,[.20,.105,side*.443],'steel','z','front-load-wheel-axle')
  }
 }
 const battery=group('battery','锂电池与电池管理','储存车载电能，电池管理系统监测电压、温度和电池状态。',[-.45,.5,-.8])
 box(battery,[.43,.035,.69],[-.63,.26,0],'steel','battery-slide-tray')
 box(battery,[.42,.40,.63],[-.64,.4775,0],'dark','onboard-lithium-battery-case')
 box(battery,[.43,.022,.645],[-.64,.6885,0],'steel','battery-lid')
 for(const z of [-.25,.25]){
  box(battery,[.35,.02,.025],[-.64,.716,z],'dark','battery-retaining-strap')
  cyl(battery,.021,.025,[-.64,.716,z],z>0?'red':'blue','y','battery-protected-terminal')
 }
 box(battery,[.055,.09,.15],[-.405,.55,0],'blue','battery-management-interface')
 const pump=group('pump',flip?'起升油泵与翻转/夹紧阀组':'液压泵站与油箱',flip?'起升油泵与翻转/夹紧阀控回路；独立电路不等于已确认第二独立油泵':'液压泵将电能转换成液压动力，油箱与阀组为起升油缸供油。',[-.1,.45,1])
 pump.userData.circuitNote=flip?'#25 lift-pump page identifies a pump motor; the flip-pump page shows valve outputs and a clamp/flip sequence. Circuit-page titles do not establish a second physical pump. Actual pump count and installation layout require vehicle confirmation.':'#24 identifies the lift-pump motor and valves. Pump placement and short local hoses are illustrative.'
 if(flip)pump.userData.legacyLabelNote='Original two-pump label corrected to a lift pump and flip/clamp valve group; stable pump part ID and presentation offset retained. One illustrative pump motor plus a valve distributor, not a claim of two independent pumps.'
 box(pump,[.31,.29,.42],[-.20,.435,0],'steel','hydraulic-oil-reservoir')
 cyl(pump,.025,.025,[-.22,.592,-.10],'dark','y','oil-reservoir-filler-cap')
 box(pump,[.022,.14,.028],[-.365,.44,.05],'gold','reservoir-level-indicator')
 cyl(pump,.067,.25,[-.20,.70,.24],'dark','y','lift-pump-motor')
 cyl(pump,.049,.055,[-.20,.55,.24],'steel','y','hydraulic-pump-head')
 for(const y of [.64,.70,.76])ring(pump,.069,.004,[-.20,y,.24],'steel','y','pump-motor-cooling-band')
 if(flip){
  box(pump,[.22,.07,.15],[-.20,.64,-.24],'steel','flip-clamp-valve-distributor')
  for(const x of [-.27,-.20,-.13]){
   cyl(pump,.022,.06,[x,.705,-.24],'dark','y','illustrative-flip-clamp-solenoid')
   cyl(pump,.009,.025,[x,.64,-.325],'gold','z','valve-distributor-fitting')
  }
 }
 box(pump,[.12,.10,.30],[.015,.62,0],'steel','hydraulic-valve-manifold')
 for(const z of [-.10,.10]){
  cyl(pump,.021,.075,[.015,.69,z],'dark','y','valve-solenoid')
  tube(pump,[[.02,.65,z],[.065,.77,z],[.075,.88,z],[.12,.94,z]],.009,'rubber','local-mast-hydraulic-feed')
 }
 const control=group('control','控制器、驱动器与电气板','控制器处理导航、操作和检测信号，通过驱动器控制行走、转向及液压泵。',[-.65,.65,.55])
 box(control,[.018,.36,.68],[-.61,1.285,0],'steel','electrical-mounting-plate')
 for(const [i,z] of [-.22,0,.22].entries()){
  box(control,[.085,.22,.16],[-.67,1.30,z],i===1?'green':'blue',i===1?'vehicle-control-module':'motor-drive-module')
  for(let j=0;j<5;j++)box(control,[.012,.20,.009],[-.721,1.30,z-.055+j*.0275],'steel','drive-heat-sink-fin')
 }
 box(control,[.045,.05,.58],[-.65,1.08,0],'dark','illustrative-terminal-strip')
 for(let i=0;i<12;i++)box(control,[.008,.035,.025],[-.676,1.08,-.264+i*.048],'gold','terminal-block')
 const operator=group('operator-panel','操作面板与手操器接口','用于查看车辆信息、切换允许的操作模式，连接手操器；急停按钮供紧急停止使用。',[-.75,.8,0])
 // A hollow tall console with a rear-facing fascia, as in both assembly views.
 box(operator,[.36,.018,.86],[-.71,1.565,0],'red','console-roof')
 box(operator,[.36,.018,.86],[-.71,1.035,0],'red','console-base')
 for(const z of [-.421,.421])box(operator,[.36,.52,.018],[-.71,1.30,z],'red','console-side-skin')
 box(operator,[.018,.52,.84],[-.539,1.30,0],'red','console-front-skin')
 box(operator,[.018,.49,.82],[-.897,1.30,0],'dark','rear-facing-operator-fascia')
 box(operator,[.014,.105,.255],[-.914,1.43,0],'steel','touchscreen-bezel')
 box(operator,[.009,.077,.22],[-.925,1.43,0],'screen','operator-touchscreen')
 box(operator,[.014,.18,.28],[-.918,1.205,0],'steel','operator-button-subpanel')
 box(operator,[.009,.055,.09],[-.93,1.245,0],'screen','battery-status-display')
 for(const [i,c] of ['green','red','gold','blue'].entries())cyl(operator,.016,.014,[-.94,1.16,-.095+i*.063],c,'x','operator-status-button')
 for(const z of [-.31,.31])box(operator,[.014,.27,.04],[-.915,1.30,z],'red','console-light-strip')
 for(const z of [-.455,.455])cyl(operator,.027,.042,[-.72,1.49,z],'red','z','emergency-stop-button')
 cyl(operator,.019,.018,[-.943,1.25,.105],'dark','x','manual-controller-socket')
 const safety=group('sensors','导航雷达与安全扫描器','上方导航雷达参与定位，低位安全扫描器检测人员和障碍物；安全回路据此限制或停止运动。',[.2,.65,-1])
 box(safety,[.15,.065,.56],[mx,1.93,0],'steel','sensor-top-cross-bracket')
 box(safety,[.48,.025,.075],[-.035,1.87,0],'steel','navigation-scanner-outrigger-bracket')
 const scannerDrop=flip?.003:0
 cyl(safety,.045,.11-scannerDrop,[-.23,1.94-scannerDrop/2,0],'steel','y','navigation-scanner-pedestal')
 cyl(safety,.067,.025,[-.23,2.007-scannerDrop,0],'blue','y','navigation-scanner-base')
 cyl(safety,.060,.070,[-.23,2.0545-scannerDrop,0],'red','y','navigation-laser-optical-head')
 cyl(safety,.069,.024,[-.23,2.102-scannerDrop,0],'dark','y','navigation-scanner-cap')
 cyl(safety,.047,.055,[-.23,1.82,0],'steel','y','secondary-range-sensor')
 for(const [x,z] of [[-1.20,.30],[.11,-.43]]){
  box(safety,[.10,.075,.11],[x,.38,z],'blue','low-safety-scanner-base')
  cyl(safety,.047,.075,[x,.455,z],'dark','y','low-safety-scanner-optical-head')
 }
 box(safety,[.035,.065,.06],[flip?.57:.47,flip?.65:.28,0],'blue','cargo-arrival-detection-switch')
 const charging=group('charging','充电接口与连接器','充电接口连接车辆充电回路；连接器将车载电池、电气板及外部充电设施连接。',[-1,.25,-.5])
 charging.userData.scope='On-vehicle contact brush / manual connector only; no external station or latent-AGV inductive power components.'
 box(charging,[.14,.16,.025],[-.79,.43,-.489],'dark','onboard-contact-insulator')
 for(const x of [-.83,-.75])box(charging,[.035,.10,.012],[x,.43,-.507],'gold','onboard-charge-contact')
 box(charging,[.06,.055,.035],[-.78,.57,-.49],'blue','manual-charge-connector')
 return {root,parts,materials}
}

// Photo-referenced category illustrations, not dimensioned manufacturing CAD.
// Run from the repository with: node tools/generate-reference-models.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as T from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'

globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.() }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.() }
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'spare-parts-web-release/public/models/reference-20260904')
const source = process.env.REFERENCE_PHOTO_DIR || 'C:/Users/Lenovo/AppData/Local/Temp'
const steel = new T.MeshStandardMaterial({ color: 0xb5c0cb, metalness: .72, roughness: .28 })
const darkSteel = new T.MeshStandardMaterial({ color: 0x485361, metalness: .62, roughness: .4 })
const blue = new T.MeshStandardMaterial({ color: 0x087bb9, metalness: .16, roughness: .34 })
const black = new T.MeshStandardMaterial({ color: 0x20272e, roughness: .64 })
const white = new T.MeshStandardMaterial({ color: 0xe9e9e4, roughness: .53 })
const brass = new T.MeshStandardMaterial({ color: 0xb7a675, metalness: .55, roughness: .6 })
const grey = new T.MeshStandardMaterial({ color: 0x536e86, metalness: .35, roughness: .5 })
const axis = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] }
function add(g, name, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new T.Mesh(geo, mat); m.name = name; m.position.set(...pos); m.rotation.set(...rot); g.add(m); return m
}
const box = (g, n, size, mat, pos, rot) => add(g, n, new T.BoxGeometry(...size), mat, pos, rot)
const cyl = (g, n, r, h, mat, pos, direction = 'y', segments = 40, r2 = r) => add(g, n, new T.CylinderGeometry(r, r2, h, segments), mat, pos, axis[direction])
const torus = (g, n, r, tube, mat, pos, direction = 'z') => add(g, n, new T.TorusGeometry(r, tube, 8, 48), mat, pos, direction === 'y' ? [Math.PI / 2, 0, 0] : direction === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0])
function ring(g, n, inner, outer, depth, mat, pos = [0, 0, 0], direction = 'z') {
  // Closed bevelled lathe profile preserves a real through-bore.
  const b = Math.min(.025, (outer - inner) / 4, depth / 5), h = depth / 2
  const pts = [[inner+b,-h],[outer-b,-h],[outer,-h+b],[outer,h-b],[outer-b,h],[inner+b,h],[inner,h-b],[inner,-h+b],[inner+b,-h]]
  return add(g,n,new T.LatheGeometry(pts.map(p => new T.Vector2(...p)),64),mat,pos,axis[direction])
}
function screw(g, n, pos, r = .05, direction = 'z', mat = steel) {
  cyl(g,n,r,.022,mat,pos,direction,20)
  const head = new T.Group(); head.position.set(...pos)
  if(direction==='y') head.rotation.x=-Math.PI/2
  if(direction==='x') head.rotation.y=Math.PI/2
  box(head,`${n}-slot-a`,[r*1.35,r*.17,.006],darkSteel,[0,0,.014])
  box(head,`${n}-slot-b`,[r*.17,r*1.35,.006],darkSteel,[0,0,.014]); g.add(head)
}
function proximity() {
  const g = new T.Group()
  cyl(g,'threaded-metal-body',.18,1.08,steel,[0,0,0],'x')
  const thread = new T.TorusGeometry(.183,.009,6,40)
  for(let i=0;i<40;i++) add(g,`thread-${i}`,thread,steel,[-.52+i*.027,0,0],[0,Math.PI/2,0])
  for(const x of [-.18,.16]) {
    ring(g,'locking-washer',.182,.262,.024,steel,[x-.065,0,0],'x')
    cyl(g,'hex-locknut',.292,.10,steel,[x,0,0],'x',6)
  }
  cyl(g,'blue-sensing-face',.178,.026,blue,[.551,0,0],'x')
  cyl(g,'cable-strain-relief',.095,.15,black,[-.605,0,0],'x')
  const curve = new T.CatmullRomCurve3([new T.Vector3(-.65,0,0),new T.Vector3(-.9,.02,0),new T.Vector3(-1.14,.11,.035)])
  add(g,'black-cable',new T.TubeGeometry(curve,16,.047,10,false),black)
  return g
}
function breaker() {
  const g = new T.Group()
  for(let i=0;i<3;i++) {
    const x=(i-1)*.365
    box(g,`pole-${i}-housing`,[.354,1.52,.56],white,[x,0,0])
    box(g,`pole-${i}-front`,[.346,.81,.13],white,[x,.045,.342])
    box(g,`pole-${i}-blue-stripe`,[.31,.058,.008],blue,[x,.393,.412])
    box(g,`pole-${i}-indicator`,[.045,.035,.009],black,[x,.095,.413])
    for(const y of [-.603,.603]) {
      ring(g,'recessed-terminal-rim',.082,.119,.095,white,[x,y,.315])
      cyl(g,'terminal-recess',.082,.012,darkSteel,[x,y,.285],'z')
      screw(g,'terminal-screw',[x,y,.315],.068)
    }
    cyl(g,'toggle-pivot',.098,.285,white,[x,-.355,.32],'x')
    box(g,'blue-toggle',[.272,.21,.15],blue,[x,-.345,.439],[-.25,0,0])
    for(let v=0;v<3;v++) box(g,'side-vent',[.008,.045,.15],darkSteel,[x-.18,.55-v*.083,-.055])
  }
  box(g,'three-pole-toggle-link',[1.058,.11,.13],blue,[0,-.459,.51])
  box(g,'din-rail-latch',[.76,.055,.20],blue,[0,-.765,-.18])
  return g
}
function bearing(roller=false) {
  const g=new T.Group(), depth=roller?.58:.30
  ring(g,'inner-race-through-bore',.36,.49,depth,steel)
  if(roller) {
    for(const z of [-.154,.154]) ring(g,'outer-race-half',.72,.87,.275,steel,[0,0,z])
    ring(g,'central-outer-groove',.73,.85,.035,darkSteel)
    for(const z of [-.157,.157]) {
      torus(g,'roller-cage',.605,.022,darkSteel,[0,0,z+(z>0?.105:-.105)])
      for(let i=0;i<18;i++) {
        const a=i*Math.PI/9
        const points=[[-.12,0],[-.12,.063],[-.095,.077],[0,.085],[.095,.077],[.12,.063],[.12,0]]
        const geo=new T.LatheGeometry(points.map(([y,r])=>new T.Vector2(r,y)),14)
        const m=add(g,`barrel-roller-${z>0?'front':'back'}-${i}`,geo,steel,[Math.cos(a)*.61,Math.sin(a)*.61,z])
        const dir=new T.Vector3(Math.cos(a)*(z>0?-.13:.13),Math.sin(a)*(z>0?-.13:.13),1).normalize()
        m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir)
      }
    }
  } else {
    ring(g,'outer-race',.72,.86,depth,steel)
    for(const z of [-.08,.08]) torus(g,'ball-cage',.605,.025,darkSteel,[0,0,z])
    const ballGeo=new T.SphereGeometry(.111,20,14)
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6
      add(g,`rolling-ball-${i}`,ballGeo,steel,[Math.cos(a)*.605,Math.sin(a)*.605,0])
      const b=a+Math.PI/12
      screw(g,'cage-rivet',[Math.cos(b)*.605,Math.sin(b)*.605,.10],.025)
    }
  }
  return g
}
function pneumatic() {
  const g=new T.Group()
  box(g,'aluminium-valve-body',[.78,.46,.37],steel,[.18,0,0])
  box(g,'black-solenoid-coil',[.39,.43,.42],black,[-.445,0,0])
  box(g,'electrical-connector',[.29,.27,.35],black,[-.475,-.31,.03])
  cyl(g,'cable-gland',.083,.20,black,[-.25,-.34,.03],'x')
  cyl(g,'coil-retaining-nut',.09,.065,black,[-.67,0,0],'x',12)
  box(g,'end-cap',[.07,.43,.37],black,[.605,0,0])
  for(const x of [-.055,.39]) {
    cyl(g,'brass-muffler',.064,.21,brass,[x,.43,0],'y',20)
    cyl(g,'muffler-hex',.075,.07,brass,[x,.30,0],'y',6)
    cyl(g,'muffler-adjuster',.036,.065,brass,[x,.565,0],'y',6)
    cyl(g,'lower-fitting-hex',.083,.11,steel,[x,-.285,0],'y',6)
    ring(g,'lower-push-fitting',.042,.069,.07,steel,[x,-.39,0],'y')
  }
  cyl(g,'upper-fitting-hex',.089,.14,steel,[.17,.33,0],'y',6)
  ring(g,'blue-push-collar',.044,.073,.028,blue,[.17,.425,0],'y')
  for(const x of [-.095,.455]) screw(g,'body-fastener',[x,.14,.197],.024)
  return g
}
function flange(g,n,x) {
  const shape=new T.Shape(); shape.absarc(0,0,.40,0,Math.PI*2,false)
  const bore=new T.Path(); bore.absarc(0,0,.19,0,Math.PI*2,true); shape.holes.push(bore)
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const hole=new T.Path();hole.absarc(Math.cos(a)*.31,Math.sin(a)*.31,.029,0,Math.PI*2,true);shape.holes.push(hole)}
  const geo=new T.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:true,bevelSize:.008,bevelThickness:.006,bevelSegments:1,steps:1,curveSegments:32})
  add(g,n,geo,blue,[x,0,0],[0,Math.PI/2,0])
}
function gateValve() {
  const g=new T.Group()
  ring(g,'open-pipe-bore',.185,.24,.88,blue,[0,0,0],'x')
  flange(g,'left-bolt-flange',-.51); flange(g,'right-bolt-flange',.44)
  cyl(g,'gate-body',.295,.47,blue,[0,.13,0],'y',48,.245)
  cyl(g,'bonnet-joint',.34,.085,blue,[0,.40,0],'y')
  cyl(g,'tapered-bonnet',.13,.47,blue,[0,.665,0],'y',40,.27)
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,'bonnet-bolt',.031,.045,steel,[Math.cos(a)*.29,.46,Math.sin(a)*.29],'y',6)}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;box(g,'bonnet-rib',[.035,.40,.08],blue,[Math.cos(a)*.155,.66,Math.sin(a)*.155],[0,-a,0])}
  cyl(g,'valve-stem',.037,.27,steel,[0,.98,0])
  cyl(g,'handwheel-hub',.105,.075,blue,[0,1.10,0])
  torus(g,'three-spoke-handwheel',.405,.039,blue,[0,1.10,0],'y')
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;box(g,'handwheel-spoke',[.35,.045,.055],blue,[Math.cos(a)*.20,1.10,Math.sin(a)*.20],[0,-a,0])}
  cyl(g,'handwheel-locknut',.049,.035,steel,[0,1.15,0],'y',6)
  return g
}
function gearmotor() {
  const g=new T.Group()
  cyl(g,'motor-body',.36,.85,grey,[.12,.0,0],'x')
  for(let i=0;i<24;i++) {
    const a=i*Math.PI/12
    box(g,'longitudinal-cooling-fin',[.77,.058,.023],grey,[.12,Math.cos(a)*.375,Math.sin(a)*.375],[a,0,0])
  }
  cyl(g,'rear-fan-cover',.397,.22,grey,[.635,0,0],'x')
  // Dark recessed disk plus perforated annular grille, no impossible solid fan face.
  cyl(g,'fan-grille-recess',.322,.012,black,[.750,0,0],'x')
  for(let r=.05;r<.32;r+=.044) torus(g,'fan-grille-ring',r,.009,grey,[.762,0,0],'x')
  for(let i=0;i<12;i++){const a=i*Math.PI/6;box(g,'fan-grille-spoke',[.012,.63,.013],grey,[.763,0,0],[a,0,0])}
  for(const x of [-.12,.39])for(const z of [-.29,.29]){
    box(g,'foot-support',[.15,.13,.10],grey,[x,-.365,z]);
    box(g,'mounting-foot',[.20,.065,.17],grey,[x,-.43,z]);cyl(g,'foot-bolt',.025,.009,darkSteel,[x,-.393,z],'y',16)
  }
  box(g,'terminal-box',[.30,.18,.30],grey,[.10,.42,0])
  box(g,'terminal-box-lid',[.325,.026,.325],grey,[.10,.52,0])
  box(g,'worm-gearbox-housing',[.39,.67,.62],grey,[-.49,-.025,0])
  for(let i=0;i<5;i++)box(g,'gearbox-rib',[.425,.028,.65],grey,[-.49,-.28+i*.125,0])
  ring(g,'gearbox-output-flange',.11,.26,.085,steel,[-.49,-.025,.365])
  ring(g,'output-shaft-bore',.104,.145,.16,darkSteel,[-.49,-.025,.335])
  for(let i=0;i<8;i++){const a=i*Math.PI/4;screw(g,'gearbox-cover-bolt',[-.49+Math.cos(a)*.22,-.025+Math.sin(a)*.22,.415],.023)}
  for(const x of [-.64,-.34])for(const y of [-.29,.25])screw(g,'gearbox-corner-bolt',[x,y,.337],.026)
  return g
}
const entries=[
  ['proximity-sensor','接近开关',proximity,'595759e6-d8a3-420a-aa5a-57d2c14adda5',-Math.PI/2],
  ['circuit-breaker-3p','断路器（三极示意）',breaker,'61daed07-076d-45ac-9be4-e2ef818d2419',0],
  ['deep-groove-bearing','深沟球轴承',()=>bearing(false),'7895b2b7-8bfb-46db-b932-ed5c6757c5be',0],
  ['spherical-roller-bearing','调心滚子轴承',()=>bearing(true),'bf745818-89d4-4715-b24e-397500bc14e6',0],
  ['pneumatic-solenoid-valve','气动电磁阀',pneumatic,'1ca3da1b-bc1b-4aa5-a9c0-8ad7e67188f1',0],
  ['flanged-gate-valve','法兰闸阀',gateValve,'50f38f90-013c-4013-9227-a55a03901f56',0],
  ['gearmotor','减速电机',gearmotor,'0d2f0939-7fb0-48ea-9cd9-2682231299a7',0]
]
await fs.mkdir(out,{recursive:true})
const manifest={version:'20260904',description:'用户参考图制作的类别示意模型；非精密 CAD，图片为原始参考图。',models:[]}
for(const [key,name,factory,photo,frontRotationY] of entries){
  const scene=new T.Scene(),g=factory();g.name=key
  g.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(g),center=bounds.getCenter(new T.Vector3())
  g.position.set(-center.x,-bounds.min.y,-center.z);scene.add(g)
  scene.userData={referencePhoto:`${key}.png`,illustrationOnly:true,dimensionsVerified:false}
  const bytes=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true}))
  await fs.writeFile(path.join(out,`${key}.glb`),bytes)
  const photoTarget=path.join(out,`${key}.png`)
  try{await fs.copyFile(path.join(source,`codex-clipboard-${photo}.png`),photoTarget)}catch(e){if(e.code!=='ENOENT')throw e;await fs.access(photoTarget)}
  const photoBytes=await fs.readFile(photoTarget)
  manifest.models.push({key,name,frontRotationY,model:`${key}.glb`,image:`${key}.png`,modelSha256:createHash('sha256').update(bytes).digest('hex'),imageSha256:createHash('sha256').update(photoBytes).digest('hex')})
  console.log(`${key}: ${bytes.length} bytes`)
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')

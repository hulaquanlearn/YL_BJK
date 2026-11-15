// Site-photo corrections for the old latent AGV (2026-11-03 four originals).
// The four originals live in docs/agv-site-20261103/ (not published); these
// assertions encode the physical evidence only, never a measured CAD layout.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

const dispose=root=>root.traverse(node=>{node.geometry?.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose?.())})
const count=(root,name)=>{let total=0;root.traverse(node=>{if(node.name===name)total++});return total}
const find=(root,name)=>root.getObjectByName(name)
const boxOf=object=>{object.updateMatrixWorld(true);return new THREE.Box3().setFromObject(object)}
const centre=object=>boxOf(object).getCenter(new THREE.Vector3())
// Independent photo-rebuild parts remain interior equipment; splitting a group
// must not silently exempt its children from the established empty-slot checks.
const interiorIds=['control','plc','relay-bank','fuse-panel','io-board','aux-power','auxiliary-unit','wireless-connectors','dcdc','tpm','ekk','supercapacitor','pickup','lift']

test('old latent AGV drops the unsupported towing rings and management stickers but keeps real bumpers and waistline',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const byName=Object.fromEntries(parts.map(part=>[part.name,part]))
  // The four photos show no exposed towing/tie-down ring; none may remain in the
  // old model (the new vehicle keeps its documented baseline hardware).
  for(const part of ['chassis','rear-cover']){
   let torus=0;byName[part].traverse(node=>{if(node.geometry?.type==='TorusGeometry')torus++})
   assert.equal(torus,0,`${part} still carries an unsupported towing ring`)
  }
  let anyTorus=0;root.traverse(node=>{if(node.geometry?.type==='TorusGeometry')anyTorus++})
  assert.equal(anyTorus,0,'no unsupported ring geometry is left anywhere on the old car')
  // Vehicle number 12, the company label and the pseudo QR are device-management
  // stickers: no white sticker meshes may be modelled on the operator panel.
  assert.equal(count(root,'panel-number-disc'),0)
  assert.equal(count(root,'panel-company-label'),0)
  let whiteSticker=0;byName['operator-panel'].traverse(node=>{if(node.isMesh&&node.material?.color?.getHex()===0xe8e4dc)whiteSticker++})
  assert.equal(whiteSticker,0,'management stickers must not be modelled')
  // The real front/rear black rubber bumpers stay; they were not replaced by a ring.
  for(const name of ['front-rubber-bumper','rear-rubber-bumper']){
   const bumper=find(root,name);assert.ok(bumper,name)
   assert.equal(bumper.material.color.getHex(),0x1c1e20,`${name} must stay black rubber`)
  }
  // Black waistline decals and the black lower side skirt stay.
  assert.equal(count(root,'side-lower-decal'),2)
  assert.equal(count(root,'side-decal'),0,'disconnected diagonal sticker bars are replaced by a continuous contour')
  for(const name of ['left-cover','right-cover']){
   const cover=byName[name],stripe=cover.getObjectByName('side-lower-decal');
   const ray=new THREE.Raycaster(new THREE.Vector3(.01,.098,name==='left-cover'?1:-1),new THREE.Vector3(0,0,name==='left-cover'?-1:1));
   assert.equal(ray.intersectObject(stripe).length,0,'the side stripe must not bridge the wheel opening');
  }
  const skirts=byName.chassis.children.filter(node=>node.isMesh&&Math.abs(Math.abs(node.position.z)-.344)<1e-6)
  assert.equal(skirts.length,6,'two skirt tiers per side plus the short fill under the rear side step')
  for(const skirt of skirts)assert.equal(skirt.material.color.getHex(),0x0f1317,'old-car lower skirt is black')
  assert.equal(count(root,'rear-step-skirt-fill'),2,'the short skirt run under the rear step is filled, not a see-through slit')
  // Envelope metadata no longer leans on the deleted loops.
  assert.deepEqual(root.userData.overallEnvelopeMm,[1370,720,459])
  assert.match(root.userData.envelopeNote,/No towing loops/)
  assert.doesNotMatch(root.userData.envelopeNote,/towing loops and rubber bumpers extend/)
 }finally{dispose(root)}
})

test('old latent AGV deck is a thin silver plate with a rectangular opening, long-edge folds and a bent flap',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const platform=parts.find(part=>part.name==='platform'),deck=find(root,'platform-deck')
  assert.equal(deck.material.color.getHex(),0x8e9499,'silver-grey thin deck, not the dark plate')
  const deckBounds=boxOf(deck)
  assert.ok(deckBounds.max.y-deckBounds.min.y<.008,'the actual deck is a thin sheet, not the former 22 mm slab')
  let torus=0;platform.traverse(node=>{if(node.geometry?.type==='TorusGeometry')torus++})
  assert.equal(torus,0,'no round hole ring on the old deck')
  // Rectangular opening, not the previous 50 mm circle: open at the rectangle
  // centre and wider than the old circle along x, but closed beside it along z.
  const hits=(x,z)=>{const ray=new THREE.Raycaster(new THREE.Vector3(x,.6,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(deck).length}
  assert.equal(hits(-.02,0),0,'central opening is not a painted disc')
  assert.equal(hits(-.075,0),0,'rectangular opening extends beyond the old circular hole')
  assert.equal(hits(0,.06),1,'opening is a rectangle, not the old circle')
  assert.equal(hits(.10,0),1,'solid deck remains beside the opening')
  const deckTop=boxOf(deck).max.y
  const flaps=[];platform.traverse(node=>{if(node.name==='deck-bent-flap')flaps.push(boxOf(node))})
  assert.ok(flaps.length>=2,'bent sheet over the opening is modelled')
  assert.ok(flaps.some(box=>box.max.y>deckTop+.008),'bent flap rises above the deck surface')
  for(const box of flaps)assert.ok(box.max.y<=.461,'bent flap stays inside the documented 460 mm envelope')
  const folds=[];platform.traverse(node=>{if(node.name==='deck-fold-long')folds.push(boxOf(node))})
  assert.equal(folds.length,2,'both 1310 mm edges are folded up')
  for(const box of folds){assert.ok(box.max.x-box.min.x>1.2);assert.ok(box.max.z-box.min.z<.03);assert.ok(box.max.y>deckTop)}
  // Accordion bellows wrap the body as folds on all four sides, not three floating bars.
  const bellows=find(root,'deck-bellows'),position=bellows.geometry.attributes.position
  assert.equal(bellows.geometry.type,'BufferGeometry','continuous folded skin rather than overlapping boxes')
  const levels=new Map()
  for(let i=0;i<position.count;i++){
   const y=position.getY(i).toFixed(4),r=levels.get(y)||{x:0,z:0}
   r.x=Math.max(r.x,Math.abs(position.getX(i)));r.z=Math.max(r.z,Math.abs(position.getZ(i)));levels.set(y,r)
  }
  const profile=[...levels.entries()].sort(([a],[b])=>Number(a)-Number(b))
  assert.equal(profile.length,13,'six folds have alternating ridge and valley rings')
  for(let i=1;i<profile.length;i++){
   assert.ok(Math.abs(profile[i][1].x-profile[i-1][1].x)>.008,'short ends have real fold relief')
   assert.ok(Math.abs(profile[i][1].z-profile[i-1][1].z)>.008,'long sides have real fold relief')
  }
 }finally{dispose(root)}
})

test('old latent AGV operator panel keeps the real screen, keyboard, interfaces and buttons in the photographed layout',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const panel=parts.find(part=>part.name==='operator-panel')
  const bezel=boxOf(find(root,'panel-display-bezel'))
  const screen=boxOf(find(root,'panel-screen'))
  // Ten-key pad belongs to the same operator bezel directly under the LCD.
  const keys=[];panel.traverse(node=>{if(node.name==='panel-keypad-key')keys.push(boxOf(node))})
  assert.equal(keys.length,10)
  for(const key of keys){
   assert.ok(key.min.z>=bezel.min.z&&key.max.z<=bezel.max.z)
   assert.ok(key.max.y<screen.min.y,'keypad sits below the screen inside the bezel')
   assert.ok(key.min.x>bezel.max.x-.001,'keypad is mounted on the bezel face, not floating off it')
  }
  assert.equal(count(root,'panel-function-key'),8,'function keys flank the screen')
  // Not mirrored and not hidden behind the front plate: keypad stands proud of it.
  const plate=panel.children.find(node=>node.isMesh&&node.material?.color?.getHex()===0xc23a2a)
  assert.ok(keys.every(key=>key.min.x>boxOf(plate).max.x),'keypad is not covered by the front plate')
  // Functional controls are retained and separated by side exactly as in front.jpg.
  for(const name of ['panel-connector','panel-key-switch','panel-rotary-switch','panel-red-button','panel-estop','panel-button-green','panel-button-red'])assert.ok(count(root,name)>0,name)
  assert.equal(count(root,'panel-estop'),1)
  assert.equal(count(root,'panel-button-green'),2)
  assert.equal(count(root,'panel-button-red'),1)
  assert.equal(count(root,'panel-red-button'),1)
  assert.ok(centre(find(root,'panel-connector')).z>.25,'connector/keys/red button on the viewer-left (+Z) group')
  assert.ok(centre(find(root,'panel-key-switch')).z>.25)
  assert.ok(centre(find(root,'panel-rotary-switch')).z>.25)
  assert.ok(centre(find(root,'panel-red-button')).z>.25)
  assert.ok(centre(find(root,'panel-estop')).z<-.25,'E-stop group on the viewer-right (-Z) group')
  assert.ok(centre(find(root,'panel-button-green')).z<-.25)
  assert.ok(centre(find(root,'panel-button-red')).z<-.25)
  // Lower front recess keeps the wide dark cavity and the silver bar recessed
  // behind the end-plate face (a real opening, not a painted patch).
  assert.ok(find(root,'front-silver-bar'))
  assert.equal(find(root,'front-silver-bar').material.color.getHex(),0xb6bec4)
  assert.ok(find(root,'front-cavity'))
  const plateBox=boxOf(plate)
  assert.ok(boxOf(find(root,'front-silver-bar')).max.x<=plateBox.max.x+.001,'silver bar sits inside the recess')
  assert.ok(boxOf(find(root,'front-cavity')).max.x<plateBox.max.x,'dark cavity is recessed behind the end plate')
  const recessRay=new THREE.Raycaster(new THREE.Vector3(.8,.185,0),new THREE.Vector3(-1,0,0),0,.4)
  assert.ok(recessRay.intersectObject(find(root,'front-cavity')).length>0,'recess has a real back wall')
  assert.equal(find(root,'front-cavity').material.color.getHex(),0xa32a1e,'the photographed inset is red, not a black rectangular plug')
  const openBottom=new THREE.Raycaster(new THREE.Vector3(.8,.130,0),new THREE.Vector3(-1,0,0),0,.210)
  assert.equal(openBottom.intersectObject(panel,true).length,0,'bottom of the U-shaped face is open above the independent bumper tier')
  // No fabricated 12 disc bars remain anywhere in the panel.
  let redSticker=0;panel.traverse(node=>{if(node.isMesh&&node.name===''&&node.geometry?.type==='BoxGeometry'&&node.material?.color?.getHex()===0xc03028&&node.position.z>.18)redSticker++})
  assert.equal(redSticker,0)
 }finally{dispose(root)}
})

test('old latent AGV carries exactly one TIM per end, at the lower-right corner seen from that end',()=>{
 const {root}=buildAgvModel({variant:'old'})
 try{
  assert.equal(count(root,'tim-front-housing'),1)
  assert.equal(count(root,'tim-rear-housing'),1)
  const front=boxOf(find(root,'tim-front-housing')),rear=boxOf(find(root,'tim-rear-housing'))
  const frontCentre=front.getCenter(new THREE.Vector3()),rearCentre=rear.getCenter(new THREE.Vector3())
  assert.ok(frontCentre.x>.45,'front TIM belongs to the operator end')
  assert.ok(rearCentre.x<-.45,'rear TIM belongs to the screenless end')
  assert.ok(frontCentre.z<-.25,'front lower-right seen from +X is -Z')
  assert.ok(rearCentre.z>.25,'rear lower-right seen from -X is +Z')
  assert.ok(frontCentre.y<.2&&rearCentre.y<.2,'TIM sits at the shell lower edge, not on an upper plate')
  for(const [housingName,cylinderName] of [['tim-front-housing','tim-front-cylinder'],['tim-rear-housing','tim-rear-cylinder']]){
   const housing=boxOf(find(root,housingName)),cylinder=boxOf(find(root,cylinderName))
   assert.ok(cylinder.max.y<=housing.max.y+.001)
   assert.ok(cylinder.min.y<housing.min.y,'black cylinder points downward')
   assert.equal(find(root,housingName).material.color.getHex(),0x1a6f9e,'blue-black TIM housing')
   assert.equal(find(root,cylinderName).material.color.getHex(),0x0f1317,'black TIM cylinder')
  }
  assert.equal(count(root,'tim-front-housing')+count(root,'tim-rear-housing'),2,'not two boxes per end')
  const chassis=root.getObjectByName('chassis')
  const outward=new THREE.Raycaster(new THREE.Vector3(.55,.139,-.350),new THREE.Vector3(0,0,-1),0,.05)
  assert.equal(outward.intersectObject(chassis,true).length,0,'the chassis end beam must not hide the front TIM')
 }finally{dispose(root)}
})

test('old latent AGV navigation radar sits at the rear transverse centre in the recess under the upper end beam',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const head=find(root,'navigation-scan-head'),window=find(root,'navigation-scan-window')
  assert.equal(find(root,'navigation-aperture'),undefined,'the offset end-panel aperture was removed')
  const centre=head.getWorldPosition(new THREE.Vector3())
  assert.ok(centre.x<-.60,'radar looks out of the screenless end')
  assert.ok(Math.abs(centre.z)<.02,'radar is at the transverse centre, not an offset corner')
  assert.ok(centre.y>.19&&centre.y<.26,'scan window sits in the recess between the two end beams')
  assert.ok(boxOf(head).max.y<.30,'radar is not modelled on the platform top')
  assert.ok(window.material.transparent&&window.material.opacity<.8,'red scan window is transparent')
  // The scan ray leaves the vehicle through the real gap; both end beams stay present.
  const rear=parts.find(part=>part.name==='rear-cover')
  const rayHits=y=>{const ray=new THREE.Raycaster(new THREE.Vector3(centre.x,y,0),new THREE.Vector3(-1,0,0),0,.3);return ray.intersectObject(rear,true).length}
  assert.equal(rayHits(centre.y),0,'outward scan ray must pass through the central recess')
  for(const y of [boxOf(window).min.y+.001,boxOf(window).max.y-.001])assert.equal(rayHits(y),0,'the whole scan window clears both end beams, not just its centre')
  assert.ok(rayHits(.36)>0,'upper end beam remains around the recess')
  assert.ok(rayHits(.15)>0,'lower end beam remains below the recess')
 }finally{dispose(root)}
})

test('rear shell retains the scanner slot and trapezoid channel without filling its outside',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const rear=parts.find(p=>p.name==='rear-cover')
  for(const name of ['rear-groove-floor','rear-groove-sloped-wall','rear-groove-straight-wall','rear-side-step'])assert.ok(rear.getObjectByName(name),name)
  for(const name of ['rear-recess-floor','rear-recess-ceiling','rear-inner-stiffener-web','rear-recess-cheek'])assert.equal(rear.getObjectByName(name),undefined,name+' was superseded by the confirmed open trapezoid')
  for(const name of ['rear-skin-return','rear-lower-return'])assert.ok(rear.getObjectByName(name),'outer shell retained: '+name)
  assert.equal(count(root,'rear-recess-back'),0,'2026-11-13: user/photo explicitly confirms a genuine opening, not a backed recess')
  assert.equal(count(root,'navigation-cap-housing'),0,'no fabricated fill around the scanner')
  const cap=find(root,'navigation-scan-cap'),window=find(root,'navigation-scan-window')
  assert.ok(boxOf(cap).max.y<=.2701&&boxOf(window).max.y<=.2701,'scanner remains inside the slot')
  for(const z of [-.025,0,.025])for(const y of [.205,.23,.255]){
   const ray=new THREE.Raycaster(new THREE.Vector3(-.80,y,z),new THREE.Vector3(1,0,0),0,.5)
   assert.equal(ray.intersectObject(rear,true).length,0,'slot must pass through the COMPLETE hood, not just its front skin')
  }
  for(const side of [-1,1]){
   const ray=new THREE.Raycaster(new THREE.Vector3(-.54,.31,side*.60),new THREE.Vector3(0,0,-side),0,.3)
   const hit=ray.intersectObject(rear,true)[0];assert.ok(hit,'deep rear side wall belongs to the removable rear hood')
   assert.ok(Math.abs(hit.point.z)>.34)
  }
 }finally{dispose(root)}
})

test('old latent AGV sides are not mirrored: side-a vertical louvres and side-b rounded horizontal grille',()=>{
 const {root,parts}=buildAgvModel({variant:'old'})
 try{
  const louvers=[],grille=[]
  root.traverse(node=>{if(node.name==='side-vent-louver')louvers.push(boxOf(node))})
  root.traverse(node=>{if(node.name==='side-vent-grille')grille.push(boxOf(node))})
  assert.equal(louvers.length,8,'eight vertical louvres on the side-a cover')
  assert.equal(grille.length,6,'six horizontal slats on the side-b grille')
  for(const box of louvers){
   assert.ok(box.getCenter(new THREE.Vector3()).z<0,'louvres only on the side-a (right, -Z) cover')
   assert.ok(box.max.y-box.min.y>.05&&box.max.x-box.min.x<.02,'louvre slats are vertical')
  }
  for(const box of grille){
   assert.ok(box.getCenter(new THREE.Vector3()).z>0,'grille only on the side-b (left, +Z) cover')
   assert.ok(box.max.x-box.min.x>.08&&box.max.y-box.min.y<.02,'grille slats are horizontal')
  }
  assert.ok(find(root,'side-vent-grille-frame'))
  assert.equal(count(root,'side-seam'),2,'the visible body-side split is kept on both sides')
  // Old wheel: dark metal face inside the brown polyurethane rim, six bolts, no gold hub.
  const tyre=find(root,'drive-tyre')
  assert.equal(tyre.material.color.getHex(),0x7d6847,'brown polyurethane rim')
  assert.equal(count(root,'drive-wheel-face'),2)
  assert.equal(count(root,'drive-wheel-bolt'),12)
  for(const name of ['drive-left','drive-right']){
   const drive=parts.find(part=>part.name===name)
   let gold=0;drive.traverse(node=>{if(node.isMesh&&node.material?.color?.getHex()===0x9d7b28)gold++})
   assert.equal(gold,0,`${name} must not use the polished gold hub`)
  }
 }finally{dispose(root)}
})

test('new latent AGV keeps its baseline programme and is not rewritten by the old-car photos',()=>{
 const {root,parts}=buildAgvModel({variant:'new'})
 try{
  assert.equal(count(root,'side-lower-decal'),0)
  assert.equal(count(root,'panel-keypad-key'),0)
  assert.equal(count(root,'deck-bellows'),0)
  assert.equal(count(root,'panel-display-bezel'),0)
  assert.equal(count(root,'side-vent-louver'),0)
  assert.equal(count(root,'side-vent-grille'),0)
  assert.equal(count(root,'tim-front-housing'),0)
  const coverMaterial=find(root,'left-cover')?.children.find(child=>child.isMesh)?.material
  assert.equal(coverMaterial?.color.getHex(),0xc9481f)
  const tyre=find(root,'drive-tyre')
  assert.equal(tyre.material.color.getHex(),0x1c1e20)
  // New car keeps its documented hardware programme (loops, ring, offset aperture).
  let loops=0
  for(const name of ['chassis','rear-cover'])for(const part of parts.filter(item=>item.name===name))part.traverse(node=>{if(node.geometry?.type==='TorusGeometry')loops++})
  assert.equal(loops,6)
  assert.ok(find(root,'navigation-aperture'))
  assert.equal(root.userData.overallEnvelopeMm[0],1387)
 }finally{dispose(root)}
})

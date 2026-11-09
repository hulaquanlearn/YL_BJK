'use strict';
const {createDepositGrid,depositSegment,volumeHeight,diskRectangleArea}=require('./robot-deposit-grid');
function inverseFrame(point,pose={}){
 const offset=pose.pos||[0,0,0],q=pose.quat||pose.rot||[1,0,0,0],length=Math.hypot(...q)||1,w=q[0]/length,x=-q[1]/length,y=-q[2]/length,z=-q[3]/length;
 const p=point.map((value,i)=>value-offset[i]),tx=2*(y*p[2]-z*p[1]),ty=2*(z*p[0]-x*p[2]),tz=2*(x*p[1]-y*p[0]);
 return [p[0]+w*tx+y*tz-z*ty,p[1]+w*ty+z*tx-x*tz,p[2]+w*tz+x*ty-y*tx];
}
function depositPoint(point,frame){
 const local=Array.isArray(frame)?inverseFrame(point,{pos:frame}):inverseFrame(inverseFrame(point,frame?.uframe||frame),frame?.oframe);
 // ABB X/Y/Z -> scene X/Y/Z = X/Z/-Y, within the selected pot frame.
 return [local[0],-local[1],local[2]];
}
function forwardFrame(point,pose={}){
 const q=pose.quat||pose.rot||[1,0,0,0];return inverseFrame(point,{pos:[0,0,0],quat:[q[0],-q[1],-q[2],-q[3]]}).map((v,i)=>v+(pose.pos?.[i]||0));
}
function depositWorldPoint(local,frame){
 const p=[local[0],-local[1],local[2]];return Array.isArray(frame)?p.map((v,i)=>v+frame[i]):forwardFrame(forwardFrame(p,frame?.oframe),frame?.uframe||frame);
}
function surfaceHeightAt(cell,u,v){
 const data=cell.depositGrid;if(!data)return Number(cell.height)||0;
 const size=data.gridSize||24,radius=data.lowerRadius||1.09,step=2*radius/size,alpha=((data.upperRadius||1.2)-radius)/(data.potHeight||.97)/radius;
 const x=(u+1)*size/2-.5,y=(v+1)*size/2-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;let height=0,weight=0;
 for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
  const cx=Math.max(0,Math.min(size-1,ix+dx)),cy=Math.max(0,Math.min(size-1,iy+dy)),key=cx+':'+cy,baseArea=diskRectangleArea(cx*step-radius,(cx+1)*step-radius,cy*step-radius,(cy+1)*step-radius,radius);if(baseArea<1e-12)continue;
  const volume=Number(data.cells?.[key]?.volume??data.cells?.[key])||0;height+=volumeHeight(volume,baseArea,alpha)*w;weight+=w;
 }
 return weight?height/weight*1000:0;
}
function surfaceCoordinates(cell,x,z){
 const data=cell.depositGrid,lower=(data?.lowerRadius||1.09)*1000,k=((data?.upperRadius||1.2)-(data?.lowerRadius||1.09))/(data?.potHeight||.97);
 let u=x/lower,v=z/lower,height=0;
 // The pot widens with height. Invert that taper before addressing its
 // material grid, so the visible deposit stays under the physical outlet.
 for(let i=0;i<3;i++){height=surfaceHeightAt(cell,u,v);const radius=lower+k*height;u=x/radius;v=z/radius}
 return {u,v,height:surfaceHeightAt(cell,u,v)};
}
function followSurface(cell,point,frame,sourceOffset,{approach=false}={}){
 const local=depositPoint(point,frame),radius=(cell.depositGrid?.lowerRadius||1.09)*1000;
 if(Math.hypot(local[0],local[1])>radius*1.15)return null;
 const height=Math.max(surfaceCoordinates(cell,local[0],local[1]).height,...Array.from({length:8},(_,i)=>surfaceCoordinates(cell,local[0]+150*Math.cos(i*Math.PI/4),local[1]+150*Math.sin(i*Math.PI/4)).height)),clearance=local[2]-sourceOffset;
 let maximum=Number(cell.height)||0;
 if(approach&&cell.depositGrid){const grid=createDepositGrid({targetHeight:cell.targetHeight,targetVolume:cell.targetVolume,gridSize:cell.depositGrid.gridSize,bowlDepthM:cell.depositGrid.bowlDepthM});for(const [key,value] of Object.entries(cell.depositGrid.cells||{})){const c=grid.cells[key];if(c)maximum=Math.max(maximum,volumeHeight(Number(value?.volume??value)||0,c.baseArea,grid.alpha)*1000)}}
 const next=approach?Math.max(local[2],maximum+250):height+clearance;
 return {point:depositWorldPoint([local[0],local[1],next],frame),surfaceHeight:height,clearance:next-height,sourceHeight:local[2],targetHeight:next};
}
function readSurfaceFeedback(state){
 const c=state.cell,g=state.globals,frame=g[c.barrel==='right'?'wobjbarrelr':'wobjbarrell'];
 const probe=c.lastSurfacePoint?depositPoint(c.lastSurfacePoint,frame):[0,0,0],measured=surfaceCoordinates(c,probe[0],probe[1]).height;
 // Protected BaseMod substitute: the readable historical implementation in
 // yuanxin.mod subtracts 85/80 mm, clamps 0..800, then updates nDisZOffs.
 // The virtual probe is the last spread location (centre before first spread),
 // not a claim that a physical camera has measured this value.
 const compensation=measured>50&&Number(g.gaiding)!==1?85:80,offset=Math.max(0,Math.min(800,measured-compensation));
 for(const key of ['zaomian_gaodu','gaodu1','zaomiangaodu_guding'])if(key in g)g[key]=measured;
 if('zaomiangaodu' in g)g.zaomiangaodu=offset;
 if('ndiszoffs' in g)g.ndiszoffs=offset;
 state.signals.gi192_207_zaomian_gaodu1=Math.round(measured);
 c.surfaceMeasurement={measured,compensation,offset,probe:probe.slice(0,2),simulated:true,source:'yuanxin.mod historical protected-function substitute'};
 return c.surfaceMeasurement;
}
function compact(grid){
 const {cells,...description}=grid;
 return {...description,cells:Object.fromEntries(Object.entries(cells).filter(([,entry])=>entry.volume>1e-12).map(([key,entry])=>[key,entry.volume]))};
}
function emptyDepositState(targetHeight,targetVolume){return compact(createDepositGrid({targetHeight,targetVolume}));}
function appendDeposit(cell,previous,current,volume,frame){
 if(!(volume>0))return 0;
 const grid=createDepositGrid({targetHeight:cell.targetHeight,targetVolume:cell.targetVolume,gridSize:cell.depositGrid?.gridSize||24,bowlDepthM:cell.depositGrid?.bowlDepthM});
 for(const [key,value] of Object.entries(cell.depositGrid?.cells||{})){
  if(!grid.cells[key])continue;
  const amount=Number(value?.volume??value)||0;grid.cells[key].volume=amount;grid.cells[key].height=volumeHeight(amount,grid.cells[key].baseArea,grid.alpha);grid.depositedVolume+=amount;
 }
 const a=depositPoint(previous,frame),b=depositPoint(current,frame),from=surfaceCoordinates(cell,a[0],a[1]),to=surfaceCoordinates(cell,b[0],b[1]),before=grid.depositedVolume;
 depositSegment(grid,{fromU:from.u,fromV:from.v,toU:to.u,toV:to.v,volume,widthM:.30});
 cell.depositGrid=compact(grid);delete cell.depositCells;delete cell.depositRadiusMm;delete cell.depositGridSize;
 return Math.max(0,grid.depositedVolume-before);
}
// ---------------------------------------------------------------------------
// Pot shell + whole-tool clearance model for the exit / rim-cleanup path.
// Geometry sources (read-only analysis of the real backup and CAD, see
// docs/ABB_POT_PATH_DSH_20261106.md):
//  - pot inner cavity: ModData/ModTeach 1.09 m bottom radius -> 1.2 m top over
//    0.97 m; the scene GLB (gujing-pot.glb, remapped by placeBrewingPot) gives
//    rim top = inner height, rim annulus width = wall thickness = 75.1 mm.
//  - tool envelopes: tool-640 / tool-700 GLB node AABBs, CAD -> flange is
//    p_flange_mm = (1000x, -1000z, 1000y), no translation (adapter at origin).
// The envelopes are axis-aligned CAD boxes in the flange frame. They are
// conservative for the sweep check and are NOT a claim of exact CAD collision
// meshes; see docs for the exact provenance of every number.
const POT_GEOMETRY = {
  defaultLowerRadiusM: 1.09,
  defaultUpperRadiusM: 1.2,
  defaultHeightM: .97,
  rimWidthMm: 75.1,
  floorThicknessMm: 98,
  wallBottomMm: 76.3,
  wallTopMm: 75.2,
  source: 'gujing-pot.glb radial profile after placeBrewingPot remap; inner cavity from ModTeach'
};
// Axis-aligned flange-frame boxes (mm) of the rigid parts that can hit the pot.
// Per-node CAD AABBs (tool-640: 24 rigid parts, tool-700: 20) in the flange
// frame, from the real GLB node boxes; CAD -> flange is p = (1000x, -1000z, 1000y).
const TOOL_ENVELOPES = {
  'tool-640': [
    { name: 'driveDrum', min: [-426.4, -324.8, 733.2], max: [-326.2, 225.2, 833.5] },
    { name: 'drivenDrum', min: [-32.1, -324.9, 589.3], max: [68.8, 225.1, 690.1] },
    { name: 'rotorAssembly', min: [-586.8, -344, 501.4], max: [-358.9, 244, 736.4] },
    { name: 'rotor', min: [-586.8, -325, 501.4], max: [-358.9, 225, 736.4] },
    { name: 'auxCylinder', min: [-472.5, 361, 491.4], max: [-294.8, 387, 644.7] },
    { name: 'auxCylinder', min: [-472.5, -387, 491.4], max: [-294.8, -361, 644.7] },
    { name: 'frame', min: [-537.2, -392, 133.5], max: [85, 392, 883.7] },
    { name: 'belt', min: [-428.6, -324, 587], max: [71.1, 324, 835.8] },
    { name: 'skirt', min: [16.8, -277.5, 487.6], max: [63.5, 277.5, 586.1] },
    { name: 'keepPlate', min: [60.4, -277, 487.6], max: [62.4, 277, 507.6] },
    { name: 'turnScraper', min: [-472.3, 313, 690.6], max: [-368.3, 319, 867.4] },
    { name: 'sideScraperPlate', min: [-478.8, -328, 509.4], max: [62.6, -311.8, 742.9] },
    { name: 'turnScraper', min: [-472.3, -319, 690.6], max: [-368.3, -313, 867.4] },
    { name: 'guard', min: [-637.3, -340.2, 558.3], max: [-421.1, 340.2, 903.2] },
    { name: 'beltDeck', min: [-311.2, -279.5, 606.8], max: [-63.5, 279.5, 714] },
    { name: 'adjustPlate', min: [-457, -275, 416.1], max: [-403.3, 275, 557.9] },
    { name: 'rake', min: [-385.1, -245, 864.1], max: [-371.4, 345, 963.8] },
    { name: 'frontScraper', min: [-388.3, -222.5, 835.6], max: [-363.9, 322.5, 894] },
    { name: 'rearPanel', min: [85, -350, 143.5], max: [86, 350, 673.5] },
    { name: 'sidePanel', min: [-518.7, -351, 141.8], max: [89.6, -350, 875.6] },
    { name: 'sidePanel', min: [-518.7, 350, 141.8], max: [89.6, 351, 875.6] },
    { name: 'laserGuard', min: [-96.9, -182, 47.8], max: [-26.8, -127, 123.6] },
    { name: 'laserGuard', min: [-75, -182, 60.5], max: [-25.6, -128, 133.5] },
    { name: 'sideScraperPlate', min: [-478.8, 311.8, 509.4], max: [62.6, 328, 742.9] }
  ],
  'tool-700': [
    { name: 'driveDrum', min: [-222.1, -325, 667.5], max: [-120.2, 325, 767.8] },
    { name: 'drivenDrum', min: [105.5, -325, 493.1], max: [207.5, 325, 593.2] },
    { name: 'rotorAssembly', min: [-396.2, -344, 459.8], max: [-161.3, 344, 687.8] },
    { name: 'rotor', min: [-396.2, -325, 459.8], max: [-161.3, 325, 687.8] },
    { name: 'auxCylinder', min: [-261.9, -384, 346.6], max: [-158.4, -358, 507.1] },
    { name: 'auxCylinder', min: [-262, 358.1, 346.6], max: [-158.4, 384.1, 507.2] },
    { name: 'guard', min: [-414.2, -387.1, 402], max: [-239.2, 387.3, 621.8] },
    { name: 'frame', min: [-347.9, -350.8, 133.5], max: [239.8, 350.8, 800.3] },
    { name: 'belt', min: [-223, -324, 491.4], max: [208, 324, 770.3] },
    { name: 'beltDeck', min: [-145.3, -329.5, 518.6], max: [87.8, 329.5, 654.9] },
    { name: 'laserGuard', min: [-95.4, 260, 50.9], max: [-13.2, 334.9, 126.6] },
    { name: 'laserGuard', min: [-95.4, -334.4, 50.9], max: [-11.7, -260, 126.6] },
    { name: 'frontScraper', min: [-176.1, -324.5, 769.4], max: [-144.6, 320.5, 825] },
    { name: 'keepPlate', min: [146.5, -327.5, 376.3], max: [156.2, 327.5, 395.5] },
    { name: 'skirt', min: [134.1, -330, 375.9], max: [161.1, 330, 518.8] },
    { name: 'rake', min: [-167.2, -324.5, 801.3], max: [-147.6, 320.5, 904.5] },
    { name: 'turnScraper', min: [-274.8, -323, 625.9], max: [-165.4, -317, 800.3] },
    { name: 'turnScraper', min: [-274.8, 317, 625.9], max: [-165.4, 323, 800.3] },
    { name: 'sideScraperPlate', min: [-287.8, -328, 402.3], max: [195, -315.8, 691.3] },
    { name: 'sideScraperPlate', min: [-287.8, 315.8, 402.3], max: [195, 328, 691.3] }
  ]
};
// Conservative union used when the mounted head (640/700) is not known.
const TOOL_ENVELOPE_UNION = [...TOOL_ENVELOPES['tool-640'], ...TOOL_ENVELOPES['tool-700']];
// Offline cleaning-element assumption. The CAD contains NO brush: the nodes are
// 刚性耙子/刮板. The QS circle puts the tool TCP 23.3/14.1 mm below the rim top,
// so a rotating brush centred on that TCP would touch the rim if its bristle
// length and radius are at least the required values below. These defaults are
// an explicit, unconfirmed proxy - not a field measurement.
const CLEAN_BRUSH_PROXY = {
  radiusMm: 60,
  bristleMm: 25,
  confirmed: false,
  source: 'offline assumption; CAD 640/700 has no bristle brush part'
};

function quatMulPose(a, b) {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw];
}
function quatRotatePose(q, v) {
  const [w, x, y, z] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
function poseMulPose(a, b) {
  return { pos: quatRotatePose(a.quat, b.pos).map((value, i) => value + a.pos[i]), quat: quatMulPose(a.quat, b.quat) };
}
function poseInvPose(a) { return { pos: quatRotatePose([a.quat[0], -a.quat[1], -a.quat[2], -a.quat[3]], a.pos.map(value => -value)), quat: [a.quat[0], -a.quat[1], -a.quat[2], -a.quat[3]] }; }
function poseApplyPoint(pose, point) { return quatRotatePose(pose.quat, point).map((value, i) => value + pose.pos[i]); }
function normalizePose(pose) {
  if (!pose) return null;
  const pos = pose.pos || pose.trans || [0, 0, 0], quat = pose.quat || pose.rot || [1, 0, 0, 0];
  return { pos: pos.map(Number), quat: quat.map(Number) };
}
function potFrameOf(state, barrel) {
  const frame = state?.globals?.[barrel === 'right' ? 'wobjbarrelr' : 'wobjbarrell'];
  return frame ? normalizePose(frame.uframe || frame) : null;
}
// Shell in the pot frame (mm): inner/outer radius at a height, rim top at the
// inner pot height, horizontal rim annulus between inner and outer radius.
function potShell(cell) {
  const data = cell?.depositGrid || {};
  const lowerMm = (data.lowerRadius || POT_GEOMETRY.defaultLowerRadiusM) * 1000;
  const upperMm = (data.upperRadius || POT_GEOMETRY.defaultUpperRadiusM) * 1000;
  const heightMm = (data.potHeight || POT_GEOMETRY.defaultHeightM) * 1000;
  const innerAt = z => lowerMm + (upperMm - lowerMm) * Math.max(0, Math.min(heightMm, z)) / heightMm;
  const wallAt = z => POT_GEOMETRY.wallBottomMm - (POT_GEOMETRY.wallBottomMm - POT_GEOMETRY.wallTopMm) * Math.max(0, Math.min(heightMm, z)) / heightMm;
  const outerAt = z => innerAt(z) + wallAt(z);
  return {
    lowerMm, upperMm, heightMm,
    rimTopMm: heightMm,
    rimInnerMm: innerAt(heightMm),
    rimOuterMm: outerAt(heightMm),
    rimWidthMm: outerAt(heightMm) - innerAt(heightMm),
    floorThicknessMm: POT_GEOMETRY.floorThicknessMm,
    innerAt, outerAt,
    source: POT_GEOMETRY.source
  };
}
// Signed clearance of one pot-frame point against the pot solid (mm).
// >0 = free space, <0 = inside the steel/wall (penetration depth).
function potPointClearance(shell, local) {
  const [x, y, z] = local, r = Math.hypot(x, y);
  if (!Number.isFinite(r) || !Number.isFinite(z)) return { clearance: Infinity, region: 'invalid' };
  if (z > shell.heightMm) return { clearance: z - shell.heightMm, region: 'above-rim', r, z };
  if (z >= 0) {
    const inner = shell.innerAt(z), outer = shell.outerAt(z);
    if (r < inner) return { clearance: inner - r, region: 'cavity', r, z, innerMm: inner, outerMm: outer };
    if (r <= outer) return { clearance: -Math.min(r - inner, outer - r, shell.heightMm - z, z || Infinity), region: 'rim-wall', r, z, innerMm: inner, outerMm: outer };
    return { clearance: r - outer, region: 'outside', r, z, innerMm: inner, outerMm: outer };
  }
  const outerFloor = shell.outerAt(0);
  if (r <= outerFloor) return { clearance: -Math.min(outerFloor - r, -z), region: 'floor', r, z, innerMm: shell.innerAt(0), outerMm: outerFloor };
  return { clearance: r - outerFloor, region: 'below-outside', r, z };
}
function toolEnvelope(toolType) {
  return TOOL_ENVELOPES[toolType] || TOOL_ENVELOPE_UNION;
}
function boxSamplePoints(box) {
  const { min, max } = box, mid = min.map((value, i) => (value + max[i]) / 2), points = [mid];
  const axes = [0, 1, 2];
  for (const a of axes) for (const b of axes) {
    if (a >= b) continue;
    for (const va of [min[a], max[a]]) for (const vb of [min[b], max[b]]) {
      const point = mid.slice(); point[a] = va; point[b] = vb; points.push(point);
    }
  }
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) points.push([x, y, z]);
  return points;
}
// Whole-tool clearance at one flange pose (world mm). potFrame is the pot wobj
// uframe pose; flangePose comes from the motion event (server) or from FK of the
// sampled joint path (client mirror). Returns the worst part/sample.
function potToolClearance(shell, potFrame, flangePose, toolType) {
  const inversePot = poseInvPose(potFrame), boxes = toolEnvelope(toolType);
  let worst = { clearance: Infinity, part: null, local: null };
  for (const box of boxes) for (const point of boxSamplePoints(box)) {
    const world = poseApplyPoint(flangePose, point);
    const local = poseApplyPoint(inversePot, world);
    const result = potPointClearance(shell, local);
    if (result.clearance < worst.clearance) worst = { clearance: +result.clearance.toFixed(3), part: box.name, region: result.region, local: local.map(value => +value.toFixed(1)) };
  }
  return worst;
}
// Samples a linear joint interpolation (what the viewer renders for MoveJ /
// MoveAbsJ) so the swept body is checked, not only the end point.
function sampleJointPath(from, to, samples = 24) {
  const count = Math.max(2, Math.min(64, Math.trunc(samples) || 24)), frames = [];
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    frames.push(from.map((value, i) => value + (to[i] - value) * t));
  }
  return frames;
}
// Rim-cleanup check for the QS circle (real backup: FOR i 1..75, wobj +/i*5deg,
// tool tGripCentre_p, TCP ring radius ~1253.7/1256.1 mm, 23.3/14.1 mm below rim).
function potRimSweep(cell, { tcpLocal, steps, stepDeg, direction = 1, brush = CLEAN_BRUSH_PROXY }) {
  const shell = potShell(cell), r = Math.hypot(tcpLocal[0], tcpLocal[1]), z = tcpLocal[2];
  const belowRimMm = shell.rimTopMm - z;
  // Gap to the pot wall at the sweep height (not only to the top rim edge).
  const wallInnerMm = shell.innerAt(Math.max(0, Math.min(shell.heightMm, z))), wallOuterMm = shell.outerAt(Math.max(0, Math.min(shell.heightMm, z)));
  const distanceInnerMm = r - wallInnerMm;
  const distanceOuterMm = wallOuterMm - r;
  const insideWall = z <= shell.rimTopMm && distanceInnerMm >= 0 && distanceOuterMm >= 0;
  // Rim-top annulus [rimInner, rimOuter] defines the brush coverage target.
  const insideRimBand = r >= shell.rimInnerMm && r <= shell.rimOuterMm;
  const requiredRadiusMm = Math.max(r - shell.rimInnerMm, shell.rimOuterMm - r, 0);
  const requiredBristleMm = Math.max(0, belowRimMm);
  const angularDeg = (Number(steps) || 0) * Math.abs(Number(stepDeg) || 0);
  const coverage = {
    shell,
    tcpLocal: tcpLocal.map(value => +value.toFixed(1)),
    radiusMm: +r.toFixed(2), heightMm: +z.toFixed(2),
    belowRimMm: +belowRimMm.toFixed(2),
    distanceInnerMm: +distanceInnerMm.toFixed(2), distanceOuterMm: +distanceOuterMm.toFixed(2),
    insideRimBand, insideWall,
    direction: Math.sign(Number(direction) || 1),
    steps: Number(steps) || 0, stepDeg: Number(stepDeg) || 0, angularDeg: +angularDeg.toFixed(1),
    fullCircle: angularDeg >= 360,
    brush: { ...brush, confirmed: !!brush.confirmed },
    requiredRadiusMm: +requiredRadiusMm.toFixed(2), requiredBristleMm: +requiredBristleMm.toFixed(2),
    radiusCoverage: (brush.radiusMm || 0) >= requiredRadiusMm,
    bristleCoverage: (brush.bristleMm || 0) >= requiredBristleMm,
    coversRim: (brush.radiusMm || 0) >= requiredRadiusMm && (brush.bristleMm || 0) >= requiredBristleMm && angularDeg >= 360,
    assumption: 'QS uses a virtual cleaning TCP; CAD has no bristle brush part, so the brush dimensions are an offline proxy (unconfirmed)'
  };
  return coverage;
}
module.exports={emptyDepositState,appendDeposit,depositPoint,depositWorldPoint,surfaceHeightAt,surfaceCoordinates,followSurface,readSurfaceFeedback,POT_GEOMETRY,TOOL_ENVELOPES,TOOL_ENVELOPE_UNION,CLEAN_BRUSH_PROXY,potShell,potFrameOf,potPointClearance,potToolClearance,potRimSweep,sampleJointPath,toolEnvelope,boxSamplePoints};


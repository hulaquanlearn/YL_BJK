import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createToolMechanics} from '../src/utils/abb-tool-mechanics.mjs'
import {createCleaningBrush} from '../src/utils/abb-cleaning-brush.mjs'
import {createHydraulicLid} from '../src/utils/abb-hydraulic-lid.mjs'
import {robotCadTransforms} from '../src/utils/abb-kinematics.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'

// First actual QS orbit poses from the saved brewing backup (left/right).
// Rotate in the calibrated pot frame to sample the full orbit between moves.
const sweepJoints={
 left:[58.3057445068,36.5579450028,-16.5585017853,-29.6890223188,60.5055841971,76.3308855297],
 right:[-59.0356166460,36.0787136026,-14.6580213286,31.6415191117,55.5305183105,-75.9446334984]
}
function mountInPot(barrel){
 const s=brewingWorkcell.pots.find(p=>p.id==='pot-'+barrel)
 return new T.Matrix4().compose(new T.Vector3(...s.position),new T.Quaternion(...s.quaternion),new T.Vector3(1,1,1)).invert()
  .multiply(robotCadTransforms(sweepJoints[barrel])[6]).multiply(new T.Matrix4().makeTranslation(2.1125,2.26,0)).multiply(new T.Matrix4().makeRotationZ(-Math.PI/2))
}
async function load(type){const b=await readFile(new URL('../public/models/abb-irb6700/'+type+'.glb',import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}

for(const type of ['tool-640','tool-700'])for(const barrel of ['left','right']){
 test(type+' actual bristles contact the '+barrel+' rim throughout a full orbit',()=>{
  const brush=createCleaningBrush(type);brush.updateMatrixWorld(true)
  const fibres=brush.getObjectByName('浅色密排刷毛'),instance=new T.Matrix4(),base=new T.Vector3(),tip=new T.Vector3()
  for(let angle=0;angle<=360;angle+=5){
   const m=new T.Matrix4().makeRotationY(angle*Math.PI/180).multiply(mountInPot(barrel)).multiply(fibres.matrixWorld);let contacts=0
   for(let i=0;i<fibres.count;i++){
    fibres.getMatrixAt(i,instance);const matrix=m.clone().multiply(instance)
    base.set(0,-.5,0).applyMatrix4(matrix);tip.set(0,.5,0).applyMatrix4(matrix)
    if(base.y>=.97&&tip.y<=.97){const contact=base.clone().lerp(tip,(base.y-.97)/(base.y-tip.y)),radius=Math.hypot(contact.x,contact.z);if(radius>=1.2&&radius<=1.2752)contacts++}
   }
   // A straight strip overhangs the curved annulus at its ends. Most of the
   // actual fibres must cross the rim, not merely the TCP/proxy or one tip.
   assert.ok(contacts>fibres.count*.7,`${angle}°: ${contacts}/${fibres.count} bristles meet the rim surface`)
   // Brush metal stays above the pot; only flexible bristles cross the top.
   const rail=brush.getObjectByName('条刷金属底座'),box=new T.Box3().setFromObject(rail).applyMatrix4(new T.Matrix4().makeRotationY(angle*Math.PI/180).multiply(mountInPot(barrel)))
   assert.ok(box.min.y>.98,'metal brush seat clears the rim by at least 10mm')
  }
 })
 test(type+' clears the fully open '+barrel+' lid with 15mm margin at half-degree samples',async()=>{
  const tool=await load(type),rig=createToolMechanics(tool,type);tool.add(createCleaningBrush(type))
  const lid=createHydraulicLid();lid.rotation.y=Math.PI/2;lid.updateMatrixWorld(true)
  const obstacles=[];lid.traverse(n=>{if(n.isMesh)obstacles.push({node:n,box:new T.Box3().setFromObject(n)})})
  const tri=new T.Triangle(),mount=mountInPot(barrel)
  for(const guard of [0,1]){
   rig.setGuard(guard);tool.updateMatrixWorld(true);const boxes=[]
   tool.traverse(n=>{if(n.isMesh){n.geometry.computeBoundingBox();boxes.push({name:n.name,box:n.isInstancedMesh?new T.Box3().setFromObject(n):n.geometry.boundingBox.clone(),matrix:n.isInstancedMesh?new T.Matrix4():n.matrixWorld.clone()})}})
   for(let step=0;step<=720;step++){
    const m=new T.Matrix4().makeRotationY(step*Math.PI/360).multiply(mount)
    for(const b of boxes){const matrix=m.clone().multiply(b.matrix),expanded=b.box.clone().expandByScalar(.015),worldBox=expanded.clone().applyMatrix4(matrix)
     for(const o of obstacles){if(!worldBox.intersectsBox(o.box))continue;const transform=matrix.clone().invert().multiply(o.node.matrixWorld),p=o.node.geometry.attributes.position,idx=o.node.geometry.index
      for(let i=0;i<(idx?.count||p.count);i+=3){tri.a.fromBufferAttribute(p,idx?idx.getX(i):i).applyMatrix4(transform);tri.b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1).applyMatrix4(transform);tri.c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2).applyMatrix4(transform);assert.equal(expanded.intersectsTriangle(tri),false,`${step/2}° guard ${guard}: ${b.name} / ${o.node.name}`)}
     }
    }
   }
  }
 })
}

test('640 hopper carrying surface hides both support-deck edges without deleting the deck',async()=>{
 const tool=await load('tool-640'),rig=createToolMechanics(tool,'tool-640'),ray=new T.Raycaster()
 assert.ok(rig.deck?.parent&&rig.deck.visible);assert.ok(rig.deckShift>0)
 for(const z of [-.2785,.2785])for(let x=-.30;x<=-.08;x+=.01){
  ray.set(new T.Vector3(x,.1,z),new T.Vector3(0,1,0))
  const hits=ray.intersectObjects([rig.belt,rig.deck],true)
  assert.equal(hits[0]?.object,rig.belt,`exposed metal at x=${x},z=${z}`)
 }
 const before=rig.deck.matrixWorld.clone();rig.setBeltTravel(.5);assert.deepEqual(rig.deck.matrixWorld.elements,before.elements)
})

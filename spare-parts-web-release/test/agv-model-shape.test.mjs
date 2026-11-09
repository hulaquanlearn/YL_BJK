import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'

const boxOf=object=>{object.updateMatrixWorld(true);return new THREE.Box3().setFromObject(object)}
const span=(box,axis)=>box.max[axis]-box.min[axis]

test('AGV model follows the 1310x700x460 envelope with the operator panel on the 700 mm face',()=>{
 const {root,parts}=buildAgvModel()
 try{
  assert.deepEqual(root.userData.bodyEnvelopeMm,[1310,700,460])
  assert.deepEqual(root.userData.groundClearanceMm,15)
  assert.deepEqual(root.userData.liftStrokeMm,90)
  assert.equal(root.userData.sourceKnowledgeId,21)
  const names=parts.map(part=>part.name)
  assert.equal(names.length,15)
  assert.equal(new Set(names).size,names.length)
  for(const name of ['chassis','platform','left-cover','right-cover','operator-panel','rear-cover','drive-left','drive-right','lift','control','sensors','tpm','pickup','ekk','supercapacitor'])assert.ok(names.includes(name),name)
  const byName=Object.fromEntries(parts.map(part=>[part.name,part]))

  // Shell and platform keep the drawing's length, width and height, while the
  // platform overhang stays inside the 1310 mm envelope.
  for(const name of ['left-cover','right-cover','platform']){
   const box=boxOf(byName[name])
   assert.ok(span(box,'x')>1.27&&span(box,'x')<1.335,`${name} length ${span(box,'x')}`)
   assert.ok(span(box,'y')<.36,`${name} height ${span(box,'y')}`)
  }
  const platform=boxOf(byName.platform)
  assert.ok(platform.max.y>.44&&platform.max.y<=.461,`platform top ${platform.max.y}`)
  assert.ok(span(platform,'z')>.69&&span(platform,'z')<.71,`platform width ${span(platform,'z')}`)

  // The operator panel sits on the short +x face, not on a long side.
  const panel=boxOf(byName['operator-panel'])
  assert.ok(span(panel,'x')<.06,`panel thickness ${span(panel,'x')}`)
  assert.ok(span(panel,'z')>.6,`panel width ${span(panel,'z')}`)
  assert.ok(panel.max.x>.65&&panel.max.x<.73,`panel position ${panel.max.x}`)

  // Wheel and tyre reach the ground and stay under the 460 mm shell.
  for(const name of ['drive-left','drive-right']){
   const drive=boxOf(byName[name])
   assert.ok(drive.min.y>-.002&&drive.min.y<.01,`${name} ground ${drive.min.y}`)
   assert.ok(drive.max.y<.46,`${name} top ${drive.max.y}`)
  }

  // Nothing in the assembled model may sink below the floor plane.
  for(const part of parts){const box=boxOf(part);assert.ok(box.min.y>-.004,`${part.name} below floor ${box.min.y}`)}
 }finally{
  root.traverse(object=>{object.geometry?.dispose();if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose&&material.dispose())})
 }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildVehicleModel} from '../src/utils/agv-model-catalog.mjs'

// Offline envelope bookkeeping only. It proves what the generated geometry
// measures, not that the real vehicle matches the drawing.
const measured=(root)=>{
  root.updateMatrixWorld(true)
  const box=new THREE.Box3().setFromObject(root),size=new THREE.Vector3()
  box.getSize(size)
  return {lwh:[size.x,size.z,size.y].map(value=>+(value*1000).toFixed(1)),box}
}
const dispose=root=>root.traverse(node=>{node.geometry?.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose?.())})

test('every family records the assembled envelope it actually generates',()=>{
  for(const {family,variant} of [{family:'latent',variant:'old'},{family:'latent',variant:'new'},{family:'counterweight'},{family:'flipping'}]){
    const {root}=buildVehicleModel({family,variant})
    try{
      const {lwh}=measured(root)
      const recorded=root.userData.overallEnvelopeMm
      assert.ok(Array.isArray(recorded),`${family} needs overallEnvelopeMm`)
      assert.equal(recorded.length,3)
      for(const [index,value] of recorded.entries())assert.ok(Math.abs(value-lwh[index])<1,`${family} axis ${index}: recorded ${value} measured ${lwh[index]}`)
      assert.match(root.userData.envelopeNote,/illustrative|not verified|unverified/i)
      if(family==='latent'){
        // Documented body envelope excludes bumpers/end covers/corner units, so the
        // assembled bounds are larger; the note has to keep both numbers apart.
        // The old car has no tow loops (2026-11-03 site photos); the new car keeps
        // its documented baseline hardware.
        assert.deepEqual(root.userData.bodyEnvelopeMm,[1310,700,460])
        assert.ok(lwh[0]>1310&&lwh[0]<1420,`latent length ${lwh[0]}`)
        assert.ok(lwh[1]>700&&lwh[1]<740,`latent width ${lwh[1]}`)
        assert.equal(lwh[2],460)
        if(variant==='old'){
          assert.equal(root.userData.overallEnvelopeMm[0],1370)
          assert.match(root.userData.envelopeNote,/No towing loops/)
          assert.doesNotMatch(root.userData.envelopeNote,/towing loops and rubber bumpers extend/)
        }else{
          assert.equal(root.userData.overallEnvelopeMm[0],1387)
          assert.match(root.userData.envelopeNote,/towing loops/)
        }
      }else{
        assert.deepEqual(root.userData.overallEnvelopeMm,root.userData.bodyEnvelopeMm)
        for(const [index,value] of root.userData.bodyEnvelopeMm.entries())assert.ok(Math.abs(value-lwh[index])<1,`${family} drawing axis ${index}`)
      }
      // The bound count must not hide a part below the floor plane.
      for(const part of root.children){const box=new THREE.Box3().setFromObject(part);assert.ok(box.min.y>-.004,`${part.name} below floor`)}
    }finally{dispose(root)}
  }
})

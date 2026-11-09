import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {MeshStandardMaterial} from 'three'
import {createMaterialSurface} from '../src/utils/abb-material-surface.mjs'
const require=createRequire(import.meta.url),{createDepositGrid,depositSegment}=require('../../server/src/robot-deposit-grid')
const dimensions={lowerRadius:1.09,upperRadius:1.2,height:.97}
const state=g=>({targetHeight:g.targetHeight,depositGrid:{...g,cells:Object.fromEntries(Object.entries(g.cells).map(([k,c])=>[k,c.volume]))}})
test('material is one continuous shared-vertex surface, starts empty, and preserves partial volume',()=>{
 const g=createDepositGrid({targetHeight:800}),surface=createMaterialSurface(dimensions,new MeshStandardMaterial())
 assert.equal(surface.update(state(g)).volume,0);assert.equal(surface.mesh.visible,false);assert.equal(surface.mesh.isInstancedMesh,undefined)
 depositSegment(g,{fromU:.3,fromV:0,toU:.4,toV:0,volume:.002})
 const info=surface.update(state(g));assert.ok(Math.abs(info.volume-info.renderedVolume)<1e-8);assert.ok(info.maxHeight<.08,'thin deposit cannot become a tower')
 const positions=surface.mesh.geometry.getAttribute('position'),index=surface.mesh.geometry.index
 assert.ok(index.count>positions.count,'triangles share vertices instead of disconnected cubes')
 const before=positions.array.slice();surface.update(state(g));assert.deepEqual(positions.array,before);surface.dispose()
})
test('completed surface remains concave on both sides and conserves closed mesh volume',()=>{
 const g=createDepositGrid({targetHeight:800});depositSegment(g,{volume:g.targetVolume,fromU:-.8,toU:.8})
 const surface=createMaterialSurface(dimensions,new MeshStandardMaterial()),info=surface.update(state(g)),p=surface.mesh.geometry.getAttribute('position')
 assert.ok(Math.abs(info.renderedVolume-info.volume)<1e-6)
 const centre=p.getY(0),east=p.getY(1+31*96),west=p.getY(1+31*96+48)
 assert.ok(east>centre+.02);assert.ok(west>centre+.02);assert.ok(Math.abs(east-west)<.003)
 surface.dispose()
})

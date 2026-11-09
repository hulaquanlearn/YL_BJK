import test from 'node:test'
import assert from 'node:assert/strict'
import {createMaterialSimulation} from '../src/utils/abb-material-simulation.mjs'
import {brewingWorkcell} from '../src/utils/abb-workcell-layout.mjs'
test('switching to the right pot preserves the left; hiding the vessel or leaving program mode hides its material without erasing it',()=>{
 const m=createMaterialSimulation(brewingWorkcell.pots)
 m.setCell({barrel:'left',height:800,targetHeight:800,complete:true,signals:{}});m.update(0)
 m.setCell(null);m.update(0);assert.equal(m.inspect()[0].height,.8)
 m.setCell({barrel:'right',height:40,targetHeight:40,complete:true,signals:{}});m.update(0);assert.equal(m.inspect()[0].height,.8);assert.equal(m.inspect()[1].height,.04)
 m.update(0,{programVisible:false});assert.ok(m.inspect().every(p=>!p.visible));assert.equal(m.inspect()[0].height,.8)
 m.update(0,{programVisible:true,visiblePots:{'pot-left':false}});assert.equal(m.inspect()[0].visible,false);assert.equal(m.inspect()[1].visible,true)
 m.resetPot('right');m.update(0,{programVisible:false});assert.equal(m.inspect()[0].height,.8);assert.equal(m.inspect()[1].height,0);m.dispose()
})
test('switching pots carries the remaining shared hopper stock instead of filling it magically',()=>{
 const m=createMaterialSimulation(brewingWorkcell.pots);m.setCell({profile:'brewing-cell@1',barrel:'left',height:0,targetHeight:800,capacityLitres:90,hopperVolume:.8,hopperCapacityLitres:1130,bucketVolume:0,receiving:false,signals:{}});m.update(0)
 m.setCell(null);m.update(0);assert.deepEqual(m.hopperSnapshot(),{initialHopperLitres:800,hopperCapacityLitres:1130});m.dispose()
})

import test from 'node:test';import assert from 'node:assert/strict';
import {slotModelBounds,modelFacingRotation,modelFitScale,normalizeModelRotation} from '../src/utils/model-fit.mjs';
test('models fit dense and sparse slots and never cross the shelf centre or outside edge',()=>{
  for(const slots of [1,4,12,30,99])for(const depth of [.4,.9,1.4]){
    const sideZ=depth*.28,b=slotModelBounds({usableWidth:4.08,slots,depth,layerHeight:.74,sideZ});
    for(const size of [{x:1.69,y:.58,z:.58},{x:1.5,y:2.4,z:.8},{x:.1,y:.2,z:.3}])for(const multiplier of [.25,1,1.6,100]){
      const scale=modelFitScale(size,b,multiplier);
      assert.ok(size.x*scale<4.08/slots);assert.ok(size.y*scale<.74-.08);
      assert.ok(sideZ-size.z*scale/2>0);assert.ok(sideZ+size.z*scale/2<depth/2);
    }
  }
});
test('invalid dimensions do not yield infinite scale',()=>{
  assert.equal(modelFitScale({x:0,y:1,z:1},{width:1,height:1,depth:1}),0);
  assert.equal(modelFitScale({x:NaN,y:1,z:1},{width:1,height:1,depth:1}),0);
});
test('saved front direction faces the aisle on both shelf sides',()=>{
  const front=Math.PI/2;
  assert.equal(modelFacingRotation(front,'1'),front);
  assert.ok(Math.abs(normalizeModelRotation(modelFacingRotation(front,'2')-front)-Math.PI)<1e-10 || Math.abs(normalizeModelRotation(modelFacingRotation(front,'2')-front)+Math.PI)<1e-10);
});
test('preferred scale can enlarge a small model but remains inside the slot envelope',()=>{
  const size={x:.1,y:.1,z:.1},bounds={width:1,height:1,depth:1};
  const normal=modelFitScale(size,bounds,1),large=modelFitScale(size,bounds,1.6),extreme=modelFitScale(size,bounds,100);
  assert.ok(large>normal);
  assert.ok(size.x*extreme<=bounds.width);
});

import test from 'node:test'
import assert from 'node:assert/strict'
import {robotFlangeMatrix,robotJointLimits} from '../src/utils/abb-kinematics.mjs'
import {linearRobotPath} from '../src/utils/abb-inverse-kinematics.mjs'
import {checkedJoints,solveProgramRequest} from '../src/utils/abb-program-motion.mjs'
const limits=robotJointLimits.map(r=>r.slice());limits[4][1]=99.981;limits[5]=[-400,400]
test('J6 crosses the display zero continuously within the configured 400° bound, while actual turn counts are preserved',()=>{
 const seed=[0,0,0,0,90,359],end=[0,0,0,0,90,363],target=robotFlangeMatrix(end,limits),path=linearRobotPath(target,seed,{limits});assert.equal(path.ok,true,path.reason);assert.ok(path.frames.at(-1)[5]>362.9);assert.ok(path.frames.every((q,i)=>Math.abs(q[5]-(i?path.frames[i-1][5]:seed[5]))<5));
 assert.equal(solveProgramRequest({kind:'fk',joints:end,jointLimits:limits}).error,undefined);assert.throws(()=>checkedJoints(end));assert.throws(()=>checkedJoints([0,0,0,0,110,0],limits));assert.throws(()=>checkedJoints([0,0,0,0,90,401],limits));
});

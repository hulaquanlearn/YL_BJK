import test from 'node:test'
import assert from 'node:assert/strict'
import {annotationBatches,annotationCoverage,explanationReview,missingRoutineBatches} from '../src/utils/robot-program.mjs'
test('batches cover each readable source line exactly once and exclude binary/config files',()=>{
 const report={files:[{id:'a',kind:'program',readable:true,lineCount:301},{id:'b',kind:'program',readable:false,lineCount:10},{id:'c',kind:'config',readable:true,lineCount:20}]}
 const batches=annotationBatches(report);assert.deepEqual(batches.map(b=>[b.startLine,b.endLine]),[[1,150],[151,300],[301,301]]);assert.equal(new Set(batches.map(b=>b.key)).size,3)
})
test('coverage counts routines containing notes, never implies all source lines are explained',()=>{
 const file={id:'a',routines:[{startLine:3,endLine:6},{startLine:8,endLine:10}]}
 assert.deepEqual(annotationCoverage(file,[{fileId:'a',line:1},{fileId:'a',line:4},{fileId:'a',line:4},{fileId:'b',line:9}]),{lines:2,routines:1,totalRoutines:2})
})
test('known unsupported motion and error-path claims receive explicit review flags',()=>{
 assert.equal(explanationReview('ERROR分支不会被触发。').length,1)
 assert.equal(explanationReview('姿态接近单位四元数，与基座坐标对齐。').length,1)
 assert.deepEqual(explanationReview('WaitDI等待diReady为1；本行没有MaxTime参数。'),[])
})
test('supplement targets only routines with no notes and respects 150-line maximum',()=>{
 const file={id:'a',routines:[{startLine:2,endLine:5},{startLine:8,endLine:160}]}
 assert.deepEqual(missingRoutineBatches(file,[{fileId:'a',line:3}]).map(b=>[b.startLine,b.endLine]),[[8,157],[158,160]])
})

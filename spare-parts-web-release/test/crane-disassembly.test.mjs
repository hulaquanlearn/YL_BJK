import test from 'node:test'
import assert from 'node:assert/strict'
import {buildCraneModel,applyCranePose} from '../src/utils/crane-model.mjs'
import {craneHomePose} from '../src/utils/crane-state.mjs'
import {craneDisassemblyStages,craneDisassemblyProgress,craneDisassemblyOffset,craneDisassemblyStatus} from '../src/utils/crane-disassembly.mjs'

test('staged disassembly covers every delivered crane part once, preserving the fixed runway',()=>{
 const model=buildCraneModel(),ids=craneDisassemblyStages.flatMap(s=>s.ids)
 assert.equal(new Set(ids).size,ids.length)
 assert.deepEqual([...ids].sort(),model.parts.filter(p=>p.name!=='runway').map(p=>p.name).sort())
 for(const p of model.parts){assert.equal(craneDisassemblyOffset(p,0).length(),0);assert.equal(craneDisassemblyOffset(p,NaN).length(),0)}
 const runway=model.parts.find(p=>p.name==='runway');assert.equal(craneDisassemblyOffset(runway,1).length(),0)
})
test('one stage moves at a time and reversing the slider restores the same assembly positions',()=>{
 const n=craneDisassemblyStages.length
 for(let index=0;index<n;index++){
  const amount=(index+.5)/n
  for(let s=0;s<n;s++)for(const id of craneDisassemblyStages[s].ids){
   const progress=craneDisassemblyProgress(id,amount)
   assert.ok(Math.abs(progress-(s<index?1:s>index?0:.5))<1e-10,`${index}: ${id}`)
  }
 }
 const model=buildCraneModel();applyCranePose(model,craneHomePose())
 const original=model.parts.map(p=>p.position.toArray()),old=new Map()
 for(const amount of [0,.15,.5,.85,1,.85,.5,.15,0]){
  for(const part of model.parts)if(old.has(part))part.position.sub(old.get(part))
  applyCranePose(model,craneHomePose())
  for(const part of model.parts){const offset=craneDisassemblyOffset(part,amount);part.position.add(offset);old.set(part,offset)}
 }
 assert.deepEqual(model.parts.map(p=>p.position.toArray()),original)
})
test('the status follows disassembly and reverse assembly, including end states',()=>{
 assert.equal(craneDisassemblyStatus(0),'已组装')
 assert.match(craneDisassemblyStatus(.5),/^拆解：/)
 assert.match(craneDisassemblyStatus(.5,true),/^装回：/)
 assert.equal(craneDisassemblyStatus(1),'拆解完成 · 轨道与立柱保留原位')
})

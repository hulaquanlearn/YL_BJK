import test from 'node:test'
import assert from 'node:assert/strict'
import {abbTechnicalSections,abbManual,pendantCourses,pendantHardware,advancePendantLesson} from '../src/utils/abb-guide.mjs'

test('each pendant lesson requires its current action, completes and stays bounded',()=>{
 assert.equal(new Set(pendantCourses.map(c=>c.id)).size,7)
 for(const course of pendantCourses){
  let index=0
  assert.ok(course.chapters.length&&course.summary)
  for(const step of course.steps){
   assert.ok(step.detail&&step.result)
   assert.ok(step.choices.includes(step.action))
   assert.equal(advancePendantLesson(course,index,'unrelated-action'),index,'cannot skip current step')
   index=advancePendantLesson(course,index,step.action)
  }
  assert.equal(index,course.steps.length)
  assert.equal(advancePendantLesson(course,index,'确定'),index,'finished lesson remains finished')
 }
})

test('technical guidance covers the exact variant, two tools and controller-specific source',()=>{
 assert.equal(abbManual.number,'3HAC050941-010')
 assert.equal(abbManual.version,'RobotWare 6.08')
 assert.deepEqual(abbTechnicalSections.map(s=>s.id),['spec','axes','frames','tools','documents'])
 for(const section of abbTechnicalSections){assert.ok(section.source);assert.ok(section.items.length>=3)}
 assert.equal(pendantHardware.length,5)
 const enable=pendantHardware.find(k=>k.id==='enable').text
 assert.match(enable,/中间/);assert.match(enable,/完全压到底/);assert.match(enable,/不启动/)
})

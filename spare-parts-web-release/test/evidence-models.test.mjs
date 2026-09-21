import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEvidenceModel, warehouseModelUrl, evidenceModels } from '../src/utils/evidence-models.mjs'
test('requires exact manufacturer and full model',()=>{
  assert.ok(resolveEvidenceModel({materialDesc:'明纬,开关电源,NDR-240-24'}))
  for(const name of ['其他,NDR-240-24','明纬,NDR-240-48','明纬,NDR-240-24X','明纬,NDR-240-24-C','明纬,NDR-240-24 安装扣','明纬,替代 NDR-240-24']) assert.equal(resolveEvidenceModel({name}),null)
})
test('ambiguous catalog cannot select first',()=>{
  assert.equal(resolveEvidenceModel({name:'明纬 NDR-240-24'},[...evidenceModels,...evidenceModels]),null)
})
test('bearing suffix and stainless prefix must not be dropped',()=>{
  assert.ok(resolveEvidenceModel({name:'SKF 深沟球轴承 6006-2Z'}))
  for(const name of ['SKF 6006-2Z/VA208','SKF W 6006-2Z','SKF 6006-2Z C3']) assert.equal(resolveEvidenceModel({name}),null)
})
test('warehouse selects low detail and blocks known wrong shapes',()=>{
  assert.match(warehouseModelUrl({name:'明纬 NDR-240-24'}),/-low.glb$/)
  assert.equal(warehouseModelUrl({name:'断路器 1P',categoryModelUrl:'/models/categories/circuit-breaker.glb'}),'')
  assert.equal(warehouseModelUrl({name:'电机保护断路器 GV2-ME06C',categoryModelUrl:'/models/categories/motor.glb'}),'')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLedger, reviewPart, fingerprint } from './ledger.mjs'
const header = '物料编码\t名称\t品牌\t型号类别\t规格\n'
test('preserves codes and quoted multiline names, normalizes missing values',()=>{
  const [part] = parseLedger('\uFEFF'+header+'001\t"名称\n两行"\tNULL\tNULL\t"a""b"\n')
  assert.equal(part.code,'001'); assert.equal(part.brand,''); assert.equal(part.name,'名称\n两行'); assert.equal(part.spec,'a"b')
})
test('rejects duplicates and malformed records',()=>{
  assert.throws(()=>parseLedger(header+'1\ta\tb\tc\td\n1\ta\tb\tc\td'))
  assert.throws(()=>parseLedger(header+'1\t"a'))
  assert.throws(()=>parseLedger(header+'1\ta'))
})
test('specific structures override broad words',()=>{
  for(const [name,family] of [['电机保护断路器 GV2-ME06C','motor-protector'],['小型断路器 1P C10A','breaker-1p'],['NSK 带座轴承 UCP213','bearing-unit'],['液压缸','hydraulic-unit'],['辅助触头 接触器附件','auxiliary-contact']]) {
    assert.equal(reviewPart({name,spec:'',brand:'',existingCategory:''}).family,family)
  }
})
test('flags unsafe existing association and invalidates changed specifications',()=>{
  const part={code:'1',name:'断路器 1P',brand:'施耐德',spec:'C10A',existingCategory:'断路器3P'}
  assert.ok(reviewPart(part).issues.some(i=>i.includes('不符')))
  assert.notEqual(fingerprint(part),fingerprint({...part,spec:'C16A'}))
})

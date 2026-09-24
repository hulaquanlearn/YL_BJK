import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeIssues } from '../src/inspection-merge.mjs'

test('merging reactive issue proxies preserves both descriptions, advice, remarks and photo links', () => {
  const first={id:'a',segment:'制曲',location:'一楼',equipment:'A1',problem:'门松动',category:'设备',rectification:'固定门',remarks:'已报班长',rawText:'原话甲',pairingReason:'位置甲',missingInfo:'',duplicateHint:'',sourceIds:[1],photos:[{sourceId:1,rect:{x:0,y:0,w:.2,h:.2}}],reviewStatus:'confirmed',confirmToken:'old'}
  const second={id:'b',segment:'制曲',location:'二楼',equipment:'B2',problem:'管道漏水',category:'设备',rectification:'停机检查',remarks:'待复测',rawText:'原话乙',pairingReason:'位置乙',missingInfo:'照片待核',duplicateHint:'',sourceIds:[2],photos:[{sourceId:2,rect:{x:.2,y:.2,w:.2,h:.2}}],reviewStatus:'pending'}
  const reactiveLike=[new Proxy(first,{}),new Proxy(second,{})]
  const merged=mergeIssues(reactiveLike,[0,1])
  assert.equal(merged.length,1)
  assert.match(merged[0].problem,/门松动[\s\S]*管道漏水/)
  assert.match(merged[0].rectification,/固定门[\s\S]*停机检查/)
  assert.match(merged[0].remarks,/已报班长[\s\S]*待复测/)
  assert.deepEqual(merged[0].sourceIds,[1,2])
  assert.deepEqual(merged[0].photos.map(photo=>photo.sourceId),[1,2])
  assert.equal(merged[0].reviewStatus,'pending')
  assert.equal(merged[0].confirmToken,undefined)
  assert.equal(first.problem,'门松动','source is left intact for cancel or undo')
})

test('oversized conflict refuses merge without modifying either record', () => {
  const rows=[{id:'a',problem:'甲'.repeat(1900),photos:[],sourceIds:[]},{id:'b',problem:'乙'.repeat(1900),photos:[],sourceIds:[]}]
  assert.throws(()=>mergeIssues(rows,[0,1]),/超过2000字/)
  assert.equal(rows.length,2)
  assert.equal(rows[1].problem.length,1900)
})

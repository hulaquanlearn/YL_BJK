import test from 'node:test'
import assert from 'node:assert/strict'
import {fireMobileAssets,firePrintableAssets,fireSearchEntries} from '../src/utils/fire-inspection.mjs'
const points=[{id:1,matchedAssetIds:[11],assets:[{id:11,code:'005',quantity:1,status:'active'},{id:12,code:'006',quantity:1,status:'active'}]}]
test('App list and printed QR labels both omit unmatched siblings',()=>{
 assert.deepEqual(fireMobileAssets(points).map(e=>e.asset.id),[11])
 assert.deepEqual(firePrintableAssets(points).map(e=>e.asset.id),[11])
})
test('web overview exact codes take precedence over location numbers and preserve leading zeroes',()=>{
 const all=[{id:1,assets:[{id:11,code:'005'},{id:12,code:'006'}]},{id:2,location:'005号通道',assets:[{id:21,code:'105'}]}]
 assert.deepEqual(fireSearchEntries(all,'００５').map(e=>e.asset.id),[11])
 assert.deepEqual(fireSearchEntries(all,'5').map(e=>e.asset.id),[11,21])
 assert.equal(fireSearchEntries(all,'').length,3)
})

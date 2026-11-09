import test from 'node:test'
import assert from 'node:assert/strict'
import { fireAssetQrLink, fireLabelHtml, fireMobileAssets, firePrintableAssets, resolveFireScan } from '../src/utils/fire-inspection.mjs'

test('completed devices are ordered by latest inspection across points before pagination', () => {
  const checked = (id, lastCheckedAt) => ({ id, lastCheckedAt, inspectionStatus: 'checked' })
  const points = [
    { assets: [checked(1, '2026-11-07T02:00:00Z'), checked(2, null)] },
    { assets: [checked(3, '2026-11-07T03:00:00Z')] }
  ]
  assert.deepEqual(fireMobileAssets(points, 'checked').map(({ asset }) => asset.id), [3, 1, 2])
})

const assets=[{id:11,name:'灭火器',code:'重复编号',quantity:1,status:'active',inspectionStatus:'checked'},{id:12,name:'灭火器',code:'重复编号',quantity:1,status:'active',inspectionStatus:'pending'}]

test('mobile pending and completed tabs keep individual status at a partly checked point',()=>{
  const point={id:9,status:'pending',assets}
  assert.deepEqual(fireMobileAssets([point],'pending').map(e=>e.asset.id),[12])
  assert.deepEqual(fireMobileAssets([point],'checked').map(e=>e.asset.id),[11])
  assert.equal(point.status,'pending')
})







test('stable item QR links distinguish duplicate business codes and strictly validate both IDs',()=>{
  const origin='https://czsdsg.cn',first=fireAssetQrLink(origin,9,11),second=fireAssetQrLink(origin,9,12)
  assert.notEqual(first,second)
  assert.equal(first,origin+'/fire-inspection?point=9&asset=11')
  assert.deepEqual(resolveFireScan(first,origin),{pointId:'9',assetId:'11'})
  assert.deepEqual(resolveFireScan(fireAssetQrLink(origin,9),origin),{pointId:'9'})
  for(const query of ['point=9&asset=11&asset=12','point=9&asset=0','point=9&asset=-1','point=9&asset=1.2','point=9&asset=','point=9&asset=11&redirect=https://evil.test','point=9&asset=11#submit','point=9&asset=9007199254740999','point=9%2F10&asset=11'])assert.throws(()=>resolveFireScan(origin+'/fire-inspection?'+query,origin),undefined,query)
  assert.throws(()=>resolveFireScan('https://evil.test/fire-inspection?point=9&asset=11',origin))
})

test('batch physical labels preserve every instance but exclude unconfigured, unknown and retired placeholders',()=>{
  const points=[{id:9,assets:[...assets,{id:13,type:'hydrant',quantity:1,status:'active'},{id:14,quantity:0,status:'unconfigured'},{id:15,quantity:null,status:'active'},{id:16,quantity:2,status:'active'},{id:17,quantity:1,status:'retired'}]}]
  assert.deepEqual(firePrintableAssets(points).map(item=>item.asset.id),[11,12,13])
  assert.deepEqual(firePrintableAssets(points,'hydrant').map(item=>item.asset.id),[13])
  assert.equal(points[0].assets.length,7)
})

test('print labels escape all imported text and accept only embedded QR pixels',()=>{
  const html=fireLabelHtml([{qr:'data:image/png;base64,YQ==',name:'灭火器<script>alert(1)</script>',code:'"编号<&',location:'一楼<img src=x onerror=alert(1)>'}])
  assert.match(html,/&lt;script&gt;/)
  assert.match(html,/&lt;img src=x/)
  assert.doesNotMatch(html,/<script|<img src=x|src="https?:/)
  assert.match(html,/一物一码/)
  assert.match(html,/消防器材标签 · 1 张/)
  assert.throws(()=>fireLabelHtml([{qr:'https://evil.test/image.png'}]),/二维码图片无效/)
})

test('inspected list contains normal records while the abnormal sibling stays in rectification',()=>{const points=[{id:1,hasIssue:true,assets:[{id:1,inspectionStatus:'checked',inspectionResult:'normal'},{id:2,inspectionStatus:'checked',inspectionResult:'abnormal'},{id:3,inspectionStatus:'pending'}]}];assert.deepEqual(fireMobileAssets(points,'checked').map(e=>e.asset.id),[1]);assert.deepEqual(fireMobileAssets(points,'pending').map(e=>e.asset.id),[3]);});

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {modelDisplayStatus} from '../src/utils/model-display-status.mjs'
import {stockHealth} from '../src/utils/stock-health.mjs'
test('binding status explains the actual outcome for missing, pending and observable files',()=>{
 assert.equal(modelDisplayStatus({modelUrl:null}).key,'missing')
 assert.equal(modelDisplayStatus({modelUrl:'  '}).key,'missing')
 assert.equal(modelDisplayStatus({modelUrl:'/models/ledger-20261008/13.glb'}).key,'pending')
 assert.match(modelDisplayStatus({modelUrl:'/models/ledger-20261008/13.glb'}).description,/定位标记/)
 assert.equal(modelDisplayStatus({modelUrl:'/uploads/part-models/new.glb'}).key,'ready')
})
test('warehouse and inventory share stock thresholds including unconfigured positive stock',()=>{
 for(const [part,key] of [[{totalStock:5,reorderPoint:null},'unconfigured'],[{totalStock:5,reorderPoint:''},'unconfigured'],[{totalStock:0,reorderPoint:null},'zero'],[{totalStock:.5,reorderPoint:1},'low'],[{totalStock:1,reorderPoint:1},'low'],[{totalStock:2,reorderPoint:1},'normal']])assert.equal(stockHealth(part).key,key)
 const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8');assert.match(source,/:type="stockHealth\(selectedPart\).type"/)
})
test('standalone model previews allow bottom inspection while the stage retains its floor limit',()=>{
 const preview=fs.readFileSync(new URL('../src/components/ModelPreview.vue',import.meta.url),'utf8'),library=fs.readFileSync(new URL('../src/views/ModelLibrary.vue',import.meta.url),'utf8')
 assert.match(preview,/controls.maxPolarAngle=props.objectOnly\?Math.PI:Math.PI\*\.49/)
 assert.match(library,/<ModelPreview :model-url="previewDialog.modelUrl"[^>]+object-only/)
 assert.match(library,/:allow-unreviewed="categoryDialog.inspectLegacy \|\| categoryReviewActive"/)
})

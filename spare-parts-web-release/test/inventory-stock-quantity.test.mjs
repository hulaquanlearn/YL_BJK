import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parseStockQuantity, stockQuantityStep } from '../src/utils/stock-quantity.mjs'

test('movement quantities support fractions without coercing blank, zero or excess precision',()=>{
  assert.equal(parseStockQuantity(.5,{available:.6}),.5)
  assert.equal(parseStockQuantity(.0001),.0001)
  assert.equal(parseStockQuantity('1.2300'),1.23)
  assert.equal(stockQuantityStep('米'),.1)
  assert.equal(stockQuantityStep('个'),1)
  for(const bad of [null,undefined,'',' ',false,NaN,Infinity,0,-1])assert.throws(()=>parseStockQuantity(bad))
  assert.throws(()=>parseStockQuantity(.7,{available:.6}),/库存/)
  assert.throws(()=>parseStockQuantity(.00001),/4位/)
  assert.throws(()=>parseStockQuantity(1000000),/超过/)
})

const source=fs.readFileSync(new URL('../src/views/Inventory.vue',import.meta.url),'utf8')
test('single and batch submit use validated decimal quantities and never submit an empty row',async()=>{
  const payloads=[],warnings=[],confirmations=[]
  const s={parseStockQuantity,stockError:{value:''},movementReasonsLoading:{value:false},movementReasonsError:{value:''},stockPart:{value:{_id:'demo',unit:'米',totalStock:.6}},stockForm:{type:'out',quantity:.5,reasonCode:'other_out'},stockSubmitting:{value:false},stockVisible:{value:true},ElMessage:{warning:m=>warnings.push(m),success(){}},ElMessageBox:{confirm:async m=>confirmations.push(m)},updateStock:async(id,payload)=>payloads.push({id,payload}),load:async()=>{},loadDashboard:async()=>{},batchRows:{value:[{_id:'demo',unit:'米',totalStock:.6,quantity:null}]},batchForm:{type:'out',reasonCode:'other_out'},batchSubmitting:{value:false},batchVisible:{value:true},batchUpdateStock:async p=>payloads.push(p),clearSelection(){}}
  vm.createContext(s)
  vm.runInContext(source.slice(source.indexOf('async function submitStock()'),source.indexOf('\nfunction openBatch()')),s)
  vm.runInContext(source.slice(source.indexOf('async function submitBatch()'),source.indexOf('\nwatch(query,')),s)
  await s.submitStock();assert.equal(payloads[0].payload.quantity,.5);assert.match(confirmations[0],/0\.5 米/)
  await s.submitBatch();assert.equal(payloads.length,1);assert.match(warnings.at(-1),/数量/)
  s.batchRows.value[0].quantity=.25;await s.submitBatch();assert.equal(payloads[1].items[0].quantity,.25)
})

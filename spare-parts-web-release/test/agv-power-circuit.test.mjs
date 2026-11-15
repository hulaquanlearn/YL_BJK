import test from 'node:test'
import assert from 'node:assert/strict'
import {powerCircuitFor,connectionsForPart,powerPartDescriptions} from '../src/utils/agv-power-circuit.mjs'
test('power conversion and storage are separate branches with their real diagram endpoints',()=>{
 const circuit=powerCircuitFor('old'),edges=circuit.connections,find=id=>edges.find(e=>e.id===id)
 assert.deepEqual(find('pickup-one').to,['tpm','X21']);assert.deepEqual(find('pickup-two').to,['tpm','X31'])
 assert.equal(find('bus-supply').from[0],'power-bus');assert.equal(find('bus-ekk').from[0],'power-bus')
 assert.deepEqual(find('bus-ekk').to,['ekk','X1501']);assert.deepEqual(find('storage-power').from,['ekk','X2361'])
 assert.equal(find('storage-power').to[0],'supercapacitor');assert.equal(find('storage-monitor').kind,'monitor')
 assert.notEqual(find('storage-power').cable,find('storage-monitor').cable)
 assert.equal(new Set(edges.map(e=>e.id)).size,edges.length)
 assert.ok(!edges.some(e=>e.from[0]==='dcdc'&&e.to[0]==='ekk'),'storage must not be placed after the 48V load supply')
})
test('each variant retains its own original circuit and controller is separate from storage',()=>{
 for(const [variant,source]of [['old',20],['new',26]]){
  const circuit=powerCircuitFor(variant);assert.ok(circuit.referenceKnowledgeIds.includes(source));assert.ok(!circuit.referenceKnowledgeIds.includes(source===20?26:20))
  assert.equal(circuit.terminations.length,2);assert.ok(connectionsForPart('plc',variant).some(c=>c.from[0]==='ekk'))
 }
 assert.match(powerPartDescriptions.ekk,/EKK超级电容管理器/);assert.match(powerPartDescriptions.supercapacitor,/EKS超级电容/)
 assert.throws(()=>powerCircuitFor('invalid'))
})

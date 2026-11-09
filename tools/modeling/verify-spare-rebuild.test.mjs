import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {inspectGeometry} from './verify-spare-rebuild.mjs'
import catalog from '../../spare-parts-web-release/src/utils/reviewed-model-catalog.json' with {type:'json'}
const original=await fs.readFile(new URL('../../spare-parts-web-release/public'+catalog.models.find(m=>m.id===22).url,import.meta.url))
function mutateDocument(change){
 const length=original.readUInt32LE(12),document=JSON.parse(original.subarray(20,20+length).toString('utf8'))
 change(document)
 const encoded=Buffer.from(JSON.stringify(document)),size=Math.ceil(encoded.length/4)*4,json=Buffer.alloc(size,32);encoded.copy(json)
 const header=Buffer.from(original.subarray(0,20)),tail=original.subarray(20+length)
 header.writeUInt32LE(20+size+tail.length,8);header.writeUInt32LE(size,12)
 return Buffer.concat([header,json,tail])
}
test('geometry acceptance ignores metadata while detecting an actual vertex move',async()=>{
 const before=await inspectGeometry(original)
 const cosmetic=mutateDocument(document=>{document.asset.extras={review:'a new export is not a geometry rebuild'};document.nodes[0].name='renamed'})
 assert.equal((await inspectGeometry(cosmetic)).fingerprint,before.fingerprint)
 const changed=Buffer.from(original),document=JSON.parse(changed.subarray(20,20+changed.readUInt32LE(12)).toString('utf8'))
 const accessor=document.accessors[document.meshes[0].primitives[0].attributes.POSITION],view=document.bufferViews[accessor.bufferView]
 assert.equal(accessor.componentType,5126)
 const offset=20+changed.readUInt32LE(12)+8+(view.byteOffset||0)+(accessor.byteOffset||0)
 changed.writeFloatLE(changed.readFloatLE(offset)+0.002,offset)
 assert.notEqual((await inspectGeometry(changed)).fingerprint,before.fingerprint)
})
test('geometry acceptance includes parent transforms in world space',async()=>{
 const moved=mutateDocument(document=>{const node=document.nodes[0];if(node.matrix)node.matrix[12]+=0.01;else node.translation=[(node.translation?.[0]||0)+0.01,node.translation?.[1]||0,node.translation?.[2]||0]})
 assert.notEqual((await inspectGeometry(moved)).fingerprint,(await inspectGeometry(original)).fingerprint)
})

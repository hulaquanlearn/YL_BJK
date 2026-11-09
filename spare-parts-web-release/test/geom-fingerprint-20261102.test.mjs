// Geometry fingerprint must be sensitive to vertex positions and node transforms,
// not just indices/normals or binary metadata.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js'
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'

globalThis.FileReader??=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}}
async function load(url){
 const bytes=await fs.readFile(new URL('../public'+url,import.meta.url))
 const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 scene.updateMatrixWorld(true)
 return {bytes:GLOBAL_VIEW(bytes),scene}
}
function GLOBAL_VIEW(bytes){return bytes}
async function exportScene(scene){
 const bytes=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}))
 return bytes
}
test('fingerprint changes when only a vertex moves or a node transform changes',async()=>{
 const {bytes,scene}=await load('/models/named-20261009/168.glb')
 const original=geometryFingerprint(bytes)
 // 1) Move a single vertex position.
 const movedScene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 let movedMesh=null
 movedScene.traverse(node=>{if(node.isMesh&&!movedMesh)movedMesh=node})
 const attribute=movedMesh.geometry.attributes.position
 attribute.setX(0,attribute.getX(0)+0.01)
 attribute.needsUpdate=true
 movedMesh.geometry.computeBoundingBox();movedMesh.geometry.computeBoundingSphere()
 const movedBytes=await exportScene(movedScene)
 assert.notEqual(geometryFingerprint(movedBytes),original,'vertex move must change fingerprint')
 // 2) Change only a node transform.
 const transformedScene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
 transformedScene.children[0].position.x+=1
 transformedScene.updateMatrixWorld(true)
 const transformedBytes=await exportScene(transformedScene)
 assert.notEqual(geometryFingerprint(transformedBytes),original,'node transform must change fingerprint')
 // 3) Same file remains identical.
 assert.equal(geometryFingerprint(bytes),original)
})

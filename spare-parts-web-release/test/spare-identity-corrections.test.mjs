import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import fingerprints from './fixtures/model-baseline-fingerprints.json' with {type:'json'}
import catalog from '../src/utils/reviewed-model-catalog.json' with {type:'json'}
import corrections from '../../docs/SPARE_IDENTITY_CORRECTIONS_20261103.json' with {type:'json'}
import {geometryFingerprint} from '../../tools/modeling/glb-geometry-fingerprint.mjs'
async function load(id){const entry=catalog.models.find(m=>m.id===id),bytes=await fs.readFile(new URL('../public'+entry.url,import.meta.url)),scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene,meshes=[];scene.traverse(n=>{if(n.isMesh)meshes.push(n)});return{entry,bytes,scene,meshes}}
test('22216 EK is an open double-row spherical roller bearing with a tapered bore, never a mounted housing',async()=>{
 const s=await load(88),names=s.meshes.map(m=>m.userData.observation.name),size=new T.Box3().setFromObject(s.scene).getSize(new T.Vector3());
 assert.ok(Math.abs(size.x-.140)<1e-6&&Math.abs(size.z-.033)<1e-6);assert.ok(names.includes('1:12锥孔内圈'));assert.equal(names.filter(n=>n==='双列鼓形滚子').length,36);assert.doesNotMatch(names.join('|'),/底座|座体|油嘴|紧定螺钉|密封/);
 const inner=s.meshes.find(m=>m.userData.observation.id==='inner'),positions=inner.geometry.attributes.position,radii=[];for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);radii.push(Math.hypot(x,z))}assert.ok(Math.min(...radii)<.04001);assert.match(s.entry.note,/505019291/);assert.match(s.entry.note,/22216/);
});
test('sixteen corrected models have real geometry changes, complete observations and explicit source limits',async()=>{
 for(const row of corrections.items){const {entry,bytes,meshes}=await load(row.id);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.notEqual(entry.sha256,row.before);assert.equal(entry.meshCount,meshes.length);assert.equal(entry.partCount,new Set(meshes.map(m=>m.userData.observation.id)).size);
  const old=fingerprints.identity[row.id];assert.ok(old);assert.notEqual(geometryFingerprint(bytes),old);for(const m of meshes){assert.ok(m.userData.observation.description);assert.ok(m.geometry.attributes.normal)}assert.ok(entry.source.type);
 }
});
test('category-specific parts replace fabricated generic DIN, PCB and shaft features',async()=>{
 const required={8:['接触器联动推杆','触点接线端'],38:['测量叶片','探测转轴'],39:['高压取压口','低压取压口'],40:['通风金属护罩','同轴输入接口'],41:['E形磁芯与取能槽'],60:['过程引压接口'],76:['薄膜面板','柔性引出排线'],79:['内置天线防护外壳','底部双以太网接口'],142:['电缆绝缘护套'],154:['玻璃钢吊杆'],171:['直型安全开关操作件'],180:['除尘器弹性圈'],183:['磁棒不锈钢外管'],194:['补偿盒封闭壳体'],195:['继电器插接座']};
 for(const[id,parts]of Object.entries(required)){const s=await load(Number(id)),names=s.meshes.map(m=>m.userData.observation.name);for(const part of parts)assert.ok(names.includes(part),id+': '+part);assert.doesNotMatch(names.join('|'),/DIN卡扣|PLC|前连接器|迷宫密封|轴键槽/);if(Number(id)!==39)assert.doesNotMatch(names.join('|'),/数显窗口|拨码/)}
 const s=await load(183),size=new T.Box3().setFromObject(s.scene).getSize(new T.Vector3());assert.ok(Math.abs(size.y-.032)<1e-6);assert.ok(size.x>=.730&&size.x<.735);
});

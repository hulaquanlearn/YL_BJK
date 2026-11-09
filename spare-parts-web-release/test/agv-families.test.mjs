import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildVehicleModel,modelTitle} from '../src/utils/agv-model-catalog.mjs'
import {electricalCatalog} from '../src/utils/agv-electrical.mjs'
import {groupsFor,presentationOffset} from '../src/utils/agv-presentation.mjs'
test('each family has distinct assemblies, finite geometry, matching manual and electrical source',()=>{
 for(const [family,source,circuit] of [['latent',21,20],['counterweight',14,24],['flipping',13,25]]){
  const {root,parts}=buildVehicleModel({family});assert.equal(root.userData.sourceKnowledgeId,source);assert.equal(electricalCatalog('old',family).source.knowledgeId,circuit);assert.equal(new Set(parts.map(x=>x.name)).size,parts.length);assert.ok(parts.some(x=>x.name==='chassis'));
  for(const part of parts){assert.equal(part.parent,root);assert.ok(part.userData.label);assert.ok(part.userData.description);assert.ok(presentationOffset(part).every(Number.isFinite));if(part.name!=='chassis')assert.ok(presentationOffset(part).some(x=>Math.abs(x)>.01),part.name+' must visibly separate');const b=new THREE.Box3().setFromObject(part);assert.ok(!b.isEmpty());assert.ok([...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));}
  for(const part of parts)assert.ok(groupsFor(family).some(g=>g.parts.includes(part.name)),part.name+' needs a functional group');
  if(family!=='latent'){assert.ok(parts.some(p=>p.name==='battery'));assert.ok(!parts.some(p=>['ekk','pickup','supercapacitor'].includes(p.name)));assert.equal(parts.some(p=>p.name==='rotation'),family==='flipping');}
  root.traverse(x=>{x.geometry?.dispose();if(x.material)(Array.isArray(x.material)?x.material:[x.material]).forEach(m=>m.dispose())});
 }
 assert.equal(modelTitle('latent','old'),'潜伏式AGV（老）');assert.equal(modelTitle('latent','new'),'潜伏式AGV（新）');
});
test('all drawing page links fit the selected original and flipping keeps its distinct rotation-control drawing',()=>{
 for(const family of ['latent','counterweight','flipping'])for(const variant of ['old','new']){const c=electricalCatalog(variant,family);for(const g of c.groups)for(const p of g.pages)assert.ok(p.n>=1&&p.n<=c.source.pages);}
 assert.ok(electricalCatalog('old','flipping').groups.find(g=>g.id==='drive').pages.some(p=>p.n===13&&p.title.includes('翻转')));
 assert.ok(!electricalCatalog('old','counterweight').groups.find(g=>g.id==='drive').pages.some(p=>p.title.includes('翻转')));
});

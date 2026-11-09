import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildAgvModel} from '../src/utils/agv-model.mjs'
import {functionalGroups,explodedOffset,toggleRestored,createPartHighlighter,layoutAgvLabels} from '../src/utils/agv-presentation.mjs'
import {electricalCatalog} from '../src/utils/agv-electrical.mjs'
test('all assemblies separate, can be restored individually or by function, with no disappearing parts',()=>{
 const {parts}=buildAgvModel({variant:'new'});let restored=new Set()
 for(const p of parts)if(p.name!=='chassis')assert.ok(explodedOffset(p.name).some(n=>n!==0),p.name)
 restored=toggleRestored(restored,['lift']);assert.ok(restored.has('lift'));assert.ok(!restored.has('platform'))
 const group=functionalGroups.find(g=>g.id==='power');restored=toggleRestored(restored,group.parts);assert.ok(group.parts.every(id=>restored.has(id)));restored=toggleRestored(restored,group.parts);assert.ok(group.parts.every(id=>!restored.has(id)));assert.ok(restored.has('lift'))
});
test('part glow changes the selected geometry material without leaking through shared materials, and restores on deselect',()=>{
 const root=new THREE.Group(),shared=new THREE.MeshStandardMaterial({color:0xff8800}),a=new THREE.Group(),b=new THREE.Group();a.name='a';b.name='b';const meshA=new THREE.Mesh(new THREE.BoxGeometry(),shared),meshB=new THREE.Mesh(new THREE.BoxGeometry(),shared);a.add(meshA);b.add(meshB);root.add(a,b);const glow=createPartHighlighter([a,b]);glow.select(['a']);assert.notEqual(meshA.material,shared);assert.notEqual(meshB.material,shared);assert.equal(meshB.material.transparent,true);assert.equal(meshB.material.depthWrite,false);assert.ok(meshB.material.opacity<.3);assert.ok(meshA.material.emissiveIntensity>0);assert.equal(meshA.material.color.getHex(),0x46c96b);assert.equal(meshA.material.emissive.getHex(),0x169c43);assert.equal(shared.emissive.getHex(),0);assert.equal(shared.transparent,false);glow.select(['b']);assert.equal(meshA.material.transparent,true);assert.notEqual(meshB.material,shared);glow.dispose();assert.equal(meshB.material,shared);assert.equal(meshA.material,shared);
});
test('both vehicle types keep all assembly labels on screen, with no vertically overlapping labels in each rail',()=>{
 for(const variant of ['old','new'])for(const [width,height] of [[1160,650],[350,510]]){
  const {parts}=buildAgvModel({variant});const labels=layoutAgvLabels(parts.map((p,i)=>({id:p.name,text:p.userData.label,x:width*.5+Math.sin(i)*width*.3,y:height*.5+Math.cos(i)*height*.2})),width,height)
  assert.equal(labels.length,parts.length);assert.equal(new Set(labels.map(l=>l.id)).size,parts.length)
  for(const l of labels){assert.ok(l.x>=0&&l.y>=0&&l.x+l.width<=width&&l.y+l.height<=height);assert.ok(l.text)}
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(labels[i].x===labels[j].x)assert.ok(Math.abs(labels[i].y-labels[j].y)>=36)
 }
});
test('old and new models reference separate electrical sources and new drive assemblies rather than relabeling one circuit',()=>{
 const old=buildAgvModel(),latest=buildAgvModel({variant:'new'});assert.equal(old.root.userData.electricalKnowledgeId,20);assert.equal(latest.root.userData.electricalKnowledgeId,26);assert.ok(!old.parts.some(p=>p.name==='kinco-left'));assert.ok(latest.parts.some(p=>p.name==='kinco-left'));assert.equal(electricalCatalog('old').source.knowledgeId,20);assert.equal(electricalCatalog('new').source.knowledgeId,26);assert.match(electricalCatalog('new').groups.find(g=>g.id==='drive').pages[1].title,/抱闸/);assert.doesNotMatch(electricalCatalog('old').groups.find(g=>g.id==='drive').pages[1].title,/抱闸/);
});


import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
import {FreeModelControls as OrbitControls} from '../src/utils/free-model-controls.mjs'
import {ref,computed} from 'vue'
import {buildAgvModel} from '../src/utils/agv-model.mjs'
import {functionalGroups,groupsFor,presentationOffset,latentDescriptions,toggleRestored,createPartHighlighter,layoutAgvLabels} from '../src/utils/agv-presentation.mjs'
import {buildVehicleModel,modelTitle} from '../src/utils/agv-model-catalog.mjs'
import * as workbench from '../src/utils/agv-workbench.mjs'
test('component selection restores matching parts and highlights their own material',()=>{
 const source=fs.readFileSync(new URL('../src/components/agv/AgvModelViewer.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
 const context=vm.createContext({...workbench,useModelFullscreen:()=>({fullscreen:ref(false),toggle(){},close:async()=>{}}),THREE,OrbitControls,ref,computed,buildAgvModel,buildVehicleModel,modelTitle,groupsFor,presentationOffset,latentDescriptions,toggleRestored,createPartHighlighter,layoutAgvLabels,defineProps:()=>({variant:'old',family:'latent'}),onMounted(){},onBeforeUnmount(){},watch(){},document:{hidden:true}})
 vm.runInContext(source+`\nconst built=buildAgvModel();model=built.root;parts=built.parts;highlighter=createPartHighlighter(parts);partInfo.value=parts.map(p=>({id:p.name,label:p.userData.label,description:p.userData.description}));camera=new THREE.PerspectiveCamera(42,1.5,.02,30);camera.position.set(3,2,3);controls=new OrbitControls(camera);initializeView();this.review={inspect,expandAll,inspectSystem,clearSelection,resetAssembly,expanded,selectedInfo,restoredParts,selectedSystem,groupAction,distance:()=>camera.position.distanceTo(controls.target),visible:id=>parts.find(p=>p.name===id).visible,overhead(){camera.position.copy(controls.target).add(new THREE.Vector3(0,3,0));},dispose(){model.traverse(p=>{p.geometry?.dispose();if(p.material)(Array.isArray(p.material)?p.material:[p.material]).forEach(m=>m.dispose())})}};`,context)
 const s=context.review;try{
  assert.equal(s.expanded.value,false);s.expandAll();assert.equal(s.expanded.value,true);assert.equal(s.restoredParts.value.size,0);
  s.inspect('ekk');assert.ok(s.restoredParts.value.has('ekk'));assert.ok(!s.restoredParts.value.has('lift'));assert.ok(s.selectedInfo.value.description);
  s.inspect('ekk');assert.ok(!s.restoredParts.value.has('ekk'));s.inspectSystem(functionalGroups.find(g=>g.id==='power'));assert.equal(s.groupAction(functionalGroups.find(g=>g.id==='power')),'拆开');for(const id of ['pickup','tpm','ekk','supercapacitor'])assert.ok(s.restoredParts.value.has(id));
  for(const id of ['platform','left-cover','right-cover','operator-panel','rear-cover','pickup'])assert.equal(s.visible(id),true);
  s.clearSelection();assert.equal(s.selectedInfo.value,undefined);assert.ok(s.restoredParts.value.has('ekk'),'closing description retains installed parts');s.resetAssembly();assert.equal(s.expanded.value,false);assert.equal(s.restoredParts.value.size,0);assert.equal(s.selectedSystem.value,'');s.expandAll();assert.equal(s.groupAction(functionalGroups.find(g=>g.id==='power')),'归位');
 }finally{s.dispose()}
})

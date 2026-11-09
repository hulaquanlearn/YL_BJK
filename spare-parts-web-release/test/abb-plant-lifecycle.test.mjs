import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
import {ref,computed} from 'vue'

function harness(){
 const text=fs.readFileSync(new URL('../src/components/agv/AbbRobotViewer.vue',import.meta.url),'utf8'),source=text.slice(text.indexOf('function toggleVisibility('),text.indexOf('function togglePot('))
 const model=new THREE.Group(),hidden=ref(new Set()),programRunning=ref(false),calls={created:0,receiving:0},ctx=vm.createContext({THREE,model,hidden,programRunning,plantEnabled:computed(()=>!hidden.value.has('feed-station')),plantLoading:ref(false),plantFailure:ref(''),selected:ref(''),disposed:false,meshes:[],paint(){},fit(){},showReceivingPose(){calls.receiving++},disposeModel(){},registerMeshes(){},robotPlantEquipment:['feed-station','infrared-camera'].map(id=>({id,position:[0,0,0],create(){calls.created++;return new THREE.Group()}}))});vm.runInContext(source,ctx);return {ctx,model,hidden,programRunning,calls}
}
test('repeated preparation and concurrent loading reuse each plant assembly instead of leaving unhideable duplicate cameras',async()=>{
 const h=harness();await Promise.all([h.ctx.loadPlant('infrared-camera'),h.ctx.loadPlant('infrared-camera')]);await h.ctx.loadPlant('infrared-camera');await h.ctx.loadPlant('feed-station');await h.ctx.loadPlant('feed-station');assert.equal(h.model.children.length,2);assert.equal(h.calls.created,2)
 h.ctx.toggleVisibility('infrared-camera');assert.equal(h.model.getObjectByName('infrared-camera').visible,false);await h.ctx.loadPlant('infrared-camera');assert.equal(h.model.getObjectByName('infrared-camera').visible,false);h.ctx.toggleVisibility('infrared-camera');assert.equal(h.model.getObjectByName('infrared-camera').visible,true);assert.equal(h.model.children.length,2)
});
test('feeder visibility changes leave the shared camera box untouched and never move a running robot',async()=>{
 const h=harness();await h.ctx.loadPlant('feed-station');await h.ctx.loadPlant('infrared-camera');h.ctx.toggleVisibility('infrared-camera');h.programRunning.value=true
 for(let i=0;i<4;i++){await h.ctx.togglePlant();assert.equal(h.model.getObjectByName('infrared-camera').visible,false);assert.equal(h.model.getObjectByName('feed-station').visible,!h.hidden.value.has('feed-station'))}
 assert.equal(h.calls.receiving,0);assert.equal(h.model.children.length,2);h.programRunning.value=false;await h.ctx.togglePlant();await h.ctx.togglePlant();assert.equal(h.calls.receiving,1)
});

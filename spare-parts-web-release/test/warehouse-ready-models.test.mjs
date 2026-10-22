import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as THREE from 'three'
const source=fs.readFileSync(new URL('../src/views/Warehouse3D.vue',import.meta.url),'utf8')
const draw=source.slice(source.indexOf('async function drawPartModels('),source.indexOf('\nasync function locatePart('))
function harness(){
 const pending=[],root=new THREE.Group(),old=new THREE.Group();root.add(old)
 const state={THREE,partModelsRoot:root,partModelDrawToken:0,partModelMode:{value:'all'},modelsPreparing:{value:false},allLocatedParts:{value:[{_id:'part',totalStock:2,safetyStock:0}]},shelves:{value:[{id:'shelf',shelfNo:1,size:{width:3,depth:1},position:{x:0,z:0}}]},activeGroup:{value:''},selectedPart:{value:null},resolvePartLocation:()=>({shelf:1,position:1,layer:1,location:'011101'}),shelfMatchesFilter:()=>true,modelUrlFor:()=>'/model.glb',getPartMarkerPlacement:()=>({usableWidth:3,slots:1,layerHeight:1,z:0,x:0,shelfSurfaceY:0}),slotModelBounds:()=>({width:1,height:1,depth:1}),stockModelColors:()=>({color:0x19a974,emissive:0x075b40}),partGeometry:()=>new THREE.BoxGeometry(1,1,1),modelFitScale:()=>1,
  disposeChildren:group=>{for(const child of [...group.children])group.remove(child)},instanceStockModels(){},
  loadProgress:{value:{phase:'models',done:0,total:0,failed:0}},
  replaceWithCustomModel:(anchor,fallback)=>new Promise(resolve=>pending.push(result=>{if(result!==false){anchor.remove(fallback);const final=new THREE.Mesh(new THREE.SphereGeometry(.3),new THREE.MeshBasicMaterial());final.userData.final=true;anchor.add(final);}resolve(result)}))}
 vm.createContext(state);vm.runInContext(draw,state);return {state,pending,old,root}
}
test('warehouse publishes complete fitted models together and keeps the old scene while assets are pending',async()=>{
 const {state:s,pending,root,old}=harness(),ready=s.drawPartModels();assert.equal(s.modelsPreparing.value,true);assert.equal(root.children[0],old);assert.equal(root.children.length,1)
 assert.equal(s.loadProgress.value.done,0);assert.equal(s.loadProgress.value.total,1)
 pending[0]();await ready;assert.equal(s.modelsPreparing.value,false);assert.notEqual(root.children[0],old);assert.equal(root.children[0].children[0].userData.final,true)
 assert.equal(s.loadProgress.value.done,1)
})
test('a late model build cannot replace a newer scene or clear its loading state',async()=>{
 const {state:s,pending,root,old}=harness(),first=s.drawPartModels(),second=s.drawPartModels();pending[0]();await first;assert.equal(s.modelsPreparing.value,true);assert.equal(root.children[0],old);pending[1]();await second;assert.equal(s.modelsPreparing.value,false);assert.equal(root.children.length,1);assert.equal(root.children[0].children[0].userData.final,true)
})

test('model fallback is counted as a failed model rather than a successful download',async()=>{
 const {state:s,pending}=harness(),ready=s.drawPartModels();assert.equal(s.loadProgress.value.failed,0);pending[0](false);await ready;assert.equal(s.loadProgress.value.done,1);assert.equal(s.loadProgress.value.failed,1);
});

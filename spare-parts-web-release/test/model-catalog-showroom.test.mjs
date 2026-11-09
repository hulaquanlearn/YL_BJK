import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {computed,ref,watch,reactive,nextTick,effectScope} from 'vue'
import {modelDisplayStatus} from '../src/utils/model-display-status.mjs'
import * as reviews from '../src/utils/model-review.mjs'

const source=fs.readFileSync(new URL('../src/components/ModelCatalogShowroom.vue',import.meta.url),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .+$/gm,'')
test('catalog keeps selection, pages actual models, and associates parts by exact model ID',async()=>{
 const props=reactive({models:Array.from({length:15},(_,i)=>({id:i+1,name:'model '+(i+1),modelUrl:'/model-'+i+'.glb'})),parts:[{id:11,categoryModelId:1},{id:12,categoryModelId:2},{id:13,categoryModelId:14}]})
 const scope=effectScope(),context={...reviews,modelDisplayStatus,modelReview:()=>null,computed,ref,watch,defineProps:()=>props,defineEmits:()=>()=>{}}
 vm.createContext(context)
 scope.run(()=>vm.runInContext(source+'\nglobalThis.state={page,current,associated,choose,observation}',context))
 const s=context.state
 assert.equal(s.current.value.id,1);assert.equal(s.associated.value.length,1);assert.equal(s.associated.value[0].id,11)
 s.choose(2);await nextTick();assert.equal(s.associated.value[0].id,12)
 props.models=[...props.models];await nextTick();assert.equal(s.current.value.id,2)
 s.page.value=2;await nextTick();assert.equal(s.current.value.id,13)
 s.choose(14);await nextTick();assert.equal(s.associated.value[0].id,13)
 props.models=props.models.filter(m=>m.id===1);await nextTick();assert.equal(s.page.value,1);assert.equal(s.current.value.id,1)
 props.models=[];await nextTick();assert.equal(s.current.value,undefined);assert.equal(s.associated.value.length,0)
 scope.stop()
})
test('catalog separates missing files from observable and pending models',async()=>{
 const props=reactive({models:[{id:1,name:'已上传',modelUrl:'/model.glb'},{id:2,name:'仅有名称',modelUrl:''},{id:3,name:'旧模型',modelUrl:'/models/ledger-20261008/13.glb'}],parts:[]})
 const scope=effectScope(),context={...reviews,modelDisplayStatus,modelReview:()=>null,computed,ref,watch,defineProps:()=>props,defineEmits:()=>()=>{}}
 vm.createContext(context);scope.run(()=>vm.runInContext(source+'\nglobalThis.state={readyCount,pendingCount,scopedModels,reviewScope,current}',context))
 const s=context.state;assert.equal(s.readyCount.value,1);assert.equal(s.pendingCount.value,1);assert.equal(s.current.value.id,1)
 s.reviewScope.value='missing';await nextTick();assert.equal(s.current.value.id,2);assert.equal(s.scopedModels.value.length,1)
 s.reviewScope.value='pending';await nextTick();assert.equal(s.current.value.id,3);scope.stop()
})

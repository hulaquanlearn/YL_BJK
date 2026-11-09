import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'
import { buildModelReviewPayload, modelReviewConfirmed, modelReviewInputKey, modelReviewLabel, modelReviewStatusLabel, withModelReviewDecision } from '../src/utils/model-review.mjs'
import { modelDisplayStatus } from '../src/utils/model-display-status.mjs'
import { partModelReviewed, partModelNeedsReview } from '../src/utils/bound-part-model.mjs'
import { warehouseModelUrl } from '../src/utils/evidence-models.mjs'

const hash='a'.repeat(64), fileHash='b'.repeat(64)
const approved={id:1,status:'approved',valid:true,stale:false,versionHash:hash,actorName:'核对人',reviewedAt:'2026-10-27T08:00:00Z'}
const detail=()=>({model:{id:13,name:'待核对模块',modelUrl:'/models/ledger-20261008/13.glb',imageUrl:'/uploads/part-images/categories/ref.jpg'},version:{hash,modelFileHash:fileHash,available:true},review:null,parts:[{id:22,code:'TEST-22',name:'关联测试件',spec:'SPEC-22',partImageUrl:'/uploads/part-images/test.jpg'}],permissions:{canReview:true},history:[]})
const form=()=>({status:'approved',note:'已对照关联备件实物照片核对外形及接口位置一致',referencePartId:22,referenceType:'physical_photo',checks:{identity:true,outline:true,interfaces:true}})
test('manual approval needs current version, explicit basis, identity and all three checks',()=>{
 const payload=buildModelReviewPayload(form(),detail(),'review-request-123')
 assert.equal(payload.expectedVersionHash,hash);assert.equal(payload.referencePartId,22)
 for(const change of [{note:'正确'},{referencePartId:''},{checks:{identity:true,outline:true,interfaces:false}},{referenceType:'auto_ai'},{referencePartId:999}])assert.throws(()=>buildModelReviewPayload({...form(),...change},detail(),'review-request-123'))
 const noPhoto=detail();noPhoto.parts[0].partImageUrl='';assert.throws(()=>buildModelReviewPayload(form(),noPhoto,'review-request-123'),/实物照片/)
 const noFile=detail();noFile.version.available=false;assert.throws(()=>buildModelReviewPayload(form(),noFile,'review-request-123'),/三维文件/)
 assert.throws(()=>buildModelReviewPayload(form(),{...detail(),version:{}},'review-request-123'),/模型版本/)
})
test('neither a product name nor a stale/raw approved flag certifies the 101 legacy files',()=>{
 const model={name:'功率模块',modelUrl:'/models/ledger-20261008/13.glb'}
 assert.equal(modelDisplayStatus(model).key,'pending');assert.equal(modelReviewConfirmed(model),false)
 assert.equal(modelDisplayStatus({...model,reviewDecision:{status:'approved'}}).key,'pending')
 assert.equal(modelDisplayStatus({...model,reviewDecision:approved}).key,'ready')
 for(const review of [{...approved,stale:true,valid:false},{...approved,status:'needs_fix'},{...approved,status:'pending'}])assert.equal(modelDisplayStatus({...model,reviewDecision:review}).key,'pending')
})
test('only server-valid approval unlocks bound detail and warehouse; replacement becomes pending again',()=>{
 const part={categoryModelUrl:'/models/ledger-20261008/13.glb'}
 assert.equal(warehouseModelUrl(part),'');assert.equal(partModelNeedsReview(part),true)
 part.categoryModelReviewDecision=approved;assert.equal(partModelReviewed(part),true);assert.equal(warehouseModelUrl(part),part.categoryModelUrl)
 part.categoryModelReviewDecision={...approved,valid:false,stale:true};assert.equal(partModelReviewed(part),false);assert.equal(warehouseModelUrl(part),'');assert.equal(partModelNeedsReview(part),true)
 const custom={categoryModelUrl:'/uploads/part-models/test.glb',categoryModelReviewDecision:{...approved,status:'needs_fix'}};assert.equal(warehouseModelUrl(custom),'')
})
test('local acknowledgement cannot override a replacement or a newer server decision',()=>{
 const model={id:13,name:'模块',modelUrl:'/models/ledger-20261008/13.glb',frontRotationY:0,imageUrl:'/ref.jpg'}
 const decisions={'13':{inputKey:modelReviewInputKey(model),review:approved}}
 assert.equal(withModelReviewDecision(model,decisions).reviewDecision.status,'approved')
 assert.equal(withModelReviewDecision({...model,modelUrl:'/new.glb'},decisions).reviewDecision,undefined)
 assert.equal(withModelReviewDecision({...model,reviewDecision:{...approved,id:2,status:'needs_fix'}},decisions).reviewDecision.status,'needs_fix')
 assert.match(modelReviewLabel({...approved,stale:true,valid:false}),/重新核对/);assert.equal(modelReviewStatusLabel(approved.status),'核对通过')
})

const componentSource=fs.readFileSync(new URL('../src/components/ModelReviewDialog.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm,'')
function subject(mocks={}){
 const props=reactive({modelValue:false,modelId:13,canReview:true}),events=[],scope=effectScope()
 const context={computed,ref,reactive,watch,onBeforeUnmount(){},defineProps:()=>props,defineEmits:()=>((...args)=>events.push(args)),buildModelReviewPayload,modelReviewLabel,modelReviewStatusLabel,crypto:{randomUUID:()=> 'review-retry-123456'},ElMessage:{success(){}},getPartModelReview:async()=>({data:detail()}),savePartModelReview:async()=>({data:{...detail(),review:approved,history:[approved]}}),...mocks}
 vm.createContext(context);scope.run(()=>vm.runInContext(componentSource+'\nglobalThis.subject={detail,form,load,save,saving,error,saveError,receiveMeshes,selectedMeshId,meshes}',context))
 return {state:context.subject,props,events,stop:()=>scope.stop()}
}
test('raw runtime mesh selection does not create semantic names and failed saves retain input/request identity',async()=>{
 const sent=[];let fail=true
 const s=subject({savePartModelReview:async(id,payload)=>{sent.push({id,payload});if(fail)throw Error('network');return {data:{...detail(),review:approved,history:[approved]}}}})
 s.props.modelValue=true;await nextTick();await s.state.load()
 s.state.receiveMeshes([{id:'mesh-1',name:'Cylinder',vertexCount:36,triangleCount:12}]);s.state.selectedMeshId.value='mesh-1';assert.equal(s.state.meshes.value[0].name,'Cylinder')
 Object.assign(s.state.form,form());await s.state.save();assert.equal(sent.length,1);assert.match(s.state.saveError.value,/network/);assert.equal(s.state.form.status,'approved')
 fail=false;await s.state.save();assert.equal(sent.length,2);assert.equal(sent[0].payload.requestId,sent[1].payload.requestId);assert.equal(s.events.filter(([name])=>name==='saved').length,1);assert.equal(s.state.detail.value.review.actorName,'核对人')
 s.stop()
})
test('read-only users cannot save and a late model read cannot overwrite a newly selected review',async()=>{
 let saved=0,resolveOld
 const old=new Promise(resolve=>{resolveOld=resolve}),s=subject({getPartModelReview:async id=>Number(id)===13?old:{data:{...detail(),model:{...detail().model,id:14}}},savePartModelReview:async()=>{saved++;return {data:detail()}}})
 s.props.modelValue=true;await nextTick();s.props.modelId=14;await nextTick();await s.state.load();resolveOld({data:detail()});await nextTick();await Promise.resolve()
 assert.equal(s.state.detail.value.model.id,14);s.props.canReview=false;Object.assign(s.state.form,form());await s.state.save();assert.equal(saved,0);s.stop()
})
test('a model that never rendered cannot be approved through the dialog',async()=>{
 let writes=0;const s=subject({savePartModelReview:async()=>{writes++;return {data:detail()}}})
 s.props.modelValue=true;await nextTick();await s.state.load();Object.assign(s.state.form,form());await s.state.save()
 assert.equal(writes,0);assert.match(s.state.saveError.value,/模型显示.*实际网格/);s.stop()
})

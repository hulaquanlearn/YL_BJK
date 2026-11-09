import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { displayedPartModel, partModelNeedsReview, partModelReviewed, partModelStatus } from '../src/utils/bound-part-model.mjs'
import { modelReview } from '../src/utils/model-observation.mjs'

const source=fs.readFileSync(new URL('../src/views/ModelLibrary.vue',import.meta.url),'utf8')
const card=source.match(/<article v-for="item in pagedParts"[\s\S]*?<\/article>/)[0]
const render=new Function('Vue',compile(`<section>${card}</section>`,{mode:'function'}).code)(Vue)
async function renderCards(rows,editable=true){
 const app=Vue.createSSRApp({render,setup:()=>({pagedParts:rows,selected:new Set(),failedPhotos:new Set(),canEditPart:()=>editable,displayedPartModel,partModelNeedsReview,partModelReviewed,partModelStatus,modelReview,toggleSelect(){},openPartPreview(){},openPhoto(){},openSingleBinding(){},handleSingleUpload(){}})})
 app.config.warnHandler=()=>{};app.config.globalProperties.$showControl=allowed=>allowed
 app.directive('write',{getSSRProps:()=>({})})
 app.component('ModelThumbnail',{props:['modelUrl','alt'],setup:props=>()=>Vue.h('img',{'data-model-url':props.modelUrl,alt:props.alt})})
 for(const name of ['ElCheckbox','ElIcon','ElButton','ElUpload'])app.component(name,{setup:(_props,{slots})=>()=>Vue.h('span',slots.default?.())})
 return renderToString(app)
}
test('binding cards show the actual bound GLB thumbnail beside the retained real photo and specification',async()=>{
 const html=await renderCards([{id:1,code:'505024988',name:'SKF轴承',spec:'22220E',categoryModelId:330,categoryModelName:'双列调心轴承',categoryModelUrl:'/models/reviewed-20261023/skf-22220-e.glb',partImageUrl:'/uploads/part-images/real.jpg',categoryImageUrl:'/models/reference.jpg'}])
 assert.match(html,/data-model-url="\/models\/reviewed-20261023\/skf-22220-e.glb"/)
 assert.match(html,/src="\/uploads\/part-images\/real.jpg"/);assert.doesNotMatch(html,/src="\/models\/reference.jpg"/)
 for(const value of ['505024988','22220E','双列调心轴承','3D 示意模型','实物照片','更换模型','更换照片'])assert.ok(html.includes(value),value)
 assert.doesNotMatch(card,/<ModelPreview\b/)
})
test('pending old shapes are explicitly marked, and missing-file bindings remain distinct from unbound parts',async()=>{
 const html=await renderCards([
  {id:1,code:'old',name:'旧模型物料',categoryModelId:13,categoryModelUrl:'/models/ledger-20261008/13.glb'},
  {id:2,code:'missing',name:'缺文件物料',categoryModelId:500,categoryModelName:'只有名称'},
  {id:3,code:'unbound',name:'未绑定物料'}
 ])
 assert.match(html,/待核对外形预览/);assert.match(html,/外形待核对/);assert.match(html,/data-model-url="\/models\/ledger-20261008\/13.glb"/)
 assert.match(html,/缺少三维文件/);assert.match(html,/尚未绑定模型/);assert.match(html,/尚未上传实物图/)
})
test('card layout keeps equal model/photo panes and responsive cards without the superseded table-row styles',()=>{
 assert.match(source,/\.binding-visuals\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 assert.match(source,/@media\(min-width:1600px\)\{\.binding-list\{grid-template-columns:repeat\(4/)
 assert.match(source,/@media\(max-width:1080px\)\{\.binding-list\{grid-template-columns:repeat\(2/)
 assert.match(source,/@media\(max-width:540px\)\{\.binding-list\{grid-template-columns:minmax/)
 assert.doesNotMatch(source,/binding-columns|\.binding-list \.ml-card\{/)
})
test('read-only cards preserve both visual panes without binding/upload or selection controls',async()=>{
 const html=await renderCards([{id:1,code:'read',name:'只读备件',categoryModelId:1,categoryModelUrl:'/models/a.glb',partImageUrl:'/uploads/part-images/real.jpg'}],false)
 assert.match(html,/data-model-url="\/models\/a.glb"/);assert.match(html,/real.jpg/)
 assert.doesNotMatch(html,/更换模型|更换照片|选择read/)
})
test('server-approved legacy cards switch to verified display and stale approvals return pending',async()=>{
 const item={id:13,code:'reviewed',name:'已核对旧模型',categoryModelId:13,categoryModelUrl:'/models/ledger-20261008/13.glb',categoryModelReviewDecision:{id:1,status:'approved',valid:true,stale:false,versionHash:'a'.repeat(64)}}
 const approved=await renderCards([item]);assert.match(approved,/已核对模型/);assert.match(approved,/人工核对通过/);assert.doesNotMatch(approved,/外形待核对|待核对外形预览/)
 const stale=await renderCards([{...item,categoryModelReviewDecision:{...item.categoryModelReviewDecision,valid:false,stale:true}}]);assert.match(stale,/重新核对/)
})

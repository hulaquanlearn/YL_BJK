import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {baseParse}=require('@vue/compiler-dom')
const {compile,createRenderer,h,reactive,nextTick}=require('vue/dist/vue.cjs.js')

function footer(file,model){
 const source=readFileSync(new URL('../src/views/'+file,import.meta.url),'utf8').split('<script')[0]
 const tree=baseParse(source),find=(n,p)=>p(n)?n:(n.children||[]).map(c=>find(c,p)).find(Boolean)
 const dialog=find(tree,n=>n.tag==='el-dialog'&&n.props.some(p=>p.name==='model'&&p.exp?.content===model))
 const slot=find(dialog,n=>n.tag==='template'&&n.props.some(p=>p.name==='slot'&&p.arg?.content==='footer'))
 return slot.children.map(n=>n.loc.source).join('')
}
function mount(template,state){
 const node=type=>({type,children:[],props:{}}),root=node('root')
 const renderer=createRenderer({createElement:node,createText:text=>({...node('text'),text}),createComment:()=>node('comment'),setText:(n,text)=>{n.text=text},setElementText:(n,text)=>{n.text=text},patchProp:(n,k,o,v)=>{n.props[k]=v},insert:(n,p,anchor)=>{n.parent=p;const i=p.children.indexOf(anchor);if(i<0)p.children.push(n);else p.children.splice(i,0,n)},remove:n=>{const i=n.parent.children.indexOf(n);n.parent.children.splice(i,1)},parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]})
 const app=renderer.createApp({setup:()=>state,render:compile(template)})
 app.component('ElButton',{inheritAttrs:false,props:['disabled','loading'],setup:(props,{slots,attrs})=>()=>h('button',{...attrs,disabled:props.disabled||props.loading},slots.default?.())})
 app.directive('write',{})
 app.mount(root)
 const text=n=>(n.text||'')+n.children.map(text).join('')
 const buttons=()=>{const walk=n=>[...(n.type==='button'?[n]:[]),...n.children.flatMap(walk)];return walk(root).map(n=>({label:text(n),disabled:!!n.props.disabled,click:()=>{if(!n.props.disabled)n.props.onClick?.()}}))}
 return {buttons,unmount:()=>app.unmount()}
}

for(const [file,model,settings] of [
 ['Inventory.vue','importVisible',{file:'importFile',plan:'importPreview',checking:'importPreviewing',saving:'importSubmitting',validate:'previewImport',apply:'submitImport',scope:'importWorkshopCode'}],
 ['Equipment.vue','importVisible',{file:'importFile',plan:'importPreview',checking:'previewing',saving:'saving',validate:'previewImportFile',apply:'applyImport',scope:'importWorkshopCode'}],
 ['ModelLibrary.vue','bindingImport.visible',{file:'file',plan:'plan',checking:'loading',saving:'saving',validate:'checkBindingImport',apply:'applyBindingImport',nested:true}]
])test(file+' requires successful validation before exposing the single import action',async()=>{
 let validations=0,writes=0
 const value=reactive({[settings.file]:null,[settings.plan]:null,[settings.checking]:false,[settings.saving]:false,visible:true})
 const state=settings.nested?reactive({bindingImport:value}):value
 if(!settings.nested){state.importVisible=true;state[settings.scope]='raw_grain'}
 state[settings.validate]=()=>{validations++;value[settings.plan]=settings.nested?{errors:[{reason:'invalid'}]}:{errorCount:1}}
 state[settings.apply]=()=>{writes++}
 const view=mount(footer(file,model),state)
 try{
  assert.deepEqual(view.buttons().map(b=>b.label),['取消','校验文件'])
  assert.equal(view.buttons()[1].disabled,true)
  value[settings.file]={name:'test.xlsx'};await nextTick();view.buttons()[1].click();await nextTick()
  assert.equal(validations,1);assert.equal(writes,0);assert.equal(view.buttons()[1].label,'校验文件')
  value[settings.plan]=settings.nested?{errors:[]}:{errorCount:0};await nextTick()
  assert.deepEqual(view.buttons().map(b=>b.label),['取消','确认导入'])
  view.buttons()[1].click();assert.equal(writes,1)
  value[settings.saving]=true;await nextTick();assert.ok(view.buttons().every(b=>b.disabled))
  value[settings.saving]=false;value[settings.plan]=null;await nextTick()
  assert.equal(view.buttons()[1].label,'校验文件')
 }finally{view.unmount()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import {parse,compileScript} from '@vue/compiler-sfc'
import {renderToString} from '@vue/server-renderer'
import * as bound from '../src/utils/bound-part-model.mjs'
import * as documents from '../src/utils/spare-documents.mjs'
import * as variants from '../src/utils/part-model-variants.mjs'

const url=new URL('../src/components/PartModelDetail.vue',import.meta.url)
const source=fs.readFileSync(url,'utf8').replace('</script>','defineExpose({referencePreview})\n</script>')
const {descriptor}=parse(source,{filename:url.pathname})
const code=compileScript(descriptor,{id:'part-reference-preview',inlineTemplate:true}).content
 .replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm,(_all,names,module)=>`const {${names.replace(/\s+as\s+/g,':')}}=modules[${JSON.stringify(module)}];`)
 .replace('export default','globalThis.Component=')

async function harness(part){
 let state;const captured=[]
 const Preview={inheritAttrs:false,setup(_props,{attrs}){captured.push({...attrs});return()=>Vue.h('figure',{'data-model':attrs['model-url']})}}
 const context=vm.createContext({modules:{vue:{...Vue,defineAsyncComponent:()=>Preview},'../utils/bound-part-model.mjs':bound,'../utils/spare-documents.mjs':documents,'../utils/part-model-variants.mjs':variants,'../utils/feature-access.mjs':{canReadFeature:()=>false},'../auth':{getUser:()=>null}}})
 vm.runInContext(code,context)
 const props=Vue.reactive({part,compact:false})
 const render=context.Component.setup(props,{expose:s=>{state=s}})
 const vnode=()=>render({},[])
 const html=()=>renderToString(Vue.createSSRApp({render:vnode}))
 return {state,captured,props,vnode,html}
}
function findButton(vnode){if(vnode?.type==='button')return vnode;if(Array.isArray(vnode?.children))for(const child of vnode.children){const found=findButton(child);if(found)return found}}

test('pending bound model can be explicitly inspected without approval or rebinding',async()=>{
 const part={id:1,categoryModelUrl:'/models/ledger-20261008/13.glb',categoryModelName:'参考模型'}
 const h=await harness(part)
 assert.match(await h.html(),/查看三维参考/)
 assert.equal(h.captured.length,0)
 findButton(h.vnode()).props.onClick()
 assert.equal(h.state.referencePreview.value,true)
 assert.match(await h.html(),/查看不会改变模型核对记录或备件绑定/)
 assert.equal(h.captured[0]['model-url'],part.categoryModelUrl)
 assert.equal(h.captured[0]['allow-unreviewed'],true)
 assert.equal(bound.partModelNeedsReview(part),true)
 assert.equal(bound.partModelReviewed(part),false)
 h.props.part={id:2,categoryModelUrl:'/models/ledger-20261008/13.glb'}
 await Vue.nextTick()
 assert.equal(h.state.referencePreview.value,false,'another part must not inherit explicit inspection')
})

test('missing model has no inspection button and does not borrow a model',async()=>{
 const h=await harness({id:1,categoryModelUrl:''})
 assert.doesNotMatch(await h.html(),/查看三维参考/)
 assert.equal(findButton(h.vnode()),undefined)
 assert.equal(h.captured.length,0)
})

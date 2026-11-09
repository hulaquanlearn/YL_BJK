import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {compileScript,parse} from '@vue/compiler-sfc'
import * as Vue from 'vue'
const url=new URL('../src/components/fire/FireSectionFilter.vue',import.meta.url)
const {descriptor}=parse(readFileSync(url,'utf8'))
const compiled=compileScript(descriptor,{id:'fire-section-test',inlineTemplate:true}).content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]vue['"];?/g,(_,bindings)=>`const {${bindings.replace(/\s+as\s+/g,':')}}=runtime;`).replace('export default','return')
test('real shared section selector changes the chosen section and refreshes the current page',()=>{
 let refreshed=0
 const fire=Vue.reactive({query:{sectionName:''},sections:['五粮工段','蒸糠工段','输送工段','破曲工段'],recognitionBusy:false,sectionChanged(){refreshed++}})
 const runtime={...Vue,inject:()=>fire,resolveComponent:n=>n}
 const component=new Function('runtime',compiled)(runtime),render=component.setup({}, {expose(){}}),node=render({},[])
 assert.equal(node.props.placeholder,'全部工段');assert.ok(Object.hasOwn(node.props,'clearable'))
 node.props['onUpdate:modelValue']('输送工段');node.props.onChange();assert.equal(fire.query.sectionName,'输送工段');assert.equal(refreshed,1)
 node.props['onUpdate:modelValue']('');node.props.onChange();assert.equal(fire.query.sectionName,'');assert.equal(refreshed,2)
 fire.recognitionBusy=true;assert.equal(render({},[]).props.disabled,true,'capture confirmation cannot silently change its filter context')
})

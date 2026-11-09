import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {parse} from '@babel/parser'
import {ref,reactive} from 'vue'
function subject(){
 const script=fs.readFileSync(new URL('../src/views/Knowledge.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
 const ast=parse(script,{sourceType:'module'}),fn=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadStats'),pending=[]
 const c=vm.createContext({statsRequest:0,knowledgeDisposed:false,filters:reactive({workshopCode:'raw_grain'}),stats:reactive({}),categories:ref([]),categoryOptions:ref([]),tagSuggestions:ref([]),defaultCategories:[],getKnowledgeStats:params=>new Promise(resolve=>pending.push({params,resolve}))})
 vm.runInContext(script.slice(fn.start,fn.end)+';this.load=loadStats',c);return {c,pending}
}
test('late workshop statistics cannot replace the current workshop categories and tags',async()=>{
 const {c,pending}=subject(),old=c.load();c.filters.workshopCode='qu_making';const current=c.load()
 pending[1].resolve({data:{total:2,categories:[{category:'制曲资料'}],tags:['制曲']}});await current
 pending[0].resolve({data:{total:91,categories:[{category:'原粮资料'}],tags:['原粮']}});await old
 assert.equal(c.stats.total,2);assert.equal(c.categories.value[0].category,'制曲资料');assert.equal(c.tagSuggestions.value[0],'制曲')
})
test('statistics completing after leaving the page cannot update its state',async()=>{
 const {c,pending}=subject(),old=c.load();c.knowledgeDisposed=true;pending[0].resolve({data:{total:91,categories:[{category:'旧资料'}]}});await old;assert.equal(c.stats.total,undefined);assert.deepEqual([...c.categories.value],[])
})

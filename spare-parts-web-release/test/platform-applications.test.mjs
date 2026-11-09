import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as Vue from 'vue'
import {renderToString} from '@vue/server-renderer'
import {parse,compileScript,compileStyle} from '@vue/compiler-sfc'
function component(file,ports={},expose=''){
 let source=fs.readFileSync(new URL('../src/components/'+file,import.meta.url),'utf8');if(expose)source=source.replace(/^defineExpose\([^\n]*\n/gm,'').replace('</script>','defineExpose({'+expose+'})\n</script>');const descriptor=parse(source).descriptor;
 for(const style of descriptor.styles)assert.deepEqual(compileStyle({source:style.content,filename:file,id:'platform-test',scoped:true}).errors,[]);
 const code=compileScript(descriptor,{id:'platform-test',inlineTemplate:true}).content.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?/gm,(_,names)=>'const {'+names.replace(/\s+as\s+/g,':')+'}=Vue;').replace(/^import .+$/gm,'').replace('export default','this.Component=');
 const context=vm.createContext({Vue,...ports});vm.runInContext(code,context);return context.Component;
}
const Applications=component('ProviderApplications.vue');
test('provider cards show exact app models and route per feature while excluding disabled configurations',async()=>{
 const inventory={rows:[{app:'情侣',purpose:'排班照片识别',provider:'glm',model:'glm-4.5v',enabled:true,route:'直连 API'},{app:'智题工坊',purpose:'语音播报',provider:'glm',model:'glm-tts',enabled:true,route:'直连 API'},{app:'智题工坊',purpose:'出题',provider:'hunyuan',model:'hy3',enabled:true,route:'OpenClaw · question'},{app:'数字工作台',purpose:'未启用功能',provider:'glm',model:'hidden-model',enabled:false}]};
 const html=await renderToString(Vue.createSSRApp(Applications,{provider:'glm',inventory}));assert.match(html,/情侣/);assert.match(html,/glm-4.5v/);assert.match(html,/glm-tts/);assert.match(html,/直连 API/);assert.doesNotMatch(html,/hidden-model|hy3|未启用功能/);
 const h=await renderToString(Vue.createSSRApp(Applications,{provider:'hunyuan',inventory}));assert.match(h,/hy3/);assert.match(h,/经 OpenClaw/);
});
test('the usage screen reads platform data only, preserves zero balance and renders unavailable values honestly',async()=>{
 const fixture={checkedAt:'2026-11-03T04:00:00Z',deepseek:{status:'ok',available:true,balances:[{currency:'CNY',total:'0',toppedUp:'0',granted:'0'}]},glm:{status:'unavailable',message:'平台暂不可用'},hunyuan:{status:'empty',message:'无套餐'},codex:{status:'unconfigured'},applications:{rows:[],sources:[]}};
 let calls=0,state;const Empty={render:()=>null},Component=component('PersonalUsage.vue',{Vue:{...Vue,onMounted(){},onBeforeUnmount(){}},getPersonalUsage:async()=>{calls++;return{data:fixture}},getToken:()=> 'test-session',getUser:()=>({id:1,role:'admin'}),OpenaiPlatformUsage:Empty,ProviderApplications:Applications},'data,load,loading,error');
 const render=Component.setup({}, {expose:s=>{state=s}});await state.load();assert.equal(calls,1);
 const app=Vue.createSSRApp({render:()=>render({},[])});for(const n of ['ElButton','ElIcon','Refresh','ElAlert'])app.component(n,{setup:(_,s)=>()=>Vue.h('span',s.slots.default?.())});
 const html=await renderToString(app);assert.match(html,/¥0/);assert.match(html,/平台暂不可用/);assert.doesNotMatch(html,/平台用量与模型|数字工作台接口设置/);assert.doesNotMatch(html,/本系统调用|已记录|查询用量|system-usage/);
 const account=fs.readFileSync(new URL('../src/views/Account.vue',import.meta.url),'utf8');assert.doesNotMatch(account,/label="调用记录"|value="records"|<AiCallLogs/);
});
test('an old account response cannot populate a new account usage page',async()=>{
 let token='first',resolve,state;const Empty={render:()=>null},Component=component('PersonalUsage.vue',{Vue:{...Vue,onMounted(){},onBeforeUnmount(){}},getPersonalUsage:()=>new Promise(r=>{resolve=r}),getToken:()=>token,getUser:()=>({id:1,role:'admin'}),OpenaiPlatformUsage:Empty,ProviderApplications:Applications},'data,load,loading');
 Component.setup({},{expose:s=>{state=s}});const task=state.load();token='second';resolve({data:{private:'OLD'}});await task;assert.equal(state.data.value,null);
});

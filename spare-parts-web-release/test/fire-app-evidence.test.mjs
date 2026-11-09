import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {compileScript,parse} from '@vue/compiler-sfc'
import * as Vue from 'vue'
import {fireIssueProblem} from '../src/utils/fire-issue-problem.mjs'
import {renderToString} from '@vue/server-renderer'

function component(file){
 const {descriptor}=parse(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'))
 const code=compileScript(descriptor,{id:'fire-app-evidence',inlineTemplate:true}).content.replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g,(_,clause,_quote,specifier)=>`const ${clause.trim().startsWith('{')?clause.trim().replace(/\s+as\s+/g,': '):'{default:'+clause.trim()+'}'}=modules[${JSON.stringify(specifier)}];`).replace('export default','return')
 const modules={vue:Vue,'../utils/fire-issue-problem.mjs':{fireIssueProblem},'./FireCamera.vue':{default:{render(){return null}}},'./FirePhotoRecognition.vue':{default:{render(){return Vue.h('section','拍照识别')}}},'./FireRecordEvidence.vue':{default:{render(){return null}}},'../../app/AppFireRecordEvidence.vue':{default:{render(){return null}}},'../../app/AppFireIssue.vue':{default:{render(){return null}}},'../components/fire/FireRecordEvidence.vue':{default:{props:['record'],render(){return Vue.h('div',{'data-full-record':this.record.id},'完整原始凭证')}}}}
 if(file!=='components/fire/FirePreviewImage.vue'){
  const preview={default:component('components/fire/FirePreviewImage.vue')}
  modules['./FirePreviewImage.vue']=preview
  modules['../components/fire/FirePreviewImage.vue']=preview
 }
 return new Function('modules',code)(modules)
}
const Card=component('app/AppFireIssueCard.vue'),Issue=component('app/AppFireIssue.vue'),Record=component('app/AppFireRecordEvidence.vue')
const base={issueStatus:s=>({open:'待整改',resolved:'待复核',closed:'已关闭'})[s],issueAction:a=>({created:'发现异常',opened:'发现异常',resolve:'登记整改'})[a]||a,typeName:t=>t==='hydrant'?'消防栓':'灭火器',resultName:r=>r==='normal'?'正常':'异常',time:t=>t||'—',photoUrls:{1:'blob:photo'},canInspect:()=>true,detail:{point:{id:3}},permissions:{canManage:false},openIssue(){}}
async function render(c,props,fire={}){const app=Vue.createSSRApp({render:()=>Vue.h(c,props)});app.provide('fireInspection',{...base,...fire});app.config.warnHandler=()=>{};app.component('ElDialog',{setup:(_p,{slots})=>()=>Vue.h('article',[slots.default?.(),slots.footer?.()])});for(const name of ['ElButton','ElIcon'])app.component(name,{setup:(_p,{slots})=>()=>Vue.h(name==='ElButton'?'button':'i',slots.default?.())});app.component('ElImage',{props:['src'],setup:p=>()=>Vue.h('img',{src:p.src})});return renderToString(app)}
const issue={id:1,status:'open',remark:'门锁损坏',actorName:'上报人员',createdAt:'2026/11/05 09:03:03',assets:[{id:55,code:'X342',type:'hydrant'}],pointSnapshot:{name:'三楼通道',location:'三楼通道北侧',sectionName:'输送工段'},events:[{id:9,action:'opened',actorName:'上报人员',createdAt:'2026/11/05 09:03:03',remark:'门锁损坏'}],photos:[]}
test('abnormal list identifies the actual affected asset, reporter, problem and location',async()=>{
 const html=await render(Card,{issue});for(const text of ['消防栓 X342','上报人：上报人员','门锁损坏','三楼通道北侧','09:03:03','待整改'])assert.ok(html.includes(text),text)
 assert.ok(!html.includes('灭火器 X342'))
})
test('App issue card shows only the abnormal items from an automatic remark',async()=>{
 const remark='拍照点检2026-11检查卡异常：箱身×、启泵开关按钮×；人工确认：箱身'
 const html=await render(Card,{issue:{...issue,remark}})
 assert.ok(html.includes('箱身、启泵开关按钮'))
 assert.ok(!html.includes('2026-11'))
 assert.ok(!html.includes('人工确认'))
 const detail=await render(Issue,{issue:{...issue,remark,events:[{...issue.events[0],remark}]}})
 for(const text of ['异常项','箱身、启泵开关按钮','待整改','上报人员','登记整改'])assert.ok(detail.includes(text),text)
 for(const text of ['检查卡异常','人工确认','×'])assert.ok(!detail.includes(text),text)
 const ai=await render(Card,{issue:{...issue,remark:'AI识别2026-11检查卡异常：箱身×'}})
 assert.ok(ai.includes('<strong>箱身</strong>'))
})
test('issue details retain discovery identity without repeating the same report and keep review role restrictions',async()=>{
 const html=await render(Issue,{issue});assert.equal(html.split('门锁损坏').length-1,1);assert.ok(html.includes('上报人员'));assert.ok(html.includes('登记整改'));assert.ok(!html.includes('复核关闭'))
 const pending={...issue,status:'resolved',events:[...issue.events,{id:10,action:'resolve',actorName:'整改人员',createdAt:'2026/11/05 10:00:00',remark:'已更换门锁'}]}
 const viewer=await render(Issue,{issue:pending});assert.ok(viewer.includes('已更换门锁'));assert.ok(!viewer.includes('复核关闭'))
 const admin=await render(Issue,{issue:pending},{permissions:{canManage:true}});assert.ok(admin.includes('复核关闭'));assert.ok(admin.includes('重新打开'))
})
test('compact inspection evidence keeps actor/time, independent checks, images and original record access',async()=>{
 const record={id:7,result:'normal',actorName:'点检人员',actualCheckedAt:'2026/11/04 08:35:10',recognition:{deviceCode:'492',year:2026,month:11,checks:[{name:'外观',mark:'√',result:'normal'},{name:'压力表',mark:'×',result:'abnormal'}]},photos:[{id:1}],pointSnapshot:{code:'internal-point'},items:[]}
 const html=await render(Record,{record});for(const text of ['点检人员','08:35:10','外观','压力表','×','blob:photo','查看完整凭证','data-full-record="7"'])assert.ok(html.includes(text),text)
 assert.ok(!html.includes('internal-point'))
})

test('inspection evidence shows the system task month before photographed dates',async()=>{
 const record={id:8,result:'normal',recognition:{deviceCode:'005',inspectionMonth:'2027-01',year:2025,month:9,checks:[]},photos:[],items:[]};
 const html=await render(Record,{record});assert.ok(html.includes('2027-01'));assert.ok(!html.includes('2025年9月'));
})

test('desktop evidence and confirmation use the task month when photo dates differ',async()=>{
 const recognition={deviceCode:'005',inspectionMonth:'2027-01',year:2025,month:9,checks:[]};
 const evidence=await render(component('components/fire/FireRecordEvidence.vue'),{record:{id:9,result:'normal',recognition,photos:[],items:[]}});assert.ok(evidence.includes('所属月份 2027-01'));assert.ok(!evidence.includes('2025-09'));
 const confirm=await render(component('components/fire/FirePhotoRecognition.vue'),{},{selectedCycle:{inspectionMonth:'2027-01',status:'open'},photoRecognition:{enabled:true,periodMonth:'2027-01'},recognitionResponse:{status:'awaiting_confirmation',recognition},recognitionDraft:{},recognitionMatches:[]});assert.ok(!confirm.includes('2027-01 · 核对点检'));assert.ok(!confirm.includes('2025'));
})

test('missing OCR number still renders the searchable ledger selector with code and location labels',async()=>{
 const html=await render(component('components/fire/FirePhotoRecognition.vue'),{},{selectedCycle:{inspectionMonth:'2026-11',status:'open'},photoRecognition:{enabled:true,periodMonth:'2026-11'},recognitionResponse:{status:'awaiting_confirmation',recognition:{deviceCode:'',inspectionMonth:'2026-11',checks:[]}},recognitionDraft:{},recognitionCandidates:[{assetId:7,deviceCode:'005',areaName:'东区',location:'东门'},{assetId:8,deviceCode:'X006',areaName:'西区',location:'西门'}]});
 for(const text of ['未识别到编号','按编号、区域或位置搜索器材','005 · 东区 · 东门','X006 · 西区 · 西门','filterable'])assert.ok(html.includes(text),text);
});

test('partial result confirmation shows standards and two explicit choices without selecting normal',async()=>{
 const check={key:'pressure',name:'压力表',standard:'压力是否正常',mark:'',result:'unclear',requiresConfirmation:true};
 const html=await render(component('components/fire/FirePhotoRecognition.vue'),{},{selectedCycle:{inspectionMonth:'2026-11',status:'open'},photoRecognition:{enabled:true,periodMonth:'2026-11'},recognitionResponse:{status:'awaiting_confirmation',recognition:{deviceCode:'005',inspectionMonth:'2026-11',checks:[check]}},recognitionDraft:{assetId:7,manualChecks:{}},recognitionCandidates:[],recognitionPendingChecks:[check],recognitionMissingChecks:[check]});
 for(const text of ['压力是否正常','压力表','√ 正常','× 异常','待确认'])assert.ok(html.includes(text),text);assert.ok(!html.includes('checked=""'));
});
test('App and full record evidence distinguish a manually confirmed check from AI results',async()=>{
 const record={id:15,result:'abnormal',recognition:{deviceCode:'005',checks:[{key:'pressure',name:'压力表',mark:'×',result:'abnormal',source:'manual_confirmation'}]},photos:[],items:[]};
 for(const c of [Record,component('components/fire/FireRecordEvidence.vue')]){const html=await render(c,{record});assert.ok(html.includes('人工确认'));assert.ok(html.includes('×'));}
});

test('a device-specific inspection shows no device chooser or manual registration',async()=>{
 const html=await render(component('components/fire/FirePhotoRecognition.vue'),{pointId:4,assetId:7},{selectedCycle:{inspectionMonth:'2026-11',status:'open'},photoRecognition:{enabled:true,periodMonth:'2026-11'},recognitionContext:{pointId:4,assetId:7},recognitionResponse:{status:'awaiting_confirmation',recognition:{deviceCode:'',inspectionMonth:'2026-11',checks:[]}},recognitionDraft:{assetId:7,deviceCode:'011',location:'东门',manualChecks:{}},recognitionCandidates:[{assetId:7,deviceCode:'011',location:'东门'}],recognitionPendingChecks:[],recognitionMissingChecks:[]});
 assert.ok(!html.includes('选择点检器材'));assert.ok(!html.includes('未识别到编号'));assert.ok(!html.includes('关联当前器材'));assert.ok(!html.includes('手动登记'));
});

test('a device photo result is shown only inside its own device dialog',async()=>{const html=await render(component('components/fire/FirePhotoRecognition.vue'),{},{selectedCycle:{inspectionMonth:'2026-11',status:'open'},photoRecognition:{enabled:true,periodMonth:'2026-11'},recognitionContext:{pointId:4,assetId:7},recognitionResponse:{status:'awaiting_confirmation',recognition:{inspectionMonth:'2026-11',checks:[]}},recognitionDraft:{assetId:7,manualChecks:{}},recognitionCandidates:[],recognitionPendingChecks:[],recognitionMissingChecks:[]});assert.ok(!html.includes('核对点检'));assert.ok(!html.includes('选择点检器材'));});

test('the App save action stays in the dialog footer, requires all manual choices, and is scoped to the current device',async()=>{
 const dialog=component('components/fire/FirePointDetail.vue');
 const f={executionMode:true,recognitionContext:{pointId:4,assetId:7},recognitionResponse:{status:'awaiting_confirmation'},recognitionDraft:{assetId:7},recognitionBusy:false,recognitionMissingChecks:[{key:'pressure'}],detailTab:'inspect',activePointId:4,activeAssetId:7,detailVisible:true,detail:null,targetAsset:{code:'011'},filteredRecords:[],visibleRecords:[],displayedAssets:[],assetTitle:()=> '灭火器011',clearRecognition(){},confirmRecognition(){},openPoint(){},detailClosed(){}};
 let html=await render(dialog,{},f);assert.ok(html.includes('待确认 1 项'));assert.match(html,/<button[^>]*disabled[^>]*>确认保存<\/button>/);
 html=await render(dialog,{},{...f,recognitionMissingChecks:[]});assert.ok(html.includes('结果已确认'));assert.ok(!html.match(/<button[^>]*disabled[^>]*>确认保存<\/button>/));
 html=await render(dialog,{},{...f,recognitionContext:{pointId:9,assetId:7}});assert.ok(!html.includes('确认保存'));
 html=await render(dialog,{},{...f,detailTab:'history'});assert.ok(!html.includes('确认保存'));
});

test('App completed devices display records and normal or abnormal status without four navigation tabs',async()=>{
 const f={executionMode:true,detailVisible:true,detailTab:'history',activePointId:4,activeAssetId:7,targetAsset:{id:7,code:'011',type:'extinguisher',inspectionStatus:'checked'},detail:{point:{id:4,name:'东门',areaName:'东区'},issues:[]},filteredRecords:[{id:12,result:'normal'}],visibleRecords:[{id:12,result:'normal'}],displayedAssets:[],historyLimit:10,assetTitle:()=> '灭火器011',location:()=> '东门',recognitionContext:{},recognitionMissingChecks:[],recognitionDraft:{},canRecord:()=>false};
 const dialog=component('components/fire/FirePointDetail.vue');
 let html=await render(dialog,{},f);assert.ok(html.includes('正常'));assert.ok(html.includes('关闭此对话框'));for(const text of ['el-tabs','器材信息','拍照识别','确认保存'])assert.ok(!html.includes(text),text);
 html=await render(dialog,{},{...f,filteredRecords:[{id:13,result:'abnormal'}]});assert.ok(html.includes('异常'));assert.ok(html.includes('fire-result-abnormal'));
});

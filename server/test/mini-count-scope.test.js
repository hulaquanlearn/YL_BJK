const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function page(name,{admin=true,api={}}={}){
 let definition;const calls=[];
 const auth={requireLogin:()=>true,isAdmin:()=>admin,isViewer:()=>!admin,getUser:()=>({displayName:'合成盘点员'}),userWorkshopCode:()=>admin?'':'qu_making',canSubmitInventory:()=>true,requireInventorySubmit:()=>true};
 const wx={showToast:o=>calls.push({toast:o.title}),navigateTo:o=>calls.push({url:o.url}),navigateBack:()=>calls.push({back:true}),redirectTo:o=>calls.push({url:o.url}),showLoading(){},hideLoading(){}};
 const defaults={getFilters:async()=>({data:{workshops:[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'},{code:'brewing',name:'酿酒车间'}],areas:['合成货区'],shelfMap:{},layerMap:{}}}),getInventoryOrders:async()=>({data:[]}),getParts:async()=>({data:[],total:0}),createInventoryOrder:async()=>{calls.push({created:true})}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,`../../miniprogram/pages/${name}/${name}.js`),'utf8'),{Page:p=>definition=p,require:p=>p.includes('/api')?{...defaults,...api}:p.includes('/auth')?auth:require('../../miniprogram/services/utils'),wx,console,setTimeout,clearTimeout});
 const s={...definition,data:structuredClone(definition.data),setData(values,callback){Object.assign(this.data,values);callback?.()}};return {s,calls};
}
test('mini administrator chooses a business workshop before loading count locations or navigating',async()=>{
 const scopes=[],{s,calls}=page('filter',{api:{getFilters:async options=>{scopes.push({...options});return {data:{workshops:[{code:'raw_grain',name:'原粮车间'},{code:'qu_making',name:'制曲车间'}],areas:['制曲货区'],shelfMap:{},layerMap:{}}}}}});
 await s.onLoad();assert.equal(s.data.workshops.length,1);s.confirmFinalFilter();assert.equal(calls.some(c=>c.url),false);
 await s.onBusinessWorkshop({detail:{value:2}});assert.equal(scopes.at(-1).workshopCode,'qu_making');assert.equal(s.data.workshops[1],'制曲货区');s.confirmFinalFilter();assert.match(calls.at(-1).url,/workshopCode=qu_making/)
})
test('mini count requires admin scope and forces assigned staff scope over forged link parameters',async()=>{
 const missing=page('inventory');missing.s.onLoad({});assert.equal(missing.calls.some(c=>c.back),true);assert.equal(missing.s.data.isReadOnly,true);
 const seen=[],staff=page('inventory',{admin:false,api:{getParts:async p=>{seen.push({...p});return {data:[],total:0}}}});staff.s.onLoad({workshopCode:'raw_grain',workshop:'货区50%'});await new Promise(r=>setImmediate(r));assert.equal(seen[0].workshopCode,'qu_making');assert.equal(staff.s.data.filterParams.workshop,'货区50%');
})
test('mini count scopes every list request and blocks mixed workshop rows before submit',async()=>{
 const seen=[],{s,calls}=page('inventory',{api:{getParts:async p=>{seen.push({...p});return {data:[],total:0}}}});s.onLoad({workshopCode:'brewing'});await new Promise(r=>setImmediate(r));assert.equal(seen[0].workshopCode,'brewing');
 s.data.inventoryList=[{_id:1,workshopCode:'brewing',checkStatus:'正常'},{_id:2,workshopCode:'qu_making',checkStatus:'正常'}];await s.submitInventoryToApprove();assert.equal(calls.some(c=>c.created),false);assert.match(calls.at(-1).toast,/其他车间/)
})
test('mini count ignores obsolete location filters when the workshop changes during a pending response',async()=>{
 const pending=[];const {s}=page('filter',{api:{getFilters:()=>new Promise(resolve=>pending.push(resolve))}});s.data.selectedWorkshopCode='raw_grain';const first=s.loadFilterOptions();s.data.selectedWorkshopCode='qu_making';const second=s.loadFilterOptions();pending[1]({data:{areas:['制曲'],workshops:[],layerMap:{}}});await second;pending[0]({data:{areas:['原粮'],workshops:[],layerMap:{}}});await first;assert.equal(s.data.workshops[1],'制曲')
})

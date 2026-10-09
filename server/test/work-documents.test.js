const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../src/work-flow'),register=require('../src/work-flow-routes');
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),W=require('../src/work-assessment');
function setup(binding=[]){
 const handlers=new Map(),calls=[];const router={};for(const verb of ['get','post','delete'])router[verb]=(url,...chain)=>handlers.set(`${verb} ${url}`,chain.at(-1));
 const db={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('FROM work_catalog_versions'))return [[]];if(sql.includes('FROM work_document_bindings'))return [binding];return [[]]}};
 register(router,{pool:db,ok:(res,data)=>res.json(data),transaction:fn=>fn(db)});return {handlers,calls,db};
}
test('document bindings override defaults by stable duty ID and explicit unbind stays unbound',async()=>{
 const {db}=setup([{duty_id:'standard_operation',document_title:'新版记录',document_url:'https://example.com/current',revision:2},{duty_id:'process_adjustment',document_title:'',document_url:'',revision:3}]);
 const catalog=await F.getCatalog(db,W.week(today));
 assert.equal(catalog.get('standard_operation').documentUrl,'https://example.com/current');assert.equal(catalog.get('standard_operation').documentScreenshotRequired,true);
 assert.equal(catalog.get('process_adjustment').documentUrl,'');assert.equal(catalog.get('process_adjustment').documentScreenshotRequired,false);
 assert.equal(require('../src/work-duties').get('standard_operation').documentUrl,'https://www.kdocs.cn/l/cuvwtXifQI5l');
});
test('document edits are administrator-only and reject unsafe URLs before saving',async()=>{
 const {handlers,calls}=setup(),post=handlers.get('post /documents');
 for(const role of ['viewer','qu_making','raw_grain','brewing'])await assert.rejects(()=>post({user:{id:2,role},body:{}},{}),{status:403});
 for(const documentUrl of ['javascript:alert(1)','file:///c:/a','https://user:secret@example.com'])await assert.rejects(()=>post({user:{id:1,role:'admin'},body:{dutyId:'standard_operation',documentTitle:'记录',documentUrl,revision:0}},{}),{status:400});
 assert.equal(calls.length,0);
});
test('stale document revisions and inactive or unknown duties cannot overwrite bindings',async()=>{
 const {handlers,calls}=setup([{duty_id:'standard_operation',document_title:'新版',document_url:'https://example.com/new',revision:2}]),post=handlers.get('post /documents');
 const body={dutyId:'standard_operation',documentTitle:'旧版',documentUrl:'https://example.com/old',revision:1};
 await assert.rejects(()=>post({user:{id:1,role:'admin'},body},{}),{status:409});
 await assert.rejects(()=>post({user:{id:1,role:'admin'},body:{...body,dutyId:'missing',revision:0}},{}),{status:400});
 assert.ok(calls.every(([sql])=>!sql.startsWith('INSERT')));
});
test('saving or removing a binding preserves work records and scopes SQL to 制曲车间',async()=>{
 const {handlers,calls}=setup(),post=handlers.get('post /documents');let response;
 await post({user:{id:1,role:'admin'},body:{dutyId:'standard_operation',documentTitle:'',documentUrl:'',revision:0}},{json:data=>response=data});
 assert.equal(response.saved,true);const write=calls.find(([sql])=>sql.startsWith('INSERT'));assert.equal(write[1][0],'qu_making');assert.equal(write[1][2],'');assert.equal(write[1][3],'');assert.match(write[0],/revision=revision\+1/);
 assert.ok(calls.every(([sql])=>!sql.includes('work_records')));
});

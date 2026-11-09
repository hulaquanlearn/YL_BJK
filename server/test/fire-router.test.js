const test=require('node:test');
const assert=require('node:assert/strict');
const {createRouter}=require('../src/routes/fire-inspection');
// Invoke the Express router directly; these tests never allocate a listening port.
function request(router,{method='POST',url='/points/4/records',body={},user={id:5,role:'viewer',displayName:'张三'}}={}){
 return new Promise((resolve,reject)=>{
  const req={method,url,originalUrl:url,query:Object.fromEntries(new URL(url,'http://local').searchParams),body,user,headers:{}};
  const res={statusCode:200,set(){return this;},status(code){this.statusCode=code;return this;},json(data){resolve({status:this.statusCode,body:data});},type(){return this;},send(data){resolve({status:this.statusCode,body:data});}};
  router.handle(req,res,error=>reject(error||new Error('No route matched')));
 });
}
function fixture({photoOwner=5,revoked=false,multi=false}={}){
 const assets=[{id:7,type:'extinguisher',name:'灭火器',quantity:1,status:'active'},...(multi?[{id:8,type:'extinguisher',name:'灭火器',quantity:1,status:'active'}]:[])];
 const state={records:[],mappings:[],photos:[{id:11,point_id:4,asset_id:multi?7:null,owner_id:photoOwner,record_id:null,issue_id:null,mime:'image/jpeg',filename:'现场.jpg'},...(multi?[{id:12,point_id:4,asset_id:8,owner_id:5,record_id:null,issue_id:null,mime:'image/jpeg',filename:'现场B.jpg'}]:[])],revoked};let backup;
 const db={beginTransaction:async()=>{backup=structuredClone(state);},commit:async()=>{},rollback:async()=>{Object.assign(state,backup);},release(){},getConnection:async()=>db,query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT m.area_id'))return[state.revoked?[]:[{area_id:2}]];
  if(sql.startsWith('SELECT cp.*,c.status'))return[[{area_id:2,cycle_status:'open',snapshot_json:{id:args[1],areaId:2,code:'P4',name:'北门',assets}}]];
  if(sql.startsWith('SELECT id,point_id,cycle_id,items_json'))return[state.records.filter(r=>r.actor_id===args[0]&&r.request_id===args[1])];
  if(sql.startsWith('SELECT id FROM fire_records WHERE cycle_id'))return[state.records.filter(r=>r.cycle_id===args[0]&&r.point_id===args[1])];
  if(sql.startsWith('SELECT asset_id,record_id,'))return[state.mappings.filter(r=>r.cycle_id===args[0]&&r.point_id===args[1]).map(m=>({...m,...Object.fromEntries(['actor_name','actual_checked_at'].map(k=>[k,state.records.find(r=>r.id===m.record_id)?.[k]]))}))];
  if(sql.startsWith('INSERT INTO fire_records')){const keys=['cycle_id','point_id','area_id','actor_id','actor_name','actual_checked_at','backfill_reason','result','remark','items_json','point_snapshot','request_id'],r={id:state.records.length+1,submitted_at:'2026-10-26 04:01:00'};keys.forEach((k,i)=>r[k]=args[i]);state.records.push(r);return[{insertId:r.id}];}
  if(sql.startsWith('SELECT id,owner_id,point_id,'))return[state.photos.filter(p=>args.includes(p.id))];
  if(sql.startsWith('UPDATE fire_photos SET record_id')){for(const p of state.photos)if(args.slice(1).includes(p.id))p.record_id=args[0];return[{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM fire_records WHERE id'))return[state.records.filter(r=>r.id===args[0])];
  if(sql.startsWith('INSERT INTO fire_record_assets')){const keys=['cycle_id','point_id','asset_id','record_id','result'],row={};keys.forEach((k,i)=>row[k]=args[i]);state.mappings.push(row);return[{affectedRows:1}];}
  if(sql.includes('FROM fire_photos WHERE record_id'))return[state.photos.filter(p=>p.record_id===args[0])];
  throw new Error(`Unexpected query: ${sql}`);
 }};
 return{state,router:createRouter(db)};
}
const payload=()=>({cycleId:1,result:'normal',items:[{assetId:7,result:'normal',remark:''}],photoIds:[11],requestId:'idempotent_12345',actorId:999,actorName:'伪造'});




test('fire router immediately rejects revoked independent access before any business operation',async()=>{
 const {state,router}=fixture({revoked:true});await assert.rejects(()=>request(router,{body:payload()}),/未授权消防点检/);assert.equal(state.records.length,0);
});
test('fire scan opens the automatic current month and reports a replaced old object unassigned while explicit history remains available',async()=>{
 const asset=id=>({id,type:'extinguisher',name:'灭火器',quantity:1,status:'active'});
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT cp.cycle_id')){assert.ok(!sql.includes('JSON_CONTAINS'));return[[{cycle_id:2}]];}
  if(sql.startsWith('SELECT cp.*,c.status'))return[[{area_id:2,cycle_status:'open',cycle_name:args[0]===2?'新周期':'旧周期',snapshot_json:{id:4,areaId:2,code:'P4',name:'北门',assets:[asset(args[0]===2?8:7)]}}]];
  if(sql.startsWith('SELECT asset_id,record_id'))return[[]];
  if(sql.startsWith('SELECT r.id,r.result'))return[[]];
  if(sql.startsWith('SELECT p.*,a.name AS area_name'))return[[{id:4,area_id:2,area_name:'一区',code:'P4',name:'北门'}]];
  if(sql.startsWith('SELECT * FROM fire_assets WHERE point_id'))return[[{...asset(8),point_id:4}]];
  if(sql.startsWith('SELECT * FROM fire_assets WHERE id'))return[[{...asset(7),point_id:4,active:0}]];
  if(sql.startsWith('SELECT id FROM fire_records'))return[[]];
  if(sql.startsWith('SELECT area_id,section_name FROM fire_points'))return[[{area_id:2}]];
  if(sql.startsWith('SELECT id,active FROM fire_assets'))return[[{id:7,active:0}]];
  if(sql.includes('FROM fire_photos WHERE point_id'))return[[]];
  if(sql.startsWith('SELECT * FROM fire_issues WHERE point_id'))return[[]];
  throw Error(`Unexpected query: ${sql}`);
 }};
 const router=createRouter(db,{currentPeriod:async()=>({id:2,automatic:true,inspectionMonth:'2026-10'})}),user={id:1,role:'admin',displayName:'管理员'};
 const current=await request(router,{method:'GET',url:'/points/4?assetId=7',user});assert.equal(current.body.data.cycleId,2);assert.equal(current.body.data.dispatchStatus,'unassigned');assert.equal(current.body.data.workOrder,null);assert.equal(current.body.data.targetAsset.id,7);assert.equal(current.body.data.targetAsset.status,'retired');
 const past=await request(router,{method:'GET',url:'/points/4?cycleId=1&assetId=7',user});assert.equal(past.body.data.workOrder.cycleId,1);assert.equal(past.body.data.workOrder.assetId,7);assert.equal(past.body.data.workOrder.status,'pending');
});

test('standalone manual record endpoint is retired and cannot write a completion',async()=>{const {state,router}=fixture();const r=await request(router,{body:payload()});assert.equal(r.status,410);assert.match(r.body.msg,/先拍照/);assert.equal(state.records.length,0);assert.equal(state.mappings.length,0);});

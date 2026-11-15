/* Read-only audit probes, 2026-11-15.
 * Run from repository root: node --test docs/PROJECT_AUDIT_20261115_REPRO.cjs
 * PASS means the documented CURRENT DEFECT was observed, not that it is fixed.
 * Executes real source with in-memory DB/browser mocks. No listener, DB, network,
 * filesystem writes, credentials, or production modules with startup effects.
 * After fixes, replace/invert these observations in permanent regression tests.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const utils = {...require('../server/src/utils'), asyncHandler: fn => fn};
const scope = require('../server/src/workshop-scope');
function load(relative, mocks, globals={}) {
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,relative),'utf8'), {
    module, exports:module.exports, require:name=>{
      if (!(name in mocks)) throw new Error('Unexpected dependency: '+name);
      return mocks[name];
    }, Buffer, console, ...globals
  }, {filename:relative});
  return module.exports;
}
function router() {
  const handlers = new Map();
  const api = {use(){}};
  for (const method of ['get','post','patch','delete','put']) api[method]=(url,...chain)=>handlers.set(method+' '+url,chain.at(-1));
  return {handlers, api};
}
function response() { return {body:null,statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;},cookie(){},clearCookie(){}}; }
function operations(pool) {
  const r=router(); const multer=()=>({single:()=>()=>{}});multer.memoryStorage=()=>({});
  load('server/src/routes/operations.js',{
    express:{Router:()=>r.api},crypto,path,multer,'read-excel-file/node':{},'../db':{pool},'../utils':utils,
    '../workshop-scope':scope,'../inventory-guards':{...require('../server/src/inventory-guards'),findPendingInventoryOrder:async()=>null},
    '../data-quality':{},'../movement-metadata':require('../server/src/movement-metadata'),
    '../import-workbook':{},'../warehouse-join':{warehouseJoin:()=>''}
  });
  return r.handlers;
}
test('OBSERVED A01: old-password login can mint a usable session after password change commits',async()=>{
  let user={id:1,username:'audit',display_name:'Audit',role:'admin',enabled:1,password_hash:'OldAudit1',token_version:0};
  let sessions=[],sequence=0,unblock,notify;
  const blocked=new Promise(resolve=>notify=resolve), gate=new Promise(resolve=>unblock=resolve);
  async function query(sql,args=[]) {
    if(sql.includes('FROM app_users WHERE username'))return [[{...user}]];
    if(sql.startsWith('SELECT password_hash'))return [[{password_hash:user.password_hash}]];
    if(sql.startsWith('UPDATE app_users SET last_login_at')){notify();await gate;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE app_users SET password_hash')){user.password_hash=args[0];user.token_version++;return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM app_sessions WHERE user_id')){sessions=[];return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM app_sessions WHERE expires'))return [{affectedRows:0}];
    if(sql.startsWith('INSERT INTO app_sessions')){sessions.push({id:++sequence,token_hash:args[1]});return [{insertId:sequence}];}
    if(sql.includes('FROM app_sessions s')){const s=sessions.find(s=>s.token_hash===args[0]);return [s?[{...user,session_id:s.id}]:[]];}
    throw new Error('Unexpected SQL: '+sql);
  }
  const connection={query,async beginTransaction(){},async commit(){},async rollback(){},release(){}};
  const pool={query,async getConnection(){return connection;}};
  const auth=load('server/src/auth.js',{crypto,'./config':{env:'development',auth:{sessionHours:8}},'./db':{pool},'./utils':utils,'./workshop-scope':scope});
  const r=router();
  load('server/src/routes/auth.js',{
    express:{Router:()=>r.api},'express-rate-limit':()=>()=>{},'../db':{pool},'../utils':utils,'../auth':auth,
    '../password-policy':{validatePassword:v=>v},'../password':{verifyPassword:async(p,h)=>p===h,hashPassword:async p=>p},
    '../fire-access':{loadFireAccess:async()=>({canRead:true})}
  });
  const loginResponse=response();
  const pendingLogin=r.handlers.get('post /login')({body:{username:'audit',password:'OldAudit1'}},loginResponse);
  await blocked;
  await r.handlers.get('post /change-password')({user:{id:1},body:{oldPassword:'OldAudit1',newPassword:'NewAudit2'}},response());
  assert.equal(user.password_hash,'NewAudit2');assert.equal(sessions.length,0);
  unblock();await pendingLogin;
  const token=loginResponse.body.data.token;let authorized=false;
  await auth.requireAuth({get:()=>`Bearer ${token}`},response(),()=>authorized=true);
  assert.equal(authorized,true,'CURRENT DEFECT: pre-change credentials produced a valid post-change session');
});
for(const [name,relative] of [['office','spare-parts-web-release/src/api/office.js'],['rawDuty','spare-parts-web-release/src/api/raw-duties.js']]) {
  function client() {
    let token='account-A',cleared=0,redirects=0,request,success,failure;
    const instance={interceptors:{request:{use(fn){request=fn;}},response:{use(ok,bad){success=ok;failure=bad;}}}};
    let source=fs.readFileSync(path.join(root,relative),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
    source+='\n;globalThis.auditClient=true;';
    vm.runInNewContext(source,{axios:{create:()=>instance},ElMessage:{error(){}},getToken:()=>token,clearSession:()=>{cleared++;token='';},location:{assign(){redirects++;}},clientPlatform:()=> 'web',Blob});
    return {request,success,failure,switch(){token='account-B';},state:()=>({token,cleared,redirects})};
  }
  test('OBSERVED A02 '+name+': late account-A 401 clears account-B session',async()=>{
    const c=client(),config=c.request({headers:{}});c.switch();
    await assert.rejects(()=>c.failure({config,response:{status:401,data:{msg:'expired'}}}));
    assert.equal(c.state().token,'');assert.equal(c.state().redirects,1);
  });
  test('OBSERVED A02 '+name+': late account-A success is still delivered after switching accounts',()=>{
    const c=client(),config=c.request({headers:{}});c.switch();
    const result=c.success({config,data:{owner:'account-A'}});
    assert.equal(result.owner,'account-A');assert.equal(c.state().token,'account-B');
  });
}
test('OBSERVED A02 mini: late 401 clears new session; late success is not rejected',async()=>{
  let token='account-A',pending=[],cleared=0;
  const api=load('miniprogram/services/api.js',{'../config.js':{apiBaseUrl:'https://example.invalid'},'./auth.js':{
    isRawEmployee:()=>false,isViewer:()=>false,getToken:()=>token,goLogin:()=>{cleared++;token='';}
  }},{wx:{request:options=>pending.push(options)}});
  const first=api.getParts();token='account-B';
  pending.shift().success({statusCode:401,data:{success:false,msg:'expired'}});
  await assert.rejects(()=>first);assert.equal(token,'');assert.equal(cleared,1);
  token='account-A';const second=api.getParts();token='account-B';
  pending.shift().success({statusCode:200,data:{success:true,data:{owner:'account-A'}}});
  assert.equal((await second).data.owner,'account-A');
});
test('OBSERVED A03: create A -> rename B -> create A hits retained unique equipment code',async()=>{
  const rows=[];
  async function query(sql,args=[]) {
    if(sql.startsWith('SELECT id FROM workshop_equipment')) return [rows.filter(r=>r.workshop_code===args[0]&&r.equipment_name===args[1]&&(args.length<3||r.id!==args[2])).map(r=>({id:r.id}))];
    if(sql.startsWith('SELECT *,COALESCE'))return [[{...rows.find(r=>r.id===args[0]),workshopCode:'raw_grain'}]];
    if(sql.includes('INSERT INTO workshop_equipment')){
      if(rows.some(r=>r.equipment_code===args[1]))throw Object.assign(new Error('Duplicate equipment_code'),{code:'ER_DUP_ENTRY'});
      const row={id:rows.length+1,workshop_code:args[0],equipment_code:args[1],equipment_name:args[2],status:'active'};rows.push(row);return [{insertId:row.id}];
    }
    if(sql.startsWith('UPDATE workshop_equipment SET equipment_name')){rows.find(r=>r.id===args[4]).equipment_name=args[0];return [{affectedRows:1}];}
    throw new Error('Unexpected SQL: '+sql);
  }
  const connection={query,async beginTransaction(){},async commit(){},async rollback(){},release(){}};
  const handlers=operations({query,async getConnection(){return connection;}}),user={role:'admin'};
  const create=handlers.get('post /equipment'),rename=handlers.get('patch /equipment/:id');
  await create({user,body:{workshopCode:'raw_grain',equipmentName:'Audit-A'}},response());
  await rename({user,params:{id:'1'},body:{equipmentName:'Audit-B'}},response());
  assert.equal(rows.some(r=>r.equipment_name==='Audit-A'),false);
  await assert.rejects(()=>create({user,body:{workshopCode:'raw_grain',equipmentName:'Audit-A'}},response()),e=>e.status===409);
});
for(const [label,item] of [['missing',{inventoryId:1}],['null',{inventoryId:1,quantity:null}],['empty',{inventoryId:1,quantity:''}],['boolean',{inventoryId:1,quantity:true}],['array',{inventoryId:1,quantity:[2]}]]) {
  test('OBSERVED A04: batch quantity '+label+' reaches stock mutation SQL',async()=>{
    const writes=[];
    const connection={async beginTransaction(){},async commit(){},async rollback(){},release(){},async query(sql,args){
      if(sql.startsWith('SELECT i.id'))return [[{id:1,quantity:10,workshopCode:'raw_grain'}]];
      if(sql.startsWith('UPDATE')||sql.includes('INSERT INTO stock_movements')){writes.push({sql,args});return [{affectedRows:1}];}
      throw new Error('Unexpected SQL: '+sql);
    }};
    const handler=operations({async getConnection(){return connection;}}).get('post /stock-movements/batch');
    await handler({user:{id:1,role:'admin',displayName:'Audit'},body:{type:'in',reasonCode:'other_in',items:[item]}},response());
    assert.equal(writes.length,2);
    const actual=writes[1].args[2];
    assert.equal(actual, label==='boolean'?1:label==='array'?2:null);
  });
}

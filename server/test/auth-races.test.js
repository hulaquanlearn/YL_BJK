const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function fixture(){
 let user={id:1,username:'audit',display_name:'Audit',role:'admin',enabled:1,token_version:0,password_hash:'hash:OldAudit1'},sessions=[],nextId=0,owner=null,queue=[],gate=null;
 const writerBlocked=deferred(),routes=new Map(),utils={...require('../src/utils'),asyncHandler:fn=>fn},response=()=>({body:null,cookies:[],statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v},cookie(...v){this.cookies.push(v)},clearCookie(){}});
 const arm=kind=>{const entered=deferred(),release=deferred();gate={kind,entered,release};return {entered:entered.promise,release:release.resolve}},pause=async kind=>{if(gate?.kind===kind){const g=gate;gate=null;g.entered.resolve();await g.release.promise}};
 async function acquire(c){if(c.locked)return;if(owner){writerBlocked.resolve();await new Promise(resolve=>queue.push(resolve))}owner=c;c.locked=true;c.before={user:{...user},sessions:sessions.map(s=>({...s}))}}
 function release(c){if(!c.locked)return;c.locked=false;owner=null;queue.shift()?.()}
 async function query(sql,args=[],c){
  if(sql.includes('FROM app_sessions s')){const s=sessions.find(s=>s.token_hash===args[0]);return [s?[{...user,session_id:s.id}]:[]]}
  if(sql.includes('FROM app_users')){if(sql.includes('FOR UPDATE'))await acquire(c);return [[{...user}]]}
  if(sql.startsWith('UPDATE app_users')){await acquire(c);if(sql.includes('password_hash')){user.password_hash=args[0];user.token_version++}else if(sql.includes('enabled = ?')){user.enabled=args[0];if(!user.enabled)user.token_version++}return[{affectedRows:1}]}
  if(sql.startsWith('DELETE FROM app_sessions WHERE expires'))return[{affectedRows:0}];
  if(sql.startsWith('DELETE FROM app_sessions')){sessions=[];return[{affectedRows:1}]}
  if(sql.startsWith('INSERT INTO app_sessions')){await pause('insert');sessions.push({id:++nextId,token_hash:args[1]});return[{insertId:nextId}]}
  throw Error('Unexpected authentication SQL: '+sql);
 }
 const connection=()=>({locked:false,async beginTransaction(){},query(sql,args){return query(sql,args,this)},async commit(){release(this)},async rollback(){if(this.locked){user={...this.before.user};sessions=this.before.sessions.map(s=>({...s}));release(this)}},release(){release(this)}});
 const pool={async query(sql,args){const c=connection();try{return await query(sql,args,c)}finally{c.release()}},async getConnection(){return connection()}};
 const password={async verifyPassword(p,h){const valid=h==='hash:'+p;await pause('verify');return valid},async hashPassword(p){await pause('hash');return 'hash:'+p}};
 function load(file,mocks){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/',file),'utf8'),{module,exports:module.exports,require:n=>{assert.ok(n in mocks,n);return mocks[n]},console,Buffer},{filename:file});return module.exports}
 const auth=load('auth.js',{crypto,'./config':{env:'development',auth:{sessionHours:8}},'./db':{pool},'./utils':utils,'./workshop-scope':require('../src/workshop-scope')});
 function router(prefix){const r={use(){}};for(const m of ['get','post','patch','delete'])r[m]=(url,...chain)=>routes.set(prefix+m+' '+url,chain.at(-1));return r}
 load('routes/auth.js',{express:{Router:()=>router('auth:')},'express-rate-limit':()=>()=>{},'../db':{pool},'../utils':utils,'../auth':auth,'../password-policy':{validatePassword:v=>v},'../password':password,'../fire-access':{loadFireAccess:async()=>({canRead:true})}});
 load('routes/users.js',{express:{Router:()=>router('users:')},'../db':{pool},'../utils':utils,'../auth':auth,'../password-policy':{validatePassword:v=>v},'../password':password,'../workshop-scope':require('../src/workshop-scope'),'../staff-identity':require('../src/staff-identity')});
 const call=async(key,body)=>{const res=response();await routes.get(key)({user:{id:key.startsWith('users:')?2:1,role:'admin'},params:{id:'1'},body},res);return res};
 return{arm,call,writerBlocked:writerBlocked.promise,auth,response,state:()=>({user:{...user},sessions:[...sessions]}),login:()=>call('auth:post /login',{username:'audit',password:'OldAudit1'}),change:p=>call('auth:post /change-password',{oldPassword:'OldAudit1',newPassword:p}),reset:p=>call('users:post /:id/reset-password',{password:p})};
}
for(const kind of ['password change','admin reset','disable'])test('old credentials cannot create a session across '+kind,async()=>{
 const f=fixture(),g=f.arm('verify'),login=f.login();await g.entered;
 if(kind==='password change')await f.change('NewAudit2');else if(kind==='admin reset')await f.reset('ResetAudit3');else await f.call('users:patch /:id',{enabled:false});
 g.release();await assert.rejects(login,e=>e.status===401);assert.equal(f.state().sessions.length,0);
});
for(const kind of ['another change','admin reset'])test('stale password change cannot overwrite '+kind,async()=>{
 const f=fixture(),g=f.arm('hash'),old=f.change('StaleAudit2');await g.entered;
 if(kind==='another change')await f.change('CurrentAudit3');else await f.reset('CurrentAudit3');
 g.release();await assert.rejects(old,e=>e.status===401);assert.equal(f.state().user.password_hash,'hash:CurrentAudit3');assert.equal(f.state().user.token_version,1);
});
test('reset waits for an in-transaction login and then revokes its newly inserted session',async()=>{
 const f=fixture(),g=f.arm('insert'),login=f.login();await g.entered;const reset=f.reset('NewAudit2');await f.writerBlocked;assert.equal(f.state().user.password_hash,'hash:OldAudit1');g.release();const res=await login;await reset;assert.equal(f.state().sessions.length,0);await assert.rejects(()=>f.auth.requireAuth({get:()=>`Bearer ${res.body.data.token}`},f.response(),()=>{}),e=>e.status===401);
});
test('normal login keeps its token, cookies and independent fire grants; logout revokes it',async()=>{
 const f=fixture(),res=await f.login();assert.equal(res.body.data.user.fireAccess.canRead,true);assert.equal(res.cookies.length,2);let req={get:()=>`Bearer ${res.body.data.token}`},allowed=false;await f.auth.requireAuth(req,f.response(),()=>allowed=true);assert.equal(allowed,true);await f.call('auth:post /logout',{});assert.equal(f.state().sessions.length,0);
});

const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{once}=require('node:events');
const {pool}=require('../src/db'),config=require('../src/config');
const {createAccessLimits,privateResponse,businessAiAllowed}=require('../src/data-protection');
const listen=async app=>{const server=app.listen(0,'127.0.0.1');await once(server,'listening');return {server,base:`http://127.0.0.1:${server.address().port}`}};
const stop=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});

test('production route chain protects business APIs and uploaded assets, revokes disabled sessions and accepts cookies only on read assets',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spare-private-assets-'));await fs.writeFile(path.join(dir,'private.jpg'),'private-fixture');
 const savedQuery=pool.query,savedDir=config.parts.uploadDir;config.parts.uploadDir=dir;let queries=0,enabled=true;
 pool.query=async sql=>{queries++;if(sql.includes('FROM app_sessions'))return [[{id:91,username:'synthetic',display_name:'Test',role:'viewer',enabled:enabled?1:0,session_id:2}]];throw new Error('Unexpected business access')};
 const {server,base}=await listen(require('../src/app'));
 try{
  for(const url of ['/models/reference-20260904/manifest.json','/models/categories/motor.glb','/api/parts','/api/users','/api/part-model-library','/api/knowledge/1/download','/api/knowledge/1/preview','/api/plc/projects/1','/uploads/part-images/private.jpg','/uploads/part-models/private.glb']){const res=await fetch(base+url);assert.equal(res.status,401,url);assert.match(res.headers.get('cache-control'),/no-store/)}
  assert.equal(queries,0,'anonymous requests must stop before DB access');
  const token='A'.repeat(43),cookie=`spare_parts_asset_session=${token}`,headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(base+'/api/users',{headers:{cookie}})).status,401,'asset cookie must not authorize APIs');
  assert.equal((await fetch(base+'/uploads/part-images/private.jpg?token='+token)).status,401,'URL tokens must not be accepted');
  const me=await fetch(base+'/api/auth/me',{headers});assert.equal(me.status,200);const setCookie=me.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Path=\/uploads/);assert.match(setCookie,/SameSite=Strict/);
  for(const auth of [headers,{cookie}]){const asset=await fetch(base+'/uploads/part-images/private.jpg',{headers:auth});assert.equal(asset.status,200);assert.equal(await asset.text(),'private-fixture');assert.match(asset.headers.get('cache-control'),/no-store/);assert.equal(asset.headers.get('etag'),null)}
  assert.equal((await fetch(base+'/uploads/part-images/private.jpg',{method:'POST',headers:{cookie}})).status,405);
  enabled=false;assert.equal((await fetch(base+'/uploads/part-images/private.jpg',{headers:{cookie}})).status,401);
 }finally{await stop(server);pool.query=savedQuery;config.parts.uploadDir=savedDir;await fs.rm(dir,{recursive:true,force:true})}
});

test('account throttling survives changed IPs, keeps other users available, returns Retry-After and excludes query secrets from logs',async()=>{
 const logs=[],limits=createAccessLimits({ip:100,account:2,hourly:10,logger:value=>logs.push(value)}),app=express();app.set('trust proxy','loopback');app.use(privateResponse,limits.ip);app.use((req,_res,next)=>{req.user={id:req.headers['x-fixture-user']};next()});app.use(limits.account,limits.hourly);app.get('/parts',(_req,res)=>res.json({success:true}));const {server,base}=await listen(app);
 try{
  for(let i=0;i<2;i++)assert.equal((await fetch(base+'/parts',{headers:{'x-fixture-user':'1','x-forwarded-for':`10.0.0.${i}`}})).status,200);
  const blocked=await fetch(base+'/parts?password=do-not-log',{headers:{'x-fixture-user':'1','x-forwarded-for':'203.0.113.25'}});assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>0);assert.match((await blocked.json()).msg,/频繁/);
  assert.equal((await fetch(base+'/parts',{headers:{'x-fixture-user':'2'}})).status,200);assert.ok(logs.some(v=>v.includes('access_rate_limited')));assert.ok(logs.every(v=>!v.includes('do-not-log')));
 }finally{await stop(server)}
});

test('business AI egress is opt-in, literal loopback only, and retrieval does not call the gateway when protection is enabled',async()=>{
 for(const options of [{},{contextTransferEnabled:false,apiUrl:'http://127.0.0.1:14504'},{contextTransferEnabled:true,apiUrl:'https://external.example'},{contextTransferEnabled:true,apiUrl:'http://localhost.evil'},{contextTransferEnabled:true,apiUrl:'http://secret@127.0.0.1'},{contextTransferEnabled:true,apiUrl:'file:///private'}])assert.equal(businessAiAllowed(options),false);
 assert.equal(businessAiAllowed({contextTransferEnabled:true,apiUrl:'http://127.0.0.1:14504/v1/chat/completions'}),true);
 const saved=pool.query,oldMode=config.openclaw.contextTransferEnabled,oldToken=config.openclaw.token,savedFetch=global.fetch;let outbound=0;
 config.openclaw.contextTransferEnabled=false;config.openclaw.token='synthetic-gateway-token';pool.query=async sql=>{
  if(sql.includes('FROM plc_projects'))return [[{id:1,name:'Private fixture',parseStatus:'parsed'}]];
  if(sql.includes('FROM plc_program_items'))return [[{id:1,itemType:'block',name:'Main',contentText:'private_program',metadata:'{}'}]];
  if(sql.includes('FROM fermentation_knowledge_entries'))return [[{id:1,title:'设备维修',summary:'private_knowledge',revisionNo:1}]];
  return [[]];
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:1,role:'viewer'};next()});app.use(require('../src/routes/ai'),require('../src/routes/plc'));app.use((err,_req,res,_next)=>res.status(err.status||500).json({msg:err.message}));const {server,base}=await listen(app);
 global.fetch=(url,options)=>{if(String(url).startsWith(base+'/'))return savedFetch(url,options);outbound++;throw new Error('No egress allowed')};
 try{
  for(const [url,body] of [['/ai/chat',{messages:[{role:'user',content:'设备维修怎么处理'}]}],['/plc/projects/1/analyze',{question:'Main 程序用途'}]]){const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);const data=(await response.json()).data;assert.equal(data.degraded,true);assert.ok(data.evidence.length>0);assert.match(data.answer,/数据保护/)}assert.equal(outbound,0);
 }finally{global.fetch=savedFetch;await stop(server);pool.query=saved;config.openclaw.contextTransferEnabled=oldMode;config.openclaw.token=oldToken}
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {createPlatformUsageService,range,readSnapshot}=require('../src/openai-platform-usage');
const now=()=>Date.UTC(2026,10,2,9),keyId='key_test_only',env={OPENAI_USAGE_ADMIN_KEY:'sk-admin-TEST_ONLY_1234567890',OPENAI_USAGE_KEY_ID:keyId};
function page(kind,values,more=false,cursor=null){return {object:'page',data:[{start_time:Date.UTC(2026,10,1)/1000,end_time:Date.UTC(2026,10,2)/1000,results:values.map(v=>({object:kind,api_key_id:keyId,...v}))}],has_more:more,next_page:cursor}}
test('platform monitor reads only accounting GETs, filters one key, paginates and caches complete results without secrets',async()=>{
 const calls=[],usage=page('organization.usage.completions.result',[{num_model_requests:2,input_tokens:100,output_tokens:40,input_cached_tokens:10}],true,'next');
 const service=createPlatformUsageService({env,now,fetchImpl:async(url,opts)=>{const u=new URL(url);calls.push({u,opts});assert.equal(opts.method,'GET');assert.equal(u.origin,'https://api.openai.com');assert.equal(u.searchParams.get('api_key_ids'),keyId);assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+env.OPENAI_USAGE_ADMIN_KEY);return new Response(JSON.stringify(u.pathname.endsWith('costs')?page('organization.costs.result',[{amount:{currency:'usd',value:'0.0000075'}}]):u.searchParams.has('page')?page('organization.usage.completions.result',[{num_model_requests:1,input_tokens:10,output_tokens:5,input_cached_tokens:0}]):usage))}});
 const [a,b]=await Promise.all([service.read(),service.read()]);assert.equal(a,b);assert.equal(calls.length,3);assert.equal(a.totals.modelCalls,3);assert.equal(a.totals.totalTokens,155);assert.equal(a.costUsd,'0.000007500000');await service.read();assert.equal(calls.length,3);assert.doesNotMatch(JSON.stringify(a),/sk-admin|TEST_ONLY|key_test/);
});
test('failed, malformed and mismatched-key accounting never turn into a successful zero',async()=>{
 for(const fetchImpl of [async()=>new Response('{}',{status:403}),async()=>new Response('{}'),async()=>new Response(JSON.stringify(page('organization.usage.completions.result',[{api_key_id:'key_other',num_model_requests:99,input_tokens:100,output_tokens:40}])))]){const r=await createPlatformUsageService({env,now,fetchImpl}).read();assert.equal(r.status,'unavailable');assert.equal(r.totals??null,null);assert.equal(r.costUsd??null,null)}
});
test('valid empty accounting is zero while unavailable costs remain unknown',async()=>{
 const service=createPlatformUsageService({env,now,fetchImpl:async url=>new URL(url).pathname.endsWith('costs')?new Response('{}',{status:500}):new Response(JSON.stringify({object:'page',data:[],has_more:false,next_page:null}))});
 const r=await service.read();assert.equal(r.status,'partial');assert.equal(r.totals.modelCalls,0);assert.equal(r.costUsd,null);
});
test('platform date range rejects overflow, invalid dates and future days',()=>{
 for(const q of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-01-01',to:'2026-11-02'},{from:'2026-11-03',to:'2026-11-03'},{from:['2026-11-01'],to:'2026-11-02'}])assert.throws(()=>range(q,now()),{status:400});assert.equal(range({},now()).from,'2026-11-01');
});
test('server snapshot strips all extra identity and credential fields, marks stale data and rejects inconsistent totals',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-snapshot-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'usage.json'),value={status:'ok',from:'2026-11-01',to:'2026-11-01',checkedAt:'2026-11-01T00:00:00Z',totals:{modelCalls:1,inputTokens:4,outputTokens:3,totalTokens:7,cachedTokens:0},costUsd:'0.01',secret:'PRIVATE',key:'SECRET'};
 fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});const r=readSnapshot(file,Date.UTC(2026,10,2,13));assert.equal(r.stale,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET/);value.totals.totalTokens=99;fs.writeFileSync(file,JSON.stringify(value));assert.throws(()=>readSnapshot(file,now()));
});

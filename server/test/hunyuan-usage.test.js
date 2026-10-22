const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {readHyPlanUsage,normalizeHyUsage}=require('../src/hunyuan-usage');
const example=()=>({TokenPlanUsageList:[{TokenPlanPackage:{Plan:'tp_hy_standard',ExpireTime:'2026-11-07 16:21:59',ResourceId:'PRIVATE_RESOURCE'},TokenPlanResource:{CycleCapacity:'100000000',CycleCapacityCredits:'1560',CycleRemainCredits:'731.6153489939',CycleTotalUsageCredits:'828.3846510061',DailyUsageList:[{private:'PRIVATE_DETAIL'}]}}],ApiKey:'PRIVATE_KEY',RequestId:'PRIVATE_REQUEST'});
const env={TENCENT_HY_USAGE_SECRET_ID:'AKIDTEST',TENCENT_HY_USAGE_SECRET_KEY:'PRIVATEKEY'};
test('Hy plan reports actual credit units and precision, never legacy token counters or resource identities',()=>{
 const result=normalizeHyUsage(example()),plan=result.plans[0];assert.equal(result.status,'ok');assert.equal(plan.name,'Hy Token Plan Standard');assert.equal(plan.unit,'积分');assert.equal(plan.capacity,'1560');assert.equal(plan.remaining,'731.6153489939');assert.equal(plan.used,'828.3846510061');assert.equal(plan.expiresAt,'2026-11-07T16:21:59+08:00');assert.ok(Math.abs(plan.usedPercent-53.1015801927)<1e-8);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|100000000/);
});
test('missing credits cannot be misrepresented as zero or converted from legacy token capacity',()=>{
 for(const field of ['CycleCapacityCredits','CycleRemainCredits','CycleTotalUsageCredits']){const data=example();delete data.TokenPlanUsageList[0].TokenPlanResource[field];assert.throws(()=>normalizeHyUsage(data))}
 const zero=example();Object.assign(zero.TokenPlanUsageList[0].TokenPlanResource,{CycleRemainCredits:'0',CycleTotalUsageCredits:'1560'});assert.equal(normalizeHyUsage(zero).plans[0].remaining,'0');
 assert.equal(normalizeHyUsage({TokenPlanUsageList:[]}).status,'empty');assert.throws(()=>normalizeHyUsage({Error:{Code:'AuthFailure',Message:'PRIVATE_KEY'}}));
});
test('only the official read action for the Hunyuan edition is signed and requested',async()=>{
 let calls=0;const result=await readHyPlanUsage({env,now:()=>Date.parse('2026-10-18T08:00:00Z'),fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://hunyuan.tencentcloudapi.com/');assert.equal(options.method,'POST');assert.equal(options.headers['X-TC-Action'],'DescribeTokenPlanUsage');assert.equal(options.headers['X-TC-Version'],'2023-09-01');assert.equal(options.headers['X-TC-Timestamp'],'1792310400');assert.equal(options.body,'{"Edition":"hunyuan"}');assert.equal(options.redirect,'error');assert.match(options.headers.Authorization,/^TC3-HMAC-SHA256 Credential=AKIDTEST\/2026-10-18\/hunyuan\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/);assert.ok(!options.headers.Authorization.includes('PRIVATEKEY'));return new Response(JSON.stringify({Response:example()}))}});
 assert.equal(calls,1);assert.equal(result.checkedAt,'2026-10-18T08:00:00.000Z');assert.doesNotMatch(JSON.stringify(result),/AKID|PRIVATE/);
});
test('unconfigured readers do not query Tencent; incomplete credentials and upstream errors fail closed',async()=>{
 assert.equal((await readHyPlanUsage({env:{},fetchImpl:()=>assert.fail('No query without credentials')})).status,'unconfigured');
 await assert.rejects(readHyPlanUsage({env:{TENCENT_HY_USAGE_SECRET_ID:'AKIDTEST'},fetchImpl:()=>assert.fail('Incomplete credentials')}));
 await assert.rejects(readHyPlanUsage({env,fetchImpl:async()=>new Response('{}',{status:403})}));
 await assert.rejects(readHyPlanUsage({env,fetchImpl:async()=>new Response(JSON.stringify({Response:{Error:{Code:'UnauthorizedOperation'}}}))}));
});
test('private CSV credentials are read server-side without becoming usage output; error text stays private',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hy-usage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'private.csv');await fs.writeFile(file,'\uFEFF"SecretId","SecretKey"\r\n"AKIDTEST","PRIVATEKEY"\r\n');
 const result=await readHyPlanUsage({env:{TENCENT_HY_USAGE_CREDENTIALS_FILE:file},fetchImpl:async()=>new Response(JSON.stringify({Response:example()}))});assert.equal(result.status,'ok');assert.doesNotMatch(JSON.stringify(result),/private.csv|PRIVATE|AKID/);
 const publicResult=await require('../src/personal-usage').createUsageService({env:{TENCENT_HY_USAGE_CREDENTIALS_FILE:file},codexReader:async()=>({status:'unconfigured'}),fetchImpl:async()=>{throw Error(file+' PRIVATEKEY')}}).read();assert.equal(publicResult.hunyuan.status,'unavailable');assert.doesNotMatch(JSON.stringify(publicResult),/PRIVATE|private.csv|AKID/);
});

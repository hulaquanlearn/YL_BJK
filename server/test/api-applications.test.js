const test=require('node:test'),assert=require('node:assert/strict');
const {createApplicationReader}=require('../src/api-applications');
function fixture(overrides={}){
 const env={DEEPSEEK_API_KEY:'deep-private',GLM_API_KEY:'glm-private',USAGE_COUPLE_ENV_FILE:'/couple/.env',USAGE_WORKSHOP_ENV_FILE:'/workshop/.env',USAGE_OPENCLAW_CONFIG_FILE:'/openclaw.json',ROBOT_AGENT_ENABLED:'true',...overrides.env};
 const files={'/couple/.env':'SCHEDULE_VISION_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions\nSCHEDULE_VISION_API_KEY=glm-private\nSCHEDULE_VISION_MODEL=glm-4.5v',
 '/workshop/.env':'AI_PROVIDER=openclaw\nAI_MODEL=openclaw/quizforge-question\nOPENCLAW_GATEWAY_TOKEN=gateway-private\nTRANSLATION_PROVIDER=openclaw\nDEEPSEEK_API_KEY=deep-private\nDEEPSEEK_LOOKUP_MODEL=deepseek-flash\nGLM_TTS_API_KEY=glm-private\nGLM_TTS_VOICE=voice',
 '/workshop/src/companion-speech.js':"body:JSON.stringify({model:'glm-tts',input:text})",
 '/openclaw.json':JSON.stringify({models:{providers:{tencent:{baseUrl:'https://api.lkeap.cloud.tencent.com/v1',apiKey:'cloud-private'}}},agents:{defaults:{model:{primary:'tencent/hy3'}},list:[{id:'quizforge-question',model:'tencent/hy4-preview'}]}}),...overrides.files};
 const reader=createApplicationReader({env,readFile:async p=>{p=p.replace(/\\/g,'/');if(!(p in files))throw Error('PRIVATE_PATH '+p);return files[p]},stat:async()=>({isFile:()=>true,size:120}),now:()=>1793678400000});
 return {reader,settings:{provider:'deepseek',token:'deep-private',model:'deepseek-flash',visionEnabled:true,configuredOverride:false}};
}
test('cross-app metadata resolves exact deployed models, inherits agent defaults and never leaks secrets or paths',async()=>{
 const f=fixture(),r=await f.reader(f.settings),find=id=>r.rows.find(r=>r.id===id);
 assert.equal(find('couple-roster').model,'glm-4.5v');assert.equal(find('couple-roster').provider,'glm');assert.equal(find('couple-roster').accountMatch,'same');
 assert.equal(find('workshop-question').model,'hy4-preview');assert.equal(find('workshop-translation').model,'hy3');assert.equal(find('workshop-speech').model,'glm-tts');assert.equal(find('workshop-conversation').route,'直连 API');
 assert.equal(find('rawSummary').enabled,false);assert.equal(find('robot').enabled,true);
 assert.doesNotMatch(JSON.stringify(r),/private|\/workshop|\/couple|apiKey|api_key/i);assert.equal(r.sources.every(s=>s.status==='ok'),true);
});
test('workshop direct API configuration takes precedence and a different account is explicit',async()=>{
 const f=fixture({files:{'/workshop/.env':'AI_PROVIDER=glm\nAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4\nAI_API_KEY=another-private\nAI_MODEL=glm-4.7\nDEEPSEEK_API_KEY=deep-private'}}),r=await f.reader(f.settings),q=r.rows.find(r=>r.id==='workshop-question');
 assert.equal(q.route,'直连 API');assert.equal(q.provider,'glm');assert.equal(q.model,'glm-4.7');assert.equal(q.accountMatch,'different');assert.equal(q.enabled,true);assert.equal(r.rows.some(r=>r.id==='workshop-translation'),false);
});
test('missing files and unresolved agents stay unknown without disabling unrelated applications',async()=>{
 const f=fixture({files:{'/openclaw.json':'{}'}}),r=await f.reader(f.settings);assert.equal(r.rows.find(r=>r.id==='workshop-question').enabled,false);assert.equal(r.rows.find(r=>r.id==='workshop-question').model,null);assert.equal(r.rows.find(r=>r.id==='workshop-speech').enabled,true);
 const a=createApplicationReader({env:{USAGE_COUPLE_ENV_FILE:'/private'},stat:async()=>{throw Error('credential-private')}});const x=await a(f.settings);assert.equal(x.sources[0].status,'unavailable');assert.doesNotMatch(JSON.stringify(x),/credential-private|\/private/);
});
test('explicit model overrides and disabled feature gates reflect real channel behavior',async()=>{
 const f=fixture({env:{FIRE_PHOTO_AI_ENABLED:'false',KNOWLEDGE_AI_ENABLED:'false',RAW_DUTY_AI_SUMMARY_ENABLED:'true'}}),r=await f.reader({...f.settings,configuredOverride:true,model:'configured-model'});
 assert.equal(r.rows.find(r=>r.id==='firePhoto').enabled,false);assert.equal(r.rows.find(r=>r.id==='knowledge').enabled,false);assert.equal(r.rows.find(r=>r.id==='rawSummary').model,'configured-model');assert.equal(r.rows.find(r=>r.id==='rawSummary').enabled,true);
});

const test=require('node:test'),assert=require('node:assert/strict'),A=require('../src/ai-settings'),C=require('../src/ai-channels');
test('the bjk key is used by exactly the three requested features while robot retains its key',()=>{
 const env={DEEPSEEK_API_KEY:'fixture-original-key',RAW_GRAIN_BJK_API_KEY:'fixture-bjk-key',KNOWLEDGE_AI_MODEL:'deepseek-flash'},base=A.baseSettings(env);
 for(const feature of ['knowledge','rawSummary','firePhoto']){const s=C.resolve({role:'admin'},'deepseek',feature,{env,base});assert.equal(s.token,env.RAW_GRAIN_BJK_API_KEY);assert.equal(s.apiUrl,A.ENDPOINT);assert.equal(s.model,'deepseek-flash');assert.equal(s.visionEnabled,true)}
 for(const feature of ['robot'])assert.equal(C.resolve({role:'admin'},'deepseek',feature,{env,base}).token,env.DEEPSEEK_API_KEY);
 assert.ok(!JSON.stringify(C.choices({role:'admin'},'knowledge',{env,base})).includes('fixture-'));
 assert.equal(A.createSettingsService,undefined);
});
test('fire capability reads its dedicated key outside a model-request context',()=>{
 const s=require('../src/fire-recognition').configuration({RAW_GRAIN_BJK_API_KEY:'fixture-bjk-key',DEEPSEEK_API_KEY:'',FIRE_PHOTO_AI_MODEL:'deepseek-flash'});assert.equal(s.enabled,true);assert.equal(s.token,'fixture-bjk-key');
});

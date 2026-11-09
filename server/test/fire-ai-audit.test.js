'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {auditMiddleware,modelFetch,noteUsage,noteOutcome,noteOutcomeReason,features}=require('../src/ai-call-audit');
test('fire photo recognition audits the actor and model usage without retaining image or card content',async()=>{
 const rows=[],store={write:async row=>rows.push({...row}),finish:async row=>rows.push({...row})};
 const req={method:'POST',path:'/fire-inspection/photo-recognitions',user:{id:11,role:'viewer',username:'inspector',displayName:'点检员'},body:{},get:key=>key==='X-Client-Platform'?'android':undefined};
 const res=new EventEmitter();res.statusCode=200;res.writableFinished=true;
 await new Promise((resolve,reject)=>auditMiddleware(store)(req,res,async error=>{
  if(error)return reject(error);
  try{await modelFetch('https://api.deepseek.com/chat/completions',{body:JSON.stringify({model:'deepseek-flash',messages:[{content:'PRIVATE-CARD-IMAGE'}]})},async()=>({status:200}));noteUsage({usage:{prompt_tokens:30,completion_tokens:10,total_tokens:40}});noteOutcome('blocked');noteOutcomeReason('本月检查格未填写清楚'+'.'.repeat(600));res.emit('finish');resolve();}catch(e){reject(e);}
 }));
 assert.ok(features.includes('fire_photo_recognition'));
 const last=rows.at(-1);assert.equal(last.feature,'fire_photo_recognition');assert.equal(last.accountId,'11');assert.equal(last.client,'android');assert.equal(last.modelCalls,1);assert.equal(last.totalTokens,40);assert.equal(last.outcome,'blocked');assert.equal(last.httpStatus,200);assert.equal(last.upstreamStatus,200);assert.equal(last.reason.length,400);assert.match(last.reason,/本月检查格/);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE-CARD-IMAGE|Authorization|Bearer/);
});

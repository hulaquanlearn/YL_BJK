const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
test('mini assistant discards stale model metadata and conversations after account switch',async()=>{
 let user={id:1,role:'admin',username:'admin'},token='first',page;const pending=[];
 const auth={getUser:()=>user,getToken:()=>token,isAdmin:()=>user?.role==='admin',requireLogin:()=>true,canEditAnyWorkshop:()=>!!user&&user.role!=='viewer'};
 const context={Page:value=>page=value,require:p=>p.endsWith('/api.js')?{aiChannels:()=>new Promise(resolve=>pending.push(resolve))}:p.endsWith('/auth.js')?auth:{},wx:{showToast(){}},console,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../miniprogram/pages/aiAgent/aiAgent.js'),'utf8'),context);
 page.data=structuredClone(page.data);page.setData=patch=>Object.assign(page.data,patch);page.onShow();assert.equal(pending.length,1);
 user={id:2,username:'workshop',role:'raw_grain'};token='second';page.onShow();assert.equal(pending.length,2);
 pending[0]({data:{choices:[{id:'gpt',label:'GPT',model:'gpt-5.4-mini',configured:true}]}});await new Promise(r=>setImmediate(r));assert.equal(page.data.aiModelLabel,'');
 pending[1]({data:{choices:[{id:'deepseek',label:'DeepSeek',model:'deepseek-flash',configured:true}]}});await new Promise(r=>setImmediate(r));assert.equal(page.data.aiModelLabel,'DeepSeek · deepseek-flash');
 page.data.messages=[{content:'old account'}];user={id:3,username:'viewer',role:'viewer'};token='third';page.onShow();assert.equal(page.data.aiChoices.length,0);assert.equal(page.data.messages.length,0);assert.equal(page.data.canUseKnowledgeAI,false);
});

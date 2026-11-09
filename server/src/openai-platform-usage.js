'use strict';
const {ApiError}=require('./utils');
const ROOT='https://api.openai.com/v1/organization/';
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function readSnapshot(file,now){
 const fs=require('node:fs'),stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||process.platform!=='win32'&&(stat.mode&0o077))throw Error('snapshot');
 const data=JSON.parse(fs.readFileSync(file,'utf8')),at=Date.parse(data.checkedAt);
 range({from:data.from,to:data.to},now);
 if(!['ok','partial'].includes(data.status)||!Number.isFinite(at)||at>now+300000)throw Error('snapshot');
 let totals=null;if(data.totals){totals={};for(const k of ['modelCalls','inputTokens','outputTokens','totalTokens','cachedTokens']){if(k==='cachedTokens'&&data.totals[k]===null)totals[k]=null;else if(!integer(data.totals[k]))throw Error('snapshot');else totals[k]=data.totals[k];}if(totals.inputTokens+totals.outputTokens!==totals.totalTokens||totals.cachedTokens>totals.inputTokens)throw Error('snapshot');}
 const costUsd=data.costUsd===null?null:typeof data.costUsd==='string'&&/^-?\d{1,16}(?:\.\d{1,12})?$/.test(data.costUsd)?data.costUsd:null;
 if(!totals&&costUsd===null)throw Error('snapshot');
 return {status:data.status,from:data.from,to:data.to,timeZone:'UTC',source:'本机同步 · OpenAI 平台',checkedAt:data.checkedAt,stale:now-at>36*3600000,totals,costUsd,costPending:data.costPending===true,currency:'USD',scope:'目标密钥的平台GPT对话用量；费用包含该密钥全部账单项目',message:data.costPending===true?'平台费用暂未出账，不能按0元理解；调用用量为本机采集快照。':'本机采集快照；平台数据可能延迟，费用以最终账单为准。',dashboard:'https://platform.openai.com/usage'};
}
function range(query={},now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),from=query.from||today.slice(0,7)+'-01',to=query.to||today;
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!date(from)||!date(to)||from>to||to>today||Date.parse(to)-Date.parse(from)>30*86400000)throw new ApiError(400,'请选择不超过31天的有效日期，不能晚于今天（UTC）');
 return {from,to,start:Date.parse(from)/1000,end:Math.min(Date.parse(to)/1000+86400,Math.floor(now/1000))};
}
function createPlatformUsageService({env=process.env,fetchImpl=fetch,now=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map();
 async function read(query={}){
  const dates=range(query,now()),base={from:dates.from,to:dates.to,timeZone:'UTC',source:'OpenAI Usage / Costs API',scope:'按密钥筛选的平台用量，不限于本系统；调用次数与Token为GPT对话用量，费用为该密钥全部账单项目',dashboard:'https://platform.openai.com/usage',checkedAt:new Date(now()).toISOString()};
  const key=env.OPENAI_USAGE_ADMIN_KEY||'',keyId=env.OPENAI_USAGE_KEY_ID||'';
  if(!key||!keyId){
   const file=env.OPENAI_USAGE_SNAPSHOT_FILE||require('node:path').resolve(__dirname,'../../server-private-usage/openai-usage.json');
   try{return readSnapshot(file,now())}catch(e){return {...base,status:e.code==='ENOENT'?'unconfigured':'unavailable',message:e.code==='ENOENT'?'尚未采集平台统计。使用本机只读采集工具同步；统计凭据保留在本机。':'平台用量快照无效，暂不展示数值，请重新采集。'};}
  }
  if(!/^sk-[A-Za-z0-9_-]{16,500}$/.test(key)||!/^key[_-][A-Za-z0-9_-]{6,150}$/.test(keyId))return {...base,status:'unavailable',message:'平台统计配置无效，请联系系统管理员。'};
  const identity=JSON.stringify([key,keyId,dates.from,dates.to]),hit=cache.get(identity);
  if(hit&&now()-hit.at<60000)return hit.value;
  if(pending.has(identity))return pending.get(identity);
  const request=(async()=>{
   const signal=AbortSignal.timeout(12000);
   async function pages(path,kind){
    const rows=[],seen=new Set();let cursor;
    for(let i=0;i<40;i++){
     const url=new URL(ROOT+path);url.searchParams.set('start_time',String(dates.start));url.searchParams.set('end_time',String(dates.end));url.searchParams.set('api_key_ids',keyId);url.searchParams.set('group_by','api_key_id');url.searchParams.set('bucket_width','1d');url.searchParams.set('limit','31');if(cursor)url.searchParams.set('page',cursor);
     const res=await fetchImpl(url.href,{method:'GET',redirect:'error',signal,headers:{Authorization:'Bearer '+key,Accept:'application/json'}});
     if(!res.ok){const e=Error('upstream');e.status=res.status;throw e;}
     const raw=await res.text();if(raw.length>2*1024*1024)throw Error('size');const json=JSON.parse(raw);
     if(json.object!=='page'||!Array.isArray(json.data)||typeof json.has_more!=='boolean')throw Error('shape');
     for(const b of json.data){
      if(!Array.isArray(b.results)||!integer(b.start_time)||!integer(b.end_time)||b.start_time>=b.end_time||b.end_time<=dates.start||b.start_time>=dates.end)throw Error('bucket');
      for(const row of b.results){if(row.api_key_id!==keyId||row.object!==kind)throw Error('scope');rows.push(row);}
     }
     if(!json.has_more)return rows;
     if(typeof json.next_page!=='string'||!json.next_page||json.next_page.length>2000||seen.has(json.next_page))throw Error('cursor');
     seen.add(json.next_page);cursor=json.next_page;
    }throw Error('pages');
   }
   try{
    const [usage,costs]=await Promise.allSettled([pages('usage/completions','organization.usage.completions.result'),pages('costs','organization.costs.result')]);
    let totals=null,costUsd=null;
    if(usage.status==='fulfilled'){
     totals={modelCalls:0,inputTokens:0,outputTokens:0,totalTokens:0,cachedTokens:0};
     for(const r of usage.value){for(const k of ['num_model_requests','input_tokens','output_tokens'])if(!integer(r[k]))throw Error('tokens');totals.modelCalls+=r.num_model_requests;totals.inputTokens+=r.input_tokens;totals.outputTokens+=r.output_tokens;if(r.input_cached_tokens===null||r.input_cached_tokens===undefined)totals.cachedTokens=null;else if(!integer(r.input_cached_tokens)||r.input_cached_tokens>r.input_tokens)throw Error('cache');else if(totals.cachedTokens!==null)totals.cachedTokens+=r.input_cached_tokens;}
     totals.totalTokens=totals.inputTokens+totals.outputTokens;if(Object.values(totals).some(v=>v!==null&&!integer(v)))throw Error('overflow');
    }
    if(costs.status==='fulfilled'){
     let sum=0n;for(const r of costs.value){const amount=r.amount,value=typeof amount?.value==='number'&&Number.isFinite(amount.value)?amount.value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:12}):String(amount?.value);if(amount?.currency!=='usd'||!/^[-]?\d+(?:\.\d{1,12})?$/.test(value))throw Error('amount');const neg=value.startsWith('-'),parts=value.replace(/^-/,'').split('.');sum+=(neg?-1n:1n)*(BigInt(parts[0])*1000000000000n+BigInt((parts[1]||'').padEnd(12,'0')));}
     costUsd=(sum<0n?'-':'')+((sum<0n?-sum:sum)/1000000000000n).toString()+'.'+((sum<0n?-sum:sum)%1000000000000n).toString().padStart(12,'0');
    }
    const costPending=costs.status==='fulfilled'&&!costs.value.length&&totals?.modelCalls>0;if(costPending)costUsd=null;
    const failure=[usage,costs].find(r=>r.status==='rejected')?.reason,status=totals&&costUsd!==null?'ok':totals||costUsd!==null?'partial':'unavailable';
    const value={...base,status,totals,costUsd,costPending,currency:'USD',message:costPending?'平台调用用量已取得，费用暂未出账，不能按0元理解。':status==='ok'?'平台数据可能延迟更新；费用以最终账单为准。':failure?.status===401||failure?.status===403?'平台统计授权不足或密钥无效，请检查Admin用量读取权限。':'平台统计暂时无法读取，请检查网络及接口状态。'};
    if(status==='ok'){cache.clear();cache.set(identity,{at:now(),value});}
    return value;
   }catch{return {...base,status:'unavailable',message:'平台统计返回的数据不完整或无法验证，暂不展示数值。'};}
  })();pending.set(identity,request);try{return await request}finally{pending.delete(identity)}
 }
 return {read};
}
module.exports={createPlatformUsageService,range,readSnapshot};

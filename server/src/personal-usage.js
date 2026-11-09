const {readCodexUsage}=require('./codex-usage');
const {readHyPlanUsage}=require('./hunyuan-usage');
const money=value=>typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?value:null;
const apiMoney=value=>money(typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:12}):value);
async function readJson(url,key,fetchImpl){
  const response=await fetchImpl(url,{headers:{Authorization:key,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Provider unavailable');
  const content=await response.text();if(content.length>1024*1024)throw Error('Provider response too large');return JSON.parse(content);
}
function createUsageService({fetchImpl=(...args)=>fetch(...args),codexReader=readCodexUsage,env=process.env,now=()=>Date.now(),settingsReader=()=>require('./ai-settings').currentSettings(env),applicationsReader=require('./api-applications').createApplicationReader({env,now}),expenseReader=require('./application-expenses').createExpenseReader({now:()=>new Date(now())})}={}){
 let cached=null,inFlight=null;
 async function read(){
  const settings=settingsReader(),cacheKey=JSON.stringify([settings.provider,settings.apiUrl,settings.model,settings.token,env.RAW_GRAIN_BJK_API_KEY]);
  if(cached&&cached.key===cacheKey&&now()-cached.at<30000)return cached.data;
  if(inFlight?.key===cacheKey)return inFlight.promise;
  const pending=(async()=>{
   const checkedAt=new Date(now()).toISOString();
   const safe=async(fn,message)=>{try{return await fn()}catch{return {status:'unavailable',checkedAt,message}}};
   const [deepseek,glm,codex,hunyuan,applications,rawGrainBjk,expenses]=await Promise.all([
    safe(async()=>{
     if(settings.provider!=='deepseek'||settings.apiUrl!=='https://api.deepseek.com/chat/completions')return {status:'unconfigured',message:'当前使用兼容模型服务，余额请在对应服务商后台查询'};
     if(!settings.token)return {status:'unconfigured',message:'尚未配置 DeepSeek Key'};
     const json=await readJson('https://api.deepseek.com/user/balance','Bearer '+settings.token,fetchImpl);
     if(!Array.isArray(json.balance_infos)||!json.balance_infos.length)throw Error('Missing balance');
     const balances=json.balance_infos.slice(0,5).filter(b=>['CNY','USD'].includes(b.currency)).map(b=>({currency:b.currency,total:money(b.total_balance),granted:money(b.granted_balance),toppedUp:money(b.topped_up_balance)}));
     if(!balances.length||balances.some(b=>b.total===null))throw Error('Invalid balance');
     return {status:'ok',checkedAt,available:json.is_available===true,balances};
    },'DeepSeek 余额暂时读取失败，请稍后刷新。'),
    safe(async()=>{
     if(!env.GLM_API_KEY)return {status:'unconfigured',message:'尚未配置 GLM Key'};
     const json=await readJson('https://open.bigmodel.cn/api/biz/account/query-customer-account-report',env.GLM_API_KEY,fetchImpl);
     if(json.success!==true||!json.data||apiMoney(json.data.availableBalance)===null)throw Error('Missing API balance');
     return {status:'ok',checkedAt,currency:'CNY',balance:apiMoney(json.data.availableBalance),totalSpent:apiMoney(json.data.totalSpendAmount),todaySpent:apiMoney(json.data.todaySpendAmount)};
    },'GLM API 账户余额暂时读取失败，请稍后刷新。'),
    safe(codexReader,'本机 Codex 用量暂时读取失败，请确认本机已登录 Codex。'),
    safe(()=>readHyPlanUsage({env,fetchImpl,now}),'混元套餐用量暂时读取失败，请稍后重试。'),
    safe(()=>applicationsReader(settings),'应用模型配置暂时读取失败。'),
    safe(async()=>{if(!env.RAW_GRAIN_BJK_API_KEY)return {status:'unconfigured'};const json=await readJson('https://api.deepseek.com/user/balance','Bearer '+env.RAW_GRAIN_BJK_API_KEY,fetchImpl);if(!Array.isArray(json.balance_infos))throw Error('Missing balance');const balances=json.balance_infos.filter(b=>['CNY','USD'].includes(b.currency)).map(b=>({currency:b.currency,total:money(b.total_balance)}));if(!balances.length||balances.some(b=>b.total===null))throw Error('Invalid balance');return {status:'ok',checkedAt,available:json.is_available===true,balances,accountLabel:'原粮 bjk'}},'原粮 bjk 余额暂时读取失败。'),
    safe(async()=>({status:'ok',...await expenseReader()}),'应用费用暂时读取失败。')
   ]);
   if(applications?.rows)applications.rows=applications.rows.map(row=>({...row,...(row.app==='数字工作台'&&expenses.status==='ok'?{expense:expenses.byFeature[row.id],expenseFrom:expenses.from,expenseTo:expenses.to}: {})}));
   const data={checkedAt,cacheSeconds:30,deepseek,glm,codex,hunyuan,applications,rawGrainBjk,expenses:expenses.status==='ok'?{status:'ok',from:expenses.from,to:expenses.to,priceSource:expenses.priceSource,pricingAsOf:expenses.pricingAsOf}:{status:'unavailable'},activeProvider:settings.provider};
   if(settingsReader().token===settings.token&&settingsReader().apiUrl===settings.apiUrl)cached={at:now(),key:cacheKey,data};return data;
  })();inFlight={key:cacheKey,promise:pending};try{return await pending}finally{if(inFlight?.promise===pending)inFlight=null}
 }
 return {read};
}
module.exports={createUsageService};

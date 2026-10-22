const {readCodexUsage}=require('./codex-usage');
const {readHyPlanUsage}=require('./hunyuan-usage');
const money=value=>typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?value:null;
const apiMoney=value=>money(typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:12}):value);
async function readJson(url,key,fetchImpl){
  const response=await fetchImpl(url,{headers:{Authorization:key,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('Provider unavailable');
  const content=await response.text();if(content.length>1024*1024)throw Error('Provider response too large');return JSON.parse(content);
}
function createUsageService({fetchImpl=(...args)=>fetch(...args),codexReader=readCodexUsage,env=process.env,now=()=>Date.now()}={}){
 let cached=null,inFlight=null;
 async function read(){
  if(cached&&now()-cached.at<30000)return cached.data;
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   const checkedAt=new Date(now()).toISOString();
   const safe=async(fn,message)=>{try{return await fn()}catch{return {status:'unavailable',checkedAt,message}}};
   const [deepseek,glm,codex,hunyuan]=await Promise.all([
    safe(async()=>{
     if(!env.DEEPSEEK_API_KEY)return {status:'unconfigured',message:'尚未配置 DeepSeek Key'};
     const json=await readJson('https://api.deepseek.com/user/balance','Bearer '+env.DEEPSEEK_API_KEY,fetchImpl);
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
    safe(()=>readHyPlanUsage({env,fetchImpl,now}),'混元套餐用量暂时读取失败，请稍后重试。')
   ]);
   const data={checkedAt,cacheSeconds:30,deepseek,glm,codex,hunyuan};cached={at:now(),data};return data;
  })();try{return await inFlight}finally{inFlight=null}
 }
 return {read};
}
module.exports={createUsageService};

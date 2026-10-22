const crypto=require('node:crypto'),fs=require('node:fs/promises');
const endpoint='https://hunyuan.tencentcloudapi.com/';
const amount=value=>typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)&&value.length<=40&&Number.isFinite(Number(value))?value:null;
const time=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value.replace(' ','T')+'+08:00'))?value.replace(' ','T')+'+08:00':null;
async function credentials(env){
 if(env.TENCENT_HY_USAGE_SECRET_ID&&env.TENCENT_HY_USAGE_SECRET_KEY)return {id:env.TENCENT_HY_USAGE_SECRET_ID,key:env.TENCENT_HY_USAGE_SECRET_KEY};
 if(env.TENCENT_HY_USAGE_SECRET_ID||env.TENCENT_HY_USAGE_SECRET_KEY)throw Error('Incomplete credentials');
 if(!env.TENCENT_HY_USAGE_CREDENTIALS_FILE)return null;
 const stat=await fs.stat(env.TENCENT_HY_USAGE_CREDENTIALS_FILE);if(!stat.isFile()||stat.size>4096)throw Error('Invalid credential file');
 const rows=(await fs.readFile(env.TENCENT_HY_USAGE_CREDENTIALS_FILE,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>line.split(',').map(value=>value.trim().replace(/^"|"$/g,'')));
 if(rows.length!==2)throw Error('Invalid credential file');
 const columns=rows[0].map(value=>value.toLowerCase()),id=rows[1][columns.indexOf('secretid')],key=rows[1][columns.indexOf('secretkey')];
 if(!/^AKID[A-Za-z0-9]+$/.test(id||'')||!key||!/^[A-Za-z0-9]+$/.test(key))throw Error('Invalid credentials');return {id,key};
}
function normalizeHyUsage(response){
 if(response?.Error||!Array.isArray(response?.TokenPlanUsageList))throw Error('Invalid usage response');
 if(!response.TokenPlanUsageList.length)return {status:'empty',message:'当前腾讯云账号没有混元个人套餐。',plans:[]};
 const plans=response.TokenPlanUsageList.slice(0,10).map(row=>{
  const pack=row.TokenPlanPackage||{},resource=row.TokenPlanResource||{},capacity=amount(resource.CycleCapacityCredits),remaining=amount(resource.CycleRemainCredits),used=amount(resource.CycleTotalUsageCredits);
  if(capacity===null||remaining===null||used===null)throw Error('Missing credit usage');
  const tier={tp_hy_lite:'Lite',tp_hy_standard:'Standard',tp_hy_pro:'Pro',tp_hy_max:'Max'}[pack.Plan];
  return {name:'Hy Token Plan'+(tier?' '+tier:''),unit:'积分',capacity,remaining,used,usedPercent:Number(capacity)>0?Number(used)/Number(capacity)*100:null,expiresAt:time(pack.ExpireTime)};
 });
 return {status:'ok',plans};
}
async function readHyPlanUsage({env=process.env,fetchImpl=fetch,now=()=>Date.now()}={}){
 const secret=await credentials(env);if(!secret)return {status:'unconfigured',message:'尚未接入混元套餐用量'};
 const timestamp=Math.floor(now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10),scope=date+'/hunyuan/tc3_request',body=JSON.stringify({Edition:'hunyuan'});
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
 const canonical='POST\n/\n\ncontent-type:application/json\nhost:hunyuan.tencentcloudapi.com\n\ncontent-type;host\n'+hash(body);
 const signature=hmac(hmac(hmac(hmac('TC3'+secret.key,date),'hunyuan'),'tc3_request'),'TC3-HMAC-SHA256\n'+timestamp+'\n'+scope+'\n'+hash(canonical)).toString('hex');
 const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-TC-Action':'DescribeTokenPlanUsage','X-TC-Version':'2023-09-01','X-TC-Timestamp':String(timestamp),Authorization:'TC3-HMAC-SHA256 Credential='+secret.id+'/'+scope+', SignedHeaders=content-type;host, Signature='+signature},body,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Usage unavailable');const text=await response.text();if(text.length>1024*1024)throw Error('Response too large');
 return {...normalizeHyUsage(JSON.parse(text).Response),checkedAt:new Date(now()).toISOString()};
}
module.exports={readHyPlanUsage,normalizeHyUsage};

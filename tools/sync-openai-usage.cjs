// Read platform accounting through the owner's configured proxy. No model calls;
// the Admin key stays in the owner's private desktop file, never in a snapshot.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
async function collect({credentialFile,output,keyId}={}){
 const file=path.resolve(credentialFile||process.env.OPENAI_USAGE_CREDENTIAL_FILE||path.join(process.env.USERPROFILE||'','OneDrive/桌面/账号及密码_整理汇总.md'));
 let curl=process.env.OPENAI_USAGE_CURL||(process.platform==='win32'?'curl.exe':'curl');
 if(process.platform==='win32'&&!process.env.OPENAI_USAGE_CURL){try{const git=cp.execFileSync('where.exe',['git'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/)[0],candidate=path.resolve(path.dirname(git),'../mingw64/bin/curl.exe');if(fs.existsSync(candidate))curl=candidate;}catch{}}
 const keys=[...new Set(fs.readFileSync(file,'utf8').match(/sk-admin-[A-Za-z0-9_-]{16,500}/g)||[])];
 if(keys.length!==1)throw Error('请在本机私有账号文件中保留一条明确的用量统计Admin密钥。');
 async function accountingFetch(url,options){
  const target=new URL(url);if(target.origin!=='https://api.openai.com'||!target.pathname.startsWith('/v1/organization/'))throw Error('Invalid accounting endpoint');
  const config='url = "'+url+'"\nheader = "Authorization: '+options.headers.Authorization+'"\nheader = "Accept: application/json"\n';
  const raw=cp.execFileSync(curl,['--config','-','--silent','--retry','2','--retry-all-errors','--retry-delay','1','--retry-max-time','25','--max-time','12','--write-out','\n%{http_code}'],{input:config,encoding:'utf8',windowsHide:true,timeout:40000,maxBuffer:2*1024*1024,stdio:['pipe','pipe','ignore']});
  const split=raw.lastIndexOf('\n'),status=Number(raw.slice(split+1));if(!status)throw Error('Platform network unavailable');
  return new Response(raw.slice(0,split),{status});
 }
 async function list(path){const rows=[];let after='';for(let i=0;i<30;i++){const url=new URL('https://api.openai.com/v1/organization/'+path);url.searchParams.set('limit','100');if(after)url.searchParams.set('after',after);const r=await accountingFetch(url.href,{headers:{Authorization:'Bearer '+keys[0]}});if(!r.ok)throw Error('平台密钥资料读取失败，请检查Admin查询权限。');const json=await r.json();if(!Array.isArray(json.data))throw Error('平台返回无效资料。');rows.push(...json.data);if(!json.has_more)return rows;const next=json.last_id||json.data.at(-1)?.id;if(!next||next===after)throw Error('平台分页异常。');after=next;}throw Error('平台资料过多。');}
 if(!keyId){const projects=await list('projects'),matches=[];for(const project of projects.filter(p=>p.name==='czs')){if(!/^proj_[A-Za-z0-9_-]+$/.test(project.id))throw Error('平台项目ID无效。');const candidates=await list('projects/'+project.id+'/api_keys');for(const k of candidates)if(k.name==='deepseek'&&typeof k.redacted_value==='string'&&k.redacted_value.endsWith('cs4A'))matches.push(k);}if(matches.length!==1)throw Error('平台中没有找到唯一匹配的deepseek密钥，请核对项目与密钥名称。');keyId=matches[0].id;}
 const env={OPENAI_USAGE_ADMIN_KEY:keys[0],OPENAI_USAGE_KEY_ID:keyId},data=await require('../server/src/openai-platform-usage').createPlatformUsageService({env,fetchImpl:accountingFetch}).read();
 if(data.status!=='ok'&&!(data.status==='partial'&&data.totals&&data.costPending))throw Error(data.message||'平台统计未完整返回，原快照保留。');
 const dest=path.resolve(output||process.argv[2]||'.local/openai-usage-sync/openai-usage.json');fs.mkdirSync(path.dirname(dest),{recursive:true});const temp=dest+'.'+require('node:crypto').randomUUID()+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});fs.renameSync(temp,dest);
 return {file:dest,from:data.from,to:data.to,checkedAt:data.checkedAt,modelCalls:data.totals.modelCalls,totalTokens:data.totals.totalTokens,costUsd:data.costUsd};
}
if(require.main===module)collect().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message.includes('密钥')||e.message.includes('平台')?e.message:'平台用量采集失败，原快照保留。');process.exitCode=1});
module.exports={collect};

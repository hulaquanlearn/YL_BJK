'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),dotenv=require('dotenv');
const modelId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)&&!/^sk-/i.test(value)?value:null;
function providerFor(url){try{return ({'api.deepseek.com':'deepseek','open.bigmodel.cn':'glm','api.lkeap.cloud.tencent.com':'hunyuan','api.hunyuan.cloud.tencent.com':'hunyuan','api.openai.com':'openai'})[new URL(url).hostname]||'other'}catch{return 'other'}}
// Read only explicitly configured deployment files. Never import another app,
// mutate its environment, return credentials, or invoke a model to discover it.
function createApplicationReader({env=process.env,readFile=fs.readFile,stat=fs.stat,now=()=>Date.now()}={}){
 async function read(file,json=false){if(!file)return null;const info=await stat(file);if(!info.isFile()||info.size>512*1024)throw Error('Invalid configuration');const raw=await readFile(file,'utf8');return json?JSON.parse(raw):dotenv.parse(raw)}
 return async function applications(settings){
  const rows=[],sources=[];
  const add=(id,app,purpose,provider,model,enabled,route='',key='')=>rows.push({id,app,purpose,provider,model:modelId(model),enabled:Boolean(enabled&&modelId(model)),route,accountMatch:key&&provider==='glm'?(key===env.GLM_API_KEY?'same':'different'):key&&provider==='deepseek'?(key===settings.token?'same':'different'):'unknown'});
  const own=[['knowledge','知识问答','KNOWLEDGE_AI_MODEL',env.KNOWLEDGE_AI_ENABLED!=='false'],['rawSummary','履职周总结','RAW_DUTY_AI_MODEL',env.RAW_DUTY_AI_SUMMARY_ENABLED==='true'],['robot','机器人程序分析','ROBOT_AGENT_MODEL',env.ROBOT_AGENT_ENABLED==='true'],['firePhoto','消防拍照识别','FIRE_PHOTO_AI_MODEL',env.FIRE_PHOTO_AI_ENABLED!=='false'&&settings.visionEnabled!==false]];
  for(const[id,purpose,key,enabled]of own){const active=require('./ai-settings').featureSettings(id,env,settings);add(id,'数字工作台',purpose,'deepseek',active.provider==='deepseek'&&active.configuredOverride?active.model:env[key]||'deepseek-flash',enabled&&!!(active.provider==='deepseek'?active.token:env.DEEPSEEK_API_KEY),'直连 API',active.provider==='deepseek'?active.token:env.DEEPSEEK_API_KEY);rows[rows.length-1].accountLabel=active.accountLabel||'默认密钥';}
  let couple,workshop,openclaw;
  for(const[id,key,json]of [['couple','USAGE_COUPLE_ENV_FILE',false],['workshop','USAGE_WORKSHOP_ENV_FILE',false],['openclaw','USAGE_OPENCLAW_CONFIG_FILE',true]]){
   try{const value=await read(env[key],json);sources.push({id,status:value?'ok':'unconfigured'});if(id==='couple')couple=value;else if(id==='workshop')workshop=value;else openclaw=value}catch{sources.push({id,status:'unavailable'})}
  }
  if(couple){const provider=providerFor(couple.SCHEDULE_VISION_URL||(couple.SCHEDULE_VISION_PROVIDER==='glm'?'https://open.bigmodel.cn/':''));add('couple-roster','情侣','排班照片识别',provider,couple.SCHEDULE_VISION_MODEL||(couple.SCHEDULE_VISION_PROVIDER==='glm'?'glm-4.6v':''),!!couple.SCHEDULE_VISION_API_KEY,'直连 API',couple.SCHEDULE_VISION_API_KEY)}
  function agent(id){
   const entry=openclaw?.agents?.list?.find(item=>item.id===id),configured=entry?.model||openclaw?.agents?.defaults?.model,full=typeof configured==='string'?configured:configured?.primary;
   if(!full||typeof full!=='string'||!full.includes('/'))return {provider:'other',model:null,ready:false};const split=full.indexOf('/'),name=full.slice(0,split),model=full.slice(split+1),p=openclaw?.models?.providers?.[name];
   return {provider:providerFor(p?.baseUrl),model,ready:Boolean(p?.apiKey),route:'OpenClaw · '+(modelId(id)||'未确认代理')};
  }
  if(workshop){
   const e=workshop;
   if(e.AI_PROVIDER==='openclaw'||!e.AI_API_KEY&&e.OPENCLAW_GATEWAY_TOKEN){const id=String(e.AI_MODEL||e.OPENCLAW_QUESTION_AGENT||'openclaw/quizforge-question').replace(/^openclaw\//,''),a=agent(id);add('workshop-question','智题工坊','材料出题',a.provider,a.model,!!e.OPENCLAW_GATEWAY_TOKEN&&a.ready,a.route)}
   else add('workshop-question','智题工坊','材料出题',providerFor(e.AI_BASE_URL||'https://api.openai.com/v1'),e.AI_MODEL||'gpt-4.1-mini',!!e.AI_API_KEY,'直连 API',e.AI_API_KEY);
   if(e.TRANSLATION_PROVIDER==='openclaw'){const id=String(e.OPENCLAW_TRANSLATION_AGENT||'openclaw/quizforge-translator').replace(/^openclaw\//,''),a=agent(id);add('workshop-translation','智题工坊','中英翻译',a.provider,a.model,!!e.OPENCLAW_GATEWAY_TOKEN&&a.ready,a.route)}
   for(const[id,purpose]of [['lookup','资料查找'],['conversation','对话']])add('workshop-'+id,'智题工坊',purpose,'deepseek',e.DEEPSEEK_LOOKUP_MODEL||'deepseek-flash',!!e.DEEPSEEK_API_KEY,'直连 API',e.DEEPSEEK_API_KEY);
   // This model is fixed in the deployed speech implementation, not its .env.
   let speechModel=null;try{const file=path.join(path.dirname(env.USAGE_WORKSHOP_ENV_FILE),'src/companion-speech.js'),text=await readFile(file,'utf8');speechModel=text.match(/model\s*:\s*['"]([^'"]+)['"]/)?.[1]}catch{}
   add('workshop-speech','智题工坊','陪伴语音播报','glm',speechModel,!!e.GLM_TTS_API_KEY&&!!e.GLM_TTS_VOICE,'直连 API',e.GLM_TTS_API_KEY);
  }
  return {checkedAt:new Date(now()).toISOString(),rows,sources:sources.filter(s=>s.id!=='openclaw'||rows.some(r=>r.route?.startsWith('OpenClaw'))||workshop?.AI_PROVIDER==='openclaw'||workshop?.TRANSLATION_PROVIDER==='openclaw')};
 }
}
module.exports={createApplicationReader,providerFor};

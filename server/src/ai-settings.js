'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ApiError}=require('./utils');
const {endpoint}=require('./ai-provider-transport');
const ENDPOINT='https://api.deepseek.com/chat/completions';
const privateFile=()=>path.resolve(process.env.AI_SETTINGS_FILE||path.join(__dirname,'../.env.ai-settings'));
const storageError=()=>new ApiError(503,'AI 私有配置暂不可用，请检查文件权限；在用配置未被替换');
function keyInput(value){if(typeof value!=='string'||/[\r\n]/.test(value)||value.length>512)throw new ApiError(400,'API Key 格式无效');const key=value.trim();if(key&&!/^[A-Za-z0-9._~+\/=\-]{8,512}$/.test(key))throw new ApiError(400,'API Key 格式无效');return key;}
function modelInput(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/\-]{0,127}$/.test(value))throw new ApiError(400,'模型名称无效，请填写服务商的模型 ID');return value;}
function readState({env=process.env,file=privateFile(),skipFile=false}={}){
 let raw='',found=false;
 if(!skipFile)try{const stat=fs.lstatSync(file);found=true;if(stat.isSymbolicLink()||!stat.isFile()||stat.size>8192||process.platform!=='win32'&&(stat.mode&0o077))throw storageError();raw=fs.readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw storageError();}
 if(!found)return {provider:'deepseek',apiUrl:ENDPOINT,model:env.KNOWLEDGE_AI_MODEL||'deepseek-flash',key:env.DEEPSEEK_API_KEY||'',visionEnabled:true,configuredOverride:false,revision:'initial',keySource:env.DEEPSEEK_API_KEY?'environment':'unconfigured',updatedAt:null,updatedByName:'',raw:''};
 try{
  const p=require('dotenv').parse(raw),provider=p.AI_PROVIDER||'deepseek',key=keyInput(p.AI_API_KEY||p.DEEPSEEK_API_KEY);
  if(!['deepseek','openai-compatible'].includes(provider)||!key)throw storageError();
  return {provider,apiUrl:endpoint(p.AI_ENDPOINT||ENDPOINT),model:modelInput(p.AI_MODEL||env.KNOWLEDGE_AI_MODEL||'deepseek-flash'),key,visionEnabled:p.AI_VISION_ENABLED==='true',configuredOverride:true,revision:p.AI_SETTINGS_REVISION||crypto.createHash('sha256').update(raw).digest('hex'),keySource:'override',updatedAt:/^\d{4}-\d{2}-\d{2}T/.test(p.AI_SETTINGS_UPDATED_AT||'')?p.AI_SETTINGS_UPDATED_AT:null,updatedByName:String(p.AI_SETTINGS_UPDATED_BY_NAME||'').replace(/[\r\n]/g,' ').slice(0,80),raw};
 }catch{throw storageError();}
}
function baseSettings(env=process.env){const state=readState({env,skipFile:env!==process.env});return {provider:state.provider,apiUrl:state.apiUrl,model:state.model,token:state.key,visionEnabled:state.visionEnabled,configuredOverride:state.configuredOverride};}
const featureModels={knowledge:'KNOWLEDGE_AI_MODEL',rawSummary:'RAW_DUTY_AI_MODEL',firePhoto:'FIRE_PHOTO_AI_MODEL'};
function featureSettings(feature,env=process.env,base=baseSettings(env)){
 if(Object.hasOwn(featureModels,feature)&&env.RAW_GRAIN_BJK_API_KEY)return {...base,provider:'deepseek',apiUrl:ENDPOINT,token:keyInput(env.RAW_GRAIN_BJK_API_KEY),model:modelInput(env[featureModels[feature]]||'deepseek-flash'),visionEnabled:true,configuredOverride:true,accountLabel:'原粮 bjk'};
 return base;
}
function currentSettings(env=process.env,feature=null){const scoped=env===process.env&&require('./ai-channels').scopedSettings();return scoped||(feature?featureSettings(feature,env):baseSettings(env));}
function currentKey(env=process.env,feature=null){return currentSettings(env,feature).token;}
module.exports={baseSettings,featureSettings,currentSettings,currentKey,ENDPOINT};

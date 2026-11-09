'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {ApiError,asyncHandler}=require('./utils');
const scope=new AsyncLocalStorage();
const features={knowledge:'KNOWLEDGE_AI_MODEL',robot:'ROBOT_AGENT_MODEL',rawSummary:'RAW_DUTY_AI_MODEL',firePhoto:'FIRE_PHOTO_AI_MODEL'};
function resolve(user,requested='deepseek',feature='knowledge',{env=process.env,base}={}){
 if(!user)throw new ApiError(401,'请先登录');if(!Object.hasOwn(features,feature))throw new ApiError(400,'AI功能无效');
 if(requested!=='deepseek')throw new ApiError(410,'该AI通道已移除，请刷新后使用DeepSeek');
 const current=require('./ai-settings').featureSettings(feature,env,base||require('./ai-settings').baseSettings(env)),official=current.provider==='deepseek';
 return {provider:'deepseek',channel:'deepseek',apiUrl:'https://api.deepseek.com/chat/completions',model:official&&current.configuredOverride?current.model:env[features[feature]]||'deepseek-flash',token:official?current.token:env.DEEPSEEK_API_KEY||'',visionEnabled:official?current.visionEnabled!==false:true,configuredOverride:true};
}
const publicChoice=settings=>({id:settings.channel,label:'DeepSeek',model:settings.actualModel||settings.model,requestedModel:settings.model,configured:Boolean(settings.token),visionEnabled:settings.visionEnabled});
function choices(user,feature='knowledge',options){return {default:'deepseek',feature,choices:[publicChoice(resolve(user,'deepseek',feature,options))]};}
function featureFor(req){const p=req.path;if(req.method==='POST'){
 if(p==='/ai/chat')return 'knowledge';
 if(/^\/raw-duties\/reports\/\d+\/summary$/.test(p))return 'rawSummary';
 if(p==='/fire-inspection/photo-recognitions')return 'firePhoto';
 if(p==='/robot-program/connection-check'||/^\/robot-program\/library\/[^/]+\/(analyze|annotation-run)$/.test(p))return 'robot';
 }if(req.method==='GET'&&p==='/robot-program/status')return 'robot';return null;}
function middleware(){return (req,res,next)=>{const feature=featureFor(req);if(!feature)return next();try{
 const selected=req.get('X-AI-Channel')||req.body?.aiProvider||'deepseek';if(req.body?.aiProvider&&req.body.aiProvider!==selected)throw new ApiError(400,'AI通道选择不一致');
 const settings=resolve(req.user,selected,feature);
 const json=res.json;res.json=function(body){if(body?.success&&body.data&&typeof body.data==='object'&&!Array.isArray(body.data))body={...body,data:{...body.data,ai:publicChoice(settings)}};return json.call(this,body)};
 scope.run(settings,next);
 }catch(error){next(error)}};}
function router(){const r=require('express').Router();r.get('/ai/channels',asyncHandler(async(req,res)=>{res.set('Cache-Control','no-store');res.json({success:true,data:choices(req.user,req.query.feature||'knowledge')})}));return r;}
module.exports={resolve,choices,publicChoice,featureFor,middleware,router,recordModel:model=>{const current=scope.getStore();if(current&&typeof model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)&&!model.startsWith('sk-'))current.actualModel=model},scopedSettings:()=>scope.getStore()||null};

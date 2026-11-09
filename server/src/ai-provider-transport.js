'use strict';
const dns=require('node:dns/promises'),https=require('node:https'),net=require('node:net');
const {ApiError}=require('./utils');
function publicAddress(value){
 const address=String(value).replace(/^\[|\]$/g,'');
 if(net.isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(net.isIP(address)===6){const canonical=new URL('https://['+address+']/').hostname.replace(/^\[|\]$/g,'');const first=parseInt(canonical.split(':')[0],16);return first>=0x2000&&first<=0x3fff&&!/^2001:(?:db8(?::|$)|0*:|:)/i.test(canonical)&&!/^2002:/i.test(canonical);}
 return false;
}
function endpoint(value){
 if(typeof value!=='string'||value.length>500||!/^https:\/\//.test(value)||/[\s\\%]/.test(value))throw new ApiError(400,'模型接口须为公网 HTTPS chat/completions 地址');
 let url;try{url=new URL(value);}catch{throw new ApiError(400,'模型接口地址无效');}
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/chat/completions')||/\/(?:\.|\.\.)(?:\/|$)/.test(value)||!host.includes('.')&&!net.isIP(host)||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/i.test(host)||net.isIP(host)&&!publicAddress(host))throw new ApiError(400,'模型接口须为公网 HTTPS 地址，不能含内网地址、凭据、参数或跳转');
 return url.toString();
}
async function resolvePublic(host,lookup=dns.lookup,signal){
 const ip=host.replace(/^\[|\]$/g,'');let abort;
 if(signal?.aborted)throw new DOMException('Model request aborted','AbortError');
 const cancellation=signal?new Promise((_resolve,reject)=>{abort=()=>reject(new DOMException('Model request aborted','AbortError'));signal.addEventListener('abort',abort,{once:true});}):null;
 let addresses;try{const resolving=net.isIP(ip)?[{address:ip,family:net.isIP(ip)}]:lookup(host,{all:true,verbatim:true});addresses=await(cancellation?Promise.race([resolving,cancellation]):resolving);}finally{if(abort)signal.removeEventListener('abort',abort);}
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new ApiError(400,'模型接口不能解析到内网或保留地址');
 return addresses;
}
function createProviderFetch({lookup=dns.lookup,request=https.request,maxBytes=2*1024*1024}={}){
 return async function providerFetch(value,options={}){
  const signal=options.signal||AbortSignal.timeout(180000),url=new URL(endpoint(String(value))),addresses=await resolvePublic(url.hostname,lookup,signal);
  if(signal.aborted)throw new DOMException('Model request aborted','AbortError');
  return new Promise((resolve,reject)=>{
   const pinned=addresses[0];
   const req=request(url,{method:options.method||'GET',headers:options.headers,agent:false,signal,
    lookup:(_host,settings,callback)=>settings?.all?callback(null,addresses):callback(null,pinned.address,pinned.family)},res=>{
    if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(new ApiError(502,'模型接口不允许重定向，请填写最终服务地址'));return;}
    const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();req.destroy();reject(new ApiError(502,'模型响应超出大小限制'));return;}chunks.push(chunk)});
    res.on('error',()=>reject(new ApiError(502,'模型响应读取失败')));
    res.on('end',()=>{try{resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));}catch{reject(new ApiError(502,'模型响应无效'));}});
   });
   req.setTimeout(180000,()=>{req.destroy();reject(new DOMException('Model request timed out','AbortError'));});
   req.on('error',()=>reject(signal.aborted?new DOMException('Model request aborted','AbortError'):new ApiError(502,'无法连接模型服务')));
   if(options.body)req.write(options.body);req.end();
  });
 };
}
module.exports={endpoint,publicAddress,resolvePublic,createProviderFetch,providerFetch:createProviderFetch()};

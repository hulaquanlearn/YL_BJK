const express=require('express'),multer=require('multer'),rateLimit=require('express-rate-limit');
const {ApiError,asyncHandler}=require('../utils');
const {MAX_ZIP}=require('../robot-backup');
const {agentConfig,validChannel,channelStatus,checkConnection,analyze}=require('../robot-agent');
const {exportBackup}=require('../robot-backup-export');
const {defaultLibrary}=require('../robot-library');
const {canAnalyze,createUsage,BATCH_QUESTION}=require('../robot-usage');
const {buildMotionPlan}=require('../robot-motion');
const {createSimulation,advanceSimulation,Blocked}=require('../robot-sim');
const {noteOutcome,noteOperation,noteRobotMode}=require('../ai-call-audit');
function createRouter({config,analyzeImpl=analyze,checkConnectionImpl=checkConnection,library=defaultLibrary,usage=createUsage(library.root)}={}){
 const router=express.Router(),inFlight=new Set();
 const currentConfig=()=>config===undefined?agentConfig():typeof config==='function'?config():config;
 router.use((req,_res,next)=>req.user?next():next(new ApiError(401,'请先登录')));
 router.get('/status',asyncHandler(async(req,res)=>{const config=currentConfig(),admin=req.user.role==='admin',allowed=canAnalyze(req.user),state=channelStatus(config);res.json({success:true,data:{accountId:String(req.user.id),canInteract:allowed,canManage:admin,quota:allowed?await usage.usage(req.user):null,enabled:validChannel(config),transport:config.transport,model:config.model,maxZipBytes:MAX_ZIP,message:admin?state.message:validChannel(config)?'模型通道已配置': '模型连接由系统管理员维护，请联系管理员配置',issues:admin?state.issues:undefined}})}));
 router.get('/library',asyncHandler(async(_req,res)=>res.json({success:true,data:await library.list()})));
 router.get('/library/:id',asyncHandler(async(req,res)=>res.set('Cache-Control','no-store').json({success:true,data:await library.get(req.params.id)})));
 router.get('/library/:id/export',asyncHandler(async(req,res)=>{const r=await library.get(req.params.id),reading=r.overview?{...r.overview,annotations:r.analysis?.annotations||[]}:r.analysis;if(canAnalyze(req.user)&&req.query.confirmChanges==='true'&&r.dialogueAnalysis?.changes.length)Object.assign(reading,{mode:'modify',changes:r.dialogueAnalysis.changes});const zip=await exportBackup({...r.report,filename:r.displayName||r.filename},reading,{confirmChanges:canAnalyze(req.user)&&req.query.confirmChanges==='true'});res.set({'Content-Type':'application/zip','Content-Disposition':"attachment; filename=ABB-program-review.zip; filename*=UTF-8''"+encodeURIComponent((r.displayName||r.filename).replace(/\.zip$/i,'')+'-中文注释阅读包.zip'),'Cache-Control':'no-store'}).send(zip)}));
 // 只读运动计划：与 GET /library/:id 同级权限，不调用 AI、不写记录。
 router.get('/library/:id/motion',asyncHandler(async(req,res)=>{const routine=typeof req.query.routine==='string'?req.query.routine:'';if(routine.length>200)throw new ApiError(400,'例程参数过长');const saved=await library.get(req.params.id),{plan,error}=buildMotionPlan(saved.report,{routine});if(error)throw new ApiError(400,'该备份中没有找到指定例程');res.set('Cache-Control','no-store').json({success:true,data:plan})}));
 // 离线程序仿真：状态回传、无服务端会话、不调用 AI；运动学由查看器求解。
 router.post('/library/:id/simulate',express.json({limit:'2mb'}),asyncHandler(async(req,res)=>{
  const body=req.body&&typeof req.body==='object'?req.body:{};
  const routine=typeof body.routine==='string'?body.routine:'';
  if(routine.length>200)throw new ApiError(400,'例程参数过长');
  const saved=await library.get(req.params.id);
  if(!body.state){
   const created=createSimulation(saved.report,{routine,signals:body.signals,parameters:body.parameters,joints:body.joints,variables:body.variables,automation:body.automation,toolType:body.toolType,operatingMode:body.operatingMode});
   if(created.error)throw new ApiError(created.error.code==='joints-invalid'||created.error.code==='variables-invalid'||created.error.code==='parameters-required'?400:400,created.error.message);
   return res.set('Cache-Control','no-store').json({success:true,data:{state:created.state,events:[],stop:created.stop}});
  }
  try{const result=advanceSimulation(saved.report,{state:body.state,signals:body.signals,solveResult:body.solve,maxSteps:body.maxSteps,stopOnMotion:body.stopOnMotion,elapsed:body.elapsed});res.set('Cache-Control','no-store').json({success:true,data:result})}
  catch(error){if(error instanceof Blocked)throw new ApiError(error.code==='state-stale'?409:400,error.message);throw error}
 }));
 router.use((req,_res,next)=>canAnalyze(req.user)?next():next(new ApiError(403,'仅系统管理员和车间管理员可以调用AI；当前账号可查看已有程序和注释')));
 router.use(express.json({limit:'256kb'}));
 router.use(rateLimit({windowMs:60*1000,max:12,skip:req=>req.user.role==='admin',keyGenerator:req=>String(req.user.id),standardHeaders:true,legacyHeaders:false,message:{success:false,msg:'操作较频繁，请稍后重试'}}));
 const adminOnly=(req,_res,next)=>req.user.role==='admin'?next():next(new ApiError(403,'仅系统管理员可以管理备份和模型配置'));
 router.post('/connection-check',adminOnly,asyncHandler(async(_req,res)=>{const state=await checkConnectionImpl(currentConfig());if(!state.ready)noteOutcome(state.configured?'failed':'blocked');res.json({success:true,data:state})}));
 router.post('/library/:id/annotation-run',adminOnly,asyncHandler(async(req,res)=>{const result=await library.exclusive(req.params.id,async()=>{const saved=await library.get(req.params.id);if(req.body.revision!==saved.revision)throw new ApiError(409,'备份分析已更新，请刷新后继续');return usage.startAnnotations(req.user,saved,{scope:req.body.scope,fileId:req.body.fileId})});noteOperation(result.id);res.json({success:true,data:result})}));
 router.post('/library/:id/analyze',asyncHandler(async(req,res)=>{
  if(req.user.role!=='admin'&&(req.body.target||req.body.runId))throw new ApiError(403,'仅系统管理员可以生成、继续或补充程序注释');
  const key=String(req.user.id);if(inFlight.has(key))throw new ApiError(429,'当前账号已有程序分析正在进行');inFlight.add(key);
  try{const saved=await library.exclusive(req.params.id,async()=>{
   const current=await library.get(req.params.id);if(req.body.revision!==current.revision)throw new ApiError(409,'备份分析已更新，请刷新后继续');
   const runId=req.body.runId||null,target=req.body.target||null,mode=req.body.mode||'analyze';if(runId&&(mode!=='analyze'||!target))throw new ApiError(400,'注释任务仅允许指定批次的中文注释');
   const overview=req.body.scope==='overview';if(overview&&(target||mode!=='analyze'))throw new ApiError(400,'程序总览不能使用注释批次或修改模式');const question=overview?'解释这套程序的整体逻辑和功能实现，按主流程、模块分工、触发条件、调用链、输出和退出条件组织。':runId?BATCH_QUESTION:req.body.question;
   const result=await usage.execute(req.user,{backupId:current.id,runId,target},async()=>{
    const result=await analyzeImpl(current.report,{config:currentConfig(),question,mode,overview,allowAnnotations:req.user.role==='admin',history:overview||runId||req.body.newConversation===true?[]:current.history,target});
    if(req.user.role!=='admin')result.annotations=[];
    if(!runId && !target)noteRobotMode(result.mode);
    const saved=await library.saveResult(current.id,current.revision,result,{question,overview,overviewScope:result.overviewScope,target:result.target,resetHistory:!target&&req.body.newConversation===true});return {...saved,warnings:result.warnings||[]};
   });return {...result.value,quota:result.quota};
  });res.json({success:true,data:saved})}finally{inFlight.delete(key)}
 }));
 router.use(adminOnly);
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_ZIP,files:1,fields:6,fieldSize:2*1024*1024,parts:8},fileFilter:(_req,file,cb)=>cb(/\.zip$/i.test(file.originalname)?null:new ApiError(400,'请选择ABB备份ZIP'),/\.zip$/i.test(file.originalname))}).single('file');
 router.use((req,res,next)=>upload(req,res,e=>next(e?new ApiError(e.code==='LIMIT_FILE_SIZE'?413:400,e.code==='LIMIT_FILE_SIZE'?'备份ZIP不能超过20MB':e.status?e.message:'上传格式或大小不符合要求'):undefined)));
 router.patch('/library/:id',asyncHandler(async(req,res)=>res.json({success:true,data:await library.rename(req.params.id,req.body.name,req.body.revision)})));
 router.delete('/library/:id',asyncHandler(async(req,res)=>res.json({success:true,data:await library.remove(req.params.id,req.body.revision,req.user.id)})));
 router.post('/library',asyncHandler(async(req,res)=>{if(!req.file)throw new ApiError(400,'请选择ABB备份ZIP');let initial=null,progress={};try{initial=req.body.analysis?JSON.parse(req.body.analysis):null;progress=JSON.parse(req.body.progress||'{}')}catch{throw new ApiError(400,'分析结果格式无效')};const name=Buffer.from(req.file.originalname,'latin1').toString('utf8');res.json({success:true,data:await library.upload(req.file.buffer,name,initial,progress,{origin:req.body.origin==='legacy-cache'?'legacy-cache':'upload'})})}));
 return router;
}
module.exports={createRouter};

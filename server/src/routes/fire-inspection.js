const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('node:crypto');
const Excel = require('exceljs');
const { asyncHandler, parseJson } = require('../utils');
const F = require('../fire-inspection');
const S = require('../fire-store');
const Q = require('../fire-query');
const R = require('../fire-recognition');
const { ensureCurrentPeriod } = require('../fire-period');
const { processPhoto } = require('../fire-photo-workflow');
const { parseFireWorkbook, warnExistingAssets, existingAssetFingerprint, selectedImportWarnings, importedSourceKeys } = require('../fire-import');
function createRouter(pool = require('../db').pool, { recognize = R.recognizePhoto, photoConfig = R.configuration, now = () => new Date(), currentPeriod = ensureCurrentPeriod } = {}) {
 const router = express.Router(), ok = (res,data,status=200)=>res.status(status).json({success:true,data});
 const audit = (db,user,action,detail)=>db.query('INSERT INTO fire_admin_events(actor_id,action,detail_json) VALUES(?,?,?)',[user.id,action,JSON.stringify(detail)]);
 router.use(asyncHandler(async(req,res,next)=>{
  res.set('Cache-Control','no-store'); req.fireAccess=await F.loadFireAccess(req.user,pool);
  if(!req.fireAccess.canRead)F.fail(403,'当前账号未授权消防点检，请联系系统管理员分配区域'); next();
 }));
 router.get('/bootstrap',asyncHandler(async(req,res)=>{
  const selectedPeriod=await currentPeriod(pool,req.user,req.fireAccess,now());
  const args=[],[areas]=await pool.query(`SELECT id,name FROM fire_areas WHERE active=1 AND ${S.scope(req.fireAccess,'id',args)} ORDER BY name`,args);
  const cycleArgs=[],[cycles]=await pool.query(`SELECT DISTINCT c.* FROM fire_cycles c JOIN fire_cycle_points cp ON cp.cycle_id=c.id WHERE ${S.scope(req.fireAccess,'cp.area_id',cycleArgs)} ORDER BY c.id DESC LIMIT 100`,cycleArgs);
  const periods=[selectedPeriod,...cycles.filter(c=>Number(c.id)!==selectedPeriod.id).map(Q.cycleView)];
  const sectionArgs=[],[sectionRows]=await pool.query(`SELECT DISTINCT section_name FROM fire_points WHERE active=1 AND section_name<>'' AND ${S.scope(req.fireAccess,'area_id',sectionArgs)} ORDER BY section_name`,sectionArgs);
  const result={sections:sectionRows.map(r=>r.section_name),areas:areas.map(a=>({id:Number(a.id),name:a.name})),cycles:periods,currentPeriod:selectedPeriod,selectedCycleId:selectedPeriod.id,permissions:req.fireAccess,photoRecognition:R.capability(now(),photoConfig())};
  if(req.fireAccess.canManage){
   const [users]=await pool.query('SELECT id,username,display_name,enabled,role,staff_workshop_code,staff_position FROM app_users ORDER BY display_name,id');
   const [members]=await pool.query('SELECT user_id,area_id FROM fire_members ORDER BY user_id,area_id'),group=new Map();
   for(const m of members){if(!group.has(Number(m.user_id)))group.set(Number(m.user_id),[]);group.get(Number(m.user_id)).push(Number(m.area_id));}
   const [pendingImports]=await pool.query("SELECT id,filename,preview_json,created_at,expires_at FROM fire_imports WHERE status='pending' AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC LIMIT 8");
   result.pendingImports=pendingImports.map(p=>({id:p.id,previewId:p.id,filename:p.filename,counts:parseJson(p.preview_json,{}).counts,createdAt:F.isoTime(p.created_at),expiresAt:F.isoTime(p.expires_at)}));
   result.members=[...group].map(([userId,areaIds])=>({userId,areaIds}));result.users=users.map(u=>({id:Number(u.id),username:u.username,displayName:u.display_name,enabled:!!u.enabled,role:u.role,staffWorkshopCode:u.staff_workshop_code,staffPosition:u.staff_position}));
  }
  ok(res,result);
 }));
 router.get('/dashboard',asyncHandler(async(req,res)=>{const query={...req.query};if(!query.cycleId)query.cycleId=(await currentPeriod(pool,req.user,req.fireAccess,now())).id;ok(res,await Q.dashboard(pool,req.fireAccess,query));}));
 router.get('/records',asyncHandler(async(req,res)=>ok(res,await Q.records(pool,req.fireAccess,req.query))));
 router.get('/issues',asyncHandler(async(req,res)=>ok(res,await Q.issues(pool,req.fireAccess,req.query))));
 router.get('/points',asyncHandler(async(req,res)=>ok(res,await S.points(pool,req.fireAccess,req.query))));
 async function issuesForPoint(db,access,pointId){
  const args=[pointId],[issues]=await db.query(`SELECT * FROM fire_issues WHERE point_id=? AND ${S.scope(access,'area_id',args)} ORDER BY id DESC`,args);
  const out=[];
  for(const issue of issues){const [events]=await db.query('SELECT * FROM fire_issue_events WHERE issue_id=? ORDER BY id',[issue.id]);const [photos]=await db.query('SELECT id,mime,filename,created_at,issue_event_id FROM fire_photos WHERE issue_id=? ORDER BY id',[issue.id]);out.push({id:Number(issue.id),pointId:Number(issue.point_id),recordId:Number(issue.record_id),cycleId:Number(issue.cycle_id),status:issue.status,remark:issue.remark,createdAt:F.isoTime(issue.created_at),resolvedAt:F.isoTime(issue.resolved_at),closedAt:F.isoTime(issue.closed_at),photos:photos.map(F.photoRow),events:events.map(e=>({id:Number(e.id),action:e.action,actorId:Number(e.actor_id),actorName:e.actor_name,createdAt:F.isoTime(e.created_at),remark:e.remark,photos:photos.filter(p=>Number(p.issue_event_id)===Number(e.id)).map(F.photoRow)}))});}
  return out;
 }
 router.get('/points/:id',asyncHandler(async(req,res)=>{
  const pointId=F.id(req.params.id),targetAssetId=req.query.assetId?F.id(req.query.assetId):null;let point,cycleId=req.query.cycleId?F.id(req.query.cycleId):null,assigned=false,cycle=null;
  if(!cycleId&&targetAssetId)cycleId=(await currentPeriod(pool,req.user,req.fireAccess,now())).id;
  if(cycleId){
   const [matching]=await pool.query('SELECT cp.*,c.status AS cycle_status,c.name AS cycle_name,c.deadline,c.inspection_month,c.created_at AS cycle_created_at FROM fire_cycle_points cp JOIN fire_cycles c ON c.id=cp.cycle_id WHERE cp.cycle_id=? AND cp.point_id=?',[cycleId,pointId]);
   if(matching.length){const cp=matching[0];F.assertArea(req.fireAccess,cp.area_id);point=S.inspectionPoint(parseJson(cp.snapshot_json,{}),await S.assetMappings(pool,cycleId,pointId));cycle=Q.cycleView({id:cycleId,name:cp.cycle_name,deadline:cp.deadline,status:cp.cycle_status,inspection_month:cp.inspection_month,created_at:cp.cycle_created_at});assigned=cp.cycle_status==='open';const [[r]]=await pool.query('SELECT r.id,r.result,r.actor_name,r.actual_checked_at FROM fire_records r WHERE r.cycle_id=? AND r.point_id=? ORDER BY r.id DESC LIMIT 1',[cycleId,pointId]);Object.assign(point,{recordId:r?Number(r.id):null,lastResult:r?.result||null,lastCheckedAt:F.isoTime(r?.actual_checked_at),lastCheckedBy:r?.actor_name||''});}
   else {if(!req.fireAccess.canManage){const args=[cycleId],[visible]=await pool.query(`SELECT point_id FROM fire_cycle_points WHERE cycle_id=? AND ${S.scope(req.fireAccess,'area_id',args)} LIMIT 1`,args);if(!visible.length)F.fail(404,'盘点周期不存在');}}
  }
  if(!point){point=S.inspectionPoint(await S.activePoint(pool,pointId));F.assertArea(req.fireAccess,point.areaId);}
  let targetAsset=targetAssetId?point.assets.find(a=>Number(a.id)===targetAssetId):null;
  if(targetAssetId&&!targetAsset){const current=await S.activePoint(pool,pointId);F.assertArea(req.fireAccess,current.areaId);const[[asset]]=await pool.query('SELECT * FROM fire_assets WHERE id=? AND point_id=?',[targetAssetId,pointId]);if(!asset)F.fail(404,'二维码器材不属于该点位');
   if(Number(asset.active)!==1&&!req.fireAccess.canManage){const args=[pointId,targetAssetId],[past]=await pool.query(`SELECT cp.snapshot_json FROM fire_cycle_points cp WHERE cp.point_id=? AND JSON_CONTAINS(cp.snapshot_json,JSON_OBJECT('id',?),'$.assets') AND ${S.scope(req.fireAccess,'cp.area_id',args)} ORDER BY cp.cycle_id DESC LIMIT 1`,args);if(!past.length)F.fail(404,'二维码器材不在授权范围');targetAsset=parseJson(past[0].snapshot_json,{}).assets?.find(a=>Number(a.id)===targetAssetId);}else targetAsset=F.assetRow(asset);
   targetAsset={...targetAsset,status:Number(asset.active)===0?'retired':targetAsset.status,inspectionStatus:'pending'};assigned=false;
  }
  const args=[pointId],recordConditions=['point_id=?',S.scope(req.fireAccess,'area_id',args)];if(targetAssetId){recordConditions.push('id IN (SELECT record_id FROM fire_record_assets WHERE asset_id=?)');args.push(targetAssetId);}
  const [records]=await pool.query(`SELECT id FROM fire_records WHERE ${recordConditions.join(' AND ')} ORDER BY id DESC LIMIT 100`,args);
  const [[current]]=await pool.query('SELECT area_id,section_name FROM fire_points WHERE id=?',[pointId]);
  point.sectionName=point.sectionName||current?.section_name||'';
  const draftArgs=[pointId,req.user.id];if(targetAssetId)draftArgs.push(targetAssetId);
  let canReadDrafts=await S.canPhotoPointAccess(pool,req.fireAccess,pointId,current?.area_id);if(targetAssetId&&canReadDrafts){try{await S.assertPhotoAssetAccess(pool,req.fireAccess,pointId,current?.area_id,targetAssetId);}catch(e){if(e.status!==403)throw e;canReadDrafts=false;}}
  const [drafts]=canReadDrafts?await pool.query(`SELECT id,asset_id,mime,filename,created_at FROM fire_photos WHERE point_id=? AND owner_id=? AND ${targetAssetId?'asset_id=?':'asset_id IS NULL'} AND record_id IS NULL AND issue_id IS NULL AND discarded_at IS NULL ORDER BY id`,draftArgs):[[]];
  const issues=await issuesForPoint(pool,req.fireAccess,pointId);point.openIssueCount=issues.filter(i=>i.status!=='closed').length;point.hasIssue=point.openIssueCount>0;
  const workOrder=assigned&&(!targetAssetId||point.assets.some(a=>Number(a.id)===targetAssetId))?{cycleId,cycleName:cycle.name,inspectionMonth:cycle.inspectionMonth,inspectionMonthSource:cycle.inspectionMonthSource,pointId,assetId:targetAssetId,status:targetAsset?targetAsset.inspectionStatus:point.status,asset:targetAsset,deadline:cycle.deadline}:null;
  ok(res,{point,assets:point.assets,targetAssetId,targetAsset,workOrder,dispatchStatus:workOrder?'assigned':'unassigned',cycleId,records:await Promise.all(records.map(r=>S.record(pool,r.id))),issues,draftPhotos:drafts.map(F.photoRow)});
 }));
 router.post('/areas',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const name=F.text(req.body.name,120);if(!name)F.fail(400,'请填写消防区域名称');
  const data=await F.transaction(pool,async db=>{const [r]=await db.query('INSERT INTO fire_areas(name) VALUES(?)',[name]);await audit(db,req.user,'area_created',{areaId:Number(r.insertId),name});return{id:Number(r.insertId),name};});ok(res,data,201);
 }));
 router.put('/members/:userId',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const userId=F.id(req.params.userId),areaIds=F.ids(req.body.areaIds);
  await F.transaction(pool,async db=>{
   const [[user]]=await db.query('SELECT id,enabled FROM app_users WHERE id=? FOR UPDATE',[userId]);if(!user||!user.enabled)F.fail(400,'请选择已启用账号');
   if(areaIds.length){const[areas]=await db.query(`SELECT id FROM fire_areas WHERE active=1 AND id IN (${areaIds.map(()=>'?').join(',')})`,areaIds);if(areas.length!==areaIds.length)F.fail(400,'区域不存在或已停用');}
   const [previous]=await db.query('SELECT area_id FROM fire_members WHERE user_id=?',[userId]);
   await db.query('DELETE FROM fire_members WHERE user_id=?',[userId]);for(const areaId of areaIds)await db.query('INSERT INTO fire_members(user_id,area_id,created_by) VALUES(?,?,?)',[userId,areaId,req.user.id]);
   await audit(db,req.user,'member_changed',{userId,before:previous.map(x=>Number(x.area_id)),areaIds});
  });ok(res,{userId,areaIds});
 }));
 router.post('/points',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const point=await F.transaction(pool,async db=>{const point=await S.savePoint(db,req.user,req.body);await audit(db,req.user,'point_created',{point});return point;});ok(res,point,201);
 }));
 router.put('/points/:id',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const pointId=F.id(req.params.id),point=await F.transaction(pool,async db=>{const before=await S.activePoint(db,pointId,true);const point=await S.savePoint(db,req.user,req.body,pointId);await audit(db,req.user,'point_changed',{before,after:point});return point;});ok(res,point);
 }));
 const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:2,fieldSize:1000}}).single('file');
 const cardUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:3,fields:9,fieldSize:22000}}).array('photo',3);
 router.post('/photo-recognitions',(req,res,next)=>cardUpload(req,res,e=>e?next(new (require('../utils').ApiError)(400,'识别照片上传失败，请选择8MB以内的图片')):next()),asyncHandler(async(req,res)=>{
  if(req.body?.aiProvider&&req.body.aiProvider!=='deepseek')F.fail(400,'消防拍照识别使用默认服务，不支持选择模型');
  if(req.body?.aiProvider&&req.body.aiProvider!==(req.get('X-AI-Channel')||'deepseek'))F.fail(400,'AI通道选择不一致，请重新选择');
  const period=await currentPeriod(pool,req.user,req.fireAccess,now());
  const file=req.files?.length?{...req.files[0],views:req.files}:null;
  const result=await processPhoto(pool,req.user,file,{...req.body,cycleId:req.body.cycleId||period.id},{recognize,config:photoConfig(),now:now()});ok(res,result,result.status==='completed'?201:200);
 }));
 function receivePhoto(req,res,next){photoUpload(req,res,e=>e?next(new (require('../utils').ApiError)(400,'照片上传失败，请选择8MB以内的图片')):next());}
 router.post('/photos',receivePhoto,asyncHandler(async(req,res)=>{
  const pointId=F.id(req.body.pointId),assetId=req.body.assetId?F.id(req.body.assetId):null;if(!req.file)F.fail(400,'请选择现场照片');const point=await S.activePoint(pool,pointId);await S.assertPhotoPointAccess(pool,req.fireAccess,pointId,point.areaId);
  if(assetId)await S.assertPhotoAssetAccess(pool,req.fireAccess,pointId,point.areaId,assetId);
  let image;try{image=await sharp(req.file.buffer,{limitInputPixels:30000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();}catch{F.fail(400,'无法读取照片，请使用有效图片');}if(image.length>3*1024*1024)F.fail(400,'压缩后的照片仍过大');
  const saved=await F.transaction(pool,async db=>{
   const currentAccess=await F.loadFireAccess(req.user,db),current=await S.activePoint(db,pointId,true);await S.assertPhotoPointAccess(db,currentAccess,pointId,current.areaId);if(assetId)await S.assertPhotoAssetAccess(db,currentAccess,pointId,current.areaId,assetId);
   const [[usage]]=await db.query('SELECT COUNT(*) AS total,COALESCE(SUM(byte_size),0) AS bytes FROM fire_photos WHERE point_id=? AND owner_id=? AND record_id IS NULL AND issue_id IS NULL AND discarded_at IS NULL',[pointId,req.user.id]);
   if(Number(usage.total)>=24||Number(usage.bytes)+image.length>30*1024*1024)F.fail(400,'该点位待提交照片已达上限，请先完成提交');
   const filename=F.text(F.uploadFilename(req.file.originalname),180)||'现场照片.jpg',[r]=await db.query('INSERT INTO fire_photos(point_id,owner_id,asset_id,image,mime,filename,byte_size,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())',[pointId,req.user.id,assetId,image,'image/jpeg',filename,image.length]);return F.photoRow({id:r.insertId,asset_id:assetId,mime:'image/jpeg',filename});
  });ok(res,saved,201);
 }));
 router.get('/photos/:id',asyncHandler(async(req,res)=>{
  const [[photo]]=await pool.query('SELECT p.*,r.area_id AS record_area,i.area_id AS issue_area,fp.area_id AS point_area FROM fire_photos p LEFT JOIN fire_records r ON r.id=p.record_id LEFT JOIN fire_issues i ON i.id=p.issue_id JOIN fire_points fp ON fp.id=p.point_id WHERE p.id=?',[F.id(req.params.id)]);
  if(!photo)F.fail(404,'照片不存在');if(photo.discarded_at)F.fail(410,'照片已撤回');
  if(photo.record_id||photo.issue_id)F.assertArea(req.fireAccess,photo.record_area||photo.issue_area);
  else{if(Number(photo.owner_id)!==Number(req.user.id))F.fail(403,'未提交照片仅上传人可查看');await S.assertPhotoPointAccess(pool,req.fireAccess,photo.point_id,photo.point_area);if(photo.asset_id)await S.assertPhotoAssetAccess(pool,req.fireAccess,photo.point_id,photo.point_area,photo.asset_id);}
  res.set('X-Content-Type-Options','nosniff').type(photo.mime).send(photo.image);
 }));
 router.post('/photos/:id/discard',asyncHandler(async(req,res)=>{
  const photoId=F.id(req.params.id);await F.transaction(pool,async db=>{
   const [[photo]]=await db.query('SELECT p.*,fp.area_id FROM fire_photos p JOIN fire_points fp ON fp.id=p.point_id WHERE p.id=? FOR UPDATE',[photoId]);
   if(!photo)F.fail(404,'照片不存在');const access=await F.loadFireAccess(req.user,db);await S.assertPhotoPointAccess(db,access,photo.point_id,photo.area_id);if(photo.asset_id)await S.assertPhotoAssetAccess(db,access,photo.point_id,photo.area_id,photo.asset_id);
   if(Number(photo.owner_id)!==Number(req.user.id))F.fail(403,'只能撤回本人待提交照片');if(photo.record_id||photo.issue_id)F.fail(409,'已提交照片是历史凭证，不能撤回');
   await db.query('UPDATE fire_photos SET discarded_at=COALESCE(discarded_at,UTC_TIMESTAMP()) WHERE id=?',[photoId]);await audit(db,req.user,'draft_photo_discarded',{photoId,pointId:Number(photo.point_id)});
  });ok(res,{id:photoId,discarded:true});
 }));
 router.post('/points/:id/records',(_req,res)=>res.status(410).json({success:false,msg:'请先拍照识别本月检查表，再确认未识别的结果并保存'}));
 router.put('/issues/:id',asyncHandler(async(req,res)=>{
  const issueId=F.id(req.params.id),action=F.text(req.body.action,20),remark=F.text(req.body.remark);if(!remark)F.fail(400,'请填写处理或复核说明');
  const pointId=await F.transaction(pool,async db=>{
   const [[issue]]=await db.query('SELECT * FROM fire_issues WHERE id=? FOR UPDATE',[issueId]);if(!issue)F.fail(404,'异常记录不存在');const access=await F.loadFireAccess(req.user,db);F.assertArea(access,issue.area_id);
   if(action==='resolve'){
    if(issue.status!=='open')F.fail(409,'仅待整改异常可提交处理');const photoIds=F.ids(req.body.photoIds);if(!photoIds.length||photoIds.length>12)F.fail(400,'请上传1至12张整改照片');await S.bindPhotos(db,photoIds,req.user.id,issue.point_id,'issue',issueId);
    await db.query("UPDATE fire_issues SET status='resolved',resolved_at=UTC_TIMESTAMP() WHERE id=?",[issueId]);
   }else if(action==='close'){
    F.assertManager(access);if(issue.status!=='resolved')F.fail(409,'请先提交整改结果再复核');
    const [[resolved]]=await db.query("SELECT actor_id FROM fire_issue_events WHERE issue_id=? AND action='resolve' ORDER BY id DESC LIMIT 1",[issueId]);if(Number(resolved?.actor_id)===Number(req.user.id))F.fail(403,'整改提交人不能复核自己的处理，请由其他系统管理员复核');
    await db.query("UPDATE fire_issues SET status='closed',closed_at=UTC_TIMESTAMP() WHERE id=?",[issueId]);
   }else if(action==='reopen'){
    F.assertManager(access);if(!['resolved','closed'].includes(issue.status))F.fail(409,'当前异常已经待整改');await db.query("UPDATE fire_issues SET status='open',resolved_at=NULL,closed_at=NULL WHERE id=?",[issueId]);
   }else F.fail(400,'异常处理操作无效');
   const [event]=await db.query('INSERT INTO fire_issue_events(issue_id,actor_id,actor_name,action,remark,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())',[issueId,req.user.id,F.text(req.user.displayName||req.user.username,80),action,remark]);
   if(action==='resolve'){const photoIds=F.ids(req.body.photoIds);await db.query(`UPDATE fire_photos SET issue_event_id=? WHERE issue_id=? AND id IN (${photoIds.map(()=>'?').join(',')})`,[event.insertId,issueId,...photoIds]);}return Number(issue.point_id);
  });const issues=await issuesForPoint(pool,req.fireAccess,pointId);ok(res,issues.find(i=>i.id===issueId));
 }));
 const workbookUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1,fields:1}}).single('file');
 router.post('/import/preview',(req,res,next)=>{try{F.assertManager(req.fireAccess);}catch(e){return next(e);}workbookUpload(req,res,e=>e?next(new (require('../utils').ApiError)(400,'台账上传失败，请使用12MB以内的xlsx文件')):next());},asyncHandler(async(req,res)=>{
  if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xlsx'))F.fail(400,'请选择xlsx消防台账');
  const [[pending]]=await pool.query("SELECT COUNT(*) AS total FROM fire_imports WHERE status='pending' AND expires_at>UTC_TIMESTAMP()");if(Number(pending.total)>=8)F.fail(429,'待确认导入较多，请先核对现有预览');
  const parsed=await parseFireWorkbook(req.file.buffer),previewId=crypto.randomUUID(),filename=F.text(F.uploadFilename(req.file.originalname),180),expiresAt=new Date(Date.now()+7*86400000);
  const [existingAssets]=await pool.query('SELECT a.id,a.type,a.code,a.source_json,p.source_key FROM fire_assets a JOIN fire_points p ON p.id=a.point_id WHERE a.active=1 AND p.active=1');warnExistingAssets(parsed,existingAssets);
  await pool.query('INSERT INTO fire_imports(id,owner_id,filename,file_hash,source,preview_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())',[previewId,req.user.id,filename,parsed.fileHash,req.file.buffer,JSON.stringify(parsed),F.dbTime(expiresAt)]);
  ok(res,{previewId,filename,...parsed,fileHash:undefined,expiresAt:expiresAt.toISOString()});
 }));
 router.get('/import/:id',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const [[preview]]=await pool.query('SELECT id,filename,preview_json,status,expires_at,result_json FROM fire_imports WHERE id=?',[F.text(req.params.id,80)]);if(!preview)F.fail(404,'导入预览不存在');
  const data=parseJson(preview.preview_json,{}),keys=(data.rows||[]).map(r=>r.sourceKey);const [saved]=keys.length?await pool.query(`SELECT source_key FROM fire_points WHERE source_key IN (${keys.map(()=>'?').join(',')})`,keys):[[]];const [sourceAliases]=await pool.query('SELECT a.source_json,p.source_key FROM fire_assets a JOIN fire_points p ON p.id=a.point_id WHERE a.active=1 AND p.active=1');const imported=importedSourceKeys(sourceAliases);for(const r of saved)imported.add(r.source_key);data.rows=(data.rows||[]).map(r=>({...r,alreadyImported:imported.has(r.sourceKey)}));ok(res,{previewId:preview.id,filename:preview.filename,...data,status:preview.status,expiresAt:F.isoTime(preview.expires_at),result:parseJson(preview.result_json,null),fileHash:undefined});
 }));
 router.post('/import/commit',asyncHandler(async(req,res)=>{
  F.assertManager(req.fireAccess);const previewId=F.text(req.body.previewId,80);
  const result=await F.transaction(pool,async db=>{
   const [[saved]]=await db.query('SELECT * FROM fire_imports WHERE id=? FOR UPDATE',[previewId]);
   if(!saved)F.fail(409,'导入预览不存在，请重新上传核对');if(saved.status==='committed')return parseJson(saved.result_json,{});
   if(new Date(F.isoTime(saved.expires_at))<Date.now())F.fail(409,'导入预览已过期，请重新上传核对');
   const preview={...parseJson(saved.preview_json,{}),filename:saved.filename};
   const [currentAssets]=await db.query('SELECT a.id,a.type,a.code,a.source_json,p.source_key FROM fire_assets a JOIN fire_points p ON p.id=a.point_id WHERE a.active=1 AND p.active=1 FOR UPDATE');
   if(preview.existingFingerprint&&preview.existingFingerprint!==existingAssetFingerprint(preview,currentAssets))F.fail(409,'预览后现有同编号台账发生变化，请重新预览并核对重复警告');
   const imported=importedSourceKeys(currentAssets);
   let selected=null;
   if(req.body.selectedSourceKeys!==undefined){if(!Array.isArray(req.body.selectedSourceKeys)||req.body.selectedSourceKeys.length>5000)F.fail(400,'导入行选择无效');selected=new Set(req.body.selectedSourceKeys);if(!selected.size||[...selected].some(k=>typeof k!=='string'||!preview.rows.some(r=>r.sourceKey===k)))F.fail(400,'请选择预览内的有效台账行');}
   if(selectedImportWarnings(preview,selected).length&&req.body.acknowledgeWarnings!==true)F.fail(400,'请核对所选记录的警告后确认');
   const summary={imported:0,skipped:0,areasCreated:0,pointsCreated:0,assetsCreated:0},areaMap=new Map();
   for(const row of preview.rows){
    if(selected&&!selected.has(row.sourceKey)){summary.skipped++;continue;}
    if(imported.has(row.sourceKey)){summary.skipped++;continue;}
    const [[existing]]=await db.query('SELECT id FROM fire_points WHERE source_key=?',[row.sourceKey]);if(existing){imported.add(row.sourceKey);summary.skipped++;continue;}
    let areaId=areaMap.get(row.area);if(!areaId){const [[area]]=await db.query('SELECT id FROM fire_areas WHERE name=? FOR UPDATE',[row.area]);if(area)areaId=Number(area.id);else{const[r]=await db.query('INSERT INTO fire_areas(name) VALUES(?)',[row.area]);areaId=Number(r.insertId);summary.areasCreated++;}areaMap.set(row.area,areaId);}
    const point=await S.savePoint(db,req.user,{areaId,sectionName:row.sectionName||'',code:row.pointCode,name:row.location||`${row.name}${row.code?' '+row.code:''}`,location:row.location,assets:[{type:row.type,code:row.code,name:row.name,spec:row.spec,quantity:row.quantity,status:row.status,notes:row.notes,manufacturedDate:row.manufacturedDate,manufacturer:row.manufacturer,source:{...row.source,filename:preview.filename}}]},null,row.sourceKey);summary.imported++;summary.pointsCreated++;summary.assetsCreated+=point.assets.length;imported.add(row.sourceKey);
   }
   const sourceKeys=preview.rows.map(r=>r.sourceKey),[allSaved]=await db.query(`SELECT source_key FROM fire_points WHERE source_key IN (${sourceKeys.map(()=>'?').join(',')})`,sourceKeys);for(const r of allSaved)imported.add(r.source_key);summary.remainingRows=preview.rows.filter(r=>!imported.has(r.sourceKey)).length;
   await audit(db,req.user,'workbook_imported',{previewId,filename:preview.filename,fileHash:preview.fileHash,counts:preview.counts,warnings:preview.warnings,summary});
   await db.query("UPDATE fire_imports SET status=?,result_json=? WHERE id=?",[summary.remainingRows?'pending':'committed',JSON.stringify(summary),previewId]);return summary;
  },{serializeImport:true});ok(res,result,201);
 }));
 router.get('/records/export',asyncHandler(async(req,res)=>{
  const args=[],conditions=Q.recordFilters(req.fireAccess,req.query,'r',args);
  const {sectionExpression}=require('../fire-section');
  const [rows]=await pool.query(`SELECT r.*,c.name AS cycle_name,${sectionExpression('r.point_id','r.point_snapshot')} AS section_name,(SELECT COUNT(*) FROM fire_photos p WHERE p.record_id=r.id) AS photo_count FROM fire_records r JOIN fire_cycles c ON c.id=r.cycle_id WHERE ${conditions.join(' AND ')} ORDER BY r.id DESC LIMIT 10001`,args);if(rows.length>10000)F.fail(400,'导出超过10000条，请按周期、工段或区域筛选');
  const workbook=new Excel.Workbook(),sheet=workbook.addWorksheet('消防点检记录');sheet.addRow(['周期','点位编号','区域','工段','点位','位置','结果','点检人','实际点检时间（北京时间）','提交时间（北京时间）','补录原因','说明','照片数','器材明细']);
  const localTime=value=>F.isoTime(value)?new Date(F.isoTime(value)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';
  for(const r of rows){const point=parseJson(r.point_snapshot,{}),items=parseJson(r.items_json,[]);sheet.addRow([r.cycle_name,point.code,point.areaName,r.section_name||'',point.name,point.location,r.result==='normal'?'正常':'异常',r.actor_name,localTime(r.actual_checked_at),localTime(r.submitted_at),r.backfill_reason,r.remark,Number(r.photo_count),items.map(i=>`${i.assetSnapshot?.code||i.assetSnapshot?.name}：${({normal:'正常',abnormal:'异常',missing:'缺失'})[i.result]} ${i.remark}`).join('\n')]);}
  sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true};sheet.columns.forEach((c,i)=>{c.width=i===13?60:[5,11].includes(i)?35:22;});sheet.eachRow(r=>r.alignment={vertical:'top',wrapText:true});
  res.set('Content-Disposition','attachment; filename="fire-inspection-records.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await workbook.xlsx.writeBuffer()));
 }));
 return router;
}
module.exports={createRouter};

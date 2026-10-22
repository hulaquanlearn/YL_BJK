const C=require('../raw-duty-cadence');const {cadenceSummary}=require('../raw-duty-cadence-summary');
const T=require('../raw-duty-template');
const Q=require('../raw-duty-summary-quota');
const express=require('express'),multer=require('multer'),sharp=require('sharp');
const {dutyProgress}=require('../raw-duty-progress');const D=require('../raw-duties');const {asyncHandler}=require('../utils');
function createRouter(store,{generateSummary=require('../raw-duty-ai-summary').generateSummary}={}){
 const router=express.Router(),ok=(res,data)=>res.json({success:true,data});
 const summarizing=new Set();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');try{D.access(req.user);next()}catch(e){next(e)}});
 const validMember=m=>m&&Number(m.enabled)!==0&&(m.role==='raw_grain'||(m.role==='viewer'&&m.staffWorkshopCode==='raw_grain'&&m.staffPosition==='shift_leader'));
 const visible=(u,m)=>D.manager(u)||m.user_id===Number(u.id)||m.reviewer_id===Number(u.id);
 const reviewer=(u,m)=>D.manager(u)||m.reviewer_id===Number(u.id);
 async function membership(db,userId,user){const m=(await db.members()).find(m=>m.user_id===userId);if(!m||!visible(user,m))D.fail(403,'无权访问该人员的周材料');return m}
 async function load(db,reportId,user,lock=false,detail=true){const r=await db.reportById(D.id(reportId),lock);if(!r)D.fail(404,'周材料不存在');const m=await membership(db,r.user_id,user);if(detail&&r.user_id!==Number(user.id)&&r.status==='draft'&&!D.manager(user))D.fail(403,'草稿仅本人查看，负责人可查看填报进度');return {r,m}}
 function owner(user,m,r){if(r.user_id!==Number(user.id)||!m.active||!validMember(m))D.fail(403,'只能填写本人已分配的原粮履职记录');D.mutable(r)}
 function expect(r,v){if(r.revision!==D.revision(v))D.fail(409,'材料已被更新，请刷新后重试')}
 const monthReadable=user=>r=>D.manager(user)||r.user_id===Number(user.id)||r.status!=='draft';
 const publicReport=async(db,r,user)=>{r=await C.monthlyView(db,r,monthReadable(user));return ({id:r.id,user_id:r.user_id,week_start:r.week_start,identity:r.identity,template:r.template,checks:r.checks,cadence:r.cadence,summary:r.summary,feedback:r.feedback,status:r.status,revision:r.revision,submitted_at:r.submitted_at,confirmed_at:r.confirmed_at,updated_at:r.updated_at,photos:r.photos,events:r.id?await db.events(r.id):[],sharedMonths:r.sharedMonths||[]})};
 router.get('/context',asyncHandler(async(req,res)=>{
  const templates=(await store.templates()).filter(t=>Number(t.id)>0).map(T.publicTemplate),all=await store.members(),members=all.filter(m=>visible(req.user,m));
  const canManageMembers=req.user.role==='admin',summaryQuota=await Q.usage(store,req.user);
  ok(res,{canConfigure:D.manager(req.user),canManageMembers,canViewDrafts:D.manager(req.user),userId:Number(req.user.id),isReviewer:D.manager(req.user)||members.some(m=>m.reviewer_id===Number(req.user.id)),members:canManageMembers?members:members.map(m=>({user_id:m.user_id,reviewer_id:m.reviewer_id,active:m.active})),templates,users:canManageMembers?await store.users():[],results:D.results,statuses:D.statuses,summaryQuota});
 }));
 router.get('/summary-quota',asyncHandler(async(req,res)=>ok(res,await Q.usage(store,req.user))));
 router.post('/templates',asyncHandler(async(req,res)=>{if(!D.manager(req.user))D.fail(403,'仅原粮管理员或系统管理员可配置模板');ok(res,T.publicTemplate(await store.addTemplate(D.template(req.body),req.user.id)))}));
 async function changeTemplate(req,deleting=false){
  if(!D.manager(req.user))D.fail(403,'仅原粮管理员或系统管理员可配置模板');const id=D.id(req.params.id);
  return store.transaction(async db=>{const current=await db.templateById(id,true);if(!current)D.fail(404,'模板不存在');if(req.body.ifMatch!==T.etag(current))D.fail(409,'模板已被其他人修改，请刷新后重试');
   if(deleting){const assigned=(await db.members()).filter(m=>m.template_id===id);if(assigned.length)D.fail(409,'该模板仍分配给'+assigned.map(m=>m.name).join('、')+'，请先调整人员模板');await db.deleteTemplate(id);return true}
   return T.publicTemplate(await db.updateTemplate(id,D.template(req.body)));
  });
 }
 router.put('/templates/:id',asyncHandler(async(req,res)=>ok(res,await changeTemplate(req))));
 router.delete('/templates/:id',asyncHandler(async(req,res)=>ok(res,await changeTemplate(req,true))));
 router.put('/members/:userId',asyncHandler(async(req,res)=>{
  if(req.user.role!=='admin')D.fail(403,'仅系统管理员可查看和分配履职人员与负责人');
  const userId=D.id(req.params.userId),reviewerId=D.id(req.body.reviewerId),users=await store.users();
  if(!users.some(u=>Number(u.id)===userId)||!users.some(u=>Number(u.id)===reviewerId))D.fail(400,'填报人和负责人须为已启用的原粮账号');
  if(userId===reviewerId)D.fail(400,'请分配其他人员负责材料复核');
  const templateId=Number(req.body.templateId);if(!(await store.templates()).some(t=>t.id===templateId))D.fail(400,'请选择有效模板');
  const position=D.text(req.body.position,50);if(!position)D.fail(400,'请填写履职岗位');
  await store.transaction(async db=>{if(templateId&&!(await db.templateById(templateId,true)))D.fail(409,'模板已删除，请重新选择');await db.setMember({user_id:userId,reviewer_id:reviewerId,position_name:position,team_name:D.text(req.body.team,80),template_id:templateId,active:req.body.active!==false},D.revision(req.body.revision))});ok(res,true);
 }));
 router.get('/reports',asyncHandler(async(req,res)=>{
  const p=D.period(req.query.week),all=await store.members(),storedReports=await store.reports(p.start),templates=await store.templates(),reports=storedReports;
  ok(res,{period:p,items:await Promise.all(all.filter(m=>visible(req.user,m)&&(m.active||reports.some(r=>r.user_id===m.user_id))).map(async m=>{const raw=reports.find(r=>r.user_id===m.user_id),r=await C.monthlyView(store,raw||{id:null,user_id:m.user_id,week_start:p.start,template:templates.find(t=>t.id===m.template_id)||{entries:[]},checks:[],cadence:{version:2,calendar:{}}},monthReadable(req.user)),stats=cadenceSummary(r.template.entries,r.checks,r.cadence,p.start,D.today());return {userId:m.user_id,name:r?.identity?.name||m.name,position:r?.identity?.position||m.position_name,team:r?.identity?.team||m.team_name,reviewerName:m.reviewer_name,reportId:r?.id||null,status:r?.status||'empty',filled:stats.progress.filled,total:stats.progress.total,cadenceVersion:r?.cadence?.version||(!raw?2:1),...stats,updatedAt:r?.updated_at,canRead:D.manager(req.user)||!!raw&&(r.status!=='draft'||m.user_id===Number(req.user.id)),canReview:reviewer(req.user,m)&&m.user_id!==Number(req.user.id)}}))});
 }));
 router.get('/members/:userId/report',asyncHandler(async(req,res)=>{
  if(!D.manager(req.user))D.fail(403,'仅系统管理员或原粮车间管理员可查看未开始材料');
  const m=await membership(store,D.id(req.params.userId),req.user),p=D.period(req.query.week),r=await store.report(m.user_id,p.start);
  if(r)return ok(res,await publicReport(store,r,req.user));
  const template=(await store.templates()).find(t=>t.id===m.template_id);if(!template)D.fail(404,'职责模板不存在');
  ok(res,await publicReport(store,{id:null,user_id:m.user_id,week_start:p.start,identity:{name:m.name,position:m.position_name,team:m.team_name,reviewerName:m.reviewer_name},template,checks:[],cadence:{version:2,calendar:{}},summary:'',feedback:'',status:'empty',revision:0,photos:[],events:[]},req.user));
 }));
 router.post('/reports',asyncHandler(async(req,res)=>{
  const p=D.period(req.body.week);if(p.start>D.period().start)D.fail(400,'请在对应周开始后填报');
  const m=await membership(store,Number(req.user.id),req.user);if(!m.active||!validMember(m))D.fail(403,'请先由管理员分配履职人员和模板');
  let r=await store.report(m.user_id,p.start);if(!r){const t=(await store.templates()).find(t=>t.id===m.template_id);if(!t)D.fail(400,'职责模板不存在，请联系管理员');r=await store.transaction(async db=>C.carryMonthly(db,await db.createReport(m.user_id,p.start,{name:m.name,position:m.position_name,team:m.team_name,reviewerName:m.reviewer_name},t)))}
  ok(res,await publicReport(store,r,req.user));
 }));
 router.get('/reports/:id',asyncHandler(async(req,res)=>{const {r}=await load(store,req.params.id,req.user);ok(res,await publicReport(store,r,req.user))}));
 router.post('/reports/:id/summary',asyncHandler(async(req,res)=>{
  const {r,m}=await load(store,req.params.id,req.user);owner(req.user,m,r);expect(r,req.body.revision);
  if(summarizing.has(req.user.id))D.fail(409,'本周总结正在生成，请稍候');
  summarizing.add(req.user.id);let reservation;
  try{
   const {summaryEvidence}=require('../raw-duty-ai-summary'),view=await C.monthlyView(store,r),payload=summaryEvidence(view),source=JSON.stringify(payload);
   if(!payload.evidence.length)D.fail(400,'请先填写并保存履职事项，再生成周总结');
   reservation=await store.transaction(db=>Q.reserve(db,req.user,r.id));
   const result=await generateSummary(view);
   const summaryQuota=await store.transaction(async db=>{const latest=await load(db,r.id,req.user,true);owner(req.user,latest.m,latest.r);expect(latest.r,r.revision);if(JSON.stringify(summaryEvidence(await C.monthlyView(db,latest.r)))!==source)D.fail(409,'本周或共享月度材料已变化，请重新生成总结');await db.finishSummaryReservation(reservation.id,req.user.id,{quotaDate:reservation.detail.quotaDate,revision:r.revision,evidenceIds:result.evidenceIds,generatedAt:result.generatedAt});return Q.usage(db,req.user)});
   ok(res,{...result,sourceRevision:r.revision,summaryQuota});
  }catch(e){if(reservation)await store.releaseSummaryReservation(reservation.id,req.user.id);throw e}finally{summarizing.delete(req.user.id)}
 }));
 router.put('/reports/:id',asyncHandler(async(req,res)=>{
  const saved=await store.transaction(async db=>{const {r,m}=await load(db,req.params.id,req.user,true);owner(req.user,m,r);expect(r,req.body.revision);
   const p=D.period(r.week_start),cadenceMode=r.cadence?.version===2||req.body.upgradeCadence===true;
   let checks,cadence=r.cadence;
   if(cadenceMode){const view=await C.monthlyView(db,r);const data=C.validate(C.sharedInput(req.body.checks,view),r.template,view.photos,req.body.calendar||r.cadence?.calendar||{},r.week_start,req.body.submit===true,r.checks);checks=C.localChecks(data.checks,r.checks,view);cadence={...r.cadence,...data.cadence};if(req.body.upgradeCadence===true&&!r.cadence?.version)cadence.legacyChecks=r.checks}
   else {checks=D.checks(req.body.checks,r.template,await db.photos(r.id),req.body.submit===true);if(checks.some(c=>c.recordDate&&(c.recordDate<p.start||c.recordDate>p.end)))D.fail(400,'记录日期须在本周范围内')}
   const next={...r,checks,cadence,summary:D.text(req.body.summary),status:req.body.submit===true?'submitted':r.status,submitted_at:req.body.submit===true?new Date():r.submitted_at};
   const result=await db.updateReport(next,r.revision);await db.event(r.id,req.user.id,req.body.submit===true?'submitted':'saved',{revision:result.revision,checks,cadence,summary:next.summary});return result});ok(res,await publicReport(store,saved,req.user));
 }));
 router.post('/reports/:id/action',asyncHandler(async(req,res)=>{
  const saved=await store.transaction(async db=>{const {r,m}=await load(db,req.params.id,req.user,true);expect(r,req.body.revision);const action=req.body.action,feedback=D.text(req.body.feedback);
   if(action==='withdraw'){if(r.user_id!==Number(req.user.id)||!m.active||!validMember(m)||r.status!=='submitted')D.fail(403,'只能撤回本人尚未确认的材料');r.status='draft'}
   else {if(!reviewer(req.user,m)||r.user_id===Number(req.user.id))D.fail(403,'仅授权负责人可复核他人的材料');
    if(action==='confirm'&&r.status==='submitted'){r.status='confirmed';r.confirmed_at=new Date();r.reviewed_by=req.user.id}
    else if(action==='return'&&r.status==='submitted'){if(!feedback)D.fail(400,'请填写需要补充的内容');r.status='returned';r.reviewed_by=req.user.id}
    else if(action==='reopen'&&r.status==='confirmed'){if(!feedback)D.fail(400,'请填写重新打开的原因');r.status='returned';r.confirmed_at=null;r.reviewed_by=req.user.id}
    else D.fail(409,'材料状态已变化，当前操作不可用');r.feedback=feedback;
   }
   const result=await db.updateReport(r,r.revision);await db.event(r.id,req.user.id,action,{revision:result.revision,feedback,checks:r.checks,cadence:r.cadence,summary:r.summary});return result});ok(res,await publicReport(store,saved,req.user));
 }));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}}).single('file');
 router.post('/reports/:id/photos',upload,asyncHandler(async(req,res)=>{
  const current=await load(store,req.params.id,req.user);owner(req.user,current.m,current.r);expect(current.r,Number(req.body.revision));
  if(!req.file)D.fail(400,'请选择图片');let image;try{image=await sharp(req.file.buffer,{limitInputPixels:30000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer()}catch{D.fail(400,'图片无法读取，请使用有效的照片或截图')}
  const saved=await store.transaction(async db=>{const {r,m}=await load(db,req.params.id,req.user,true);owner(req.user,m,r);expect(r,Number(req.body.revision));const photos=await db.photos(r.id);
   if(photos.length>=30||photos.reduce((n,p)=>n+Number(p.byte_size),0)+image.length>20*1024*1024)D.fail(400,'每周最多30张图片、合计20MB');
   const photoId=await db.addPhoto(r.id,{image,mime:'image/jpeg',filename:D.text(req.file.originalname,160)||'验证材料.jpg'});
   const next=await db.updateReport(r,r.revision);await db.event(r.id,req.user.id,'photo_added',{photoId,revision:next.revision});return next});ok(res,await publicReport(store,saved,req.user));
 }));
 router.delete('/reports/:id/photos/:photoId',asyncHandler(async(req,res)=>{
  const saved=await store.transaction(async db=>{const {r,m}=await load(db,req.params.id,req.user,true);owner(req.user,m,r);expect(r,req.body.revision);const photoId=D.id(req.params.photoId),photos=await db.photos(r.id);if(!photos.some(p=>p.id===photoId))D.fail(404,'图片不存在');
   if(r.submitted_at)D.fail(409,'已提交过的图片需保留历史凭证，可取消关联并上传新材料');
   if(r.checks.some(c=>[c,...(c.dailyRecords||[]),...(c.monthlyRecords||[])].some(v=>(v.photoIds||[]).includes(photoId))))D.fail(409,'请先取消该图片与各事项的关联并保存');await db.removePhoto(photoId);const next=await db.updateReport(r,r.revision);await db.event(r.id,req.user.id,'photo_removed',{photoId});return next});ok(res,await publicReport(store,saved,req.user));
 }));
 router.get('/photos/:id',asyncHandler(async(req,res)=>{const p=await store.photo(D.id(req.params.id));if(!p)D.fail(404,'图片不存在');await load(store,p.report_id,req.user);res.type(p.mime).send(p.image)}));
 async function exportData(db,reportId,user){const {r}=await load(db,reportId,user,true);const view=await C.monthlyView(db,r,monthReadable(user),true);return {report:view,photos:view.photos}}
 router.get('/reports/:id/export',asyncHandler(async(req,res)=>{
  const data=await store.transaction(db=>exportData(db,req.params.id,req.user));const buffer=await require('../raw-duty-export').workbook(data.report,data.photos);res.set('Content-Disposition',`attachment; filename="raw-duty-${data.report.week_start}-${data.report.user_id}.xlsx"`).type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
 }));
 router.post('/export',asyncHandler(async(req,res)=>{
  if(!Array.isArray(req.body.reportIds)||!req.body.reportIds.length||req.body.reportIds.length>20)D.fail(400,'每次请选择1至20份已提交或确认的周材料');
  const ids=[...new Set(req.body.reportIds.map(D.id))].sort((a,b)=>a-b);
  const data=await store.transaction(async db=>{const items=[];for(const id of ids){const item=await exportData(db,id,req.user);if(!['submitted','confirmed'].includes(item.report.status))D.fail(400,'批量正式周包只包含已提交或已确认材料');items.push(item)}if(new Set(items.map(i=>i.report.week_start)).size!==1)D.fail(400,'请导出同一周的材料');return items});
  res.set('Content-Disposition','attachment; filename="raw-duty-weekly.zip"').type('application/zip').send(await require('../raw-duty-export').batch(data));
 }));
 return router;
}
module.exports={createRouter};

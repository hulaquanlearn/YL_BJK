// Isolated fixture for HTTP tests and opt-in local preview. Never mounted by app.js.
const express=require('express'),v8=require('node:v8');
const D=require('../../src/raw-duties');
const clone=value=>v8.deserialize(v8.serialize(value));
function memoryStore({newReportVersion=2}={}){
 let state={users:[{id:1,name:'本地预览管理员',role:'admin'},{id:2,name:'原粮预览管理员',role:'raw_grain'},{id:11,name:'示例人员甲',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{id:12,name:'示例人员乙',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{id:13,name:'示例人员丙',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{id:21,name:'示例负责人',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{id:22,name:'另一组负责人',role:'viewer',staffWorkshopCode:'raw_grain',staffPosition:'shift_leader'},{id:31,name:'制曲示例人员',role:'viewer',staffWorkshopCode:'qu_making'}],members:[],templates:[],reports:[],photos:[],events:[],nextReport:1,nextPhoto:1,nextTemplate:1},tail=Promise.resolve();
 const store={
  async transaction(fn){const previous=tail;let release;tail=new Promise(r=>release=r);await previous;const backup=clone(state);try{return await fn(store)}catch(e){state=backup;throw e}finally{release()}},
  async users(){return clone(state.users.filter(D.rawUser))},
  async members(){return clone(state.members.map(m=>({...m,name:state.users.find(u=>u.id===m.user_id)?.name,reviewer_name:state.users.find(u=>u.id===m.reviewer_id)?.name,enabled:1,staffPosition:state.users.find(u=>u.id===m.user_id)?.staffPosition,role:state.users.find(u=>u.id===m.user_id)?.role,staffWorkshopCode:state.users.find(u=>u.id===m.user_id)?.staffWorkshopCode})))},
  async setMember(m,revision){const old=state.members.find(v=>v.user_id===m.user_id);if((old?.revision||0)!==revision)D.fail(409,'人员分配已更新，请刷新');if(old)Object.assign(old,m,{revision:revision+1});else state.members.push({...m,revision:1})},
  async templates(){return clone([...state.templates,D.defaultTemplate])},
  async addTemplate(t){const value={...t,id:state.nextTemplate++};state.templates.unshift(value);return clone(value)},
  async templateById(id){return clone(state.templates.find(t=>t.id===id)||null)},
  async updateTemplate(id,t){const i=state.templates.findIndex(v=>v.id===id);state.templates[i]={...clone(t),id};return clone(state.templates[i])},
  async deleteTemplate(id){state.templates=state.templates.filter(t=>t.id!==id)},
  async reports(start){return clone(state.reports.filter(r=>r.week_start===start))},
  async reportsForUser(userId,monthStart,end){const from=new Date(Date.parse(monthStart+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);return clone(state.reports.filter(r=>r.user_id===userId&&r.week_start>=from&&r.week_start<=end))},
  async report(userId,start){return clone(state.reports.find(r=>r.user_id===userId&&r.week_start===start)||null)},
  async reportById(id){return clone(state.reports.find(r=>r.id===Number(id))||null)},
  async createReport(userId,start,identity,template){if(state.reports.some(r=>r.user_id===userId&&r.week_start===start))D.fail(409,'材料已创建');const r={id:state.nextReport++,user_id:userId,week_start:start,identity:clone(identity),template:clone(template),checks:[],cadence:newReportVersion===2?{version:2,calendar:{}}:null,status:'draft',summary:'',feedback:'',revision:1,updated_at:new Date().toISOString()};state.reports.push(r);return clone(r)},
  async updateReport(r,expected){const i=state.reports.findIndex(v=>v.id===r.id);if(i<0||state.reports[i].revision!==expected)D.fail(409,'材料已被更新，请刷新');state.reports[i]=clone({...r,revision:expected+1,updated_at:new Date().toISOString()});return clone(state.reports[i])},
  async photos(reportId,data=false){return clone(state.photos.filter(p=>p.report_id===reportId).map(p=>{const {image,...info}=p;return data?p:info}))},
  async photo(id){return clone(state.photos.find(p=>p.id===id)||null)},
  async addPhoto(reportId,f){const p={id:state.nextPhoto++,report_id:reportId,...f,byte_size:f.image.length};state.photos.push(p);return p.id},
  async removePhoto(id){state.photos=state.photos.filter(p=>p.id!==id)},
  async lockSummaryUser(){},
  async summaryQuotaUsed(actor,w){return state.events.filter(e=>e.actor_id===actor&&['ai_summary_generated','ai_summary_reserved'].includes(e.action)&&(e.detail.quotaDate===w.date||!e.detail.quotaDate&&e.detail.generatedAt>=w.start&&e.detail.generatedAt<w.end)&&(e.action==='ai_summary_generated'||e.detail.expiresAt>w.now)).length},
  async finishSummaryReservation(id,actor,detail){const e=state.events.find(e=>e.id===id&&e.actor_id===actor&&e.action==='ai_summary_reserved');if(!e)D.fail(409,'总结状态已变化');Object.assign(e,{action:'ai_summary_generated',detail:clone(detail)})},
  async releaseSummaryReservation(id,actor){const e=state.events.find(e=>e.id===id&&e.actor_id===actor&&e.action==='ai_summary_reserved');if(e)e.action='ai_summary_failed'},
  async event(reportId,actor,action,detail){const id=state.events.length+1;state.events.push({id,report_id:reportId,actor_id:actor,actor_name:state.users.find(u=>u.id===actor)?.name,action,detail:clone(detail),created_at:new Date().toISOString()});return id},
  async events(reportId){return clone(state.events.filter(e=>e.report_id===reportId&&!['ai_summary_reserved','ai_summary_failed'].includes(e.action)).slice(-50).reverse().map(({detail,...e})=>e))},
  state(){return clone(state)}
 };return store;
}
async function createFixture({seed=true,newReportVersion=2,legacyExample=false,summaryGenerator,extendApp}={}){
 const store=memoryStore({newReportVersion}),users=store.state().users;
 for(const user of [11,12,13])await store.setMember({user_id:user,reviewer_id:user===13?22:21,position_name:user===12?'班长':'工段长',team_name:user===13?'原粮二工段':'原粮一工段',template_id:0,active:true},0);
 if(seed){const start=D.period().start;
  const r=await store.createReport(11,start,{name:'示例人员甲',position:'工段长',team:'原粮一工段'},D.defaultTemplate);
  const image=await require('sharp')({create:{width:800,height:480,channels:3,background:'#edf0f7'}}).composite([{input:Buffer.from('<svg width="800" height="480"><rect x="55" y="65" width="690" height="350" rx="24" fill="white"/><text x="95" y="140" font-size="32" fill="#6263a8">SIMULATED VERIFICATION MATERIAL</text><text x="95" y="215" font-size="25" fill="#536179">Raw grain weekly inspection</text><text x="95" y="275" font-size="22" fill="#8892a2">Local preview only / No production evidence</text></svg>')}]).jpeg().toBuffer();
  const photoId=await store.addPhoto(r.id,{image,mime:'image/jpeg',filename:'模拟验证材料.jpg'});
  r.checks=r.template.entries.map((e,i)=>({dutyId:e.id,result:e.frequency==='持续开展'?'本周未发生':e.frequency==='每月'?'进行中':'已完成',note:e.frequency==='持续开展'?'【模拟】本周未发生相关异常，持续关注。':e.frequency==='每月'?'【模拟】本月谈心安排正在推进，本周完成情况已登记。':'【模拟】本周按职责开展检查，执行情况已记录。',action:i===6?'【模拟】工具摆放问题已提醒并跟进整理。':'',recordDate:start,photoIds:[0,1,6,11].includes(i)?[photoId]:[]}));if(newReportVersion===2){
   const days=require('../../src/raw-duty-cadence-summary').weekDays(start),today=D.today();r.cadence={version:2,calendar:Object.fromEntries(days.map(d=>[d,d<=today?'work':'rest']))};
   r.checks=r.checks.map(c=>{const e=r.template.entries.find(e=>e.id===c.dutyId);if(e.frequency==='每班')return {dutyId:e.id,dailyRecords:days.filter(d=>d<=today).map(d=>({...c,date:d,recordDate:d,result:e.id==='raw-9'&&d===days[1]?'未完成':c.result,note:e.id==='raw-9'&&d===days[1]?'【模拟】现场问题正在跟进整改':c.note}))};if(e.frequency==='每月')return {dutyId:e.id,monthlyRecords:[{...c,month:start.slice(0,7)}]};return c});
  }r.status='submitted';r.summary='【模拟】完成本周现场检查与工作安排，继续跟进月度事项。';r.submitted_at=new Date().toISOString();await store.updateReport(r,r.revision);
  const draft=await store.createReport(12,start,{name:'示例人员乙',position:'工段长',team:'原粮二工段'},D.defaultTemplate);draft.checks=clone(r.checks.slice(0,8)).map(c=>({...c,photoIds:[]}));
  if(newReportVersion===2){const days=require('../../src/raw-duty-cadence-summary').weekDays(start);draft.cadence={version:2,calendar:{[days[0]]:'work',[days[1]]:'work',[days[2]]:'rest'}};draft.checks=draft.checks.map(c=>({...c,dailyRecords:c.dailyRecords?.filter(v=>v.date===days[0]||v.date===days[1]&&c.dutyId==='raw-1').map(v=>({...v,photoIds:[]})),monthlyRecords:c.monthlyRecords?.map(v=>({...v,photoIds:[]}))}))}
  if(legacyExample){draft.cadence=null;draft.checks=draft.template.entries.slice(0,2).map(e=>({dutyId:e.id,result:'已完成',note:'【模拟旧材料】已完成本周工作，原材料未记录具体日期。',action:'',recordDate:'',photoIds:[]}))}
  await store.updateReport(draft,draft.revision);
  const returned=await store.createReport(13,start,{name:'示例人员丙',position:'工段长',team:'原粮二工段'},D.defaultTemplate);returned.checks=clone(r.checks).map(c=>({...c,photoIds:[],dailyRecords:c.dailyRecords?.map(v=>({...v,photoIds:[]})),monthlyRecords:c.monthlyRecords?.map(v=>({...v,photoIds:[]}))}));returned.cadence=clone(r.cadence);returned.status='returned';returned.feedback='【模拟】请补充设备保养抽查的具体情况。';await store.updateReport(returned,returned.revision);
 }
 const app=express();app.use(express.json({limit:'4mb'}));
 const accounts={admin:1,raw_grain:2,worker:11,worker2:12,reviewer:21,reviewer2:22,other:31};
 app.post('/api/auth/login',async(req,res)=>{const user=users.find(u=>u.id===accounts[req.body.username]),valid=user?.passwordHash?await require('../../src/password').verifyPassword(req.body.password,user.passwordHash):req.body.password==='preview';if(!user||!valid||user.enabled===false||user.enabled===0)return res.status(401).json({success:false,msg:'本地预览账号密码错误或账号已停用'});res.json({success:true,data:{token:'raw-preview-'+req.body.username,user:{...user,passwordHash:undefined,displayName:user.name}}})});
 app.get('/api/health',(_req,res)=>res.json({success:true,database:'preview-only',preview:true}));
 app.use('/api',(req,res,next)=>{const key=String(req.get('Authorization')||'').replace('Bearer raw-preview-',''),user=users.find(u=>u.id===accounts[key]);if(!user||user.enabled===false||user.enabled===0)return res.status(401).json({success:false,msg:'请登录本地预览账号'});const {passwordHash,...publicUser}=user;req.user={...publicUser,username:key,displayName:user.name};next()});
 app.get('/api/auth/me',(req,res)=>res.json({success:true,data:{user:req.user}}));app.post('/api/auth/logout',(_req,res)=>res.json({success:true}));
 app.patch('/api/auth/profile',(req,res,next)=>{try{const displayName=require('../../src/personal-profile').profileName(req.body);users.find(u=>u.id===req.user.id).name=displayName;res.json({success:true,data:{user:{...req.user,displayName}}})}catch(e){next(e)}});
 // Password changes are intentionally unavailable in the disposable preview;
 // the production endpoint has transaction/session-revocation coverage.
 app.post('/api/auth/change-password',(_req,res)=>res.status(400).json({success:false,msg:'本地演示账号密码固定为 preview，正式账号可正常修改密码'}));
 if(extendApp)await extendApp(app,{store,accounts,users});
 app.get('/api/attendance/reports',(req,res)=>require('../../src/attendance-access').canReadAttendance(req.user)?res.json({success:true,data:[]}):res.status(403).json({success:false,msg:'当前账号没有考勤查看权限'}));
 app.use('/api/raw-duties',(req,res,next)=>{const json=res.json.bind(res);res.json=body=>{if(req.path==='/context'&&body.data)body.data.preview=true;return json(body)};next()},require('../../src/routes/raw-duties').createRouter(store,summaryGenerator?{generateSummary:summaryGenerator}:{}));
 app.use('/api',(_req,res)=>res.status(404).json({success:false,msg:'此预览仅提供原粮周履职功能'}));
 app.use((e,_req,res,_next)=>res.status(e.status||(e.code==='LIMIT_FILE_SIZE'?400:500)).json({success:false,msg:e.code==='LIMIT_FILE_SIZE'?'每张图片不能超过8MB':e.status?e.message:'本地预览内部错误'}));
 return {app,store,accounts};
}
module.exports={memoryStore,createFixture};

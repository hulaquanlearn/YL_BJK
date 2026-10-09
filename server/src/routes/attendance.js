const express=require('express'),multer=require('multer'),crypto=require('node:crypto');
const {pool}=require('../db');
const {ApiError,asyncHandler,parseJson}=require('../utils');
const {analyzeFiles,LIMITS}=require('../attendance-workbook');
const router=express.Router();
const ok=(res,data)=>res.json({success:true,data});
const positiveId=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new ApiError(400,'记录编号无效');return n;};
function requireAttendanceAccess(req,_res,next){if(!['admin','raw_grain'].includes(req.user?.role))return next(new ApiError(403,'考勤核查仅供原粮车间管理员和系统管理员使用'));next();}
router.use(requireAttendanceAccess);
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:LIMITS.fileBytes,files:2,fields:4,fieldSize:2048}}).fields([{name:'schedule',maxCount:1},{name:'attendance',maxCount:1}]);
function receive(req,res,next){upload(req,res,error=>{
  if(error)return next(new ApiError(400,error.code==='LIMIT_FILE_SIZE'?'单个文件不能超过10MB':'文件上传失败，请分别选择一份排班表和一份考勤表'));
  // Browser multipart filenames arrive through Busboy as Latin-1 bytes.
  for(const group of Object.values(req.files||{}))for(const file of group){const name=file.originalname;if(/[\u0080-\u00ff]/.test(name)&&[...name].every(c=>c.charCodeAt(0)<=255)){const decoded=Buffer.from(name,'latin1').toString('utf8');if(!decoded.includes('\ufffd'))file.originalname=decoded;}}
  next();
});}
let active=0;
async function analyze(req){
  if(active>=2)throw new ApiError(429,'考勤分析任务较多，请稍后再试');active++;
  try{return await analyzeFiles(req.files?.schedule?.[0],req.files?.attendance?.[0],{month:req.body.month,observationHours:req.body.observationHours});}finally{active--;}
}
async function transaction(fn){const db=await pool.getConnection();try{await db.beginTransaction();const r=await fn(db);await db.commit();return r;}catch(e){await db.rollback();throw e;}finally{db.release();}}
async function getReport(db,value,lock=false){const [rows]=await db.query(`SELECT * FROM attendance_reports WHERE id=? AND workshop_code='raw_grain'${lock?' FOR UPDATE':''}`,[positiveId(value)]);if(!rows.length)throw new ApiError(404,'考勤分析已被删除或不存在');return rows[0];}
async function reportData(report){const [notes]=await pool.query('SELECT entry_key,note,updated_at FROM attendance_notes WHERE report_id=?',[report.id]);return {id:report.id,title:report.title,revision:report.revision,retentionUntil:report.retention_until,analysis:parseJson(report.analysis_json,{}),notes:Object.fromEntries(notes.map(n=>[n.entry_key,{note:n.note,updatedAt:n.updated_at}]))};}
router.post('/preview',receive,asyncHandler(async(req,res)=>ok(res,await analyze(req))));
router.get('/reports',asyncHandler(async(_req,res)=>{const [rows]=await pool.query("SELECT id,title,period,revision,retention_until,created_at,updated_at FROM attendance_reports WHERE workshop_code='raw_grain' ORDER BY updated_at DESC,id DESC LIMIT 100");ok(res,rows);}));
router.get('/reports/:id',asyncHandler(async(req,res)=>ok(res,await reportData(await getReport(pool,req.params.id)))));
router.post('/reports',receive,asyncHandler(async(req,res)=>{
  const analysis=await analyze(req);
  if(analysis.warnings.length&&req.body.acknowledgeWarnings!=='true')throw new ApiError(409,'发现导入提醒，请确认后再保存',analysis.warnings.slice(0,100));
  const files=[['schedule',req.files.schedule[0]],['attendance',req.files.attendance[0]]];
  const fingerprint=crypto.createHash('sha256').update(analysis.month).update(files[0][1].buffer).update(files[1][1].buffer).digest('hex');
  const report=await transaction(async db=>{
    // Serialize imports without a large unique blob; hash is indexed and duplicate imports reuse the report.
    const title=`原粮考勤核查 · ${analysis.month}`;
    const [saved]=await db.query("INSERT INTO attendance_reports(workshop_code,title,period,owner_id,analysis_json,source_hash,retention_until) VALUES('raw_grain',?,?,?,?,?,DATE_ADD(CURRENT_DATE(),INTERVAL 180 DAY)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",[title,analysis.month,req.user.id,JSON.stringify(analysis),fingerprint]);
    const [present]=await db.query('SELECT id FROM attendance_sources WHERE report_id=?',[saved.insertId]);
    if(!present.length)for(const [kind,file] of files)await db.query('INSERT INTO attendance_sources(report_id,source_kind,filename,sha256,byte_size,content) VALUES(?,?,?,?,?,?)',[saved.insertId,kind,String(file.originalname).slice(0,180),crypto.createHash('sha256').update(file.buffer).digest('hex'),file.buffer.length,file.buffer]);
    const current=await getReport(db,saved.insertId,true);
    if(parseJson(current.analysis_json,{}).options?.observationHours!==analysis.options.observationHours)await db.query('UPDATE attendance_reports SET analysis_json=?,revision=revision+1 WHERE id=?',[JSON.stringify(analysis),saved.insertId]);
    return getReport(db,saved.insertId);
  });ok(res,await reportData(report));
}));
router.post('/reports/:id/reanalyze',asyncHandler(async(req,res)=>{
  const report=await getReport(pool,req.params.id);
  const [sources]=await pool.query('SELECT source_kind,filename,content FROM attendance_sources WHERE report_id=?',[report.id]);
  const source=kind=>{const s=sources.find(s=>s.source_kind===kind);return s?{originalname:s.filename,buffer:s.content}:null;};
  if(active>=2)throw new ApiError(429,'考勤分析任务较多，请稍后再试');active++;
  let analysis;try{analysis=await analyzeFiles(source('schedule'),source('attendance'),{month:report.period,observationHours:req.body.observationHours});}finally{active--;}
  const updated=await transaction(async db=>{const current=await getReport(db,report.id,true);if(current.revision!==Number(req.body.revision))throw new ApiError(409,'记录已更新，请重新加载');await db.query('UPDATE attendance_reports SET analysis_json=?,revision=revision+1 WHERE id=?',[JSON.stringify(analysis),report.id]);return getReport(db,report.id);});
  ok(res,await reportData(updated));
}));
router.patch('/reports/:id/notes',asyncHandler(async(req,res)=>{
  const note=String(req.body.note??'').trim(),key=String(req.body.entryKey||'');if(note.length>2000)throw new ApiError(400,'核查备注不能超过2000字');
  const result=await transaction(async db=>{const report=await getReport(db,req.params.id,true);if(report.revision!==Number(req.body.revision))throw new ApiError(409,'记录已更新，请重新加载后保存备注');const analysis=parseJson(report.analysis_json,{});if(!analysis.results?.some(r=>r.key===key))throw new ApiError(400,'人员班次不存在');await db.query('INSERT INTO attendance_notes(report_id,entry_key,note,actor_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE note=VALUES(note),actor_id=VALUES(actor_id),updated_at=CURRENT_TIMESTAMP',[report.id,key,note,req.user.id]);await db.query('UPDATE attendance_reports SET revision=revision+1 WHERE id=?',[report.id]);return {revision:report.revision+1,note};});ok(res,result);
}));
router.get('/reports/:id/sources/:kind/download',asyncHandler(async(req,res)=>{
  const report=await getReport(pool,req.params.id);if(!['schedule','attendance'].includes(req.params.kind))throw new ApiError(400,'文件类型无效');const [rows]=await pool.query('SELECT filename,content FROM attendance_sources WHERE report_id=? AND source_kind=?',[report.id,req.params.kind]);if(!rows.length)throw new ApiError(404,'原始文件已被清理');res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition',`attachment; filename="attendance.xlsx"; filename*=UTF-8''${encodeURIComponent(rows[0].filename)}`);res.send(rows[0].content);
}));
module.exports=router;
module.exports.requireAttendanceAccess=requireAttendanceAccess;

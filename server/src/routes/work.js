const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { asyncHandler, ApiError, parseJson } = require('../utils');
const { normalizeWorkshopCode, workshopForRole } = require('../workshop-scope');
const W = require('../work-assessment');
const config = require('../config');
const { businessAiAllowed } = require('../data-protection');
const router = express.Router();
router.use((req,_res,next)=>req.user?.role!=='admin'&&req.user?.role!=='qu_making'&&
  !(req.user?.role==='viewer'&&(!req.user.staffWorkshopCode||req.user.staffWorkshopCode==='qu_making'))
  ?next(new ApiError(403,'组长履职考评仅供制曲车间授权人员使用')):next());
const ok = (res, data) => res.json({ success: true, data });
const id = v => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 1) throw new ApiError(400, '编号无效'); return n; };
const decode = row => row && ({ ...row, payload: parseJson(row.payload, {}), rules_json: parseJson(row.rules_json, null), result_json: parseJson(row.result_json, null) });
async function member(db, userId) {
  const [rows] = await db.query('SELECT * FROM work_members WHERE user_id=? AND active=1', [id(userId)]);
  if (!rows[0] || rows[0].workshop_code !== 'qu_making') throw new ApiError(403, '制曲车间组长履职考评尚未为此账号配置');
  return rows[0];
}
async function reviewerScope(user){
  if(user.role!=='viewer')return null;
  if((user.staffWorkshopCode&&user.staffWorkshopCode!=='qu_making')||(user.staffPosition&&user.staffPosition!=='shift_leader'))return null;
  const [rows]=await pool.query('SELECT workshop_code FROM work_reviewers WHERE user_id=? AND active=1',[user.id]);
  return rows[0]?.workshop_code==='qu_making'?'qu_making':null;
}
async function canReview(user,workshop){return workshop==='qu_making'&&(W.manager(user,workshop)||(await reviewerScope(user))===workshop);}
async function allow(user,m){if(!W.readable(user,m)&&!await canReview(user,m.workshop_code))throw new ApiError(403,'无权查看其他人员的考评资料');}
function manage(user, workshop) { if (workshop!=='qu_making'||!W.manager(user, workshop)) throw new ApiError(403, '仅制曲车间管理员及以上可配置'); }
async function review(user,workshop){if(!await canReview(user,workshop))throw new ApiError(403,'仅获授权的班长、车间管理员及以上可复核');}
async function rulesAt(db, workshop, start) {
  const [rows] = await db.query('SELECT * FROM work_rules WHERE workshop_code=? AND effective_week<=? ORDER BY effective_week DESC,id DESC LIMIT 1', [workshop, start]);
  return rows[0] ? { ...rows[0], rules: parseJson(rows[0].rules_json, []) } : null;
}
async function transaction(fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
  catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
async function lockReport(db, userId, start, workshop) {
  await db.query('INSERT IGNORE INTO work_reports(user_id,week_start,workshop_code) VALUES(?,?,?)', [userId, start, workshop]);
  const [rows] = await db.query('SELECT * FROM work_reports WHERE user_id=? AND week_start=? FOR UPDATE', [userId, start]);
  return decode(rows[0]);
}
async function audit(db, reportId, actor, action, detail) {
  if (['record_updated','record_created','photo_added','photo_removed'].includes(action)) {
    await db.query('UPDATE work_reports SET revision=revision+1,result_json=NULL WHERE id=?', [reportId]);
  }
  await db.query('INSERT INTO work_audit(report_id,actor_id,action,detail) VALUES(?,?,?,?)', [reportId, actor, action, JSON.stringify(detail)]);
}
async function requireDutyPhotos(db, recordId, payload) {
  const required = (payload.checks || []).map(check => W.duties.get(check.dutyId)).filter(duty => duty?.photoRequired);
  if (!required.length) return;
  const [rows] = await db.query('SELECT task_key FROM work_photos WHERE record_id=?', [recordId]);
  const attached = new Set(rows.map(row => row.task_key));
  const missing = required.filter(duty => !attached.has(duty.id));
  if (missing.length) throw new ApiError(400, `请先保存草稿并为以下事项上传照片：${missing.map(duty => duty.title).join('、')}`);
}
async function requireWeekDutyPhotos(db,userId,start){
  const [records]=await db.query("SELECT id,payload FROM work_records WHERE user_id=? AND week_start=? AND kind='duties' AND status='submitted'",[userId,start]);
  if(!records.length)return;
  const [photos]=await db.query('SELECT p.record_id,p.task_key FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE r.user_id=? AND r.week_start=?',[userId,start]);
  const attached=new Set(photos.map(photo=>`${photo.record_id}:${photo.task_key}`));
  for(const record of records){
    const payload=parseJson(record.payload,{});
    for(const check of payload.checks||[]){const duty=W.duties.get(check.dutyId);if(duty?.photoRequired&&!attached.has(`${record.id}:${duty.id}`))throw new ApiError(400,`记录 ${record.id} 的“${duty.title}”缺少必传照片，请补齐后再发布`);}
  }
}
router.get('/context', asyncHandler(async (req, res) => {
  const scope=req.user.role==='admin'?null:req.user.role==='qu_making'?'qu_making':await reviewerScope(req.user),canConfigure=req.user.role==='admin'||req.user.role==='qu_making';
  const isManager=canConfigure||Boolean(scope);
  const [members]=await pool.query(`SELECT m.*,u.display_name AS name FROM work_members m JOIN app_users u ON u.id=m.user_id WHERE m.active=1 AND m.workshop_code='qu_making' ${req.user.role==='admin'?'':isManager?'AND m.workshop_code=?':'AND m.user_id=?'} ORDER BY u.display_name`,req.user.role==='admin'?[]:[isManager?scope:req.user.id]);
  const [users]=canConfigure?await pool.query('SELECT id,display_name AS name,role FROM app_users WHERE enabled=1 ORDER BY display_name'):[[]];
  ok(res,{members,users,isManager,canConfigure,workRole:scope&&req.user.role==='viewer'?'shift_leader':members.some(row=>String(row.user_id)===String(req.user.id))?'group_leader':null,scope,userId:req.user.id,duties:W.duties.entries});
}));
router.get('/reviewers',asyncHandler(async(req,res)=>{const workshop=normalizeWorkshopCode(req.query.workshop);if(!workshop)throw new ApiError(400,'请选择车间');manage(req.user,workshop);const [rows]=await pool.query('SELECT r.user_id,r.workshop_code,r.active,u.display_name AS name FROM work_reviewers r JOIN app_users u ON u.id=r.user_id WHERE r.workshop_code=? ORDER BY u.display_name',[workshop]);ok(res,rows);}));
router.post('/reviewers',asyncHandler(async(req,res)=>{const workshop=normalizeWorkshopCode(req.body.workshop);if(workshop!=='qu_making')throw new ApiError(400,'班长复核授权当前仅适用于制曲车间');manage(req.user,workshop);const userId=id(req.body.userId),active=req.body.active===true?1:0;await transaction(async db=>{const [users]=await db.query('SELECT role,staff_workshop_code,staff_position FROM app_users WHERE id=? AND enabled=1 FOR UPDATE',[userId]);if(users[0]?.role!=='viewer')throw new ApiError(400,'班长应使用车间人员账号，不能赋予管理层角色');if(users[0].staff_workshop_code&&users[0].staff_workshop_code!=='qu_making')throw new ApiError(403,'只能授权制曲车间人员');if(users[0].staff_position&&users[0].staff_position!=='shift_leader')throw new ApiError(400,'班长复核须使用班长岗位账号');if(active){const [memberRows]=await db.query('SELECT user_id FROM work_members WHERE user_id=? AND active=1',[userId]);if(memberRows.length)throw new ApiError(409,'该账号已是组长填报人员，请先核对职责，不能同时兼任本人考评的班长');}await db.query('INSERT INTO work_reviewers(user_id,workshop_code,active,assigned_by) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE workshop_code=VALUES(workshop_code),active=VALUES(active),assigned_by=VALUES(assigned_by)',[userId,workshop,active,req.user.id]);});ok(res,true);}));
router.post('/members', asyncHandler(async (req, res) => {
  const workshop = normalizeWorkshopCode(req.body.workshop);
  if (!workshop) throw new ApiError(400, '请选择车间');
  if (workshop !== 'qu_making') throw new ApiError(400, '组长履职考评当前仅适用于制曲车间');
  manage(req.user, workshop);
  const userId = id(req.body.userId), floor = W.num(req.body.floor, 1, 5);
  if (!Number.isInteger(floor)) throw new ApiError(400, '楼层无效');
  await transaction(async db => {
    const [users] = await db.query('SELECT id,role,staff_workshop_code,staff_position FROM app_users WHERE id=? AND enabled=1 FOR UPDATE', [userId]);
    if (users[0]?.role !== 'viewer') throw new ApiError(400, '组长应使用车间人员账号，不能赋予管理层角色');
    if (users[0].staff_workshop_code && users[0].staff_workshop_code !== 'qu_making') throw new ApiError(403, '只能配置制曲车间人员');
    if (users[0].staff_position && users[0].staff_position !== 'group_leader') throw new ApiError(400, '组长填报须使用组长岗位账号');
    const [reviewers]=await db.query('SELECT user_id FROM work_reviewers WHERE user_id=? AND active=1',[userId]);
    if(reviewers.length)throw new ApiError(409,'该账号已是班长复核人员，不能同时作为组长填报人员');
    const [old] = await db.query('SELECT * FROM work_members WHERE user_id=? FOR UPDATE', [userId]);
    if (old[0] && old[0].workshop_code !== workshop) throw new ApiError(409, '已有考评归属，请勿跨车间改派；历史数据需单独迁移');
    await db.query('INSERT INTO work_members(user_id,workshop_code,floor) VALUES(?,?,?) ON DUPLICATE KEY UPDATE floor=VALUES(floor)', [userId, workshop, floor]);
  });
  ok(res, true);
}));
router.get('/overview', asyncHandler(async (req, res) => {
  const workshop=normalizeWorkshopCode(req.query.workshop),start=W.week(req.query.week);
  if(!workshop)throw new ApiError(400,'请选择车间');await review(req.user,workshop);
  const [rows]=await pool.query(`SELECT m.user_id,m.floor,u.display_name AS name,r.status,r.result_json,
    (SELECT COUNT(*) FROM work_records d WHERE d.user_id=m.user_id AND d.week_start=? AND d.status='submitted') AS submitted_count
    FROM work_members m JOIN app_users u ON u.id=m.user_id
    LEFT JOIN work_reports r ON r.user_id=m.user_id AND r.week_start=?
    WHERE m.active=1 AND m.workshop_code=? ORDER BY m.floor,u.display_name`,[start,start,workshop]);
  ok(res,rows.map(row=>({...row,result_json:parseJson(row.result_json,null)})));
}));
router.get('/rules', asyncHandler(async (req, res) => {
  const workshop = normalizeWorkshopCode(req.query.workshop);
  if (!workshop) throw new ApiError(400, '请选择车间');
  if (!await canReview(req.user, workshop)) {
    const m = await member(pool, req.user.id); if (m.workshop_code !== workshop) throw new ApiError(403, '无权查看该车间标准');
  }
  const current = await rulesAt(pool, workshop, W.week(req.query.week));
  const [history] = await pool.query('SELECT id,effective_week,created_at FROM work_rules WHERE workshop_code=? ORDER BY effective_week DESC,id DESC LIMIT 30', [workshop]);
  ok(res, { current, history });
}));
router.post('/rules', asyncHandler(async (req, res) => {
  const workshop = normalizeWorkshopCode(req.body.workshop); if (!workshop) throw new ApiError(400, '请选择车间');
  manage(req.user, workshop);
  const start = W.week(req.body.effectiveWeek), rules = W.rules(req.body.rules);
  if (start < W.week(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))) throw new ApiError(400, '新标准不能追溯到过去的周次');
  const [result] = await pool.query('INSERT INTO work_rules(workshop_code,effective_week,rules_json,created_by) VALUES(?,?,?,?)', [workshop, start, JSON.stringify(rules), req.user.id]);
  ok(res, { id: result.insertId });
}));
router.get('/week', asyncHandler(async (req, res) => {
  const userId = id(req.query.userId || req.user.id), start = W.week(req.query.week);
  const m = await member(pool, userId); await allow(req.user, m);
  const [reports] = await pool.query('SELECT * FROM work_reports WHERE user_id=? AND week_start=?', [userId, start]);
  const [rows] = await pool.query('SELECT * FROM work_records WHERE user_id=? AND week_start=? ORDER BY record_date DESC,id DESC LIMIT 501', [userId, start]);
  if (rows.length > 500) throw new ApiError(400, '本周记录超过导出上限，请联系管理员');
  const [photos] = await pool.query('SELECT p.id,p.record_id,p.task_key FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE r.user_id=? AND r.week_start=?', [userId, start]);
  const report = decode(reports[0]);
  const config = report?.rules_json || (await rulesAt(pool, m.workshop_code, start))?.rules || [];
  const [events] = report ? await pool.query('SELECT a.action,a.detail,a.created_at,u.display_name AS actor FROM work_audit a JOIN app_users u ON u.id=a.actor_id WHERE a.report_id=? ORDER BY a.id DESC LIMIT 50', [report.id]) : [[]];
  ok(res, { member: m, report, records: rows.map(row => ({ ...decode(row), photos: photos.filter(p => String(p.record_id) === String(row.id)) })), config,
    coverage:W.submissionCoverage(rows.map(decode),photos),rulesKey: W.ruleKey(config), evaluation: report?.status === 'published' ? report.result_json : (config.length ? W.evaluate(config, rows.map(decode)) : null), events: events.map(e => ({ ...e, detail: parseJson(e.detail, {}) })) });
}));
router.post('/records', asyncHandler(async (req, res) => {
  const m = await member(pool, req.user.id), day = W.date(req.body.date), start = W.week(day);
  if (day > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)) throw new ApiError(400, '不能提前填报未来日期的工作');
  const submitted = req.body.status === 'submitted', payload = W.record(req.body, submitted);
  if (payload.floor !== m.floor) throw new ApiError(403, '只能填写本人配置的楼层');
  const result = await transaction(async db => {
    const report = await lockReport(db, req.user.id, start, m.workshop_code); W.mutable(report);
    if (req.body.kind === 'duties') {
      const [sameWeek] = await db.query("SELECT id,record_date,status,payload FROM work_records WHERE user_id=? AND week_start=? AND kind='duties' FOR UPDATE", [req.user.id, start]);
      const duplicates = sameWeek.filter(row => String(row.id) !== String(req.body.id || ''))
        .map(row => ({ ...row, payload: parseJson(row.payload, {}) }));
      const overlapsDuty = row => (row.payload.checks || []).some(oldCheck => payload.checks.some(check => check.dutyId === oldCheck.dutyId));
      if (duplicates.some(row => row.payload.mode === 'daily' && payload.mode === 'daily' && String(row.record_date).slice(0,10) === day && overlapsDuty(row))) throw new ApiError(409, '该工作内容当天已有填报，请从事项列表进入原记录修改');
      if (duplicates.some(row => row.payload.mode === 'weekly' && payload.mode === 'weekly' && overlapsDuty(row))) throw new ApiError(409, '该每周工作内容本周已有填报，请从事项列表进入原记录修改');
      if (duplicates.some(row => row.payload.mode === 'continuous' && payload.mode === 'continuous' && row.status === 'draft' && overlapsDuty(row))) throw new ApiError(409, '该持续工作内容已有草稿，请从事项列表继续填写');
    }
    if (req.body.id) {
      const [old] = await db.query('SELECT * FROM work_records WHERE id=? AND user_id=? AND week_start=? FOR UPDATE', [id(req.body.id), req.user.id, start]);
      if (!old[0]) throw new ApiError(404, '记录不存在，已保存记录不能更改周次');
      if (old[0].revision !== Number(req.body.revision)) throw new ApiError(409, '记录已更新，请刷新后再修改');
      if (old[0].kind !== req.body.kind) throw new ApiError(400, '已保存记录不能更换类型');
      if (req.body.kind === 'duties') {
        const previous = parseJson(old[0].payload, {});
        if (previous.mode !== payload.mode) throw new ApiError(400, '已保存记录不能更改填报频次');
        const oldDutyIds = (previous.checks || []).map(check => check.dutyId).sort();
        const newDutyIds = payload.checks.map(check => check.dutyId).sort();
        if (JSON.stringify(oldDutyIds) !== JSON.stringify(newDutyIds)) throw new ApiError(400, '已保存记录不能更换工作内容；请在对应事项另建记录');
      }
      if (submitted && req.body.kind === 'duties') await requireDutyPhotos(db, old[0].id, payload);
      await db.query('UPDATE work_records SET record_date=?,status=?,payload=?,revision=revision+1 WHERE id=?', [day, submitted ? 'submitted' : 'draft', JSON.stringify(payload), old[0].id]);
      await audit(db, report.id, req.user.id, 'record_updated', { recordId: old[0].id, previous: decode(old[0]), payload });
      return { id: old[0].id, revision: old[0].revision + 1 };
    }
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM work_records WHERE user_id=? AND week_start=?', [req.user.id, start]);
    if (count >= 200) throw new ApiError(400, '每人每周最多 200 条记录');
    const [r] = await db.query('INSERT INTO work_records(user_id,week_start,record_date,kind,status,payload) VALUES(?,?,?,?,?,?)', [req.user.id, start, day, req.body.kind, submitted ? 'submitted' : 'draft', JSON.stringify(payload)]);
    if (submitted && req.body.kind === 'duties') await requireDutyPhotos(db, r.insertId, payload);
    await audit(db, report.id, req.user.id, 'record_created', { recordId: r.insertId });
    return { id: r.insertId, revision: 0 };
  }); ok(res, result);
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1 } }).single('photo');
router.post('/records/:id/photos', (req, res, next) => upload(req, res, e => e ? next(new ApiError(400, '每次上传一张 JPG / PNG 图片，最大 5MB')) : next()), asyncHandler(async (req, res) => {
  const m = await member(pool, req.user.id), b = req.file?.buffer;
  const mime = b?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : b?.[0] === 255 && b?.[1] === 216 && b?.[2] === 255 ? 'image/jpeg' : '';
  if (!mime) throw new ApiError(400, '仅支持 JPG / PNG 照片');
  W.imageSize(b);
  await transaction(async db => {
    const [rows] = await db.query('SELECT * FROM work_records WHERE id=? AND user_id=?', [id(req.params.id), req.user.id]);
    if (!rows[0]) throw new ApiError(404, '记录不存在');
    const itemKey = W.text(req.body.itemKey, 80) || null;
    if (rows[0].kind === 'duties') {
      const payload = parseJson(rows[0].payload, {});
      if (!itemKey || !payload.checks?.some(check => check.dutyId === itemKey)) throw new ApiError(400, '请将照片关联到本次填报的工作事项');
    } else if (itemKey) throw new ApiError(400, '该记录不支持事项照片关联');
    const report = await lockReport(db, req.user.id, rows[0].week_start, m.workshop_code); W.mutable(report);
    const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM work_photos WHERE record_id=? AND (task_key <=> ?)', [rows[0].id, itemKey]);
    if (count >= 6) throw new ApiError(400, '每条记录最多 6 张照片');
    await db.query('INSERT INTO work_photos(record_id,mime,task_key,image) VALUES(?,?,?,?)', [rows[0].id, mime, itemKey, b]);
    await audit(db, report.id, req.user.id, 'photo_added', { recordId: rows[0].id, taskKey: itemKey });
  }); ok(res, true);
}));
router.get('/photos/:id', asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT p.id,p.mime,r.user_id FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE p.id=?', [id(req.params.id)]);
  if (!rows[0]) throw new ApiError(404, '照片不存在');
  await allow(req.user, await member(pool, rows[0].user_id));
  const [[photo]] = await pool.query('SELECT image FROM work_photos WHERE id=?', [rows[0].id]);
  if (!photo) throw new ApiError(404, '照片已移除');
  res.set('Content-Type', rows[0].mime).set('Cache-Control', 'no-store').send(photo.image);
}));
router.delete('/photos/:id', asyncHandler(async (req, res) => {
  const m = await member(pool, req.user.id);
  await transaction(async db => {
    const [rows] = await db.query('SELECT p.id,p.task_key,r.id AS record_id,r.week_start,r.status,r.payload FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE p.id=? AND r.user_id=?', [id(req.params.id), req.user.id]);
    if (!rows[0]) throw new ApiError(404, '照片不存在');
    const report = await lockReport(db, req.user.id, rows[0].week_start, m.workshop_code); W.mutable(report);
    const photo=rows[0],duty=W.duties.get(photo.task_key),payload=parseJson(photo.payload,{});
    if(photo.status==='submitted'&&duty?.photoRequired&&payload.checks?.some(check=>check.dutyId===photo.task_key)){
      const [[{count}]]=await db.query('SELECT COUNT(*) AS count FROM work_photos WHERE record_id=? AND task_key=?',[photo.record_id,photo.task_key]);
      if(Number(count)<=1)throw new ApiError(400,`“${duty.title}”已提交且必须有照片，请先补传新照片再移除最后一张`);
    }
    await db.query('DELETE FROM work_photos WHERE id=?', [rows[0].id]);
    await audit(db, report.id, req.user.id, 'photo_removed', { photoId: rows[0].id, recordId: rows[0].record_id });
  }); ok(res, true);
}));
router.post('/submit', (_req, res) => res.status(410).json({success:false,msg:'每天提交工作记录即可，周考评由负责人直接汇总评定，无需组长再次提交'}));
router.post('/suggest', asyncHandler(async (req, res) => {
  const userId=id(req.body.userId),start=W.week(req.body.week),m=await member(pool,userId);
  await review(req.user,m.workshop_code);
  if(String(userId)===String(req.user.id))throw new ApiError(403,'不能复核自己的考评，请其他负责人复核');
  if(start>W.week(new Date(Date.now()+8*3600000).toISOString().slice(0,10)))throw new ApiError(400,'不能评定未来周次');
  if(!businessAiAllowed(config.openclaw))return ok(res,{available:false,reason:'服务器尚未启用本地 OpenClaw 评分；可先由负责人手动评分。'});
  if(!config.openclaw.token)return ok(res,{available:false,reason:'服务器未配置 OpenClaw 凭据；可先由负责人手动评分。'});
  const [reports]=await pool.query('SELECT * FROM work_reports WHERE user_id=? AND week_start=?',[userId,start]);
  const stored=decode(reports[0]),currentConfig=stored?.rules_json||(await rulesAt(pool,m.workshop_code,start))?.rules||[];
  if(!currentConfig.length)throw new ApiError(400,'请先配置本周评分标准');
  const scoreRules=currentConfig;
  const [rawRecords]=await pool.query("SELECT * FROM work_records WHERE user_id=? AND week_start=? AND status='submitted' ORDER BY record_date,id LIMIT 200",[userId,start]);
  const records=rawRecords.map(decode),photoMap=new Map();
  const [photos]=await pool.query("SELECT p.record_id,p.task_key,COUNT(*) AS count FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE r.user_id=? AND r.week_start=? AND r.status='submitted' GROUP BY p.record_id,p.task_key",[userId,start]);
  for(const photo of photos)photoMap.set(`${photo.record_id}:${photo.task_key||''}`,Number(photo.count));
  const evidence=records.map(record=>({recordId:record.id,date:String(record.record_date).slice(0,10),type:W.kinds[record.kind]||record.kind,
    ...(record.kind==='duties'?{items:(record.payload.checks||[]).map(check=>{const duty=W.duties.get(check.dutyId);return duty?{category:duty.category,content:duty.title,frequency:duty.frequency,outputBasis:duty.evidence,result:check.status,verification:check.note,closure:check.action,photoCount:photoMap.get(`${record.id}:${duty.id}`)||0,...(check.productionReport?{productionAbnormal:check.productionReport}:{})}:null}).filter(Boolean)}:{details:{theme:record.payload.theme,location:record.payload.location,note:record.payload.note,action:record.payload.action,noIssue:record.payload.noIssue,photoCount:photoMap.get(`${record.id}:`)||0}})}));
  const baseline=W.evaluate(scoreRules,records),payload={week:start,criteria:scoreRules.map(({id,title,max,standard,kind,target,deduction})=>({id,title,max,standard,kind,target,deduction,automaticBaseline:baseline.items.find(item=>item.id===id)?.score??null})),evidence};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.openclaw.timeoutMs);
  let response,data;
  try{
    response=await fetch(config.openclaw.apiUrl,{redirect:'error',method:'POST',headers:{Authorization:`Bearer ${config.openclaw.token}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.openclaw.model,stream:false,tool_choice:'none',temperature:0.1,messages:[
      {role:'system',content:'你是制曲车间组长履职考评的辅助评分员。只依据管理员设置的评分标准和下方已提交记录提出建议，不得补造事实、不得推断未提供的现场情况，也不得把照片数量当成照片内容。每项给出0至该项满分的建议分、简短可核对的理由和引用的记录编号；证据不足时明确写明缺少什么并保守评分。你只提供建议，最终由获授权的班长或车间管理员复核。严格只返回 JSON：{"items":[{"ruleId":"规则ID","score":0,"reason":"理由","evidenceRecordIds":[1]}]}。'},
      {role:'user',content:JSON.stringify(payload).slice(0,26000)}
    ]})});
    if(!response.ok)throw new Error(`OpenClaw HTTP ${response.status}`);
    data=await response.json();
  }catch(error){return ok(res,{available:false,reason:error.name==='AbortError'?'OpenClaw 评分超时，请稍后重试或手动评分。':'OpenClaw 暂不可用，请检查服务器配置后重试或手动评分。'});}finally{clearTimeout(timer);}
  const content=data?.choices?.[0]?.message?.content;
  let parsed;
  try{const text=Array.isArray(content)?content.map(part=>part.text||'').join('\n'):String(content||'');parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{return ok(res,{available:false,reason:'OpenClaw 返回格式无法核对，请重试或手动评分。'});}
  const allowed=new Map(scoreRules.map(rule=>[String(rule.id),rule])),seen=new Set(),validIds=new Set(records.map(record=>String(record.id)));
  if(!Array.isArray(parsed.items)||parsed.items.length!==scoreRules.length)return ok(res,{available:false,reason:'OpenClaw 未返回完整的评分建议，请重试或手动评分。'});
  const suggestions=[];
  for(const item of parsed.items){const rule=allowed.get(String(item.ruleId)),score=Number(item.score),reason=W.text(item.reason,2000),evidenceRecordIds=Array.isArray(item.evidenceRecordIds)?item.evidenceRecordIds.map(String):[];
    if(!rule||seen.has(String(rule.id))||!Number.isFinite(score)||score<0||score>rule.max||!reason||evidenceRecordIds.some(recordId=>!validIds.has(recordId)))return ok(res,{available:false,reason:'OpenClaw 建议未通过格式或范围校验，请重试或手动评分。'});
    seen.add(String(rule.id));suggestions.push({ruleId:String(rule.id),title:rule.title,score,reason,evidenceRecordIds});}
  const suggestionDetail={revision:stored?.revision||0,rulesKey:W.ruleKey(currentConfig),suggestions};
  let suggestionId;
  await transaction(async db=>{const report=await lockReport(db,userId,start,m.workshop_code);if(report.revision!==(stored?.revision||0)||W.ruleKey(report.rules_json||currentConfig)!==W.ruleKey(currentConfig))throw new ApiError(409,'上报内容或评分标准已变化，请刷新后重新生成建议');const [saved]=await db.query('INSERT INTO work_audit(report_id,actor_id,action,detail) VALUES(?,?,?,?)',[report.id,req.user.id,'ai_suggested',JSON.stringify(suggestionDetail)]);suggestionId=saved.insertId;});
  ok(res,{available:true,suggestionId,suggestions});
}));
router.post('/review', asyncHandler(async (req, res) => {
  const userId = id(req.body.userId), start = W.week(req.body.week), m = await member(pool, userId);
  await review(req.user, m.workshop_code);
  if (String(userId) === String(req.user.id)) throw new ApiError(403, '不能复核自己的考评，请其他负责人复核');
  if(start>W.week(new Date(Date.now()+8*3600000).toISOString().slice(0,10)))throw new ApiError(400,'不能评定未来周次');
  await transaction(async db => {
    const report = await lockReport(db, userId, start, m.workshop_code);
    if (report.revision !== Number(req.body.revision)) throw new ApiError(409, '本周记录或考评已变化，请刷新后重新核对');
    const feedback = W.text(req.body.feedback, 5000);
    if (!feedback) throw new ApiError(400, '请填写复核意见或退回原因');
    if (req.body.action === 'return') {
      await db.query("UPDATE work_reports SET status='returned',feedback=?,result_json=NULL,published_at=NULL,revision=revision+1 WHERE id=?", [feedback, report.id]);
      await audit(db, report.id, req.user.id, 'returned', { feedback, previous: report.result_json });
    } else {
      if (report.status === 'published' || req.body.action !== 'publish') throw new ApiError(409, '本周已评定，修正前请先退回');
      const config=report.rules_json || (await rulesAt(db,m.workshop_code,start))?.rules;
      if(!config?.length)throw new ApiError(400,'请先配置本周评分标准');
      if(req.body.rulesKey!==W.ruleKey(config))throw new ApiError(409,'评分标准已更新，请刷新后按新标准核对');
      let suggestionAudit=null;
      if(req.body.suggestionId){const [suggestions]=await db.query("SELECT id,actor_id,detail FROM work_audit WHERE id=? AND report_id=? AND action='ai_suggested'",[id(req.body.suggestionId),report.id]);suggestionAudit=suggestions[0]&&{...suggestions[0],detail:parseJson(suggestions[0].detail,{})};if(!suggestionAudit||String(suggestionAudit.actor_id)!==String(req.user.id)||suggestionAudit.detail.revision!==report.revision||suggestionAudit.detail.rulesKey!==W.ruleKey(config))throw new ApiError(409,'AI 建议已过期，请刷新并重新生成');}
      const [records] = await db.query('SELECT * FROM work_records WHERE user_id=? AND week_start=?', [userId, start]);
      await requireWeekDutyPhotos(db,userId,start);
      const result = W.evaluate(config, records.map(decode), req.body.manual || {});
      if (result.total === null) throw new ApiError(400, '请完成所有人工评分项目');
      await db.query("UPDATE work_reports SET status='published',result_json=?,feedback=?,reviewer_id=?,rules_json=?,published_at=NOW(),revision=revision+1 WHERE id=?", [JSON.stringify(result), feedback, req.user.id, JSON.stringify(config), report.id]);
      const suggestions=new Map((suggestionAudit?.detail.suggestions||[]).map(item=>[String(item.ruleId),item]));
      const adjustments=result.items.filter(item=>suggestions.has(String(item.id))).map(item=>({ruleId:item.id,suggestedScore:suggestions.get(String(item.id)).score,finalScore:item.score,changed:Number(item.score)!==Number(suggestions.get(String(item.id)).score)}));
      await audit(db, report.id, req.user.id, 'published', { result, feedback, suggestionId:suggestionAudit?.id||null, adjustments });
    }
  }); ok(res, true);
}));
router.get('/export', asyncHandler(async (req, res) => {
  const userId = id(req.query.userId), start = W.week(req.query.week), m = await member(pool, userId); await review(req.user, m.workshop_code);
  const [records] = await pool.query("SELECT * FROM work_records WHERE user_id=? AND week_start=? AND status='submitted' ORDER BY record_date,id", [userId, start]);
  const [[{ bytes }]] = await pool.query("SELECT COALESCE(SUM(OCTET_LENGTH(p.image)),0) AS bytes FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE r.user_id=? AND r.week_start=? AND r.status='submitted'", [userId, start]);
  if (Number(bytes) > 60 * 1024 * 1024) throw new ApiError(400, '本周照片过多，请减少图片大小后导出');
  const [photos] = await pool.query('SELECT p.* FROM work_photos p JOIN work_records r ON r.id=p.record_id WHERE r.user_id=? AND r.week_start=? AND r.status=\'submitted\'', [userId, start]);
  const [reports] = await pool.query('SELECT * FROM work_reports WHERE user_id=? AND week_start=?', [userId, start]);
  const [[user]] = await pool.query('SELECT display_name FROM app_users WHERE id=?', [userId]);
  const workbook = require('../work-export').createWorkbook(records.map(decode), photos, decode(reports[0]), user.display_name);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="work-week-${start}.xlsx"`);
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
}));
router.get('/records/:id/production-report', asyncHandler(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM work_records WHERE id=? AND kind='duties' AND status='submitted'", [id(req.params.id)]);
  const record = rows[0] && decode(rows[0]);
  if (!record) throw new ApiError(404, '已提交的生产异常记录不存在');
  const m = await member(pool, record.user_id);
  await review(req.user, m.workshop_code);
  const check = record.payload.checks?.find(item => item.dutyId === 'production_progress' && item.status === '异常');
  if (!check?.productionReport) throw new ApiError(400, '该记录尚未填写生产异常跟踪信息');
  const [[user]] = await pool.query('SELECT display_name FROM app_users WHERE id=?', [record.user_id]);
  const workshop = { raw_grain: '原粮车间', qu_making: '制曲车间', brewing: '酿酒车间' }[m.workshop_code] || m.workshop_code;
  const file = await require('../production-report-export').createProductionReport({ record, leader: user?.display_name || '', workshop, floor: m.floor, check });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.set('Content-Disposition', `attachment; filename="production-abnormal-${String(record.record_date).slice(0, 10)}-${record.id}.docx"`);
  res.send(Buffer.from(file));
}));
module.exports = router;

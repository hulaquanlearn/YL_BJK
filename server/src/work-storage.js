const {ApiError}=require('./utils');
const {dayNumber}=require('./attendance-analysis');
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const TYPES=['inspection','attendance','work_photo','task_file'];
const FUNCTIONS=Object.freeze({inspection:Object.freeze(['inspection']),attendance:Object.freeze(['attendance']),qu_making:Object.freeze(['work_photo','task_file'])});
function cutoffDate(value){const date=String(value||'');if(!Number.isFinite(dayNumber(date))||date>=today())throw new ApiError(400,'清理截止日期必须是今天之前的有效日期');return date;}
function storageId(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new ApiError(400,'资料编号无效');return n;}
function requireStorageAdmin(req,_res,next){if(req.user?.role!=='admin')return next(new ApiError(403,'工作资料管理仅供系统管理员使用'));next();}
// Logical byte counts reflect retained content, not immediate shrinking of MySQL data files.
const STORAGE_UNION=`
 SELECT 'inspection' AS kind,n.id,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.header_json,'$.title')),'原粮检查通报') AS title,'raw_grain' AS workshopCode,n.updated_at AS updatedAt,n.retention_until AS retentionUntil,
 COALESCE((SELECT SUM(byte_size) FROM inspection_sources WHERE notice_id=n.id),0)+OCTET_LENGTH(n.header_json)+OCTET_LENGTH(n.issues_json)+COALESCE((SELECT SUM(OCTET_LENGTH(detail_json)+COALESCE(OCTET_LENGTH(before_json),0)) FROM inspection_events WHERE notice_id=n.id),0) AS bytes,
 (SELECT COUNT(*) FROM inspection_sources WHERE notice_id=n.id) AS fileCount,0 AS referenceCount,n.revision AS revision,
 (SELECT COUNT(*) FROM inspection_sources WHERE notice_id=n.id AND status='processing') AS processingCount
 FROM inspection_notices n WHERE n.workshop_code='raw_grain'
 UNION ALL
 SELECT 'attendance',r.id,r.title,r.workshop_code,r.updated_at,r.retention_until,OCTET_LENGTH(r.analysis_json)+COALESCE((SELECT SUM(byte_size) FROM attendance_sources WHERE report_id=r.id),0)+COALESCE((SELECT SUM(OCTET_LENGTH(note)) FROM attendance_notes WHERE report_id=r.id),0),
 (SELECT COUNT(*) FROM attendance_sources WHERE report_id=r.id),0,r.revision,0 FROM attendance_reports r WHERE r.workshop_code='raw_grain'
 UNION ALL
 SELECT 'work_photo',p.id,CONCAT('制曲工作截图 · ',r.record_date,' · ',COALESCE(u.display_name,'人员')),'qu_making',GREATEST(r.updated_at,p.created_at),NULL,OCTET_LENGTH(p.image),1,0,r.revision,0
 FROM work_photos p JOIN work_records r ON r.id=p.record_id JOIN work_members m ON m.user_id=r.user_id LEFT JOIN app_users u ON u.id=r.user_id WHERE m.workshop_code='qu_making'
 UNION ALL
 SELECT 'task_file',f.id,CONCAT('制曲任务附件 · ',t.title),'qu_making',GREATEST(f.created_at,t.created_at,COALESCE(a.accepted_at,a.submitted_at,t.created_at),COALESCE((SELECT MAX(e.created_at) FROM work_task_events e WHERE e.assignment_id=a.id),t.created_at)),NULL,OCTET_LENGTH(f.image),1,
 (SELECT COUNT(*) FROM work_task_file_references WHERE file_id=f.id),a.revision,0 FROM work_task_files f JOIN work_task_assignments a ON a.id=f.assignment_id JOIN work_tasks t ON t.id=a.task_id
 JOIN work_members m ON m.user_id=a.user_id WHERE m.workshop_code='qu_making'`;
function decorate(row,cutoff){return {...row,bytes:Number(row.bytes),fileCount:Number(row.fileCount),referenceCount:Number(row.referenceCount),processingCount:Number(row.processingCount||0),eligible:!Number(row.referenceCount)&&!Number(row.processingCount)&&String(row.updatedAt).slice(0,10)<cutoff&&(!row.retentionUntil||String(row.retentionUntil).slice(0,10)<today())};}
async function lockStorageSource(db,kind,id) {
  let parent;
  if(kind==='inspection'){
    const [r]=await db.query("SELECT id,revision,updated_at AS updatedAt,retention_until AS retentionUntil FROM inspection_notices WHERE id=? AND workshop_code='raw_grain' FOR UPDATE",[id]);parent=r[0];
  }else if(kind==='attendance'){
    const [r]=await db.query("SELECT id,revision,updated_at AS updatedAt,retention_until AS retentionUntil FROM attendance_reports WHERE id=? AND workshop_code='raw_grain' FOR UPDATE",[id]);parent=r[0];
  }else if(kind==='work_photo'){
    const [r]=await db.query("SELECT r.id,r.revision,GREATEST(r.updated_at,p.created_at) AS updatedAt FROM work_records r JOIN work_photos p ON p.record_id=r.id JOIN work_members m ON m.user_id=r.user_id WHERE p.id=? AND m.workshop_code='qu_making' FOR UPDATE",[id]);parent=r[0];
  }else{
    const [r]=await db.query("SELECT a.id,a.revision,GREATEST(f.created_at,t.created_at,COALESCE(a.accepted_at,a.submitted_at,t.created_at),COALESCE((SELECT MAX(e.created_at) FROM work_task_events e WHERE e.assignment_id=a.id),t.created_at)) AS updatedAt FROM work_task_assignments a JOIN work_task_files f ON f.assignment_id=a.id JOIN work_tasks t ON t.id=a.task_id JOIN work_members m ON m.user_id=a.user_id WHERE f.id=? AND m.workshop_code='qu_making' FOR UPDATE",[id]);parent=r[0];
  }
  return parent;
}
async function deleteStorageItem(db,actor,{kind,id,cutoff,revision}) {
  if(actor?.role!=='admin')throw new ApiError(403,'工作资料管理仅供系统管理员使用');
  if(!TYPES.includes(kind))throw new ApiError(400,'资料类型无效');id=storageId(id);cutoff=cutoffDate(cutoff);
  const parent=await lockStorageSource(db,kind,id);
  if(!parent)throw new ApiError(404,'资料已被删除或不存在');
  if(parent.revision!==Number(revision))throw new ApiError(409,'资料已更新，请刷新列表后重新核对');
  if(String(parent.updatedAt).slice(0,10)>=cutoff)throw new ApiError(409,'资料更新时间不在所选清理范围内');
  if(parent.retentionUntil&&String(parent.retentionUntil).slice(0,10)>=today())throw new ApiError(409,'资料尚未到保留截止日期，请先调整保留日期');
  const [items]=await db.query(`SELECT * FROM (${STORAGE_UNION}) storage WHERE kind=? AND id=?`,[kind,id]);const item=items[0];
  if(!item)throw new ApiError(404,'资料已被删除或不存在');
  if(Number(item.referenceCount))throw new ApiError(409,'任务附件仍被工作记录引用，不能清理');
  if(kind==='inspection'){
    const [pending]=await db.query("SELECT id FROM inspection_sources WHERE notice_id=? AND status='processing' FOR UPDATE",[id]);if(pending.length)throw new ApiError(409,'通报正在识别，请待任务完成后清理');
    await db.query('DELETE FROM inspection_sources WHERE notice_id=?',[id]);await db.query('DELETE FROM inspection_events WHERE notice_id=?',[id]);await db.query('DELETE FROM inspection_notices WHERE id=?',[id]);
  }else if(kind==='attendance'){
    await db.query('DELETE FROM attendance_notes WHERE report_id=?',[id]);await db.query('DELETE FROM attendance_sources WHERE report_id=?',[id]);await db.query('DELETE FROM attendance_reports WHERE id=?',[id]);
  }else if(kind==='work_photo'){
    await db.query('DELETE FROM work_photos WHERE id=?',[id]);await db.query('UPDATE work_records SET revision=revision+1,updated_at=updated_at WHERE id=?',[parent.id]);
  }else{
    // A current locking read must not reuse the UNION's repeatable-read snapshot.
    const [references]=await db.query('SELECT file_id FROM work_task_file_references WHERE file_id=? FOR UPDATE',[id]);
    if(references.length)throw new ApiError(409,'任务附件仍被工作记录引用，不能清理');
    await db.query('DELETE FROM work_task_files WHERE id=?',[id]);await db.query('UPDATE work_task_assignments SET revision=revision+1 WHERE id=?',[parent.id]);
  }
  await db.query('INSERT INTO work_storage_audit(actor_id,source_kind,source_id,title,released_bytes,detail_json) VALUES(?,?,?,?,?,?)',[actor.id,kind,id,String(item.title).slice(0,180),Number(item.bytes),JSON.stringify({fileCount:Number(item.fileCount),cutoff,preservedWorkText:['work_photo','task_file'].includes(kind)})]);
  return {releasedBytes:Number(item.bytes),kind,id};
}
module.exports={STORAGE_UNION,requireStorageAdmin,cutoffDate,storageId,deleteStorageItem,lockStorageSource,decorate,today,TYPES,FUNCTIONS};

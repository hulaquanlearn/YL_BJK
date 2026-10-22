const {ApiError}=require('./utils');
const {dayNumber}=require('./attendance-analysis');
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const TYPES=['attendance','raw_duty_photo'];
const FUNCTIONS=Object.freeze({all:Object.freeze([...TYPES]),attendance:Object.freeze(['attendance']),raw_duties:Object.freeze(['raw_duty_photo'])});
function cutoffDate(value){const date=String(value||'');if(!Number.isFinite(dayNumber(date))||date>=today())throw new ApiError(400,'清理截止日期必须是今天之前的有效日期');return date;}
function storageId(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new ApiError(400,'资料编号无效');return n;}
function requireStorageAdmin(req,_res,next){if(req.user?.role!=='admin')return next(new ApiError(403,'工作资料管理仅供系统管理员使用'));next();}
// Logical byte counts reflect retained content, not immediate shrinking of MySQL data files.
// Normalize storage text independently of the original table collation.
const storageText=expression=>`CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_0900_ai_ci`;
const STORAGE_SELECT=`
 SELECT ${storageText("'attendance'")} AS kind,r.id AS id,${storageText('r.title')} AS title,${storageText('r.workshop_code')} AS workshopCode,r.updated_at AS updatedAt,r.retention_until AS retentionUntil,
 OCTET_LENGTH(r.analysis_json)+COALESCE((SELECT SUM(byte_size) FROM attendance_sources WHERE report_id=r.id),0)+COALESCE((SELECT SUM(OCTET_LENGTH(note)) FROM attendance_notes WHERE report_id=r.id),0) AS bytes,
 (SELECT COUNT(*) FROM attendance_sources WHERE report_id=r.id) AS fileCount,0 AS referenceCount,r.revision AS revision,0 AS processingCount,0 AS historyCount FROM attendance_reports r WHERE r.workshop_code='raw_grain'
 UNION ALL
 SELECT ${storageText("'raw_duty_photo'")} AS kind,p.id AS id,${storageText("CONCAT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.identity_json,'$.name')),'履职人员'),' · ',r.week_start,' · ',p.filename)")} AS title,${storageText("'raw_grain'")} AS workshopCode,r.updated_at AS updatedAt,NULL AS retentionUntil,
 p.byte_size AS bytes,1 AS fileCount,
 (EXISTS(SELECT 1 FROM JSON_TABLE(r.checks_json,'$**.photoIds[*]' COLUMNS(photo_id BIGINT PATH '$')) refs WHERE refs.photo_id=p.id)
 OR EXISTS(SELECT 1 FROM JSON_TABLE(COALESCE(r.cadence_json,JSON_OBJECT()),'$**.photoIds[*]' COLUMNS(photo_id BIGINT PATH '$')) legacy_refs WHERE legacy_refs.photo_id=p.id)) AS referenceCount,
 r.revision AS revision,0 AS processingCount,(r.submitted_at IS NOT NULL OR r.status IN ('submitted','confirmed')) AS historyCount
 FROM raw_duty_photos p INNER JOIN raw_duty_reports r ON r.id=p.report_id
`;
function decorate(row,cutoff){const canDelete=!Number(row.processingCount)&&(row.kind==='raw_duty_photo'||!Number(row.referenceCount)&&!Number(row.historyCount));return {...row,bytes:Number(row.bytes),fileCount:Number(row.fileCount),referenceCount:Number(row.referenceCount),processingCount:Number(row.processingCount||0),historyCount:Number(row.historyCount||0),canDelete,eligible:canDelete&&String(row.updatedAt).slice(0,10)<cutoff&&(!row.retentionUntil||String(row.retentionUntil).slice(0,10)<today())};}
function parseMaterial(input){if(typeof input!=='string')return input;try{return JSON.parse(input)}catch{throw new ApiError(409,'履职材料格式异常，暂不能清理')}}
function referencesPhoto(input,id){
 input=parseMaterial(input);
 if(!input||typeof input!=='object')return false;
 if(Array.isArray(input.photoIds)&&input.photoIds.some(value=>Number(value)===id))return true;
 return Object.values(input).some(value=>value&&typeof value==='object'&&referencesPhoto(value,id));
}
function unlinkPhotos(input,ids){
 const value=structuredClone(parseMaterial(input));
 function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node.photoIds))node.photoIds=node.photoIds.filter(id=>!ids.has(Number(id)));for(const child of Object.values(node))if(child&&typeof child==='object')visit(child)}
 visit(value);return value;
}
async function lockStorageSource(db,kind,id) {
  if(!TYPES.includes(kind))throw new ApiError(400,'资料类型无效');
  if(kind==='raw_duty_photo'){
    const [photos]=await db.query('SELECT report_id FROM raw_duty_photos WHERE id=?',[id]);if(!photos.length)return;
    // Use the same parent lock as saving, submitting, uploading and removing photos.
    const [rows]=await db.query('SELECT id,revision,updated_at AS updatedAt,submitted_at,status,checks_json,cadence_json,identity_json,week_start FROM raw_duty_reports WHERE id=? FOR UPDATE',[photos[0].report_id]);return rows[0];
  }
  const [rows]=await db.query("SELECT id,revision,updated_at AS updatedAt,retention_until AS retentionUntil FROM attendance_reports WHERE id=? AND workshop_code='raw_grain' FOR UPDATE",[id]);
  return rows[0];
}

async function prepareStorageItem(db,actor,{kind,id,cutoff,revision,manual=false}) {
  if(actor?.role!=='admin')throw new ApiError(403,'工作资料管理仅供系统管理员使用');
  if(!TYPES.includes(kind))throw new ApiError(400,'资料类型无效');
  if(typeof manual!=='boolean')throw new ApiError(400,'手动删除参数无效');
  id=storageId(id);cutoff=manual?null:cutoffDate(cutoff);
  const parent=await lockStorageSource(db,kind,id);
  if(!parent)throw new ApiError(404,'资料已被删除或不存在');
  if(!Number.isSafeInteger(Number(revision))||Number(parent.revision)!==Number(revision))throw new ApiError(409,'资料已更新，请刷新列表后重新核对');
  if(!manual&&String(parent.updatedAt).slice(0,10)>=cutoff)throw new ApiError(409,'资料更新时间不在所选清理范围内');
  if(!manual&&parent.retentionUntil&&String(parent.retentionUntil).slice(0,10)>=today())throw new ApiError(409,'资料尚未到保留截止日期，请先调整保留日期');
  let item;
  if(kind==='raw_duty_photo'){
    const [photos]=await db.query('SELECT id,report_id,filename,byte_size FROM raw_duty_photos WHERE id=? FOR UPDATE',[id]);const photo=photos[0];
    if(photo&&Number(photo.report_id)===Number(parent.id))item={title:[parseMaterial(parent.identity_json)?.name,parent.week_start,photo.filename].filter(Boolean).join(' · '),bytes:photo.byte_size,fileCount:1,referenceCount:referencesPhoto(parent.checks_json,id)||referencesPhoto(parent.cadence_json,id),historyCount:!!parent.submitted_at||['submitted','confirmed'].includes(parent.status)};
  }else{const [items]=await db.query(`SELECT * FROM (${STORAGE_SELECT}) storage WHERE kind=? AND id=?`,[kind,id]);item=items[0];}
  if(!item)throw new ApiError(404,'资料已被删除或不存在');
  if(Number(item.processingCount))throw new ApiError(409,'资料正在处理，暂不能清理');
  if(kind!=='raw_duty_photo'&&Number(item.referenceCount))throw new ApiError(409,'任务附件仍被工作记录引用，不能清理');
  return {kind,id,cutoff,manual,parent,item};
}
// The caller owns one transaction. Validate the entire reviewed manifest before
// writing; multiple photos from one report share one revision increment.
async function deleteStorageItems(db,actor,items){
 const prepared=[];for(const item of items)prepared.push(await prepareStorageItem(db,actor,item));
 const reports=new Map(),results=[];
 for(const {kind,id,cutoff,manual,parent,item} of prepared){
  if(kind==='raw_duty_photo'){
   await db.query('DELETE FROM raw_duty_photos WHERE id=? AND report_id=?',[id,parent.id]);
   const entry=reports.get(parent.id)||{parent,revision:parent.revision,photoIds:[]};entry.photoIds.push(id);reports.set(parent.id,entry);
  }else{
   await db.query('DELETE FROM attendance_notes WHERE report_id=?',[id]);await db.query('DELETE FROM attendance_sources WHERE report_id=?',[id]);await db.query('DELETE FROM attendance_reports WHERE id=?',[id]);
  }
  await db.query('INSERT INTO work_storage_audit(actor_id,source_kind,source_id,title,released_bytes,detail_json) VALUES(?,?,?,?,?,?)',[actor.id,kind,id,String(item.title).slice(0,180),Number(item.bytes),JSON.stringify({fileCount:Number(item.fileCount),cutoff,manual,retentionUntil:parent.retentionUntil||null,...(kind==='raw_duty_photo'?{reportId:parent.id,wasReferenced:!!item.referenceCount,wasHistorical:!!item.historyCount}:{})})]);
  results.push({releasedBytes:Number(item.bytes),kind,id});
 }
 for(const [id,entry]of reports){
  const ids=new Set(entry.photoIds),checks=unlinkPhotos(entry.parent.checks_json,ids),cadence=unlinkPhotos(entry.parent.cadence_json,ids);
  const [result]=await db.query('UPDATE raw_duty_reports SET checks_json=?,cadence_json=?,revision=revision+1,updated_at=updated_at WHERE id=? AND revision=?',[JSON.stringify(checks),cadence==null?null:JSON.stringify(cadence),id,entry.revision]);if(result.affectedRows!==1)throw new ApiError(409,'履职材料已变化，请刷新后重试');
  await db.query("INSERT INTO raw_duty_events(report_id,actor_id,action,detail) VALUES(?,?,'photo_removed_admin',?)",[id,actor.id,JSON.stringify({photoIds:entry.photoIds,revision:Number(entry.revision)+1})]);
 }
 return results;
}
async function deleteStorageItem(db,actor,item){return (await deleteStorageItems(db,actor,[item]))[0]}
module.exports={STORAGE_SELECT,requireStorageAdmin,cutoffDate,storageId,deleteStorageItem,deleteStorageItems,lockStorageSource,decorate,today,TYPES,FUNCTIONS,referencesPhoto,unlinkPhotos};

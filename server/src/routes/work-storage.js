const express=require('express');
const {pool}=require('../db');
const {ApiError,asyncHandler}=require('../utils');
const S=require('../work-storage');
const router=express.Router();router.use(S.requireStorageAdmin);router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const ok=(res,data)=>res.json({success:true,data});
async function tx(fn){const db=await pool.getConnection();try{await db.beginTransaction();const result=await fn(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
const MAX_CLEANUP_ITEMS=1000;
function scope(input,required=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ApiError(400,'请选择有效的功能和资料类型');
  const feature=input.function??'',kind=input.kind??'';
  if(typeof feature!=='string'||typeof kind!=='string'||feature&&!Object.hasOwn(S.FUNCTIONS,feature)||kind&&!S.TYPES.includes(kind)||required&&!feature)throw new ApiError(400,'请选择有效的功能和资料类型');
  if(feature&&kind&&!S.FUNCTIONS[feature].includes(kind))throw new ApiError(400,'资料类型不属于所选功能');
  const kinds=kind?[kind]:feature?S.FUNCTIONS[feature]:[];
  return {feature,kind,kinds,where:kinds.length?` WHERE kind${kinds.length===1?'=?':' IN ('+kinds.map(()=>'?').join(',')+')'}`:'',args:[...kinds]};
}
router.get('/',asyncHandler(async(req,res)=>{
  const cutoff=S.cutoffDate(req.query.cutoff),page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new ApiError(400,'筛选参数无效');
  const {where,args}=scope(req.query);
  const [items]=await pool.query(`SELECT * FROM (${S.STORAGE_SELECT}) storage${where} ORDER BY updatedAt ASC,kind,id LIMIT 30 OFFSET ?`,[...args,(page-1)*30]);
  const [summary]=await pool.query(`SELECT kind,COUNT(*) AS itemCount,SUM(bytes) AS bytes,SUM(fileCount) AS fileCount FROM (${S.STORAGE_SELECT}) storage GROUP BY kind`);
  const [[count]]=await pool.query(`SELECT COUNT(*) AS total FROM (${S.STORAGE_SELECT}) storage${where}`,args);
  ok(res,{items:items.map(r=>S.decorate(r,cutoff)),summary:summary.map(r=>({...r,bytes:Number(r.bytes),itemCount:Number(r.itemCount),fileCount:Number(r.fileCount)})),total:Number(count.total),page,cutoff});
}));
router.get('/cleanup-preview',asyncHandler(async(req,res)=>{
  const {where,args}=scope(req.query,true),cutoff=S.cutoffDate(req.query.cutoff);
  const [rows]=await pool.query(`SELECT * FROM (${S.STORAGE_SELECT}) storage${where} AND (referenceCount=0 OR kind='raw_duty_photo') AND processingCount=0 AND DATE(updatedAt)<? AND (retentionUntil IS NULL OR DATE(retentionUntil)<?) ORDER BY updatedAt ASC,kind,id LIMIT 1001`,[...args,cutoff,S.today()]);
  if(rows.length>MAX_CLEANUP_ITEMS)throw new ApiError(400,'待清理资料超过1000项，请按资料类型或截止日期缩小范围');
  const items=rows.map(r=>({kind:r.kind,id:Number(r.id),revision:Number(r.revision),title:r.title,bytes:Number(r.bytes),fileCount:Number(r.fileCount),historyCount:Number(r.historyCount||0),referenceCount:Number(r.referenceCount||0)}));
  ok(res,{items,itemCount:items.length,totalBytes:items.reduce((sum,r)=>sum+r.bytes,0)});
}));
router.post('/cleanup',asyncHandler(async(req,res)=>{
  const {kinds}=scope(req.body,true),cutoff=S.cutoffDate(req.body.cutoff),submitted=req.body.items;
  if(!Array.isArray(submitted)||!submitted.length||submitted.length>MAX_CLEANUP_ITEMS)throw new ApiError(400,'请先核对1至1000项待清理资料');
  const seen=new Set(),items=submitted.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||!kinds.includes(item.kind)||!Number.isSafeInteger(item.id)||item.id<1||!Number.isSafeInteger(item.revision)||item.revision<0)throw new ApiError(400,'待清理资料的功能、编号或版本无效');
    const key=`${item.kind}:${item.id}`;if(seen.has(key))throw new ApiError(400,'待清理资料存在重复项');seen.add(key);
    return {kind:item.kind,id:item.id,revision:item.revision};
  }).sort((a,b)=>a.kind.localeCompare(b.kind)||a.id-b.id);
  const result=await tx(async db=>{
    let cleared;try{cleared=await S.deleteStorageItems(db,req.user,items.map(item=>({...item,cutoff})))}catch(error){if(error.status===404)throw new ApiError(409,'资料已变化，请重新预览后核对清理');throw error}
    return {itemCount:cleared.length,releasedBytes:cleared.reduce((n,item)=>n+item.releasedBytes,0)};
  });ok(res,result);
}));
router.get('/audit',asyncHandler(async(_req,res)=>{const [rows]=await pool.query('SELECT id,actor_id,source_kind,source_id,title,released_bytes,created_at FROM work_storage_audit ORDER BY id DESC LIMIT 50');ok(res,rows);}));
router.patch('/:kind/:id/retention',asyncHandler(async(req,res)=>{
  const {kind}=req.params;if(kind!=='attendance')throw new ApiError(400,'此类资料按最后更新时间清理');const date=req.body.retentionUntil===null?null:String(req.body.retentionUntil||'');if(date!==null&&!Number.isFinite(require('../attendance-analysis').dayNumber(date)))throw new ApiError(400,'保留截止日期无效');
  await tx(async db=>{const table='attendance_reports';const [r]=await db.query(`SELECT revision FROM ${table} WHERE id=? AND workshop_code='raw_grain' FOR UPDATE`,[S.storageId(req.params.id)]);if(!r.length)throw new ApiError(404,'资料不存在');if(r[0].revision!==Number(req.body.revision))throw new ApiError(409,'资料已更新，请刷新列表');await db.query(`UPDATE ${table} SET retention_until=?,revision=revision+1,updated_at=updated_at WHERE id=?`,[date,S.storageId(req.params.id)]);});ok(res,true);
}));
router.delete('/:kind/:id',asyncHandler(async(req,res)=>{if(!S.TYPES.includes(req.params.kind))throw new ApiError(400,'资料类型无效');ok(res,await tx(db=>S.deleteStorageItem(db,req.user,{kind:req.params.kind,id:req.params.id,cutoff:req.body.cutoff,revision:req.body.revision,manual:req.body.manual??false})));}));
module.exports=router;

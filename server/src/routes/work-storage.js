const express=require('express');
const {pool}=require('../db');
const {ApiError,asyncHandler}=require('../utils');
const S=require('../work-storage');
const router=express.Router();router.use(S.requireStorageAdmin);router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
const ok=(res,data)=>res.json({success:true,data});
async function tx(fn){const db=await pool.getConnection();try{await db.beginTransaction();const result=await fn(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
router.get('/',asyncHandler(async(req,res)=>{
  const cutoff=S.cutoffDate(req.query.cutoff),page=Number(req.query.page||1),kind=String(req.query.kind||'');if(!Number.isSafeInteger(page)||page<1||page>100000||kind&&!S.TYPES.includes(kind))throw new ApiError(400,'筛选参数无效');
  const where=kind?' WHERE kind=?':'',args=kind?[kind]:[];
  const [items]=await pool.query(`SELECT * FROM (${S.STORAGE_UNION}) storage${where} ORDER BY updatedAt ASC,kind,id LIMIT 30 OFFSET ?`,[...args,(page-1)*30]);
  const [summary]=await pool.query(`SELECT kind,COUNT(*) AS itemCount,SUM(bytes) AS bytes,SUM(fileCount) AS fileCount FROM (${S.STORAGE_UNION}) storage GROUP BY kind`);
  const [[count]]=await pool.query(`SELECT COUNT(*) AS total FROM (${S.STORAGE_UNION}) storage${where}`,args);
  ok(res,{items:items.map(r=>S.decorate(r,cutoff)),summary:summary.map(r=>({...r,bytes:Number(r.bytes),itemCount:Number(r.itemCount),fileCount:Number(r.fileCount)})),total:Number(count.total),page,cutoff});
}));
router.get('/audit',asyncHandler(async(_req,res)=>{const [rows]=await pool.query('SELECT id,actor_id,source_kind,source_id,title,released_bytes,created_at FROM work_storage_audit ORDER BY id DESC LIMIT 50');ok(res,rows);}));
router.patch('/:kind/:id/retention',asyncHandler(async(req,res)=>{
  const {kind}=req.params;if(!['inspection','attendance'].includes(kind))throw new ApiError(400,'此类资料按最后更新时间清理');const date=req.body.retentionUntil===null?null:String(req.body.retentionUntil||'');if(date!==null&&!Number.isFinite(require('../attendance-analysis').dayNumber(date)))throw new ApiError(400,'保留截止日期无效');
  await tx(async db=>{const table=kind==='inspection'?'inspection_notices':'attendance_reports';const [r]=await db.query(`SELECT revision FROM ${table} WHERE id=? AND workshop_code='raw_grain' FOR UPDATE`,[S.storageId(req.params.id)]);if(!r.length)throw new ApiError(404,'资料不存在');if(r[0].revision!==Number(req.body.revision))throw new ApiError(409,'资料已更新，请刷新列表');await db.query(`UPDATE ${table} SET retention_until=?,revision=revision+1,updated_at=updated_at WHERE id=?`,[date,S.storageId(req.params.id)]);});ok(res,true);
}));
router.delete('/:kind/:id',asyncHandler(async(req,res)=>ok(res,await tx(db=>S.deleteStorageItem(db,req.user,{kind:req.params.kind,id:req.params.id,cutoff:req.body.cutoff,revision:req.body.revision})))));
module.exports=router;

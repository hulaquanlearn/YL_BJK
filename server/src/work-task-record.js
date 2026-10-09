const {parseJson,ApiError}=require('./utils');
const W=require('./work-assessment');
const F=require('./work-flow');

// One durable work record per assignment. Daily scoring already counts distinct
// dates, so multiple assignments and a manual incident cannot earn extra days.
async function syncTaskRecord(db,a,user,{day,submitted,result,note,reference,files,member,lockReport,audit}){
  const [rows]=await db.query("SELECT * FROM work_records WHERE user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.sourceTaskId'))=? FOR UPDATE",[a.user_id,String(a.id)]);
  const old=rows[0];
  if(!submitted&&!old)return;
  const recordDay=old?String(old.record_date).slice(0,10):day,start=W.week(recordDay);
  const m=await member(db,a.user_id),report=await lockReport(db,a.user_id,start,m.workshop_code);
  W.mutable(report);
  if(!submitted){
    await db.query("UPDATE work_records SET status='draft',revision=revision+1 WHERE id=?",[old.id]);
    await audit(db,report.id,user.id,'record_updated',{recordId:old.id,taskId:a.id,reason:'task_returned'});
    return;
  }
  const catalog=await F.getCatalog(db,start);
  const previous=old?parseJson(old.payload,{}):null;
  const duty=previous?.checks?.[0]?.dutySnapshot||catalog.get('directive_tasks');
  if(!duty)throw new ApiError(400,'请先配置指令性工作事项，再提交派发任务');
  const evidence={id:a.id,title:a.title,result,note,reference,files};
  const payload={floor:m.floor,mode:'daily',sourceTaskId:a.id,checks:[{dutyId:'directive_tasks',dutySnapshot:duty,status:'已完成',note:`${a.title}：${result}${note?'；'+note:''}`,action:'派发任务提交后自动归档',taskAssignmentIds:[a.id],taskEvidence:[evidence]}]};
  let recordId=old?.id;
  if(old)await db.query("UPDATE work_records SET status='submitted',payload=?,revision=revision+1 WHERE id=?",[JSON.stringify(payload),recordId]);
  else{
    const [created]=await db.query('INSERT INTO work_records(user_id,week_start,record_date,kind,status,payload) VALUES(?,?,?,?,?,?)',[a.user_id,start,recordDay,'duties','submitted',JSON.stringify(payload)]);
    recordId=created.insertId;
  }
  for(const file of files)await db.query('INSERT IGNORE INTO work_task_file_references(file_id,record_id) VALUES(?,?)',[file.id,recordId]);
  await audit(db,report.id,user.id,old?'record_updated':'record_created',{recordId,taskId:a.id});
}
module.exports={syncTaskRecord};

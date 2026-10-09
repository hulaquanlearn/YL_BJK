const multer=require('multer');
const {ApiError,asyncHandler,parseJson}=require('./utils');
const W=require('./work-assessment');
const F=require('./work-flow');
const {syncTaskRecord}=require('./work-task-record');
module.exports=function register(router,{pool,ok,id,member,allow,review,transaction,lockReport,audit}){
  const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  router.get('/documents',asyncHandler(async(req,res)=>{
    if(!['admin','raw_grain','qu_making','brewing'].includes(req.user.role))throw new ApiError(403,'仅管理员可查看在线文档绑定');
    const start=W.week(req.query.week||today()),catalog=await F.getCatalog(pool,start);
    ok(res,{entries:catalog.entries.filter(d=>d.active!==false),canEdit:req.user.role==='admin',week:start});
  }));
  router.post('/documents',asyncHandler(async(req,res)=>{
    if(req.user.role!=='admin')throw new ApiError(403,'仅系统管理员可维护在线文档绑定');
    const dutyId=String(req.body.dutyId||''),documentUrl=F.validLink(req.body.documentUrl),documentTitle=W.text(req.body.documentTitle,100),start=W.week(req.body.week||today());
    if(start<W.week(today()))throw new ApiError(400,'历史记录的在线文档不能从此处修改，请选择当前工作内容');
    if(!documentTitle&&documentUrl)throw new ApiError(400,'请填写在线文档名称');
    if(!Number.isSafeInteger(req.body.revision)||req.body.revision<0)throw new ApiError(400,'文档版本无效，请刷新后重试');
    await transaction(async db=>{
      await db.query("SELECT id FROM app_users WHERE role='admin' ORDER BY id LIMIT 1 FOR UPDATE");
      const catalog=await F.getCatalog(db,start),duty=catalog.get(dutyId);
      if(!duty||duty.active===false)throw new ApiError(400,'请选择有效的工作内容');
      if(Number(duty.documentRevision||0)!==req.body.revision)throw new ApiError(409,'文档绑定已更新，请重新加载后修改');
      await db.query('INSERT INTO work_document_bindings(workshop_code,duty_id,document_title,document_url,updated_by) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE document_title=VALUES(document_title),document_url=VALUES(document_url),revision=revision+1,updated_by=VALUES(updated_by)',['qu_making',dutyId,documentTitle,documentUrl,req.user.id]);
    });
    ok(res,{saved:true});
  }));
  router.get('/catalog',asyncHandler(async(req,res)=>{
    if(!['admin','raw_grain','qu_making','brewing'].includes(req.user.role))throw new ApiError(403,'仅管理员可查看工作目录');
    const start=W.week(req.query.week||today()),current=await F.getCatalog(pool,start);
    const [history]=await pool.query('SELECT id,effective_week,created_at FROM work_catalog_versions ORDER BY effective_week DESC,id DESC LIMIT 30');
    ok(res,{entries:current.entries,version:current.version,history});
  }));
  router.post('/catalog',asyncHandler(async(req,res)=>{
    if(req.user.role!=='admin')throw new ApiError(403,'仅系统管理员可维护工作目录');
    if(!['admin','qu_making'].includes(req.user.role))throw new ApiError(403,'只能维护本车间的工作目录');
    const start=W.week(req.body.effectiveWeek);
    if(start<=W.week(today()))throw new ApiError(400,'目录变更从下周或以后生效，历史与本周记录保持不变');
    const entries=F.validateCatalog(req.body.entries);
    let savedId;
    await transaction(async db=>{
      // Serialize edits against the same administrator-independent catalogue lock.
      await db.query('SELECT id FROM app_users WHERE role=\'admin\' ORDER BY id LIMIT 1 FOR UPDATE');
      const current=await F.getCatalog(db,start);
      if(Number(req.body.version)!==current.version)throw new ApiError(409,'目录已更新，请重新加载');
      for(const old of current.entries)if(!entries.some(d=>d.id===old.id))throw new ApiError(400,'已有内容请停用，不可删除或改编号');
      const [result]=await db.query('INSERT INTO work_catalog_versions(effective_week,entries_json,created_by) VALUES(?,?,?)',[start,JSON.stringify(entries),req.user.id]);
      savedId=result.insertId;
    });
    ok(res,{id:savedId});
  }));
  router.post('/schedule',asyncHandler(async(req,res)=>{
    const m=await member(pool,req.user.id),start=W.week(req.body.week),restDate=req.body.restDate?W.date(req.body.restDate):null;
    F.schedule(start,restDate);
    if(start>W.week(today()))throw new ApiError(400,'请在对应周次开始后设置休息日');
    await transaction(async db=>{
      const report=await lockReport(db,req.user.id,start,m.workshop_code);W.mutable(report);
      const current=await F.getSchedule(db,req.user.id,start);
      if(Number(req.body.revision)!==current.revision)throw new ApiError(409,'休息日已更新，请刷新');
      if(restDate){const [records]=await db.query('SELECT id FROM work_records WHERE user_id=? AND record_date=? LIMIT 1',[req.user.id,restDate]);
        if(records.length&&req.body.confirmExisting!==true)throw new ApiError(409,'当天已有记录，确认后保留记录并将当天标记为休息');}
      await db.query('INSERT INTO work_week_schedule(user_id,week_start,rest_date,revision,updated_by) VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE rest_date=VALUES(rest_date),revision=revision+1,updated_by=VALUES(updated_by)',[req.user.id,start,restDate,req.user.id]);
      await db.query('UPDATE work_reports SET revision=revision+1,result_json=NULL WHERE id=?',[report.id]);
      await audit(db,report.id,req.user.id,'rest_changed',{previous:current.restDate,restDate});
    });ok(res,true);
  }));
  const isManager=user=>['admin','raw_grain','qu_making','brewing'].includes(user.role)||(user.role==='viewer'&&user.staffWorkshopCode==='qu_making'&&user.staffPosition==='shift_leader');
  async function assignment(db,assignmentId,user,write=false){
    const [rows]=await db.query(`SELECT a.*,t.owner_id,t.title,t.instructions,t.duty_id,t.due_date,t.evidence_mode FROM work_task_assignments a JOIN work_tasks t ON t.id=a.task_id WHERE a.id=?${write?' FOR UPDATE':''}`,[id(assignmentId)]);
    const row=rows[0];if(!row)throw new ApiError(404,'任务不存在');
    if(String(row.user_id)===String(user.id)){await member(db,user.id);return row;}
    if(!isManager(user))throw new ApiError(403,'无权查看任务');
    await allow(user,await member(db,row.user_id));return row;
  }
  async function event(db,a,user,action,detail){await db.query('INSERT INTO work_task_events(assignment_id,actor_id,action,detail) VALUES(?,?,?,?)',[a.id,user.id,action,JSON.stringify(detail)]);}
  router.get('/tasks/:id',asyncHandler(async(req,res)=>{
    const a=await assignment(pool,req.params.id,req.user);
    const [files]=await pool.query('SELECT id,assignment_id FROM work_task_files WHERE assignment_id=?',[a.id]);
    ok(res,{...a,files,overdue:a.status!=='accepted'&&a.due_date<today()});
  }));
  router.get('/tasks',asyncHandler(async(req,res)=>{
    const manager=isManager(req.user),params=[];
    if(!manager)await member(pool,req.user.id);
    let scope='a.user_id=?';params.push(req.user.id);
    if(manager){if(!['raw_grain','brewing'].includes(req.user.role))await review(req.user,'qu_making');scope=req.user.role==='viewer'?'EXISTS (SELECT 1 FROM work_team_assignments team WHERE team.user_id=a.user_id AND team.shift_leader_id=?)':'1=1';if(req.user.role!=='viewer')params.length=0;}
    const page=Math.max(1,Number(req.query.page)||1),pageSize=50,status=req.query.status||'all';
    if(!Number.isSafeInteger(page)||page>100000||!['all','open','submitted','accepted'].includes(status))throw new ApiError(400,'任务筛选参数无效');
    const [groups]=await pool.query(`SELECT a.status,COUNT(*) AS count FROM work_task_assignments a WHERE ${scope} GROUP BY a.status`,params);
    const counts={open:0,submitted:0,accepted:0,all:0};for(const g of groups){const n=Number(g.count);counts.all+=n;if(['pending','returned'].includes(g.status))counts.open+=n;else if(g.status in counts)counts[g.status]+=n;}
    const statusFilter=status==='all'?'':status==='open'?" AND a.status IN ('pending','returned')":' AND a.status=?';
    const [rows]=await pool.query(`SELECT a.*,t.title,t.instructions,t.due_date,t.evidence_mode,t.duty_id,t.owner_id,u.display_name AS name FROM work_task_assignments a JOIN work_tasks t ON t.id=a.task_id JOIN app_users u ON u.id=a.user_id WHERE ${scope}${statusFilter} ORDER BY CASE a.status WHEN 'returned' THEN 0 WHEN 'pending' THEN 1 WHEN 'submitted' THEN 2 ELSE 3 END,t.due_date,a.id DESC LIMIT ? OFFSET ?`,[...params,...(['submitted','accepted'].includes(status)?[status]:[]),pageSize,(page-1)*pageSize]);
    const ids=rows.map(a=>a.id),files=ids.length?(await pool.query('SELECT id,assignment_id FROM work_task_files WHERE assignment_id IN (?)',[ids]))[0]:[];
    ok(res,{items:rows.map(a=>({...a,files:files.filter(f=>String(f.assignment_id)===String(a.id)),overdue:a.status!=='accepted'&&a.due_date<today()})),page,pageSize,total:counts[status],counts});
  }));
  router.post('/tasks',asyncHandler(async(req,res)=>{
    await review(req.user,'qu_making');
    const title=W.text(req.body.title,150),instructions=W.text(req.body.instructions,4000),dueDate=W.date(req.body.dueDate);
    if(!Array.isArray(req.body.userIds))throw new ApiError(400,'请选择接收组长');
    const userIds=[...new Set(req.body.userIds.map(id))];
    if(!title||!instructions||!userIds.length||userIds.length>100||dueDate<today())throw new ApiError(400,'请填写任务要求、接收组长和有效截止日期');
    const evidenceMode=req.body.evidenceMode==='photo'?'photo':'either';
    const catalog=await F.getCatalog(pool,W.week(today())),dutyId=req.body.dutyId||(catalog.get('directive_tasks')?'directive_tasks':null);
    if(dutyId&&!catalog.get(dutyId))throw new ApiError(400,'关联工作内容无效');
    await transaction(async db=>{
      const members=[];for(const userId of userIds){const m=await member(db,userId);await allow(req.user,m);members.push(m);}
      const [task]=await db.query('INSERT INTO work_tasks(owner_id,title,instructions,duty_id,due_date,evidence_mode) VALUES(?,?,?,?,?,?)',[req.user.id,title,instructions,dutyId,dueDate,evidenceMode]);
      for(const m of members){const [a]=await db.query('INSERT INTO work_task_assignments(task_id,user_id,floor) VALUES(?,?,?)',[task.insertId,m.user_id,m.floor]);await event(db,{id:a.insertId},req.user,'assigned',{title,dueDate,floor:m.floor});}
    });ok(res,true);
  }));
  router.post('/tasks/:id/respond',asyncHandler(async(req,res)=>{
    await transaction(async db=>{
      const a=await assignment(db,req.params.id,req.user,true);
      if(String(a.user_id)!==String(req.user.id))throw new ApiError(403,'只能反馈本人的任务');
      if(['submitted','accepted'].includes(a.status))throw new ApiError(409,'已提交任务需班长退回后才能修改');
      if(Number(req.body.revision)!==a.revision)throw new ApiError(409,'任务已更新，请刷新');
      const result=String(req.body.result),note=W.text(req.body.note,4000),reference=F.validLink(req.body.reference);
      const [files]=await db.query('SELECT id FROM work_task_files WHERE assignment_id=?',[a.id]);
      if(!['正常','异常'].includes(result)||(result==='异常'&&!note))throw new ApiError(400,'请选择结果，异常时填写说明');
      if(!files.length&&(a.evidence_mode==='photo'||!reference))throw new ApiError(400,'请上传验证截图或按任务要求填写在线文档链接');
      await db.query("UPDATE work_task_assignments SET status='submitted',result=?,note=?,reference=?,submitted_at=NOW(),revision=revision+1 WHERE id=?",[result,note,reference,a.id]);
      await syncTaskRecord(db,a,req.user,{day:today(),submitted:true,result,note,reference,files,member,lockReport,audit});
      await event(db,a,req.user,'submitted',{result,note,reference,fileIds:files.map(f=>f.id)});
    });ok(res,true);
  }));
  router.post('/tasks/:id/review',asyncHandler(async(req,res)=>{
    await review(req.user,'qu_making');
    await transaction(async db=>{
      const a=await assignment(db,req.params.id,req.user,true);
      if(String(a.user_id)===String(req.user.id))throw new ApiError(403,'不能验收本人任务');
      if(Number(req.body.revision)!==a.revision)throw new ApiError(409,'任务已更新，请刷新');
      const action=req.body.action,feedback=W.text(req.body.feedback,2000);
      if(!['accept','return','extend'].includes(action))throw new ApiError(400,'操作无效');
      if(action==='extend'){
        if(a.status==='accepted')throw new ApiError(409,'已验收任务不能延期');
        const dueDate=W.date(req.body.dueDate);if(dueDate<today())throw new ApiError(400,'延期日期无效');
        // Extend the assignment independently by creating a replacement task header for it.
        const [t]=await db.query('INSERT INTO work_tasks(owner_id,title,instructions,duty_id,due_date,evidence_mode) VALUES(?,?,?,?,?,?)',[a.owner_id,a.title,a.instructions,a.duty_id,dueDate,a.evidence_mode]);
        await db.query('UPDATE work_task_assignments SET task_id=?,revision=revision+1 WHERE id=?',[t.insertId,a.id]);
        await event(db,a,req.user,'extended',{previous:a.due_date,dueDate});
      }else{
        if(a.status!=='submitted')throw new ApiError(409,'只能验收或退回已提交任务');
        if(action==='return'&&!feedback)throw new ApiError(400,'退回时请说明需要补充的内容');
        await db.query('UPDATE work_task_assignments SET status=?,feedback=?,accepted_at=?,revision=revision+1 WHERE id=?',[action==='accept'?'accepted':'returned',feedback,action==='accept'?new Date():null,a.id]);
        if(action==='return')await syncTaskRecord(db,a,req.user,{submitted:false,member,lockReport,audit});
        await event(db,a,req.user,action,{feedback});
      }
    });ok(res,true);
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}});
  router.post('/tasks/:id/files',upload.single('photo'),asyncHandler(async(req,res)=>{
    const b=req.file?.buffer;const mime=b?.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b?.[0]===255&&b?.[1]===216?'image/jpeg':'';if(!mime)throw new ApiError(400,'请上传有效的 JPG 或 PNG 图片');W.imageSize(b);
    await transaction(async db=>{
      const a=await assignment(db,req.params.id,req.user,true);
      if(String(a.user_id)!==String(req.user.id)||['submitted','accepted'].includes(a.status))throw new ApiError(403,'仅本人可为待提交任务添加材料');
      const [files]=await db.query('SELECT id FROM work_task_files WHERE assignment_id=?',[a.id]);if(files.length>=6)throw new ApiError(400,'每个任务最多6张图片');
      await db.query('INSERT INTO work_task_files(assignment_id,mime,image) VALUES(?,?,?)',[a.id,mime,b]);
      await db.query('UPDATE work_task_assignments SET revision=revision+1 WHERE id=?',[a.id]);
    });ok(res,true);
  }));
  router.get('/task-files/:id',asyncHandler(async(req,res)=>{
    const [rows]=await pool.query('SELECT id,assignment_id,mime FROM work_task_files WHERE id=?',[id(req.params.id)]);
    if(!rows[0])throw new ApiError(404,'材料不存在');await assignment(pool,rows[0].assignment_id,req.user);
    const [[file]]=await pool.query('SELECT image FROM work_task_files WHERE id=?',[rows[0].id]);
    res.set('Content-Type',rows[0].mime).set('Cache-Control','no-store').send(file.image);
  }));
  router.delete('/task-files/:id',asyncHandler(async(req,res)=>{
    await transaction(async db=>{
      const [rows]=await db.query('SELECT assignment_id FROM work_task_files WHERE id=?',[id(req.params.id)]);if(!rows[0])throw new ApiError(404,'材料不存在');
      const a=await assignment(db,rows[0].assignment_id,req.user,true);
      if(String(a.user_id)!==String(req.user.id)||['submitted','accepted'].includes(a.status))throw new ApiError(403,'只能移除本人未提交任务的材料');
      const [references]=await db.query('SELECT record_id FROM work_task_file_references WHERE file_id=? LIMIT 1',[id(req.params.id)]);
      if(references.length)throw new ApiError(409,'该材料已被履职记录引用，需保留历史凭证；可以补充新材料');
      await db.query('DELETE FROM work_task_files WHERE id=?',[id(req.params.id)]);
      await db.query('UPDATE work_task_assignments SET revision=revision+1 WHERE id=?',[a.id]);
    });ok(res,true);
  }));
};

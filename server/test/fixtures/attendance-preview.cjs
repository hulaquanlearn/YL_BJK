// Isolated acceptance fixture: production routers and workbook parser, in-memory storage only.
// Never reads database credentials or connects to MySQL.
const express=require('../../node_modules/express');
const path=require('node:path'),v8=require('node:v8');
function createFixture(){
  let reports=[],sources=[],notes=[],audit=[],nextId=1,backup;
  let calls=0;
  const archived=[{kind:'inspection',id:91,title:'本地测试 · 过期检查通报',workshopCode:'raw_grain',updatedAt:'2025-01-01 10:00:00',retentionUntil:'2025-06-01',bytes:150000,fileCount:2,referenceCount:0,revision:1},{kind:'work_photo',id:92,title:'本地测试 · 制曲工作截图',workshopCode:'qu_making',updatedAt:'2025-01-02 10:00:00',retentionUntil:null,bytes:90000,fileCount:1,referenceCount:0,revision:1},{kind:'task_file',id:93,title:'本地测试 · 已引用任务附件',workshopCode:'qu_making',updatedAt:'2025-01-02 10:00:00',retentionUntil:null,bytes:120000,fileCount:1,referenceCount:1,revision:1}];
  const now=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const storage=()=>[...archived,...reports.map(r=>({kind:'attendance',id:r.id,title:r.title,workshopCode:'raw_grain',updatedAt:r.updated_at,retentionUntil:r.retention_until,bytes:Buffer.byteLength(r.analysis_json)+sources.filter(s=>s.report_id===r.id).reduce((n,s)=>n+s.byte_size,0),fileCount:2,referenceCount:0,revision:r.revision}))];
  const pool={async query(sql,args=[]){
    calls++;const s=sql.replace(/\s+/g,' ').trim();
    if(s.includes(') storage')){
      let data=storage();
      if(s.includes('WHERE kind=? AND id=?'))data=data.filter(r=>r.kind===args[0]&&r.id===Number(args[1]));
      else if(s.includes('WHERE kind=?'))data=data.filter(r=>r.kind===args[0]);
      if(s.startsWith('SELECT COUNT(*)'))return [[{total:data.length}]];
      if(s.startsWith('SELECT kind,COUNT'))return [[...new Set(data.map(r=>r.kind))].map(kind=>{const group=data.filter(r=>r.kind===kind);return {kind,itemCount:group.length,bytes:group.reduce((n,r)=>n+r.bytes,0),fileCount:group.reduce((n,r)=>n+r.fileCount,0)}})];
      if(s.includes('LIMIT 30'))data=data.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)).slice(args.at(-1),args.at(-1)+30);
      return [data];
    }
    if(s.startsWith('INSERT INTO attendance_reports')){
      let r=reports.find(r=>r.source_hash===args[4]);
      if(!r){r={id:nextId++,workshop_code:'raw_grain',title:args[0],period:args[1],owner_id:args[2],analysis_json:args[3],source_hash:args[4],revision:1,retention_until:new Date(Date.now()+180*86400000).toISOString().slice(0,10),created_at:now(),updated_at:now()};reports.push(r)}
      return [{insertId:r.id}];
    }
    if(s.startsWith('SELECT * FROM attendance_reports'))return [[...reports.filter(r=>r.id===Number(args[0]))].map(r=>({...r}))];
    if(s.startsWith('SELECT id,title,period'))return [[...reports].sort((a,b)=>b.id-a.id)];
    if(s.startsWith('SELECT revision FROM attendance_reports'))return [reports.filter(r=>r.id===Number(args[0])).map(r=>({revision:r.revision}))];
    if(s.startsWith('SELECT id,revision,updated_at'))return [reports.filter(r=>r.id===Number(args[0])).map(r=>({id:r.id,revision:r.revision,updatedAt:r.updated_at,retentionUntil:r.retention_until}))];
    if(s.includes('FROM attendance_sources')&&s.startsWith('SELECT'))return [sources.filter(r=>r.report_id===Number(args[0])&&(args.length<2||r.source_kind===args[1]))];
    if(s.startsWith('INSERT INTO attendance_sources')){sources.push({id:sources.length+1,report_id:args[0],source_kind:args[1],filename:args[2],sha256:args[3],byte_size:args[4],content:args[5]});return [{affectedRows:1}]}
    if(s.startsWith('SELECT entry_key'))return [notes.filter(r=>r.report_id===Number(args[0]))];
    if(s.startsWith('INSERT INTO attendance_notes')){let n=notes.find(n=>n.report_id===args[0]&&n.entry_key===args[1]);if(!n){n={report_id:args[0],entry_key:args[1]};notes.push(n)}Object.assign(n,{note:args[2],actor_id:args[3],updated_at:now()});return [{affectedRows:1}]}
    if(s.startsWith('UPDATE attendance_reports')){const r=reports.find(r=>r.id===Number(args.at(-1)));if(s.includes('analysis_json=?'))r.analysis_json=args[0];if(s.includes('retention_until=?'))r.retention_until=args[0];r.revision++;if(!s.includes('updated_at=updated_at'))r.updated_at=now();return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_notes')){notes=notes.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_sources')){sources=sources.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_reports')){reports=reports.filter(r=>r.id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('INSERT INTO work_storage_audit')){audit.push({id:audit.length+1,actor_id:args[0],source_kind:args[1],source_id:args[2],title:args[3],released_bytes:args[4],created_at:now()});return [{affectedRows:1}]}
    if(s.startsWith('SELECT id,actor_id'))return [[...audit].reverse()];
    throw new Error('Acceptance fixture missing SQL: '+s.slice(0,100));
  },async getConnection(){return {...pool,async beginTransaction(){backup=v8.serialize({reports,sources,notes,audit,nextId})},async commit(){backup=null},async rollback(){if(backup){({reports,sources,notes,audit,nextId}=v8.deserialize(backup));backup=null}},release(){}}}};
  const dbPath=path.resolve(__dirname,'../../src/db.js');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool}};
  for(const name of ['attendance','work-storage'])delete require.cache[require.resolve('../../src/routes/'+name)];
  const app=express();app.use(express.json());
  const roles=['admin','raw_grain','qu_making','brewing','viewer'];
  const user=role=>({id:1,role,username:role,displayName:'本地验收账号',staffWorkshopCode:role==='viewer'?'raw_grain':undefined,staffPosition:role==='viewer'?'group_leader':undefined});
  app.post('/api/auth/login',(req,res)=>roles.includes(req.body.username)&&req.body.password==='preview'?res.json({success:true,data:{token:'attendance-preview-'+req.body.username,user:user(req.body.username)}}):res.status(401).json({msg:'本地验收账号密码为 preview'}));
  app.get('/api/health',(_req,res)=>res.json({success:true,database:'preview-only'}));
  app.use('/api',(req,res,next)=>{const role=String(req.headers.authorization||'').replace('Bearer attendance-preview-','');if(!roles.includes(role))return res.status(401).json({msg:'请登录本地验收账号'});req.user=user(role);next()});
  app.get('/api/auth/me',(req,res)=>res.json({success:true,data:req.user}));
  app.post('/api/auth/logout',(_req,res)=>res.json({success:true,data:true}));
  app.get('/api/work/context',(_req,res)=>res.json({success:true,data:{workRole:''}}));
  app.use('/api/attendance',require('../../src/routes/attendance'));
  app.use('/api/work-storage',require('../../src/routes/work-storage'));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({success:false,msg:err.message,details:err.details}));
  return {app,pool,inspect:()=>({reports,sources,notes,audit,calls})};
}
module.exports={createFixture};
if(require.main===module&&!process.env.NODE_TEST_CONTEXT){const {app}=createFixture(),port=Number(process.env.ATTENDANCE_PREVIEW_PORT)||8536;app.listen(port,'127.0.0.1',()=>console.log('Isolated attendance acceptance API: http://127.0.0.1:'+port))}

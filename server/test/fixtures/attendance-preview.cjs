// Isolated acceptance fixture: production routers and workbook parser, in-memory storage only.
// Never reads database credentials or connects to MySQL.
const express=require('../../node_modules/express');
const path=require('node:path'),v8=require('node:v8');
function createFixture(){
  let reports=[],sources=[],notes=[],audit=[],rawReports=[],rawPhotos=[],rawEvents=[],nextId=1,backup;
  let calls=0;
  // Disposable synthetic source records back the storage list, locks and cleanup.
  let archived=[{kind:'attendance',id:91,title:'本地测试 · 过期考勤资料',workshopCode:'raw_grain',updatedAt:'2025-01-01 10:00:00',retentionUntil:'2025-06-01',contentBytes:10000,bytes:150000,fileCount:2,referenceCount:0,revision:1}];
  let retainedSources=[{id:9101,report_id:91,byte_size:70000,status:'ready'},{id:9102,report_id:91,byte_size:65000,status:'ready'}];
  let retainedNotes=[{id:9103,report_id:91,byte_size:5000}];
  const now=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const archiveRow=({contentBytes,...r})=>({...r,bytes:contentBytes+retainedSources.filter(s=>s.report_id===r.id).reduce((n,s)=>n+s.byte_size,0)+retainedNotes.filter(s=>s.report_id===r.id).reduce((n,s)=>n+s.byte_size,0),fileCount:retainedSources.filter(s=>s.report_id===r.id).length,processingCount:retainedSources.filter(s=>s.report_id===r.id&&s.status==='processing').length});
  const storage=()=>[...archived.map(archiveRow),...reports.map(r=>({kind:'attendance',id:r.id,title:r.title,workshopCode:'raw_grain',updatedAt:r.updated_at,retentionUntil:r.retention_until,bytes:Buffer.byteLength(r.analysis_json)+sources.filter(s=>s.report_id===r.id).reduce((n,s)=>n+s.byte_size,0)+notes.filter(n=>n.report_id===r.id).reduce((sum,n)=>sum+Buffer.byteLength(n.note),0),fileCount:sources.filter(s=>s.report_id===r.id).length,referenceCount:0,processingCount:0,revision:r.revision})),...rawPhotos.map(p=>{const r=rawReports.find(r=>r.id===p.report_id),S=require('../../src/work-storage');return {kind:'raw_duty_photo',id:p.id,title:[r.identity_json.name,r.week_start,p.filename].join(' · '),workshopCode:'raw_grain',updatedAt:r.updatedAt,retentionUntil:null,bytes:p.byte_size,fileCount:1,referenceCount:Number(S.referencesPhoto(r.checks_json,p.id)||S.referencesPhoto(r.cadence_json,p.id)),revision:r.revision,processingCount:0,historyCount:Number(!!r.submitted_at||['submitted','confirmed'].includes(r.status))}})];
  const pool={async query(sql,args=[]){
    calls++;const s=sql.replace(/\s+/g,' ').trim();
    if(s.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
    if(s.startsWith('SELECT RELEASE_LOCK'))return [[{released:1}]];
    if(s.startsWith("SELECT id FROM attendance_reports WHERE workshop_code='raw_grain' AND id<>?"))return [reports.filter(r=>r.id!==Number(args[0])).map(r=>({id:r.id}))];
    if(s.includes(') storage')){
      let data=storage();
      let scopeCount=0;
      if(s.includes('WHERE kind=? AND id=?')){data=data.filter(r=>r.kind===args[0]&&r.id===Number(args[1]));scopeCount=2;}
      else if(s.includes('WHERE kind=?')){data=data.filter(r=>r.kind===args[0]);scopeCount=1;}
      else {const filter=s.match(/WHERE kind IN \(([^)]+)\)/);if(filter){scopeCount=(filter[1].match(/\?/g)||[]).length;data=data.filter(r=>args.slice(0,scopeCount).includes(r.kind));}}
      if(s.includes('AND processingCount=0'))data=data.filter(r=>(!r.referenceCount||r.kind==='raw_duty_photo')&&!r.processingCount&&String(r.updatedAt).slice(0,10)<args[scopeCount]&&(!r.retentionUntil||String(r.retentionUntil).slice(0,10)<args[scopeCount+1]));
      if(s.startsWith('SELECT COUNT(*)'))return [[{total:data.length}]];
      if(s.startsWith('SELECT kind,COUNT'))return [[...new Set(data.map(r=>r.kind))].map(kind=>{const group=data.filter(r=>r.kind===kind);return {kind,itemCount:group.length,bytes:group.reduce((n,r)=>n+r.bytes,0),fileCount:group.reduce((n,r)=>n+r.fileCount,0)}})];
      if(s.includes('ORDER BY updatedAt'))data=data.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)||a.kind.localeCompare(b.kind)||a.id-b.id);
      if(s.includes('LIMIT 30'))data=data.slice(args.at(-1),args.at(-1)+30);
      if(s.includes('LIMIT 1001'))data=data.slice(0,1001);
      return [data];
    }
    if(s.startsWith('SELECT report_id FROM raw_duty_photos'))return [rawPhotos.filter(p=>p.id===Number(args[0])).map(p=>({report_id:p.report_id}))];
    if(s.includes('FROM raw_duty_reports WHERE id=? FOR UPDATE'))return [rawReports.filter(r=>r.id===Number(args[0])).map(r=>({...r}))];
    if(s.startsWith('SELECT id,report_id,filename,byte_size FROM raw_duty_photos'))return [rawPhotos.filter(p=>p.id===Number(args[0])).map(({image,...p})=>p)];
    if(s.startsWith('DELETE FROM raw_duty_photos')){const before=rawPhotos.length;rawPhotos=rawPhotos.filter(p=>p.id!==Number(args[0])||p.report_id!==Number(args[1]));return [{affectedRows:before-rawPhotos.length}]}
    if(s.startsWith('UPDATE raw_duty_reports')){const r=rawReports.find(r=>r.id===args[2]&&r.revision===args[3]);if(!r)return [{affectedRows:0}];r.checks_json=JSON.parse(args[0]);r.cadence_json=args[1]==null?null:JSON.parse(args[1]);r.revision++;return [{affectedRows:1}]}
    if(s.startsWith('INSERT INTO raw_duty_events')){rawEvents.push({report_id:args[0],actor_id:args[1],action:'photo_removed_admin',detail:JSON.parse(args[2])});return [{affectedRows:1}]}
    if(s.startsWith('INSERT INTO attendance_reports')){
      let r=reports.find(r=>r.source_hash===args[4]);
      if(!r){r={id:nextId++,workshop_code:'raw_grain',title:args[0],period:args[1],owner_id:args[2],analysis_json:args[3],source_hash:args[4],revision:1,retention_until:new Date(Date.now()+180*86400000).toISOString().slice(0,10),created_at:now(),updated_at:now()};reports.push(r)}
      return [{insertId:r.id}];
    }
    if(s.startsWith('SELECT * FROM attendance_reports'))return [[...reports.filter(r=>r.id===Number(args[0]))].map(r=>({...r}))];
    if(s.startsWith('SELECT id,title,period')){const rows=[...reports].sort((a,b)=>b.id-a.id);return [s.includes('LIMIT 1')?rows.slice(0,1):rows];}
    if(s.startsWith('SELECT revision FROM attendance_reports')&&archived.some(r=>r.kind==='attendance'&&r.id===Number(args[0])))return [archived.filter(r=>r.kind==='attendance'&&r.id===Number(args[0])).map(r=>({revision:r.revision}))];
    if(s.startsWith('SELECT id,revision,updated_at')&&archived.some(r=>r.kind==='attendance'&&r.id===Number(args[0])))return [archived.filter(r=>r.kind==='attendance'&&r.id===Number(args[0])).map(r=>({id:r.id,revision:r.revision,updatedAt:r.updatedAt,retentionUntil:r.retentionUntil}))];
    if(s.startsWith('SELECT revision FROM attendance_reports'))return [reports.filter(r=>r.id===Number(args[0])).map(r=>({revision:r.revision}))];
    if(s.startsWith('SELECT id,revision,updated_at'))return [reports.filter(r=>r.id===Number(args[0])).map(r=>({id:r.id,revision:r.revision,updatedAt:r.updated_at,retentionUntil:r.retention_until}))];
    if(s.includes('FROM attendance_sources')&&s.startsWith('SELECT'))return [sources.filter(r=>r.report_id===Number(args[0])&&(args.length<2||r.source_kind===args[1]))];
    if(s.startsWith('INSERT INTO attendance_sources')){sources.push({id:sources.length+1,report_id:args[0],source_kind:args[1],filename:args[2],sha256:args[3],byte_size:args[4],content:args[5]});return [{affectedRows:1}]}
    if(s.startsWith('SELECT entry_key'))return [notes.filter(r=>r.report_id===Number(args[0]))];
    if(s.startsWith('INSERT INTO attendance_notes')){let n=notes.find(n=>n.report_id===args[0]&&n.entry_key===args[1]);if(!n){n={report_id:args[0],entry_key:args[1]};notes.push(n)}Object.assign(n,{note:args[2],actor_id:args[3],updated_at:now()});return [{affectedRows:1}]}
    if(s.startsWith('UPDATE attendance_reports')&&archived.some(r=>r.kind==='attendance'&&r.id===Number(args.at(-1)))){const r=archived.find(r=>r.kind==='attendance'&&r.id===Number(args.at(-1)));r.retentionUntil=args[0];r.revision++;return [{affectedRows:1}]}
    if(s.startsWith('UPDATE attendance_reports')){const r=reports.find(r=>r.id===Number(args.at(-1)));if(s.includes('analysis_json=?'))r.analysis_json=args[0];if(s.includes('retention_until=?'))r.retention_until=args[0];r.revision++;if(!s.includes('updated_at=updated_at'))r.updated_at=now();return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_sources')&&archived.some(r=>r.kind==='attendance'&&r.id===Number(args[0]))){retainedSources=retainedSources.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_notes')&&archived.some(r=>r.kind==='attendance'&&r.id===Number(args[0]))){retainedNotes=retainedNotes.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_reports')&&archived.some(r=>r.id===Number(args[0]))){archived=archived.filter(r=>r.id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_notes')){notes=notes.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_sources')){sources=sources.filter(r=>r.report_id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('DELETE FROM attendance_reports')){reports=reports.filter(r=>r.id!==Number(args[0]));return [{affectedRows:1}]}
    if(s.startsWith('INSERT INTO work_storage_audit')){audit.push({id:audit.length+1,actor_id:args[0],source_kind:args[1],source_id:args[2],title:args[3],released_bytes:args[4],detail_json:args[5],created_at:now()});return [{affectedRows:1}]}
    if(s.startsWith('SELECT id,actor_id'))return [[...audit].reverse()];
    throw new Error('Acceptance fixture missing SQL: '+s.slice(0,100));
  },async getConnection(){return {...pool,async beginTransaction(){backup=v8.serialize({reports,sources,notes,audit,nextId,archived,retainedSources,retainedNotes,rawReports,rawPhotos,rawEvents})},async commit(){backup=null},async rollback(){if(backup){({reports,sources,notes,audit,nextId,archived,retainedSources,retainedNotes,rawReports,rawPhotos,rawEvents}=v8.deserialize(backup));backup=null}},release(){}}}};
  const dbPath=path.resolve(__dirname,'../../src/db.js');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool}};
  for(const name of ['attendance','work-storage'])delete require.cache[require.resolve('../../src/routes/'+name)];
  const app=express();app.use(express.json());
  const roles=['admin','raw_grain','qu_making','brewing','viewer'];
  const user=role=>({id:1,role,username:role,displayName:'本地验收账号',staffWorkshopCode:role==='viewer'?'raw_grain':undefined,staffPosition:role==='viewer'?'shift_leader':undefined});
  app.post('/api/auth/login',(req,res)=>roles.includes(req.body.username)&&req.body.password==='preview'?res.json({success:true,data:{token:'attendance-preview-'+req.body.username,user:user(req.body.username)}}):res.status(401).json({msg:'本地验收账号密码为 preview'}));
  app.get('/api/health',(_req,res)=>res.json({success:true,database:'preview-only'}));
  app.use('/api',(req,res,next)=>{const role=String(req.headers.authorization||'').replace('Bearer attendance-preview-','');if(!roles.includes(role))return res.status(401).json({msg:'请登录本地验收账号'});req.user=user(role);next()});
  app.get('/api/auth/me',(req,res)=>res.json({success:true,data:req.user}));
  app.post('/api/auth/logout',(_req,res)=>res.json({success:true,data:true}));
  app.use('/api/attendance',require('../../src/routes/attendance'));
  app.use('/api/work-storage',require('../../src/routes/work-storage'));
  app.use((err,_req,res,_next)=>res.status(err.status||500).json({success:false,msg:err.message,details:err.details}));
  const inspect=()=>({reports,sources,notes,audit,calls,nextId,archived,retainedSources,retainedNotes,rawReports,rawPhotos,rawEvents});
  const restore=state=>{
    const restored=v8.deserialize(Buffer.isBuffer(state)?state:v8.serialize({...inspect(),...state}));
    for(const key of ['reports','sources','notes','audit','archived','retainedSources','retainedNotes'])if(!Array.isArray(restored[key]))throw new Error('Invalid preview state: '+key);
    const minimumId=Math.max(0,...restored.reports.map(r=>Number(r.id)))+1;
    restored.nextId=Math.max(Number(restored.nextId)||minimumId,minimumId);
    if(!Number.isSafeInteger(restored.nextId)||restored.nextId<1)throw new Error('Invalid preview next report ID');
    ({reports,sources,notes,audit,nextId,archived,retainedSources,retainedNotes}=restored);rawReports=restored.rawReports||[];rawPhotos=restored.rawPhotos||[];rawEvents=restored.rawEvents||[];
    if(Number.isSafeInteger(restored.calls)&&restored.calls>=0)calls=restored.calls;
    backup=undefined;
  };
  return {app,pool,inspect,snapshot:()=>v8.serialize(inspect()),restore};
}
module.exports={createFixture};
if(require.main===module&&!process.env.NODE_TEST_CONTEXT){const {app}=createFixture(),port=Number(process.env.ATTENDANCE_PREVIEW_PORT)||8536;app.listen(port,'127.0.0.1',()=>console.log('Isolated attendance acceptance API: http://127.0.0.1:'+port))}

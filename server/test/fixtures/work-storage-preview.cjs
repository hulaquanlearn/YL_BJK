// Isolated raw-duty-photo storage fixture. No real database or source credentials.
const express=require('express'),path=require('node:path'),v8=require('node:v8');
function createFixture(){
 let rawReports=[],rawPhotos=[],rawEvents=[],audit=[],calls=0,backup;
 const inspect=()=>({rawReports,rawPhotos,rawEvents,audit,calls});
 const restore=input=>{const state=v8.deserialize(Buffer.isBuffer(input)?input:v8.serialize(input));({rawReports,rawPhotos,rawEvents,audit}=state);calls=state.calls||0};
 const storage=()=>rawPhotos.map(photo=>{const r=rawReports.find(row=>row.id===photo.report_id),S=require('../../src/work-storage');return{kind:'raw_duty_photo',id:photo.id,title:photo.filename,workshopCode:'raw_grain',updatedAt:r.updatedAt,retentionUntil:null,bytes:photo.byte_size,fileCount:1,referenceCount:Number(S.referencesPhoto(r.checks_json,photo.id)||S.referencesPhoto(r.cadence_json,photo.id)),historyCount:Number(!!r.submitted_at||['submitted','confirmed'].includes(r.status)),revision:r.revision,processingCount:0}});
 const pool={async query(sql,args=[]){calls++;const s=sql.replace(/\s+/g,' ').trim();
  if(s.includes(') storage')){let rows=storage(),count=0;if(s.includes('WHERE kind=? AND id=?')){rows=rows.filter(r=>r.kind===args[0]&&r.id===Number(args[1]));count=2}else if(s.includes('WHERE kind=?')){rows=rows.filter(r=>r.kind===args[0]);count=1}else{const match=s.match(/WHERE kind IN \(([^)]+)\)/);if(match){count=(match[1].match(/\?/g)||[]).length;rows=rows.filter(r=>args.slice(0,count).includes(r.kind))}}if(s.includes('AND processingCount=0'))rows=rows.filter(r=>!r.processingCount&&r.updatedAt.slice(0,10)<args[count]);if(s.startsWith('SELECT COUNT(*)'))return[[{total:rows.length}]];if(s.startsWith('SELECT kind,COUNT'))return[[...new Set(rows.map(r=>r.kind))].map(kind=>{const selected=rows.filter(r=>r.kind===kind);return{kind,itemCount:selected.length,bytes:selected.reduce((n,r)=>n+r.bytes,0),fileCount:selected.length}})];rows.sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)||a.id-b.id);if(s.includes('LIMIT 1001'))rows=rows.slice(0,1001);if(s.includes('LIMIT 30'))rows=rows.slice(args.at(-1),args.at(-1)+30);return[rows]}
  if(s.startsWith('SELECT report_id FROM raw_duty_photos'))return[rawPhotos.filter(p=>p.id===Number(args[0])).map(p=>({report_id:p.report_id}))];
  if(s.includes('FROM raw_duty_reports WHERE id=? FOR UPDATE'))return[rawReports.filter(r=>r.id===Number(args[0])).map(r=>({...r}))];
  if(s.startsWith('SELECT id,report_id,filename,byte_size FROM raw_duty_photos'))return[rawPhotos.filter(p=>p.id===Number(args[0])).map(({image,...p})=>p)];
  if(s.startsWith('DELETE FROM raw_duty_photos')){const n=rawPhotos.length;rawPhotos=rawPhotos.filter(p=>p.id!==Number(args[0])||p.report_id!==Number(args[1]));return[{affectedRows:n-rawPhotos.length}]}
  if(s.startsWith('UPDATE raw_duty_reports')){const r=rawReports.find(r=>r.id===args[2]&&r.revision===args[3]);if(!r)return[{affectedRows:0}];r.checks_json=JSON.parse(args[0]);r.cadence_json=args[1]==null?null:JSON.parse(args[1]);r.revision++;return[{affectedRows:1}]}
  if(s.startsWith('INSERT INTO raw_duty_events')){rawEvents.push({report_id:args[0],actor_id:args[1],action:'photo_removed_admin',detail:JSON.parse(args[2])});return[{affectedRows:1}]}
  if(s.startsWith('INSERT INTO work_storage_audit')){audit.push({id:audit.length+1,actor_id:args[0],source_kind:args[1],source_id:args[2],title:args[3],released_bytes:args[4],detail_json:args[5]});return[{affectedRows:1}]}
  if(s.startsWith('SELECT id,actor_id'))return[[...audit].reverse()];
  throw Error('Raw-photo fixture missing SQL: '+s.slice(0,100))
 },async getConnection(){return{...pool,async beginTransaction(){backup=v8.serialize(inspect())},async commit(){backup=null},async rollback(){if(backup)restore(backup);backup=null},release(){}}}};
 const dbPath=path.resolve(__dirname,'../../src/db.js');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool}};delete require.cache[require.resolve('../../src/routes/work-storage')];
 const app=express();app.use(express.json());const roles=['admin','raw_grain','qu_making','brewing','viewer'],user=role=>({id:1,role,username:role,displayName:'本地验收账号'});
 app.post('/api/auth/login',(req,res)=>roles.includes(req.body.username)&&req.body.password==='preview'?res.json({success:true,data:{token:'storage-preview-'+req.body.username,user:user(req.body.username)}}):res.status(401).json({msg:'请使用本地验收账号'}));
 app.get('/api/health',(_req,res)=>res.json({success:true,database:'preview-only'}));app.use('/api',(req,res,next)=>{const role=String(req.headers.authorization||'').replace('Bearer storage-preview-','');if(!roles.includes(role))return res.status(401).json({msg:'请先登录'});req.user=user(role);next()});app.get('/api/auth/me',(req,res)=>res.json({success:true,data:req.user}));app.post('/api/auth/logout',(_req,res)=>res.json({success:true,data:true}));app.use('/api/work-storage',require('../../src/routes/work-storage'));app.use((e,_req,res,_next)=>res.status(e.status||500).json({success:false,msg:e.message,details:e.details}));
 app.use((_req,res)=>res.status(404).json({success:false,msg:'接口不存在'}));
 return{app,pool,inspect,restore,snapshot:()=>v8.serialize(inspect())};
}
module.exports={createFixture};

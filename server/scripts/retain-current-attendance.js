// Existing installations: preview by default, prune only with --apply and a private rollback path.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {pool}=require('../src/db'),{IMPORT_LOCK,removePreviousReports}=require('../src/attendance-current');
async function main(){
 const apply=process.argv.includes('--apply'),at=process.argv.indexOf('--backup'),backup=at>=0?process.argv[at+1]:null;
 if(apply&&(!backup||!path.isAbsolute(backup)||!backup.endsWith('.json.gz')))throw Error('Apply requires an absolute private --backup path ending in .json.gz');
 const db=await pool.getConnection();let locked=false,begun=false;
 try{
  const [lock]=await db.query('SELECT GET_LOCK(?,10) AS acquired',[IMPORT_LOCK]);if(Number(lock[0]?.acquired)!==1)throw Error('Another attendance import is saving');locked=true;
  await db.beginTransaction();begun=true;
  const [rows]=await db.query("SELECT id,period FROM attendance_reports WHERE workshop_code='raw_grain' ORDER BY created_at DESC,id DESC FOR UPDATE");
  if(!apply||rows.length<2){await db.commit();console.log(JSON.stringify({apply,currentId:rows[0]?.id||null,removeIds:rows.slice(1).map(r=>r.id),removed:0}));return;}
  const ids=rows.map(r=>r.id),marks=ids.map(()=>'?').join(',');
  const [reports]=await db.query(`SELECT * FROM attendance_reports WHERE id IN (${marks})`,ids),[sources]=await db.query(`SELECT * FROM attendance_sources WHERE report_id IN (${marks})`,ids),[notes]=await db.query(`SELECT * FROM attendance_notes WHERE report_id IN (${marks})`,ids);
  fs.mkdirSync(path.dirname(backup),{recursive:true,mode:0o700});
  const snapshot={createdAt:new Date().toISOString(),scope:'raw_grain attendance only',reports,sources:sources.map(r=>({...r,content:Buffer.from(r.content).toString('base64'),contentEncoding:'base64'})),notes};
  fs.writeFileSync(backup,zlib.gzipSync(Buffer.from(JSON.stringify(snapshot))),{flag:'wx',mode:0o600});
  const removed=await removePreviousReports(db,Number(rows[0].id));await db.commit();console.log(JSON.stringify({apply:true,currentId:rows[0].id,removed,rollbackSaved:true}));
 }catch(e){if(begun)await db.rollback();throw e}finally{if(locked)await db.query('SELECT RELEASE_LOCK(?)',[IMPORT_LOCK]);db.release()}
}
if(require.main===module)main().catch(()=>{console.error('Attendance retention stopped; no incomplete changes committed. Check database access and a new private backup path.');process.exitCode=1}).finally(()=>pool.end());

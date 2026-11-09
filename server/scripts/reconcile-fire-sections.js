// Explicit, recoverable update for an existing ledger. Defaults to read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parseFireWorkbook}=require('../src/fire-import'),{planFireSections}=require('../src/fire-ledger-sections');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],apply=args.includes('--apply');
 if(!args.includes('--file'))throw Error('Use --file workbook.xlsx; --apply also requires --backup directory');
 const parsed=await parseFireWorkbook(fs.readFileSync(option('--file'))),{pool}=require('../src/db'),F=require('../src/fire-inspection');
 try{return await F.transaction(pool,async db=>{
  const lock=apply?' FOR UPDATE':'';
  const [points]=await db.query('SELECT p.*,a.name AS area_name FROM fire_points p JOIN fire_areas a ON a.id=p.area_id WHERE p.active=1 ORDER BY p.id'+lock);
  const [assets]=await db.query('SELECT a.* FROM fire_assets a JOIN fire_points p ON p.id=a.point_id WHERE a.active=1 AND p.active=1 ORDER BY a.id'+lock);
  const plan=planFireSections(parsed,points,assets);if(plan.errors.length)throw Error(JSON.stringify(plan.errors));
  const summary={fileHash:plan.fileHash,matched:plan.matched,sections:plan.sections,pointsChanged:plan.pointsChanged,assetsChanged:plan.assetsChanged,departmentDifferencesPreserved:plan.departmentDifferences};
  if(!apply)return {status:'dry-run',...summary};
  if(!args.includes('--backup'))throw Error('--backup is required');const backup=path.resolve(option('--backup'));fs.mkdirSync(backup,{recursive:true,mode:0o700});
  const [records]=await db.query('SELECT * FROM fire_records ORDER BY id'),[photos]=await db.query('SELECT id,point_id,asset_id,record_id,issue_id,discarded_at,SHA2(image,256) AS image_hash FROM fire_photos ORDER BY id'),[members]=await db.query('SELECT * FROM fire_members ORDER BY user_id,area_id'),[mappings]=await db.query('SELECT * FROM fire_record_assets ORDER BY cycle_id,asset_id');
  const snapshot={at:new Date().toISOString(),points,assets,records,photos,members,mappings};
  const backupFile=path.join(backup,'fire-data-before.json');if(!fs.existsSync(backupFile))fs.writeFileSync(backupFile,JSON.stringify(snapshot,null,2),{mode:0o600});
  const pointUpdates=new Set();for(const r of plan.updates){if(r.pointChanged&&!pointUpdates.has(r.pointId)){await db.query('UPDATE fire_points SET section_name=?,location=?,name=?,revision=revision+1 WHERE id=?',[r.sectionName,r.location,r.name,r.pointId]);pointUpdates.add(r.pointId)}if(r.sourceChanged)await db.query('UPDATE fire_assets SET source_json=? WHERE id=?',[JSON.stringify(r.source),r.assetId]);}
  const [recordsAfter]=await db.query('SELECT * FROM fire_records ORDER BY id'),[photosAfter]=await db.query('SELECT id,point_id,asset_id,record_id,issue_id,discarded_at,SHA2(image,256) AS image_hash FROM fire_photos ORDER BY id'),[membersAfter]=await db.query('SELECT * FROM fire_members ORDER BY user_id,area_id'),[mappingsAfter]=await db.query('SELECT * FROM fire_record_assets ORDER BY cycle_id,asset_id');
  for(const [a,b]of [[records,recordsAfter],[photos,photosAfter],[members,membersAfter],[mappings,mappingsAfter]])assert.equal(hash(a),hash(b),'inspection evidence or permissions changed');
  const [[actor]]=await db.query("SELECT id FROM app_users WHERE role='admin' AND enabled=1 ORDER BY id LIMIT 1");assert.ok(actor,'No enabled administrator for maintenance audit');
  const receipt={status:'applied',...summary,recordsPreserved:records.length,photosPreserved:photos.length,permissionAndCompletionHashesUnchanged:true};
  if(plan.pointsChanged||plan.assetsChanged)await db.query('INSERT INTO fire_admin_events(actor_id,action,detail_json) VALUES(?,?,?)',[actor.id,'ledger_section_reconciled',JSON.stringify({...receipt,source:'user-authorized maintenance script; not an interactive inspection',backupFile})]);
  fs.writeFileSync(path.join(backup,'fire-reconciliation.json'),JSON.stringify(receipt,null,2),{mode:0o600});return receipt;
 },{serializeImport:true})}finally{await pool.end()}
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={main};

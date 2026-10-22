import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
const archive=path.resolve(process.argv[2] || '')
const data=zlib.gunzipSync(fs.readFileSync(archive)),files=new Map()
let offset=0,paxPath=null,longName=null
const text=b=>b.toString('utf8').replace(/\0.*$/s,'')
while(offset+512<=data.length){
  const h=data.subarray(offset,offset+512);if(h.every(n=>n===0))break
  const size=parseInt(text(h.subarray(124,136)).trim()||'0',8)
  if(!Number.isFinite(size)||size<0)throw new Error('Invalid TAR size')
  const type=text(h.subarray(156,157)),prefix=text(h.subarray(345,500))
  let name=(prefix?prefix+'/':'')+text(h.subarray(0,100))
  const bytes=data.subarray(offset+512,offset+512+size)
  if(type==='x'){
    const match=bytes.toString('utf8').match(/(?:^|\n)\d+ path=([^\n]+)\n/);paxPath=match?.[1]||null
  }else if(type==='L')longName=text(bytes)
  else if(type==='0'||type===''){
    name=paxPath||longName||name;paxPath=null;longName=null
    if(name.split('/').includes('..')||name.startsWith('/'))throw new Error('Unsafe path')
    if(files.has(name))throw new Error('Duplicate TAR file '+name)
    files.set(name,bytes)
  }
  offset+=512+Math.ceil(size/512)*512
}
const manifests=[...files.keys()].filter(n=>/\/SHA256SUMS-V\d+\.\d+\.\d+\.txt$/.test(n))
if(manifests.length!==1)throw new Error('Missing/duplicate checksum manifest')
const folder=manifests[0].split('/')[0],sum=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase()
const archiveHash=sum(fs.readFileSync(archive))
const outerManifest=path.join(path.dirname(archive),path.basename(manifests[0]))
const outerLines=fs.readFileSync(outerManifest,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/)
const archiveEntry=outerLines.map(line=>line.match(/^([A-Fa-f0-9]{64})\s+\*?(.+)$/)).find(match=>match?.[2]===path.basename(archive))
if(!archiveEntry||archiveEntry[1].toUpperCase()!==archiveHash)throw new Error('Outer archive checksum mismatch')
const checks=files.get(manifests[0]).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/)
const androidManifestBytes=files.get(folder+'/app-updates/android/latest.json')
const androidManifest=androidManifestBytes?JSON.parse(androidManifestBytes.toString('utf8')):null
if(androidManifest&&!/^\d+\.\d+\.\d+-android\.\d+$/.test(androidManifest.versionName))throw new Error('Invalid Android release version')
for(const line of checks){
  const match=line.match(/^([A-Fa-f0-9]{64})\s+(.+)$/);if(!match)throw new Error('Bad checksum line')
  const [_,hash,relative]=match,bytes=files.get(folder+'/'+relative)
  if(!bytes||sum(bytes)!==hash.toUpperCase())throw new Error('Hash mismatch '+relative)
  if(relative!=='server/data/ledger-model-catalog.json'&&/(^|\/)(node_modules|uploads|data|\.local|\.env|\.git)(\/|$)|\.log$/i.test(relative))throw new Error('Private/runtime data packaged '+relative)
  const root=path.resolve(path.dirname(archive),'..')
  let local=relative.startsWith('web-dist/')?path.join(root,'spare-parts-web-release/dist',relative.slice(9)):path.join(root,relative)
  if(relative.startsWith('web-runtime/'))local=path.join(root,'spare-parts-web-release',relative.slice(12))
  if(relative.startsWith('plc-agent/'))local=path.join(root,'tools/tia-openness-exporter',relative.slice(10))
  if(relative==='PROJECT_README.md')local=path.join(root,'README.md')
  if(relative==='RELEASE_NOTES.md')local=path.join(root,'spare-parts-web-release/RELEASE_NOTES.md')
  if(/^(DEPLOY_|USER_GUIDE_|QA_)/.test(relative))local=path.join(root,'output',relative)
  if(relative.startsWith('app-updates/android/'))local=path.join(root,'android-app/releases',androidManifest?.versionName||'',relative.slice('app-updates/android/'.length))
  if(/\.(?:jks|keystore|p12|key)$/i.test(relative)||/signing\.local\.json$/i.test(relative))throw new Error('Private signing file packaged '+relative)
  if(fs.existsSync(local)&&sum(fs.readFileSync(local))!==hash.toUpperCase())throw new Error('Source/package drift '+relative)
}
if(files.size!==checks.length+1)throw new Error('Unlisted files in archive')
const models=[...files.keys()].filter(n=>/reference-20260904\/.+\.glb$/.test(n))
const photos=[...files.keys()].filter(n=>/reference-20260904\/.+\.png$/.test(n))
if(models.length!==7||photos.length!==7)throw new Error('Missing reference assets')
const sourceAssetDir=path.resolve(path.dirname(archive),'../spare-parts-web-release/public/models/categories')
for(const file of fs.readdirSync(sourceAssetDir)){
  if(!/\.(glb|jpg)$/.test(file))continue
  const packed=files.get(folder+'/web-dist/models/categories/'+file)
  if(!packed||sum(packed)!==sum(fs.readFileSync(path.join(sourceAssetDir,file))))throw new Error('Missing/stale source model asset '+file)
}
const evidenceRoot=path.resolve(path.dirname(archive),'../spare-parts-web-release/public/models/evidence')
const evidenceManifest=JSON.parse(fs.readFileSync(path.join(evidenceRoot,'manifest.json'),'utf8'))
for(const asset of evidenceManifest){
  const bytes=files.get(folder+'/web-dist/models/evidence/'+asset.file)
  if(!bytes||sum(bytes)!==asset.sha256.toUpperCase()||sum(bytes)!==sum(fs.readFileSync(path.join(evidenceRoot,asset.file))))throw new Error('Missing/stale evidence model '+asset.file)
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid evidence GLB '+asset.file)
}
if(!files.has(folder+'/docs/OPENCLAW_MODEL_MATCHING.md'))throw new Error('Missing model handoff')
for(const [name,bytes] of files){
  if(!name.includes('/server/sql/')||!name.endsWith('.sql'))continue
  for(const match of bytes.toString('utf8').matchAll(/['"](\/models\/[A-Za-z0-9_./-]+\.(?:glb|jpg|png))['"]/g)){
    if(!files.has(folder+'/web-dist'+match[1]))throw new Error('SQL references missing asset '+match[1])
  }
}
if([...files.keys()].some(n=>n.startsWith(folder+'/plc-agent/')||/\/assets\/PlcAnalysis-/.test(n)))throw new Error('Retired PLC analysis packaged')
const catalogFile=files.get(folder+'/server/data/ledger-model-catalog.json')
if(!catalogFile)throw new Error('Missing runtime model catalog')
const ledgerCatalog=JSON.parse(catalogFile.toString('utf8'))
for(const model of [...ledgerCatalog.models, ...(ledgerCatalog.supplements || []).flatMap(batch=>batch.models)]){
  if(!model.modelUrl)continue
  const bytes=files.get(folder+'/web-dist'+model.modelUrl)
  if(!bytes||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Missing/invalid ledger model '+model.id)
}
const deployNames=[...files.keys()].filter(n=>/\/DEPLOY_V\d+\.\d+\.\d+\.md$/.test(n))
if(deployNames.length!==1)throw new Error('Missing/duplicate deployment guide')
if(!files.has(folder+'/README.md'))throw new Error('Missing package README')
const releaseVersion=files.get(folder+'/VERSION')?.toString('utf8').trim()
for(const file of ['server/package.json','web-runtime/package.json'])if('V'+JSON.parse(files.get(folder+'/'+file)).version!==releaseVersion)throw new Error('Package version mismatch '+file)
if(androidManifest){
 const apkName='digital-workbench-'+androidManifest.versionName+'.apk',apk=files.get(folder+'/app-updates/android/'+apkName)
 if(androidManifest.schema!==1||androidManifest.packageName!=='cn.digitalworkbench.mobile'||!Number.isSafeInteger(androidManifest.versionCode)||androidManifest.versionCode<1||androidManifest.minSdk!==26)throw new Error('Invalid Android update metadata')
 if(androidManifest.url!=='https://czsdsg.cn/app-updates/android/'+apkName||!apk||apk.length!==androidManifest.size||sum(apk)!==androidManifest.sha256.toUpperCase())throw new Error('Android update APK mismatch')
 const androidChecks=files.get(folder+'/app-updates/android/SHA256SUMS.txt')?.toString('utf8').trim().split(/\r?\n/)
 if(!androidChecks||androidChecks.length!==2)throw new Error('Missing Android checksum entries')
 for(const line of androidChecks){const m=line.match(/^([a-fA-F0-9]{64})\s+([^/\\]+)$/);if(!m||!files.has(folder+'/app-updates/android/'+m[2])||sum(files.get(folder+'/app-updates/android/'+m[2]))!==m[1].toUpperCase())throw new Error('Android checksum mismatch')}
 for(const doc of ['README.md','VALIDATION.md'])if(!files.has(folder+'/android-app/'+doc))throw new Error('Missing Android guide '+doc)
 console.log('Android APK, update metadata, checksums and release source verified')
}
const retiredWork=files.has(folder+'/docs/RETIRED_FEATURES_20261018.md')
if(retiredWork){
 const forbidden=/\/server\/(?:src\/(?:routes\/(?:work|plc|plc-agent)\.js|work-(?!storage)[^/]+\.js|plc-[^/]+\.js|production-report-export\.js|category-model-matching\.js)|sql\/migration_(?:work_(?:assessment|flow|documents|score_jobs|teams)|plc_|program_analysis_|remove_procurement_suppliers_|v1_5_0\.sql))|\/web-dist\/assets\/(?:WorkAssessment|PlcAnalysis)-|\/plc-agent\//;
 for(const name of files.keys())if(forbidden.test(name))throw new Error('Retired implementation packaged '+name);
 const app=files.get(folder+'/server/src/app.js').toString('utf8'),db=files.get(folder+'/server/src/db.js').toString('utf8');
 if(/routes\/(?:work|plc(?:-agent)?)['"]|work-score-scheduler/.test(app)||/migration_work_|work-score-scheduler|plc_projects/.test(db))throw new Error('Retired feature startup remains');
 for(const required of ['server/src/calendar-date.js','docs/RETIRED_FEATURES_20261018.md'])if(!files.has(folder+'/'+required))throw new Error('Missing cleanup release file '+required);
}
if(files.has(folder+'/docs/RELEASE_AUDIT_20261018.md')){
 for(const required of ['server/src/knowledge-usage.js','server/src/robot-usage.js','server/src/ai-call-audit.js','server/src/personal-usage.js','server/src/codex-usage.js','server/src/hunyuan-usage.js','server/src/routes/personal-usage.js','server/src/routes/ai-call-logs.js','docs/KNOWLEDGE_AGENT_REVIEW_20261018.md','docs/ACCOUNT_STORAGE_REVIEW_20261018.md','docs/TOOLBAR_CLEANUP_REVIEW_20261018.md','docs/UI_SIMPLIFICATION_20261018.md'])if(!files.has(folder+'/'+required))throw new Error('Missing current AI/admin release file '+required);
 for(const name of files.keys())if(/(?:^|\/)(?:project\.private\.config\.json|\.env(?:\..+)?|[^/]*dify[^/]*|[^/]*credentials?[^/]*\.(?:csv|json)|[^/]+\.pem)$/i.test(name)&&!name.endsWith('/server/.env.example'))throw new Error('Private/retired file packaged '+name);
 for(const page of ['Account','Knowledge','RobotProgram'])if(![...files.keys()].some(n=>n.includes('/web-dist/assets/'+page+'-')&&n.endsWith('.js')))throw new Error('Missing compiled current page '+page);
 const deps=JSON.parse(files.get(folder+'/server/package.json'));
 if(Object.keys(deps.scripts||{}).some(n=>n.includes('dify')||n==='export:knowledge'))throw new Error('Retired Dify export command remains');
 const robot=files.get(folder+'/server/src/robot-agent.js').toString('utf8');
 if(/ROBOT_AGENT_API_URL|ROBOT_AGENT_ID|OPENCLAW_GATEWAY_TOKEN/.test(robot))throw new Error('Retired robot OpenClaw connection remains');
}
const miniApp=JSON.parse(files.get(folder+'/miniprogram/app.json')?.toString('utf8')||'{}')
for(const page of [...(miniApp.pages||[]),...(miniApp.subPackages||miniApp.subpackages||[]).flatMap(p=>p.pages.map(page=>p.root+'/'+page))]){
 for(const extension of ['js','json','wxml','wxss'])if(!files.has(folder+'/miniprogram/'+page+'.'+extension))throw new Error('Missing registered mini page file '+page+'.'+extension)
}
if(files.has(folder+'/miniprogram/pages/webview/webview.js')){
 if(!miniApp.pages.includes('pages/webview/webview'))throw new Error('Shared web view must be registered in main package')
 if([...files.keys()].some(n=>n.startsWith(folder+'/miniprogram/packages/work/pages/web/')))throw new Error('Obsolete subpackage web view remains')
}
if(['V1.9.0','V1.9.1','V1.9.2','V1.9.3','V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
  if(!retiredWork){
  for(const required of ['server/src/routes/work.js','server/src/work-assessment.js','server/src/work-export.js','server/sql/migration_work_assessment_20260923.sql']){
    if(!files.has(folder+'/'+required))throw new Error('Missing work-assessment release file '+required)
  }
  if(![...files.keys()].some(n=>/\/web-dist\/assets\/WorkAssessment-[^/]+\.js$/.test(n)))throw new Error('Missing compiled work-assessment page')
  if(!files.get(folder+'/server/src/app.js').toString('utf8').includes("app.use('/api/work'"))throw new Error('Work routes not mounted')
  if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_assessment_20260923.sql'))throw new Error('Missing incremental schema startup')
  if(['V1.9.2','V1.9.3','V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
    for(const required of ['server/src/work-duties.js','server/src/production-report-export.js'])if(!files.has(folder+'/'+required))throw new Error('Missing cadence/production-report implementation '+required)
    if(!files.get(folder+'/server/package.json').toString('utf8').includes('"docx"'))throw new Error('Missing Word export dependency')
    if(!files.get(folder+'/server/src/routes/work.js').toString('utf8').includes("/records/:id/production-report"))throw new Error('Missing production report export route')
  }
  if(['V1.9.3','V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
    const route=files.get(folder+'/server/src/routes/work.js').toString('utf8')
    if(!route.includes("router.post('/suggest'")||!route.includes('ai_suggested'))throw new Error('Missing local OpenClaw scoring suggestion route')
    const page=[...files.entries()].find(([name])=>/\/web-dist\/assets\/WorkAssessment-[^/]+\.js$/.test(name))?.[1]?.toString('utf8')||''
    if(!page.includes(['V1.9.9','V1.9.10'].includes(releaseVersion)?'本周考评':['V1.9.7','V1.9.8'].includes(releaseVersion)?'履职统计':'岗位任职职责评分智能体'))throw new Error('Missing role-duty scoring interface')
  }
  }
  if(['V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)&&files.has(folder+'/server/src/routes/inspection-notices.js')){
    for(const required of ['server/src/routes/inspection-notices.js','server/src/inspection-notice.js','server/src/inspection-vision.js','server/src/inspection-export.js','server/sql/migration_inspection_notice_20260924.sql','docs/LOCAL_AUDIT_REMEDIATION_20260924.md',`QA_${releaseVersion}.md`])if(!files.has(folder+'/'+required))throw new Error('Missing audit/inspection release file '+required)
    const app=files.get(folder+'/server/src/app.js').toString('utf8')
    const db=files.get(folder+'/server/src/db.js').toString('utf8')
    if(!app.includes("/api/inspection-notices")||!db.includes('migration_inspection_notice_20260924.sql'))throw new Error('Inspection routes/schema not mounted')
    const inspectionAsset = ['V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion) ? /\/web-dist\/assets\/InspectionNoticeAccess-[^/]+\.js$/ : /\/web-dist\/assets\/InspectionNotices-[^/]+\.js$/
    if(![...files.keys()].some(n=>inspectionAsset.test(n)))throw new Error('Missing compiled inspection page')
    if(!files.get(folder+'/server/src/routes/work.js').toString('utf8').includes("router.post('/reviewers'"))throw new Error('Missing staff reviewer authorization')
  }
  // Older rollback packages retain their original feature checks above.
  if(releaseVersion==='V1.9.10'&&!files.has(folder+'/server/src/routes/inspection-notices.js')){
    const app=files.get(folder+'/server/src/app.js').toString('utf8');
    const db=files.get(folder+'/server/src/db.js').toString('utf8');
    if(app.includes('/api/inspection-notices')||db.includes('migration_inspection_notice_20260924.sql'))throw new Error('Retired inspection feature still mounted');
    if([...files.keys()].some(n=>/\/web-dist\/assets\/InspectionNotice/.test(n)))throw new Error('Retired compiled inspection page remains');
  }
  if(['V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
    for(const required of ['server/src/staff-identity.js','server/sql/migration_staff_identity_20260924.sql','miniprogram/pages/home/home.wxml','miniprogram/pages/home/home.wxss','miniprogram/pages/detail/detail.wxss','project.config.json','design-qa.md',`USER_GUIDE_${releaseVersion}.md`])if(!files.has(folder+'/'+required))throw new Error('Missing '+releaseVersion+' file '+required)
    const home=files.get(folder+'/miniprogram/pages/home/home.wxml').toString('utf8')
    const homeStyle=files.get(folder+'/miniprogram/pages/home/home.wxss').toString('utf8')
    if(!home.includes('dashboard-caption')||!homeStyle.includes('flex: 0 0 112rpx'))throw new Error('Missing right-aligned mini refresh layout')
    const guide=files.get(folder+`/DEPLOY_${releaseVersion}.md`).toString('utf8')
    if(!guide.includes('重新编译')||!guide.includes('上传发布'))throw new Error('Missing mini-program publication steps')
    if(releaseVersion==='V1.9.6'&&!guide.includes('不能再有独立「检查通报」项'))throw new Error('Missing work menu verification step')
  }
  for(const name of ['server/package.json','web-runtime/package.json'])if(JSON.parse(files.get(folder+'/'+name)).version!==releaseVersion.slice(1))throw new Error('Release version mismatch '+name)
}
if(!retiredWork&&['V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)&&!files.has(folder+'/server/sql/migration_work_teams_20260928.sql'))throw new Error('Missing team schema');

if(!retiredWork&&['V1.9.9','V1.9.10'].includes(releaseVersion)){
 for(const required of ['server/sql/migration_work_flow_20260929.sql','server/sql/migration_work_documents_20260930.sql','server/src/work-monthly.js','server/src/work-flow.js','docs/WORK_FLOW_V1.9.9.md','docs/PROJECT_REVIEW_SECURITY_20260930.md'])if(!files.has(folder+'/'+required))throw new Error('Missing current release file '+required)
 if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_flow_20260929.sql'))throw new Error('Missing flow schema startup')
 if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_documents_20260930.sql'))throw new Error('Missing document binding schema startup')
}
const deployGuide=files.get(deployNames[0]).toString('utf8')
if(files.has(folder+'/server/src/raw-staff-access.js')){
 const app=files.get(folder+'/server/src/app.js').toString('utf8')
 const guard=app.indexOf("app.use('/api', require('./raw-staff-access').enforceRawEmployeeAccess)")
 // The early authenticated JSON size parser is not the business router mount.
 const work=app.indexOf(retiredWork?"app.use('/api/raw-duties', require('./routes/raw-duties')":"app.use('/api/work',")
 if(guard<0||work<0||guard>work)throw new Error('Raw employee guard must precede business routes')
 for(const required of ['server/src/staff-identity.js','server/src/attendance-access.js','miniprogram/services/auth.js','miniprogram/services/work-features.js','miniprogram/pages/users/users.js']){
  if(!files.has(folder+'/'+required))throw new Error('Missing raw staff permission file '+required)
 }
 if(!files.get(folder+'/miniprogram/pages/users/users.js').toString('utf8').includes("name:'工段长'"))throw new Error('Missing raw-grain foreman position selector')
 if(!deployGuide.includes('员工')||!deployGuide.includes('无需 SQL 迁移'))throw new Error('Missing raw staff deployment instructions')
}
if(files.get(folder+'/server/src/app.js')?.toString('utf8').includes("'/api/robot-program'")){
 for(const required of ['server/src/routes/robot-program.js','server/src/robot-backup.js','server/src/robot-backup-export.js','server/src/robot-agent.js','server/src/robot-library.js','docs/ROBOT_PROGRAM_AGENT.md'])if(!files.has(folder+'/'+required))throw new Error('Missing robot assistant release file '+required)
 if(![...files.keys()].some(n=>/\/web-dist\/assets\/RobotProgram-[^/]+\.js$/.test(n)))throw new Error('Missing compiled robot assistant')
 const deps=JSON.parse(files.get(folder+'/server/package.json')).dependencies
 for(const dep of ['yauzl','iconv-lite'])if(!deps[dep])throw new Error('Missing robot ZIP/encoding dependency '+dep)
 const route=files.get(folder+'/server/src/routes/robot-program.js').toString('utf8')
 if(!route.includes("router.patch('/library/:id'")||!route.includes("req.user.role==='admin'"))throw new Error('Missing robot library rename or admin write boundary')
 if(!deployGuide.includes('ROBOT_LIBRARY_DIR')||!deployGuide.includes('ROBOT_AGENT_ENABLED'))throw new Error('Missing robot deployment/storage instructions')
}
if(!retiredWork&&['V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
  for(const required of ['server/src/work-score-scheduler.js','server/src/work-statistics.js','server/sql/migration_work_score_jobs_20260928.sql','docs/WORK_ASSESSMENT_V1.9.7.md'])if(!files.has(folder+'/'+required))throw new Error('Missing weekly work release file '+required)
  if(!files.get(folder+'/server/src/routes/work.js').toString('utf8').includes("'/week-statistics'"))throw new Error('Missing weekly statistics endpoint')
  if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_score_jobs_20260928.sql'))throw new Error('Missing scheduled scoring schema startup')
}
for(const file of ['server.js','package.json','package-lock.json'])if(!files.has(folder+'/web-runtime/'+file))throw new Error('Missing web runtime '+file)
if(!deployGuide.includes('web-dist/')||!deployGuide.includes('/opt/spare-parts/web/dist/')||!deployGuide.includes('test -f /opt/spare-parts/web/dist/index.html'))throw new Error('Deployment guide must name the web dist source, target, and preflight check')
if(files.has(folder+'/server/src/raw-duties.js')){
 const miniServiceRoot=files.has(folder+'/miniprogram/packages/work/services/raw-duties.js')?'miniprogram/packages/work/services':'miniprogram/services'
 for(const required of ['server/src/routes/raw-duties.js','server/src/raw-duty-store.js','server/src/raw-duty-progress.js','server/src/raw-duty-export.js','server/sql/migration_raw_duties_20261015.sql',miniServiceRoot+'/raw-duties.js',miniServiceRoot+'/raw-duty-progress.js','miniprogram/packages/work/pages/home/home.js','miniprogram/packages/work/pages/detail/detail.js'])if(!files.has(folder+'/'+required))throw new Error('Missing raw duty release file '+required)
 if(miniServiceRoot==='miniprogram/packages/work/services'){
  for(const name of ['raw-duties','raw-duty-progress','raw-duty-cadence-summary','raw-duty-week-table']){
   if(!files.has(folder+'/'+miniServiceRoot+'/'+name+'.js'))throw new Error('Missing subpackage helper '+name)
   if(files.has(folder+'/miniprogram/services/'+name+'.js'))throw new Error('Subpackage-only helper duplicated in main package '+name)
  }
 }
 if(![...files.keys()].some(n=>/\/web-dist\/assets\/RawDuties-[^/]+\.js$/.test(n)))throw new Error('Missing compiled raw duty page')
 const app=files.get(folder+'/server/src/app.js').toString('utf8'),db=files.get(folder+'/server/src/db.js').toString('utf8')
 if(!app.includes("'/api/raw-duties'")||!db.includes('migration_raw_duties_20261015.sql'))throw new Error('Missing raw duty route/migration')
 const mini=JSON.parse(files.get(folder+'/miniprogram/app.json'))
 if(!(mini.subPackages||mini.subpackages||[]).some(p=>p.root==='packages/work'))throw new Error('Raw duty mini-program package not registered')
}

if(releaseVersion==='V1.9.10'){
 for(const required of ['server/src/attendance-analysis.js','server/src/attendance-workbook.js','server/src/routes/attendance.js','server/src/routes/work-storage.js','server/src/work-storage.js','server/src/warehouse-areas.js','server/sql/migration_attendance_storage_20261009.sql','docs/ATTENDANCE_REVIEW_20261009.md'])if(!files.has(folder+'/'+required))throw new Error('Missing combined release file '+required)
 for(const page of ['AttendanceReview','WorkStorage']){
  const standalone=[...files.keys()].some(n=>n.includes('/web-dist/assets/'+page+'-')&&n.endsWith('.js'));
  // Storage now lives in Account and is statically bundled with that page.
  const embedded=page==='WorkStorage'&&files.has(folder+'/docs/RELEASE_AUDIT_20261018.md')&&[...files].some(([name,bytes])=>/\/web-dist\/assets\/Account-[^/]+\.js$/.test(name)&&['资料管理','一键清理'].every(label=>bytes.toString('utf8').includes(label)));
  if(!standalone&&!embedded)throw new Error('Missing compiled '+page);
 }
 const app=files.get(folder+'/server/src/app.js').toString('utf8'),db=files.get(folder+'/server/src/db.js').toString('utf8')
 if(!app.includes("'/api/attendance'")||!app.includes("'/api/work-storage'")||!db.includes('migration_attendance_storage_20261009.sql'))throw new Error('Work center routes/schema not mounted')
 if((ledgerCatalog.supplements||[]).find(batch=>batch.version==='missing-five-20261009-v1')?.models.length!==5)throw new Error('Missing five supplemental models')
 if((ledgerCatalog.supplements||[]).find(batch=>batch.version==='pending-ledger-20261009-v1')?.models.length!==131)throw new Error('Missing pending ledger models')
 if(ledgerCatalog.supplements.find(batch=>batch.version==='pending-ledger-20261009-v1').bindByCode!==false)throw new Error('Per-code batch must preserve named bindings')
 if(ledgerCatalog.assetUpdates?.find(batch=>batch.version==='named-model-assets-20261009-v1')?.models.length!==11)throw new Error('Missing named placeholder assets')
 console.log('Work center routes, migration, pages and five supplemental models verified')
}
console.log(JSON.stringify({archive,files:files.size,referenceModels:models.length,referencePhotos:photos.length,categoryModels:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.glb')).length,categoryPhotos:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.jpg')).length,sha256:archiveHash,outerChecksumVerified:true,result:'all hashes and current sources match'},null,2))

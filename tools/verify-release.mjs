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
if(['V1.9.0','V1.9.1','V1.9.2','V1.9.3','V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
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
  if(['V1.9.4','V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
    for(const required of ['server/src/routes/inspection-notices.js','server/src/inspection-notice.js','server/src/inspection-vision.js','server/src/inspection-export.js','server/sql/migration_inspection_notice_20260924.sql','docs/LOCAL_AUDIT_REMEDIATION_20260924.md',`QA_${releaseVersion}.md`])if(!files.has(folder+'/'+required))throw new Error('Missing audit/inspection release file '+required)
    const app=files.get(folder+'/server/src/app.js').toString('utf8')
    const db=files.get(folder+'/server/src/db.js').toString('utf8')
    if(!app.includes("/api/inspection-notices")||!db.includes('migration_inspection_notice_20260924.sql'))throw new Error('Inspection routes/schema not mounted')
    const inspectionAsset = ['V1.9.5','V1.9.6','V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion) ? /\/web-dist\/assets\/InspectionNoticeAccess-[^/]+\.js$/ : /\/web-dist\/assets\/InspectionNotices-[^/]+\.js$/
    if(![...files.keys()].some(n=>inspectionAsset.test(n)))throw new Error('Missing compiled inspection page')
    if(!files.get(folder+'/server/src/routes/work.js').toString('utf8').includes("router.post('/reviewers'"))throw new Error('Missing staff reviewer authorization')
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
if(['V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)&&!files.has(folder+'/server/sql/migration_work_teams_20260928.sql'))throw new Error('Missing team schema');

if(['V1.9.9','V1.9.10'].includes(releaseVersion)){
 for(const required of ['server/sql/migration_work_flow_20260929.sql','server/sql/migration_work_documents_20260930.sql','server/src/work-monthly.js','server/src/work-flow.js','docs/WORK_FLOW_V1.9.9.md','docs/PROJECT_REVIEW_SECURITY_20260930.md'])if(!files.has(folder+'/'+required))throw new Error('Missing current release file '+required)
 if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_flow_20260929.sql'))throw new Error('Missing flow schema startup')
 if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_documents_20260930.sql'))throw new Error('Missing document binding schema startup')
}
const deployGuide=files.get(deployNames[0]).toString('utf8')
if(['V1.9.7','V1.9.8','V1.9.9','V1.9.10'].includes(releaseVersion)){
  for(const required of ['server/src/work-score-scheduler.js','server/src/work-statistics.js','server/sql/migration_work_score_jobs_20260928.sql','docs/WORK_ASSESSMENT_V1.9.7.md'])if(!files.has(folder+'/'+required))throw new Error('Missing weekly work release file '+required)
  if(!files.get(folder+'/server/src/routes/work.js').toString('utf8').includes("'/week-statistics'"))throw new Error('Missing weekly statistics endpoint')
  if(!files.get(folder+'/server/src/db.js').toString('utf8').includes('migration_work_score_jobs_20260928.sql'))throw new Error('Missing scheduled scoring schema startup')
}
for(const file of ['server.js','package.json','package-lock.json'])if(!files.has(folder+'/web-runtime/'+file))throw new Error('Missing web runtime '+file)
if(!deployGuide.includes('web-dist/')||!deployGuide.includes('/opt/spare-parts/web/dist/')||!deployGuide.includes('test -f /opt/spare-parts/web/dist/index.html'))throw new Error('Deployment guide must name the web dist source, target, and preflight check')
console.log(JSON.stringify({archive,files:files.size,referenceModels:models.length,referencePhotos:photos.length,categoryModels:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.glb')).length,categoryPhotos:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.jpg')).length,sha256:archiveHash,outerChecksumVerified:true,result:'all hashes and current sources match'},null,2))

if(releaseVersion==='V1.9.10'){
 for(const required of ['server/src/attendance-analysis.js','server/src/attendance-workbook.js','server/src/routes/attendance.js','server/src/routes/work-storage.js','server/src/work-storage.js','server/src/warehouse-areas.js','server/sql/migration_attendance_storage_20261009.sql','docs/ATTENDANCE_REVIEW_20261009.md'])if(!files.has(folder+'/'+required))throw new Error('Missing combined release file '+required)
 for(const page of ['AttendanceReview','WorkStorage'])if(![...files.keys()].some(n=>n.includes('/web-dist/assets/'+page+'-')&&n.endsWith('.js')))throw new Error('Missing compiled '+page)
 const app=files.get(folder+'/server/src/app.js').toString('utf8'),db=files.get(folder+'/server/src/db.js').toString('utf8')
 if(!app.includes("'/api/attendance'")||!app.includes("'/api/work-storage'")||!db.includes('migration_attendance_storage_20261009.sql'))throw new Error('Work center routes/schema not mounted')
 if((ledgerCatalog.supplements||[]).flatMap(batch=>batch.models).length!==5)throw new Error('Missing five supplemental models')
 console.log('Work center routes, migration, pages and five supplemental models verified')
}

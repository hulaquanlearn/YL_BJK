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
  if(/(^|\/)(node_modules|uploads|data|\.local|\.env|\.git)(\/|$)|\.log$/i.test(relative))throw new Error('Private/runtime data packaged '+relative)
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
if(!files.has(folder+'/plc-agent/Start-ProgramAnalysisAgent.ps1'))throw new Error('Missing updated PLC agent')
const deployNames=[...files.keys()].filter(n=>/\/DEPLOY_V\d+\.\d+\.\d+\.md$/.test(n))
if(deployNames.length!==1)throw new Error('Missing/duplicate deployment guide')
if(!files.has(folder+'/README.md'))throw new Error('Missing package README')
const deployGuide=files.get(deployNames[0]).toString('utf8')
for(const file of ['server.js','package.json','package-lock.json'])if(!files.has(folder+'/web-runtime/'+file))throw new Error('Missing web runtime '+file)
if(!deployGuide.includes('web-dist/ /opt/spare-parts/web/dist/')||!deployGuide.includes('test -f /opt/spare-parts/web/dist/index.html'))throw new Error('Deployment guide must name the web dist target and preflight check')
console.log(JSON.stringify({archive,files:files.size,referenceModels:models.length,referencePhotos:photos.length,categoryModels:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.glb')).length,categoryPhotos:fs.readdirSync(sourceAssetDir).filter(n=>n.endsWith('.jpg')).length,sha256:archiveHash,outerChecksumVerified:true,result:'all hashes and current sources match'},null,2))

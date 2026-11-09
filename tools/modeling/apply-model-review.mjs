import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
import {GLTFExporter} from '../../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
import {createReviewedGeometry} from './reviewed-geometry.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),publicRoot=path.join(root,'spare-parts-web-release/public'),backup=path.join(root,'.local/model-repair-20261023/original')
const plan=JSON.parse(await fs.readFile(new URL('./model-review-plan-20261023.json',import.meta.url),'utf8'))
const sha=b=>createHash('sha256').update(b).digest('hex')
globalThis.FileReader??=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}}
function annotate(bytes,groups){
 const oldJsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+oldJsonLength).toString()),nodes=[]
 function visit(i){const n=doc.nodes[i];if(n.mesh!==undefined)nodes.push(n);for(const c of n.children||[])visit(c)}
 for(const i of doc.scenes[doc.scene||0].nodes)visit(i)
 if(groups.flatMap(p=>p.indices).length!==nodes.length)throw Error('Legacy partition mismatch')
 for(const group of groups)for(const i of group.indices){const n=nodes[i];if(!n)throw Error('Unknown mesh index');n.name=group.name;n.extras={...n.extras,observation:{schema:1,id:group.id,name:group.name,description:group.description}}}
 const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded)
 const bin=bytes.subarray(20+oldJsonLength),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+padded.length+bin.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16)
 return Buffer.concat([header,padded,bin])
}
const manifest=[]
for(const row of plan.models){
 const file=path.resolve(publicRoot,'.'+row.url)
 if(!file.startsWith(publicRoot+path.sep)||!row.url.startsWith('/models/'))throw Error('Unsafe model path')
 let old;try{old=await fs.readFile(file)}catch(e){if(e.code!=='ENOENT'||row.originalSha256)throw e}
 if(old && row.originalSha256 && ['rebuilt','annotated'].includes(row.status)){
  const copy=path.resolve(backup,'.'+row.url);await fs.mkdir(path.dirname(copy),{recursive:true})
  try{const original=await fs.readFile(copy);if(sha(original)!==row.originalSha256)throw Error('Rollback hash mismatch '+row.url)}
  catch(e){if(e.code!=='ENOENT')throw e;if(row.originalSha256&&sha(old)!==row.originalSha256)throw Error('Source changed since review '+row.url);await fs.writeFile(copy,old)}
 }
 let bytes=old
 if(row.status==='rebuilt'){
  const g=createReviewedGeometry(row.spec),scene=new T.Scene();scene.add(g);scene.userData={reviewRevision:plan.revision,quality:'外观示意'}
  if(row.originalSha256){const original=await fs.readFile(path.resolve(backup,'.'+row.url)),doc=JSON.parse(original.subarray(20,20+original.readUInt32LE(12)).toString()),node=doc.nodes[doc.scenes[doc.scene||0].nodes[0]];g.name=node.name||'';g.userData={...node.extras,...g.userData}}
  g.traverse(n=>{const normals=n.geometry?.attributes.normal;if(normals)for(let i=0;i<normals.count;i++){const v=new T.Vector3().fromBufferAttribute(normals,i);if(v.lengthSq()<1e-10)v.set(0,1,0);v.normalize();normals.setXYZ(i,v.x,v.y,v.z)}})
  bytes=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}));g.traverse(n=>{n.geometry?.dispose();[].concat(n.material||[]).forEach(m=>m.dispose())})
 }else if(row.status==='annotated')bytes=annotate(old,row.groups)
 if(!bytes)throw Error('Missing model '+row.url)
 if(bytes!==old){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes)}
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),parts=new Map()
 for(const n of doc.nodes||[])if(n.extras?.observation){const p=n.extras.observation;parts.set(p.id,p.name)}
 manifest.push({id:row.id,url:row.url,...row.aliases?{aliases:row.aliases}:{},sha256:sha(bytes),meshCount:doc.meshes.length,status:row.status,partCount:parts.size,note:row.note,...row.source?{source:row.source}:{}})
}
await fs.writeFile(path.join(root,'spare-parts-web-release/src/utils/reviewed-model-catalog.json'),JSON.stringify({revision:plan.revision,models:manifest},null,2)+'\n')
console.log(JSON.stringify(manifest.reduce((s,m)=>(s[m.status]=(s[m.status]||0)+1,s),{})))


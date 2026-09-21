import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
import { evidenceModels } from '../../spare-parts-web-release/src/utils/evidence-models.mjs'

globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) { this.result=await blob.arrayBuffer(); this.onloadend?.() }
  async readAsDataURL(blob) { this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.() }
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const output=path.join(root,'spare-parts-web-release/public/models/evidence')
await fs.mkdir(output,{recursive:true})
const material=(color,metalness=0,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness})
const silver=material(0xaeb3b7,.72,.34), black=material(0x22272c), screw=material(0xc6ccce,.8,.25), green=material(0x2baf6f)

function powerSupply(item,detailed) {
  const group=new T.Group()
  const box=(name,w,h,d,x,y,z,mat=silver)=>{
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat); mesh.name=name;mesh.position.set(x,y,z);group.add(mesh);return mesh
  }
  // mm converted to glTF metres. The known outline includes all hardware.
  const s=.001
  const {width,height,depth}=item.dimensionsMm
  const front=depth/2, rear=-depth/2, wide=item.id.includes('480')
  box('metal-enclosure',(width-2)*s,(height-4.2)*s,(depth-5.5)*s,0,63*s,0)
  box('front-panel',width*s,height*s,1.4*s,0,height/2*s,(front-2.05)*s)
  box('din-rail-latch',18*s,45*s,3.1*s,0,40*s,(rear+1.55)*s,black)
  for(const [count,y] of [[4,116],[3,8]]) {
    const x=wide?(count===4?-20:10):-4
    box('terminal-block',count*6.2*s,11*s,2.7*s,x*s,y*s,(front-1.45)*s,black)
    if(detailed) for(let i=0;i<count;i++) {
      const m=new T.Mesh(new T.CylinderGeometry(2.1*s,2.1*s,1*s,12),screw)
      m.rotation.x=Math.PI/2;m.position.set((x+(i-(count-1)/2)*6.2)*s,y*s,(front-.5)*s);group.add(m)
      box('screw-slot',2.6*s,.45*s,.2*s,m.position.x,m.position.y,(front-.1)*s,black)
    }
  }
  if(detailed) {
    // Appearance approximations: no hole pitch or terminal dimensions asserted.
    for(const y of [2.1,123.5]) for(let x=-width/2+6;x<=width/2-6;x+=6.2) for(let z=rear+10;z<=front-10;z+=7) {
      const hole=new T.Mesh(new T.CylinderGeometry(2.3*s,2.3*s,.25*s,6),black)
      hole.position.set(x*s,y*s,z*s);group.add(hole)
    }
    box('dc-ok',2*s,2*s,.3*s,(wide?-30:20)*s,(wide?38:90)*s,(front-1.05)*s,green)
    box('voltage-adjust',3*s,3*s,.3*s,(wide?-30:20)*s,(wide?30:99)*s,(front-1.05)*s,black)
  }
  return group
}
const manifest=[]
function bearing(item,detailed) {
  const group=new T.Group(), inner=item.boreMm/2000, outer=item.dimensionsMm.width/2000, half=item.dimensionsMm.depth/2000
  const ring=(ri,ro,depth,z,mat)=>{
    const b=.0003,h=depth/2
    const profile=[[ri+b,-h],[ro-b,-h],[ro,-h+b],[ro,h-b],[ro-b,h],[ri+b,h],[ri,h-b],[ri,-h+b],[ri+b,-h]]
    const mesh=new T.Mesh(new T.LatheGeometry(profile.map(v=>new T.Vector2(...v)),detailed?64:16),mat)
    mesh.rotation.x=Math.PI/2;mesh.position.set(0,outer,z);group.add(mesh)
  }
  if(!detailed && item.seal!=='open') ring(inner,outer,half*2,0,silver)
  else {
    const wall=(outer-inner)*.3
    ring(inner,inner+wall,half*2,0,screw)
    ring(outer-wall,outer,half*2,0,screw)
    if(item.seal==='open') {
      const orbit=(inner+outer)/2
      const ballGeometry=new T.SphereGeometry((outer-inner)*.21,detailed?16:8,detailed?10:6)
      for(let i=0;i<10;i++) {
        const a=i*Math.PI*2/10
        const ball=new T.Mesh(ballGeometry,screw)
        ball.position.set(Math.cos(a)*orbit,outer+Math.sin(a)*orbit,0);group.add(ball)
      }
    } else for(const side of [-1,1]) ring(inner+wall,outer-wall,.0009,side*(half-.0008),item.seal==='rubber'?black:silver)
  }
  return group
}
for(const item of evidenceModels) for(const level of ['low','detail']) {
  if(!['meanwell-ndr-240-24','meanwell-ndr-480-24','skf-6006-2z','skf-6003-2rsh','skf-61802'].includes(item.id)) throw new Error('Missing reviewed generator: '+item.id)
  const scene=new T.Scene();scene.add(item.boreMm?bearing(item,level==='detail'):powerSupply(item,level==='detail'))
  scene.userData={product:item.model,quality:item.quality,note:item.note,source:item.sourceUrl,sourcePage:item.sourcePage,units:'metre',level}
  const data=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}))
  const file=`${item.id}-${level}.glb`
  await fs.writeFile(path.join(output,file),data)
  let triangles=0;scene.traverse(n=>{if(n.geometry) triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3})
  manifest.push({id:item.id,level,file,bytes:data.length,triangles,sha256:createHash('sha256').update(data).digest('hex')})
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2))
console.log(JSON.stringify(manifest,null,2))

import fs from 'node:fs/promises'
import * as T from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
import { shape } from './generate-ledger-models.mjs'
const root=new URL('../',import.meta.url)
const catalogPath=new URL('server/data/ledger-model-catalog.json',root)
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'))
const ledger=JSON.parse(await fs.readFile(new URL('server/data/original-workshop-spare-parts.v2.json',root),'utf8'))
const out=new URL('spare-parts-web-release/public/models/pending-20261009/',root)
await fs.mkdir(out,{recursive:true})
const exporter=new GLTFExporter(), models=[]
for(const part of ledger.records){
  const text=part.materialDesc, code=part.materialCode
  let previousModelName, kind
  if(/分布式IO/i.test(text)){previousModelName='分布式IO';kind='module'}
  else if(/液压.*纠偏/.test(text)){previousModelName='液压纠偏装置';kind='hydraulic'}
  else if(/减速机/.test(text)){
    previousModelName=/联轴器/.test(text)?'减速机（带联轴器）':/电机/.test(text)?'减速机（带电机）':'减速机';kind='reducer'
  }else if(/气缸/.test(text)){previousModelName='标准气缸';kind='cylinder'}
  else if(/轴承座/.test(text)){previousModelName=/含轴承|含222|含定位/.test(text)?'轴承座（含轴承）':'轴承座';kind='housing'}
  else if(/带座.*轴承|带座轴承/.test(text)){
    previousModelName=/不锈钢/.test(text)?'不锈钢带座轴承':/外球面/.test(text)?'带座外球面轴承':'带座轴承';kind='housing'
  }else continue
  if(kind==='housing' && /UCFL|UCF\d|方形座|方形底|方形座|方底座|法兰/i.test(text))kind='flange-bearing'
  let group
  if(kind==='hydraulic'){
    group=new T.Group()
    const material=new T.MeshStandardMaterial({color:0x8a9ba8,metalness:.6,roughness:.5})
    for(const [w,h,d,x,y,z] of [[1,.12,.55,0,.06,0],[.18,.18,.6,-.4,.25,0],[.18,.18,.6,.4,.25,0],[.65,.17,.17,0,.3,0],[.4,.055,.055,.5,.3,0]]){
      const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m)
    }
  }else group=shape(kind,text.replace(/含院南防爆电机|含电机/g,'带电机').replace(/含联轴器/g,'带联轴器'))
  group.userData={materialCode:code,sourceDescription:text,quality:'外观示意',manufacturerCAD:false}
  const scene=new T.Scene();scene.add(group)
  await fs.writeFile(new URL(code+'.glb',out),Buffer.from(await exporter.parseAsync(scene,{binary:true})))
  const previousModelNames=kind==='housing'||kind==='flange-bearing'
    ? ['带座外球面轴承','带座轴承','不锈钢带座轴承','轴承座','轴承座（含轴承）']
    : kind==='reducer'?['减速机','减速机（带电机）','减速机（带联轴器）']:[previousModelName]
  models.push({materialCode:code,previousModelName,previousModelNames,name:`${code} · ${text}`.slice(0,80),modelUrl:`/models/pending-20261009/${code}.glb`,quality:'外观示意',description:`台账：${text}。独立外形识别示意；尺寸、孔位和内部结构未核实，不用于安装校核。`.slice(0,500)})
}
const version='pending-ledger-20261009-v1'
catalog.supplements=(catalog.supplements||[]).filter(b=>b.version!==version)
catalog.supplements.push({version,bindByCode:false,models})
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n')
console.log(JSON.stringify({generated:models.length,byCategory:models.reduce((a,m)=>(a[m.previousModelName]=(a[m.previousModelName]||0)+1,a),{})},null,2))

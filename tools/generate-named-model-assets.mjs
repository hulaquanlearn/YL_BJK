// Shared illustrative assets follow the ledger's model name, not material code.
import fs from 'node:fs/promises'
import * as T from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import {GLTFExporter} from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
import {shape} from './generate-ledger-models.mjs'
const root=new URL('../',import.meta.url),catalogPath=new URL('server/data/ledger-model-catalog.json',root)
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'))
const kinds={35:'module',86:'housing',88:'housing',89:'housing',91:'cylinder',96:'housing',106:'reducer',108:'reducer',147:'reducer',149:'housing',168:'hydraulic'}
const out=new URL('spare-parts-web-release/public/models/named-20261009/',root)
await fs.mkdir(out,{recursive:true})
const models=[],exporter=new GLTFExporter()
for(const [id,kind] of Object.entries(kinds)){
  const model=catalog.models.find(m=>m.id===Number(id))
  if(!model)throw new Error(`Missing original model ${id}`)
  let group
  if(kind==='hydraulic'){
    group=new T.Group()
    const material=new T.MeshStandardMaterial({color:0x8a9ba8,metalness:.6,roughness:.5})
    for(const [w,h,d,x,y,z] of [[1,.12,.55,0,.06,0],[.18,.18,.6,-.4,.25,0],[.18,.18,.6,.4,.25,0],[.65,.17,.17,0,.3,0],[.4,.055,.055,.5,.3,0]]){
      const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh)
    }
  }else group=shape(kind,model.name)
  group.userData={modelName:model.name,catalogId:model.id,quality:'外观示意',manufacturerCAD:false}
  const scene=new T.Scene();scene.add(group)
  await fs.writeFile(new URL(id+'.glb',out),Buffer.from(await exporter.parseAsync(scene,{binary:true})))
  Object.assign(model,{modelUrl:`/models/named-20261009/${id}.glb`,quality:'外观示意',description:`${model.name}的通用外观示意，具体规格可能有不同安装外形；尺寸、孔位和内部结构未核实，不用于安装校核。`})
  models.push({name:model.name,modelUrl:model.modelUrl,quality:model.quality,description:model.description})
}
const pending=catalog.supplements.find(b=>b.version==='pending-ledger-20261009-v1')
if(pending)pending.bindByCode=false
const version='named-model-assets-20261009-v1'
catalog.assetUpdates=(catalog.assetUpdates||[]).filter(b=>b.version!==version)
catalog.assetUpdates.push({version,models})
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n')
console.log(JSON.stringify({generated:models.length,names:models.map(m=>m.name)}))

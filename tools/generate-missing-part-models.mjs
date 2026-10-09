// Five user-requested visual models; no manufacturer CAD or invented real photos.
import fs from 'node:fs/promises'
import * as T from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
const root=new URL('../',import.meta.url)
const out=new URL('spare-parts-web-release/public/models/supplement-20261009/',root)
await fs.mkdir(out,{recursive:true})
globalThis.FileReader ??= class {async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}}
const exporter=new GLTFExporter()
const mat=(color,metalness=.1)=>new T.MeshStandardMaterial({color,roughness:.45,metalness})
function mesh(g,geometry,color,p=[0,0,0],r=[0,0,0],metalness=.1){const m=new T.Mesh(geometry,mat(color,metalness));m.position.set(...p);m.rotation.set(...r);g.add(m);return m}
function box(g,w,h,d,color,p){return mesh(g,new T.BoxGeometry(w,h,d),color,p)}
function annulus(g,inner,outer,depth,color,p=[0,0,0],metalness=.1){
  const profile=[new T.Vector2(inner,-depth/2),new T.Vector2(outer,-depth/2),new T.Vector2(outer,depth/2),new T.Vector2(inner,depth/2),new T.Vector2(inner,-depth/2)]
  return mesh(g,new T.LatheGeometry(profile,96),color,p,[Math.PI/2,0,0],metalness)
}
function compensationBox(){const g=new T.Group();box(g,.8,1,.42,0xe2e6eb,[0,.5,0]);box(g,.83,.07,.45,0x76838b,[0,1.01,0]);box(g,.82,.05,.44,0x76838b,[0,.025,0]);for(let i=0;i<7;i++)box(g,.62,.017,.025,0x657882,[0,.22+i*.09,.225]);box(g,.52,.12,.02,0x217994,[0,.89,.23]);for(const x of [-.2,.2])mesh(g,new T.CylinderGeometry(.05,.05,.13,24),0xbca663,[x,1.1,0]);return g}
function relaySocket(){const g=new T.Group();box(g,.85,.2,.95,0x303c44,[0,.1,0]);mesh(g,new T.CylinderGeometry(.29,.29,.17,64),0x67727b,[0,.285,0]);for(let i=0;i<8;i++){const a=i*Math.PI/4;mesh(g,new T.CylinderGeometry(.028,.028,.015,20),0x17202a,[Math.sin(a)*.19,.378,Math.cos(a)*.19])}for(const z of [-.38,.38])for(const x of [-.28,-.09,.09,.28]){box(g,.13,.08,.13,0x17202a,[x,.235,z]);mesh(g,new T.CylinderGeometry(.039,.039,.017,20),0xbebcad,[x,.286,z],[],.7)}box(g,.12,.04,.33,0x46515a,[0,.02,.57]);return g}
function sphericalBearing(){
  const g=new T.Group();annulus(g,.42,.55,.28,0xa1acb6,[0,.55,0],.85);annulus(g,.30,.35,.28,0x85949f,[0,.55,0],.8);
  for(const z of [-.072,.072]){
    annulus(g,.365,.40,.022,0xbca663,[0,.55,z]);
    const profile=[new T.Vector2(0,-.058),new T.Vector2(.032,-.058),new T.Vector2(.039,-.03),new T.Vector2(.043,0),new T.Vector2(.039,.03),new T.Vector2(.032,.058),new T.Vector2(0,.058)];
    for(let i=0;i<18;i++){const a=i*Math.PI/9;mesh(g,new T.LatheGeometry(profile,24),0xd5dce1,[Math.sin(a)*.385,.55+Math.cos(a)*.385,z],[Math.PI/2,0,0],.85)}
  }
  g.userData.nominalDimensionsMm={innerDiameter:60,outerDiameter:110,width:28};return g
}
function oilSeal(inner,outer,width){const g=new T.Group();const s=.012;annulus(g,inner*s/2,outer*s/2,width*s,0x313a40,[0,outer*s/2,0]);annulus(g,inner*s/2,inner*s/2+(outer-inner)*s*.16,width*s*.55,0x17232b,[0,outer*s/2,width*s*.12]);mesh(g,new T.TorusGeometry(inner*s/2+(outer-inner)*s*.12,.008,8,96),0xa1a9b0,[0,outer*s/2,-width*s*.16],[],.8);g.userData.nominalDimensionsMm={innerDiameter:inner,outerDiameter:outer,width};return g}
const models=[
  {key:'capacitor-compensation-box',name:'电容补偿盒 · 外形示意',code:'502005240',factory:compensationBox,description:'电容补偿盒识别示意；截图型号不完整，接口、内部结构及厂家尺寸待核对。'},
  {key:'timer-relay-socket',name:'时间继电器底座 · 外形示意',code:'502006637',factory:relaySocket,description:'时间继电器底座识别示意；孔位、针脚数量及厂家尺寸待核对。'},
  {key:'spherical-roller-bearing-22212e',name:'SKF 22212E · 双列轴承示意',code:'505024987',factory:sphericalBearing,description:'按台账型号制作双列滚子轴承外观示意；外形按SKF官方60×110×28毫米比例生成；滚子、保持架及滚道结构示意，非厂家CAD。'},
  {key:'oil-seal-90-110-12',name:'骨架油封 90×110×12 · 示意',code:'505026166',factory:()=>oilSeal(90,110,12),description:'按台账内径90、外径110、宽12毫米的比例生成；唇口和骨架结构示意，非厂家CAD。'},
  {key:'oil-seal-60-80-5-5',name:'轴面油封 RB60×80×5.5 · 示意',code:'505026171',factory:()=>oilSeal(60,80,5.5),description:'按台账内径60、外径80、宽5.5毫米的比例生成；RB截面、材料与厂家结构待核对。'}
]
const entries=[]
for(const model of models){const g=model.factory();g.name=model.name;g.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(g),center=bounds.getCenter(new T.Vector3());g.position.set(-center.x,-bounds.min.y,-center.z);g.userData.quality='外观示意';const scene=new T.Scene();scene.add(g);const bytes=await exporter.parseAsync(scene,{binary:true});await fs.writeFile(new URL(model.key+'.glb',out),Buffer.from(bytes));entries.push({name:model.name,materialCode:model.code,description:model.description,quality:'外观示意',modelUrl:`/models/supplement-20261009/${model.key}.glb`});g.traverse(node=>{node.geometry?.dispose();node.material?.dispose()})}
const catalogFile=new URL('server/data/ledger-model-catalog.json',root)
const catalog=JSON.parse(await fs.readFile(catalogFile,'utf8'))
catalog.supplements ||= []
const version='missing-five-20261009-v1'
catalog.supplements=catalog.supplements.filter(batch=>batch.version!==version)
catalog.supplements.push({version,models:entries})
await fs.writeFile(catalogFile,JSON.stringify(catalog,null,2)+'\n')
console.log(JSON.stringify(entries,null,2))

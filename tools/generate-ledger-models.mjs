// New named assets. Geometry is explicitly illustrative, never manufacturer CAD.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as T from '../spare-parts-web-release/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const catalogPath=path.join(root,'server/data/ledger-model-catalog.json')
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'))
const out=path.join(root,'spare-parts-web-release/public/models/ledger-20261008')
await fs.mkdir(out,{recursive:true})
globalThis.FileReader ??= class {async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}}
const exporter=new GLTFExporter()
const steel=0x9aa7b2, dark=0x28343e, white=0xe3e8ec, blue=0x256384, brass=0xb69b64
function mesh(g,geo,color=steel,p=[0,0,0],r=[0,0,0]){const m=new T.Mesh(geo,new T.MeshStandardMaterial({color,roughness:.55,metalness:color===steel?.65:.15}));m.position.set(...p);m.rotation.set(...r);g.add(m);return m}
const box=(g,w,h,d,c,p,r)=>mesh(g,new T.BoxGeometry(w,h,d),c,p,r)
const cyl=(g,r,h,c,p,rot)=>mesh(g,new T.CylinderGeometry(r,r,h,16),c,p,rot)
const ring=(g,r,t,c,p,rot)=>mesh(g,new T.TorusGeometry(r,t,8,24),c,p,rot)
function holes(g,xs,y,z){for(const x of xs)cyl(g,.025,.018,dark,[x,y,z],[Math.PI/2,0,0])}
function bearing(g,roller=false){ring(g,.38,.10,steel,[0,.5,0]);ring(g,.19,.035,steel,[0,.5,.01]);for(let i=0;i<10;i++){const a=i*Math.PI/5;const p=[Math.cos(a)*.275,.5+Math.sin(a)*.275,0];if(roller)cyl(g,.04,.14,white,p,[Math.PI/2,0,0]);else mesh(g,new T.SphereGeometry(.045,8,6),white,p)}}
function motor(g,vertical=false){cyl(g,.28,.7,blue,[0,.4,0],[0,0,Math.PI/2]);for(let i=0;i<8;i++)cyl(g,.30,.025,blue,[-.28+i*.08,.4,0],[0,0,Math.PI/2]);cyl(g,.085,.32,steel,[.47,.4,0],[0,0,Math.PI/2]);box(g,.20,.15,.22,blue,[0,.76,0]);for(const x of [-.22,.22])box(g,.15,.08,.65,blue,[x,.09,0]);if(vertical)g.rotation.z=Math.PI/2}
export function shape(kind,name){const g=new T.Group();g.name=name
  switch(kind){
    case 'breaker': {const poles=Number(name.match(/([1234])P/)?.[1]||1);for(let i=0;i<poles;i++){const x=(i-(poles-1)/2)*.23;box(g,.22,.85,.35,white,[x,.44,0]);box(g,.13,.22,.06,dark,[x,.56,.2]);holes(g,[x],.13,.18);holes(g,[x],.77,.18)}break}
    case 'protector':box(g,.65,.8,.46,white,[0,.4,0]);cyl(g,.12,.05,dark,[0,.53,.25],[Math.PI/2,0,0]);box(g,.16,.10,.05,0xc93738,[-.13,.28,.25]);box(g,.16,.10,.05,0x24955b,[.13,.28,.25]);holes(g,[-.22,0,.22],.75,.24);break
    case 'contactor':box(g,.65,.7,.45,white,[0,.35,0]);box(g,.30,.3,.08,dark,[0,.4,.27]);holes(g,[-.22,0,.22],.63,.24);holes(g,[-.22,0,.22],.07,.24);break
    case 'drive':box(g,.65,1.1,.45,white,[0,.56,0]);box(g,.5,.3,.06,dark,[0,.9,.25]);box(g,.26,.12,.02,0x355c60,[0,.96,.29]);for(let x=-.25;x<.3;x+=.08)box(g,.025,.4,.46,steel,[x,.22,0]);break
    case 'module':box(g,.27,.8,.40,dark,[0,.4,0]);box(g,.23,.5,.04,white,[0,.46,.22]);for(let i=0;i<6;i++)box(g,.025,.025,.025,0x25a679,[-.06+i*.025,.6,.25]);for(const y of [.08,.74])holes(g,[-.06,0,.06],y,.23);break
    case 'relay':box(g,.30,.55,.27,white,[0,.3,0]);box(g,.20,.28,.05,dark,[0,.38,.17]);for(const y of [.08,.54])holes(g,[-.08,.08],y,.16);break
    case 'supply':box(g,.7,.85,.4,steel,[0,.43,0]);for(let i=0;i<8;i++)box(g,.018,.55,.015,dark,[-.25+i*.07,.5,.21]);for(let i=0;i<6;i++)box(g,.07,.09,.06,0x377660,[-.25+i*.1,.09,.24]);break
    case 'panel':box(g,.95,.65,.10,dark,[0,.34,0]);box(g,.75,.42,.015,0x54778a,[0,.39,.06]);for(let x=-.3;x<.4;x+=.15)cyl(g,.035,.025,white,[x,.10,.075],[Math.PI/2,0,0]);break
    case 'board':box(g,.9,.65,.025,0x2b8065,[0,.34,0]);for(const x of [-.28,0,.28])box(g,.15,.22,.04,dark,[x,.4,.04]);for(let x=-.4;x<.45;x+=.05)box(g,.018,.05,.035,brass,[x,.04,.03]);break
    case 'network':box(g,.65,.6,.3,dark,[0,.3,0]);for(let i=0;i<5;i++){box(g,.095,.12,.025,steel,[-.25+i*.125,.4,.16]);box(g,.07,.08,.03,dark,[-.25+i*.125,.4,.18])}break
    case 'button':box(g,.35,.5,.25,white,[0,.25,0]);cyl(g,.15,.12,0xc93738,[0,.45,.2],[Math.PI/2,0,0]);break
    case 'instrument':box(g,.7,.65,.25,dark,[0,.34,0]);box(g,.52,.32,.025,0x506f78,[0,.4,.14]);box(g,.35,.05,.02,white,[0,.12,.16]);break
    case 'sensor':cyl(g,.11,.6,steel,[0,.38,0],[Math.PI/2,0,0]);cyl(g,.115,.045,dark,[.32,.38,0],[Math.PI/2,0,0]);cyl(g,.03,.25,dark,[-.42,.38,0],[Math.PI/2,0,0]);break
    case 'probe':cyl(g,.04,.9,steel,[0,.47,0]);cyl(g,.12,.15,brass,[0,.82,0]);cyl(g,.03,.28,dark,[0,1.05,0]);break
    case 'switch':box(g,.3,.5,.25,blue,[0,.27,0]);cyl(g,.035,.4,steel,[0,.69,0],[0,0,-.4]);cyl(g,.08,.08,dark,[.08,.89,0],[Math.PI/2,0,0]);break
    case 'encoder':cyl(g,.24,.3,steel,[0,.32,0],[Math.PI/2,0,0]);cyl(g,.07,.25,steel,[0,.32,.27],[Math.PI/2,0,0]);box(g,.18,.15,.12,dark,[.26,.32,0]);break
    case 'transmitter':cyl(g,.08,.42,steel,[0,.23,0]);cyl(g,.20,.3,blue,[0,.55,0],[Math.PI/2,0,0]);break
    case 'level':box(g,.36,.4,.36,blue,[0,.83,0]);cyl(g,.035,.7,steel,[0,.34,0]);box(g,.45,.07,.08,steel,[0,.04,0]);break
    case 'valve':box(g,.75,.26,.30,steel,[0,.22,0]);box(g,.24,.35,.26,dark,[-.24,.5,0]);for(const x of [-.25,0,.25])cyl(g,.055,.15,brass,[x,.22,.22],[Math.PI/2,0,0]);break
    case 'regulator':cyl(g,.15,.35,steel,[0,.25,0]);cyl(g,.10,.2,dark,[0,.53,0]);cyl(g,.12,.06,white,[0,.3,.2],[Math.PI/2,0,0]);cyl(g,.05,.5,brass,[0,.26,0],[0,0,Math.PI/2]);break
    case 'coil':box(g,.40,.35,.28,dark,[0,.22,0]);cyl(g,.08,.40,steel,[0,.23,0],[Math.PI/2,0,0]);box(g,.14,.12,.12,dark,[.22,.4,0]);break
    case 'air-unit':for(const x of [-.2,.2]){cyl(g,.12,.45,white,[x,.27,0]);box(g,.27,.17,.25,steel,[x,.58,0])}cyl(g,.11,.2,dark,[-.2,.73,0]);break
    case 'motor':motor(g);break
    case 'reducer':box(g,.5,.55,.5,blue,[0,.32,0]);cyl(g,.085,.8,steel,[0,.3,0],[0,0,Math.PI/2]);for(const x of [-.2,.2])box(g,.15,.06,.55,blue,[x,.03,0]);if(/带电机/.test(name)){const m=new T.Group();motor(m);m.scale.setScalar(.65);m.position.set(-.6,.3,0);g.add(m)}if(/联轴器/.test(name))cyl(g,.15,.15,steel,[.45,.3,0],[0,0,Math.PI/2]);break
    case 'bearing':bearing(g,/滚子/.test(name));break
    case 'housing':box(g,.9,.10,.32,blue,[0,.07,0]);cyl(g,.30,.23,blue,[0,.4,0],[Math.PI/2,0,0]);ring(g,.19,.065,steel,[0,.4,.14]);holes(g,[-.34,.34],.07,.18);break
    case 'flange-bearing':box(g,.65,.8,.12,blue,[0,.42,0]);ring(g,.22,.085,steel,[0,.42,.12]);holes(g,[-.2,.2],.1,.1);holes(g,[-.2,.2],.73,.1);break
    case 'cylinder':box(g,.23,.23,.23,steel,[-.42,.2,0]);box(g,.23,.23,.23,steel,[.42,.2,0]);cyl(g,.12,.8,white,[0,.2,0],[0,0,Math.PI/2]);cyl(g,.035,.55,steel,[.73,.2,0],[0,0,Math.PI/2]);for(const z of [-.1,.1])cyl(g,.015,.8,steel,[0,.3,z],[0,0,Math.PI/2]);break
    case 'belt':ring(g,.35,.025,dark,[0,.4,0]);g.scale.x=1.7;break
    case 'chain':for(let i=0;i<9;i++){const x=i*.11-.44;box(g,.15,.08,.05,steel,[x,.15,.08]);box(g,.15,.08,.05,steel,[x,.15,-.08]);cyl(g,.025,.22,steel,[x,.15,0],[Math.PI/2,0,0])}break
    case 'coupling':cyl(g,.24,.5,steel,[0,.27,0],[0,0,Math.PI/2]);for(const x of [-.2,0,.2])ring(g,.245,.025,dark,[x,.27,0],[0,Math.PI/2,0]);break
    case 'roller':cyl(g,.16,1.0,steel,[0,.2,0],[0,0,Math.PI/2]);cyl(g,.05,1.25,steel,[0,.2,0],[0,0,Math.PI/2]);break
    case 'shaft':cyl(g,.075,1.2,steel,[0,.15,0],[0,0,Math.PI/2]);for(const x of [-.35,.25])cyl(g,.13,.12,steel,[x,.15,0],[0,0,Math.PI/2]);break
    case 'wheel':cyl(g,.28,.18,dark,[0,.30,0],[Math.PI/2,0,0]);cyl(g,.09,.20,steel,[0,.30,0],[Math.PI/2,0,0]);if(/万向轮/.test(name)){for(const x of [-.14,.14])box(g,.04,.35,.12,steel,[x,.52,0]);box(g,.45,.035,.35,steel,[0,.72,0]);if(/带制动/.test(name))box(g,.10,.03,.25,0xc93738,[.25,.3,0])}break
    case 'fan':cyl(g,.42,.30,steel,[0,.46,0],[Math.PI/2,0,0]);cyl(g,.15,.32,dark,[0,.46,0],[Math.PI/2,0,0]);for(let i=0;i<6;i++){const a=i*Math.PI/3;box(g,.28,.13,.04,white,[Math.cos(a)*.23,.46+Math.sin(a)*.23,.18],[0,0,a])}break
    case 'seal':ring(g,.33,.035,dark,[0,.4,0]);break
    case 'spring':for(let i=0;i<6;i++)ring(g,.22,.03,dark,[0,.08+i*.065,0],[Math.PI/2,0,0]);break
    case 'mesh':box(g,.95,.65,.03,steel,[0,.35,0]);for(let i=0;i<8;i++)for(let j=0;j<5;j++)box(g,.055,.055,.035,dark,[-.40+i*.11,.10+j*.11,.02]);break
    case 'bag':cyl(g,.16,.85,white,[0,.45,0]);ring(g,.16,.02,steel,[0,.89,0],[Math.PI/2,0,0]);break
    case 'connector':cyl(g,.22,.55,dark,[0,.30,0]);for(const y of [.05,.56])ring(g,.23,.03,steel,[0,y,0],[Math.PI/2,0,0]);break
    case 'fitting':cyl(g,.07,.5,brass,[0,.3,0],[0,0,Math.PI/2]);cyl(g,.09,.14,blue,[.28,.3,0],[0,0,Math.PI/2]);break
    case 'cable':ring(g,.30,.04,dark,[0,.35,0]);for(let i=0;i<3;i++)ring(g,.3,.03,dark,[0,.35,i*.05]);break
    case 'bucket':box(g,.7,.06,.5,white,[0,.08,0]);box(g,.7,.32,.04,white,[0,.27,-.23]);for(const x of [-.33,.33])box(g,.04,.32,.5,white,[x,.27,0]);break
    case 'bracket':box(g,.6,.06,.3,steel,[0,.04,0]);box(g,.6,.45,.04,steel,[0,.25,-.13]);holes(g,[-.2,.2],.28,-.10);break
    case 'blade':box(g,1,.25,.035,steel,[0,.16,0]);holes(g,[-.35,0,.35],.16,.03);break
    default:return null
  }
  g.updateMatrixWorld(true);const b=new T.Box3().setFromObject(g),c=b.getCenter(new T.Vector3());g.position.set(-c.x,-b.min.y,-c.z);return g
}
function kind(name){
  const rules=[[/马达保护器辅助|辅助触/,'relay'],[/马达保护器/,'protector'],[/微型断路器|塑壳断路器/,'breaker'],[/交流接触器/,'contactor'],[/驱动器|软启动|^变频器$/,'drive'],[/操作面板|薄膜按键|显示板/,'panel'],[/电路板|主控板|内芯/,'board'],[/交换机|CPE|耦合器|总线适配/,'network'],[/电源|整流模块|功率模块/,'supply'],[/电阻/,'probe'],[/控制按钮|操作件/,'button'],[/接线箱/,'panel'],[/电流表|电力仪表|称重模块/,'instrument'],[/CPU|模块|控制单元|通讯处理/,'module'],[/继电器|辅助触/,'relay'],[/编码器/,'encoder'],[/变送器/,'transmitter'],[/温度|测温|PT100|热电阻/,'probe'],[/阻旋/,'level'],[/行程开关|限位开关|拉绳|跑偏开关|机械式传感/,'switch'],[/传感器|光电开关|接近开关|磁性开关$/,'sensor'],[/线圈/,'coil'],[/减压|调压|安全阀/,'regulator'],[/电磁.*阀/,'valve'],[/气源|气动单联/,'air-unit'],[/电动缸|气缸/,'cylinder'],[/减速机|减速器|止逆器/,'reducer'],[/电机|气动振动器/,'motor'],[/带座|轴承座（含/,'housing'],[/^轴承座$/,'housing'],[/轴承$/,'bearing'],[/万向轮|主动轮|导向轮/,'wheel'],[/联轴器|离合器|紧定套/,'coupling'],[/链条/,'chain'],[/三角带|同步带|齿楔带|输送带/,'belt'],[/辊/,'roller'],[/轴$/,'shaft'],[/风机|鼓风机/,'fan'],[/密封|弹性圈|防尘盖|盘根|缓冲胶/,'seal'],[/弹簧/,'spring'],[/筛网|筛片|筛格|笼骨架|均风板/,'mesh'],[/滤袋|布筒/,'bag'],[/软连/,'connector'],[/接头|消声器|套筒|耐磨套/,'fitting'],[/钢丝绳|电缆/,'cable'],[/畚斗|电动拨斗/,'bucket'],[/支架|把手|吊杆|风门|取电器/,'bracket'],[/板|锤片|刮刀|刮灰|制动片|爆破片|吸头|清扫器/,'blade'],[/磁棒/,'shaft'],[/定位器|熔断器/,'module']]
  return rules.find(([r])=>r.test(name))?.[1]
}
const ambiguous=new Set(['带座外球面轴承','带座轴承','不锈钢带座轴承','轴承座','轴承座（含轴承）','标准气缸','减速机','减速机（带电机）','减速机（带联轴器）'])
// Separate install-form examples avoid representing unlike housings by one file.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const variants=[['带座轴承 · 底座式示意','housing'],['带座轴承 · 法兰式示意','flange-bearing'],['标准气缸 · 拉杆式示意','cylinder'],['减速机 · 箱体式示意','reducer']]
for(const [name,k] of variants)if(!catalog.models.some(m=>m.name===name))catalog.models.push({id:catalog.models.length+1,name,shape:k,quality:'外观示意',description:'安装外形示意；未核实厂家尺寸，选择前请核对备件实际外形。'})
let generated=0;const pending=[]
for(const model of catalog.models){
  const k=model.shape || kind(model.name)
  if(ambiguous.has(model.name) || !k){model.modelUrl=null;model.description='同名简称可能包含不同规格或安装外形，请选择细分模型或上传已核对的模型；暂不展示猜测外形。';pending.push(model.name);continue}
  const group=shape(k,model.name)
  if(!group){pending.push(model.name);continue}
  const scene=new T.Scene();scene.name=String(model.id);scene.add(group)
  const glb=await exporter.parseAsync(scene,{binary:true,onlyVisible:true})
  await fs.writeFile(path.join(out,`${model.id}.glb`),Buffer.from(glb))
  model.modelUrl=`/models/ledger-20261008/${model.id}.glb`;model.shape=k;model.quality='外观示意'
  generated++
  group.traverse(node=>{node.geometry?.dispose();node.material?.dispose()})
}
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n')
console.log(JSON.stringify({catalog:catalog.models.length,generated,pending},null,2))
}

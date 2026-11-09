import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import * as T from '../../spare-parts-web-release/node_modules/three/build/three.module.js'
import {GLTFExporter} from '../../spare-parts-web-release/node_modules/three/examples/jsm/exporters/GLTFExporter.js'
import {createIdentityGeometry} from './identity-geometry.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),web=path.join(root,'spare-parts-web-release'),backup=path.join(root,'.local/model-identity-20261103/before')
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8')),write=async(p,j)=>fs.writeFile(path.join(root,p),JSON.stringify(j,null,2)+'\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const files={catalog:'spare-parts-web-release/src/utils/reviewed-model-catalog.json',plan:'tools/modeling/model-review-plan-20261023.json',progress:'docs/SPARE_REBUILD_PROGRESS_20261102.json',freeze:'docs/SPARE_REBUILD_FREEZE_330_20261103.json',audit:'docs/SPARE_REBUILD_AUDIT_20261103.json'}
const state=Object.fromEntries(await Promise.all(Object.entries(files).map(async([k,p])=>[k,await read(p)])))
const vahle='https://www.vahle.com/fileadmin/cavok_upload/US%20Catalogs/vPOWER%2005b%20CPS%20140kHz%20Inductive%20Power.pdf'
const changes=[
 [8,'auxiliary-contact','LADN20C 辅助触头','按LADN20数据表保留42×48×26mm壳体，前装辅助触头，取消PLC接口与状态灯标注。',state.catalog.models.find(m=>m.id===8).source,['触点内部结构','卡接细节和端子版本']],
 [38,'rotary-level','JL90T / JL90-LT 阻旋式料位器','补驱动接线壳体、转轴、测量叶片与过程连接；JL90长度、螺纹及叶片样式未核实。',{type:'category-reference',url:'https://www.siemens.com/en-gb/products/sitrans/lps200/',caveat:'仅参照同类阻旋检测的功能组成，非JL90厂家外形或尺寸。'},['JL90原厂外形','探测轴长度','过程螺纹和叶片形式']],
 [39,'differential-pressure','MX3100610 压差变送器','按台账数显压差功能补高低压口、显示窗和接线腔，外形比例为示意。',{type:'ledger-functional-structure',caveat:'原厂MX3100610尺寸图尚未取得；不套用DIN模块。'},['壳体尺寸','过程接口与安装孔位','具体厂家版本']],
 [40,'regulator','VAHLE RE400 · 10023622','按VAHLE CPS140原厂册第12–13页重建通风金属罩、同轴输入和接线端。',{type:'manufacturer-catalog',manufacturer:'VAHLE',url:vahle,document:'vahle-cps140.pdf',pages:[12,13]},['通风槽片数和内部电路','端子针脚细节']],
 [41,'pickup','VAHLE E400 · 10023621','按VAHLE CPS140原厂册第12–13页重建E形磁芯取能通道、封装壳体与同轴出线。',{type:'manufacturer-catalog',manufacturer:'VAHLE',url:vahle,document:'vahle-cps140.pdf',pages:[12,13]},['磁芯精确截面','线圈内部结构','接头尺寸']],
 [60,'pressure-transmitter','FH2088 压力变送器','改为过程仪表结构：电子接线壳体、测量接头、过程引压接口；不再冒充DIN模块。',{type:'ledger-functional-structure',caveat:'FH2088原厂外形图尚未取得；壳体和接口为类别示意。'},['原厂外形尺寸','螺纹与壳体版本','是否有现场显示']],
 [76,'membrane-keypad','RL-DTLJ-KB 薄膜按键面板','薄膜键面与柔性排线示意，取消PCB元器件；具体按键排布未核实。',{type:'ledger-functional-structure'},['按键布局与面板尺寸','柔性排线端接']],
 [79,'uf51','Milesight UF51 5G CPE','按星纵UF51原厂2025英文规格书第1、6、7页改为圆柱防护壳、底部双网口、串口/电源接口、指示灯；内置天线不外画。',{type:'manufacturer-datasheet',manufacturer:'Milesight',url:'https://resource.milesight.com/milesight/iot/document/uf51-datasheet-en.pdf',document:'milesight-uf51.pdf',pages:[1,6,7]},['台账UF51的硬件修订未注明','接口孔和密封件细节','187mm和旧中文资料188.5mm版本差异']],
 [88,'spherical-bearing','SKF 22216 EK','当前唯一绑定物料505019291（同505005433）明确为22216EK，原带座轴承为错误分类。改为80×140×33mm双列调心滚子轴承，内孔1:12锥度；无安装底座和紧定螺钉。',{type:'manufacturer-product',manufacturer:'SKF',url:'https://www.emarketplace.in.skf.com/spherical-roller-bearing/22216-ek',document:'skf-22216-ek.html'},['滚子数和滚道曲率为示意','游隙与制造公差','原厂保持架细部']],
 [142,'electric-cable','德马格 AG3 电缆线','改为绝缘电缆盘绕外观，取消钢丝绳股结构。5m为台账长度；盘绕半径不作尺寸依据。',{type:'ledger-functional-structure'},['电缆芯数与护套规格','两端接头','盘绕形态']],
 [154,'fiberglass-rod','FSFS2×11C137-22 玻璃钢吊杆','改为玻璃钢圆杆类别外观，取消金属驱动轴、轴肩与键槽。',{type:'ledger-functional-structure'},['原厂尺寸','端部连接方式']],
 [171,'safety-actuator','AZ 15/16-B1 直型操作件','仅画独立操作件，取消错误附带的整只行程开关。',{type:'ledger-functional-structure'},['厂家尺寸图未取得','孔位和金属片具体轮廓']],
 [180,'elastic-ring','TBLMy除尘器弹性圈','按弹性圈类别改为橡胶环，不再标成轴承迷宫密封、金属骨架和毡圈。',{type:'ledger-functional-structure'},['除尘器原厂弹性圈截面','材料与尺寸']],
 [183,'magnetic-rod','磁棒 φ32×730','直径32mm、长度730mm按台账，改为不锈钢磁棒外管与端部封口；取消驱动轴键槽。',{type:'ledger-dimensions'},['内部磁芯布置','表面磁场不由外观证明','端部封口细节']],
 [194,'track-box','VAHLE TPCB.2-140-045-F · 10027809','按原厂CPS140册第8页确认轨道电容补偿盒身份，改为封闭补偿箱和电缆进出接头，不带显示屏。',{type:'manufacturer-catalog',manufacturer:'VAHLE',url:vahle,document:'vahle-cps140.pdf',pages:[8]},['盒体尺寸','电缆接头规格','内部电容结构']],
 [195,'relay-socket','正泰时间继电器底座','改为绝缘插接座与接线端子，取消拨码和显示件；台账未给底座型号，不猜针数和尺寸。',{type:'manufacturer-category-reference',manufacturer:'CHINT',url:'https://www.chintglobal.com/global/en/products/low-voltage/iec/industrial-control/relay-socket.html'},['具体型号与针数','底座尺寸','端子布置为示意']]
]
globalThis.FileReader??=class{async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onloadend?.()}}
await fs.mkdir(backup,{recursive:true});const receipt=[]
for(const [id,kind,productModel,note,source,unknown]of changes){
 const entry=state.catalog.models.find(m=>m.id===id),planned=state.plan.models.find(m=>m.id===id),progress=state.progress.items.find(m=>m.id===id),file=path.join(web,'public',entry.url),before=await fs.readFile(file);
 if(sha(before)!==entry.sha256)throw Error('Unexpected model change '+id)
 const saved=path.join(backup,id+'.glb');try{await fs.access(saved)}catch{await fs.writeFile(saved,before)}
 const original=await fs.readFile(saved),doc=JSON.parse(original.subarray(20,20+original.readUInt32LE(12))),oldRoot=doc.nodes[doc.scenes[doc.scene||0].nodes[0]],spec={family:'identity-'+kind,productModel,dimensionSource:{...source,retrieved:'2026-11-03'},unknown,confirmedDimensionsMm:kind==='spherical-bearing'?'80×140×33 mm，1:12锥孔':kind==='regulator'?'245×156×90 mm':kind==='pickup'?'166.6×159.6×109.5 mm':kind==='magnetic-rod'?'φ32×730 mm':kind==='uf51'?'资料2025版无防水接头φ105×110×187mm，现场版本待核':'未核实安装尺寸，结构示意',...(kind==='spherical-bearing'?{bore:.080,outer:.140,width:.033}:{})};
 const group=createIdentityGeometry(spec);group.name=oldRoot.name||productModel;group.userData={...oldRoot.extras,...group.userData,identityCorrection:'20261103',manufacturerCAD:false,quality:'结构示意'};
 if(id===88){group.userData.originalModelName=group.userData.modelName;group.userData.modelName=productModel}
 group.traverse(m=>{const a=m.geometry?.attributes.normal;if(a)for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i);if(v.lengthSq()<1e-10)v.set(0,1,0);v.normalize();a.setXYZ(i,v.x,v.y,v.z)}});
 const scene=new T.Scene();scene.add(group);const bytes=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),names=new Map(json.nodes.filter(n=>n.extras?.observation).map(n=>[n.extras.observation.id,n.extras.observation.name]));
 const hash=sha(bytes);await fs.writeFile(file,bytes);for(const alias of entry.aliases||[])await fs.writeFile(path.join(web,'public',alias),bytes);
 Object.assign(entry,{sha256:hash,meshCount:json.meshes.length,partCount:names.size,note,source:spec.dimensionSource,requiresReview:false});Object.assign(planned,{spec,note,source:spec.dimensionSource});
 Object.assign(progress,{name:id===88?productModel:progress.name,currentFamily:spec.family,frozenSha256:hash,batch:'C1-identity-corrections',evidence:{...spec.dimensionSource,unknown},openQuestions:unknown,geometryChange:note,tests:'test/spare-identity-corrections.test.mjs'});
 for(const [key,rows]of [['freeze',state.freeze.items],['audit',state.audit.rows]]){const row=rows.find(r=>r.id===id);Object.assign(row,{batch:'C1-identity-corrections',meshCount:entry.meshCount,partCount:entry.partCount,requiresReview:false,sourceType:source.type,sourceUrl:source.url||'',unknown,tests:'test/spare-identity-corrections.test.mjs'});row[key==='freeze'?'sha256':'currentSha256']=hash;if(key==='audit'){row.sourceDocument=source.document||'';row.unknownCount=unknown.length}}
 receipt.push({id,url:entry.url,before:sha(original),after:hash,productModel,parts:Object.fromEntries(names),spec});group.traverse(m=>{m.geometry?.dispose();[].concat(m.material||[]).forEach(m=>m.dispose())});
}
for(const [key,file]of Object.entries(files))await write(file,state[key]);await write('docs/SPARE_IDENTITY_CORRECTIONS_20261103.json',{at:new Date().toISOString(),scope:'Binding/functional identity audit, not certification of installation dimensions',items:receipt});console.log(JSON.stringify({corrected:receipt.length,ids:receipt.map(x=>x.id)}))

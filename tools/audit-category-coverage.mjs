import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const assets=path.join(root,'spare-parts-web-release/public/models/categories')
// Conservative shape families for an offline gap review. These are suggestions, never bindings.
const families={
  bearing:/轴承/, 'circuit-breaker':/断路器|空气开关|空开/, valve:/阀/, sensor:/传感器|接近开关|光电开关|磁性开关|热电阻|热电偶|跑偏开关/,
  contactor:/接触器/,vfd:/变频器/,relay:/继电器/, 'soft-starter':/软启动/,belt:/输送带|皮带(?!机|清扫器)/,coupling:/联轴器/,encoder:/编码器/,
  motor:/电机|电动机/, 'plc-module':/CPU|PLC|[Pp][Ll][Cc]|通讯模块|通信模块|接口模块|分站模块|分布式IO|通讯处理器|称重模块|网络耦合器|数字量.*模块|模拟量.*模块|输入.*模块|输出.*模块/,
  instrument:/仪表|压力表|电流表|电压表|多功能表|变送器/,resistor:/电阻器|制动电阻/, 'auxiliary-contact':/辅助触点|辅助接点|辅助触头/,switch:/开关|按钮/, 'junction-box':/接线盒|接线箱/,
  chain:/链条|滚子链/,cylinder:/气缸|液压缸/,scraper:/刮板|刮刀/,'flexible-connector':/软连/,'filter-mesh':/滤网/,'adapter-sleeve':/紧定套/,'network-switch':/交换机/,
  'pneumatic-unit':/气源处理|气动.*联件|二联件|三联件/,'rgv-part':/RGV.*(?:胶垫|缓冲)/,'gear-sprocket':/齿轮|链轮/,'level-sensor':/料位|液位/,seal:/密封|盘根|油封/,'pipe-fitting':/管接|管件|弯头|接头/,
  clutch:/离合器/,cable:/电缆/,brake:/制动器|刹车/, 'power-supply':/开关电源|电源模块|电源模组|直流电源/,'barcode-scanner':/扫码|扫描|读码|条码/,
  fan:/风扇|风机/,'electric-cylinder':/电动缸|电缸/,'5g-cpe':/CPE|5G/,fuse:/熔断器|保险丝/,muffler:/消声器|消音器/,'hmi-panel':/触摸屏|操作面板|HMI/,
  'control-board':/控制板|主控板|显示板|脉冲控制器/,reducer:/减速机|减速器/,'v-belt':/三角带|V带|V型带|同步带|齿楔带/,'sieve-mesh':/筛网|筛片|筛格|钢丝布/,
  bucket:/畚斗|料斗/ ,backstop:/止逆器|逆止器/,'idler-roller':/托辊|辊筒|滚筒/,'rubber-spring':/橡胶弹簧|减振弹簧/,'caster-wheel':/万向轮|脚轮/
}
const ledger=JSON.parse(fs.readFileSync(path.join(root,'server/data/original-workshop-spare-parts.v2.json'),'utf8'))
const candidates=ledger.records.map(r=>({code:r.materialCode,name:r.materialDesc,candidates:Object.entries(families).filter(([key,re])=>fs.existsSync(path.join(assets,key+'.glb'))&&re.test(r.materialDesc)).map(([key])=>key)}))
const unmatched=candidates.filter(r=>!r.candidates.length)
const models=fs.readdirSync(assets).filter(f=>f.endsWith('.glb'))
const invalid=[]
for(const file of models){try{const b=fs.readFileSync(path.join(assets,file));if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error('GLB header');const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());if(!j.meshes?.length||(j.buffers||[]).some(v=>v.uri))throw Error('mesh/buffer');if(!fs.existsSync(path.join(assets,file.replace(/\.glb$/,'.jpg'))))throw Error('missing image')}catch(e){invalid.push({file,error:e.message})}}
const report={checkedAt:new Date().toISOString(),sourceGeneratedAt:ledger.generatedAt,scope:'Local historical raw-grain ledger only; keyword candidates do not prove live association or accurate shape.',categoryModels:models.length,invalid,ledgerRows:candidates.length,hasCandidate:candidates.length-unmatched.length,unmatched,candidates}
fs.writeFileSync(path.join(root,'output/model-coverage-20260908.json'),JSON.stringify(report,null,2))
const md=['# 模型覆盖核对（2026-09-08）','','本地有 '+models.length+' 个类别 GLB 和 7 个照片参考模型。类别模型基础结构及对应 JPG 检查：'+(invalid.length?'发现 '+invalid.length+' 项异常':'全部通过')+'。','',`核对台账：原粮车间 ${candidates.length} 条，源数据生成于 ${ledger.generatedAt}。按名称保守匹配，${candidates.length-unmatched.length} 条有候选类别，${unmatched.length} 条需要补充或人工复核。候选只用于排查，不代表形状准确，也不代表线上已关联。`,'','线上核对尚未完成：本地配置无法登录数据库，浏览器访问提供的网址暂时为空白页。不能给出当前所有车间的实际覆盖率。','','## 未找到明确类别的历史台账条目','','| 编码 | 备件描述 |','| --- | --- |',...unmatched.map(r=>'| '+r.code+' | '+r.name.replaceAll('|',' / ')+' |'),'','## 关联和近似模型问题','','- V1.4.1 新增 7 类别的迁移不修改 parts.category_model_id，因此登记类别后仍需核对物料关联。','- 钢丝绳与电缆、滤袋与滤网、爆破片与普通阀门、液压纠偏装置与普通气缸不应仅凭追加关键词视为准确模型覆盖。','- 轴承座含轴承等总成也需查看实际形状，不能只按名称里的“轴承”认定完整。','- 原来缺在源码 public 中的 18 个资产已补回，后续构建和发布包需再次逐项检查。','']
fs.writeFileSync(path.join(root,'docs/MODEL_COVERAGE_20260908.md'),md.join('\n'))
console.log(JSON.stringify({categoryModels:models.length,invalid,rows:candidates.length,unmatched},null,2))

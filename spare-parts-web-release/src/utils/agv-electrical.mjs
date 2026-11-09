export const electricalSource={knowledgeId:20,pages:25,title:'古井贡酒激光潜伏AGV',note:'按原图分系统整理，点击查看对应PDF页。图纸采用的器件与现场改造可能不同，接线前须核对实车。'}
export const electricalGroups=[
 {id:'power',title:'供电与保护',code:'48V / 24V / 5V',pages:[{n:4,title:'主电路 · 图号 /1'},{n:5,title:'稳压电路 · /2'},{n:6,title:'滤波电路 · /3'},{n:23,title:'无接触供电 · /20'},{n:24,title:'分流稳压及充电控制 · /21'}],description:'主电路分配顶升、左右驱动、抱闸、稳压及交换机供电；稳压页标有48V转24V、5V，供电页包含TPM、EKK E12与充电控制。',evidence:'PDF第4–6、23–24页',photo:5},
 {id:'control',title:'控制与输入输出',code:'CVC700 · VMC20',pages:[{n:7,title:'主控制电路 · /4'},{n:8,title:'器件供电 · /5'},{n:15,title:'VMC20输入 · /12'},{n:16,title:'CVC700A · /13'},{n:17,title:'CVC700B · /14'},{n:19,title:'VMC20输出 · /16'}],description:'主控制、器件供电、输入检测与输出控制按原图分别查看；输入页列出急停、触边、升降上下限和载货检测等信号。',evidence:'PDF第7–8、15–17、19页',photo:2},
 {id:'drive',title:'行走与顶升',code:'左驱动 · 右驱动 · 顶升伺服',pages:[{n:12,title:'左驱动控制 · /9'},{n:13,title:'右驱动控制 · /10'},{n:14,title:'顶升伺服控制 · /11'}],description:'左右驱动分别有控制器、编码器与制动接口；顶升页单独列出伺服及其接口。机械位置可与整车结构中的驱动轮组、丝杆升降机构对照。',evidence:'PDF第12–14页',photo:3},
 {id:'safety',title:'急停与安全检测',code:'SR1 · TIM310 · 安全触边',pages:[{n:18,title:'TIM310控制 · /15'},{n:20,title:'安全电路 · /17'}],description:'安全页包含SR1安全继电器、急停按钮及回路；TIM310页列出前后雷达及OSSD等信号。这里只解释组成，不能据此短接或绕过安全回路。',evidence:'PDF第18、20页',photo:1},
 {id:'communication',title:'导航与通信',code:'PGV · LS2000 · CANBUS',pages:[{n:10,title:'PGV控制 · /7'},{n:11,title:'LS2000控制 · /8'},{n:22,title:'CANBUS通信 · /19'}],description:'PGV、LS2000及CANBUS各有独立图页，原图展示CAN_H、CAN_L、CAN_GND和相关设备。照片里的绿色线缆仅作位置对照，不凭颜色认定协议或端口。',evidence:'PDF第10–11、22页',photo:1},
 {id:'operator',title:'操作与端子',code:'MCD8 · 蜂鸣器 · XT端子',pages:[{n:9,title:'MCD手操器 · /6'},{n:21,title:'蜂鸣器控制 · /18'},{n:25,title:'端子接线 · /22'}],description:'手操器、蜂鸣器与端子编号分别保留在原图；从端子接线页核对XT系列端子，具体线号和端子位以PDF及实车标识为准。',evidence:'PDF第9、21、25页',photo:4}
]

export function electricalCatalog(variant='old',family='latent'){
 if(family!=='latent')return forkliftElectricalCatalog(family)
 if(variant==='old')return {source:{...electricalSource,title:'潜伏式AGV（老）电路图',documentTitle:electricalSource.title},groups:electricalGroups};
 if(variant!=='new')throw new Error('Unknown AGV variant');
 return {source:{knowledgeId:26,pages:25,title:'潜伏式AGV（新）电路图',documentTitle:'古井贡酒激光潜伏AGV-加车Kinco',note:'新车使用知识库标注新车的Kinco电路图，与老车图纸分别查看。'},groups:electricalGroups.map(g=>g.id==='drive'?{...g,pages:[{n:12,title:'左右驱动控制 · /9'},{n:13,title:'驱动抱闸控制 · /10'},{n:14,title:'顶升伺服控制 · /11'}],code:'Kinco A5/A6 · 独立抱闸',description:'新车第12页同时绘出左右驱动器A5/A6及X1至X5接口；第13页单独展示左右驱动抱闸回路，第14页为顶升伺服。与老车分开的左右驱动控制页不同。',evidence:'新车PDF第12–14页'}:{...g,evidence:'新车'+g.evidence})};
}

function forkliftElectricalCatalog(family){
 const flip=family==='flipping';if(!flip&&family!=='counterweight')throw Error('Unknown AGV family')
 const shift=n=>n+(flip&&n>=13?1:0),page=(n,title)=>({n:shift(n),title})
 return {source:{knowledgeId:flip?25:24,pages:flip?28:27,title:(flip?'翻曲车':'平衡重')+'电路图',note:'各系统对应本车型的原图页；接线和参数以原图及现场标识核对。'},groups:[
 {id:'power',title:'电池与供电',code:'主电路 · 稳压 · 电池管理',pages:[page(4,'主电路'),page(6,'稳压电路'),page(7,'滤波电路'),page(8,'器件供电'),page(25,'电池管理')],description:'车载电池向行走、转向、液压泵和控制设备供电，电池管理回路负责状态监测。'},
 {id:'control',title:'控制与输入输出',code:'CVC700 · VMC20',pages:[page(5,'主控制电路'),page(17,'VMC20输入'),page(18,'CVC700输入'),page(20,'CVC700输出'),page(21,'VMC20输出')],description:'控制器接收操作与检测信号，输出行走、转向、泵及指示控制；输入输出各有独立图页。'},
 {id:'drive',title:flip?'行走、起升与翻转':'行走与起升',code:flip?'驱动 · 转向 · 起升 · 翻转/夹紧':'驱动 · 转向 · 液压泵',pages:[page(9,'驱动与转向电机'),page(10,'驱动控制'),page(11,'转向控制'),page(12,flip?'起升泵控制':'油泵控制'),...(flip?[{n:13,title:'翻转泵控制'}]:[]),page(23,'货叉高度检测')],description:flip?'行走、转向、起升与翻转/夹紧分别有对应控制图页；查看泵组和阀输出的控制关系，货叉高度另有检测回路。':'驱动、转向和液压泵各自控制，货叉高度检测用于反馈起升位置。'},
 {id:'safety',title:'急停与安全检测',code:'安全回路 · S300',pages:[page(15,'安全电路一'),page(16,'安全电路二'),page(19,'S300前方扫描器')],description:'急停、安全检测与前方扫描器共同参与车辆安全控制。通过对应图页核对信号和连接。'},
 {id:'communication',title:'导航与通信',code:'LS2000 · CANBUS · 5G',pages:[page(14,'LS2000导航'),page(24,'CANBUS通信'),page(26,'5G通信')],description:'导航雷达为定位提供信息，CANBUS连接车载控制设备，5G用于车辆通信。'},
 {id:'operator',title:'操作与端子',code:'MCD8 · 声光 · XT',pages:[page(13,'MCD8手操器'),page(22,'声光指示'),page(27,'端子接线')],description:'手操器、声光指示与端子接线集中查看；按线号和端子位与实车核对。'}
 ].map(g=>({...g,evidence:'PDF第'+g.pages.map(p=>p.n).join('、')+'页'}))}
}

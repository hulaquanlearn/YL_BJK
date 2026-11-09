// 智能行车原工程的"非敏感结构/工艺摘要"，供网页技术资料与演示说明复用。
//
// 来源：2026-11-06 对本机奋进机器人编程与仿真工具中"古井一车间智能行车"工程
// 的只读复核（控制器按 16 轴关节式设备组织：A0–A15、9 个机构）。这里只保留
// 机构/轴/单位、工艺动作与流程顺序；不包含原始程序、PLC/Yx 地址、现场网络
// 标识、人员信息和运行标定值，也不构成操作授权或验收。
//
// 8 个演示轴 id 与 crane-state.mjs 的 craneAxes 完全一致；第 9 项是控制器真实
// 的 2D 云台轴（A15），对应 crane-state 的 scan 演示轴（0 / 约 90°）。

function deepFreeze(value){
 if(Array.isArray(value)){for(const item of value)deepFreeze(item);return Object.freeze(value)}
 if(value&&typeof value==='object'){for(const key of Object.keys(value))deepFreeze(value[key]);return Object.freeze(value)}
 return value
}

// 9 个机构、16 个伺服轴。unit 为程序读取坐标时的物理单位：直线 mm、旋转 rad；
// 控制器内部按 0.001 单位存储，这里不展开原始数值。
export const craneProgramAxes=deepFreeze([
 {id:'travel',label:'大车行走',controllerAxes:['A0','A1'],unit:'mm',description:'两台伺服成对驱动，沿车间轨道行走；位置由读码条码值参与坐标运算。'},
 {id:'trolley',label:'伸缩小车行走',controllerAxes:['A2','A3'],unit:'mm',description:'两台伺服成对驱动，沿主梁跨度方向行走，以激光测距定位。'},
 {id:'hoist',label:'伸缩提升',controllerAxes:['A4','A5'],unit:'mm',description:'两台伺服经卷扬成对驱动，控制抱斗高度；最高与最低为控制器配置值。'},
 {id:'rotation',label:'抓斗换向（0° / 90°）',controllerAxes:['A8'],unit:'rad',description:'单轴回转，程序只有 0 与约 90° 两个方向位；换向受张开量阈值条件限制，具体阈值为现场配置。'},
 {id:'grip',label:'抓斗开合',controllerAxes:['A6','A7'],unit:'mm',description:'两台电动推杆成对驱动，以开合尺寸表示并有同步偏差检查；换向对张开量有条件限制，具体阈值为现场配置。'},
 {id:'transfer',label:'周转小车行走',controllerAxes:['A9','A10'],unit:'mm',description:'两台伺服成对驱动，沿主梁内侧悬挂轨道行走，与伸缩小车共用跨度方向。'},
 {id:'transferHoist',label:'周转提升',controllerAxes:['A11','A12'],unit:'mm',description:'两侧卷扬成对驱动，提升吊架保持水平，剪叉与绳长随升降变化。'},
 {id:'flip',label:'周转翻转（双向）',controllerAxes:['A13','A14'],unit:'rad',description:'双驱翻转内框，水平为 0；倒糟时向两侧可到接近 180°，方向由倒料方向决定。'},
 {id:'scan',label:'2D 扫描云台',controllerAxes:['A15'],unit:'rad',description:'云台自身由独立A15轴转到0或约90°进行扫描定位；安装支架随翻转内框运动，A15自身转角独立于A13/A14翻转角。'}
])

// 14 个调度动作（原程序的工艺动作集合）。handler 用工序处理名描述，不写原始
// 函数名；具体顺序见 craneProgramFlows。
export const craneProgramActions=deepFreeze([
 {id:'get-vector',label:'取斗',handler:'取放斗流程'},
 {id:'put-vector',label:'放斗',handler:'取放斗流程'},
 {id:'put-material',label:'入池',handler:'入池倒糟流程'},
 {id:'get-material',label:'出池',handler:'自动抓糟流程'},
 {id:'move-pos',label:'移动到位置',handler:'定位移动'},
 {id:'transfer',label:'转运',handler:'转运流程'},
 {id:'scan',label:'扫描',handler:'2D 扫描定位'},
 {id:'null',label:'空',handler:'无动作'},
 {id:'transfer-top',label:'转移覆盖糟',handler:'覆盖糟转移流程'},
 {id:'anti-transfer',label:'反运',handler:'反运流程'},
 {id:'tread-material',label:'踩窖',handler:'踩窖流程'},
 {id:'flat-material',label:'抓平',handler:'抓平流程'},
 {id:'get-material-bottom',label:'池底抓糟',handler:'池底抓糟流程'},
 {id:'get-cover',label:'取盖',handler:'取池盖流程'}
])

// 主要工艺流程。steps 是工序顺序说明，不含控制器地址、速度或精确角度值。
export const craneProgramFlows=deepFreeze([
 {
  id:'get-vector',
  label:'取斗流程',
  steps:['大车、小车与周转小车移动到取斗位上方','辊道锁定并做 2D 扫描确认斗位','周转提升到取斗高度并小幅下探','确认料斗检测信号','插销动作到位','周转提升回到移动安全高度','2D 扫描缩回或伸出，转入下一动作']
 },
 {
  id:'put-vector',
  label:'放斗流程',
  steps:['大车、小车与周转小车移动到放斗位上方','辊道锁定并做 2D 扫描确认空位','周转提升到放斗高度并小幅下探','确认料斗检测与插销状态','周转提升回到移动安全高度','2D 扫描恢复到移动模式']
 },
 {
  id:'put-material',
  label:'入池倒糟流程',
  steps:['2D 扫描当前窖池，确认料面与倒糟位置','大车、小车与周转小车联动到倒糟位上方','周转翻转内框分段推进，同时调整行走与升降，把糟醅倒入窖池','翻转回到水平，检查插销与限位信号','按设置决定是否继续抓平后返回']
 },
 {
  id:'get-material',
  label:'出池抓糟流程',
  steps:['2D 扫描窖池，确认料面高度与所在层数','抱斗张开并下降到抓取高度','抱斗闭合抓料后提升','按抓糟次数与层数循环抓取，池底或双轮底时切换分支','大车移动到出糟位或空斗位','按需转运或放斗']
 },
 {
  id:'transfer',
  label:'转运流程',
  steps:['2D 扫描缩回','周转提升到转运高度','抱斗旋转到闭合方向位','抱斗与周转剪切机构贴合，必要时先张开放料','抱斗张开到最大，把物料转入周转斗','抱斗张开完成后本流程返回（不自动回安全姿态）']
 },
 {
  id:'anti-transfer',
  label:'反运流程',
  steps:['周转提升到转运高度，抱斗与周转机构贴合','抱斗张开并下降到取料高度','抱斗闭合抓取转运斗内物料','提升到周转机构上方','大车、小车移动到撒料位','下降并张开抱斗放料','提升回最高并闭合']
 },
 {
  id:'transfer-top',
  label:'转移覆盖糟流程',
  steps:['扫描覆盖糟位置','检查周转机构与抱斗的避让空间','抓取覆盖糟并提升','转运到目标位置卸载','按流程完成抓取与转移后返回']
 },
 {
  id:'tread-material',
  label:'踩窖流程',
  steps:['定位到窖池踩窖位置','下降到踩窖高度','按步进距离分段下压','提升并移动到下一位置','按设定次数重复后返回']
 },
 {
  id:'flat-material',
  label:'抓平流程',
  steps:['扫描窖池并计算抓平取料与放料位置','抓取高出料面部分','移动到低处放料','必要时刮平并复扫','按轮次重复到料面满足要求']
 },
 {
  id:'get-material-bottom',
  label:'池底抓糟流程',
  steps:['扫描池底并判断排次与双轮底状态','抱斗张开下降到池底抓取高度','闭合抓取并提升','按排次移动到放料位卸载','记录池底状态后返回']
 },
 {
  id:'get-cover',
  label:'取盖流程',
  steps:['定位到窖池盖位置','张开抱斗并对位盖体','暂停，等待人工确认吊带已绑好','分段提升、横移到目标位置','暂停，等待人工确认吊带已松开','闭合抱斗并提升回安全位']
 },
 {
  id:'scan',
  label:'2D 扫描流程',
  steps:['按动作选择扫描模式（移动缩回、伸出、取斗、放斗、倒糟）','2D 云台转到对应方向位','采集点云并分析料面/斗位','结果用于定位、抓放与翻转决策','扫描结束恢复移动模式']
 }
])


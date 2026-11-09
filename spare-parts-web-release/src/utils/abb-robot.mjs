import {Matrix4,Vector3} from 'three'
import {robotDisassemblyOffset} from './abb-robot-disassembly.mjs'
import {createFeedStation} from './abb-feed-station.mjs'
import {createInfraredCamera} from './abb-infrared-camera.mjs'
import {brewingWorkcell} from './abb-workcell-layout.mjs'

export const robotModelUrl='/models/abb-irb6700/irb6700-150-320.glb'
export const robotTitle='ABB IRB 6700-150/3.20'
// ABB uses Z up. Vectors below include the CAD-to-glTF basis conversion.
// The wrist transform comes from MechanismDef 19 / Flanges / wrist in PIM.xml.
export const robotFrames=[
  {id:'base',label:'基坐标系',parent:'base',position:[0,0,0],length:.55,x:[1,0,0],y:[0,0,-1],z:[0,1,0]},
  {id:'flange',label:'法兰坐标系',parent:'axis6',position:[2.1125,2.26,0],length:.32,x:[0,-1,0],y:[0,0,-1],z:[1,0,0]}
]
export const robotGroups=[
  {label:'底座与臂体',ids:['base','axis1','axis2','axis3']},
  {label:'腕部与法兰',ids:['axis4','axis5','axis6']},
  {label:'线缆与平衡机构',ids:['cable1','cable2','cable3','balance1','balance2']}
]
export const robotTools=[
  {id:'tool-640',label:'640 布料头',url:'/models/abb-irb6700/tool-640.glb?v=20261104-yellow-open-batched'},
  {id:'tool-700',label:'700 布料头',url:'/models/abb-irb6700/tool-700.glb?v=20261104-yellow-open-batched'}
]
export const robotEquipmentParts=[
  {id:'tool',label:'布料头',description:'安装在机器人末端法兰上的布料工具，用于暂存、输送并向甑锅内铺放物料。机器人调整位置和姿态，布料头完成末端出料；可切换 640、700 两种本机模型。'},
  {id:'pot-left',label:'左甑锅',description:'按酿酒机器人程序保存的左甑锅标定位置、倾斜角和锅内尺寸显示，采用304不锈钢外观。'},
  {id:'pot-right',label:'右甑锅',description:'按酿酒机器人程序保存的右甑锅标定位置、倾斜角和锅内尺寸显示。标签、选中和显隐独立对应当前锅体。'},
  {id:'feed-station',label:'上甑喂料机',description:'上方链板向下方暂存斗供料，气缸驱动底部闸板。出料口悬在机器人布料头接料区域上方，机器人接料后离开并前往甑锅。'},
  {id:'infrared-camera',label:'AT20 / DS77pro 相机盒',description:'AT20红外和DS77pro测高共用一个盒子与一根悬杆，一起移动、一起收起。待机回两锅中间，上甑移到对应锅中心上方；测高、红外区域、测温握手分别对应原程序通道。当前为离线模拟，未接真实热像与点云；支架尺寸及运动参数为展示近似。'}
]
export const robotEquipmentGroup={label:'供料、布料与甑锅',ids:robotEquipmentParts.map(part=>part.id)}
export const robotPlantEquipment=[
 {id:'feed-station',create:()=>createFeedStation({outletHeight:brewingWorkcell.feeder.outletHeight,outletWidth:.35,outletDepth:.20}),position:brewingWorkcell.feeder.position,rotationY:brewingWorkcell.feeder.rotationY},
 {id:'infrared-camera',create:()=>createInfraredCamera(brewingWorkcell.pots),position:[0,0,0]}
]
export const robotReceivingJoints=brewingWorkcell.receivingJoints
export const robotPotStations=brewingWorkcell.pots
export function stainlessEquipment(root){
 root.traverse(node=>{
  if(!node.isMesh)return
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   if(!material?.color)continue
   if(material.name==='yellow-conveyor-belt')continue
   const hsl=material.color.getHSL({})
   // Preserve dark rubber belts and seals; the exposed equipment metal is silver.
   if(hsl.l<.055&&hsl.s<.15){material.metalness=.05;material.roughness=.82;continue}
   material.color.set('#b9c2c7');material.metalness=.72;material.roughness=.34;material.opacity=1;material.transparent=false
   material.name='304 stainless steel appearance'
  }
 })
 return root
}
export const robotParts=[
  {id:'base',label:'固定底座',description:'把机器人固定在安装基础上，承受机器人自重及运动产生的力和力矩，为各轴运动提供稳定支撑。'},
  {id:'axis1',label:'1 轴 · 回转座',description:'带动整个臂体绕底座竖直轴回转，改变机器人面向的作业区域，完成不同工位之间的方向切换。'},
  {id:'axis2',label:'2 轴 · 下臂',description:'使主臂前后摆动，与 3 轴配合改变末端工具的高度和前后位置，是机器人抬臂、伸向作业区域的主要关节。'},
  {id:'axis3',label:'3 轴 · 上臂连接体',description:'相当于机器人的肘关节，调整前臂与下臂之间的夹角，与 2 轴配合完成伸臂、收臂及末端位置调整。'},
  {id:'axis4',label:'4 轴 · 前臂',description:'使前臂绕自身的纵向轴线回转，带动腕部和工具改变姿态，使工具能从合适的方向接近作业位置。'},
  {id:'axis5',label:'5 轴 · 腕部',description:'控制腕部摆动，改变工具的倾斜角度。与 4、6 轴配合，使布料头或其他末端工具保持所需的作业姿态。'},
  {id:'axis6',label:'6 轴 · 工具法兰',description:'连接布料头等末端工具，并带动工具绕法兰轴线自转，用于调整工具的朝向。工具切换时更换的是法兰外侧的工具总成。'},
  {id:'cable1',label:'回转座线缆',description:'在底座和回转臂体之间传递电源及控制、反馈信号，随 1 轴回转布置，连接固定部分与运动部分。'},
  {id:'cable2',label:'下臂线缆',description:'沿下臂向上连接驱动和信号线路，随主臂摆动，为上部关节与腕部的电气连接提供通路。'},
  {id:'cable3',label:'上臂线缆',description:'把电源和信号继续引向前臂、腕部，适应臂体及腕部的姿态变化，避免线路直接承受关节运动拉力。'},
  {id:'balance1',label:'平衡机构 · 主体',description:'辅助平衡主臂的重力负载，减轻关节驱动的负担，使臂体抬升、下降时保持较平稳的受力状态。'},
  {id:'balance2',label:'平衡机构 · 连接件',description:'连接平衡机构和臂体，传递平衡力，并随主臂摆动改变连接角度，让平衡机构持续参与承载。'}
]

// The source CAD already places all components in assembly coordinates.
// Stage order is shared with the joint-driven viewer; zero restores exact CAD.
export function applyRobotSpread(root,amount){
  const spread=Math.max(0,Math.min(1,Number(amount)||0))
  for(const part of robotParts){const node=root.getObjectByName(part.id);if(node){node.position.copy(robotDisassemblyOffset(part.id,spread));if(node.userData.assemblyPosition)node.position.add(node.userData.assemblyPosition)}}
  root.updateMatrixWorld(true)
}

// Static display pose: J5 = 90 degrees, within the source model's ±130° range.
// Its pivot is the inverse of Link5's CorrectionTransform in the ABB library.
export function applyRobotWristPose(root){
  const pivot=new Vector3(1.9125,2.26,0)
  const pose=new Matrix4().makeTranslation(...pivot.toArray()).multiply(new Matrix4().makeRotationZ(-Math.PI/2)).multiply(new Matrix4().makeTranslation(...pivot.clone().negate().toArray()))
  for(const id of ['axis5','axis6']){const node=root.getObjectByName(id);node.applyMatrix4(pose);node.userData.assemblyPosition=node.position.clone()}
  root.updateMatrixWorld(true)
}

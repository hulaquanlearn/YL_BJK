import * as THREE from 'three'
export const functionalGroups=[
 {id:'body',label:'车体与护罩',description:'底架承载整车部件，护罩保护内部机构；安全触边向安全回路反馈接触信号。',parts:['chassis','left-cover','right-cover','rear-cover']},
 {id:'lift',label:'顶升系统',description:'伺服电机带动丝杆升降，剪叉机构导向，推动载货平台完成顶升与下降。',parts:['platform','lift']},
 {id:'drive',label:'行走与抱闸',description:'左右轮组配合完成行走和转向，驱动器控制电机，抱闸回路负责对应制动控制。',parts:['drive-left','drive-right','kinco-left','kinco-right']},
 {id:'power',label:'供电与储能',description:'取电板接收能量，经TPM转换后进入车载供电回路；EKK与EKV超级电容配合进行能量管理。',parts:['pickup','tpm','ekk','supercapacitor']},
 {id:'control',label:'控制与操作',description:'操作面板提供人机交互，控制器汇总操作、导航及检测信号，协调车辆各执行机构。',parts:['control','operator-panel']},
 {id:'safety',label:'导航与避障',description:'导航雷达参与定位，避障雷达检测周围障碍物，并将检测信息交给控制及安全回路。',parts:['sensors']}
]
const offsets={chassis:[0,0,0],platform:[0,1.1,0],'left-cover':[0,.65,1.02],'right-cover':[0,.65,-1.02],'operator-panel':[1.04,.18,0],'rear-cover':[-1.04,.18,0],'drive-left':[.05,.12,.6],'drive-right':[.05,.12,-.6],lift:[0,.61,0],control:[-.48,.42,-.3],tpm:[.54,.3,-.56],pickup:[.2,.08,.98],ekk:[.45,.28,.52],supercapacitor:[-.56,.27,.45],sensors:[-.7,.34,-.72],'kinco-left':[.78,.45,.34],'kinco-right':[.78,.45,-.34]}
export const explodedOffset=id=>offsets[id]||[0,.6,0]
export function presentationOffset(part){return part.parent?.userData.sourceKnowledgeId===21?explodedOffset(part.name):part.userData.presentationOffset||explodedOffset(part.name)}
export function groupsFor(family='latent'){
 if(family==='latent')return functionalGroups
 return [
  {id:'body',label:'车体与护罩',description:'底盘承载门架及动力系统，后部机罩保护电气和液压设备，配重平衡前方载荷。',parts:['chassis','hood']},
  {id:'lift',label:'门架与起升',description:'液压油缸与链条推动滑架沿门架升降，承载货叉托举货物，前轮或支腿支撑前方载荷。',parts:['mast','hydraulic-lift','forks','load-wheels','outriggers']},
  ...(family==='flipping'?[{id:'rotation',label:'翻转与夹持',description:'上下货叉与侧挡板约束货物，夹紧后由翻转机构带动夹持架回转，位置由对应检测信号确认。',parts:['rotation','clamp','side-plates']}]:[]),
  {id:'drive',label:'行走与转向',description:'后部驱动转向轮组提供行走动力并控制转向，编码器反馈运动状态。',parts:['steering-drive']},
  {id:'power',label:'电池与液压',description:'车载电池为驱动和控制供电，液压泵将电能转为液压动力，充电接口连接车辆充电回路。',parts:['battery','pump','charging']},
  {id:'control',label:'控制与操作',description:'控制器处理操作、导航与检测信号，通过驱动器和输出回路协调行走、转向及泵组。',parts:['control','operator-panel']},
  {id:'safety',label:'导航与避障',description:'高位雷达用于导航定位，低位扫描器检测障碍物并参与车辆安全控制。',parts:['sensors']}
 ]
}
export const latentDescriptions={
 chassis:'承载顶升机构、驱动轮组与电气部件，前后缓冲结构保护车体。',
 platform:'承托货物，随顶升机构升降；载货检测开关用于确认平台上的货物。',
 'left-cover':'保护左侧轮组及内部部件，散热开口帮助内部设备通风。',
 'right-cover':'保护右侧轮组及内部部件，拆开后可查看对应电气和机械布局。',
 'rear-cover':'后部护罩保护内部器件；安全触边在接触障碍物时向安全回路提供信号。',
 'operator-panel':'查看车辆信息，连接手操器，使用模式切换、急停和复位等操作按钮。',
 'drive-left':'电机和减速机构带动左侧行走轮，编码器反馈运动信息，与右轮配合完成行走和转向。',
 'drive-right':'电机和减速机构带动右侧行走轮，与左轮配合完成行走和转向。',
 lift:'伺服电机驱动丝杆升降，剪叉导向机构保持平台运动方向，限位开关反馈升降位置。',
 control:'接收操作、导航及检测信号，协调驱动、顶升与安全回路，电气板提供供电分配及连接。',
 pickup:'车底两块取电板以非接触方式接收无线供电站提供的能量，再送入车载电源变换器。',
 tpm:'接收取电板的能量并转换成车载供电，连接后续供电分配及储能回路。',
 ekk:'连接供电与超级电容储能回路，参与能量转换与充放电控制。',
 supercapacitor:'储存电能，在车辆离开供电区域时参与车载能量供给，与EKK回路配合工作。',
 sensors:'导航雷达参与车辆定位，避障雷达检测周围障碍物，并向控制及安全回路反馈。',
 'kinco-left':'新车左驱动器A5控制左轮电机，接口连接控制、反馈及电机回路；抱闸另有对应控制图。',
 'kinco-right':'新车右驱动器A6控制右轮电机，与左驱动器配合实现车辆行走和转向。'
}
export function toggleRestored(current,ids){const next=new Set(current),remove=ids.every(id=>next.has(id));for(const id of ids)remove?next.delete(id):next.add(id);return next}
export function createPartHighlighter(parts){
 const originals=new Map(),clones=new Map(),dimmed=new Map()
 for(const part of parts)part.traverse(mesh=>{if(mesh.isMesh)originals.set(mesh,mesh.material)})
 function bright(material){if(clones.has(material))return clones.get(material);const copy=material.clone();if(copy.emissive){copy.emissive.setHex(0x169c43);copy.emissiveIntensity=.24}if(copy.color)copy.color.setHex(0x46c96b);clones.set(material,copy);return copy}
 function dim(material){if(dimmed.has(material))return dimmed.get(material);const copy=material.clone();if(copy.color)copy.color.multiplyScalar(.35);if(copy.emissive)copy.emissive.multiplyScalar(.1);copy.transparent=true;copy.opacity=.16;copy.depthWrite=false;dimmed.set(material,copy);return copy}
 function select(ids=[]){const chosen=new Set(ids);for(const part of parts)part.traverse(mesh=>{if(!originals.has(mesh))return;const original=originals.get(mesh),convert=chosen.has(part.name)?bright:chosen.size?dim:null;mesh.material=convert?Array.isArray(original)?original.map(convert):convert(original):original})}
 return {select,dispose(){select();for(const material of [...clones.values(),...dimmed.values()])material.dispose();clones.clear();dimmed.clear()}}
}
// Two balanced rails keep every assembly name visible. The complete list is
// also available outside the canvas so small screens never lose a part.
export function layoutAgvLabels(anchors,width,height,{leftBottom=0,rightBottom=0}={}){
 const w=Math.min(160,Math.max(105,width*.23)),gap=6,top=65
 const sorted=[...anchors].sort((a,b)=>a.x-b.x||a.id.localeCompare(b.id)),half=Math.ceil(sorted.length/2),labels=[]
 for(const [side,items] of [[0,sorted.slice(0,half)],[1,sorted.slice(half)]]){
  const bottom=height-48-(side?rightBottom:leftBottom),h=Math.min(52,Math.max(22,(bottom-top-gap*Math.max(0,items.length-1))/Math.max(1,items.length)))
  items.sort((a,b)=>a.y-b.y||a.id.localeCompare(b.id));const step=h+gap,start=top+Math.max(0,(bottom-top-items.length*step+gap)/2)
  items.forEach((a,i)=>{const x=side?width-w-10:10,y=start+i*step,endX=side?x:x+w,endY=y+h/2;labels.push({...a,x,y,anchorX:a.x,anchorY:a.y,width:w,height:h,path:'M'+a.x.toFixed(1)+','+a.y.toFixed(1)+' L'+endX.toFixed(1)+','+endY.toFixed(1)})})
 }
 return labels
}

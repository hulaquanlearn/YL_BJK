import {Vector3} from 'three'

const side=x=>x<0?'左侧':'右侧'
const end=z=>z<0?'南端':'北端'
const within=(mesh,group)=>{for(let n=mesh;n;n=n.parent)if(n===group)return true;return false}
// Select functional pieces within a moving module, while leaving the model's
// rig/disassembly roots unchanged. A rail, jaw, wheel or motor gets its own ID.
function piece(part,mesh,p,rig){
 const id=part.name,g=mesh.geometry,sz=g.parameters||{},s=side(p.x),e=end(p.z),base=part.userData.label
 if(id==='bridge-girder'){
  if(p.y>6)return ['rail-'+s,s+'梁顶小车轨道',4]
  if(Math.abs(p.y-4.72)<.02)return ['inner-rail-'+s,s+'周转小车内轨',4]
  return Math.abs(p.x)>.1?['beam-'+s,s+'主梁',1]:['cross-'+e,e+'主梁横向连接板',8]
 }
 if(id==='bridge-walkway'){
  if(Math.abs(p.x)>3.11&&Math.abs(p.z)>8.3&&Math.abs(p.z)<9.6)return ['gate-'+s,s+'检修安全门',3]
  if(Math.abs(p.z)>10)return ['end-'+e,e+'检修通道',8]
  return p.y>6.2?['rail-'+s,s+'走台护栏',4]:['deck-'+s,s+'检修走台',2]
 }
 if(id==='runway')return p.y<3?['column-'+e+'-'+Math.round(p.x),e+'轨道立柱（'+(p.x< -1?'一':p.x>1?'三':'二')+'）',9]:['track-'+e,e+'车间轨道梁',9]
 if(id.startsWith('endcarriage-')){
  if(Math.abs(p.x)>3.1)return ['buffer-'+s,e+s+'缓冲器',7]
  if(Math.abs(p.x)>2)return ['wheel-'+s,e+s+'大车车轮',3]
  return ['beam',base,3]
 }
 if(id==='travel-motors')return [e,e+'大车行走伺服电机',2]
 if(id==='trolley-frame'){
  if(p.y>7.25)return ['drum','伸缩提升卷筒',3]
  if(p.y>7)return ['deck','伸缩小车检修平台',4]
  if(p.y<6.55)return ['guide','伸缩臂导向座',6]
  return ['frame','伸缩小车车架',2]
 }
 if(id==='trolley-drive')return Math.abs(p.z)>.8?[s+'-motor',s+'伸缩小车行走电机',3]:[s+e,s+e+'伸缩小车车轮',5]
 if(id==='trolley-cabinet')return p.x>0?['cabinet','伸缩小车动力柜',4]:[p.z<-.3?'grab1':'grab2',p.z<-.3?'抓斗动力柜（一）':'抓斗动力柜（二）',5]
 if(id==='trolley-limit-switches')return p.x>1?[e,e+'小车行程开关',6]:p.y>7.2?['hoist','起升高度限制器',6]:['mast','伸缩臂上限位开关',6]
 if(id==='telescopic-mast'){
  if(within(mesh,rig.stage3))return ['stage3','伸缩提升臂·内节',4]
  if(within(mesh,rig.stage2))return ['stage2','伸缩提升臂·中节',4]
  if(sz.radiusTop===.014)return ['rope-'+Math.round(p.x*10)+'-'+Math.round(p.z*10),'伸缩提升钢丝绳',8]
  if(Math.abs(p.x)>.5)return ['anti-fall','伸缩臂防坠电缸',5]
  return ['outer','伸缩提升臂·外节',2]
 }
 if(id==='grab'){
  if(Math.abs(p.x)>.48&&p.y>-.1)return ['actuator-'+s,s+'抓斗电动推杆',2]
  if(p.y<-.5&&p.y>-.7)return ['bearing','抓斗回转支承',3]
  return ['frame','抓斗承载框架',3]
 }
 if(id==='grab-jaws')return within(mesh,rig.jawA)?['jaw-a','抓斗颚板（一）',1]:['jaw-b','抓斗颚板（二）',1]
 if(id==='grab-limit-switches')return [s+(p.y<-.75?'lower':'upper'),s+'推杆'+(p.y<-.75?'下限位':'上限位')+'开关',7]
 if(id==='transfer-car'){
  if(p.y>4.55&&Math.abs(p.z)<.8)return [s+e,s+e+'周转小车车轮',4]
  if(p.z>.6&&p.y<4.6)return ['drive-'+s,s+'周转小车驱动单元',5]
  return ['frame-'+s,s+'周转小车悬挂架',3]
 }
 if(id==='transfer-hoist'){
  if(sz.radiusTop===.014)return ['rope-'+s+e,s+'周转提升钢丝绳',8]
  return Math.abs(p.x)>1.15?['scissor-'+s,s+'剪叉导向组件',2]:['drum-'+s,s+'周转提升卷扬',3]
 }
 if(id==='turnover-flip')return within(mesh,rig.flipFrame)?['cradle','周转翻转内框',2]:Math.abs(p.x)>1.3?['drive','翻转减速机',5]:['outer','周转翻转外架',2]
 if(id==='laser-gimbal')return within(mesh,rig.scanner)?['scanner','2D激光扫描仪',2]:['mount','2D扫描云台支架',5]
 if(id==='turnover-pushrods'||id==='turnover-pin-switches')return [s+e,s+e+(id==='turnover-pushrods'?'夹持电动推杆':'插销接近开关'),6]
 if(['trolley-hoist-motors','grab-motors','transfer-drive-motors','transfer-hoist-motors','transfer-load-limiters','transfer-hoist-limits'].includes(id))return [s,s+base,4]
 if(id==='transfer-limit-switches')return [e,e+'周转小车行程开关',7]
 if(['alarm-beacon','limit-switches','platform-lights','safety-door-switches','transfer-cabinet'].includes(id))return [e,e+base,6]
 if(id==='cable-chains')return [String(Math.round(p.x*2)/2),'拖链与线槽',8]
 return ['body',base,id==='transfer-hopper'?1:5]
}

export function createCraneComponents(model){
 const components=[],byId=new Map(),byMesh=new Map(),meshes=[],originals=new Map(),clones=new Set(),point=new Vector3()
 model.root.updateMatrixWorld(true)
 for(const part of model.parts)part.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry||[...(Array.isArray(mesh.material)?mesh.material:[mesh.material])].every(m=>m.transparent))return
  mesh.getWorldPosition(point);part.worldToLocal(point)
  const [key,label,priority]=piece(part,mesh,point,model.rig),id=part.name+'/'+key
  let component=byId.get(id)
  if(!component){component={name:id,partId:part.name,meshes:[],priority,userData:{...part.userData,label,description:'所属部装：'+part.userData.label+'。'+part.userData.description},materials:new Map()};byId.set(id,component);components.push(component)}
  originals.set(mesh,mesh.material)
  const clone=source=>{if(!component.materials.has(source)){const copy=source.clone();component.materials.set(source,copy);clones.add(copy)}return component.materials.get(source)}
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material)
  component.meshes.push(mesh);byMesh.set(mesh,component);meshes.push(mesh)
 })
 return {components,byId,byMesh,meshes,
  select(id){for(const c of components)for(const [source,material] of c.materials){material.color?.copy(source.color);if(material.emissive){material.emissive.copy(source.emissive);material.emissiveIntensity=source.emissiveIntensity}if(c.name===id){material.color?.set('#46c96b');if(material.emissive){material.emissive.set('#169c43');material.emissiveIntensity=.24}}}},
  dispose(){for(const [mesh,material] of originals)mesh.material=material;for(const material of clones)material.dispose();clones.clear()}
 }
}

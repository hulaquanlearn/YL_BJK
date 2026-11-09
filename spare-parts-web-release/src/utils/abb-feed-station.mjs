import {BoxGeometry,BufferGeometry,CylinderGeometry,DoubleSide,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Vector3} from 'three'

const SHEET=.016
const GATE_OPEN_RADIANS=1.45
const BARREL_LENGTH=.44

// 每个实例独立创建材质；不能把材质放在模块级共享，否则一个实例 dispose 会影响另一个实例。
function createMaterials(){
  const make=(color,metalness,roughness)=>new MeshStandardMaterial({color,metalness,roughness,side:DoubleSide})
  return {
    metal:make(0xb8c2c8,.78,.32),
    dark:make(0x8d979f,.72,.38),
    gate:make(0xaab4bb,.8,.3),
    cylinder:make(0x9aa6ae,.55,.45),
    chain:make(0x7f8b93,.85,.3)
  }
}
function box(parent,name,size,position,material){
  const mesh=new Mesh(new BoxGeometry(size[0],size[1],size[2]),material)
  mesh.name=name;mesh.position.set(position[0],position[1],position[2]);mesh.castShadow=true;mesh.receiveShadow=true
  parent.add(mesh);return mesh
}
function cylinder(parent,name,radius,length,position,rotation,material){
  const mesh=new Mesh(new CylinderGeometry(radius,radius,length,12,1),material)
  mesh.name=name;mesh.position.set(position[0],position[1],position[2]);if(rotation)mesh.rotation.set(rotation[0],rotation[1],rotation[2]);mesh.castShadow=true
  parent.add(mesh);return mesh
}
// 四壁短管：上下都开口，只保留薄板侧壁；没有顶板/底板。
function openTube(parent,name,outerWidth,outerDepth,height,bottomY,thickness,material){
  const group=new Group();group.name=name;group.userData.part=name;parent.add(group)
  const y=bottomY+height/2
  box(group,name+'-front',[outerWidth,height,thickness],[0,y,outerDepth/2-thickness/2],material)
  box(group,name+'-back',[outerWidth,height,thickness],[0,y,-outerDepth/2+thickness/2],material)
  box(group,name+'-left',[thickness,height,Math.max(.02,outerDepth-2*thickness)],[-outerWidth/2+thickness/2,y,0],material)
  box(group,name+'-right',[thickness,height,Math.max(.02,outerDepth-2*thickness)],[outerWidth/2-thickness/2,y,0],material)
  return group
}
// 薄板棱柱：给定四角（内表面）和向外方向，按厚度生成有厚度的壁板。
function wallPlate(parent,name,corners,outward,thickness,material){
  const inner=corners.map(point=>new Vector3(point[0],point[1],point[2]))
  const normal=new Vector3(outward[0],outward[1],outward[2]).normalize()
  const outer=inner.map(point=>point.clone().addScaledVector(normal,thickness))
  const positions=[]
  for(const point of inner)positions.push(point.x,point.y,point.z)
  for(const point of outer)positions.push(point.x,point.y,point.z)
  const indices=[
    0,2,1, 0,3,2,
    4,5,6, 4,6,7,
    0,1,5, 0,5,4,
    1,2,6, 1,6,5,
    2,3,7, 2,7,6,
    3,0,4, 3,4,7
  ]
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
  geometry.setIndex(indices);geometry.computeVertexNormals()
  const mesh=new Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true
  parent.add(mesh);return mesh
}
function openFrustum(parent,name,topWidth,topDepth,bottomWidth,bottomDepth,height,bottomY,thickness,material){
  const group=new Group();group.name=name;group.userData.part=name;parent.add(group)
  const topY=bottomY+height,tw=topWidth/2,td=topDepth/2,bw=bottomWidth/2,bd=bottomDepth/2
  const walls=[
    ['+z',[[-tw,topY,td],[tw,topY,td],[bw,bottomY,bd],[-bw,bottomY,bd]],[0,0,1]],
    ['-z',[[tw,topY,-td],[-tw,topY,-td],[-bw,bottomY,-bd],[bw,bottomY,-bd]],[0,0,-1]],
    ['+x',[[tw,topY,-td],[tw,topY,td],[bw,bottomY,bd],[bw,bottomY,-bd]],[1,0,0]],
    ['-x',[[-tw,topY,td],[-tw,topY,-td],[-bw,bottomY,-bd],[-bw,bottomY,bd]],[-1,0,0]]
  ]
  for(const [side,corners,outward] of walls)wallPlate(group,name+'-'+side,corners,outward,thickness,material)
  return group
}

// Circular shell extruded along the hinge axis; no flat door substitutes for it.
function curvedGate(parent,width,radius,halfAngle,thickness,material){
 const positions=[],indices=[],steps=24
 for(let i=0;i<=steps;i++){
  const a=-halfAngle+2*halfAngle*i/steps
  for(const x of [-width/2,width/2])for(const r of [radius,radius-thickness])positions.push(x,-r*Math.cos(a),r*Math.sin(a))
 }
 const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d)
 for(let i=0;i<steps;i++){const a=i*4,b=a+4;quad(a,b,b+2,a+2);quad(a+1,a+3,b+3,b+1);quad(a,a+1,b+1,b);quad(a+2,b+2,b+3,a+3)}
 quad(0,2,3,1);const end=steps*4;quad(end,end+1,end+3,end+2)
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals()
 const mesh=new Mesh(geometry,material);mesh.name='gate-plate';mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh
}
function link(parent,name,a,b,width,material){
 const from=new Vector3(...a),to=new Vector3(...b),direction=to.clone().sub(from)
 const mesh=box(parent,name,[width,direction.length(),width],from.clone().add(to).multiplyScalar(.5).toArray(),material)
 mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.normalize());return mesh
}

/**
 * 上甑喂料机可视总成（按现场照片/示意图结构示意，无量尺、非实测）。
 * 可选 outletWidth/outletDepth 为短管外尺寸（默认 .46/.36），内口=外尺寸-2×SHEET=.016；短管、收缩斗下口、闸板宽深和铰轴随动。
 * 局部坐标：Y 向上，地面 y=0；出料短管下沿 y=outletHeight；弧形挡料板在其下方，出料口中心 x=z=0。
 * 出料短管和收缩斗为四壁开口结构，底部仅由可动闸板关闭；上方链板段沿 -Z 输送到暂存斗顶口上方末端卸料。
 * 气缸闸板联动接口：root.userData.setGate(0..1) 或 root.userData.gate.set(0..1)。
 */
export function createFeedStation({outletHeight=2.05,outletWidth:rawWidth=.46,outletDepth:rawDepth=.36}={}){
  const height=Number(outletHeight),width=Number(rawWidth),depth=Number(rawDepth)
  if(!Number.isFinite(height)||height<.8||height>5)throw new RangeError('outletHeight 必须在 0.8 到 5 米之间')
  if(!Number.isFinite(width)||width<.25||width>1.5)throw new RangeError('outletWidth 必须在 0.25 到 1.5 米之间')
  if(!Number.isFinite(depth)||depth<.18||depth>1.5)throw new RangeError('outletDepth 必须在 0.18 到 1.5 米之间')
  if(width-2*SHEET<.05||depth-2*SHEET<.05)throw new RangeError('出口壁厚过大，内口必须保留至少 50mm')
  const materials=createMaterials()
  const metal=materials.metal,dark=materials.dark,gateMaterial=materials.gate,cylinderMaterial=materials.cylinder,chainMaterial=materials.chain
  const root=new Group();root.name='abb-feed-station'
  root.userData={kind:'abb-feed-station',outletHeight:height,dimensionsEstimated:true,source:'现场照片按展示比例结构示意；照片无量尺，不是实测或加工图',gate:{amount:0}}

  // 短出料口：四壁薄板，上下开口；下沿=outletHeight。
  const outletWidth=width,outletDepth=depth,outletSheetH=.28
  const outletInnerWidth=outletWidth-2*SHEET,outletInnerDepth=outletDepth-2*SHEET
  const outlet=new Group();outlet.name='outlet';outlet.position.set(0,height,0);root.add(outlet)
  openTube(outlet,'outlet-walls',outletWidth,outletDepth,outletSheetH,0,SHEET,metal)
  outlet.userData.part='outlet'

  // 收缩暂存斗：四壁薄板渐缩，底部内口与短管内口一致，顶部内口与上斗内口一致。
  const shrinkHeight=.72,shrinkBottom=height+outletSheetH,shrinkTop=shrinkBottom+shrinkHeight
  const upperOuterWidth=1.34,upperOuterDepth=.98,upperHeight=.70,upperThickness=.018
  const upperInnerWidth=upperOuterWidth-2*upperThickness,upperInnerDepth=upperOuterDepth-2*upperThickness
  const shrinkBottomInnerWidth=outletInnerWidth,shrinkBottomInnerDepth=outletInnerDepth
  const shrinkTopInnerWidth=upperInnerWidth,shrinkTopInnerDepth=upperInnerDepth
  openFrustum(root,'shrinking-hopper',shrinkTopInnerWidth,shrinkTopInnerDepth,shrinkBottomInnerWidth,shrinkBottomInnerDepth,shrinkHeight,shrinkBottom,.014,metal)

  // 上斗：四壁薄板开口箱，顶部再放四边压条，不封住进料口。
  const upperBottom=shrinkTop,upperTop=upperBottom+upperHeight
  const upperHopper=new Group();upperHopper.name='upper-hopper';upperHopper.userData.part='upper-hopper';root.add(upperHopper)
  openTube(upperHopper,'upper-hopper-walls',upperOuterWidth,upperOuterDepth,upperHeight,upperBottom,upperThickness,metal)
  box(root,'upper-rim-front',[upperOuterWidth+.04,.05,.06],[0,upperTop+.025,upperOuterDepth/2-.03],dark)
  box(root,'upper-rim-back',[upperOuterWidth+.04,.05,.06],[0,upperTop+.025,-upperOuterDepth/2+.03],dark)
  box(root,'upper-rim-left',[.06,.05,Math.max(.02,upperOuterDepth-.12)],[-upperOuterWidth/2+.03,upperTop+.025,0],dark)
  box(root,'upper-rim-right',[.06,.05,Math.max(.02,upperOuterDepth-.12)],[upperOuterWidth/2-.03,upperTop+.025,0],dark)

  // 链板供料段：沿 Z 输送，从上游侧上方延伸到暂存斗顶口上方末端卸料；只有输送路径上的底板，不封整个进料口。
  const deckWidth=.74,deckLength=1.40,tailZ=1.35,dischargeZ=tailZ-deckLength
  const deckY=upperTop+.16
  const chainDeck=new Group();chainDeck.name='chain-deck';chainDeck.userData.part='chain-deck';root.add(chainDeck)
  box(chainDeck,'chain-deck-floor',[deckWidth,.025,deckLength],[0,deckY-.0125,(tailZ+dischargeZ)/2],dark)
  box(chainDeck,'chain-deck-left-wall',[.025,.14,deckLength],[-deckWidth/2+.0125,deckY+.07,(tailZ+dischargeZ)/2],metal)
  box(chainDeck,'chain-deck-right-wall',[.025,.14,deckLength],[deckWidth/2-.0125,deckY+.07,(tailZ+dischargeZ)/2],metal)
  box(chainDeck,'chain-deck-tail-wall',[deckWidth,.14,.025],[0,deckY+.07,tailZ-.0125],metal)
  const plateCount=18,plates=new InstancedMesh(new BoxGeometry(.66,.028,.072),chainMaterial,plateCount)
  plates.name='chain-plates';plates.castShadow=true;plates.receiveShadow=true
  const matrix=new Matrix4()
  for(let index=0;index<plateCount;index++){
    const z=tailZ-.05-index*(deckLength-.12)/(plateCount-1)
    matrix.makeTranslation(0,deckY+.043,z)
    plates.setMatrixAt(index,matrix)
  }
  plates.instanceMatrix.needsUpdate=true
  chainDeck.add(plates)

  // 弧形挡料板绕两侧耳轴转开，圆弧沿出料短管下方扫过，保留管口间隙。
  const gateThickness=.012,gateWidth=outletWidth+.04,gateDepth=outletDepth+.04
  const gateRadius=Math.max(.22,outletDepth*.95),gateHalfAngle=Math.asin(gateDepth/(2*gateRadius))
  const hingeY=height+gateRadius*Math.cos(gateHalfAngle)-gateThickness-.006
  const gatePivot=new Group();gatePivot.name='gate';gatePivot.position.set(0,hingeY,0);root.add(gatePivot)
  const gatePlate=curvedGate(gatePivot,gateWidth,gateRadius,gateHalfAngle,gateThickness,gateMaterial)
  gatePlate.userData.part='gate-plate'
  for(const side of [-1,1]){
    const x=side*gateWidth/2
    cylinder(gatePivot,'gate-side-arm-'+side,.012,gateRadius,[x,-gateRadius/2,0],null,gateMaterial)
    cylinder(root,'gate-hinge-seat-'+side,.026,.04,[x,hingeY,0],[0,0,Math.PI/2],dark)
  }
  const gatePinLocal=new Vector3(gateWidth/2+.025,-gateRadius*.65,outletDepth/2+.07)
  link(gatePivot,'gate-arm',[gateWidth/2,0,0],gatePinLocal.toArray(),.025,gateMaterial)
  cylinder(gatePivot,'gate-pin',.020,.07,gatePinLocal.toArray(),[0,0,Math.PI/2],dark)
  const mount=new Vector3(gatePinLocal.x,height+.65,outletDepth/2+.60)
  const cylinderGroup=new Group();cylinderGroup.name='cylinder';root.add(cylinderGroup)
  cylinder(cylinderGroup,'cylinder-barrel',.05,BARREL_LENGTH,[0,-BARREL_LENGTH/2,0],null,cylinderMaterial)
  cylinder(cylinderGroup,'cylinder-trunnion',.025,.12,[0,0,0],[0,0,Math.PI/2],dark)
  const rod=cylinder(cylinderGroup,'cylinder-rod',.018,1,[0,-BARREL_LENGTH,0],null,metal)
  const wallZ=outletDepth/2+(upperOuterDepth/2-outletDepth/2)*((.65-outletSheetH)/shrinkHeight)
  box(root,'cylinder-bracket',[.14,.12,mount.z-wallZ+.06],[mount.x,height+.65,(mount.z+wallZ)/2],dark)

  const gatePinWorld=new Vector3(),direction=new Vector3(),downAxis=new Vector3(0,-1,0)
  const amountOf=value=>{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,number)):0}
  function setGate(value){
    const amount=amountOf(value)
    gatePivot.rotation.x=-amount*GATE_OPEN_RADIANS
    gatePivot.updateMatrix()
    gatePinWorld.copy(gatePinLocal).applyMatrix4(gatePivot.matrix)
    root.userData.gate.pin.copy(gatePinWorld)
    direction.copy(gatePinWorld).sub(mount)
    const distance=direction.length()
    if(distance<1e-6)throw new Error('闸板销轴与气缸安装点重合')
    direction.multiplyScalar(1/distance)
    cylinderGroup.position.copy(mount)
    cylinderGroup.quaternion.setFromUnitVectors(downAxis,direction)
    const rodLength=Math.max(.04,distance-BARREL_LENGTH)
    rod.scale.set(1,rodLength,1)
    rod.position.set(0,-BARREL_LENGTH-rodLength/2,0)
    root.userData.gate.amount=amount
    root.userData.gate.angle=gatePivot.rotation.x
    root.userData.gate.rodLength=rodLength
    return amount
  }
  root.userData.setGate=setGate
  root.userData.getGate=()=>root.userData.gate.amount
  root.userData.gate.set=setGate
  root.userData.gate.pin=new Vector3()
  root.userData.gate.pinLocal=gatePinLocal.clone()
  root.userData.gate.mount=mount.clone()
  root.userData.gate.barrelLength=BARREL_LENGTH
  root.userData.gate.hinge=[0,hingeY,0]
  root.userData.gate.profile={kind:'circular-shell',radius:gateRadius,halfAngle:gateHalfAngle,thickness:gateThickness,width:gateWidth,depth:gateDepth}
  root.userData.outlet={
    bottomY:height,
    bottomCenter:[0,height,0],
    center:[0,height+outletSheetH/2,0],
    topY:height+outletSheetH,
    innerWidth:outletInnerWidth,
    innerDepth:outletInnerDepth,
    outerWidth:outletWidth,
    outerDepth:outletDepth,
    gateHinge:[0,hingeY,0],
    sheetThickness:SHEET,
    gateWidth,
    gateDepth
  }
  root.userData.shrinkingHopper={topInnerWidth:shrinkTopInnerWidth,topInnerDepth:shrinkTopInnerDepth,bottomInnerWidth:shrinkBottomInnerWidth,bottomInnerDepth:shrinkBottomInnerDepth,bottomY:shrinkBottom,topY:shrinkTop,height:shrinkHeight}
  root.userData.upperHopper={innerWidth:upperInnerWidth,innerDepth:upperInnerDepth,bottomY:upperBottom,topY:upperTop,height:upperHeight}
  root.userData.chainDeck={deckY,width:deckWidth,length:deckLength,tailZ,dischargeZ,transportAxis:'z',transportDirection:-1}
  root.userData.convention='outletHeight 是出料口底沿/出料短管底沿高度，弧形挡料板位于管口下方'
  root.userData.setChainPhase=value=>{const phase=((Number(value)||0)%1+1)%1;for(let i=0;i<plateCount;i++){const z=tailZ-.05-((i/(plateCount-1)+phase)%1)*(deckLength-.12);matrix.makeTranslation(0,deckY+.043,z);plates.setMatrixAt(i,matrix)}plates.instanceMatrix.needsUpdate=true}
  root.userData.parts={outlet,upperHopper,chainDeck,cylinderGroup,gatePivot,rod,plates}
  root.userData.dispose=()=>{
    const geometries=new Set(),materialSet=new Set()
    root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materialSet.add(material)})
    geometries.forEach(geometry=>geometry.dispose());materialSet.forEach(material=>material.dispose())
  }
  setGate(0)
  return root
}

export const FEED_STATION_PARTS=['outlet','shrinking-hopper','upper-hopper','chain-deck','chain-plates','cylinder','gate']

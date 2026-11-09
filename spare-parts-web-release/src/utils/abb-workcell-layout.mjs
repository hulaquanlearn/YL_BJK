import {Box3,Group,Matrix4,Mesh,Quaternion,Vector3} from 'three'
import {flangeTarget,inverseRobotJoints,poseMatrix} from './abb-inverse-kinematics.mjs'
import {robotCadTransforms} from './abb-kinematics.mjs'
import {createHydraulicLid} from './abb-hydraulic-lid.mjs'

// Only the station calibration needed by the scene, from the server's saved
// brewing backup. No production program is executed or rewritten here.
export const brewingStationProfile={
 sourceHash:'01b7a45ee4996486ec6c300d249b1f1628ad152d23c1530c5fe31e42362406ad',
 source:'酿酒机器人.zip · ModData.mod / BuJiu.mod:248',
 receiving:{pos:[2326.80,16.26,666.32],quat:[.188381,-.016915,.981916,-.00818475]},
 home:{pos:[1874.63,8.24,686.31],quat:[.00670956,.00137157,.999975,-.00160437]},
 homeTool:{robhold:true,tcp:[-372.436,1.04649,932.784],quat:[.985737,-.000620338,.168254,.00343805]},
 tool:{robhold:true,tcp:[-372.454,1.05032,932.791],quat:[.999734,.00331125,-.0228082,-.0002419]},
 base:{robhold:false,ufprog:true,uframe:{pos:[0,0,0],quat:[1,0,0,0]},oframe:{pos:[0,0,0],quat:[1,0,0,0]}},
 pots:[
  {id:'pot-left',label:'左甑锅',frame:{pos:[782.182,2093.4,-443.776],quat:[.999993,.0033189,-.00184729,.00000613103]}},
  {id:'pot-right',label:'右甑锅',frame:{pos:[784.479,-2102.4,-455.264],quat:[.999999,.00112093,-.000258824,.000000290124]}}
 ],
 // ModTeach:26/31/36 identifies upper/lower INNER radii and inner height.
 potDimensions:{upperRadius:1.2,lowerRadius:1.09,height:.97}
}
const basis=new Matrix4().makeRotationX(-Math.PI/2),inverseBasis=basis.clone().invert()
export function abbPointToScene(point){return [point[0]/1000,point[2]/1000,-point[1]/1000]}
export function brewingWorkcellLayout(profile=brewingStationProfile){
 const flange=flangeTarget(profile.receiving,profile.tool,profile.base)
 const result=inverseRobotJoints(flange,[0,0,0,0,90,0],{positionTolerance:1e-7,rotationTolerance:1e-7})
 if(!result.ok)throw Error('酿酒备份接料点无法求解：'+result.reason)
 const home=profile.home?inverseRobotJoints(flangeTarget(profile.home,profile.homeTool||profile.tool,profile.base),[0,0,0,0,90,0],{positionTolerance:1e-7,rotationTolerance:1e-7}):result
 if(!home.ok)throw Error('酿酒备份起始点无法求解：'+home.reason)
 const toolMount=robotCadTransforms(result.joints)[6].clone().multiply(new Matrix4().makeTranslation(2.1125,2.26,0)).multiply(new Matrix4().makeRotationZ(-Math.PI/2))
 // Interior of the CAD receiving mouth, not the output TCP or the union bbox.
 // Verified against the actual 640/700 triangles by a vertical footprint test.
 const inlet=new Vector3(-.17,.24,0).applyMatrix4(toolMount)
 return {
  receivingJoints:result.joints,
  homeJoints:home.joints,
  feeder:{position:[inlet.x,0,inlet.z],rotationY:Math.PI/2,outletHeight:inlet.y+.65},
  pots:profile.pots.map(p=>{
   const m=basis.clone().multiply(poseMatrix(p.frame)).multiply(inverseBasis)
   return {...p,position:new Vector3().setFromMatrixPosition(m).toArray(),quaternion:new Quaternion().setFromRotationMatrix(m).toArray(),dimensions:{...profile.potDimensions}}
  })
 }
}
export const brewingWorkcell=brewingWorkcellLayout()

// The CAD inner floor is 100 mm above its outer base. Align the INNER floor
// with the saved WobjBarrel origin; grounding the outer bbox loses that offset.
export function placeBrewingPot(source,station){
 source.updateMatrixWorld(true)
 const bounds=new Box3().setFromObject(source),center=bounds.getCenter(new Vector3())
 const floor=bounds.min.y+.1,innerHeight=bounds.max.y-floor
 const root=new Group();root.name=station.id;root.position.fromArray(station.position);root.quaternion.fromArray(station.quaternion)
 source.traverse(mesh=>{
  if(!mesh.isMesh)return
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),positions=geometry.attributes.position
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i)-center.x,z=positions.getZ(i)-center.z,t=(positions.getY(i)-floor)/innerHeight
   const sourceRadius=1.0735+(1.2-1.0735)*t
   const radius=station.dimensions.lowerRadius+(station.dimensions.upperRadius-station.dimensions.lowerRadius)*t
   positions.setXYZ(i,x*radius/sourceRadius,t*station.dimensions.height,z*radius/sourceRadius)
  }
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  const node=new Mesh(geometry,mesh.material.clone());node.name=mesh.name;root.add(node)
 })
 root.userData.programFrame=station.frame
 const lid=createHydraulicLid({radius:station.dimensions.upperRadius,height:station.dimensions.height});lid.rotation.y=Math.PI/2;root.add(lid);root.userData.lid=lid.userData
 return root
}


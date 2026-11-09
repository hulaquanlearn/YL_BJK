import {Vector3} from 'three'

// Match the ABB viewer's staged eight-second exploded view. These stages show
// assembly relationships in the display model, not a field service procedure.
export const craneDisassemblyStages=[
 {ids:['collector','cable-chains','wireless-bridge','alarm-beacon','limit-switches','platform-lights','safety-door-switches','camera','laser-gateway','code-reader','read-code-sensor'],label:'移开供电、线缆与定位附件'},
 {ids:['bridge-cabinet','trolley-cabinet','transfer-cabinet'],label:'移开电气柜'},
 {ids:['grab-motors','grab-rotation-motor','grab-limit-switches','grab-load-limiter'],label:'移开抓斗驱动与检测附件'},
 {ids:['grab-jaws'],label:'拆下抓斗颚板'},
 {ids:['grab'],label:'移开抓斗本体与回转支承'},
 {ids:['transfer-hopper','laser-gimbal','turnover-pushrods','turnover-pin-switches','turnover-flip-motor','turnover-stepper','turnover-oiler','turnover-level-sensor'],label:'移开转运斗与吊具附件'},
 {ids:['turnover-flip'],label:'移开周转翻转吊具'},
 {ids:['transfer-hoist','transfer-hoist-motors','transfer-hoist-limits','transfer-load-limiters'],label:'移开周转卷扬与剪叉提升'},
 {ids:['transfer-car','transfer-drive-motors','transfer-limit-switches','transfer-laser'],label:'移开梁内周转小车'},
 {ids:['trolley-laser','trolley-hoist-motors','trolley-slip-ring','trolley-junction-box','trolley-limit-switches','trolley-anti-fall','trolley-oiler'],label:'移开伸缩小车驱动与附件'},
 {ids:['telescopic-mast'],label:'移开伸缩提升臂'},
 {ids:['trolley-drive','trolley-frame'],label:'移开伸缩小车与车架'},
 {ids:['bridge-walkway','travel-motors'],label:'移开走台护栏与大车驱动'},
 {ids:['bridge-girder'],label:'向上移开双主梁'},
 {ids:['endcarriage-south','endcarriage-north'],label:'移开南北端梁'}
]
const offsets={
 'grab-jaws':[0,-1.25,1.3],grab:[0,-.65,0],
 'telescopic-mast':[0,1.4,0],'trolley-frame':[0,3.5,0],
 'trolley-drive':[0,2.7,2.6],'bridge-walkway':[-3.6,2.5,0],
 'bridge-girder':[0,2.4,0],
 'endcarriage-south':[0,0,-3.2],'endcarriage-north':[0,0,3.2]
}
export function craneDisassemblyProgress(id,amount){
 const index=craneDisassemblyStages.findIndex(stage=>stage.ids.includes(id))
 if(index<0)return 0
 const t=Math.max(0,Math.min(1,(Number(amount)||0)*craneDisassemblyStages.length-index))
 return t*t*(3-2*t)
}
export function craneDisassemblyOffset(part,amount){
 return new Vector3().fromArray(offsets[part.name]||part.userData.presentationOffset||[0,0,0]).multiplyScalar(craneDisassemblyProgress(part.name,amount))
}
export function craneDisassemblyStatus(amount,assembling=false){
 if(amount<=0)return '已组装'
 if(amount>=1)return '拆解完成 · 轨道与立柱保留原位'
 const index=Math.min(craneDisassemblyStages.length-1,Math.floor(amount*craneDisassemblyStages.length))
 return (assembling?'装回：':'拆解：')+craneDisassemblyStages[index].label.replace(/^(移开|拆下|向上移开)/,'')
}

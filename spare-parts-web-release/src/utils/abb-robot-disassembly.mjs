import {Vector3} from 'three'

// Exploded assembly at the granularity present in this CAD. This depicts
// connection order, not a service procedure (fasteners/motors are not modeled).
export const robotDisassemblyStages=[
 {ids:['tool'],label:'移开末端工具'},
 {ids:['cable1','cable2','cable3'],label:'移开线缆'},
 {ids:['balance2'],label:'移开平衡机构连接件'},
 {ids:['balance1'],label:'移开平衡机构主体'},
 {ids:['axis6'],label:'拆下 6 轴工具法兰'},
 {ids:['axis5'],label:'拆下 5 轴腕部'},
 {ids:['axis4'],label:'拆下 4 轴前臂'},
 {ids:['axis3'],label:'拆下 3 轴上臂连接体'},
 {ids:['axis2'],label:'沿关节接口移开 2 轴下臂'},
 {ids:['axis1'],label:'向上移开 1 轴回转座'}
]
const offsets={
 base:[0,0,0],axis1:[0,.9,0],axis2:[0,0,1.2],
 axis3:[0,.8,0],axis4:[1.05,.8,0],axis5:[1.4,.8,.65],axis6:[1.8,.8,.65],
 cable1:[0,0,-.95],cable2:[0,0,2],cable3:[0,.8,-.95],
 balance1:[-1,0,.5],balance2:[-1,.6,.5]
}
export function disassemblyProgress(id,amount){
 const index=robotDisassemblyStages.findIndex(stage=>stage.ids.includes(id))
 if(index<0)return 0
 const t=Math.max(0,Math.min(1,(Number(amount)||0)*robotDisassemblyStages.length-index))
 return t*t*(3-2*t)
}
export function robotDisassemblyOffset(id,amount){
 return new Vector3().fromArray(offsets[id]||[0,0,0]).multiplyScalar(disassemblyProgress(id,amount))
}
export function robotDisassemblyStatus(amount,assembling=false){
 if(amount<=0)return '已组装'
 if(amount>=1)return '拆解完成 · 固定底座保留原位'
 const index=Math.min(robotDisassemblyStages.length-1,Math.floor(amount*robotDisassemblyStages.length))
 const label=robotDisassemblyStages[index].label
 return (assembling?'装回：':'拆解：')+label.replace(/^(移开|拆下|沿关节接口移开|向上移开) /,'')
}

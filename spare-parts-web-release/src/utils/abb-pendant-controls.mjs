import {Vector2,Vector3} from 'three'
// Centres in the front-facing ABB key diagram (150 × 419 pixels).
// The CAD key texture is vertically inverted relative to that diagram.
// These identify the printed keys, rather than arbitrary areas of the housing.
export const pendantKeys=[
 {id:'preset-2',label:'可编程键 2',x:68,y:43,r:23,text:'上方四键为可编程键。功能由控制面板 ProgKeys 设置；未读取到现场配置时不指定动作。'},
 {id:'preset-1',label:'可编程键 1',x:29.5,y:70,r:22,text:'可编程键 1；没有现场 ProgKeys 配置，不擅自映射为页面导航。'},
 {id:'preset-4',label:'可编程键 4',x:73,y:93,r:22,text:'可编程键 4；没有现场配置时不执行回零或运动。'},
 {id:'preset-3',label:'可编程键 3',x:112,y:65,r:22,text:'可编程键 3；本次备份未提供已核验的按键动作。'},
 {id:'mechanical-unit',label:'选择机械单元',x:27,y:137,r:21,text:'循环选择可微动控制的机械单元。当前模型只有 ROB_1，不切换到其他页面。'},
 {id:'axis-group',label:'切换轴 1–3 / 4–6',x:27,y:235.5,r:23,text:'切换关节 1–3 / 4–6，摇杆三个方向对应当前轴组。'},
 {id:'motion-mode',label:'切换运动模式',x:27,y:186.5,r:23,text:'在直线与重定向之间切换；轴组键可切回关节模式。'},
 {id:'increment',label:'切换增量',x:27,y:284,r:21,text:'切换微动控制的增量设置；可选小、中、大或连续。'},
 {id:'backward',label:'后退一步',x:29.5,y:350,r:21,text:'实机为按指令步退。本网页尚未实现RAPID指令步退，点击会明确提示，不能用姿态历史代替。'},
 {id:'stop',label:'停止键',x:68,y:379.5,r:21,text:'停止程序执行，保留当前位置与程序指针。'},
 {id:'forward',label:'前进一步',x:112,y:358,r:21,text:'实机每按一次执行一条指令；网页按后端逐指令执行，等待信号处保持程序指针。'},
 {id:'start',label:'启动键',x:73,y:329,r:21,text:'开始或继续程序执行；手动模式还需满足使能条件。'}
]
export function pendantKeyAt(u,v){return pendantKeys.find(k=>Math.hypot((u-k.x/150)*150,((1-v)-k.y/419)*419)<=k.r)?.id||''}
export function pendantSurfacePoint(mesh,u,v){
 const g=mesh?.geometry;if(!g)return null
 const uv=g.attributes.uv,p=g.attributes.position,normal=g.attributes.normal,index=g.index
 for(let i=0;i<(index?.count||p.count);i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j)
  // CAD uses the same material and overlapping UVs on its edges and rear.
  // Only the forward-facing printed panel may provide a key anchor.
  if(normal&&ids.some(id=>normal.getZ(id)<.8))continue
  const [a,b,c]=ids.map(id=>new Vector2().fromBufferAttribute(uv,id)),d=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y)
  if(Math.abs(d)<1e-10)continue
  const s=((b.y-c.y)*(u-c.x)+(c.x-b.x)*(v-c.y))/d,t=((c.y-a.y)*(u-c.x)+(a.x-c.x)*(v-c.y))/d
  if(s<-.001||t<-.001||s+t>1.001)continue
  return new Vector3().fromBufferAttribute(p,ids[0]).multiplyScalar(s).addScaledVector(new Vector3().fromBufferAttribute(p,ids[1]),t).addScaledVector(new Vector3().fromBufferAttribute(p,ids[2]),1-s-t).applyMatrix4(mesh.matrixWorld)
 }
 return null
}
export function screenAreas(choices=[]){
 const columns=choices.length>4?2:1,rows=Math.ceil(choices.length/columns),height=Math.min(58,255/Math.max(1,rows))
 return choices.map((choice,i)=>{if(choice.rect){const [left,top,right,bottom]=choice.rect;return {id:choice.id,label:choice.label,left,top,right,bottom}}const x=22+(i%columns)*302,y=165+Math.floor(i/columns)*height;return {id:typeof choice==='string'?choice:choice.id,label:typeof choice==='string'?choice:choice.label,left:x,right:x+(columns===1?601:291),top:y,bottom:y+height-7}})
}

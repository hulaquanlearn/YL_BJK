'use strict';
const {surfaceHeightAt}=require('./robot-deposit-state');

// A geometric deficit proxy drives the offline camera result. No radiometric
// temperatures are invented; EIO region/angle/receive bits keep source semantics.
function selectInfraredRegion(cell){
 if(cell.depositedVolume>=cell.targetVolume-1e-9)return {area:888,startAngle:0,endAngle:360,u:0,v:0,height:surfaceHeightAt(cell,0,0)};
 const sectors=6,candidates=[];
 for(const [area,radius] of [[11,.78],[21,.50],[31,.20],[41,.02]])for(let sector=0;sector<sectors;sector++){
  const angle=(sector*60+30)*Math.PI/180,u=-Math.sin(angle)*radius,v=-Math.cos(angle)*radius;
  candidates.push({area,startAngle:sector*60,endAngle:(sector+1)*60,u,v,height:surfaceHeightAt(cell,u,v)});
 }
 // Edge-high target is geometric only. Select the least filled relative region.
 candidates.sort((a,b)=>Math.round((a.height-20*(a.u*a.u+a.v*a.v))*100)-Math.round((b.height-20*(b.u*b.u+b.v*b.v))*100)||a.area-b.area||a.startAngle-b.startAngle);
 return candidates[0];
}
function updateInfrared(state,set,events){
 const c=state.cell,s=state.signals,g=state.globals;if(!c)return;
 const camera=c.infrared||(c.infrared={simulated:true,source:'RAPID/EIO握手；区域按局部料面欠铺近似，非真实热像',position:0,scanCount:0,ready:false,temperature:null});
 const code=Number(s.go320_336_sifu_weizhi)||0,selected=c.barrel==='right'?2:1,now=Number(state.virtualTime)||0;
 const command=[1,2,3].includes(code)?code:0,target=command||camera.targetPosition||camera.position;
 // ModMain:188 clears GO to 0 after waiting at 1/2, before IR spreading.
 // Thus 0 releases the command; it does not erase physical arrival feedback.
 camera.command=command;
 const left=g.wobjbarrell?.uframe?.pos||[782.182,2093.4,0],right=g.wobjbarrelr?.uframe?.pos||[784.479,-2102.4,0],dx=(right[0]-left[0])/2,dz=-(right[1]-left[1])/2,angle=code=>code===1?Math.atan2(-dx,-dz):code===2?Math.atan2(dx,dz):-Math.PI/2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const radius=Math.hypot(dx,dz)/1000;
 if(target!==camera.targetPosition){camera.yawStart=camera.yaw??angle(camera.position);camera.yawTarget=angle(target);camera.turnAngle=wrap(camera.yawTarget-camera.yawStart);camera.rotationSeconds=Math.abs(camera.turnAngle)/(Math.PI/4);camera.reachStart=camera.reach??([1,2].includes(camera.position)?radius:0);camera.reachTarget=[1,2].includes(target)?radius:0;camera.reachSeconds=Math.abs(camera.reachTarget-camera.reachStart)/1.2;camera.moveStart=now;camera.targetPosition=target;camera.moveReadyAt=now+Math.max(camera.rotationSeconds,camera.reachSeconds)+.2;camera.ready=false}
 camera.mount='central-rotary';camera.yaw=wrap((camera.yawStart??angle(camera.position))+(camera.turnAngle||0)*Math.min(1,Math.max(0,now-(camera.moveStart||0))/Math.max(1e-9,camera.rotationSeconds||0)));
 camera.reach=(camera.reachStart||0)+((camera.reachTarget||0)-(camera.reachStart||0))*Math.min(1,Math.max(0,now-(camera.moveStart||0))/Math.max(1e-9,camera.reachSeconds||0));
 if(now>=camera.moveReadyAt)camera.position=target;
 set('gi320_335xiangji_weizhi',camera.position);
 const enabled=!!s.do176_hongwai_qiyong&&!c.complete,request=!!s.do179_receive_hy;
 camera.enabled=enabled;camera.request=request;camera.barrel=camera.position===1?'left':camera.position===2?'right':null;
 // Enabling a sensor is not a cover trigger. Height/completion are separate.
 camera.cover=Number(s.di105_gaiding)||0;
 if(!enabled||!request||camera.position!==selected||camera.position!==target||now<camera.moveReadyAt){camera.ready=false;set('di178_hy_receiveok',0)}
 else if(!camera.ready){
  const result=selectInfraredRegion(c);Object.assign(camera,result,{ready:true,scanCount:camera.scanCount+1});
  set('gi208_223_area_noa1',result.area);set('gi224_239_qidian_jiaodu',result.startAngle);set('gi240_255zhongdian_jiaodu',result.endAngle);set('di178_hy_receiveok',1);
  events.push({type:'cell',stage:'红外模拟识别',barrel:c.barrel,area:result.area,startAngle:result.startAngle,endAngle:result.endAngle,simulated:true});
 }
 camera.status=camera.position!==camera.targetPosition?'定位中':c.complete?'退避':!enabled?'待机':camera.position!==selected?'等待相机到位':camera.ready?'结果已就绪':'等待采集';
}
function updateCameraMeasurements(state,set,events){
 const c=state.cell,s=state.signals,now=Number(state.virtualTime)||0;if(!c)return;
 const sensors=c.sensors||(c.sensors={height:{model:'DS77pro',simulated:true,count:0,active:false},temperature:{model:'AT20',simulated:true,mode:'offline-handshake-only',value:null,count:0,active:false}});
 for(const [key,request,feedback] of [['height',s.do178_duqu_zaomian_gaodu?'height':'','di177_zaomian_celiang_ok'],['temperature',s.do181_duqu_robot_wendu?'robot':s.do182_duqu_zaomian_wendu?'surface':'','di179_wendu_xieru_ok']]){
  const sensor=sensors[key];if(!request){sensor.active=false;sensor.request='';sensor.ready=false;set(feedback,0);continue}
  if(!sensor.active||sensor.request!==request){sensor.active=true;sensor.request=request;sensor.ready=false;sensor.readyAt=now+.2}
  if(!sensor.ready&&now>=sensor.readyAt){sensor.ready=true;sensor.count++;if(key==='height'){sensor.valueMm=surfaceHeightAt(c,0,0);set('gi192_207_zaomian_gaodu1',Math.round(sensor.valueMm))}events.push({type:'cell',stage:key==='height'?'DS77pro 模拟测高':'AT20 模拟测温握手（无真实温度值）',simulated:true})}
  set(feedback,Number(sensor.ready));
 }
}
module.exports={selectInfraredRegion,updateInfrared,updateCameraMeasurements};
